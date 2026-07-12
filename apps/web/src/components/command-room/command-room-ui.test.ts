import { describe, expect, it } from 'vitest';

import {
  clampComposerHeight,
  COMMAND_CONNECTORS,
  COMMAND_EFFORT_OPTIONS,
  COMMAND_HEADER_ICON_SIZE,
  COMMAND_MODEL_MENU_ROWS,
  COMMAND_THINKING_OPTIONS,
  getDefaultCommandModelSettings,
} from './command-room-ui';
import { composerBadge } from '@/lib/paax-models';

describe('Command Room presentation contracts', () => {
  it('clamps the adjustable composer between 64 and 240 pixels', () => {
    expect(clampComposerHeight(20)).toBe(64);
    expect(clampComposerHeight(180)).toBe(180);
    expect(clampComposerHeight(500)).toBe(240);
  });

  it('keeps all project connectors visible in the intended order', () => {
    expect(COMMAND_CONNECTORS.map((connector) => connector.id)).toEqual([
      'gambarKerja',
      'rab',
      'jadwal',
    ]);
  });

  it('does not expose a speed row in the model menu', () => {
    expect(COMMAND_MODEL_MENU_ROWS).toEqual([
      'model',
      'effort',
      'thinking',
      'reset',
    ]);
    expect(COMMAND_MODEL_MENU_ROWS).not.toContain('speed');
  });

  it('resets the model menu to Lucent with High effort and Thinking On', () => {
    expect(getDefaultCommandModelSettings()).toEqual({
      modelAlias: 'lucent',
      reasoningEffort: 'high',
      thinking: 'on',
    });
  });

  it('keeps compact submenu choices and uniform top-bar icon sizing', () => {
    expect(COMMAND_EFFORT_OPTIONS).toEqual(['high', 'max']);
    expect(COMMAND_THINKING_OPTIONS).toEqual(['on', 'off']);
    expect(COMMAND_HEADER_ICON_SIZE).toBe(32);
  });

  it('uses the active thinking mode label in the composer badge', () => {
    expect(composerBadge('lucent', 'on', 'high')).toBe('Lucent · Ultra · High');
    expect(composerBadge('lucent', 'off', 'max')).toBe('Lucent · Standard · Max');
  });
});
