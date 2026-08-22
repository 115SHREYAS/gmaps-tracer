import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const MIME: Record<string, string> = {
  ".pmtiles": "application/octet-stream",
  ".json": "application/json",
  ".png": "image/png",
};

async function resolveTilesRoot(): Promise<string> {
  const raw = process.env.TILES_PATH ?? "./tiles";
  const direct = path.resolve(raw);
  try {
    await stat(direct);
    return direct;
  } catch {}
  return path.resolve(process.cwd(), "..", "..", raw);
}

async function resolveFile(parts: string[]): Promise<{ filePath: string } | { error: Response }> {
  const root = await resolveTilesRoot();
  const rel = parts.map((p) => decodeURIComponent(p)).join("/");
  const filePath = path.resolve(root, rel);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    return { error: new Response("Forbidden", { status: 403 }) };
  }
  return { filePath };
}

async function handle(req: Request, parts: string[]): Promise<Response> {
  const resolved = await resolveFile(parts);
  if ("error" in resolved) return resolved.error;
  const { filePath } = resolved;

  let st;
  try {
    st = await stat(filePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!st.isFile()) return new Response("Not found", { status: 404 });

  const type = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.get("range");

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      const start = m[1] ? Number.parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(Number.parseInt(m[2], 10), st.size - 1) : st.size - 1;
      if (Number.isNaN(start) || start > end || start >= st.size) {
        return new Response(null, {
          status: 416,
          headers: { "content-range": `bytes */${st.size}` },
        });
      }
      const stream = Readable.toWeb(
        createReadStream(filePath, { start, end }),
      ) as unknown as ReadableStream;
      return new Response(stream, {
        status: 206,
        headers: {
          "content-type": type,
          "content-length": String(end - start + 1),
          "content-range": `bytes ${start}-${end}/${st.size}`,
          "accept-ranges": "bytes",
          "cache-control": "public, max-age=3600",
        },
      });
    }
  }

  const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      "content-type": type,
      "content-length": String(st.size),
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=3600",
    },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  return handle(req, parts);
}

export async function HEAD(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const res = await handle(req, parts);
  return new Response(null, { status: res.status, headers: res.headers });
}
