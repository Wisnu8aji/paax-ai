export const COMMAND_ROOM_CONNECTORS = ["gambarKerja", "rab", "jadwal"] as const;

export type CommandRoomConnector = (typeof COMMAND_ROOM_CONNECTORS)[number];

const TOOL_NAMES_BY_CONNECTOR: Record<CommandRoomConnector, readonly string[]> = {
  // Drawing Intelligence is DEM/PCKM-only. Legacy TKG and RAB drafts never
  // become part of this connector's context.
  gambarKerja: ["query_project_graph"],
  rab: ["lookup_ahsp", "query_rab", "export_rab_xlsx"],
  jadwal: ["query_schedule", "run_scenario"],
};

export function allowedCommandRoomTools(connectors: readonly CommandRoomConnector[]): string[] {
  return [...new Set(connectors.flatMap((connector) => TOOL_NAMES_BY_CONNECTOR[connector]))];
}

export function canRetrieveProjectGraph(connectors: readonly CommandRoomConnector[]): boolean {
  return connectors.includes("gambarKerja");
}

export function selectCommandRoomTools(
  connectors: readonly CommandRoomConnector[],
  message: string,
): string[] {
  const normalized = message.toLowerCase();
  const selected: string[] = [];

  if (connectors.includes("gambarKerja") && /gambar|drawing|dem|pckm|kolom|balok|pintu|jendela|denah|detail|lantai|sheet|halaman/.test(normalized)) {
    selected.push("query_project_graph");
  }
  if (connectors.includes("rab") && /rab|biaya|harga|nilai|ahsp|kode|export|unduh|xlsx/.test(normalized)) {
    if (/ahsp|kode/.test(normalized)) selected.push("lookup_ahsp");
    else if (/export|unduh|xlsx/.test(normalized)) selected.push("export_rab_xlsx");
    else selected.push("query_rab");
  }
  if (connectors.includes("jadwal") && /jadwal|schedule|durasi|waktu|s[- ]?curve|simulasi|percepatan|lembur|crew|paralel/.test(normalized)) {
    selected.push(/simulasi|percepatan|lembur|crew|paralel/.test(normalized) ? "run_scenario" : "query_schedule");
  }
  return [...new Set(selected)];
}

export function hasProjectConnector(connectors: readonly CommandRoomConnector[]): boolean {
  return connectors.length > 0;
}
