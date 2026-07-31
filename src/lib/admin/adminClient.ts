import { supabase } from "@/lib/supabase";

function isLocalAdminDevHost() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

export async function getApiErrorMessage(
  response: Response,
  fallbackMessage: string,
) {
  try {
    const payload = (await response.json()) as {
      error?: string;
    };

    return payload.error || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export async function adminFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const allowLocalAdminWithoutSession =
    isLocalAdminDevHost();
  const { data, error } = await supabase.auth.getSession();

  if (error && !allowLocalAdminWithoutSession) {
    throw new Error(error.message);
  }

  const accessToken = data.session?.access_token;

  const headers = new Headers(init.headers);

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  } else if (!allowLocalAdminWithoutSession) {
    throw new Error(
      "You must be signed in with an admin account.",
    );
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
