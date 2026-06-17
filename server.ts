import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import {
  APP_STAGE,
  APP_VERSION,
  DEFAULT_MODEL,
  DEMO_AHSP_TEMPLATES,
  DEMO_DRAWING_ITEMS,
} from "./src/data/demoAhsp";

dotenv.config({ path: ".env.local" });
dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const MODEL_FAST = process.env.GEMINI_MODEL_FAST || DEFAULT_MODEL;
const MODEL_REASONING = process.env.GEMINI_MODEL_REASONING || MODEL_FAST;
const MAX_IMAGE_PAYLOAD_CHARS = 35_000_000;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

let aiClient: GoogleGenAI | null = null;

function hasGeminiApiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || "MOCK_KEY",
    });
  }

  return aiClient;
}

function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function assertArray(value: unknown, message: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }
}

function normalizeMessageRole(role: unknown): "user" | "model" {
  return role === "assistant" || role === "model" ? "model" : "user";
}

const demoCodeList = DEMO_AHSP_TEMPLATES.map(
  (item) => `${item.code}: ${item.name} (${item.unit})`,
);

const systemInstruction = `Anda adalah PAAX AI ${APP_STAGE}, asisten demo untuk estimasi awal RAB, quantity take-off, dan dokumentasi proyek sipil Indonesia.

Batasan wajib:
1. Produk ini adalah demo, bukan perangkat lunak produksi.
2. Gunakan hanya data AHSP/RAB demo yang tersedia. Jangan mengklaim memakai database AHSP lengkap, data private, atau data resmi terbaru.
3. Perhitungan RAB final dilakukan oleh kode TypeScript deterministik aplikasi.
4. Hasil struktur hanya preliminary screening dan wajib diverifikasi engineer/tenaga ahli bersertifikat.
5. Jika data belum lengkap, sebutkan asumsi dan risiko secara eksplisit.
6. Jika item tidak cocok dengan kode demo, gunakan ahspCode "custom" dan jelaskan asumsi harga satuannya.

Kode demo tersedia:
${demoCodeList.map((item) => `- ${item}`).join("\n")}

Jika pengguna meminta item untuk masuk RAB, akhiri jawaban dengan blok JSON valid:
===RAB_ITEMS===
[
  { "category": "Pekerjaan Struktur Beton", "name": "Beton K-225", "volume": 1.2, "unit": "m3", "ahspCode": "SNI.7394.6.2" }
]
===RAB_ITEMS===`;

const rabItemSchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          name: { type: Type.STRING },
          volume: { type: Type.NUMBER },
          unit: { type: Type.STRING },
          ahspCode: { type: Type.STRING },
          customUnitPrice: { type: Type.NUMBER },
          assumptions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          confidence: { type: Type.NUMBER },
        },
        required: ["category", "name", "volume", "unit", "ahspCode", "assumptions", "confidence"],
      },
    },
  },
  required: ["items"],
};

const scheduleSchema = {
  type: Type.OBJECT,
  properties: {
    schedules: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          taskName: { type: Type.STRING },
          startDate: { type: Type.STRING },
          durationDays: { type: Type.INTEGER },
          progress: { type: Type.INTEGER },
          dependencies: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["id", "taskName", "startDate", "durationDays", "progress", "dependencies"],
      },
    },
  },
  required: ["schedules"],
};

function buildMockChatResponse(lastMessage: string): string {
  const normalized = lastMessage.toLowerCase();
  const wantsRabItem =
    normalized.includes("rab") ||
    normalized.includes("hitung") ||
    normalized.includes("volume") ||
    normalized.includes("pondasi");

  if (!wantsRabItem) {
    return `PAAX AI ${APP_STAGE} berjalan dalam mock mode karena GEMINI_API_KEY belum tersedia. Saya bisa membantu alur demo AHSP/RAB, jadwal, dan screening gambar. Semua hasil struktur tetap preliminary screening dan wajib diverifikasi engineer.`;
  }

  return `Mock mode: untuk demo awal, gunakan pondasi batu belah volume 1.00 m3 sebagai item uji. RAB final tetap dihitung deterministik oleh aplikasi, bukan dari teks model.

Catatan struktur: ini preliminary screening saja dan wajib diverifikasi engineer.

===RAB_ITEMS===
[
  {
    "category": "Pekerjaan Galian & Pondasi",
    "name": "Pondasi batu belah 1:4 hasil mock",
    "volume": 1,
    "unit": "m3",
    "ahspCode": "SNI.2836.6.2"
  }
]
===RAB_ITEMS===`;
}

function buildMockRabItems(text: string) {
  const normalized = text.toLowerCase();

  if (normalized.includes("bata") || normalized.includes("dinding")) {
    return {
      items: [
        {
          category: "Pekerjaan Dinding & Arsitektur",
          name: "Pasangan bata merah 1/2 batu 1:4",
          volume: 10,
          unit: "m2",
          ahspCode: "SNI.15.50774",
          assumptions: ["Mock extraction memakai volume demo 10 m2."],
          confidence: 0.55,
        },
      ],
    };
  }

  if (normalized.includes("beton")) {
    return {
      items: [
        {
          category: "Pekerjaan Struktur Beton",
          name: "Beton K-225",
          volume: 1,
          unit: "m3",
          ahspCode: "SNI.7394.6.2",
          assumptions: ["Mock extraction memakai volume demo 1 m3."],
          confidence: 0.55,
        },
      ],
    };
  }

  return {
    items: [
      {
        category: "Pekerjaan Galian & Pondasi",
        name: "Galian tanah biasa kedalaman 1m",
        volume: 10,
        unit: "m3",
        ahspCode: "SNI.2835.6.1",
        assumptions: ["Mock extraction memakai volume demo 10 m3."],
        confidence: 0.55,
      },
    ],
  };
}

function buildMockSchedule(
  workItems: Array<{ name?: string; category?: string }> = [],
  durationDays = 30,
  startDate = "2026-06-16",
) {
  const items = workItems.length > 0 ? workItems : [{ name: "Pekerjaan demo PAAX AI" }];
  const taskDuration = Math.max(2, Math.round(durationDays / Math.max(1, items.length)));
  const schedules = items.map((item, index) => {
    const currentStart = new Date(`${startDate}T00:00:00.000Z`);
    currentStart.setUTCDate(currentStart.getUTCDate() + index * Math.max(1, Math.floor(taskDuration * 0.75)));

    return {
      id: `sch-${index + 1}`,
      taskName: item.name || item.category || `Pekerjaan ${index + 1}`,
      startDate: currentStart.toISOString().split("T")[0],
      durationDays: taskDuration,
      progress: 0,
      dependencies: index > 0 ? [`sch-${index}`] : [],
    };
  });

  return { schedules };
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/api/health", (_req, res) => {
    res.json({
      app: "PAAX AI",
      version: APP_VERSION,
      productStage: APP_STAGE,
      status: "ok",
      mode: process.env.NODE_ENV || "development",
      hasGeminiApiKey: hasGeminiApiKey(),
      models: {
        fast: MODEL_FAST,
        reasoning: MODEL_REASONING,
      },
      dataMode: "demo-ahsp-rab-template",
    });
  });

  app.get("/api/paax/status", (_req, res) => {
    res.json({
      version: APP_VERSION,
      productStage: APP_STAGE,
      productionReady: false,
      hasGeminiApiKey: hasGeminiApiKey(),
      supportedDemoCodes: demoCodeList,
      warnings: [
        "PAAX AI v0.2-demo is not production software.",
        "Only demo AHSP/RAB template data is included.",
        "Structural results are preliminary screening only and require engineer verification.",
      ],
    });
  });

  app.post("/api/paax/chat", async (req, res) => {
    try {
      const { messages } = req.body as { messages?: Array<{ role?: string; content?: string }> };
      assertArray(messages, "messages array is required");

      const lastMessage = messages[messages.length - 1];
      const lastText = String(lastMessage?.content || "").trim();
      if (!lastText) {
        return res.status(400).json({ error: "Last message content is required." });
      }

      if (!hasGeminiApiKey()) {
        return res.json({ text: buildMockChatResponse(lastText), mode: "mock" });
      }

      const conversationHistory = messages.slice(0, -1).map((message) => ({
        role: normalizeMessageRole(message.role),
        parts: [{ text: String(message.content || "") }],
      }));

      const response = await getGeminiClient().models.generateContent({
        model: MODEL_FAST,
        contents: [...conversationHistory, { role: "user", parts: [{ text: lastText }] }],
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      return res.json({
        text: response.text || "PAAX AI tidak menerima teks respons yang valid.",
        mode: "gemini",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "PAAX chat failed.";
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/paax/extract-rab-items", async (req, res) => {
    try {
      const text = String(req.body?.text || "").trim();
      if (!text) {
        return res.status(400).json({ error: "Text is required." });
      }

      if (!hasGeminiApiKey()) {
        return res.json({ ...buildMockRabItems(text), mode: "mock" });
      }

      const response = await getGeminiClient().models.generateContent({
        model: MODEL_FAST,
        contents: `Ekstrak calon item RAB dari teks berikut. Gunakan hanya kode AHSP/RAB demo yang tersedia; jika tidak cocok gunakan custom.

Kode demo:
${demoCodeList.map((item) => `- ${item}`).join("\n")}

Teks:
${text}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: rabItemSchema,
          temperature: 0.1,
        },
      });

      return res.json({
        ...safeJsonParse(response.text || "{}", { items: [] }),
        mode: "gemini",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to extract RAB items.";
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/paax/analyze-drawing", async (req, res) => {
    try {
      const base64Image = req.body?.base64Image;
      const mimeType = String(req.body?.mimeType || "image/png");
      const messagePrompt = String(req.body?.messagePrompt || "Analisis elemen konstruksi yang tampak.");

      if (!base64Image || typeof base64Image !== "string") {
        return res.status(400).json({ error: "base64Image data is required." });
      }

      if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
        return res.status(400).json({ error: "Only PNG, JPEG, and WEBP drawings are supported." });
      }

      if (base64Image.length > MAX_IMAGE_PAYLOAD_CHARS) {
        return res.status(413).json({ error: "Image payload is too large for demo mode." });
      }

      if (!hasGeminiApiKey()) {
        return res.json({
          analysis:
            "Mock drawing analysis: detected a simple structural detail candidate. Generated items are demo-only. Structural interpretation is preliminary screening and requires engineer verification.",
          estimatedCost: 0,
          itemsGenerated: DEMO_DRAWING_ITEMS,
          mode: "mock",
        });
      }

      const response = await getGeminiClient().models.generateContent({
        model: MODEL_REASONING,
        contents: [
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
          {
            text: `Anda adalah PAAX AI Vision ${APP_STAGE}. Analisis gambar konstruksi untuk QTO awal, bukan desain final.

Permintaan pengguna: ${messagePrompt}

Tugas:
1. Identifikasi elemen yang terlihat.
2. Tulis asumsi dimensi jika tidak terbaca.
3. Berikan estimasi volume awal hanya jika datanya cukup.
4. Tandai hal yang wajib diverifikasi manual.
5. Akhiri dengan JSON di antara marker ===JSON_DATA=== berisi { "estimatedCost": number, "itemsGenerated": [] }.

Kode demo:
${demoCodeList.map((item) => `- ${item}`).join("\n")}`,
          },
        ],
        config: {
          systemInstruction:
            "Jangan menyatakan hasil sebagai desain struktur final. Hasil struktur hanya preliminary screening dan wajib diverifikasi engineer.",
          temperature: 0.15,
        },
      });

      const responseText = response.text || "";
      const marker = "===JSON_DATA===";
      let estimatedCost = 0;
      let itemsGenerated: unknown[] = [];

      if (responseText.includes(marker)) {
        const parts = responseText.split(marker);
        if (parts.length >= 3) {
          const parsed = safeJsonParse(parts[1].trim(), {
            estimatedCost: 0,
            itemsGenerated: [],
          });
          estimatedCost = Number(parsed.estimatedCost || 0);
          itemsGenerated = Array.isArray(parsed.itemsGenerated) ? parsed.itemsGenerated : [];
        }
      }

      return res.json({
        analysis: responseText.replaceAll(marker, "").trim(),
        estimatedCost,
        itemsGenerated,
        mode: "gemini",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to analyze drawing.";
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/paax/generate-schedule", async (req, res) => {
    try {
      const workItems = Array.isArray(req.body?.workItems) ? req.body.workItems : [];
      const durationDays = Number(req.body?.durationDays || 30);
      const startDate = String(req.body?.startDate || "2026-06-16");

      if (!hasGeminiApiKey()) {
        return res.json({ ...buildMockSchedule(workItems, durationDays, startDate), mode: "mock" });
      }

      const response = await getGeminiClient().models.generateContent({
        model: MODEL_FAST,
        contents: `Buat schedule konstruksi demo dari item RAB berikut.

Work items: ${JSON.stringify(workItems)}
Start date: ${startDate}
Target duration: ${durationDays} hari

Aturan: urutkan pekerjaan secara wajar, gunakan dependency, progress awal 0, format tanggal YYYY-MM-DD.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: scheduleSchema,
          temperature: 0.1,
        },
      });

      return res.json({
        ...safeJsonParse(response.text || "{}", buildMockSchedule(workItems, durationDays, startDate)),
        mode: "gemini",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate schedule.";
      return res.status(500).json({ error: message });
    }
  });

  const isBundledStart = process.argv[1]?.endsWith("server.cjs") ?? false;
  const useVite = process.env.NODE_ENV !== "production" && !isBundledStart;

  if (useVite) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PAAX AI ${APP_VERSION} running at http://localhost:${PORT}`);
    console.log(`Gemini API key: ${hasGeminiApiKey() ? "configured" : "mock mode"}`);
    console.log(`Models: fast=${MODEL_FAST}, reasoning=${MODEL_REASONING}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start PAAX AI server", error);
  process.exit(1);
});
