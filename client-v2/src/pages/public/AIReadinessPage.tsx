import { useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';

/**
 * Public AI Hiring Readiness self-assessment — the interactive version of
 * docs/HarmiRecruit_AI_Hiring_Readiness_Scorecard.pdf. 8 parameters scored
 * 1–5, live total /40 → tier, 3 lowest scores → recommended modules.
 * Doubles as lead capture: submitting stores the org + answers server-side.
 */

const NAVY = '#122A46';
const NAVY_MID = '#1E3A5F';
const TEAL = '#0F766E';
const TEAL_LIGHT = '#2DD4BF';
const GOLD = '#D97706';
const CORAL = '#E11D48';

const QUESTIONS = [
  {
    key: 'data_hygiene',
    dimension: 'Data hygiene',
    question: 'Where do candidate resumes and profiles live today?',
    low: 'Scattered — drives, WhatsApp, email',
    high: 'One searchable system',
    module: 'AI Resume Parser + Careers apply',
  },
  {
    key: 'channel_discipline',
    dimension: 'Channel discipline',
    question: 'Where do recruiter–candidate chats happen?',
    low: 'Personal WhatsApp / mixed',
    high: 'Org inbox, auditable',
    module: 'WhatsApp inbox (Meta API)',
  },
  {
    key: 'screening_consistency',
    dimension: 'Screening consistency',
    question: 'How are candidates shortlisted for a role?',
    low: 'Gut feel / keyword scan',
    high: 'Structured score vs JD',
    module: 'AI Match Score /10',
  },
  {
    key: 'hm_collaboration',
    dimension: 'HM collaboration',
    question: 'How do hiring managers see pipeline status?',
    low: 'Chase recruiters / status calls',
    high: 'Live shared pipeline',
    module: 'HM dashboard + scorecards',
  },
  {
    key: 'followup_ownership',
    dimension: 'Follow-up ownership',
    question: 'Who owns candidate nurturing from offer to Day 90?',
    low: 'Ad-hoc — often drops',
    high: 'Milestones + ownership',
    module: 'Follow-up engine + AI scripts',
  },
  {
    key: 'ai_trust',
    dimension: 'AI trust',
    question: 'Would your team use AI drafts if every suggestion is editable?',
    low: 'Low trust / blocked',
    high: 'Human-in-the-loop OK',
    module: 'AI drafts — WhatsApp replies, JDs, screening Qs',
  },
  {
    key: 'measurement',
    dimension: 'Measurement',
    question: 'Do you track source → submit → interview → select → join?',
    low: 'Partial / anecdotal',
    high: 'Funnel + recruiter KPIs',
    module: 'Analytics + recruiter leaderboard',
  },
  {
    key: 'scale_pressure',
    dimension: 'Scale pressure',
    question: 'Can current headcount absorb next quarter’s hiring volume?',
    low: 'No — burnout / backlog',
    high: 'Yes — with better tools',
    module: 'AI layer across every seat',
  },
];

const TIERS = [
  {
    tier: 'manual',
    label: 'Manual',
    range: '8–18',
    color: CORAL,
    blurb:
      'Spreadsheets + personal WhatsApp. Start with day-one wins: parse resumes into one searchable system and run a single shared pipeline.',
  },
  {
    tier: 'tool_ready',
    label: 'Tool-ready',
    range: '19–28',
    color: GOLD,
    blurb:
      'You have process — AI is still optional. Automate your three biggest gaps below and measure the lift before scaling further.',
  },
  {
    tier: 'ai_ambitious',
    label: 'AI-ambitious',
    range: '29–40',
    color: TEAL,
    blurb:
      'Ready for governed AI at scale. Roll the AI layer across every seat — with humans approving every send.',
  },
];

function tierForTotal(total: number) {
  if (total <= 18) return TIERS[0];
  if (total <= 28) return TIERS[1];
  return TIERS[2];
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.85rem',
  borderRadius: 10,
  border: '1px solid #cbd5e1',
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

export default function AIReadinessPage() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [orgName, setOrgName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const resultRef = useRef<HTMLDivElement | null>(null);

  const answered = Object.keys(answers).length;
  const complete = answered === QUESTIONS.length;
  const total = useMemo(
    () => Object.values(answers).reduce((sum, v) => sum + v, 0),
    [answers]
  );
  const tier = tierForTotal(total);
  const gaps = useMemo(() => {
    if (!complete) return [];
    return [...QUESTIONS].sort((a, b) => answers[a.key] - answers[b.key]).slice(0, 3);
  }, [answers, complete]);

  const pick = (key: string, value: number) => {
    const wasComplete = Object.keys(answers).length === QUESTIONS.length;
    const next = { ...answers, [key]: value };
    setAnswers(next);
    if (!wasComplete && Object.keys(next).length === QUESTIONS.length) {
      // First time all 8 are answered — bring the result into view.
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complete || submitting) return;
    setError('');
    if (!orgName.trim()) {
      setError('Please tell us your organization name.');
      return;
    }
    setSubmitting(true);
    try {
      await api.readinessSubmit({
        org_name: orgName.trim(),
        contact_name: contactName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        answers,
      });
      setSubmitted(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: `radial-gradient(1100px 480px at 50% -10%, rgba(45,212,191,0.18), transparent 60%), linear-gradient(180deg, #eef4f6 0%, #f8fafc 40%, #f8fafc 100%)`,
        color: '#0f172a',
        fontFamily: '"Source Sans 3", "Segoe UI", sans-serif',
        paddingBottom: '6.5rem',
      }}
    >
      <header
        style={{
          padding: '3.25rem 1.5rem 2.5rem',
          textAlign: 'center',
          background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY_MID} 100%)`,
          color: '#fff',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '0.8rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            opacity: 0.85,
            fontWeight: 600,
            color: TEAL_LIGHT,
          }}
        >
          HarmiRecruit
        </p>
        <h1
          style={{
            margin: '0.55rem 0 0',
            fontSize: 'clamp(1.8rem, 4vw, 2.4rem)',
            fontFamily: '"Fraunces", Georgia, serif',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          AI Hiring Readiness Score
        </h1>
        <p style={{ opacity: 0.9, margin: '0.7rem auto 0', maxWidth: 480, lineHeight: 1.55 }}>
          8 questions · 2 minutes. Rate each area 1 (painful / manual) to 5 (ready / disciplined)
          and get your score out of 40 — plus the modules that close your gaps.
        </p>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem 0' }}>
        {QUESTIONS.map((q, i) => {
          const value = answers[q.key];
          return (
            <section
              key={q.key}
              style={{
                background: '#fff',
                borderRadius: 14,
                padding: '1.25rem 1.4rem 1.15rem',
                marginBottom: '0.9rem',
                border: `1px solid ${value ? TEAL_LIGHT : '#e2e8f0'}`,
                boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
                transition: 'border-color 160ms ease',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: '0.72rem',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  color: TEAL,
                }}
              >
                {i + 1} · {q.dimension}
              </p>
              <h2 style={{ margin: '0.45rem 0 0.9rem', fontSize: '1.08rem', fontWeight: 600 }}>
                {q.question}
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = value === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => pick(q.key, n)}
                      aria-pressed={active}
                      style={{
                        flex: 1,
                        padding: '0.6rem 0',
                        borderRadius: 10,
                        border: `1.5px solid ${active ? NAVY : '#cbd5e1'}`,
                        background: active ? NAVY : '#f8fafc',
                        color: active ? '#fff' : '#334155',
                        fontSize: '1rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 140ms ease',
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  marginTop: '0.55rem',
                  fontSize: '0.78rem',
                  color: '#64748b',
                }}
              >
                <span>1 · {q.low}</span>
                <span style={{ textAlign: 'right' }}>5 · {q.high}</span>
              </div>
            </section>
          );
        })}

        {/* Result — revealed once all 8 questions are answered */}
        <div ref={resultRef} style={{ scrollMarginTop: '1rem' }}>
          {complete && (
            <section
              style={{
                background: NAVY,
                color: '#fff',
                borderRadius: 16,
                padding: '1.6rem 1.5rem',
                marginTop: '1.6rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.72rem',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      color: TEAL_LIGHT,
                    }}
                  >
                    Your score
                  </p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '2.6rem', fontWeight: 700, lineHeight: 1 }}>
                    {total}
                    <span style={{ fontSize: '1.2rem', opacity: 0.7, fontWeight: 600 }}> / 40</span>
                  </p>
                </div>
                <div
                  style={{
                    background: tier.color,
                    color: '#fff',
                    borderRadius: 999,
                    padding: '0.4rem 1.1rem',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                  }}
                >
                  {tier.label}
                </div>
              </div>
              <p style={{ margin: '0.85rem 0 0', lineHeight: 1.55, opacity: 0.92, maxWidth: 560 }}>
                {tier.blurb}
              </p>

              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.1rem', flexWrap: 'wrap' }}>
                {TIERS.map((t) => (
                  <div
                    key={t.tier}
                    style={{
                      flex: '1 1 160px',
                      background: t.tier === tier.tier ? NAVY_MID : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${t.tier === tier.tier ? t.color : 'rgba(255,255,255,0.14)'}`,
                      borderRadius: 10,
                      padding: '0.6rem 0.8rem',
                    }}
                  >
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: t.color }}>
                      {t.range} · {t.label}
                    </p>
                  </div>
                ))}
              </div>

              <h3 style={{ margin: '1.5rem 0 0.2rem', fontSize: '1.05rem', fontWeight: 600 }}>
                Your 3 biggest gaps — and the modules that close them
              </h3>
              {gaps.map((g) => (
                <div
                  key={g.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                    flexWrap: 'wrap',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 10,
                    padding: '0.7rem 0.9rem',
                    marginTop: '0.55rem',
                  }}
                >
                  <span style={{ fontSize: '0.92rem' }}>
                    <strong>{g.dimension}</strong>
                    <span style={{ opacity: 0.7 }}> · scored {answers[g.key]}/5</span>
                  </span>
                  <span style={{ color: TEAL_LIGHT, fontWeight: 700, fontSize: '0.88rem' }}>
                    {g.module}
                  </span>
                </div>
              ))}
            </section>
          )}

          {complete && !submitted && (
            <section
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: '1.5rem',
                marginTop: '1rem',
                border: '1px solid #e2e8f0',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                Save your score & get a walkthrough of your gap modules
              </h3>
              <p style={{ margin: '0.4rem 0 1rem', color: '#64748b', fontSize: '0.92rem' }}>
                We’ll reach out with a tailored demo covering only the three modules above.
              </p>
              <form onSubmit={submit}>
                {/* Honeypot: bots fill every field; humans never see this one. */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  style={{ position: 'absolute', left: '-9999px' }}
                  aria-hidden="true"
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  <input
                    style={inputStyle}
                    placeholder="Organization name *"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required
                  />
                  <input
                    style={inputStyle}
                    placeholder="Your name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                  <input
                    style={inputStyle}
                    type="email"
                    placeholder="Work email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <input
                    style={inputStyle}
                    type="tel"
                    placeholder="Phone / WhatsApp"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                {error && (
                  <p style={{ color: CORAL, margin: '0.75rem 0 0', fontSize: '0.9rem' }}>{error}</p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    marginTop: '1rem',
                    background: TEAL,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 999,
                    padding: '0.7rem 1.8rem',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    cursor: submitting ? 'wait' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Saving…' : 'Save my readiness score'}
                </button>
              </form>
            </section>
          )}

          {submitted && (
            <section
              style={{
                background: '#ecfdf5',
                border: '1px solid #6ee7b7',
                borderRadius: 16,
                padding: '1.4rem 1.5rem',
                marginTop: '1rem',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#065f46' }}>
                Score saved — thank you!
              </h3>
              <p style={{ margin: '0.4rem 0 0', color: '#047857', fontSize: '0.95rem' }}>
                {orgName} scored {total}/40 ({tier.label}). Our team will follow up with a demo
                focused on your three gap modules.
              </p>
            </section>
          )}
        </div>

        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem', margin: '2.5rem 0 1rem' }}>
          Powered by HarmiRecruit
        </p>
      </main>

      {/* Sticky live score bar */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(6px)',
          borderTop: '1px solid #e2e8f0',
          padding: '0.7rem 1rem',
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <span style={{ fontSize: '0.85rem', color: '#64748b', whiteSpace: 'nowrap' }}>
            {answered}/8 answered
          </span>
          <div
            style={{
              flex: 1,
              height: 8,
              borderRadius: 999,
              background: '#e2e8f0',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(total / 40) * 100}%`,
                height: '100%',
                borderRadius: 999,
                background: complete ? tier.color : TEAL,
                transition: 'width 220ms ease, background 220ms ease',
              }}
            />
          </div>
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            {total} / 40
            {complete && (
              <span style={{ color: tier.color, marginLeft: '0.5rem' }}>{tier.label}</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
