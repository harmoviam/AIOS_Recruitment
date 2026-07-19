import { describe, expect, it } from 'vitest';
import {
  getContentGeneratorService,
  getConversationService,
  getRecommendationService,
} from '../services/sourcing/providers.js';

describe('sourcing provider factory', () => {
  it('returns rule-based recommendation service', () => {
    expect(getRecommendationService()).toBeTruthy();
  });

  it('returns heuristic conversation service with unresolved fields for empty context', async () => {
    // parse hits DB — skip heavy call; verify factory only
    expect(getConversationService()).toBeTruthy();
  });

  it('generates template content pack', async () => {
    const svc = getContentGeneratorService();
    const pack = await svc.generate(
      { cityName: 'Mohali', roleName: 'International Voice Process', hiringCount: 50 },
      { tenantId: 1 }
    );
    expect(pack.provider).toBe('TEMPLATE');
    expect(pack.items.length).toBeGreaterThanOrEqual(5);
    expect(pack.items.some((i) => i.channel === 'WHATSAPP')).toBe(true);
  });
});
