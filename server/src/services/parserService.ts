import { GoogleAuth } from 'google-auth-library';
import { aiMode, parseResume, refineResumeText, type ParsedProfile } from './ai.js';
import { extractResumeText } from './fileStorage.js';

/**
 * Client for the Python resume parser microservice (parser-service/).
 * Extraction: pdfplumber (PDF) + python-docx (DOCX); profile: spaCy NER heuristics.
 * The Node server falls back to pdf-parse/mammoth when the service is unreachable.
 */

const PARSER_URL = process.env.RESUME_PARSER_URL || 'http://localhost:8020';
const PARSER_TIMEOUT_MS = Number(process.env.RESUME_PARSER_TIMEOUT_MS) || 30_000;

const googleAuth = new GoogleAuth();

/**
 * On Cloud Run the parser service is private (IAM-protected), so requests need
 * an identity token minted for its URL. Locally (http://localhost) no auth is
 * used; if token minting fails we still try the request unauthenticated.
 */
async function parserAuthHeaders(): Promise<Record<string, string>> {
  if (!/^https:/i.test(PARSER_URL)) return {};
  try {
    const client = await googleAuth.getIdTokenClient(PARSER_URL);
    const token = await client.idTokenProvider.fetchIdToken(PARSER_URL);
    return { Authorization: `Bearer ${token}` };
  } catch (err) {
    console.warn('Could not mint parser service ID token:', (err as Error).message);
    return {};
  }
}

export interface ParserServiceResult {
  text: string;
  profile: ParsedProfile | null;
  engine: string;
}

/**
 * Send a resume to the Python parser service.
 * Returns null when the service is unavailable or rejects the file
 * (e.g. legacy .doc), so callers can fall back to the Node extractors.
 */
export async function parseWithPythonService(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParserServiceResult | null> {
  try {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

    const res = await fetch(`${PARSER_URL}/parse`, {
      method: 'POST',
      headers: await parserAuthHeaders(),
      body: form,
      signal: AbortSignal.timeout(PARSER_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(`Parser service returned ${res.status} for ${filename}`);
      return null;
    }
    return (await res.json()) as ParserServiceResult;
  } catch (err) {
    console.warn('Parser service unavailable, using Node fallback:', (err as Error).message);
    return null;
  }
}

export interface JDGenerationInput {
  title: string;
  client?: string | null;
  location?: string | null;
  openPositions?: number | null;
  notes?: string | null;
}

/**
 * Generate a job description via the Python service's template engine.
 * Returns null when the service is unreachable so callers can report failure.
 */
export async function generateJdWithPythonService(
  input: JDGenerationInput
): Promise<string | null> {
  try {
    const res = await fetch(`${PARSER_URL}/generate-jd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await parserAuthHeaders()) },
      body: JSON.stringify({
        title: input.title,
        client: input.client || null,
        location: input.location || null,
        open_positions: input.openPositions ?? null,
        notes: input.notes || null,
      }),
      signal: AbortSignal.timeout(PARSER_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`JD generation service returned ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { description?: string };
    return data.description?.trim() || null;
  } catch (err) {
    console.warn('JD generation service unavailable:', (err as Error).message);
    return null;
  }
}

export interface HybridParseResult {
  text: string;
  profile: ParsedProfile | null;
  /** 'ai' = AI model, 'spacy' = Python service heuristics */
  source: 'ai' | 'spacy';
  error?: string;
}

/**
 * Full extraction + parsing pipeline:
 * 1. Text: Python service (pdfplumber/python-docx), falling back to pdf-parse/mammoth.
 * 2. When AI is live: refine sparse text via Ollama, then structured parse via Ollama only.
 * 3. When AI is disabled: fall back to spaCy heuristics from the Python service.
 */
export async function extractAndParseResume(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<HybridParseResult> {
  const py = await parseWithPythonService(buffer, filename, mimeType);

  let text = py?.text?.trim() || '';
  if (!text) {
    text = (await extractResumeText(buffer, mimeType)).trim();
  }
  if (!text) {
    return {
      text: '',
      profile: null,
      source: aiMode() === 'live' ? 'ai' : 'spacy',
      error: 'Could not extract text from this file.',
    };
  }

  if (aiMode() === 'live') {
    if (text.length < 200) {
      const refined = await refineResumeText(text, filename);
      if (refined?.trim()) text = refined.trim();
    }
    const { profile, error } = await parseResume(text, filename);
    if (profile) return { text, profile, source: 'ai' };
    return {
      text,
      profile: null,
      source: 'ai',
      error: error || 'AI could not parse this resume. Check AI_BASE_URL/AI_MODEL or enter details manually.',
    };
  }

  if (py?.profile?.name?.trim()) {
    return { text, profile: py.profile, source: 'spacy' };
  }

  return {
    text,
    profile: null,
    source: 'spacy',
    error: 'Could not parse this resume automatically. Enter details manually.',
  };
}
