import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Calculator,
  CalendarRange,
  CheckCircle2,
  FileText,
  HardHat,
  ImageUp,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  APP_STAGE,
  DEMO_AHSP_TEMPLATES,
  INITIAL_PROJECT,
  LABOR_LABELS,
  MATERIAL_LABELS,
} from "./data/demoAhsp";
import { calculateRabTotals, calculateWorkItem, formatIdr } from "./lib/rab";
import type {
  ChatMessage,
  DrawingAnalysisResponse,
  DrawingItem,
  ProjectState,
  ScheduleItem,
  WorkItem,
} from "./types";

type TabId = "rab" | "chat" | "drawing" | "schedule" | "settings";

interface StatusResponse {
  version: string;
  productStage: string;
  hasGeminiApiKey: boolean;
  warnings: string[];
}

interface ExtractedRabItem extends WorkItem {
  assumptions?: string[];
  confidence?: number;
}

interface ChatApiResponse {
  text?: string;
}

interface ChatApiErrorResponse {
  error?: string;
  code?: string;
  retryable?: boolean;
}

class ChatRequestError extends Error {
  code?: string;
  retryable: boolean;
  status?: number;

  constructor(
    message: string,
    options: { code?: string; retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = "ChatRequestError";
    this.code = options.code;
    this.retryable = Boolean(options.retryable);
    this.status = options.status;
  }
}

const STORAGE_KEY = "paax-ai-v02-demo-project";
const EMPTY_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const CHAT_CONTEXT_LIMIT = 10;
const CHAT_MAX_RETRIES = 2;
const CHAT_RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

const tabs: Array<{ id: TabId; label: string; icon: typeof Calculator }> = [
  { id: "rab", label: "RAB", icon: Calculator },
  { id: "chat", label: "Assistant", icon: Bot },
  { id: "drawing", label: "Drawing", icon: ImageUp },
  { id: "schedule", label: "Schedule", icon: CalendarRange },
  { id: "settings", label: "Rates", icon: FileText },
];

function loadProject(): ProjectState {
  if (typeof window === "undefined") {
    return INITIAL_PROJECT;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return INITIAL_PROJECT;
    }

    const stored = JSON.parse(raw) as Partial<ProjectState>;
    return {
      ...INITIAL_PROJECT,
      ...stored,
      materialsPrices: {
        ...INITIAL_PROJECT.materialsPrices,
        ...(stored.materialsPrices || {}),
      },
      laborPrices: {
        ...INITIAL_PROJECT.laborPrices,
        ...(stored.laborPrices || {}),
      },
      workItems: Array.isArray(stored.workItems) ? stored.workItems : INITIAL_PROJECT.workItems,
      schedules: Array.isArray(stored.schedules) ? stored.schedules : INITIAL_PROJECT.schedules,
    };
  } catch {
    return INITIAL_PROJECT;
  }
}

function normalizeExtractedItem(item: Partial<ExtractedRabItem>, index: number): WorkItem {
  const template = DEMO_AHSP_TEMPLATES.find((candidate) => candidate.code === item.ahspCode);

  return {
    id: `wi-${Date.now()}-${index}`,
    category: item.category || template?.category || "Pekerjaan Demo",
    name: item.name || template?.name || "Item demo",
    volume: Number(item.volume || 1),
    unit: item.unit || template?.unit || "ls",
    ahspCode: item.ahspCode || template?.code || "custom",
    customUnitPrice: item.customUnitPrice,
  };
}

function parseRabItemsFromChat(text: string): WorkItem[] {
  const marker = "===RAB_ITEMS===";
  if (!text.includes(marker)) {
    return [];
  }

  const parts = text.split(marker);
  if (parts.length < 3) {
    return [];
  }

  try {
    const parsed = JSON.parse(parts[1].trim()) as Partial<ExtractedRabItem>[];
    return Array.isArray(parsed) ? parsed.map(normalizeExtractedItem) : [];
  } catch {
    return [];
  }
}

function visibleChatContent(content: string): string {
  return (
    content.replace(/===RAB_ITEMS===[\s\S]*?===RAB_ITEMS===/g, "").trim() ||
    "Suggested RAB items are ready for review before import."
  );
}

function waitForRetry(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

function isRetryableChatError(error: unknown): boolean {
  if (error instanceof ChatRequestError) {
    return (
      error.retryable ||
      (typeof error.status === "number" && CHAT_RETRY_STATUS_CODES.has(error.status))
    );
  }

  return isNetworkError(error);
}

async function readChatError(response: Response): Promise<ChatApiErrorResponse> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    return (await response.json()) as ChatApiErrorResponse;
  } catch {
    return {};
  }
}

function fallbackChatErrorMessage(status: number): string {
  if (status === 429) {
    return "PAAX Assistant is rate-limited. Please wait a moment and try again.";
  }

  if (CHAT_RETRY_STATUS_CODES.has(status)) {
    return "PAAX Assistant is temporarily unavailable. Please try again shortly.";
  }

  return "PAAX Assistant could not process this request safely.";
}

function safeChatFailureMessage(error: unknown): string {
  if (error instanceof ChatRequestError) {
    return error.message;
  }

  if (isNetworkError(error)) {
    return "The local PAAX Assistant server could not be reached. Please check the connection and try again.";
  }

  return "PAAX Assistant could not complete the request. Please try again.";
}

async function requestChat(messages: Array<{ role: ChatMessage["role"]; content: string }>) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= CHAT_MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch("/api/paax/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });

      if (!response.ok) {
        const errorData = await readChatError(response);
        throw new ChatRequestError(
          errorData.error || fallbackChatErrorMessage(response.status),
          {
            code: errorData.code,
            retryable:
              errorData.retryable ?? CHAT_RETRY_STATUS_CODES.has(response.status),
            status: response.status,
          },
        );
      }

      return (await response.json()) as ChatApiResponse;
    } catch (error) {
      lastError = error;

      if (attempt < CHAT_MAX_RETRIES && isRetryableChatError(error)) {
        await waitForRetry(500 * (attempt + 1));
        continue;
      }

      break;
    }
  }

  if (isNetworkError(lastError)) {
    throw new ChatRequestError(
      "The local PAAX Assistant server could not be reached. Please check the connection and try again.",
      { code: "NETWORK_ERROR", retryable: true },
    );
  }

  throw lastError instanceof Error
    ? lastError
    : new ChatRequestError("PAAX Assistant could not complete the request. Please try again.");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("rab");
  const [project, setProject] = useState<ProjectState>(() => loadProject());
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [newItem, setNewItem] = useState<WorkItem>({
    id: "",
    category: "Pekerjaan Struktur Beton",
    name: "",
    volume: 1,
    unit: "m3",
    ahspCode: "SNI.7394.6.2",
  });
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "PAAX AI v0.2-demo is ready. Calculations use demo AHSP/RAB templates, and structural results are preliminary screening only.",
      timestamp: "09:00",
    },
  ]);
  const [pendingItems, setPendingItems] = useState<WorkItem[]>([]);
  const [extractText, setExtractText] = useState(
    "Hitung 12 m3 beton K-225 dan 80 m2 pasangan bata merah untuk demo RAB.",
  );
  const [extractLoading, setExtractLoading] = useState(false);
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const [drawingPrompt, setDrawingPrompt] = useState(
    "Screening elemen struktur dan usulkan item RAB demo yang terlihat.",
  );
  const [drawingLoading, setDrawingLoading] = useState(false);
  const [drawingResult, setDrawingResult] = useState<DrawingAnalysisResponse | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  useEffect(() => {
    fetch("/api/paax/status")
      .then((response) => response.json())
      .then((data: StatusResponse) => setStatus(data))
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  }, [project]);

  const calculatedItems = useMemo(
    () =>
      project.workItems.map((item) =>
        calculateWorkItem(
          item,
          DEMO_AHSP_TEMPLATES,
          project.materialsPrices,
          project.laborPrices,
          project.overheadPercentage,
        ),
      ),
    [project],
  );

  const rabTotals = useMemo(() => calculateRabTotals(calculatedItems), [calculatedItems]);

  const addWorkItems = (items: WorkItem[]) => {
    setProject((current) => ({
      ...current,
      workItems: [...current.workItems, ...items],
    }));
  };

  const importPendingItems = () => {
    addWorkItems(pendingItems);
    setPendingItems([]);
    setActiveTab("rab");
  };

  const renderPendingItemsPanel = () => {
    if (pendingItems.length === 0) {
      return null;
    }

    return (
      <div className="result-block">
        <h2>Review Suggested RAB Items</h2>
        <p>Assistant suggestions stay out of the RAB table until you import them.</p>
        <div className="compact-list">
          {pendingItems.map((item) => (
            <div key={item.id}>
              <span>{item.name}</span>
              <strong>
                {item.volume} {item.unit} / {item.ahspCode}
              </strong>
            </div>
          ))}
        </div>
        <button type="button" className="button primary" onClick={importPendingItems}>
          <Plus size={15} />
          Import
        </button>
        <button type="button" className="button ghost" onClick={() => setPendingItems([])}>
          Dismiss
        </button>
      </div>
    );
  };

  const handleAddItem = (event: FormEvent) => {
    event.preventDefault();
    const template = DEMO_AHSP_TEMPLATES.find((item) => item.code === newItem.ahspCode);
    addWorkItems([
      {
        ...newItem,
        id: `wi-${Date.now()}`,
        category: template?.category || newItem.category,
        unit: template?.unit || newItem.unit,
        name: newItem.name || template?.name || "Item demo",
      },
    ]);
    setNewItem((current) => ({ ...current, name: "", volume: 1 }));
  };

  const deleteWorkItem = (id: string) => {
    setProject((current) => ({
      ...current,
      workItems: current.workItems.filter((item) => item.id !== id),
    }));
  };

  const sendChat = async (event: FormEvent) => {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text || chatLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `chat-${Date.now()}-user`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
    };

    const nextHistory = [...chatHistory, userMessage];
    setChatHistory(nextHistory);
    setChatInput("");
    setChatLoading(true);

    try {
      const chatContext = nextHistory.slice(-CHAT_CONTEXT_LIMIT).map((message) => ({
        role: message.role,
        content: message.content,
      }));
      const data = await requestChat(chatContext);
      const assistantMessage: ChatMessage = {
        id: `chat-${Date.now()}-assistant`,
        role: "assistant",
        content: data.text || "PAAX AI did not return a text response.",
        timestamp: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      };

      setPendingItems(parseRabItemsFromChat(assistantMessage.content));
      setChatHistory((current) => [...current, assistantMessage]);
    } catch (error) {
      const message = safeChatFailureMessage(error);
      setChatHistory((current) => [
        ...current,
        {
          id: `chat-${Date.now()}-error`,
          role: "assistant",
          content: `PAAX Assistant error: ${message}`,
          timestamp: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const extractRabItems = async () => {
    setExtractLoading(true);
    try {
      const response = await fetch("/api/paax/extract-rab-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: extractText }),
      });
      const data = (await response.json()) as { items?: Partial<ExtractedRabItem>[] };
      setPendingItems((data.items || []).map(normalizeExtractedItem));
      setActiveTab("rab");
    } finally {
      setExtractLoading(false);
    }
  };

  const analyzeDrawing = async () => {
    setDrawingLoading(true);
    try {
      const base64Image = drawingFile ? await fileToBase64(drawingFile) : EMPTY_IMAGE_BASE64;
      const response = await fetch("/api/paax/analyze-drawing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64Image,
          mimeType: drawingFile?.type || "image/png",
          messagePrompt: drawingPrompt,
        }),
      });
      const data = (await response.json()) as DrawingAnalysisResponse;
      setDrawingResult(data);
    } finally {
      setDrawingLoading(false);
    }
  };

  const importDrawingItems = (items: DrawingItem[]) => {
    addWorkItems(
      items.map((item, index) =>
        normalizeExtractedItem(
          {
            category:
              DEMO_AHSP_TEMPLATES.find((template) => template.code === item.matchedAHSP)?.category ||
              "Pekerjaan Demo",
            name: item.name,
            volume: item.volume,
            unit: item.unit,
            ahspCode: item.matchedAHSP,
          },
          index,
        ),
      ),
    );
    setActiveTab("rab");
  };

  const generateSchedule = async () => {
    setScheduleLoading(true);
    try {
      const response = await fetch("/api/paax/generate-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workItems: project.workItems,
          durationDays: 30,
          startDate: "2026-06-16",
        }),
      });
      const data = (await response.json()) as { schedules?: ScheduleItem[] };
      setProject((current) => ({
        ...current,
        schedules: Array.isArray(data.schedules) ? data.schedules : current.schedules,
      }));
    } finally {
      setScheduleLoading(false);
    }
  };

  const updatePrice = (type: "materialsPrices" | "laborPrices", key: string, value: number) => {
    setProject((current) => ({
      ...current,
      [type]: {
        ...current[type],
        [key]: value,
      },
    }));
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-row">
            <HardHat size={24} />
            <span>PAAX AI</span>
            <span className="version-pill">{APP_STAGE}</span>
          </div>
          <p className="subtle">
            Browser demo using AHSP/RAB template data only. Not production software.
          </p>
        </div>
        <div className="status-strip">
          <span className={status?.hasGeminiApiKey ? "status-dot live" : "status-dot"} />
          <span>{status?.hasGeminiApiKey ? "Gemini API" : "Mock mode"}</span>
        </div>
      </header>

      <nav className="tabbar" aria-label="PAAX workspace">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "tab active" : "tab"}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <main>
        <section className="notice-band">
          <ShieldCheck size={18} />
          <span>
            Structural results are preliminary screening only and require engineer verification.
          </span>
        </section>

        {activeTab === "rab" && (
          <div className="workspace-grid">
            <section className="panel main-panel">
              <div className="panel-header">
                <div>
                  <h1>RAB Demo Workspace</h1>
                  <p>{project.name}</p>
                </div>
                <div className="total-box">
                  <span>Total incl. overhead</span>
                  <strong>{formatIdr(rabTotals.totalCost)}</strong>
                </div>
              </div>

              {renderPendingItemsPanel()}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Code</th>
                      <th>Vol.</th>
                      <th>Unit cost</th>
                      <th>Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {calculatedItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                          <span>{item.category}</span>
                        </td>
                        <td>{item.ahspCode}</td>
                        <td>
                          {item.volume} {item.unit}
                        </td>
                        <td>{formatIdr(item.unitCost)}</td>
                        <td>{formatIdr(item.totalCost)}</td>
                        <td className="right-cell">
                          <button
                            type="button"
                            className="icon-button danger"
                            onClick={() => deleteWorkItem(item.id)}
                            title="Delete item"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="panel side-panel">
              <h2>Add Demo Item</h2>
              <form className="stack" onSubmit={handleAddItem}>
                <label>
                  AHSP/RAB template
                  <select
                    value={newItem.ahspCode}
                    onChange={(event) => {
                      const template = DEMO_AHSP_TEMPLATES.find(
                        (item) => item.code === event.target.value,
                      );
                      setNewItem((current) => ({
                        ...current,
                        ahspCode: event.target.value,
                        category: template?.category || current.category,
                        unit: template?.unit || current.unit,
                      }));
                    }}
                  >
                    {DEMO_AHSP_TEMPLATES.map((template) => (
                      <option key={template.code} value={template.code}>
                        {template.code} - {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Item name
                  <input
                    value={newItem.name}
                    onChange={(event) =>
                      setNewItem((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Leave empty to use template name"
                  />
                </label>
                <label>
                  Volume
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newItem.volume}
                    onChange={(event) =>
                      setNewItem((current) => ({
                        ...current,
                        volume: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <button type="submit" className="button primary full-width">
                  <Plus size={16} />
                  Add Item
                </button>
              </form>

              <div className="metric-list">
                <div>
                  <span>Direct cost</span>
                  <strong>{formatIdr(rabTotals.directCost)}</strong>
                </div>
                <div>
                  <span>Overhead {project.overheadPercentage}%</span>
                  <strong>{formatIdr(rabTotals.overheadCost)}</strong>
                </div>
                <div>
                  <span>Material share</span>
                  <strong>{formatIdr(rabTotals.materialCost)}</strong>
                </div>
                <div>
                  <span>Labor share</span>
                  <strong>{formatIdr(rabTotals.laborCost)}</strong>
                </div>
              </div>
            </aside>
          </div>
        )}

        {activeTab === "chat" && (
          <section className="panel chat-panel">
            <div className="panel-header">
              <div>
                <h1>PAAX Assistant</h1>
                <p>Gemini API when configured, deterministic mock mode otherwise.</p>
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={extractRabItems}
                disabled={extractLoading}
              >
                <FileText size={16} />
                Extract Text
              </button>
            </div>

            <div className="extract-box">
              <textarea value={extractText} onChange={(event) => setExtractText(event.target.value)} />
            </div>

            {renderPendingItemsPanel()}

            <div className="chat-log">
              {chatHistory.map((message) => (
                <article key={message.id} className={`message ${message.role}`}>
                  <span>{message.role === "user" ? "You" : "PAAX AI"}</span>
                  <p>{visibleChatContent(message.content)}</p>
                </article>
              ))}
              {chatLoading && (
                <article className="message assistant">
                  <span>PAAX AI</span>
                  <p>Working on the response...</p>
                </article>
              )}
            </div>

            <form className="chat-form" onSubmit={sendChat}>
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ask for a demo RAB item, volume assumption, or schedule note"
              />
              <button type="submit" className="button primary" disabled={chatLoading || !chatInput.trim()}>
                <Send size={16} />
                Send
              </button>
            </form>
          </section>
        )}

        {activeTab === "drawing" && (
          <div className="workspace-grid">
            <section className="panel main-panel">
              <div className="panel-header">
                <div>
                  <h1>Drawing Screening</h1>
                  <p>PNG, JPEG, and WEBP uploads for preliminary QTO screening.</p>
                </div>
                <button
                  type="button"
                  className="button primary"
                  onClick={analyzeDrawing}
                  disabled={drawingLoading}
                >
                  <ImageUp size={16} />
                  Analyze
                </button>
              </div>

              <div className="drawing-layout">
                <div className="drawing-sheet" aria-label="Demo drawing preview">
                  <svg viewBox="0 0 500 300" role="img">
                    <rect x="48" y="38" width="404" height="224" />
                    <path d="M92 220 L190 220 L190 92 L306 92 L306 220 L408 220" />
                    <path d="M92 220 L92 92 L190 92" />
                    <path d="M306 92 L408 92 L408 220" />
                    <circle cx="190" cy="92" r="13" />
                    <circle cx="306" cy="92" r="13" />
                    <circle cx="190" cy="220" r="13" />
                    <circle cx="306" cy="220" r="13" />
                    <text x="70" y="70">DEMO PLAN</text>
                    <text x="172" y="82">C1</text>
                    <text x="288" y="82">C1</text>
                    <text x="210" y="158">WALL A</text>
                  </svg>
                </div>
                <div className="stack">
                  <label>
                    Drawing file
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => setDrawingFile(event.target.files?.[0] || null)}
                    />
                  </label>
                  <label>
                    Screening prompt
                    <textarea
                      value={drawingPrompt}
                      onChange={(event) => setDrawingPrompt(event.target.value)}
                    />
                  </label>
                </div>
              </div>

              {drawingResult && (
                <div className="result-block">
                  <h2>Screening Result</h2>
                  <p>{drawingResult.analysis}</p>
                  <div className="compact-list">
                    {drawingResult.itemsGenerated.map((item) => (
                      <div key={`${item.name}-${item.matchedAHSP}`}>
                        <span>{item.name}</span>
                        <strong>
                          {item.volume} {item.unit} / {item.matchedAHSP}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => importDrawingItems(drawingResult.itemsGenerated)}
                  >
                    <Plus size={16} />
                    Import Items
                  </button>
                </div>
              )}
            </section>

            <aside className="panel side-panel">
              <h2>Required Review</h2>
              <div className="check-list">
                <p>
                  <CheckCircle2 size={16} />
                  Dimensions and scale must be checked manually.
                </p>
                <p>
                  <CheckCircle2 size={16} />
                  Reinforcement and load paths require engineer review.
                </p>
                <p>
                  <CheckCircle2 size={16} />
                  Imported items remain editable before costing.
                </p>
              </div>
            </aside>
          </div>
        )}

        {activeTab === "schedule" && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h1>Demo Schedule</h1>
                <p>Generated from current RAB items with editable project state.</p>
              </div>
              <button
                type="button"
                className="button primary"
                onClick={generateSchedule}
                disabled={scheduleLoading}
              >
                <CalendarRange size={16} />
                Generate
              </button>
            </div>

            <div className="schedule-list">
              {project.schedules.map((item) => (
                <div key={item.id} className="schedule-row">
                  <div>
                    <strong>{item.taskName}</strong>
                    <span>
                      {item.startDate} / {item.durationDays} days / depends on{" "}
                      {item.dependencies.length ? item.dependencies.join(", ") : "none"}
                    </span>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }} />
                  </div>
                  <b>{item.progress}%</b>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "settings" && (
          <div className="workspace-grid">
            <section className="panel main-panel">
              <div className="panel-header">
                <div>
                  <h1>Demo Rates</h1>
                  <p>Local edits stay in browser storage.</p>
                </div>
                <label className="overhead-control">
                  Overhead %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={project.overheadPercentage}
                    onChange={(event) =>
                      setProject((current) => ({
                        ...current,
                        overheadPercentage: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              </div>
              <div className="price-grid">
                {Object.entries(project.materialsPrices).map(([key, value]) => (
                  <label key={key}>
                    {MATERIAL_LABELS[key] || key}
                    <input
                      type="number"
                      min="0"
                      value={value}
                      onChange={(event) =>
                        updatePrice("materialsPrices", key, Number(event.target.value))
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
            <aside className="panel side-panel">
              <h2>Labor Rates</h2>
              <div className="stack">
                {Object.entries(project.laborPrices).map(([key, value]) => (
                  <label key={key}>
                    {LABOR_LABELS[key] || key}
                    <input
                      type="number"
                      min="0"
                      value={value}
                      onChange={(event) =>
                        updatePrice("laborPrices", key, Number(event.target.value))
                      }
                    />
                  </label>
                ))}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
