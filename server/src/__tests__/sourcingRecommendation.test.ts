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

  it('returns the requested number of distinct random variants per channel', async () => {
    const pack = await templateContentGeneratorService.generate(
      {
        cityName: 'Mohali',
        roleName: 'International Voice Process',
        hiringCount: 50,
        salaryMax: 25000,
        experienceLabel: 'Fresher',
        variantCount: 3,
      },
      { tenantId: 1 }
    );
    for (const item of pack.items) {
      expect(item.variants).toBeDefined();
      expect(item.variants!.length).toBeGreaterThanOrEqual(2);
      expect(item.variants!.length).toBeLessThanOrEqual(3);
      expect(new Set(item.variants).size).toBe(item.variants!.length);
      expect(item.body).toBe(item.variants![0]);
    }
    const facebook = pack.items.find((i) => i.channel === 'FACEBOOK');
    expect(facebook?.variants).toHaveLength(3);
  });

  it('defaults to a single variant when variantCount is omitted', async () => {
    const pack = await templateContentGeneratorService.generate(
      { cityName: 'Mohali', roleName: 'Voice Process', hiringCount: 10 },
      { tenantId: 1 }
    );
    for (const item of pack.items) {
      expect(item.variants).toHaveLength(1);
      expect(item.body).toBe(item.variants![0]);
    }
  });
});
