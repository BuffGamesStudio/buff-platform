import { supabase } from "@/lib/supabase";

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
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  const accessToken = data.session?.access_token;

  const headers = new Headers(init.headers);

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  } else {
    throw new Error(
      "You must be signed in with an admin account.",
    );
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
