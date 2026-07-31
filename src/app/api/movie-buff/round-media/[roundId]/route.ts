import fs from "node:fs";
import fsp from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

import { getRoundGeneratedClip } from "@/lib/server/movieClipper";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    roundId: string;
  }>;
};

async function buildRoundMediaResponse(
  request: Request,
  roundId: string,
  headOnly: boolean,
) {
  try {
    const summary =
      await getRoundGeneratedClip(roundId);

    if (!summary.assetPath) {
      return NextResponse.redirect(
        new URL(summary.assetUrl, request.url),
        {
          status: 307,
          headers: {
            "Cache-Control":
              "no-store, max-age=0",
          },
        },
      );
    }

    const stats = await fsp.stat(summary.assetPath);
    const contentType =
      summary.clipType === "audio"
        ? "audio/mpeg"
        : "video/mp4";
    const baseHeaders = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store, max-age=0",
      "Content-Length": stats.size.toString(),
      "Content-Type": contentType,
      "X-Movie-Buff-Asset-Url":
        summary.assetUrl,
    };

    if (headOnly) {
      return new NextResponse(null, {
        status: 200,
        headers: baseHeaders,
      });
    }

    const rangeHeader =
      request.headers.get("range");

    if (rangeHeader) {
      const [startRaw, endRaw] = rangeHeader
        .replace(/bytes=/i, "")
        .split("-");
      const start = Number.parseInt(
        startRaw ?? "",
        10,
      );
      const requestedEnd = Number.parseInt(
        endRaw ?? "",
        10,
      );

      if (
        Number.isFinite(start) &&
        start >= 0 &&
        start < stats.size
      ) {
        const end =
          Number.isFinite(requestedEnd) &&
          requestedEnd >= start
            ? Math.min(requestedEnd, stats.size - 1)
            : stats.size - 1;
        const chunkSize = end - start + 1;
        const stream = fs.createReadStream(
          summary.assetPath,
          {
            start,
            end,
          },
        );

        return new NextResponse(
          Readable.toWeb(stream) as ReadableStream,
          {
            status: 206,
            headers: {
              ...baseHeaders,
              "Content-Length":
                chunkSize.toString(),
              "Content-Range": `bytes ${start}-${end}/${stats.size}`,
            },
          },
        );
      }
    }

    const stream = fs.createReadStream(
      summary.assetPath,
    );

    return new NextResponse(
      Readable.toWeb(stream) as ReadableStream,
      {
        status: 200,
        headers: baseHeaders,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Round media could not be generated.",
      },
      { status: 500 },
    );
  }
}

export async function GET(
  request: Request,
  context: RouteContext,
) {
  const { roundId } = await context.params;

  return buildRoundMediaResponse(
    request,
    roundId,
    false,
  );
}

export async function HEAD(
  request: Request,
  context: RouteContext,
) {
  const { roundId } = await context.params;

  return buildRoundMediaResponse(
    request,
    roundId,
    true,
  );
}
