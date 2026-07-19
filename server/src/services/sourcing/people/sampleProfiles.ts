import type { PeopleSearchFilters, PersonProfile } from '../../../types/sourcing.js';

/**
 * Canned Indian-market profiles served in simulated mode (no PDL_API_KEY),
 * so development and demos never spend PDL credits.
 */
const SAMPLE_PROFILES: PersonProfile[] = [
  {
    id: 'sim-001',
    fullName: 'Aarav Sharma',
    jobTitle: 'Senior React Developer',
    company: 'Infowiz Software Solutions',
    location: 'Mohali, Punjab, India',
    skills: ['react', 'typescript', 'redux', 'node.js', 'graphql'],
    experienceYears: 6,
    linkedinUrl: 'https://www.linkedin.com/in/sample-aarav-sharma',
  },
  {
    id: 'sim-002',
    fullName: 'Priya Verma',
    jobTitle: 'Full Stack Engineer',
    company: 'Net Solutions',
    location: 'Chandigarh, India',
    skills: ['react', 'node.js', 'mongodb', 'aws', 'javascript'],
    experienceYears: 5,
    linkedinUrl: 'https://www.linkedin.com/in/sample-priya-verma',
  },
  {
    id: 'sim-003',
    fullName: 'Karanveer Singh',
    jobTitle: 'Frontend Developer',
    company: 'Chicmic Studios',
    location: 'Mohali, Punjab, India',
    skills: ['react', 'javascript', 'css', 'next.js'],
    experienceYears: 3,
    linkedinUrl: 'https://www.linkedin.com/in/sample-karanveer-singh',
  },
  {
    id: 'sim-004',
    fullName: 'Sneha Gupta',
    jobTitle: 'Customer Support Executive',
    company: 'Teleperformance',
    location: 'Mohali, Punjab, India',
    skills: ['customer support', 'voice process', 'crm', 'english'],
    experienceYears: 2,
    linkedinUrl: 'https://www.linkedin.com/in/sample-sneha-gupta',
  },
  {
    id: 'sim-005',
    fullName: 'Rohit Malhotra',
    jobTitle: 'Java Backend Developer',
    company: 'Tech Mahindra',
    location: 'Chandigarh, India',
    skills: ['java', 'spring boot', 'sql', 'microservices'],
    experienceYears: 7,
    linkedinUrl: 'https://www.linkedin.com/in/sample-rohit-malhotra',
  },
  {
    id: 'sim-006',
    fullName: 'Ananya Joshi',
    jobTitle: 'Python Data Engineer',
    company: 'Zscaler',
    location: 'Sahibzada Ajit Singh Nagar, Punjab, India',
    skills: ['python', 'sql', 'airflow', 'aws'],
    experienceYears: 4,
    linkedinUrl: 'https://www.linkedin.com/in/sample-ananya-joshi',
  },
  {
    id: 'sim-007',
    fullName: 'Manpreet Kaur',
    jobTitle: 'Voice Process Associate',
    company: 'Concentrix',
    location: 'Mohali, Punjab, India',
    skills: ['voice process', 'customer support', 'hindi', 'english'],
    experienceYears: 1,
    linkedinUrl: 'https://www.linkedin.com/in/sample-manpreet-kaur',
  },
  {
    id: 'sim-008',
    fullName: 'Vikram Nair',
    jobTitle: 'DevOps Engineer',
    company: 'Wipro',
    location: 'Bengaluru, Karnataka, India',
    skills: ['devops', 'kubernetes', 'docker', 'aws', 'terraform'],
    experienceYears: 8,
    linkedinUrl: 'https://www.linkedin.com/in/sample-vikram-nair',
  },
  {
    id: 'sim-009',
    fullName: 'Ishita Bansal',
    jobTitle: 'Junior React Developer',
    company: 'Grazitti Interactive',
    location: 'Panchkula, Haryana, India',
    skills: ['react', 'javascript', 'html', 'css'],
    experienceYears: 1,
    linkedinUrl: 'https://www.linkedin.com/in/sample-ishita-bansal',
  },
  {
    id: 'sim-010',
    fullName: 'Arjun Mehta',
    jobTitle: 'Node.js Developer',
    company: 'Signity Solutions',
    location: 'Mohali, Punjab, India',
    skills: ['node.js', 'express', 'postgresql', 'typescript'],
    experienceYears: 4,
    linkedinUrl: 'https://www.linkedin.com/in/sample-arjun-mehta',
  },
];

/** Light filtering so simulated results feel responsive to the prompt. */
export function samplePeople(filters: PeopleSearchFilters, size: number): PersonProfile[] {
  const skills = (filters.skills || []).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const city = filters.city?.trim().toLowerCase();
  const minYears = filters.minExperienceYears;

  let matches = SAMPLE_PROFILES.filter((p) => {
    if (skills.length && !skills.some((s) => p.skills.includes(s))) return false;
    if (
      typeof minYears === 'number' &&
      p.experienceYears !== null &&
      p.experienceYears < minYears
    ) {
      return false;
    }
    return true;
  });

  if (city) {
    const inCity = matches.filter((p) => p.location?.toLowerCase().includes(city));
    if (inCity.length) matches = inCity;
  }
  if (!matches.length) matches = SAMPLE_PROFILES;

  return matches.slice(0, size);
}
