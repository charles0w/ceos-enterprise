export const dynamic = 'force-dynamic';

import { Nav, PageHeader } from '@/components/Shell';
import {
  PROFILE, COURSES, REQUIREMENTS, REMAINING_COURSES, GRAD_PATHS, ORGS,
  unitsEarned, unitsInProgress, reqCounts, projectedUnitsAfterFall2026,
  type Course, type Requirement, type GradPath,
} from '@/lib/academics';

const SILVER = 'var(--silver)';
const DIM = 'var(--txt-dim)';
const MID = 'var(--txt-mid)';
const OK = 'var(--ok)';
const WARN = 'var(--warn)';
const RED = 'var(--red)';

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--txt-faint)', borderBottom: '1px solid var(--line)' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, borderBottom: '1px solid var(--line)' };

function gradeColor(g?: string): string {
  if (!g) return MID;
  if (g === 'F' || g.startsWith('D')) return RED;
  if (g.startsWith('C')) return WARN;
  if (g === 'P') return SILVER;
  return OK;
}
const STATUS_META: Record<string, { color: string; label: string }> = {
  done: { color: OK, label: 'DONE' },
  'in-progress': { color: WARN, label: 'IN PROGRESS' },
  planned: { color: WARN, label: 'PLANNED' },
  remaining: { color: DIM, label: 'TO DO' },
};
const FEAS_META: Record<string, { color: string; label: string }> = {
  'not-realistic': { color: RED, label: 'NOT REALISTIC' },
  tight: { color: WARN, label: 'TIGHT' },
  realistic: { color: OK, label: 'REALISTIC' },
  comfortable: { color: SILVER, label: 'COMFORTABLE' },
};

function Tile({ label, value, color = 'var(--white)', sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mono tnum" style={{ fontSize: 23, fontWeight: 500, marginTop: 6, lineHeight: 1, color }}>{value}</div>
      {sub && <div className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="mono" style={{
      fontSize: 8.5, letterSpacing: '0.12em', color, border: `1px solid ${color}`,
      borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function ProgressBar({ frac, frac2, color = OK, color2 = WARN }: { frac: number; frac2?: number; color?: string; color2?: string }) {
  return (
    <div style={{ height: 8, background: 'var(--line)', borderRadius: 99, overflow: 'hidden', position: 'relative' }}>
      {frac2 != null && <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, frac2 * 100)}%`, background: color2, opacity: 0.45 }} />}
      <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, frac * 100)}%`, background: color }} />
    </div>
  );
}

export default function AcademicsPage() {
  const earned = unitsEarned();
  const inProg = unitsInProgress();
  const projected = projectedUnitsAfterFall2026();
  const rc = reqCounts();
  const lower = REQUIREMENTS.filter(r => r.area === 'lower');
  const upper = REQUIREMENTS.filter(r => r.area === 'upper');
  const byTerm = COURSES.reduce<Record<string, Course[]>>((acc, c) => {
    (acc[c.term] ??= []).push(c); return acc;
  }, {});
  const terms = Object.keys(byTerm);

  return (
    <main className="page" style={{ maxWidth: 1320, margin: '0 auto' }}>
      <PageHeader
        title="Academics."
        sub={`${PROFILE.major} · ${PROFILE.program} · ${PROFILE.emphasis} emphasis · ${PROFILE.level}`}
      />
      <Nav active="Academics" />

      {/* snapshot strip */}
      <section className="panel edge rise" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 18, padding: '18px 20px', marginBottom: 18,
      }}>
        <Tile label="GPA" value={PROFILE.gpa.toFixed(3)} color={PROFILE.gpa >= 3 ? OK : WARN} sub="cumulative" />
        <Tile label="Units earned" value={`${earned.toFixed(1)}`} sub={`of ${PROFILE.unitsToGraduate} to graduate`} />
        <Tile label="In progress" value={`+${inProg.toFixed(0)}`} color={WARN} sub="Fall 2026 (incl. C140)" />
        <Tile label="Requirements" value={`${rc.done}/${rc.all}`} color={SILVER} sub={`${rc.planned} planned · ${rc.remaining} to do`} />
        <Tile label="Level" value={PROFILE.level} sub={`${PROFILE.termsInAttendance} terms in`} />
        <Tile label="Expected grad" value={PROFILE.expectedGrad} sub={`from ${PROFILE.startTerm}`} />
      </section>

      {/* units progress to graduation */}
      <section className="panel edge" style={{ padding: '16px 20px', marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span className="label">Units toward graduation</span>
          <span className="mono" style={{ fontSize: 11, color: MID }}>
            <span style={{ color: OK }}>{earned.toFixed(1)} earned</span> · <span style={{ color: WARN }}>{projected.toFixed(1)} after Fall ’26</span> · {PROFILE.unitsToGraduate} goal
          </span>
        </div>
        <ProgressBar frac={earned / PROFILE.unitsToGraduate} frac2={projected / PROFILE.unitsToGraduate} />
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--txt-faint)', marginTop: 8 }}>
          {(PROFILE.unitsToGraduate - projected).toFixed(1)} units remaining after Fall 2026 · includes {PROFILE.transferUnits} transfer units (AP {PROFILE.apUnits} + De Anza {PROFILE.deAnzaUnits})
        </div>
      </section>

      {/* degree requirement audit */}
      <section className="panel edge" style={{ padding: '16px 20px', marginBottom: 18 }}>
        <div className="label" style={{ marginBottom: 4 }}>Degree audit — Data Science B.A.</div>
        <p style={{ fontSize: 11.5, color: DIM, margin: '0 0 14px' }}>
          Lower division (7) complete bar the domain root; upper division needs 8 courses / ≥28 ud units — Fall 2026 fills Probability + C&amp;ID.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 22 }}>
          {[{ title: 'Lower division', reqs: lower }, { title: 'Upper division', reqs: upper }].map(group => (
            <div key={group.title}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: SILVER, textTransform: 'uppercase', marginBottom: 8 }}>{group.title}</div>
              {group.reqs.map((r: Requirement) => {
                const m = STATUS_META[r.status];
                return (
                  <div key={r.key} style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--white)' }}>{r.name}</span>
                      <Chip color={m.color}>{m.label}</Chip>
                    </div>
                    <div className="mono" style={{ fontSize: 10.5, color: r.status === 'remaining' ? WARN : MID, marginTop: 4 }}>
                      {r.satisfiedBy ? `✓ ${r.satisfiedBy}` : r.options ? `▸ ${r.options}` : r.detail}
                    </div>
                    {r.note && <div className="mono" style={{ fontSize: 9.5, color: 'var(--txt-faint)', marginTop: 3 }}>{r.note}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* remaining courses */}
      <section className="panel edge" style={{ padding: '16px 20px', marginBottom: 18 }}>
        <div className="label" style={{ marginBottom: 4 }}>Remaining to finish the major · after Fall 2026</div>
        <p style={{ fontSize: 11.5, color: DIM, margin: '0 0 12px' }}>
          ~14 major units across 4 courses. Probability (C140) should land a full term before Modeling, which lists it as a prereq.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Course options</th><th style={th}>Title</th><th style={{ ...th, textAlign: 'right' }}>Units</th><th style={th}>Fills</th></tr></thead>
          <tbody>
            {REMAINING_COURSES.map((c, i) => (
              <tr key={i}>
                <td style={{ ...td, fontFamily: 'var(--mono)', color: 'var(--white)' }}>{c.code}</td>
                <td style={td}>{c.title}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)' }}>{c.units}</td>
                <td style={{ ...td, color: MID, fontSize: 11 }}>{c.req}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* graduation paths */}
      <section style={{ marginBottom: 18 }}>
        <div className="label" style={{ marginBottom: 10 }}>Graduation paths</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {GRAD_PATHS.map((p: GradPath) => {
            const f = FEAS_META[p.feasibility];
            return (
              <div key={p.id} className="panel edge" style={{ padding: '16px 18px', borderColor: p.feasibility === 'realistic' ? 'var(--line-2)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--white)' }}>{p.label}</span>
                  <Chip color={f.color}>{f.label}</Chip>
                </div>
                <div className="mono tnum" style={{ fontSize: 20, color: 'var(--white)', lineHeight: 1 }}>{p.gradTerm}</div>
                <div className="mono" style={{ fontSize: 10, color: MID, marginTop: 3 }}>{p.yearsTotal} · {p.unitsPerRemainingTerm}</div>
                <p style={{ fontSize: 11.5, color: SILVER, margin: '11px 0 8px', lineHeight: 1.5 }}>{p.summary}</p>
                <p style={{ fontSize: 11, color: DIM, margin: 0, lineHeight: 1.5 }}>{p.tradeoffs}</p>
              </div>
            );
          })}
        </div>
        <p className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)', marginTop: 10 }}>
          Recommended: <span style={{ color: OK }}>3.5-year → Fall 2027</span>. Always confirm unit caps, AP Calc I credit, and breadth with a CDSS advisor (ds-advising@berkeley.edu).
        </p>
      </section>

      {/* GPA / recovery note */}
      <section className="panel edge" style={{ padding: '14px 18px', marginBottom: 18, borderColor: 'var(--line-2)' }}>
        <div className="label" style={{ marginBottom: 6 }}>Spring 2026 &amp; GPA — worth knowing</div>
        <p style={{ fontSize: 12, color: SILVER, margin: '0 0 6px', lineHeight: 1.6 }}>
          The good news: <span style={{ color: OK }}>neither CS 168 (F) nor CS 188 (D-) is required for the major.</span> C&amp;ID is covered by C101 + 144, and Modeling can be met by Data C102 / CS 189 / Stat 154 — so your major path is intact.
        </p>
        <p style={{ fontSize: 11.5, color: DIM, margin: 0, lineHeight: 1.6 }}>
          They do weigh on the 3.185 cumulative GPA (you&apos;re comfortably above the 2.0 good-standing floor and the major&apos;s C-average rule). If you want to lift the GPA, Berkeley&apos;s grade-replacement policy lets the first 12 repeated units replace the original grade — repeating one of these is a candidate. One to raise with your advisor.
        </p>
      </section>

      {/* clubs & orgs */}
      <section className="panel edge" style={{ padding: '16px 20px', marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span className="label">Clubs &amp; on-campus orgs</span>
          <span className="mono" style={{ fontSize: 9.5, color: ORGS.some(o => o.placeholder) ? WARN : MID }}>
            {ORGS.some(o => o.placeholder) ? 'awaiting your list' : `${ORGS.filter(o => !o.placeholder).length} active`}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {ORGS.map((o, i) => (
            <div key={i} style={{
              border: o.placeholder ? '1px dashed var(--line-2)' : '1px solid var(--line-2)',
              borderRadius: 8, padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: o.placeholder ? 'var(--txt-faint)' : 'var(--white)' }}>{o.name}</span>
                {o.since && <span className="mono" style={{ fontSize: 9, color: 'var(--txt-faint)', whiteSpace: 'nowrap' }}>{o.since}</span>}
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: o.placeholder ? 'var(--txt-faint)' : SILVER, marginTop: 5 }}>
                {o.role}{o.category ? ` · ${o.category}` : ''}
              </div>
              {o.note && <div style={{ fontSize: 10.5, color: DIM, marginTop: 6, lineHeight: 1.5 }}>{o.note}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* course portfolio */}
      <section className="panel edge" style={{ padding: '16px 20px' }}>
        <div className="label" style={{ marginBottom: 12 }}>Course portfolio · transcript</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 22 }}>
          {terms.map(term => (
            <div key={term}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: SILVER, textTransform: 'uppercase', marginBottom: 6 }}>
                {term}{term === 'Fall 2026' && <span style={{ color: WARN }}> · planned</span>}
              </div>
              {byTerm[term].map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ minWidth: 0 }}>
                    <span className="mono" style={{ fontSize: 11.5, color: c.countsForMajor ? 'var(--white)' : MID }}>{c.code}</span>
                    {c.countsForMajor && <span style={{ color: OK, fontSize: 9, marginLeft: 5 }}>★</span>}
                    <div style={{ fontSize: 10, color: 'var(--txt-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span className="mono" style={{ fontSize: 12.5, color: gradeColor(c.grade), fontWeight: 500 }}>{c.grade ?? '—'}</span>
                    <span className="mono" style={{ fontSize: 9.5, color: 'var(--txt-faint)', marginLeft: 6 }}>{c.units}u</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--txt-faint)', marginTop: 12 }}>★ counts toward the Data Science major</div>
      </section>
    </main>
  );
}
