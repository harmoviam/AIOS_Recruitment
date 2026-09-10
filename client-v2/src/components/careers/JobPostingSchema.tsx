import type { PublicJob, CareersTenant } from '../../types';

export function buildJobPostingJsonLd(job: PublicJob, tenant: CareersTenant): object {
  const salary = parseSalary(job.salary);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description || `${job.title} at ${tenant.name}`,
    hiringOrganization: {
      '@type': 'Organization',
      name: tenant.name,
      sameAs: baseUrl ? `${baseUrl}/careers/${tenant.slug}` : undefined,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.city || undefined,
        addressRegion: job.state || undefined,
        addressCountry: 'IN',
      },
    },
    ...(job.salary ? { baseSalary: salary } : {}),
    ...(job.industry ? { industry: job.industry } : {}),
    ...(job.required_skills && job.required_skills.length > 0
      ? { skills: job.required_skills }
      : {}),
    ...(job.job_type ? { employmentType: mapEmploymentType(job.job_type) } : {}),
    datePosted: job.created_at,
    validThrough: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ...(job.open_positions ? { numberOfPositions: job.open_positions } : {}),
  };
}

function parseSalary(salary: string | null): object | undefined {
  if (!salary) return undefined;
  const match = salary.match(/([\d,]+)\s*(?:-|to)?\s*([\d,]+)?\s*(K|L)?/i);
  if (!match) return undefined;
  const minVal = parseInt(match[1].replace(/,/g, ''), 10);
  const maxVal = match[2] ? parseInt(match[2].replace(/,/g, ''), 10) : undefined;
  const unit = match[3]?.toUpperCase() === 'L' ? 'INR' : 'INR';
  return {
    '@type': 'MonetaryAmount',
    currency: unit,
    ...(maxVal
      ? { value: { '@type': 'QuantitativeValue', minValue: minVal, maxValue: maxVal } }
      : { value: { '@type': 'QuantitativeValue', value: minVal } }),
  };
}

function mapEmploymentType(type: string): string {
  const map: Record<string, string> = {
    full_time: 'FULL_TIME',
    part_time: 'PART_TIME',
    contract: 'CONTRACTUAL',
    freelance: 'CONTRACTOR',
    internship: 'INTERNSHIP',
    temporary: 'TEMPORARY',
  };
  return map[type.toLowerCase()] || 'FULL_TIME';
}
