import fsp from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { getRoundGeneratedClip } from "@/lib/server/movieClipper";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    roundId: string;
  }>;
};

const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

function getRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || request.headers.get("host") || requestUrl.host;
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol = forwardedProtocol || requestUrl.protocol.replace(/:$/, "");

  return new URL(`${protocol}://${host}`).origin;
}

function redirectToResolvedAsset(
  request: Request,
  assetUrl: string,
) {
  const internalRequestUrl = new URL(request.url);
  const browserOrigin = getRequestOrigin(request);
  const browserOriginUrl = new URL(browserOrigin);
  const resolvedAsset = new URL(assetUrl, internalRequestUrl);
  const redirectUrl =
    LOOPBACK_HOSTNAMES.has(browserOriginUrl.hostname) &&
    LOOPBACK_HOSTNAMES.has(resolvedAsset.hostname)
      ? new URL(
          `${resolvedAsset.pathname}${resolvedAsset.search}`,
          browserOrigin,
        )
      : resolvedAsset;

  return NextResponse.redirect(
    redirectUrl,
    {
      status: 307,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Movie-Buff-Asset-Url": `${redirectUrl.pathname}${redirectUrl.search}`,
      },
    },
  );
}

async function buildRoundMediaResponse(
  request: Request,
  roundId: string,
  headOnly: boolean,
) {
  try {
    const summary = await getRoundGeneratedClip(roundId);

    // Browsers require native range-request semantics for synchronized media.
    // Resolve or generate the authoritative round asset here, then let the
    // same-origin public media handler serve the concrete file directly.
    if (!headOnly || !summary.assetPath) {
      return redirectToResolvedAsset(
        request,
        summary.assetUrl,
      );
    }

    const stats = await fsp.stat(summary.assetPath);
    const contentType =
      summary.clipType === "audio"
        ? "audio/mpeg"
        : "video/mp4";

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store, max-age=0",
        "Content-Length": stats.size.toString(),
        "Content-Type": contentType,
        "X-Movie-Buff-Asset-Url": summary.assetUrl,
      },
    });
  } catch (error) {
    const filesystemError = error as NodeJS.ErrnoException;
    const safePath =
      typeof filesystemError.path === "string"
        ? path.basename(filesystemError.path)
        : null;

    console.error("[movie-buff-round-media] resolution failed", {
      roundId,
      name:
        error instanceof Error
          ? error.name
          : "UnknownError",
      code: filesystemError.code ?? null,
      syscall: filesystemError.syscall ?? null,
      path: safePath,
    });

    return NextResponse.json(
      { error: "Round media could not be generated." },
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
