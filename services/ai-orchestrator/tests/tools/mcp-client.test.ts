import { createServer, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import { createHttpMcpClient, createStdioMcpClient } from "../../src/tools/mcp/client";
import type { McpServerConfig } from "../../src/tools/mcp/types";

const stdioScript = [
  "let buffer='';",
  "process.stdin.setEncoding('utf8');",
  "process.stdin.on('data',chunk=>{buffer+=chunk;let index;while((index=buffer.indexOf('\\n'))>=0){const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);if(!line)continue;const req=JSON.parse(line);if(req.id===undefined)continue;let result={};if(req.method==='tools/list')result={tools:[{name:'echo',description:'Echo fixture',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']}}]};else if(req.method==='tools/call')result={content:[{type:'text',text:String(req.params.arguments.text)}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result})+'\\n');}});",
].join("");

function stdioConfig(args: readonly string[] = ["-e", stdioScript]): Extract<McpServerConfig, { transport: "stdio" }> {
  return { transport: "stdio", id: "fake", command: process.execPath, args, env: {} };
}

describe("bounded MCP JSON-RPC clients", () => {
  it("completes stdio initialize/list/call with fixed args and closes", async () => {
    const client = createStdioMcpClient(stdioConfig(), { timeoutMs: 2_000 });
    await expect(client.initialize()).resolves.toBeUndefined();
    await expect(client.listTools()).resolves.toMatchObject([{ name: "echo" }]);
    await expect(client.callTool("echo", { text: "fixture" })).resolves.toMatchObject({ content: [{ text: "fixture" }] });
    await expect(client.close()).resolves.toBeUndefined();
  });

  it("fails closed for malformed or oversized stdio frames and timeout", async () => {
    const malformed = createStdioMcpClient(stdioConfig(["-e", "process.stdin.on('data',()=>process.stdout.write('not-json\\n'))"]), { timeoutMs: 500 });
    await expect(malformed.initialize()).rejects.toThrow(/json|response|protocol/i);
    await malformed.close();

    const oversized = createStdioMcpClient(stdioConfig(["-e", "process.stdin.on('data',()=>process.stdout.write('x'.repeat(200)+'\\n'))"]), { timeoutMs: 500, maxFrameBytes: 64 });
    await expect(oversized.initialize()).rejects.toThrow(/frame|size|limit/i);
    await oversized.close();

    const slow = createStdioMcpClient(stdioConfig(["-e", "process.stdin.on('data',()=>{})"]), { timeoutMs: 30 });
    await expect(slow.initialize()).rejects.toThrow(/timeout|timed out|response/i);
    await slow.close();

    const wrongId = createStdioMcpClient(stdioConfig(["-e", "process.stdin.on('data',()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:999,result:{}})+'\\n'))"]), { timeoutMs: 500 });
    await expect(wrongId.initialize()).rejects.toThrow(/id|response/i);
    await wrongId.close();

    const aborted = createStdioMcpClient(stdioConfig(["-e", "process.stdin.on('data',()=>{})"]), { timeoutMs: 2_000 });
    const controller = new AbortController();
    const pending = aborted.initialize(controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/abort|cancel/i);
    await aborted.close();
  });

  it("completes bounded HTTP JSON-RPC against a local fake server", async () => {
    let server: Server | undefined;
    server = createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const parsed = JSON.parse(body) as { id: number; method: string; params?: { arguments?: { text?: string } } };
        const result = parsed.method === "tools/list"
          ? { tools: [{ name: "echo", description: "Echo fixture", inputSchema: { type: "object", properties: {} } }] }
          : { content: [{ type: "text", text: parsed.params?.arguments?.text ?? "ok" }] };
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ jsonrpc: "2.0", id: parsed.id, result }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("fake server address unavailable");
      const config: McpServerConfig = { transport: "http", id: "fake-http", url: `http://127.0.0.1:${address.port}/mcp`, headers: {} };
      const client = createHttpMcpClient(config, { allowedHosts: ["127.0.0.1"], timeoutMs: 2_000 });
      await client.initialize();
      await expect(client.listTools()).resolves.toMatchObject([{ name: "echo" }]);
      await expect(client.callTool("echo", { text: "http-fixture" })).resolves.toMatchObject({ content: [{ text: "http-fixture" }] });
      await client.close();
    } finally {
      await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    }
  });
});
