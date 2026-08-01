import "server-only";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export class VerifiedUserAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "VerifiedUserAuthError";
  }
}

export type VerifiedUserContext = {
  userId: string;
  email: string | null;
  emailConfirmedAt: string;
  accessToken: string;
};

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

export async function requireVerifiedUser(
  request: Request,
): Promise<VerifiedUserContext> {
  const accessToken = getBearerToken(request);

  if (!accessToken) {
    throw new VerifiedUserAuthError(
      "A valid Buff Games session is required.",
      401,
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (authError || !user) {
    throw new VerifiedUserAuthError(
      "Your Buff Games session is no longer valid.",
      401,
    );
  }

  if (!user.email_confirmed_at) {
    throw new VerifiedUserAuthError(
      "Verify your email before creating private Movie Nights.",
      403,
    );
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    emailConfirmedAt: user.email_confirmed_at,
    accessToken,
  };
}

export function createVerifiedUserErrorResponse(
  error: unknown,
  fallbackMessage: string,
  fallbackStatus = 400,
) {
  if (error instanceof VerifiedUserAuthError) {
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
