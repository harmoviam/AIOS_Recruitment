import type { JobRecommendationDto } from '../dto/jobRecommendation.js';
import type { JobMatchProfile } from '../dto/jobRecommendation.js';

/** Maps internal job + score data to the public recommendation DTO. */
export function toJobRecommendationDto(
  job: JobMatchProfile,
  distance: number | null,
  matchScore: number,
  reason: string,
  experience: string | null
): JobRecommendationDto {
  return {
    id: job.id,
    title: job.title,
    company: job.client,
    distance,
    matchScore,
    salary: job.salary,
    reason,
    experience,
    qualification: job.requiredQualification,
    languages: job.requiredLanguages,
    jobType: job.jobType,
    shift: job.shift,
    city: job.city,
    description: job.description,
  };
}

export function matchScoreBarColor(score: number): 'green' | 'yellow' | 'orange' | 'red' {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}
