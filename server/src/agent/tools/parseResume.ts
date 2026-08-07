import { z } from 'zod';
import { parseResume, type ParsedProfile } from '../../services/ai.js';
import { extractAndParseResume } from '../../services/parserService.js';
import { extractResumeText, readResumeFile } from '../../services/fileStorage.js';
import { AgentToolError, loadAccessibleCandidate } from '../candidateAccess.js';
import type { AgentToolDefinition } from '../types.js';

const schema = z
  .object({
    candidate_id: z.number().int().positive().optional(),
    resume_text: z.string().min(20).max(100_000).optional(),
    filename: z.string().max(255).optional(),
  })
  .refine((v) => v.candidate_id != null || Boolean(v.resume_text?.trim()), {
    message: 'Provide candidate_id or resume_text',
  });

export const parseResumeTool: AgentToolDefinition<typeof schema> = {
  name: 'parse_resume',
  description:
    'Extract a structured candidate profile from a stored resume (by candidate_id) ' +
    'or from raw resume_text. Prefer candidate_id when the candidate already exists.',
  gate: 'auto',
  schema,
  parameters: {
    type: 'object',
    properties: {
      candidate_id: {
        type: 'integer',
        description: 'Existing candidate id to parse/re-parse from stored resume file',
      },
      resume_text: {
        type: 'string',
        description: 'Raw resume text when no candidate_id is available',
      },
      filename: {
        type: 'string',
        description: 'Optional filename hint for text-only parse',
      },
    },
    additionalProperties: false,
  },
  async handler(ctx, args) {
    if (args.resume_text?.trim() && args.candidate_id == null) {
      const { profile, error } = await parseResume(
        args.resume_text.trim(),
        args.filename || 'resume.txt'
      );
      if (!profile) throw new AgentToolError(error || 'Could not parse resume text');
      return summarizeProfile(profile, 'ai', args.resume_text.length);
    }

    const candidate = await loadAccessibleCandidate(ctx, args.candidate_id!);
    const meta = candidate.resume_meta;

    if (meta?.storage_path && meta.mime_type) {
      const buffer = await readResumeFile(meta.storage_path);
      const filename = meta.original_filename || `candidate-${candidate.id}.pdf`;
      const result = await extractAndParseResume(buffer, meta.mime_type, filename);
      if (!result.profile) {
        throw new AgentToolError(result.error || 'Could not parse stored resume');
      }
      return {
        candidate_id: candidate.id,
        ...summarizeProfile(result.profile, result.source, result.text.length),
      };
    }

    if (candidate.resume_text?.trim()) {
      const { profile, error } = await parseResume(
        candidate.resume_text,
        meta?.original_filename || `candidate-${candidate.id}.txt`
      );
      if (profile) {
        return {
          candidate_id: candidate.id,
          ...summarizeProfile(profile, 'ai', candidate.resume_text.length),
        };
      }
      if (candidate.parsed_profile?.name) {
        return {
          candidate_id: candidate.id,
          ...summarizeProfile(candidate.parsed_profile, 'cached', candidate.resume_text.length),
          note: error || 'Used cached parsed_profile after AI parse failed',
        };
      }
      throw new AgentToolError(error || 'Could not parse resume text');
    }

    if (candidate.parsed_profile?.name) {
      return {
        candidate_id: candidate.id,
        ...summarizeProfile(candidate.parsed_profile, 'cached', 0),
        note: 'No resume file/text on file; returned cached parsed_profile',
      };
    }

    // Last resort: try Node text extract path if meta exists without prior text
    if (meta?.storage_path && meta.mime_type) {
      const buffer = await readResumeFile(meta.storage_path);
      const text = await extractResumeText(buffer, meta.mime_type);
      if (text.trim()) {
        const { profile, error } = await parseResume(text, meta.original_filename || 'resume');
        if (!profile) throw new AgentToolError(error || 'Could not parse resume');
        return {
          candidate_id: candidate.id,
          ...summarizeProfile(profile, 'ai', text.length),
        };
      }
    }

    throw new AgentToolError(
      'Candidate has no resume file, resume text, or cached profile to parse'
    );
  },
};

function summarizeProfile(profile: ParsedProfile, source: string, textChars: number) {
  return {
    source,
    text_chars: textChars,
    profile: {
      name: profile.name,
      email: profile.email ?? null,
      phone: profile.phone ?? null,
      linkedin: profile.linkedin ?? null,
      github: profile.github ?? null,
      current_company: profile.current_company ?? null,
      total_experience_years: profile.total_experience_years ?? null,
      current_location: profile.current_location ?? null,
      skills: (profile.skills || []).slice(0, 40),
      technical_skills: (profile.technical_skills || []).slice(0, 40),
      experience_count: profile.experience?.length ?? 0,
      education_count: profile.education?.length ?? 0,
      confidence: profile.confidence,
      professional_summary: profile.professional_summary?.slice(0, 400) ?? null,
    },
  };
}
