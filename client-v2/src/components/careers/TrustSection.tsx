import { IconBriefcase, IconSearch, IconUsers } from './icons';

export interface TrustStat {
  num: string;
  label: string;
}

interface TrustSectionProps {
  stats: TrustStat[];
}

/** Dark premium strip with live, non-fabricated stats. */
export default function TrustSection({ stats }: TrustSectionProps) {
  return (
    <section className="careers-container" id="careers-about" aria-label="Why apply through us">
      <div className="careers-trust">
        <h2 className="careers-trust-head">Backed by a real team, not just a job board</h2>
        <p className="careers-trust-sub">
          Every role on this page is managed and screened by recruiters who know the market. Applications go straight
          to verified businesses — no spam, no bait roles, no fees.
        </p>
        <div className="careers-trust-stats">
          {stats.map((s) => (
            <div key={s.num + s.label} className="careers-trust-stat">
              <div className="num">{s.num}</div>
              <div className="lbl">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    icon: IconSearch,
    title: 'Find your role',
    text: 'Search by skill, city or role type. Filter by salary, experience and work mode.',
  },
  {
    icon: IconBriefcase,
    title: 'Apply in minutes',
    text: 'A simple multi-step form. Add your resume once and reuse your profile for future roles.',
  },
  {
    icon: IconUsers,
    title: 'Get the call',
    text: 'Recruiters review your profile and reach out directly if there’s a match.',
  },
];

/** Three-step "how it works" strip. Uses real, non-fabricated copy. */
export function HowItWorks() {
  return (
    <section className="careers-section" aria-label="How it works">
      <div className="careers-container">
        <div className="careers-section-head">
          <div>
            <span className="careers-eyebrow">How it works</span>
            <h2 className="careers-title-lg">From search to your first call</h2>
          </div>
        </div>
        <div className="careers-how">
          {STEPS.map((step, i) => (
            <div className="careers-how-step" key={step.title}>
              <span className="careers-how-icon">
                <step.icon />
              </span>
              <div className="careers-how-num">0{i + 1}</div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}