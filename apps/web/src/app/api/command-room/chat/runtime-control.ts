type TurnControl = {
  stopped: boolean;
  steerMessages: string[];
};

const controls = new Map<string, TurnControl>();

function control(turnId: string): TurnControl {
  const existing = controls.get(turnId);
  if (existing) return existing;
  const created: TurnControl = { stopped: false, steerMessages: [] };
  controls.set(turnId, created);
  return created;
}

export function stopTurn(turnId: string): void {
  control(turnId).stopped = true;
}

export function isTurnStopped(turnId: string): boolean {
  return controls.get(turnId)?.stopped === true;
}

export function steerTurn(turnId: string, message: string): void {
  const trimmed = message.trim();
  if (!trimmed) return;
  control(turnId).steerMessages.push(trimmed.slice(0, 8_000));
}

export function takeSteerMessages(turnId: string): string[] {
  const current = controls.get(turnId);
  if (!current) return [];
  const messages = [...current.steerMessages];
  current.steerMessages = [];
  return messages;
}

export function clearTurnControl(turnId: string): void {
  controls.delete(turnId);
}
