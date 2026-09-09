import { Link } from 'react-router-dom';
import type { PublicJob } from '../../types';
import {
  employmentType,
  formatExperience,
  formatOpenings,
  formatPosted,
  jobCity,
  parseSalary,
  workMode,
} from './careers';
import { IconArrowRight, IconBriefcase, IconCoins, IconPin, IconRocket } from './icons';

interface JobCardProps {
  job: PublicJob;
  tenantSlug: string;
}

/** Premium job card linking to the job detail page. */
export default function JobCard({ job, tenantSlug }: JobCardProps) {
  const salary = parseSalary(job.salary);
  const experience = formatExperience(job.min_experience, job.max_experience);
  const openings = formatOpenings(job.open_positions);
  const type = employmentType(job);
  const mode = workMode(job);
  const location = jobCity(job);
  const company = job.client || null;
  const skills = (Array.isArray(job.required_skills) ? job.required_skills : []).slice(0, 4);

  return (
    <Link className="careers-job-card" to={`/careers/${tenantSlug}/jobs/${job.id}`}>
      <div className="careers-job-top">
        <span className="careers-job-emblem" aria-hidden="true">
          {job.title.trim().charAt(0).toUpperCase() || 'J'}
        </span>
        <div className="careers-job-title-wrap">
          <h3 className="careers-job-title">{job.title}</h3>
          {company && <div className="careers-job-company">{company}</div>}
        </div>
      </div>

      <div className="careers-job-meta">
        {location && (
          <span>
            <IconPin /> {location}
          </span>
        )}
        {(type || mode) && (
          <span>
            <IconBriefcase /> {type || mode}
          </span>
        )}
        {experience && (
          <span>
            <IconRocket /> {experience}
          </span>
        )}
        {salary.label && (
          <span>
            <IconCoins /> {salary.label}
          </span>
        )}
      </div>

      {skills.length > 0 && (
        <div className="careers-job-skills" aria-label="Key skills">
          {skills.map((s) => (
            <span key={s} className="careers-skill-tag">
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="careers-job-foot">
        {openings && <span className="careers-openings">{openings}</span>}
        {!openings && <span />}
        <span className="posted">{formatPosted(job.created_at)}</span>
        <span className="careers-job-arrow" aria-hidden="true">
          <IconArrowRight />
        </span>
      </div>
    </Link>
  );
}