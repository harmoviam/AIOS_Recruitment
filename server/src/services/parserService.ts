import { aiMode, parseResume, type ParsedProfile } from './ai.js';
import { extractResumeText } from './fileStorage.js';

/**
 * Client for the Python resume parser microservice (parser-service/).
 * Extraction: pdfplumber (PDF) + python-docx (DOCX); profile: spaCy NER heuristics.
 * The Node server falls back to pdf-parse/mammoth when the service is unreachable.
 */

const PARSER_URL = process.env.RESUME_PARSER_URL || 'http://localhost:8020';
const PARSER_TIMEOUT_MS = Number(process.env.RESUME_PARSER_TIMEOUT_MS) || 30_000;

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
      headers: { 'Content-Type': 'application/json' },
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
  /** 'ai' = Claude, 'spacy' = Python service heuristics */
  source: 'ai' | 'spacy';
  error?: string;
}

/**
 * Full extraction + parsing pipeline:
 * 1. Text: Python service (pdfplumber/python-docx), falling back to pdf-parse/mammoth.
 * 2. Profile: Claude when configured, falling back to the spaCy profile.
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
    return { text: '', profile: null, source: 'spacy', error: 'Could not extract text from this file.' };
  }

  let aiError: string | undefined;
  if (aiMode() === 'live') {
    const { profile, error } = await parseResume(text, filename);
    if (profile) return { text, profile, source: 'ai' };
    aiError = error;
  }

  if (py?.profile?.name?.trim()) {
    return { text, profile: py.profile, source: 'spacy' };
  }

  return {
    text,
    profile: null,
    source: 'spacy',
    error:
      aiError ||
      'Could not parse this resume automatically. Enter details manually.',
  };
}
