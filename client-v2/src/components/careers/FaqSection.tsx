import { useState } from 'react';
import { IconPlus } from './icons';

const FAQS = [
  {
    q: 'Is there any fee to apply?',
    a: 'No. Applying through this careers page is completely free — for every role, every time. We never charge job seekers, now or later.',
  },
  {
    q: 'How do I apply for a role?',
    a: 'Open the role, tap "Apply", and complete the short multi-step form — your details, experience and resume. Most applications take 2–4 minutes. You can leave the form part-way and your profile stays saved.',
  },
  {
    q: 'What if I don’t have a resume ready?',
    a: 'That’s fine. Fill in the form fields and upload a resume only if you have one. Roles that require a resume mark it on the apply screen.',
  },
  {
    q: 'How quickly will I hear back?',
    a: 'Recruiters review applications as they come in and reach out directly to shortlisted candidates. Timelines vary by role and requirement volume.',
  },
  {
    q: 'Which cities and states are covered?',
    a: 'We work with roles across India — on-site, hybrid and remote. The "Jobs by city" section and filters on this page reflect the live roles available right now.',
  },
  {
    q: 'Is my information kept private?',
    a: 'Yes. Your details are shared only with the recruiting team responsible for the roles you apply to, and are used solely for recruitment and matching.',
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="careers-section" id="careers-faq" aria-label="Frequently asked questions">
      <div className="careers-container">
        <div className="careers-section-head">
          <div>
            <span className="careers-eyebrow">FAQ</span>
            <h2 className="careers-title-lg">Questions, answered</h2>
          </div>
        </div>
        <div className="careers-faq">
          {FAQS.map((faq, i) => {
            const open = openIndex === i;
            return (
              <div key={faq.q} className={`careers-faq-item${open ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="careers-faq-q"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : i)}
                >
                  {faq.q}
                  <IconPlus width={18} height={18} />
                </button>
                <div className="careers-faq-a">{faq.a}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}