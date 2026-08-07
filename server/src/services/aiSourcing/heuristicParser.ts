import {
  emptyCriteria,
  type CandidateSearchCriteria,
  type FieldConfidence,
} from '../../dto/aiSourcing/criteria.js';

const SKILL_LEXICON = [
  'react',
  'angular',
  'vue',
  'node',
  'nodejs',
  'typescript',
  'javascript',
  'python',
  'java',
  'golang',
  'go',
  'kotlin',
  'swift',
  'ruby',
  'php',
  'dotnet',
  '.net',
  'csharp',
  'c#',
  'aws',
  'azure',
  'gcp',
  'docker',
  'kubernetes',
  'k8s',
  'sql',
  'postgres',
  'postgresql',
  'mysql',
  'mongodb',
  'redis',
  'spark',
  'hadoop',
  'salesforce',
  'sap',
  'voice process',
  'voice',
  'bpo',
  'call centre',
  'call center',
  'callcenter',
  'devops',
  'fullstack',
  'full stack',
  'frontend',
  'backend',
  'android',
  'ios',
  'flutter',
  'react native',
  'machine learning',
  'ml',
  'ai',
  'nlp',
  'excel',
  'power bi',
  'tableau',
];

const ROLE_PATTERNS: Array<{ re: RegExp; title: string; confidence: number }> = [
  { re: /\b(?:react|frontend|front[- ]end)\s+(?:developer|engineer|dev)s?\b/i, title: 'Frontend Developer', confidence: 0.75 },
  { re: /\b(?:backend|back[- ]end)\s+(?:developer|engineer|dev)s?\b/i, title: 'Backend Developer', confidence: 0.75 },
  { re: /\b(?:full[- ]?stack)\s+(?:developer|engineer|dev)s?\b/i, title: 'Full Stack Developer', confidence: 0.75 },
  { re: /\b(?:java)\s+(?:developer|engineer|dev)s?\b/i, title: 'Java Developer', confidence: 0.75 },
  { re: /\b(?:python)\s+(?:developer|engineer|dev)s?\b/i, title: 'Python Developer', confidence: 0.75 },
  { re: /\b(?:data)\s+(?:scientist|engineer|analyst)s?\b/i, title: 'Data Specialist', confidence: 0.7 },
  { re: /\b(?:devops)\s+(?:engineer|developer)?s?\b/i, title: 'DevOps Engineer', confidence: 0.7 },
  { re: /\b(?:qa|sdet|test)\s+(?:engineer|analyst)?s?\b/i, title: 'QA Engineer', confidence: 0.65 },
  { re: /\b(?:product)\s+managers?\b/i, title: 'Product Manager', confidence: 0.7 },
  { re: /\b(?:project)\s+managers?\b/i, title: 'Project Manager', confidence: 0.7 },
  { re: /\b(?:voice\s+process|customer\s+support|call\s+center|call\s+centre)\b/i, title: 'Voice Process', confidence: 0.8 },
  { re: /\b(?:developers?|engineers?|analysts?|consultants?)\b/i, title: 'Developer', confidence: 0.45 },
];

const CITY_LEXICON = [
  'bangalore',
  'bengaluru',
  'mumbai',
  'delhi',
  'noida',
  'gurgaon',
  'gurugram',
  'hyderabad',
  'chennai',
  'pune',
  'kolkata',
  'ahmedabad',
  'jaipur',
  'chandigarh',
  'mohali',
  'kochi',
  'trivandrum',
  'thiruvananthapuram',
  'indore',
  'coimbatore',
  'remote',
];

const STAGE_MAP: Array<{ re: RegExp; stage: CandidateSearchCriteria['stage']; confidence: number }> = [
  { re: /\b(?:in\s+)?screening\b/i, stage: 'screening', confidence: 0.7 },
  { re: /\b(?:in\s+)?interview\b/i, stage: 'interview', confidence: 0.7 },
  { re: /\b(?:selected|offered)\b/i, stage: 'selected', confidence: 0.65 },
  { re: /\brejected\b/i, stage: 'rejected', confidence: 0.65 },
  { re: /\bjoined\b/i, stage: 'joined', confidence: 0.65 },
  { re: /\bapplied\b/i, stage: 'applied', confidence: 0.6 },
];

function uniqLower(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = raw.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Deterministic NL parser — always available (no AI key required). */
export function heuristicParseRequirements(query: string): {
  criteria: CandidateSearchCriteria;
  fieldConfidence: FieldConfidence;
  unresolvedFields: string[];
} {
  const text = query.trim();
  const criteria = emptyCriteria();
  const fieldConfidence: FieldConfidence = {};
  const lower = text.toLowerCase();

  if (/\bfresher|entry[- ]level|campus\b/i.test(text)) {
    criteria.maxExperienceYears = 1;
    fieldConfidence.maxExperienceYears = 0.9;
  }
  const range = text.match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i);
  if (range) {
    criteria.minExperienceYears = Number(range[1]);
    criteria.maxExperienceYears = Number(range[2]);
    fieldConfidence.minExperienceYears = 0.9;
    fieldConfidence.maxExperienceYears = 0.9;
  } else {
    const minPlus = text.match(/(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?)/i);
    const minYears = text.match(
      /(?:at\s+least|min(?:imum)?|over|more\s+than|>\s*)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i
    );
    const plainYears = text.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)(?:\s+(?:of\s+)?(?:exp|experience))?/i);
    if (minPlus) {
      criteria.minExperienceYears = Number(minPlus[1]);
      fieldConfidence.minExperienceYears = 0.9;
    } else if (minYears) {
      criteria.minExperienceYears = Number(minYears[1]);
      fieldConfidence.minExperienceYears = 0.85;
    } else if (plainYears && criteria.maxExperienceYears == null) {
      criteria.minExperienceYears = Number(plainYears[1]);
      fieldConfidence.minExperienceYears = 0.7;
    }
  }

  const inLoc = text.match(
    /\b(?:in|at|near|around)\s+([A-Za-z][A-Za-z\s]{1,40}?)(?:\s+with|\s+having|\s+for|,|\.|$)/i
  );
  if (inLoc) {
    const candidate = inLoc[1].trim().replace(/\s+/g, ' ');
    const hit = CITY_LEXICON.find((c) => candidate.toLowerCase().includes(c));
    criteria.location = hit
      ? hit === 'bengaluru'
        ? 'Bangalore'
        : hit.charAt(0).toUpperCase() + hit.slice(1)
      : candidate.split(/\s+/).slice(0, 3).join(' ');
    fieldConfidence.location = hit ? 0.85 : 0.55;
  } else {
    for (const city of CITY_LEXICON) {
      if (lower.includes(city)) {
        criteria.location =
          city === 'bengaluru' ? 'Bangalore' : city.charAt(0).toUpperCase() + city.slice(1);
        fieldConfidence.location = 0.8;
        break;
      }
    }
  }

  const lexicon = [...SKILL_LEXICON].sort((a, b) => b.length - a.length);
  const skills: string[] = [];
  for (const skill of lexicon) {
    if (lower.includes(skill)) skills.push(skill === 'nodejs' ? 'node' : skill);
  }
  criteria.skills = uniqLower(skills).slice(0, 15);
  if (criteria.skills.length) fieldConfidence.skills = 0.7;

  for (const p of ROLE_PATTERNS) {
    if (p.re.test(text)) {
      criteria.jobTitle = p.title;
      fieldConfidence.jobTitle = p.confidence;
      break;
    }
  }

  for (const s of STAGE_MAP) {
    if (s.re.test(text)) {
      criteria.stage = s.stage;
      fieldConfidence.stage = s.confidence;
      break;
    }
  }

  const tokens = lower
    .replace(/[^a-z0-9+\s.-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const stop = new Set([
    'with',
    'years',
    'year',
    'yrs',
    'the',
    'and',
    'for',
    'need',
    'looking',
    'find',
    'candidates',
    'candidate',
    'talent',
    'who',
    'have',
    'has',
    'from',
    'into',
    'that',
    'this',
    'plus',
    'more',
    'than',
    'least',
    'experience',
    'exp',
  ]);
  const skillSet = new Set(criteria.skills);
  const keywords = tokens.filter((t) => !stop.has(t) && !skillSet.has(t) && !/^\d+$/.test(t));
  criteria.keywords = uniqLower(keywords).slice(0, 10);
  if (criteria.keywords.length) fieldConfidence.keywords = 0.4;

  const unresolvedFields: string[] = [];
  if (!criteria.skills.length && !criteria.jobTitle && !criteria.keywords.length) {
    unresolvedFields.push('skills');
  }
  if (criteria.location == null) unresolvedFields.push('location');
  if (criteria.minExperienceYears == null && criteria.maxExperienceYears == null) {
    unresolvedFields.push('experience');
  }

  return { criteria, fieldConfidence, unresolvedFields };
}
