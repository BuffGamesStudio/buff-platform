import { createReadStream } from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    segments: string[];
  }>;
};

const RUNTIME_MEDIA_ROOT = path.join(
  process.cwd(),
  "public",
  "media",
  "movie-buff",
  "runtime-generated",
);

const CONTENT_TYPES: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".webm": "video/webm",
};

function resolveRuntimeMediaPath(segments: string[]) {
  if (
    !Array.isArray(segments) ||
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        !/^[A-Za-z0-9._-]+$/.test(segment),
    )
  ) {
    return null;
  }

  const filePath = path.resolve(
    RUNTIME_MEDIA_ROOT,
    ...segments,
  );
  const relativePath = path.relative(
    RUNTIME_MEDIA_ROOT,
    filePath,
  );

  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  return filePath;
}

function parseRange(
  value: string | null,
  fileSize: number,
) {
  if (!value) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(
    value.trim(),
  );
  if (!match) return false;

  const rawStart = match[1];
  const rawEnd = match[2];
  if (!rawStart && !rawEnd) return false;

  let start: number;
  let end: number;

  if (!rawStart) {
    const suffixLength = Number.parseInt(
      rawEnd,
      10,
    );
    if (
      !Number.isSafeInteger(suffixLength) ||
      suffixLength <= 0
    ) {
      return false;
    }
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number.parseInt(rawStart, 10);
    end = rawEnd
      ? Number.parseInt(rawEnd, 10)
      : fileSize - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return false;
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  };
}

async function serveRuntimeMedia(
  request: Request,
  context: RouteContext,
  headOnly: boolean,
) {
  const { segments } = await context.params;
  const filePath = resolveRuntimeMediaPath(segments);

  if (!filePath) {
    return new Response("Not found.", {
      status: 404,
    });
  }

  let stats;
  try {
    stats = await fsp.stat(filePath);
  } catch {
    return new Response("Not found.", {
      status: 404,
    });
  }

  if (!stats.isFile()) {
    return new Response("Not found.", {
      status: 404,
    });
  }

  const contentType =
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream";
  const range = parseRange(
    request.headers.get("range"),
    stats.size,
  );

  if (range === false) {
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${stats.size}`,
      },
    });
  }

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store, max-age=0",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });

  if (range) {
    const contentLength = range.end - range.start + 1;
    headers.set(
      "Content-Length",
      String(contentLength),
    );
    headers.set(
      "Content-Range",
      `bytes ${range.start}-${range.end}/${stats.size}`,
    );

    if (headOnly) {
      return new Response(null, {
        status: 206,
        headers,
      });
    }

    const stream = createReadStream(filePath, {
      start: range.start,
      end: range.end,
    });

    return new Response(
      Readable.toWeb(stream) as ReadableStream<Uint8Array>,
      {
        status: 206,
        headers,
      },
    );
  }

  headers.set(
    "Content-Length",
    String(stats.size),
  );

  if (headOnly) {
    return new Response(null, {
      status: 200,
      headers,
    });
  }

  const stream = createReadStream(filePath);
  return new Response(
    Readable.toWeb(stream) as ReadableStream<Uint8Array>,
    {
      status: 200,
      headers,
    },
  );
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  return serveRuntimeMedia(
    request,
    context,
    false,
  );
}

export async function HEAD(
  request: Request,
  context: RouteContext,
) {
  return serveRuntimeMedia(
    request,
    context,
    true,
  );
}
