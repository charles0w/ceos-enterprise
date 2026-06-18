export const dynamic = 'force-dynamic';

import { Nav, PageHeader } from '@/components/Shell';
import { getFinanceSnapshot, getFinanceRuns } from '@/lib/finance';
import type { FinancePrediction, FinancePosition, FinanceCandidate, FinanceUpcoming } from '@/lib/finance';

const GREEN = '#86c98e';
const RED = 'var(--red)';
const SILVER = 'var(--silver)';
const DIM = 'var(--txt-dim)';

function pct(n: number | null | undefined, signed = false): string {
  if (n == null) return '—';
  const s = signed && n > 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}
function num(n: number | null | undefined, d = 2): string {
  return n == null ? '—' : n.toFixed(d);
}
function ago(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3.6e6);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 6e4))}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function Tile({ label, value, color = 'var(--white)', sub }: {
  label: string; value: string; color?: string; sub?: string;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mono tnum" style={{ fontSize: 24, fontWeight: 500, marginTop: 6, lineHeight: 1, color }}>{value}</div>
      {sub && <div className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--txt-faint)', borderBottom: '1px solid var(--line)' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, borderBottom: '1px solid var(--line)' };

export default async function FinancePage() {
  const [snap, runs] = await Promise.all([getFinanceSnapshot(), getFinanceRuns(30)]);
  const sc = snap.scorecard;
  const model = (snap.model ?? {}) as Record<string, unknown>;
  const heldOut = typeof model.held_out_acc === 'number' ? (model.held_out_acc as number) : null;
  const hitColor = sc?.hit_rate == null ? SILVER : sc.hit_rate > 0.5 ? GREEN : RED;
  const expColor = sc?.expectancy_pct == null ? SILVER : sc.expectancy_pct > 0 ? GREEN : RED;
  const recentPreds = [...snap.predictions].reverse().slice(0, 25);

  return (
    <main className="page" style={{ maxWidth: 1320, margin: '0 auto' }}>
      <PageHeader
        title="Trading desk."
        sub={`ai-trading-bot · PEAD options swing (paper) · updated ${ago(snap.updatedAt)}`}
      />
      <Nav active="Finance" />

      {snap.updatedAt == null && (
        <section className="panel edge" style={{ padding: '14px 18px', marginBottom: 18, color: DIM, fontSize: 12.5 }}>
          No snapshot yet. The bot pushes one each daily run (<span className="mono">scripts/report.py</span>). Until then this desk is empty — expected between earnings waves.
        </section>
      )}

      {/* scorecard strip */}
      <section className="panel edge rise" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 18, padding: '18px 20px', marginBottom: 18,
      }}>
        <Tile label="Predictions" value={sc ? String(sc.n_total) : '0'} />
        <Tile label="Graded" value={sc ? String(sc.n_graded) : '0'} />
        <Tile label="Hit rate" value={sc?.hit_rate == null ? '—' : pct(sc.hit_rate * 100)} color={hitColor} sub="vs 50% = no edge" />
        <Tile label="Expectancy" value={pct(sc?.expectancy_pct ?? null, true)} color={expColor} sub="per call, directional" />
        <Tile label="Open positions" value={String(snap.positions.length)} />
        <Tile label="Model held-out" value={heldOut == null ? '—' : pct(heldOut * 100)} color={SILVER} sub={(model.version as string) ?? 'heuristic'} />
      </section>

      {snap.note && (
        <section className="panel edge" style={{ padding: '12px 18px', marginBottom: 18, fontSize: 12.5, color: DIM }}>
          <span className="label" style={{ marginRight: 10 }}>last run</span>{snap.note}
        </section>
      )}

      {/* upcoming earnings — forward look at this week's reporters (setups incoming) */}
      <section className="panel edge rise" style={{ padding: 0, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }} className="label">Upcoming earnings · this week</div>
        {snap.upcoming.length === 0
          ? <div style={{ padding: '16px 18px', color: 'var(--txt-faint)', fontSize: 12.5 }}>No liquid names reporting in the next 7 days.</div>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>
              <th style={th}>Symbol</th><th style={th}>Reports</th><th style={th}>When</th><th style={th}>EPS est</th><th style={th}>Tradeable</th>
            </tr></thead><tbody>
              {snap.upcoming.map((u: FinanceUpcoming, i) => {
                const when = u.hour === 'bmo' ? 'before open' : u.hour === 'amc' ? 'after close' : (u.hour ?? '—');
                return <tr key={i}>
                  <td style={{ ...td, color: SILVER }}>{u.symbol}</td>
                  <td style={td}>{u.date}</td>
                  <td style={{ ...td, color: DIM }}>{when}</td>
                  <td style={td}>{u.eps_estimate == null ? '—' : num(u.eps_estimate)}</td>
                  <td style={{ ...td, color: DIM }}>T+1/T+2 after</td>
                </tr>;
              })}
            </tbody></table>}
      </section>

      {/* activity log — each daily launch, click to expand its summary */}
      <section className="panel edge rise" style={{ padding: 0, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }} className="label">Activity log · daily launches</div>
        {runs.length === 0
          ? <div style={{ padding: '16px 18px', color: 'var(--txt-faint)', fontSize: 12.5 }}>No runs recorded yet — the daily job posts one each fire.</div>
          : runs.map((r, i) => (
              <details key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: r.ok ? GREEN : RED, flex: '0 0 auto' }} />
                  <span className="mono" style={{ color: SILVER, minWidth: 140, flex: '0 0 auto' }}>{fmtTs(r.ts)}</span>
                  <span style={{ color: DIM, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.summary || '—'}</span>
                </summary>
                <pre style={{ margin: 0, padding: '2px 18px 16px 37px', fontSize: 11.5, color: 'var(--txt-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono, monospace)' }}>{r.detail || '(no detail captured)'}</pre>
              </details>
            ))}
      </section>

      {/* open positions */}
      <section className="panel edge rise" style={{ padding: 0, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }} className="label">Open paper positions</div>
        {snap.positions.length === 0
          ? <div style={{ padding: '16px 18px', color: 'var(--txt-faint)', fontSize: 12.5 }}>No open positions.</div>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>
              <th style={th}>Contract</th><th style={th}>Qty</th><th style={th}>Entry</th><th style={th}>Mark</th><th style={th}>P&L%</th>
            </tr></thead><tbody>
              {snap.positions.map((p: FinancePosition, i) => {
                const pl = p.mark != null && p.entry_price ? (p.mark - p.entry_price) / p.entry_price * 100 : null;
                return <tr key={i}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono, monospace)' }}>{p.occ_symbol}</td>
                  <td style={td}>{p.quantity}</td>
                  <td style={td}>{num(p.entry_price)}</td>
                  <td style={td}>{num(p.mark)}</td>
                  <td style={{ ...td, color: pl == null ? DIM : pl >= 0 ? GREEN : RED }}>{pct(pl, true)}</td>
                </tr>;
              })}
            </tbody></table>}
      </section>

      {/* recent predictions */}
      <section className="panel edge rise" style={{ padding: 0, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }} className="label">Recent predictions</div>
        {recentPreds.length === 0
          ? <div style={{ padding: '16px 18px', color: 'var(--txt-faint)', fontSize: 12.5 }}>No predictions logged yet — the brain trades only in the post-earnings window.</div>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>
              <th style={th}>Date</th><th style={th}>Symbol</th><th style={th}>Dir</th><th style={th}>Conv</th><th style={th}>Status</th><th style={th}>Return%</th>
            </tr></thead><tbody>
              {recentPreds.map((p: FinancePrediction) => (
                <tr key={p.id}>
                  <td style={td}>{p.date}</td>
                  <td style={{ ...td, color: SILVER }}>{p.symbol}</td>
                  <td style={{ ...td, color: p.direction === 'up' ? GREEN : RED }}>{p.direction === 'up' ? 'CALL' : 'PUT'}</td>
                  <td style={td}>{p.conviction == null ? '—' : p.conviction.toFixed(2)}</td>
                  <td style={td}>{p.status === 'graded' ? (p.correct ? '✓ correct' : '✗ wrong') : 'open'}</td>
                  <td style={{ ...td, color: p.return_pct == null ? DIM : p.return_pct >= 0 ? GREEN : RED }}>{pct(p.return_pct ?? null, true)}</td>
                </tr>
              ))}
            </tbody></table>}
      </section>

      {/* candidates */}
      <section className="panel edge rise" style={{ padding: 0, marginBottom: 28, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }} className="label">Today&apos;s earnings candidates</div>
        {snap.candidates.length === 0
          ? <div style={{ padding: '16px 18px', color: 'var(--txt-faint)', fontSize: 12.5 }}>No liquid names in the post-earnings window today.</div>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>
              <th style={th}>Symbol</th><th style={th}>Days since earnings</th><th style={th}>SUE</th><th style={th}>Drift%</th><th style={th}>In window</th>
            </tr></thead><tbody>
              {snap.candidates.map((c: FinanceCandidate, i) => (
                <tr key={i}>
                  <td style={{ ...td, color: SILVER }}>{c.symbol}</td>
                  <td style={td}>{c.days_since_earnings ?? '—'}</td>
                  <td style={td}>{num(c.sue)}</td>
                  <td style={{ ...td, color: c.post_earnings_return == null ? DIM : c.post_earnings_return >= 0 ? GREEN : RED }}>{pct((c.post_earnings_return ?? 0) * 100, true)}</td>
                  <td style={td}>{c.in_window ? '● PEAD' : ''}</td>
                </tr>
              ))}
            </tbody></table>}
      </section>
    </main>
  );
}
