import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const context = { params: Promise.resolve({ path: ["drawings", "dem", "run-range", "artifact"] }) };

describe("document intelligence proxy artifact transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forwards byte-cache request headers and preserves a 206 streaming response", async () => {
    const upstreamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("range")).toBe("bytes=0-2");
      expect(headers.get("if-range")).toBe('"source-etag"');
      expect(headers.get("if-none-match")).toBe('"source-etag"');
      expect(headers.get("x-internal-key")).toBe("test-internal-key");
      return new Response(upstreamBody, {
        status: 206,
        headers: {
          "content-type": "application/pdf",
          "content-length": "3",
          "content-range": "bytes 0-2/9",
          "accept-ranges": "bytes",
          etag: '"source-etag"',
          "cache-control": "private, max-age=0, must-revalidate",
          "set-cookie": "session=upstream-secret",
          "x-upstream-debug": "do-not-forward",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("http://paax.test/api/document-intelligence/drawings/dem/run-range/artifact?token=signed", {
      headers: { Range: "bytes=0-2", "If-Range": '"source-etag"', "If-None-Match": '"source-etag"' },
    });
    const response = await GET(request, context);

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-2/9");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("etag")).toBe('"source-etag"');
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-upstream-debug")).toBeNull();
    await expect(response.arrayBuffer()).resolves.toEqual(new Uint8Array([1, 2, 3]).buffer);
  });

  it("preserves a 304 response without reading or transforming its body", async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 304,
      headers: { etag: '"source-etag"', "accept-ranges": "bytes", "cache-control": "private, max-age=0, must-revalidate" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://paax.test/api/document-intelligence/drawings/dem/run-range/artifact?token=signed", {
      headers: { "If-None-Match": '"source-etag"' },
    }), context);

    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe('"source-etag"');
    await expect(response.arrayBuffer()).resolves.toEqual(new ArrayBuffer(0));
  });
});
