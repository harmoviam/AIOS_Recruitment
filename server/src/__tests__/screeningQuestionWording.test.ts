import { describe, expect, it } from 'vitest';
import {
  buildTemplateQuestions,
  isQualificationRequirement,
  mergeKeywords,
  requirementKeywords,
  shortRoleLabel,
  skillRequirements,
} from '../services/screeningQuestions.js';

// Exercise the template builder directly: it is the deterministic path, and the
// one that actually runs in production (AI is not configured on Cloud Run).
// Going through generateJobScreeningQuestions would make real model calls.

// The JD from the production "Engineering Team Lead" job that produced
// "Rate your confidence in: 7+ years of relevant experience".
const JD = `Lead a full-stack engineering team.

Requirements:
- 7+ years of relevant experience
- Proficiency in at least one frontend and one backend technology
- Understanding of databases, API design, and web fundamentals

What we offer:
- Clear career progression and skill-development opportunities
`;

const JOB = {
  title: 'Engineering Team Lead – Full-Stack (MERN/MEAN)',
  description: JD,
  industry: 'Information Technology',
  job_type: 'On-Site',
  min_experience: 3,
  max_experience: 8,
};

describe('isQualificationRequirement', () => {
  it('recognises tenure and degree thresholds', () => {
    expect(isQualificationRequirement('7+ years of relevant experience')).toBe(true);
    expect(isQualificationRequirement('3-5 yrs in a similar role')).toBe(true);
    expect(isQualificationRequirement('B.Tech in Computer Science')).toBe(true);
    expect(isQualificationRequirement('MBA preferred')).toBe(true);
    expect(isQualificationRequirement('Any graduate')).toBe(true);
  });

  it('treats competencies as probeable skills', () => {
    expect(isQualificationRequirement('Proficiency in at least one frontend and one backend technology')).toBe(false);
    expect(isQualificationRequirement('Understanding of databases, API design, and web fundamentals')).toBe(false);
    expect(isQualificationRequirement('Hands-on with Salesforce and Zendesk')).toBe(false);
  });
});

describe('skillRequirements', () => {
  it('drops qualification bullets and keeps competencies in order', () => {
    expect(
      skillRequirements([
        '7+ years of relevant experience',
        'Proficiency in at least one frontend and one backend technology',
        'B.Tech in Computer Science',
        'Understanding of databases, API design, and web fundamentals',
      ])
    ).toEqual([
      'Proficiency in at least one frontend and one backend technology',
      'Understanding of databases, API design, and web fundamentals',
    ]);
  });
});

describe('shortRoleLabel', () => {
  it('strips parenthetical stack notes', () => {
    expect(shortRoleLabel('Engineering Team Lead – Full-Stack (MERN/MEAN)')).toBe(
      'Engineering Team Lead – Full-Stack'
    );
  });

  it('truncates very long titles', () => {
    expect(shortRoleLabel('A'.repeat(80)).length).toBeLessThanOrEqual(43);
  });

  it('leaves ordinary titles alone', () => {
    expect(shortRoleLabel('Customer Support Executive')).toBe('Customer Support Executive');
  });
});

describe('generated pack wording', () => {
  it('never phrases a tenure requirement as a skill', () => {
    const pack = buildTemplateQuestions(JOB);
    const labels = [...pack.prescreen, ...pack.interview].map((q) => q.label);

    for (const label of labels) {
      expect(label).not.toMatch(/Rate your confidence in:.*\d+\s*\+?\s*years/i);
      expect(label).not.toMatch(/Experience with:.*\d+\s*\+?\s*years/i);
    }
  });

  it('builds competency questions from the real skills', () => {
    const pack = buildTemplateQuestions(JOB);
    const labels = [...pack.prescreen, ...pack.interview].map((q) => q.label).join(' | ');

    expect(labels).toMatch(/frontend and one backend technology/);
    expect(labels).toMatch(/databases, API design/);
  });

  it('states the tenure bar as something to walk through, not rate', () => {
    const pack = buildTemplateQuestions(JOB);
    const fit = pack.prescreen.find((q) => q.id === 'relevant_experience_fit')!;
    expect(fit.label).toBe('Walk me through the experience that meets: 7+ years of relevant experience');
  });

  it('does not ask the same motivation question twice', () => {
    const pack = buildTemplateQuestions(JOB);
    const motivational = [...pack.prescreen, ...pack.interview].filter((q) =>
      /why (do|are) you/i.test(q.label)
    );
    expect(motivational).toHaveLength(1);
  });

  it('uses the shortened role label inside questions', () => {
    const pack = buildTemplateQuestions(JOB);
    const labels = [...pack.prescreen, ...pack.interview].map((q) => q.label).join(' | ');
    expect(labels).not.toMatch(/\(MERN\/MEAN\)/);
  });

  it('still produces a usable pack when the JD lists only qualifications', () => {
    const pack = buildTemplateQuestions({
      ...JOB,
      description: 'Requirements:\n- 5+ years of relevant experience\n- B.Tech in Computer Science\n',
    });
    expect(pack.prescreen.length).toBeGreaterThan(0);
    expect(pack.interview.length).toBeGreaterThan(0);
    const confidence = pack.prescreen.find((q) => q.id === 'skill_confidence')!;
    expect(confidence.label).toBe('Rate your confidence in the core skill for an Engineering Team Lead – Full-Stack');
  });
});

describe('requirementKeywords', () => {
  it('strips the proficiency lead-in and splits into listenable terms', () => {
    expect(requirementKeywords('Understanding of databases, API design, and web fundamentals')).toEqual([
      'databases',
      'API design',
      'web fundamentals',
    ]);
  });

  it('drops quantifiers like "at least one"', () => {
    expect(
      requirementKeywords('Proficiency in at least one frontend and one backend technology')
    ).toEqual(['frontend', 'backend technology']);
  });

  it('ignores bullets that are only stopwords', () => {
    expect(requirementKeywords('and the other')).toEqual([]);
  });
});

describe('mergeKeywords', () => {
  it('de-duplicates case-insensitively and caps the list', () => {
    expect(mergeKeywords(['React', 'node'], ['react', 'Node', 'SQL'])).toEqual(['React', 'node', 'SQL']);
    expect(mergeKeywords(Array.from({ length: 20 }, (_, i) => `k${i}`)).length).toBe(8);
  });
});

describe('expected-answer rubric', () => {
  it('gives every question keywords and a strong/weak answer', () => {
    const pack = buildTemplateQuestions({ ...JOB, required_skills: ['React', 'Node.js', 'PostgreSQL'] });
    for (const q of [...pack.prescreen, ...pack.interview]) {
      expect(q.expected_keywords?.length, `${q.id} has no keywords`).toBeGreaterThan(0);
      expect(q.strong_answer, `${q.id} has no strong_answer`).toBeTruthy();
      expect(q.weak_answer, `${q.id} has no weak_answer`).toBeTruthy();
    }
  });

  it('uses the job\'s structured skills as keywords', () => {
    const pack = buildTemplateQuestions({ ...JOB, required_skills: ['React', 'Node.js', 'PostgreSQL'] });
    const all = [...pack.prescreen, ...pack.interview].flatMap((q) => q.expected_keywords || []);
    expect(all).toContain('React');
    expect(all).toContain('PostgreSQL');
  });

  it('uses sector vocabulary for the domain question', () => {
    const bpo = buildTemplateQuestions({ ...JOB, industry: 'BPO' });
    const domain = bpo.interview.find((q) => q.id === 'domain_knowledge')!;
    expect(domain.expected_keywords).toContain('AHT');
    expect(domain.expected_keywords).toContain('CSAT');

    const mfg = buildTemplateQuestions({ ...JOB, industry: 'Manufacturing' });
    const mfgDomain = mfg.interview.find((q) => q.id === 'domain_knowledge')!;
    expect(mfgDomain.expected_keywords).toContain('OEE');
  });

  it('expects STAR vocabulary on the behavioural question', () => {
    const pack = buildTemplateQuestions(JOB);
    const star = pack.interview.find((q) => q.id === 'problem_solving')!;
    expect(star.expected_keywords).toEqual(
      expect.arrayContaining(['situation', 'action', 'result'])
    );
  });

  it('never emits a blank or duplicated keyword', () => {
    const pack = buildTemplateQuestions({ ...JOB, required_skills: ['React', 'react', '  ', 'Node'] });
    for (const q of [...pack.prescreen, ...pack.interview]) {
      const kws = q.expected_keywords || [];
      expect(kws.every((k) => k.trim().length > 0)).toBe(true);
      expect(new Set(kws.map((k) => k.toLowerCase())).size).toBe(kws.length);
    }
  });
});
