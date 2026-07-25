import { describe, expect, it } from "vitest";
import {
  allowedCommandRoomTools,
  canRetrieveProjectGraph,
  selectCommandRoomTools,
  type CommandRoomConnector,
} from "./connector-permissions";

describe("Command Room connector permissions", () => {
  it("exposes no tools or project retrieval without an explicit connector", () => {
    const connectors: CommandRoomConnector[] = [];

    expect(allowedCommandRoomTools(connectors)).toEqual([]);
    expect(canRetrieveProjectGraph(connectors)).toBe(false);
  });

  it("keeps Drawing Intelligence limited to DEM/PCKM graph retrieval", () => {
    const connectors: CommandRoomConnector[] = ["gambarKerja"];

    expect(allowedCommandRoomTools(connectors)).toEqual(["query_project_graph"]);
    expect(canRetrieveProjectGraph(connectors)).toBe(true);
  });

  it("keeps RAB and Schedule tool scopes independent", () => {
    expect(allowedCommandRoomTools(["rab"])).toEqual([
      "lookup_ahsp",
      "query_rab",
      "export_rab_xlsx",
    ]);
    expect(allowedCommandRoomTools(["jadwal"])).toEqual([
      "query_schedule",
      "run_scenario",
    ]);
  });

  it("does not expose an AHSP or scenario tool unless the current request needs it", () => {
    expect(selectCommandRoomTools(["rab"], "Tampilkan snapshot RAB proyek ini")).toEqual(["query_rab"]);
    expect(selectCommandRoomTools(["rab"], "Cari kode AHSP untuk beton mutu K-250")).toEqual(["lookup_ahsp"]);
    expect(selectCommandRoomTools(["jadwal"], "Tampilkan jadwal proyek ini")).toEqual(["query_schedule"]);
    expect(selectCommandRoomTools(["jadwal"], "Buat simulasi percepatan jadwal dengan lembur")).toEqual(["run_scenario"]);
  });
});
