export const COMMAND_COMPOSER_MIN_HEIGHT = 22;
export const COMMAND_COMPOSER_MAX_HEIGHT = 240;

export function clampComposerHeight(value: number): number {
  return Math.min(
    COMMAND_COMPOSER_MAX_HEIGHT,
    Math.max(COMMAND_COMPOSER_MIN_HEIGHT, value),
  );
}

export const COMMAND_CONNECTORS = [
  { id: 'gambarKerja', label: 'Gambar Kerja' },
  { id: 'rab', label: 'RAB' },
  { id: 'jadwal', label: 'Schedule' },
] as const;

export const COMMAND_MODEL_MENU_ROWS = [
  'model',
  'effort',
  'thinking',
  'reset',
] as const;

export const COMMAND_EFFORT_OPTIONS: readonly ReasoningEffort[] = ['high', 'max'];
export const COMMAND_THINKING_OPTIONS: readonly ThinkingMode[] = ['on', 'off'];
export const COMMAND_HEADER_ICON_SIZE = 32;

export interface CommandModelSettings {
  modelAlias: ModelAlias;
  reasoningEffort: ReasoningEffort;
  thinking: ThinkingMode;
}

export function getDefaultCommandModelSettings(): CommandModelSettings {
  return {
    modelAlias: DEFAULT_MODEL_ALIAS,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
    thinking: DEFAULT_THINKING,
  };
}
import {
  DEFAULT_MODEL_ALIAS,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_THINKING,
  type ModelAlias,
  type ReasoningEffort,
  type ThinkingMode,
} from '@/lib/paax-models';
