/*
 * PAAX worker protocol contract — `pdf-tile.worker.ts` inbound messages.
 *
 * The WRITTEN CONTRACT for extending `render-tile` with an optional
 * arbitrary `scale` + `dark` flag, while keeping legacy density-based
 * messages fully backward compatible.
 *
 * Contract semantics (discriminated on the presence of `scale`):
 *   - `tile.density` present, no `scale`  → LEGACY pyramid message. density is
 *     a pyramid-quantized density; behaviour unchanged from today.
 *   - `scale` present (density absent)    → EXTENDED detail message. scale is
 *     an ARBITRARY render density (device px per logical pt), uncapped by the
 *     pyramid; only the region-canvas cap (cropDensityCapPAAX) applies.
 *     `dark` optionally requests a dark-mode raster.
 */

/** Region in the page's logical (PDF point) space — the same space as the
 *  existing `tile` rect in pdf-tile.worker.ts. */
export interface RenderTileRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Legacy density-based `render-tile` payload (pyramid-quantized density). */
export interface RenderTileLegacyMessage {
  type: 'render-tile';
  requestId: number;
  documentKey: string;
  pageNumber: number;
  tile: RenderTileRegion & { density: number };
}

/** Extended detail `render-tile` payload: arbitrary scale, uncapped by the
 *  pyramid, optional dark flag. Presence of `scale` discriminates this from
 *  the legacy message — see `isRenderTileDetailMessage`. */
export interface RenderTileDetailMessage {
  type: 'render-tile';
  requestId: number;
  documentKey: string;
  pageNumber: number;
  tile: RenderTileRegion;
  /** Arbitrary render density in device px per logical pt. Not pyramid-
   *  quantized and not capped by MAX_TILE_DENSITY; only the region-canvas
   *  cap (cropDensityCapPAAX) applies. */
  scale: number;
  /** Dark-mode raster flag (negative/inverted rendering). */
  dark?: boolean;
}

/** Backward-compatible `render-tile` union: legacy density-based messages
 *  keep working unchanged; detail messages add {scale, dark}. */
export type RenderTileMessage = RenderTileLegacyMessage | RenderTileDetailMessage;

/** Client-side detail render request (pre-wire). requestId and cache keys are
 *  assigned by the pool at wire time; the detail overlay and pool exchange
 *  this logical shape. */
export interface DetailRenderRequest {
  documentKey: string;
  pageNumber: number;
  /** Visible region (+ DETAIL_MARGIN_PAAX) in logical PDF-point space. */
  region: RenderTileRegion;
  /** Density = zoom × dpr — arbitrary, uncapped except cropDensityCapPAAX. */
  scale: number;
  /** Dark-mode raster flag. */
  dark?: boolean;
}

/** Remaining inbound worker messages — kept identical to the existing
 *  implementation so the written contract matches the wire today. */
export interface OpenDocumentMessage {
  type: 'open-document';
  documentKey: string;
  pageNumber?: number;
  /** Binary ArrayBuffer payload of the original PDF; never a URL. */
  data: ArrayBuffer;
}
export interface GetPageMetricsMessage {
  type: 'get-page-metrics';
  requestId: number;
  documentKey: string;
  pageNumber: number;
}
export interface CloseDocumentMessage {
  type: 'close-document';
  documentKey: string;
}
export interface CloseRunMessage {
  type: 'close-run';
  runId: string;
}
export interface CancelMessage {
  type: 'cancel';
  requestId: number;
  documentKey: string;
}

/** Full inbound worker protocol union (written contract for the worker's
 *  onmessage handler). */
export type PdfWorkerInboundMessage =
  | OpenDocumentMessage
  | GetPageMetricsMessage
  | RenderTileMessage
  | CloseDocumentMessage
  | CloseRunMessage
  | CancelMessage;

/** True when an incoming `render-tile` message is the EXTENDED (scale-based)
 *  form. Legacy density-based messages return false — the worker must keep
 *  using tile.density for those. */
export function isRenderTileDetailMessage(message: unknown): message is RenderTileDetailMessage {
  if (typeof message !== 'object' || message === null) return false;
  const candidate = message as { type?: unknown; scale?: unknown };
  return candidate.type === 'render-tile' && typeof candidate.scale === 'number';
}

/** Effective render density for a `render-tile` message: explicit `scale`
 *  wins (extended detail message), otherwise the legacy pyramid `density`.
 *  Backward-compatible by construction. */
export function renderTileDensity(message: RenderTileMessage): number {
  return 'scale' in message ? message.scale : message.tile.density;
}
