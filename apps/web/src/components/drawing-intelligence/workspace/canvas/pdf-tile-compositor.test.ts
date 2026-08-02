import { describe, expect, it } from 'vitest';

import {
  createPdfTileCompositor,
  type CompositorFrame,
  type CompositorTile,
  type PdfTileCompositor,
} from './pdf-tile-compositor';
import type { LogicalRect } from './pdf-tile-coverage';

const DEFAULT_RECT: LogicalRect = { x: 0, y: 0, width: 256, height: 256 };

function tile(
  key: string,
  bitmapWidth = 256,
  bitmapHeight = bitmapWidth,
  revision = 1,
  rect: LogicalRect = DEFAULT_RECT,
): CompositorTile {
  const bitmap = { width: bitmapWidth, height: bitmapHeight } as unknown as ImageBitmap;
  return { key, revision, bitmap, rect: { ...rect } };
}

function frame(generation: number, tiles: Array<CompositorTile | string>, pageWidth = 1024, pageHeight = 1024): CompositorFrame {
  return {
    documentKey: 'doc-1',
    generation,
    pageWidth,
    pageHeight,
    tiles: tiles.map((entry) => (typeof entry === 'string' ? tile(entry) : entry)),
  };
}

type FakeListener = (event: unknown) => void;

class FakeCanvas {
  width = 800;
  height = 600;
  private readonly listeners = new Map<string, Set<FakeListener>>();
  constructor(
    private readonly webGl: FakeWebGl2 | null,
    private readonly ctx2d: Fake2dContext | null,
  ) {}

  getContext(type: string, _options?: unknown): unknown {
    if (type === 'webgl2') return this.webGl;
    if (type === '2d') return this.ctx2d;
    return null;
  }

  addEventListener(type: string, listener: FakeListener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: FakeListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class Fake2dContext {
  readonly drawCalls: Array<{ bitmap: ImageBitmap; x: number; y: number; width: number; height: number }> = [];

  clearRect(_x: number, _y: number, _width: number, _height: number): void {}

  drawImage(bitmap: ImageBitmap, x: number, y: number, width: number, height: number): void {
    this.drawCalls.push({ bitmap, x, y, width, height });
  }
}

class FakeWebGl2 {
  readonly VERTEX_SHADER = 0x8b31;
  readonly FRAGMENT_SHADER = 0x8b30;
  readonly COMPILE_STATUS = 0x8b81;
  readonly LINK_STATUS = 0x8b82;
  readonly ARRAY_BUFFER = 0x8892;
  readonly DYNAMIC_DRAW = 0x88e8;
  readonly FLOAT = 0x1406;
  readonly TRIANGLES = 0x0004;
  readonly TEXTURE_2D = 0x0de1;
  readonly TEXTURE0 = 0x84c0;
  readonly ACTIVE_TEXTURE = 0x84e0;
  readonly TEXTURE_MIN_FILTER = 0x2801;
  readonly TEXTURE_MAG_FILTER = 0x2800;
  readonly TEXTURE_WRAP_S = 0x2802;
  readonly TEXTURE_WRAP_T = 0x2803;
  readonly LINEAR = 0x2601;
  readonly CLAMP_TO_EDGE = 0x812f;
  readonly UNPACK_PREMULTIPLY_ALPHA_WEBGL = 0x9241;
  readonly RGBA = 0x1908;
  readonly RGBA8 = 0x8058;
  readonly UNSIGNED_BYTE = 0x1401;
  readonly COLOR_BUFFER_BIT = 0x4000;
  readonly BLEND = 0x0be2;
  readonly DEPTH_TEST = 0x0b71;
  readonly CULL_FACE = 0x0b44;
  readonly ONE = 1;
  readonly ONE_MINUS_SRC_ALPHA = 0x0303;
  readonly FUNC_ADD = 0x8006;

  readonly drawnKeyGroups: string[][] = [];
  failCompile: boolean;
  private boundTexture: { __paaxTileKey?: string } | null = null;
  private drawnInGroup: string[] = [];

  constructor(options: { failCompile?: boolean } = {}) {
    this.failCompile = options.failCompile ?? false;
  }

  lastDrawnKeys(): string[] {
    if (this.drawnInGroup.length > 0) return [...this.drawnInGroup];
    return this.drawnKeyGroups.length > 0 ? [...this.drawnKeyGroups[this.drawnKeyGroups.length - 1]] : [];
  }

  createShader(_type: number): Record<string, unknown> {
    return {};
  }
  shaderSource(_shader: Record<string, unknown>, _source: string): void {}
  compileShader(_shader: Record<string, unknown>): void {}
  getShaderParameter(_shader: Record<string, unknown>, pname: number): unknown {
    return pname === this.COMPILE_STATUS ? !this.failCompile : true;
  }
  getShaderInfoLog(_shader: Record<string, unknown>): string {
    return this.failCompile ? 'fake compile failure' : '';
  }
  deleteShader(_shader: Record<string, unknown>): void {}

  createProgram(): Record<string, unknown> {
    return {};
  }
  attachShader(_program: Record<string, unknown>, _shader: Record<string, unknown>): void {}
  linkProgram(_program: Record<string, unknown>): void {}
  getProgramParameter(_program: Record<string, unknown>, pname: number): unknown {
    return pname === this.LINK_STATUS ? !this.failCompile : true;
  }
  getProgramInfoLog(_program: Record<string, unknown>): string {
    return this.failCompile ? 'fake link failure' : '';
  }
  deleteProgram(_program: Record<string, unknown>): void {}
  useProgram(_program: Record<string, unknown>): void {}
  getAttribLocation(_program: Record<string, unknown>, _name: string): number {
    return 0;
  }
  getUniformLocation(_program: Record<string, unknown>, name: string): { name: string } {
    return { name };
  }

  createBuffer(): Record<string, unknown> {
    return {};
  }
  bindBuffer(_target: number, _buffer: Record<string, unknown> | null): void {}
  bufferData(_target: number, _data: unknown, _usage: number): void {}
  deleteBuffer(_buffer: Record<string, unknown> | null): void {}
  enableVertexAttribArray(_location: number): void {}
  vertexAttribPointer(_location: number, _size: number, _type: number, _normalized: boolean, _stride: number, _offset: number): void {}

  createTexture(): { __paaxTileKey?: string } {
    return {};
  }
  deleteTexture(_texture: { __paaxTileKey?: string } | null): void {}
  bindTexture(_target: number, texture: { __paaxTileKey?: string } | null): void {
    this.boundTexture = texture;
  }
  pixelStorei(_pname: number, _param: number): void {}
  texParameteri(_target: number, _pname: number, _param: number): void {}
  texImage2D(
    _target: number,
    _level: number,
    _internalformat: number,
    _format: number,
    _type: number,
    _source: ImageBitmap,
  ): void {}
  activeTexture(_texture: number): void {}
  uniform1i(_location: { name: string } | null, _value: number): void {}
  uniform2f(_location: { name: string } | null, _x: number, _y: number): void {}
  viewport(_x: number, _y: number, _width: number, _height: number): void {}
  clearColor(_r: number, _g: number, _b: number, _a: number): void {}
  clear(mask: number): void {
    if (mask === this.COLOR_BUFFER_BIT) {
      this.drawnKeyGroups.push(this.drawnInGroup);
      this.drawnInGroup = [];
    }
  }
  enable(_capability: number): void {}
  disable(_capability: number): void {}
  blendFunc(_sfactor: number, _dfactor: number): void {}
  blendEquation(_mode: number): void {}
  drawArrays(_mode: number, _first: number, _count: number): void {
    const key = this.boundTexture?.__paaxTileKey;
    if (key) this.drawnInGroup.push(key);
  }
}

let activeFakeGl: FakeWebGl2 | null = null;
let activeCanvas: FakeCanvas | null = null;

function createWithFakeWebGl(options: { failCompile?: boolean } = {}): PdfTileCompositor {
  activeFakeGl = new FakeWebGl2(options);
  activeCanvas = new FakeCanvas(activeFakeGl, new Fake2dContext());
  return createPdfTileCompositor(activeCanvas as unknown as HTMLCanvasElement);
}

function createWithNoWebGl(): PdfTileCompositor {
  activeFakeGl = null;
  activeCanvas = new FakeCanvas(null, new Fake2dContext());
  return createPdfTileCompositor(activeCanvas as unknown as HTMLCanvasElement);
}

function lastDrawnKeys(): string[] {
  return activeFakeGl ? activeFakeGl.lastDrawnKeys() : [];
}

function emit(eventType: string, event: unknown): void {
  activeCanvas?.emit(eventType, event);
}

function flushFrames(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

function fake2dDrawCalls(): Fake2dContext['drawCalls'] {
  const ctx = activeCanvas?.getContext('2d') as Fake2dContext | null;
  return ctx ? ctx.drawCalls : [];
}

describe('pdf tile compositor', () => {
  it('prefers WebGL2 and atomically replaces the committed manifest', () => {
    const compositor = createWithFakeWebGl();
    compositor.upload(tile('a'));
    compositor.upload(tile('b'));
    compositor.commit(frame(1, ['a', 'b']));
    expect(compositor.diagnostics()).toMatchObject({ renderer: 'webgl2', committedGeneration: 1, textureCount: 2 });
  });

  it('does not expose a partially uploaded candidate before commit', async () => {
    const compositor = createWithFakeWebGl();
    compositor.commit(frame(1, ['old']));
    await flushFrames();
    compositor.upload(tile('new-left'));
    await flushFrames();
    expect(lastDrawnKeys()).toEqual(['old']);
  });

  it('falls back to Canvas2D when WebGL2 creation fails', () => {
    expect(createWithNoWebGl().kind).toBe('canvas2d');
  });

  it('falls back to Canvas2D when shader compilation fails', () => {
    expect(createWithFakeWebGl({ failCompile: true }).kind).toBe('canvas2d');
  });

  it('releases retired textures and resets byte accounting on dispose', () => {
    const compositor = createWithFakeWebGl();
    compositor.upload(tile('a', 512, 512));
    compositor.release(['a']);
    expect(compositor.diagnostics()).toMatchObject({ textureCount: 0, estimatedTextureBytes: 0 });
  });

  it('defers texture deletion while the committed manifest still references it', async () => {
    const compositor = createWithFakeWebGl();
    compositor.commit(frame(1, ['a']));
    await flushFrames();
    compositor.release(['a']);
    expect(compositor.diagnostics()).toMatchObject({ textureCount: 1 });
    compositor.commit(frame(2, []));
    expect(compositor.diagnostics()).toMatchObject({ textureCount: 0, estimatedTextureBytes: 0 });
  });

  it('replaces textures per key+revision without changing the committed frame', async () => {
    const compositor = createWithFakeWebGl();
    compositor.upload(tile('a', 256, 256, 1));
    compositor.commit(frame(1, ['a']));
    await flushFrames();
    compositor.upload(tile('a', 256, 256, 2));
    await flushFrames();
    expect(lastDrawnKeys()).toEqual(['a']);
    expect(compositor.diagnostics()).toMatchObject({ textureCount: 2, estimatedTextureBytes: 512 * 1024 });
    compositor.commit(frame(2, [tile('a', 256, 256, 2)]));
    await flushFrames();
    expect(compositor.diagnostics()).toMatchObject({ textureCount: 1, estimatedTextureBytes: 256 * 1024 });
  });

  it('upload alone never draws', async () => {
    const compositor = createWithFakeWebGl();
    compositor.upload(tile('x'));
    await flushFrames();
    expect(lastDrawnKeys()).toEqual([]);
  });

  it('marks diagnostics lost on context loss and rebuilds from retained descriptors', async () => {
    const compositor = createWithFakeWebGl();
    compositor.upload(tile('a'));
    compositor.commit(frame(1, ['a']));
    await flushFrames();
    emit('webglcontextlost', { preventDefault() {} });
    expect(compositor.diagnostics()).toMatchObject({ contextLost: true, textureCount: 0, estimatedTextureBytes: 0 });
    emit('webglcontextrestored', {});
    await flushFrames();
    expect(compositor.diagnostics()).toMatchObject({ contextLost: false, textureCount: 1 });
    expect(lastDrawnKeys()).toEqual(['a']);
  });

  it('swaps to Canvas2D after a second context loss without changing the wrapper', async () => {
    const compositor = createWithFakeWebGl();
    compositor.commit(frame(1, ['a']));
    await flushFrames();
    emit('webglcontextlost', { preventDefault() {} });
    emit('webglcontextrestored', {});
    await flushFrames();
    emit('webglcontextlost', { preventDefault() {} });
    expect(compositor.kind).toBe('canvas2d');
    expect(compositor.diagnostics()).toMatchObject({ renderer: 'canvas2d', committedGeneration: 1 });
    expect(fake2dDrawCalls().length).toBeGreaterThan(0);
  });

  it('dispose cancels scheduled draws and drops all state and listeners', async () => {
    const compositor = createWithFakeWebGl();
    compositor.upload(tile('a'));
    compositor.commit(frame(1, ['a']));
    await flushFrames();
    compositor.dispose();
    expect(compositor.diagnostics()).toMatchObject({ textureCount: 0, estimatedTextureBytes: 0 });
    expect(activeCanvas?.listenerCount('webglcontextlost')).toBe(0);
    expect(activeCanvas?.listenerCount('webglcontextrestored')).toBe(0);
    emit('webglcontextlost', { preventDefault() {} });
    emit('webglcontextrestored', {});
  });
});
