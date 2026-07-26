import { describe, expect, it } from 'vitest';

import { normalizeStatusMessage } from './status-bar';

describe('normalizeStatusMessage', () => {
  it.each([undefined, null, {}, 12])('returns a stable fallback for %p', (value) => {
    expect(normalizeStatusMessage(value)).toBe('Workspace ready');
  });

  it('preserves a non-empty status string', () => {
    expect(normalizeStatusMessage('Mission running')).toBe('Mission running');
  });
});
