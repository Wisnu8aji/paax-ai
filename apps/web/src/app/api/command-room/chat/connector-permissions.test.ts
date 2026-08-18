import { describe, expect, it } from "vitest";
import {
  allowedCommandRoomTools,
  canRetrieveProjectGraph,
  selectCommandRoomTools,
  type CommandRoomConnector,
} from "./connector-permissions";

describe("Command Room connector permissions", () => {
  it("fails closed for Home Chat even when legacy connectors are supplied", () => {
    const connectors: CommandRoomConnector[] = [];

    expect(allowedCommandRoomTools(connectors)).toEqual([]);
    expect(canRetrieveProjectGraph(connectors)).toBe(false);
    expect(selectCommandRoomTools(["rab"], "Tampilkan RAB dan jadwal proyek")).toEqual([]);
  });

  it("does not expose Work-only drawing tools in Chat", () => {
    const connectors: CommandRoomConnector[] = ["gambarKerja"];

    expect(allowedCommandRoomTools(connectors)).toEqual([]);
    expect(canRetrieveProjectGraph(connectors)).toBe(false);
  });

  it("keeps all Work-only tools outside the Chat registry", () => {
    expect(allowedCommandRoomTools(["rab", "jadwal"])).toEqual([]);
    expect(selectCommandRoomTools(["gambarKerja", "rab", "jadwal"], "Cari AHSP, export xlsx, dan simulasi")).toEqual([]);
  });
});
