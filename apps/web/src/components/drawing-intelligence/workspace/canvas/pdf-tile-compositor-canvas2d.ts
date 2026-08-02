import type { CompositorDiagnostics, CompositorFrame, CompositorTile } from './pdf-tile-compositor';
import type { CompositorBackend } from './pdf-tile-compositor-webgl';

/**
 * Behaviorally identical Canvas2D fallback. It draws only on commit or an
 * explicit render call, never calls getImageData, and obeys the same atomic
 * manifest rules: an upload alone can never alter the visible frame, and the
 * committed manifest keeps drawing until the next commit replaces it.
 */
export class Canvas2dTileCompositorBackend implements CompositorBackend {
  readonly kind = 'canvas2d' as const;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private committedFrame: CompositorFrame | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
  }

  get lost(): boolean {
    return false;
  }

  get ready(): boolean {
    return true;
  }

  upload(_tile: CompositorTile): void {
    // Bitmaps are drawn straight from the committed manifest at commit time.
  }

  commit(frame: CompositorFrame): void {
    this.committedFrame = frame;
    this.render();
  }

  render(): void {
    const ctx = this.ctx;
    const frame = this.committedFrame;
    if (!ctx || !frame) return;
    if (frame.pageWidth <= 0 || frame.pageHeight <= 0) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width <= 0 || height <= 0) return;
    const scaleX = width / frame.pageWidth;
    const scaleY = height / frame.pageHeight;
    ctx.clearRect(0, 0, width, height);
    for (const tile of frame.tiles) {
      try {
        ctx.drawImage(
          tile.bitmap,
          tile.rect.x * scaleX,
          tile.rect.y * scaleY,
          tile.rect.width * scaleX,
          tile.rect.height * scaleY,
        );
      } catch {
        // A bitmap closed by TileLru is no longer drawable; skip it.
      }
    }
  }

  release(_keys: Iterable<string>): void {
    // The committed frame keeps drawing until the next commit replaces it.
  }

  onContextLost(): void {
    // Canvas2D contexts do not suffer GPU context loss.
  }

  rebuild(_descriptors: readonly CompositorTile[]): boolean {
    return true;
  }

  diagnostics(): Pick<CompositorDiagnostics, 'textureCount' | 'estimatedTextureBytes' | 'contextLost'> {
    return { textureCount: 0, estimatedTextureBytes: 0, contextLost: false };
  }

  dispose(): void {
    this.committedFrame = null;
  }
}
