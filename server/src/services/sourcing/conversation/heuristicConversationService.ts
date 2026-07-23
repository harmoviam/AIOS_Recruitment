import { pool } from '../../../db.js';
import type { ConversationService } from '../ports.js';
import type { StructuredIntent } from '../../../types/sourcing.js';

const ROLE_ALIASES: Array<{ pattern: RegExp; hint: string }> = [
  { pattern: /international\s*voice|voice\s*process|voice\s*bpo|ivr|inbound\s*voice/i, hint: 'International Voice Process' },
  { pattern: /domestic\s*voice/i, hint: 'Domestic Voice Process' },
  { pattern: /non[\s-]*voice|chat\s*process|email\s*support/i, hint: 'Non Voice Process' },
  { pattern: /software\s*engineer|developer/i, hint: 'Software Engineer' },
];

/** Nouns that mark a number as a headcount, not a day/year/salary figure. */
const COUNT_NOUNS =
  '(?:candidates?|hires?|openings?|positions?|agents?|associates?|executives?|staff|employees?|reps?|resources?|people|headcount)';
const COUNT_VERBS = '(?:need|needs|needed|hire|hiring|require|requires|required|looking for|want|wants|seeking)';

/**
 * A bare "first number in the text" is unreliable — it just as often lands on a
 * day count or salary figure. Require the number to sit near a counting word:
 * either a count noun shortly after it ("50 ... candidates"), or a hiring verb
 * shortly before it ("Hire 20"). Filler words between the number and the noun
 * must not themselves be numbers, so an intervening figure (e.g. "20" in
 * "15 days for 20 openings") claims the noun instead of the earlier one.
 */
export function extractHiringCount(text: string): number | undefined {
  const afterMatch = text.match(
    new RegExp(`\\b(\\d{1,4})\\b(?:\\s+(?!\\d+\\b)\\S+){0,5}?\\s+${COUNT_NOUNS}\\b`, 'i')
  );
  if (afterMatch) return Number(afterMatch[1]);

  const beforeMatch = text.match(new RegExp(`${COUNT_VERBS}(?:\\s+\\S+){0,2}?\\s+\\b(\\d{1,4})\\b`, 'i'));
  if (beforeMatch) return Number(beforeMatch[1]);

  return undefined;
}

/**
 * Salary must be anchored to a currency/pay keyword or a pay-period suffix —
 * a bare 4-6 digit number is just as likely to be a headcount or PIN code
 * (e.g. "5000 candidates ... salary 18000/month" was previously misread as
 * salary 5000).
 */
export function extractSalaryHint(text: string): number | undefined {
  const prefixMatch = text.match(
    /(?:₹|rs\.?|inr|salary|budget|pay|ctc|package)\s*(?:of|is|up ?to|around|:)?\s*(\d{4,6})/i
  );
  if (prefixMatch) return Number(prefixMatch[1]);

  const suffixMatch = text.match(/(\d{4,6})\s*(?:\/|-)?\s*(?:per\s*)?(?:month|pm)\b/i);
  if (suffixMatch) return Number(suffixMatch[1]);

  return undefined;
}

export const heuristicConversationService: ConversationService = {
  async parse(query, context) {
    const text = query.text.trim();
    const unresolved: string[] = [];

    const hiringCount = extractHiringCount(text);
    if (!hiringCount) unresolved.push('hiringCount');

    const salaryHint = extractSalaryHint(text);

    const daysMatch = text.match(/(\d{1,3})\s*days?/i);
    const joiningTimelineDays = daysMatch ? Number(daysMatch[1]) : undefined;

    let roleName: string | undefined;
    for (const alias of ROLE_ALIASES) {
      if (alias.pattern.test(text)) {
        roleName = alias.hint;
        break;
      }
    }
    if (!roleName) unresolved.push('roleName');

    let cityName: string | undefined;
    // City = words after "in", ending at punctuation, a qualifier keyword, a number, or end of text
    // (e.g. "in Mohali within 15 days", "in Pune, salary up to 22000").
    const inMatch = text.match(
      /\bin\s+([A-Za-z][A-Za-z\s]{1,40}?)(?:\.|,|$|\s+(?:within|by|for|with|salary|budget|under|before|paying|needing)\b|\s+\d)/i
    );
    if (inMatch) cityName = inMatch[1].trim();
    if (!cityName) unresolved.push('cityName');

    let experienceHint: string | undefined;
    if (/fresher|freshers|0\s*-\s*1|campus/i.test(text)) experienceHint = 'Fresher';
    else if (/experienced|1\s*-\s*3|2\s*\+/i.test(text)) experienceHint = 'Experienced';

    let cityId: string | undefined;
    let roleId: string | undefined;

    if (cityName) {
      const { rows } = await pool.query(
        `SELECT id, name FROM sourcing_city
         WHERE tenant_id = $1 AND status = 'ACTIVE' AND name ILIKE $2
         ORDER BY name LIMIT 1`,
        [context.tenantId, cityName]
      );
      if (rows[0]) {
        cityId = String(rows[0].id);
        cityName = String(rows[0].name);
      } else {
        unresolved.push('cityId');
      }
    }

    if (roleName) {
      const { rows } = await pool.query(
        `SELECT id, name FROM sourcing_role
         WHERE tenant_id = $1 AND status = 'ACTIVE'
           AND (name ILIKE $2 OR aliases::text ILIKE $2)
         ORDER BY name LIMIT 1`,
        [context.tenantId, `%${roleName}%`]
      );
      if (rows[0]) {
        roleId = String(rows[0].id);
        roleName = String(rows[0].name);
      } else {
        unresolved.push('roleId');
      }
    }

    const resolvedCore = Boolean(hiringCount && cityId && roleId);
    const intent: StructuredIntent = {
      rawText: text,
      cityName,
      cityId,
      roleName,
      roleId,
      hiringCount,
      experienceHint,
      salaryHint,
      joiningTimelineDays,
      confidence: resolvedCore ? 0.85 : cityName || roleName || hiringCount ? 0.55 : 0.2,
      unresolvedFields: [...new Set(unresolved)],
    };
    return intent;
  },
};
