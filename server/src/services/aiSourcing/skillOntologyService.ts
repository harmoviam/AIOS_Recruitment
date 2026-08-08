import { pool } from '../../db.js';
import { normalizeSkill, matchSkillAgainstHaystack } from '../skillMatch.js';

export type SkillExpansion = {
  input: string;
  normalized: string;
  canonical: string | null;
  implied: string[];
  allTerms: string[];
};

/**
 * Skill normalization + lightweight ontology expansion for hybrid search.
 * Uses DB ontology when seeded; falls back to skillMatch aliases.
 */
export class SkillOntologyService {
  normalize(value: string): string {
    return normalizeSkill(value);
  }

  normalizeMany(values: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of values) {
      const n = this.normalize(v);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    return out;
  }

  async resolveCanonical(term: string): Promise<{ id: number; name: string; normalized: string } | null> {
    const normalized = this.normalize(term);
    if (!normalized) return null;
    const { rows } = await pool.query(
      `SELECT s.id, s.name, s.normalized_name
       FROM ai_skills s
       WHERE s.normalized_name = $1
       UNION ALL
       SELECT s.id, s.name, s.normalized_name
       FROM ai_skill_aliases a
       JOIN ai_skills s ON s.id = a.skill_id
       WHERE a.normalized_alias = $1
       LIMIT 1`,
      [normalized]
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id as number,
      name: rows[0].name as string,
      normalized: rows[0].normalized_name as string,
    };
  }

  /**
   * Expand a skill into search terms using ontology relationships.
   * EKS → kubernetes, aws; CloudFormation → aws; etc.
   */
  async expandSkill(term: string): Promise<SkillExpansion> {
    const normalized = this.normalize(term);
    const implied = new Set<string>();
    let canonical: string | null = null;

    const resolved = await this.resolveCanonical(term);
    if (resolved) {
      canonical = resolved.name;
      implied.add(resolved.normalized);

      const { rows: aliases } = await pool.query(
        `SELECT normalized_alias FROM ai_skill_aliases WHERE skill_id = $1`,
        [resolved.id]
      );
      for (const r of aliases) implied.add(r.normalized_alias as string);

      // Parent → related/required children (EKS → Kubernetes, AWS)
      const { rows: asParent } = await pool.query(
        `SELECT s.normalized_name, r.weight
         FROM ai_skill_relationships r
         JOIN ai_skills s ON s.id = r.child_skill_id
         WHERE r.parent_skill_id = $1`,
        [resolved.id]
      );
      for (const r of asParent) {
        if ((r.weight as number) >= 0.7) implied.add(r.normalized_name as string);
      }
    } else if (normalized) {
      implied.add(normalized);
    }

    // Also pull reverse REQUIRES: skills that list this as required parent? Already covered via parent→child.

    // Fallback: if term matches via skillMatch against known ontology names
    if (!canonical && normalized) {
      const { rows } = await pool.query(`SELECT name, normalized_name FROM ai_skills`);
      for (const r of rows) {
        const detail = matchSkillAgainstHaystack(term, r.normalized_name as string);
        if (detail.matched) {
          canonical = r.name as string;
          implied.add(r.normalized_name as string);
          break;
        }
      }
    }

    const allTerms = Array.from(new Set([normalized, ...implied].filter(Boolean)));
    return {
      input: term,
      normalized,
      canonical,
      implied: Array.from(implied),
      allTerms,
    };
  }

  async expandSkills(skills: string[]): Promise<string[]> {
    const terms = new Set<string>();
    for (const skill of skills) {
      const expansion = await this.expandSkill(skill);
      for (const t of expansion.allTerms) terms.add(t);
    }
    return Array.from(terms);
  }

  async listSkills(limit = 100): Promise<Array<{ id: number; name: string; category: string | null }>> {
    const lim = Math.min(Math.max(limit, 1), 500);
    const { rows } = await pool.query(
      `SELECT id, name, category FROM ai_skills ORDER BY name ASC LIMIT $1`,
      [lim]
    );
    return rows.map((r) => ({
      id: r.id as number,
      name: r.name as string,
      category: (r.category as string) ?? null,
    }));
  }
}

export const skillOntologyService = new SkillOntologyService();
