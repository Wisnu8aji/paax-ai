import { describe, expect, it } from 'vitest';

import { normalizeStatusMessage, statusDotColor } from './status-bar';

describe('normalizeStatusMessage', () => {
  it.each([undefined, null, {}, 12])('returns a stable fallback for %p', (value: unknown) => {
    expect(normalizeStatusMessage(value)).toBe('Workspace ready');
  });

  it('preserves a non-empty status string', () => {
    expect(normalizeStatusMessage('Mission running')).toBe('Mission running');
  });
});

describe('statusDotColor', () => {
  it.each([undefined, null, {}, 404])('never throws on invalid message input %p', (value: unknown) => {
    expect(() => statusDotColor(value)).not.toThrow();
    expect(statusDotColor(value)).toBe('var(--di-info)');
  });

  it('returns correct color tokens for progress, ok, and fail states', () => {
    expect(statusDotColor('Uploading files', true)).toBe('var(--di-accent)');
    expect(statusDotColor('Analysis complete')).toBe('var(--di-ok)');
    expect(statusDotColor('Job failed')).toBe('var(--di-err)');
  });
});
