import { sql } from '@vercel/postgres';

export interface GrowthStats {
  total: number;
  withEmail: number;
  outreachSent: number;
  outreachReplied: number;
  closed: number;
  lastScrapedAt: string | null;
}

export async function getGrowthStats(): Promise<GrowthStats | null> {
  try {
    const { rows } = await sql`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE owner_email IS NOT NULL)      AS with_email,
        COUNT(*) FILTER (WHERE outreach_status != 'new')     AS outreach_sent,
        COUNT(*) FILTER (WHERE outreach_replied_at IS NOT NULL) AS outreach_replied,
        COUNT(*) FILTER (WHERE closed_amount IS NOT NULL)    AS closed,
        MAX(created_at)                                      AS last_scraped_at
      FROM businesses
    `;
    const r = rows[0];
    return {
      total: Number(r.total),
      withEmail: Number(r.with_email),
      outreachSent: Number(r.outreach_sent),
      outreachReplied: Number(r.outreach_replied),
      closed: Number(r.closed),
      lastScrapedAt: r.last_scraped_at ?? null,
    };
  } catch {
    return null;
  }
}
