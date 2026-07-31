const LOCAL_APP_URL =
  "http://127.0.0.1:3001";

export function getConfiguredAppUrl(): string {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ??
    "";

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  return LOCAL_APP_URL;
}

export function getBrowserAppUrl(): string {
  if (
    typeof window !== "undefined" &&
    window.location?.origin
  ) {
    return window.location.origin.replace(
      /\/+$/,
      "",
    );
  }

  return getConfiguredAppUrl();
}
