import { pool } from '../../../db.js';
import type { ConversationService } from '../ports.js';
import type { StructuredIntent } from '../../../types/sourcing.js';

const ROLE_ALIASES: Array<{ pattern: RegExp; hint: string }> = [
  { pattern: /international\s*voice|voice\s*process|voice\s*bpo|ivr|inbound\s*voice/i, hint: 'International Voice Process' },
  { pattern: /domestic\s*voice/i, hint: 'Domestic Voice Process' },
  { pattern: /non[\s-]*voice|chat\s*process|email\s*support/i, hint: 'Non Voice Process' },
  { pattern: /software\s*engineer|developer/i, hint: 'Software Engineer' },
];

export const heuristicConversationService: ConversationService = {
  async parse(query, context) {
    const text = query.text.trim();
    const unresolved: string[] = [];

    const countMatch = text.match(/(\d{1,4})\s*(candidates?|hires?|openings?|positions?)?/i);
    const hiringCount = countMatch ? Number(countMatch[1]) : undefined;
    if (!hiringCount) unresolved.push('hiringCount');

    const salaryMatch = text.match(/(?:₹|rs\.?|inr)?\s*(\d{4,6})\s*(?:\/|-)?\s*(?:month|pm)?/i);
    const salaryHint = salaryMatch ? Number(salaryMatch[1]) : undefined;

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
