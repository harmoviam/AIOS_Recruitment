import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { WalkthroughGuide, WalkthroughStep } from '../data/walkthroughs';
import { sanitizeWalkthroughHighlights, showDemoCredentials } from '../utils/demoMode';

function MockScene({ step, guide }: { step: WalkthroughStep; guide: WalkthroughGuide }) {
  const accent = guide.accent;
  const highlights = sanitizeWalkthroughHighlights(step.highlights);

  if (step.scene === 'login') {
    return (
      <div className="wt-mock wt-mock-login">
        <div className="wt-mock-login-left" style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 65%, #000))` }}>
          <span className="wt-mock-icon">{guide.icon}</span>
          <span className="wt-mock-org">{guide.orgExample || 'AIOS Platform'}</span>
        </div>
        <div className="wt-mock-login-right">
          <div className="wt-mock-field wt-mock-shimmer" />
          <div className="wt-mock-field wt-mock-shimmer" style={{ animationDelay: '0.2s' }} />
          <div className="wt-mock-btn" style={{ background: accent }}>Sign In</div>
          {highlights?.map((h) => (
            <div key={h} className="wt-mock-highlight">{h}</div>
          ))}
        </div>
      </div>
    );
  }

  if (step.scene === 'dashboard') {
    return (
      <div className="wt-mock wt-mock-dash">
        <div className="wt-mock-sidebar" style={{ borderColor: accent }}>
          <div className="wt-mock-logo" style={{ background: accent }}>{guide.icon}</div>
          {['Dashboard', 'Candidates', 'Recruiters'].map((l) => (
            <div key={l} className="wt-mock-nav-item">{l}</div>
          ))}
        </div>
        <div className="wt-mock-main">
          <div className="wt-mock-kpi-row">
            {(step.mockKpis ?? []).map((k) => (
              <div key={k.label} className="wt-mock-kpi">
                <span className="wt-mock-kpi-val">{k.value}</span>
                <span className="wt-mock-kpi-lbl">{k.label}</span>
              </div>
            ))}
          </div>
          <div className="wt-mock-chart wt-mock-shimmer" />
        </div>
      </div>
    );
  }

  if (step.scene === 'nav') {
    return (
      <div className="wt-mock wt-mock-nav-scene">
        {(step.mockNav ?? []).map((item, i) => (
          <div
            key={item}
            className={`wt-mock-nav-chip${i === 0 ? ' active' : ''}`}
            style={i === 0 ? { borderColor: accent, color: accent } : undefined}
          >
            {item}
          </div>
        ))}
      </div>
    );
  }

  if (step.scene === 'action') {
    return (
      <div className="wt-mock wt-mock-table">
        {(step.mockRows ?? []).map((row, i) => (
          <div key={row} className="wt-mock-row" style={{ animationDelay: `${i * 0.15}s` }}>
            <span className="wt-mock-row-dot" style={{ background: accent }} />
            {row}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="wt-mock wt-mock-success">
      <div className="wt-mock-success-ring" style={{ borderColor: accent }}>
        <span>{guide.icon}</span>
      </div>
      <strong>{guide.title}</strong>
      {step.highlights?.map((h) => (
        <span key={h} className="wt-mock-tag" style={{ background: `color-mix(in srgb, ${accent} 12%, white)` }}>{h}</span>
      ))}
    </div>
  );
}

interface WalkthroughPlayerProps {
  guide: WalkthroughGuide;
  backTo?: string;
  backLabel?: string;
}

export default function WalkthroughPlayer({ guide, backTo, backLabel = '← Back to sign in' }: WalkthroughPlayerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const tickRef = useRef<number | null>(null);
  const step = guide.steps[stepIndex];
  const durationMs = step.durationSec * 1000;

  const goTo = useCallback((idx: number) => {
    setStepIndex(Math.max(0, Math.min(guide.steps.length - 1, idx)));
    setProgress(0);
  }, [guide.steps.length]);

  useEffect(() => {
    if (!playing) return;
    const start = Date.now();
    tickRef.current = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(pct);
      if (elapsed >= durationMs) {
        if (stepIndex < guide.steps.length - 1) {
          setStepIndex((i) => i + 1);
          setProgress(0);
        } else {
          setPlaying(false);
          setProgress(100);
        }
      }
    }, 50);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [playing, stepIndex, durationMs, guide.steps.length]);

  useEffect(() => {
    setProgress(0);
  }, [stepIndex]);

  const togglePlay = () => {
    if (!playing && stepIndex === guide.steps.length - 1 && progress >= 100) {
      setStepIndex(0);
      setProgress(0);
    }
    setPlaying((p) => !p);
  };

  const hasEmbed = !!guide.videoUrl;

  return (
    <div className="wt-player" style={{ '--wt-accent': guide.accent } as React.CSSProperties}>
      <div className="wt-player-header">
        <div>
          <span className="wt-role-badge" style={{ background: guide.accent }}>{guide.icon} {guide.title}</span>
          <p className="wt-player-sub">{guide.subtitle}</p>
        </div>
        {backTo && <Link to={backTo} className="link-button">{backLabel}</Link>}
      </div>

      <div className="wt-screen">
        {hasEmbed ? (
          <iframe
            className="wt-embed"
            src={guide.videoUrl}
            title={`${guide.title} walkthrough`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <>
            <div className={`wt-scene wt-scene-${step.scene}`} key={stepIndex}>
              <MockScene step={step} guide={guide} />
            </div>
            <div className="wt-caption">
              <strong>{step.title}</strong>
              <p>{step.narration}</p>
            </div>
          </>
        )}
      </div>

      {!hasEmbed && (
        <>
          <div className="wt-controls">
            <button type="button" className="wt-play-btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? '⏸' : stepIndex === guide.steps.length - 1 && progress >= 100 ? '↺' : '▶'}
            </button>
            <div className="wt-progress-wrap">
              <div className="wt-progress-bar" style={{ width: `${progress}%`, background: guide.accent }} />
            </div>
            <span className="wt-step-counter">{stepIndex + 1} / {guide.steps.length}</span>
          </div>

          <div className="wt-dots">
            {guide.steps.map((s, i) => (
              <button
                key={s.title}
                type="button"
                className={`wt-dot${i === stepIndex ? ' active' : ''}${i < stepIndex ? ' done' : ''}`}
                style={i === stepIndex ? { background: guide.accent } : undefined}
                onClick={() => { goTo(i); setPlaying(false); }}
                aria-label={`Step ${i + 1}: ${s.title}`}
              />
            ))}
          </div>
        </>
      )}

      <div className="wt-demo-card">
        <strong>Try it yourself</strong>
        <div className="wt-demo-grid">
          <div><span className="text-muted">Login URL</span><code>{guide.loginUrl}</code></div>
          {showDemoCredentials && (
            <>
              <div><span className="text-muted">Email</span><code>{guide.demoEmail}</code></div>
              <div><span className="text-muted">Password</span><code>{guide.demoPassword}</code></div>
            </>
          )}
        </div>
        <Link to={guide.loginUrl} className="button-pill button-primary btn-sm" style={{ marginTop: '0.75rem' }}>
          Open login →
        </Link>
      </div>
    </div>
  );
}
