'use client';
import { useEffect, useState, useRef } from 'react';
import type { Skill, SkillDomain } from '@/lib/brain/skills';
import { SKILL_DOMAINS } from '@/lib/brain/skills';

const DOMAIN_COLORS: Record<SkillDomain, string> = {
  finance:    '#3fe08f',
  social:     '#6fa3f7',
  'client-ops': '#f2c14e',
  garage:     '#e06f3f',
  internal:   '#c9ccd6',
};

const DOMAIN_LABEL: Record<SkillDomain, string> = {
  finance:      'Finance',
  social:       'Social',
  'client-ops': 'Client Ops',
  garage:       'Garage',
  internal:     'Internal',
};

// ── nav reuse (matches FleetDashboard's Nav) ──────────────────
function Nav() {
  const links = [
    { label: 'Fleet',   href: '/' },
    { label: 'CEO',     href: '/ceo' },
    { label: 'Social',  href: '/social' },
    { label: 'Brain',   href: '/brain', active: true },
  ];
  return (
    <nav style={{
      display: 'flex', gap: 2, marginBottom: 24, padding: '3px',
      background: 'var(--surface-2)', borderRadius: 10, width: 'fit-content',
    }}>
      {links.map((l) => (
        <a key={l.href} href={l.href} style={{
          padding: '6px 16px', borderRadius: 8, fontSize: 12.5, fontWeight: 500,
          color: l.active ? 'var(--white)' : 'var(--txt-dim)',
          background: l.active ? 'var(--surface-3)' : 'transparent',
          textDecoration: 'none',
          letterSpacing: '0.02em',
        }}>{l.label}</a>
      ))}
    </nav>
  );
}

// ── domain coverage bar ───────────────────────────────────────
function CoverageBar({ domain, count, target = 3 }: { domain: SkillDomain; count: number; target?: number }) {
  const pct = Math.min(1, count / target);
  const color = DOMAIN_COLORS[domain];
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span className="label" style={{ letterSpacing: '0.12em', color: 'var(--txt-mid)' }}>
          {DOMAIN_LABEL[domain]}
        </span>
        <span className="mono tnum" style={{ fontSize: 10, color }}>
          {count} skill{count !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{
          height: '100%', width: `${Math.round(pct * 100)}%`, borderRadius: 99,
          background: color, opacity: 0.85,
          transition: 'width 0.9s cubic-bezier(.2,.7,.3,1)',
        }} />
      </div>
    </div>
  );
}

// ── skill row ─────────────────────────────────────────────────
function SkillRow({ skill, onEdit, onDelete }: {
  skill: Skill;
  onEdit: (s: Skill) => void;
  onDelete: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const color = DOMAIN_COLORS[skill.domain as SkillDomain] ?? 'var(--silver)';
  return (
    <div style={{
      borderRadius: 10, background: 'var(--surface-2)', marginBottom: 8,
      border: '1px solid var(--line)',
    }}>
      <button
        onClick={() => setOpen((x) => !x)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{
          width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0,
          boxShadow: `0 0 6px ${color}88`,
        }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)', flex: 1 }}>{skill.title}</span>
        <span style={{
          fontSize: 9, padding: '3px 8px', borderRadius: 99,
          border: `1px solid ${skill.escalate ? '#f2c14e44' : 'var(--line)'}`,
          color: skill.escalate ? '#f2c14e' : 'var(--txt-faint)',
          letterSpacing: '0.1em', flexShrink: 0,
        }}>
          {skill.escalate ? '⬆ escalate' : 'autonomous'}
        </span>
        <span className="mono" style={{ fontSize: 9, color: 'var(--txt-faint)', flexShrink: 0 }}>
          {Math.round(skill.confidence * 100)}%
        </span>
        <span style={{ color: 'var(--txt-faint)', fontSize: 14, flexShrink: 0, marginLeft: 4 }}>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--line)' }}>
          <div style={{ marginTop: 12, marginBottom: 10 }}>
            <div className="label" style={{ fontSize: 9, letterSpacing: '0.14em', marginBottom: 5, color: 'var(--txt-faint)' }}>TRIGGER</div>
            <div style={{ fontSize: 12.5, color: 'var(--txt-mid)', lineHeight: 1.5 }}>{skill.trigger}</div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div className="label" style={{ fontSize: 9, letterSpacing: '0.14em', marginBottom: 5, color: 'var(--txt-faint)' }}>WHAT TO DO</div>
            <pre style={{
              fontSize: 11.5, color: 'var(--txt)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
              margin: 0, fontFamily: 'inherit',
            }}>{skill.knowledge}</pre>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <span className="mono" style={{ fontSize: 9, color: 'var(--txt-faint)' }}>
              source: {skill.source} · cited {skill.usage_count}×
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button onClick={() => onEdit(skill)} style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 6,
                background: 'var(--surface-3)', border: '1px solid var(--line)',
                color: 'var(--silver)', cursor: 'pointer',
              }}>Edit</button>
              <button onClick={() => onDelete(skill.name)} style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 6,
                background: 'transparent', border: '1px solid var(--line)',
                color: 'var(--txt-faint)', cursor: 'pointer',
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── add / edit form ───────────────────────────────────────────
const BLANK = { name: '', title: '', trigger: '', knowledge: '', domain: 'internal' as SkillDomain, escalate: false, confidence: 0.8, source: 'manual' };

function SkillForm({ initial, onSave, onCancel }: {
  initial?: Partial<typeof BLANK>;
  onSave: (data: typeof BLANK) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<typeof BLANK>({ ...BLANK, ...initial });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: keyof typeof BLANK, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.title || !form.trigger || !form.knowledge) {
      setErr('name, title, trigger, and knowledge are required');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await onSave(form);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
      setSaving(false);
    }
  };

  const field = (label: string, k: keyof typeof BLANK, type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number' = 'text', opts?: string[]) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.14em', color: 'var(--txt-faint)', marginBottom: 4 }}>
        {label.toUpperCase()}
      </label>
      {type === 'textarea' ? (
        <textarea value={String(form[k])} onChange={(e) => set(k, e.target.value)} rows={5} style={{
          width: '100%', background: 'var(--surface-3)', border: '1px solid var(--line)',
          borderRadius: 8, padding: '8px 10px', color: 'var(--white)', fontSize: 12.5,
          resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
        }} />
      ) : type === 'select' ? (
        <select value={String(form[k])} onChange={(e) => set(k, e.target.value)} style={{
          background: 'var(--surface-3)', border: '1px solid var(--line)', borderRadius: 8,
          padding: '7px 10px', color: 'var(--white)', fontSize: 12.5,
        }}>
          {opts!.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'checkbox' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(form[k])} onChange={(e) => set(k, e.target.checked)} />
          <span style={{ fontSize: 12.5, color: 'var(--txt)' }}>requires Charles approval before acting</span>
        </label>
      ) : type === 'number' ? (
        <input type="number" min={0} max={1} step={0.05} value={Number(form[k])} onChange={(e) => set(k, parseFloat(e.target.value))} style={{
          background: 'var(--surface-3)', border: '1px solid var(--line)', borderRadius: 8,
          padding: '7px 10px', color: 'var(--white)', fontSize: 12.5, width: 100,
        }} />
      ) : (
        <input type="text" value={String(form[k])} onChange={(e) => set(k, e.target.value)} style={{
          width: '100%', background: 'var(--surface-3)', border: '1px solid var(--line)',
          borderRadius: 8, padding: '7px 10px', color: 'var(--white)', fontSize: 12.5,
          boxSizing: 'border-box',
        }} />
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: 12, padding: 20, marginBottom: 20,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)', marginBottom: 16 }}>
        {initial?.name ? 'Edit skill' : 'New skill'}
      </div>
      {field('Name (kebab-case slug)', 'name')}
      {field('Title', 'title')}
      {field('Domain', 'domain', 'select', SKILL_DOMAINS)}
      {field('Trigger (when this skill applies)', 'trigger', 'textarea')}
      {field('What to do (what the agent should know/do)', 'knowledge', 'textarea')}
      {field('Escalate', 'escalate', 'checkbox')}
      {field('Confidence (0–1)', 'confidence', 'number')}
      {err && <div style={{ fontSize: 11, color: 'var(--err)', marginBottom: 10 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={saving} style={{
          padding: '8px 18px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
          background: 'var(--white)', color: '#000', border: 'none', cursor: saving ? 'default' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Saving…' : 'Save skill'}
        </button>
        <button type="button" onClick={onCancel} style={{
          padding: '8px 18px', borderRadius: 8, fontSize: 12.5,
          background: 'transparent', border: '1px solid var(--line)',
          color: 'var(--txt-faint)', cursor: 'pointer',
        }}>Cancel</button>
      </div>
    </form>
  );
}

// ── brain page ────────────────────────────────────────────────
export default function BrainPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Skill[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState<Skill | null | 'new'>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/brain');
      if (res.ok) {
        const data = await res.json();
        setSkills(data.skills ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults(null); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/brain?q=${encodeURIComponent(query)}`);
        if (res.ok) setResults((await res.json()).skills ?? []);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query]);

  const handleSave = async (data: { name: string; title: string; trigger: string; knowledge: string; domain: SkillDomain; escalate: boolean; confidence: number; source: string }) => {
    const res = await fetch('/api/brain', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? 'save failed');
    setEditing(null);
    await load();
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete skill "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/brain?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    await load();
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult('');
    try {
      const res = await fetch('/api/brain/sync', { method: 'POST' });
      const data = await res.json();
      setSyncResult(data.ok ? `pushed ${data.pushed}/${data.total} skills to vault` : (data.error ?? 'sync failed'));
    } finally {
      setSyncing(false);
    }
  };

  // coverage by domain
  const byDomain = Object.fromEntries(SKILL_DOMAINS.map((d) => [d, 0])) as Record<SkillDomain, number>;
  for (const s of skills) byDomain[s.domain as SkillDomain] = (byDomain[s.domain as SkillDomain] ?? 0) + 1;

  const displayList = results ?? skills;
  const grouped = SKILL_DOMAINS.map((d) => ({
    domain: d,
    skills: displayList.filter((s) => s.domain === d),
  })).filter((g) => g.skills.length > 0);

  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* header */}
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: 'var(--white)', letterSpacing: '-0.01em' }}>
            Company Brain
          </h1>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--txt-dim)', lineHeight: 1.4 }}>
            {skills.length} skills · how the company operates, in executable form
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {syncResult && (
            <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>{syncResult}</span>
          )}
          <button onClick={handleSync} disabled={syncing} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
            background: 'var(--surface-2)', border: '1px solid var(--line)',
            color: syncing ? 'var(--txt-faint)' : 'var(--silver)', cursor: syncing ? 'default' : 'pointer',
          }}>
            {syncing ? 'Syncing…' : 'Sync to vault →'}
          </button>
          <button onClick={() => setEditing('new')} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: 'var(--white)', color: '#000', border: 'none', cursor: 'pointer',
          }}>
            + Add skill
          </button>
        </div>
      </header>

      <Nav />

      {/* test query */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Test the brain — e.g. "client discount", "trade entry", "post approval"…'
          style={{
            width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)',
            borderRadius: 10, padding: '11px 14px 11px 38px', color: 'var(--white)',
            fontSize: 13.5, boxSizing: 'border-box',
          }}
        />
        <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--txt-faint)' }}>
          🔍
        </span>
        {searching && (
          <span className="mono" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--txt-faint)' }}>
            searching…
          </span>
        )}
      </div>

      {results !== null && (
        <div style={{ marginBottom: 16, fontSize: 11.5, color: 'var(--txt-dim)' }}>
          {results.length} matching skill{results.length !== 1 ? 's' : ''} for "{query}"
          <button onClick={() => { setQuery(''); setResults(null); }} style={{
            marginLeft: 8, fontSize: 11, color: 'var(--txt-faint)',
            background: 'none', border: 'none', cursor: 'pointer',
          }}>✕ clear</button>
        </div>
      )}

      {/* form */}
      {editing === 'new' && (
        <SkillForm onSave={handleSave} onCancel={() => setEditing(null)} />
      )}
      {editing && editing !== 'new' && (
        <SkillForm
          initial={{ ...editing }}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* coverage */}
      {results === null && (
        <section style={{
          background: 'var(--surface-2)', border: '1px solid var(--line)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 24,
        }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'var(--txt-faint)', marginBottom: 14 }}>DOMAIN COVERAGE</div>
          {SKILL_DOMAINS.map((d) => (
            <CoverageBar key={d} domain={d} count={byDomain[d]} />
          ))}
        </section>
      )}

      {/* skills list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--txt-faint)' }}>loading skills…</span>
        </div>
      ) : grouped.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--txt-faint)' }}>
            {results !== null ? 'no skills match that query' : 'no skills yet — add your first one above'}
          </span>
        </div>
      ) : (
        grouped.map(({ domain, skills: ds }) => (
          <div key={domain} style={{ marginBottom: 28 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: DOMAIN_COLORS[domain],
                boxShadow: `0 0 8px ${DOMAIN_COLORS[domain]}88`,
              }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: DOMAIN_COLORS[domain] }}>
                {DOMAIN_LABEL[domain].toUpperCase()}
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--txt-faint)' }}>{ds.length}</span>
            </div>
            {ds.map((s) => (
              <SkillRow
                key={s.name}
                skill={s}
                onEdit={(sk) => setEditing(sk)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ))
      )}

      <p className="mono" style={{ fontSize: 11, color: 'var(--txt-faint)', margin: '24px 0 0', textAlign: 'center' }}>
        Company Brain · CEO OS · Phase 1
      </p>
    </div>
  );
}
