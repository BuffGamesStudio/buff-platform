import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Temporary fail-closed guard for the legacy board-preview implementation.
 *
 * The current page performs room-specific board ensure/select work in a Server
 * Component/Server Function backed by the service-role client, but browser auth
 * is stored client-side and is not available to that server boundary. Until the
 * page is converted to the bearer-authenticated board APIs, strip room context
 * from GET requests and reject POSTs so caller-controlled room/tile identifiers
 * cannot reach service-role mutations.
 */
export function proxy(request: NextRequest) {
  if (request.method === "POST") {
    return NextResponse.json(
      { error: "Authenticated board action required." },
      { status: 401 },
    );
  }

  if (request.nextUrl.searchParams.has("roomId")) {
    const safeUrl = request.nextUrl.clone();
    safeUrl.searchParams.delete("roomId");
    safeUrl.searchParams.delete("round");
    safeUrl.searchParams.delete("error");
    safeUrl.searchParams.set("security", "board-auth-required");
    return NextResponse.redirect(safeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/games/movie-buff/board-preview",
};
