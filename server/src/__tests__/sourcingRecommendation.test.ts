import { describe, expect, it } from 'vitest';
import { templateContentGeneratorService } from '../services/sourcing/content/templateContentGeneratorService.js';

describe('template content generator', () => {
  it('includes facebook and calling script', async () => {
    const pack = await templateContentGeneratorService.generate(
      {
        cityName: 'Mohali',
        roleName: 'International Voice Process',
        hiringCount: 50,
        salaryMax: 25000,
        experienceLabel: 'Fresher',
      },
      { tenantId: 1 }
    );
    expect(pack.items.map((i) => i.channel)).toEqual(
      expect.arrayContaining(['FACEBOOK', 'WHATSAPP', 'LINKEDIN', 'CALLING_SCRIPT'])
    );
  });
});
