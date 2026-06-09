import { sql } from '@vercel/postgres';

// Rich fleet stats for the 'jobs' agent (owner repo: ceos-jobs).
// Mirrors lib/growth.ts: one aggregate query over the shared job_applications
// table, merged into getFleet() in lib/registry.ts. Columns match db/schema.sql
// in ceos-jobs (stage / resume_variant_url / submitted_at / last_status_at).
export interface JobStats {
  discovered: number;
  tailored: number;
  submitted: number;
  interviews: number;
  offers: number;
  lastActivityAt: string | null;
}

export async function getJobStats(): Promise<JobStats | null> {
  try {
    const { rows } = await sql`
      SELECT
        COUNT(*)                                                      AS discovered,
        COUNT(*) FILTER (WHERE resume_variant_url IS NOT NULL)        AS tailored,
        COUNT(*) FILTER (WHERE submitted_at IS NOT NULL)              AS submitted,
        COUNT(*) FILTER (WHERE stage IN ('assessment', 'interview'))  AS interviews,
        COUNT(*) FILTER (WHERE stage = 'offer')                       AS offers,
        MAX(last_status_at)                                           AS last_activity_at
      FROM job_applications
    `;
    const r = rows[0];
    return {
      discovered: Number(r.discovered),
      tailored: Number(r.tailored),
      submitted: Number(r.submitted),
      interviews: Number(r.interviews),
      offers: Number(r.offers),
      lastActivityAt: r.last_activity_at ?? null,
    };
  } catch {
    return null;
  }
}
