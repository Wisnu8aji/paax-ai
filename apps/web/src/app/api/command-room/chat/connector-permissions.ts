export const COMMAND_ROOM_CONNECTORS = ["gambarKerja", "rab", "jadwal"] as const;

export type CommandRoomConnector = (typeof COMMAND_ROOM_CONNECTORS)[number];

/**
 * Home Chat is intentionally fail-closed. These connector names are retained
 * only so older clients can submit a request without a schema break; they are
 * not an authorization mechanism. Work owns the project tools and passes an
 * explicit Work registry from its own route.
 */
export function allowedCommandRoomTools(connectors: readonly CommandRoomConnector[]): string[] {
  void connectors;
  return [];
}

export function canRetrieveProjectGraph(connectors: readonly CommandRoomConnector[]): boolean {
  void connectors;
  return false;
}

export function selectCommandRoomTools(
  connectors: readonly CommandRoomConnector[],
  message: string,
): string[] {
  void connectors;
  void message;
  // Do not infer capability from user wording. Chat tool authorization is
  // owned by the Chat registry and Work-only tools never enter this function.
  return [];
}

export function hasProjectConnector(connectors: readonly CommandRoomConnector[]): boolean {
  return connectors.length > 0;
}
