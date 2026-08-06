/*
 * PAAX native PDF render contract — frozen at Wave 0.
 *
 * Owner: ORION-F2 (until Wave 2 per Master Plan §10.10).
 * Approvers: ORION-F3 (cache/planner), ORION-F4 (viewer).
 *
 * This file is the single source of truth for the native render engine's
 * public shape: request/result types, the commit rule, priority levels,
 * the worker wire protocol, and the pool/scheduler API surfaces. Any change
 * to these types is a contract change and requires F3/F4 agreement.
 *
 * Coordinate convention: RenderRegion uses PDF/page space (logical points),
 * NOT screen pixels. density is device px per logical pt.
 */
import type { fetchPdfBinary } from '../pdf-binary-cache';

/** Region in the page's logical PDF-point space (same space as pdf.js
 *  page.getViewport({ scale: 1 })). */
export interface RenderRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Base-layer render request. The base raster covers the FULL page; no
 *  region is needed. priority discriminates first useful paint vs the
 *  higher-density background upgrade. */
export interface RenderBaseRequest {
  requestId: string;
  generation: number;
  runId: string;
  pageIndex: number;
  /** Device px per logical pt for the full-page raster. */
  density: number;
  darkMode: boolean;
  priority: 'base-first' | 'base-upgrade';
}

/** Detail crop render request for a viewport-sized region. */
export interface RenderCropRequest {
  requestId: string;
  generation: number;
  runId: string;
  pageIndex: number;
  /** Region in PDF-point space (already clamped + overscanned by F4/F3). */
  region: RenderRegion;
  /** Device px per logical pt (zoom × dpr), capped by cropDensityCapPAAX. */
  density: number;
  darkMode: boolean;
  priority: 'foreground' | 'neighbor-prefetch';
}

export type RenderRequest = RenderBaseRequest | RenderCropRequest;

/** Committed render outcome delivered to the consumer. The bitmap is owned
 *  by the delivery: claim() hands it over exactly once; any bitmap that is
 *  never claimed is closed by the engine (DoD 17). */
export interface RenderResult {
  requestId: string;
  generation: number;
  pageIndex: number;
  /** For base renders: the full page region at scale 1. For crops: the
   *  requested region in PDF-point space. */
  region: RenderRegion;
  density: number;
  /** Device-pixel size of the bitmap. */
  widthPx: number;
  heightPx: number;
  /** Wall-clock render duration inside the worker (ms). */
  renderMs: number;
  /** Conservative baseline: widthPx × heightPx × 4 (RGBA). */
  estimatedBytes: number;
}

/** Conservative byte estimate for an RGBA bitmap (Master Plan §5 F3.5). */
export function estimatedBytesFor(widthPx: number, heightPx: number): number {
  return Math.max(0, Math.round(widthPx)) * Math.max(0, Math.round(heightPx)) * 4;
}

/**
 * Commit rule (Master Plan §4, frozen):
 *
 *   result.generation === activeGeneration
 *   AND requestId masih terdaftar
 *   AND pageIndex masih aktif
 *
 * If any clause fails the bitmap MUST be closed and never displayed.
 * `activeGeneration` is the latest generation submitted for the request's
 * lane on the same page; `registeredRequestIds` are the live (not yet
 * settled) request ids the scheduler is still tracking; `activePageIndex`
 * is the page the viewer currently shows for the run (undefined = no
 * active-page gate, used by the mock adapter).
 */
export function canCommit(
  result: Pick<RenderResult, 'generation' | 'requestId' | 'pageIndex'>,
  activeGeneration: number | undefined,
  registeredRequestIds: ReadonlySet<string>,
  activePageIndex: number | undefined,
): boolean {
  if (result.generation !== activeGeneration) return false;
  if (!registeredRequestIds.has(result.requestId)) return false;
  if (activePageIndex !== undefined && result.pageIndex !== activePageIndex) return false;
  return true;
}

/** Priority levels — lower number wins (P0 highest). */
export const PRIORITY_FOREGROUND = 0; // P0 foreground crop
export const PRIORITY_BASE_FIRST = 1; // P1 base-first
export const PRIORITY_NEIGHBOR_PREFETCH = 2; // P2 neighbor-prefetch
export const PRIORITY_BASE_UPGRADE = 3; // P3 base-upgrade

/** Resolve a render request to its scheduler priority level. */
export function priorityLevelOf(request: RenderRequest): number {
  if (request.priority === 'foreground') return PRIORITY_FOREGROUND;
  if (request.priority === 'base-first') return PRIORITY_BASE_FIRST;
  if (request.priority === 'neighbor-prefetch') return PRIORITY_NEIGHBOR_PREFETCH;
  return PRIORITY_BASE_UPGRADE;
}

/** True for crop requests (base requests render the full page). */
export function isCropRequest(request: RenderRequest): request is RenderCropRequest {
  return 'region' in request && typeof (request as RenderCropRequest).region === 'object';
}

/** True for base requests. */
export function isBaseRequest(request: RenderRequest): request is RenderBaseRequest {
  return !isCropRequest(request);
}

/** Stable per-page key used by the scheduler for generation/lane tracking. */
export function pageKeyOf(runId: string, pageIndex: number): string {
  return `${runId}:${pageIndex}`;
}

/* ------------------------------------------------------------------ *
 * Worker wire protocol (pool ⇄ worker).                              *
 * ------------------------------------------------------------------ */

/** Pool → worker messages. requestId is a string (contract §4). */
export type RenderWorkerInboundMessage =
  | { type: 'open-document'; runId: string; data: ArrayBuffer }
  | { type: 'get-page-metrics'; requestId: string; runId: string; pageIndex: number }
  | {
      type: 'render-base';
      requestId: string;
      runId: string;
      pageIndex: number;
      density: number;
      darkMode: boolean;
    }
  | {
      type: 'render-crop';
      requestId: string;
      runId: string;
      pageIndex: number;
      region: RenderRegion;
      density: number;
      darkMode: boolean;
    }
  | { type: 'cancel'; requestId: string }
  | { type: 'close-run'; runId: string };

/** Worker → pool messages. */
export type RenderWorkerOutboundMessage =
  | { type: 'document-ready'; runId: string; numPages: number; width: number; height: number }
  | { type: 'document-error'; runId: string; message: string }
  | { type: 'page-metrics'; requestId: string; runId: string; pageIndex: number; width: number; height: number }
  | { type: 'page-metrics-error'; requestId: string; runId: string; message: string }
  | {
      type: 'render-result';
      requestId: string;
      runId: string;
      pageIndex: number;
      region: RenderRegion;
      density: number;
      widthPx: number;
      heightPx: number;
      renderMs: number;
      estimatedBytes: number;
      bitmap: ImageBitmap;
    }
  | { type: 'render-error'; requestId: string; runId: string; message: string; code?: string };

/* ------------------------------------------------------------------ *
 * Pool API (scheduler → pool).                                       *
 * ------------------------------------------------------------------ */

/** Minimal worker abstraction so tests can inject fake workers. */
export interface PdfRenderWorker {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface PdfPageMetrics {
  width: number;
  height: number;
  numPages: number;
}

/** Single-claim delivery. The consumer must call claim() synchronously in
 *  the promise resolution handler; a bitmap never claimed is closed by the
 *  pool (mirrors PdfTileDelivery semantics). */
export interface PdfRenderDelivery {
  readonly result: Omit<RenderResult, 'bitmap'>;
  claim(): ImageBitmap | null;
}

export interface PdfRenderHandle {
  promise: Promise<PdfRenderDelivery>;
  cancel(): void;
}

export interface PdfRenderPoolOptions {
  hardwareConcurrency?: number;
  workerFactory?: () => PdfRenderWorker;
  /** PDF binary loader. Defaults to the existing single-flight
   *  fetchPdfBinary cache (pdf-binary-cache.ts) so a run's ArrayBuffer is
   *  downloaded at most once. */
  pdfFetcher?: typeof fetchPdfBinary;
  requestTimeoutMs?: number;
  now?: () => number;
}

export interface PdfRenderPool {
  /** Open a run's PDF (single-flight) and prepare workers. Resolves with
   *  page metrics at scale 1 for the requested page. */
  open(runId: string, pageIndex: number): Promise<PdfPageMetrics>;
  /** Metrics for an additional page of an already-open run. */
  getPageMetrics(runId: string, pageIndex: number): Promise<PdfPageMetrics>;
  renderBase(request: RenderBaseRequest): PdfRenderHandle;
  renderCrop(request: RenderCropRequest): PdfRenderHandle;
  /** Cancel all pending work for a run and release the worker documents. */
  closeRun(runId: string): void;
  dispose(): void;
  readonly workerCount: number;
}

/* ------------------------------------------------------------------ *
 * Scheduler API (viewer → scheduler).                                *
 * ------------------------------------------------------------------ */

export interface PdfRenderSchedulerOptions {
  /** Inject a pool (mock or real). Defaults to createPdfRenderPool(). */
  pool?: PdfRenderPool;
  /** Passed through to the default pool when `pool` is not injected. */
  poolOptions?: PdfRenderPoolOptions;
  /** Max simultaneously dispatched renders. Defaults to the pool worker
   *  count (capped at 3). */
  maxConcurrent?: number;
  now?: () => number;
}

export interface PdfSchedulerStats {
  queued: number;
  active: number;
  activeForeground: number;
  dropped: number;
  committed: number;
}

export interface PdfRenderScheduler {
  /** Open a run and mark the active page for the commit rule. */
  open(runId: string, pageIndex: number): Promise<PdfPageMetrics>;
  getPageMetrics(runId: string, pageIndex: number): Promise<PdfPageMetrics>;
  /** Mark the currently visible page; results for other pages are dropped. */
  setActivePage(runId: string, pageIndex: number): void;
  submitBase(request: RenderBaseRequest): PdfRenderHandle;
  submitCrop(request: RenderCropRequest): PdfRenderHandle;
  closeRun(runId: string): void;
  dispose(): void;
  readonly stats: PdfSchedulerStats;
}

/** Typed errors so consumers can distinguish cancellation from staleness
 *  from real failures (F4 keeps old pixels on stale; F5 asserts no stale
 *  commit). */
export class RenderAbortError extends Error {
  constructor(message = 'Render request cancelled') {
    super(message);
    this.name = 'RenderAbortError';
  }
}

export class RenderStaleError extends Error {
  constructor(message = 'Render request superseded by a newer generation') {
    super(message);
    this.name = 'RenderStaleError';
  }
}

export class RenderTimeoutError extends Error {
  constructor(message = 'Render request timed out') {
    super(message);
    this.name = 'RenderTimeoutError';
  }
}

/** Default bounded deadline for a render round-trip (mirrors legacy). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
