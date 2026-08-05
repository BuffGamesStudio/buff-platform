// Validation-only compatibility entrypoint for the exact v9 browser branch.
// The probe records only paths, response statuses, storage shape booleans, and
// screenshots; it never writes bearer tokens or local credentials to evidence.
await import("./movie-buff-core-v9-auth-probe.mjs");
