import "server-only";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

const ADMIN_ROLE = "admin";
const LOCAL_ADMIN_BYPASS_ENABLED =
  process.env.ALLOW_LOCAL_ADMIN_BYPASS ===
  "true";
const LOCAL_ADMIN_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
]);

export class AdminAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AdminAuthError";
  }
}

function getBearerToken(request: Request) {
  const authorizationHeader =
    request.headers.get("authorization");

  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (!scheme || !token || !/^Bearer$/i.test(scheme)) {
    return null;
  }

  return token.trim() || null;
}

function getCandidateHostname(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmedValue = value.split(",")[0]?.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    return new URL(trimmedValue).hostname.toLowerCase();
  } catch {
    return (
      trimmedValue
        .split(":")[0]
        ?.trim()
        .toLowerCase() || null
    );
  }
}

function isLocalAdminBypassCandidate(
  hostname: string | null,
) {
  return (
    hostname !== null &&
    LOCAL_ADMIN_HOSTNAMES.has(hostname)
  );
}

export function isLocalAdminBypassHeaders(
  requestHeaders: Headers,
) {
  if (!LOCAL_ADMIN_BYPASS_ENABLED) {
    return false;
  }

  const candidateHostnames = [
    getCandidateHostname(requestHeaders.get("host")),
    getCandidateHostname(
      requestHeaders.get("x-forwarded-host"),
    ),
  ];

  return candidateHostnames.some(
    isLocalAdminBypassCandidate,
  );
}

function isLocalAdminBypassRequest(request: Request) {
  if (!LOCAL_ADMIN_BYPASS_ENABLED) {
    return false;
  }

  const candidateHostnames = [
    getCandidateHostname(request.headers.get("host")),
    getCandidateHostname(
      request.headers.get("x-forwarded-host"),
    ),
    getCandidateHostname(request.url),
  ];

  return candidateHostnames.some(
    isLocalAdminBypassCandidate,
  );
}

export async function requireAdminRequest(
  request: Request,
) {
  if (isLocalAdminBypassRequest(request)) {
    return {
      userId: "local-dev-admin",
      platformRole: ADMIN_ROLE,
    };
  }

  const accessToken = getBearerToken(request);

  if (!accessToken) {
    throw new AdminAuthError(
      "Admin sign-in is required.",
      401,
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (authError || !user) {
    throw new AdminAuthError(
      "Your admin session is no longer valid. Please sign in again.",
      401,
    );
  }

  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from("profiles")
      .select("platform_role")
      .eq("id", user.id)
      .maybeSingle();

  if (profileError) {
    throw new AdminAuthError(
      "Admin access could not be verified.",
      500,
    );
  }

  if (profile?.platform_role !== ADMIN_ROLE) {
    throw new AdminAuthError(
      "You do not have permission to use Movie Buff admin.",
      403,
    );
  }

  return {
    userId: user.id,
    platformRole: profile.platform_role,
  };
}

export function createAdminErrorResponse(
  error: unknown,
  fallbackMessage: string,
  fallbackStatus = 400,
) {
  if (error instanceof AdminAuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      error:
        error instanceof Error
          ? error.message
          : fallbackMessage,
    },
    { status: fallbackStatus },
  );
}
