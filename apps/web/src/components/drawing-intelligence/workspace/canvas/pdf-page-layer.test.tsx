import { describe, expect, it } from 'vitest';

import { shouldRefreshArtifactUrl } from './pdf-page-layer';

describe('PDF artifact URL refresh', () => {
  it('refreshes before expiry without persisting the signed URL', () => {
    expect(shouldRefreshArtifactUrl('2026-07-26T12:00:30.000Z', new Date('2026-07-26T12:00:00.000Z'))).toBe(true);
    expect(shouldRefreshArtifactUrl('2026-07-26T12:10:00.000Z', new Date('2026-07-26T12:00:00.000Z'))).toBe(false);
  });
});
