import { RunInput } from '@cvc/schemas';
import { describe, expect, it } from 'vitest';
import { inputHash } from './hash';

const base = { companyName: 'ร้านกาแฟสมมติ', noticeVersion: '2026-10-21' };

describe('inputHash campaign fields', () => {
  it('hashes an objective or creator count left to the agent differently from the explicit default', async () => {
    const explicit = await inputHash(RunInput.parse({ ...base, campaign: { objective: 'conversion', nCreators: 5 } }));
    const noObjective = await inputHash(RunInput.parse({ ...base, campaign: { objective: null, nCreators: 5 } }));
    const noCount = await inputHash(RunInput.parse({ ...base, campaign: { objective: 'conversion', nCreators: null } }));
    expect(new Set([explicit, noObjective, noCount]).size).toBe(3);
  });

  it('treats an omitted campaign (old clients) as the explicit default', async () => {
    const omitted = await inputHash(RunInput.parse(base));
    const explicit = await inputHash(RunInput.parse({ ...base, campaign: { objective: 'conversion', budgetTHB: null, nCreators: 5, preferredTiers: [] } }));
    expect(omitted).toBe(explicit);
  });
});
