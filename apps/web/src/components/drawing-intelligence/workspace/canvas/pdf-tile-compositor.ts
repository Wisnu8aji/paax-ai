import type { LogicalRect } from './pdf-tile-coverage';
import { WebGlTileCompositorBackend, type CompositorBackend } from './pdf-tile-compositor-webgl';
import { Canvas2dTileCompositorBackend } from './pdf-tile-compositor-canvas2d';

export type PdfTileRendererKind = 'webgl2' | 'canvas2d';

export interface CompositorTile {
  key: string;
  revision: number;
  bitmap: ImageBitmap;
  rect: LogicalRect;
}

export interface CompositorFrame {
  documentKey: string;
  generation: number;
  pageWidth: number;
  pageHeight: number;
  tiles: readonly CompositorTile[];
}

export interface CompositorDiagnostics {
  renderer: PdfTileRendererKind;
  committedGeneration: number | null;
  textureCount: number;
  estimatedTextureBytes: number;
  contextLost: boolean;
}

export interface PdfTileCompositor {
  readonly kind: PdfTileRendererKind;
  upload(tile: CompositorTile): void;
  commit(frame: CompositorFrame): void;
  render(): void;
  release(keys: Iterable<string>): void;
  diagnostics(): CompositorDiagnostics;
  dispose(): void;
}

const WEBGL2_CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  premultipliedAlpha: true,
};

export function createPdfTileCompositor(canvas: HTMLCanvasElement): PdfTileCompositor {
  const gl = canvas.getContext('webgl2', WEBGL2_CONTEXT_ATTRIBUTES);
  if (gl) {
    const webGlBackend = new WebGlTileCompositorBackend(canvas, gl);
    if (webGlBackend.ready) {
      return new PdfTileCompositorWrapper(canvas, webGlBackend);
    }
    webGlBackend.dispose();
  }
  return new PdfTileCompositorWrapper(canvas, new Canvas2dTileCompositorBackend(canvas));
}

/**
 * Stable failover wrapper. It owns the current backend and retains non-owning
 * CompositorTile descriptors for uploaded/committed manifests so the backend
 * can re-upload after context restoration or redraw after a Canvas2D swap.
 * It never closes bitmaps; TileLru owns every supplied ImageBitmap.
 */
class PdfTileCompositorWrapper implements PdfTileCompositor {
  private readonly canvas: HTMLCanvasElement;
  private backend: CompositorBackend;
  private readonly descriptors = new Map<string, CompositorTile>();
  private committedFrame: CompositorFrame | null = null;
  private lossCount = 0;

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.handleContextLost();
  };

  private readonly onContextRestored = (): void => {
    this.handleContextRestored();
  };

  constructor(canvas: HTMLCanvasElement, backend: CompositorBackend) {
    this.canvas = canvas;
    this.backend = backend;
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  get kind(): PdfTileRendererKind {
    return this.backend.kind;
  }

  upload(tile: CompositorTile): void {
    this.descriptors.set(tile.key, tile);
    this.backend.upload(tile);
  }

  commit(frame: CompositorFrame): void {
    this.committedFrame = frame;
    for (const tile of frame.tiles) this.descriptors.set(tile.key, tile);
    this.backend.commit(frame);
  }

  render(): void {
    this.backend.render();
  }

  release(keys: Iterable<string>): void {
    for (const key of keys) this.descriptors.delete(key);
    this.backend.release(keys);
  }

  diagnostics(): CompositorDiagnostics {
    const backendDiagnostics = this.backend.diagnostics();
    return {
      renderer: this.backend.kind,
      committedGeneration: this.committedFrame ? this.committedFrame.generation : null,
      textureCount: backendDiagnostics.textureCount,
      estimatedTextureBytes: backendDiagnostics.estimatedTextureBytes,
      contextLost: backendDiagnostics.contextLost,
    };
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.backend.dispose();
    this.descriptors.clear();
    this.committedFrame = null;
  }

  private handleContextLost(): void {
    if (this.backend.kind !== 'webgl2') return;
    this.backend.onContextLost();
    this.lossCount += 1;
    if (this.lossCount >= 2) this.swapToCanvas2d();
  }

  private handleContextRestored(): void {
    if (this.backend.kind !== 'webgl2' || !this.backend.lost) return;
    const rebuilt = this.backend.rebuild([...this.descriptors.values()]);
    if (!rebuilt) this.swapToCanvas2d();
  }

  private swapToCanvas2d(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.backend.dispose();
    this.backend = new Canvas2dTileCompositorBackend(this.canvas);
    if (this.committedFrame) this.backend.commit(this.committedFrame);
  }
}
