import { describe, expect, it } from "vitest";

import {
  buildEngineeringChatPrompt,
  fallbackEngineeringAnswer,
  readEngineeringChatResponse,
  type EngineeringChatEngineStatus,
} from "./engineering-chat";

const onlineEngine: EngineeringChatEngineStatus = {
  online: true,
  url: "http://localhost:8081",
  health: {
    status: "ok",
    version: "0.6.0",
    ahsp_items: 4,
    regions: ["jateng", "semarang"],
  },
};

describe("engineering chat helpers", () => {
  it("builds a prompt with engine status and no-final-calculation guardrails", () => {
    const prompt = buildEngineeringChatPrompt({
      message: "jelaskan RAB proyek ini",
      engine: onlineEngine,
      projectId: "p-1",
    });

    expect(prompt).toContain("Engineering Chat PAAX");
    expect(prompt).toContain("Untuk pertanyaan umum atau sapaan singkat");
    expect(prompt).toContain("jangan membawa topik RAB");
    expect(prompt).toContain("http://localhost:8081");
    expect(prompt).toContain("jateng, semarang");
    expect(prompt).toContain("jangan menghitung angka final");
    expect(prompt).toContain("jelaskan RAB proyek ini");
  });

  it("wraps supplied project context as data inside explicit delimiters", () => {
    const projectContext = "TKG SCRIPT: [S05-EL-001] ELEMEN | K1 | as B/1";
    const prompt = buildEngineeringChatPrompt({
      message: "dari mana volume K1?",
      engine: onlineEngine,
      projectId: "p-1",
      projectContext,
    });

    expect(prompt).toContain("<<<KONTEKS_PROYEK_MULAI>>>");
    expect(prompt).toContain(projectContext);
    expect(prompt).toContain("<<<KONTEKS_PROYEK_SELESAI>>>");
  });

  it("keeps chat grounded and read-only when project context is supplied", () => {
    const prompt = buildEngineeringChatPrompt({
      message: "berapa volume yang perlu saya pakai?",
      engine: onlineEngine,
      projectId: "p-1",
      projectContext: "BOE: asumsi=2; REVIEW: volume K1 perlu cek",
    });

    expect(prompt).toContain("jawab hanya dari konteks proyek atau data Core Engine");
    expect(prompt).toContain("Jika data tidak ada");
    expect(prompt).toContain("jangan melakukan aritmetika baru");
    expect(prompt).not.toContain("silakan hitung sendiri");
  });

  it("adds attachment guidance without allowing new engineering calculations", () => {
    const prompt = buildEngineeringChatPrompt({
      message: "apa isi lampiran ini?",
      engine: onlineEngine,
      projectId: "p-1",
      attachmentCount: 2,
    });

    expect(prompt).toContain("User melampirkan 2 file");
    expect(prompt).toContain("jelaskan/rangkum isinya bila relevan");
    expect(prompt).toContain("jangan menghitung angka final");
  });

  it("omits project context delimiters when no project context is supplied", () => {
    const prompt = buildEngineeringChatPrompt({
      message: "halo",
      engine: onlineEngine,
      projectId: "p-1",
    });

    expect(prompt).not.toContain("<<<KONTEKS_PROYEK_MULAI>>>");
    expect(prompt).not.toContain("<<<KONTEKS_PROYEK_SELESAI>>>");
  });

  it("returns a general fallback answer without forcing RAB context", () => {
    const answer = fallbackEngineeringAnswer({
      message: "halo",
      engine: onlineEngine,
      aiError: "Gemini gagal (429): quota exceeded",
    });

    expect(answer).toContain("Gemini API belum memberi jawaban");
    expect(answer).toContain("quota exceeded");
    expect(answer).not.toContain("RAB");
  });

  it("turns non-json server errors into readable chat errors", async () => {
    const response = new Response("Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });

    await expect(readEngineeringChatResponse(response)).rejects.toThrow(
      "Engineering Chat gagal (500): Internal Server Error",
    );
  });
});
