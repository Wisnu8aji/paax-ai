import type { CompositorDiagnostics, CompositorFrame, CompositorTile, PdfTileRendererKind } from './pdf-tile-compositor';

export interface CompositorBackend {
  readonly kind: PdfTileRendererKind;
  readonly lost: boolean;
  readonly ready: boolean;
  upload(tile: CompositorTile): void;
  commit(frame: CompositorFrame): void;
  render(): void;
  release(keys: Iterable<string>): void;
  onContextLost(): void;
  rebuild(descriptors: readonly CompositorTile[]): boolean;
  diagnostics(): Pick<CompositorDiagnostics, 'textureCount' | 'estimatedTextureBytes' | 'contextLost'>;
  dispose(): void;
}

const requestFrame: (callback: () => void) => number =
  typeof requestAnimationFrame === 'function'
    ? (callback) => requestAnimationFrame(callback)
    : (callback) => (setTimeout(() => callback(), 0) as unknown) as number;

const cancelFrame: (handle: number) => void =
  typeof cancelAnimationFrame === 'function'
    ? (handle) => cancelAnimationFrame(handle)
    : (handle) => clearTimeout(handle as unknown as NodeJS.Timeout);

interface TextureEntry {
  key: string;
  revision: number;
  texture: WebGLTexture | null;
  bytes: number;
  retired: boolean;
}

type TextureWithKey = WebGLTexture & { __paaxTileKey?: string };

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 aPos;
in vec2 aUv;
uniform vec2 uPageSize;
out vec2 vUv;
void main() {
  vec2 ndc = vec2(
    aPos.x / uPageSize.x * 2.0 - 1.0,
    1.0 - aPos.y / uPageSize.y * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
  vUv = aUv;
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 oColor;
void main() {
  oColor = texture(uTex, vUv);
}
`;

export function textureId(key: string, revision: number): string {
  return `${key}\u0000${revision}`;
}

/**
 * GPU-first atomic compositor backend. One program, one position buffer, one
 * UV buffer, and one texture per tile key+revision. Uploads create textures as
 * candidates; only commit() replaces the visible manifest, and drawing happens
 * in a single scheduled animation-frame boundary so a candidate upload can
 * never partially alter the visible frame. Textures still referenced by the
 * committed manifest are never deleted early; release() defers them until a
 * commit retires them.
 */
export class WebGlTileCompositorBackend implements CompositorBackend {
  readonly kind = 'webgl2' as const;
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly textures = new Map<string, TextureEntry>();
  private program: WebGLProgram | null = null;
  private posBuffer: WebGLBuffer | null = null;
  private uvBuffer: WebGLBuffer | null = null;
  private aPosLocation = -1;
  private aUvLocation = -1;
  private uPageSizeLocation: WebGLUniformLocation | null = null;
  private uTexLocation: WebGLUniformLocation | null = null;
  private committedTiles: readonly CompositorTile[] | null = null;
  private pageWidth = 0;
  private pageHeight = 0;
  private rafPending = false;
  private rafHandle: number | null = null;
  private lostState = false;
  private readyState = false;

  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.readyState = this.init();
  }

  get lost(): boolean {
    return this.lostState;
  }

  get ready(): boolean {
    return this.readyState;
  }

  upload(tile: CompositorTile): void {
    if (this.lost || !this.ready) return;
    const id = textureId(tile.key, tile.revision);
    const existing = this.textures.get(id);
    if (existing) {
      if (existing.texture && this.uploadBitmap(existing.texture, tile)) {
        existing.bytes = tile.bitmap.width * tile.bitmap.height * 4;
      } else if (!existing.texture) {
        const texture = this.createTexture(tile);
        if (texture) {
          existing.texture = texture;
          existing.bytes = tile.bitmap.width * tile.bitmap.height * 4;
        }
      }
      return;
    }
    const texture = this.createTexture(tile);
    if (!texture) return;
    this.textures.set(id, {
      key: tile.key,
      revision: tile.revision,
      texture,
      bytes: tile.bitmap.width * tile.bitmap.height * 4,
      retired: false,
    });
    this.retireSuperseded(tile.key, id);
  }

  commit(frame: CompositorFrame): void {
    this.pageWidth = frame.pageWidth;
    this.pageHeight = frame.pageHeight;
    this.committedTiles = frame.tiles;
    if (!this.lost && this.ready) {
      for (const tile of frame.tiles) {
        const id = textureId(tile.key, tile.revision);
        const entry = this.textures.get(id);
        if (!entry || !entry.texture) this.upload(tile);
      }
      this.rebuildGeometry();
      this.scheduleRender();
    }
    this.sweepRetired();
  }

  render(): void {
    if (this.lost || !this.ready || !this.committedTiles || this.committedTiles.length === 0) return;
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width <= 0 || height <= 0 || this.pageWidth <= 0 || this.pageHeight <= 0) return;
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(this.aPosLocation);
    gl.vertexAttribPointer(this.aPosLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(this.aUvLocation);
    gl.vertexAttribPointer(this.aUvLocation, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(this.uPageSizeLocation, this.pageWidth, this.pageHeight);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uTexLocation, 0);
    for (let index = 0; index < this.committedTiles.length; index += 1) {
      const tile = this.committedTiles[index];
      const entry = this.textures.get(textureId(tile.key, tile.revision));
      if (!entry?.texture) continue;
      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
      gl.drawArrays(gl.TRIANGLES, index * 6, 6);
    }
  }

  release(keys: Iterable<string>): void {
    const materialized = Array.from(keys);
    const idsToDelete: string[] = [];
    for (const key of materialized) {
      for (const [id, entry] of this.textures) {
        if (entry.key !== key) continue;
        if (this.manifestReferences(entry)) {
          entry.retired = true;
        } else {
          idsToDelete.push(id);
        }
      }
    }
    for (const id of idsToDelete) this.deleteEntry(id);
  }

  onContextLost(): void {
    this.cancelScheduledRender();
    this.lostState = true;
    this.readyState = false;
    const gl = this.gl;
    if (this.program) gl.deleteProgram(this.program);
    if (this.posBuffer) gl.deleteBuffer(this.posBuffer);
    if (this.uvBuffer) gl.deleteBuffer(this.uvBuffer);
    this.program = null;
    this.posBuffer = null;
    this.uvBuffer = null;
    for (const entry of this.textures.values()) {
      if (entry.texture) gl.deleteTexture(entry.texture);
      entry.texture = null;
    }
  }

  rebuild(descriptors: readonly CompositorTile[]): boolean {
    if (this.ready) return true;
    if (!this.init()) return false;
    this.readyState = true;
    this.lostState = false;
    for (const tile of descriptors) this.upload(tile);
    if (this.committedTiles) this.rebuildGeometry();
    this.scheduleRender();
    return true;
  }

  diagnostics(): Pick<CompositorDiagnostics, 'textureCount' | 'estimatedTextureBytes' | 'contextLost'> {
    let textureCount = 0;
    let estimatedTextureBytes = 0;
    for (const entry of this.textures.values()) {
      if (!entry.texture) continue;
      textureCount += 1;
      estimatedTextureBytes += entry.bytes;
    }
    return { textureCount, estimatedTextureBytes, contextLost: this.lost };
  }

  dispose(): void {
    this.cancelScheduledRender();
    const gl = this.gl;
    if (!this.lost) {
      if (this.program) gl.deleteProgram(this.program);
      if (this.posBuffer) gl.deleteBuffer(this.posBuffer);
      if (this.uvBuffer) gl.deleteBuffer(this.uvBuffer);
      for (const entry of this.textures.values()) {
        if (entry.texture) gl.deleteTexture(entry.texture);
      }
    }
    this.textures.clear();
    this.committedTiles = null;
    this.program = null;
    this.posBuffer = null;
    this.uvBuffer = null;
    this.readyState = false;
  }

  private init(): boolean {
    const gl = this.gl;
    const program = gl.createProgram();
    if (!program) return false;
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) {
      if (vertexShader) gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
      gl.deleteProgram(program);
      return false;
    }
    gl.shaderSource(vertexShader, VERTEX_SHADER_SOURCE);
    gl.shaderSource(fragmentShader, FRAGMENT_SHADER_SOURCE);
    gl.compileShader(vertexShader);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS) || !gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteProgram(program);
      return false;
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteProgram(program);
      return false;
    }
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    const posBuffer = gl.createBuffer();
    const uvBuffer = gl.createBuffer();
    if (!posBuffer || !uvBuffer) {
      if (posBuffer) gl.deleteBuffer(posBuffer);
      if (uvBuffer) gl.deleteBuffer(uvBuffer);
      gl.deleteProgram(program);
      return false;
    }
    this.program = program;
    this.posBuffer = posBuffer;
    this.uvBuffer = uvBuffer;
    this.aPosLocation = gl.getAttribLocation(program, 'aPos');
    this.aUvLocation = gl.getAttribLocation(program, 'aUv');
    this.uPageSizeLocation = gl.getUniformLocation(program, 'uPageSize');
    this.uTexLocation = gl.getUniformLocation(program, 'uTex');
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    return true;
  }

  private createTexture(tile: CompositorTile): WebGLTexture | null {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) return null;
    (texture as TextureWithKey).__paaxTileKey = tile.key;
    if (!this.uploadBitmap(texture, tile)) {
      gl.deleteTexture(texture);
      return null;
    }
    return texture;
  }

  private uploadBitmap(texture: WebGLTexture, tile: CompositorTile): boolean {
    const gl = this.gl;
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, tile.bitmap);
      return true;
    } catch {
      return false;
    }
  }

  private retireSuperseded(key: string, currentId: string): void {
    const idsToDelete: string[] = [];
    for (const [id, entry] of this.textures) {
      if (entry.key !== key || id === currentId) continue;
      if (this.manifestReferences(entry)) {
        entry.retired = true;
      } else {
        idsToDelete.push(id);
      }
    }
    for (const id of idsToDelete) this.deleteEntry(id);
  }

  private sweepRetired(): void {
    const idsToDelete: string[] = [];
    for (const [id, entry] of this.textures) {
      if (!entry.retired) continue;
      if (this.manifestReferences(entry)) continue;
      idsToDelete.push(id);
    }
    for (const id of idsToDelete) this.deleteEntry(id);
  }

  private deleteEntry(id: string): void {
    const entry = this.textures.get(id);
    if (!entry) return;
    this.textures.delete(id);
    if (entry.texture) this.gl.deleteTexture(entry.texture);
  }

  private manifestReferences(entry: TextureEntry): boolean {
    const committedTiles = this.committedTiles;
    if (!committedTiles) return false;
    for (const tile of committedTiles) {
      if (tile.key === entry.key && tile.revision === entry.revision) return true;
    }
    return false;
  }

  private rebuildGeometry(): void {
    const tiles = this.committedTiles;
    if (!tiles || tiles.length === 0) return;
    const gl = this.gl;
    const positions = new Float32Array(tiles.length * 12);
    const uvs = new Float32Array(tiles.length * 12);
    for (let i = 0; i < tiles.length; i += 1) {
      const tile = tiles[i];
      const x0 = tile.rect.x;
      const y0 = tile.rect.y;
      const x1 = tile.rect.x + tile.rect.width;
      const y1 = tile.rect.y + tile.rect.height;
      const offset = i * 12;
      positions[offset] = x0;
      positions[offset + 1] = y0;
      positions[offset + 2] = x1;
      positions[offset + 3] = y0;
      positions[offset + 4] = x0;
      positions[offset + 5] = y1;
      positions[offset + 6] = x1;
      positions[offset + 7] = y0;
      positions[offset + 8] = x1;
      positions[offset + 9] = y1;
      positions[offset + 10] = x0;
      positions[offset + 11] = y1;
      uvs[offset] = 0;
      uvs[offset + 1] = 0;
      uvs[offset + 2] = 1;
      uvs[offset + 3] = 0;
      uvs[offset + 4] = 0;
      uvs[offset + 5] = 1;
      uvs[offset + 6] = 1;
      uvs[offset + 7] = 0;
      uvs[offset + 8] = 1;
      uvs[offset + 9] = 1;
      uvs[offset + 10] = 0;
      uvs[offset + 11] = 1;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.DYNAMIC_DRAW);
  }

  private scheduleRender(): void {
    if (this.rafPending) return;
    this.rafPending = true;
    this.rafHandle = requestFrame(() => {
      this.rafPending = false;
      this.rafHandle = null;
      this.render();
    });
  }

  private cancelScheduledRender(): void {
    if (this.rafHandle !== null) {
      cancelFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.rafPending = false;
  }
}
