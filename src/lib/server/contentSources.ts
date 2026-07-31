import "server-only";

import { createClient } from "@supabase/supabase-js";

export type ContentSourcePolicyState =
  | "approved_now"
  | "conditional_next"
  | "discovery_only"
  | "rejected";

export type ContentSourceRow = {
  id: string;
  slug: string;
  source_name: string;
  source_type: string;
  base_url: string | null;
  country: string | null;
  language: string | null;
  trust_level: string;
  legal_basis: string;
  clip_ingest_suitability:
    | "approved"
    | "conditional"
    | "rejected";
  watch_suitability:
    | "approved"
    | "conditional"
    | "rejected";
  validation_rule: string | null;
  auto_ingest_allowed: boolean;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
  last_checked_at: string | null;
  last_successful_ingest_at: string | null;
};

export type ContentSourceSummary = {
  id: string;
  slug: string;
  name: string;
  type: string;
  baseUrl: string | null;
  country: string | null;
  language: string | null;
  trustLevel: string;
  legalBasis: string;
  clipIngestSuitability:
    | "approved"
    | "conditional"
    | "rejected";
  watchSuitability:
    | "approved"
    | "conditional"
    | "rejected";
  validationRule: string | null;
  autoIngestAllowed: boolean;
  isActive: boolean;
  policyState: ContentSourcePolicyState;
  notes: string | null;
  lastCheckedAt: string | null;
  lastSuccessfulIngestAt: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

function readMetadataString(
  metadata: Record<string, unknown> | null,
  key: string,
) {
  const value = metadata?.[key];

  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function readPolicyState(
  metadata: Record<string, unknown> | null,
): ContentSourcePolicyState {
  const candidate = readMetadataString(
    metadata,
    "launch_policy_state",
  );

  switch (candidate) {
    case "approved_now":
    case "conditional_next":
    case "discovery_only":
    case "rejected":
      return candidate;
    default:
      return "conditional_next";
  }
}

export async function listContentSources(): Promise<
  ContentSourceSummary[]
> {
  const { data, error } = await supabaseAdmin
    .from("content_sources")
    .select(
      [
        "id",
        "slug",
        "source_name",
        "source_type",
        "base_url",
        "country",
        "language",
        "trust_level",
        "legal_basis",
        "clip_ingest_suitability",
        "watch_suitability",
        "validation_rule",
        "auto_ingest_allowed",
        "is_active",
        "metadata",
        "last_checked_at",
        "last_successful_ingest_at",
      ].join(","),
    )
    .order("source_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (((data ?? []) as unknown) as ContentSourceRow[]).map(
    (source) => ({
      id: source.id,
      slug: source.slug,
      name: source.source_name,
      type: source.source_type,
      baseUrl: source.base_url,
      country: source.country,
      language: source.language,
      trustLevel: source.trust_level,
      legalBasis: source.legal_basis,
      clipIngestSuitability:
        source.clip_ingest_suitability,
      watchSuitability: source.watch_suitability,
      validationRule: source.validation_rule,
      autoIngestAllowed:
        source.auto_ingest_allowed,
      isActive: source.is_active,
      policyState: readPolicyState(
        source.metadata,
      ),
      notes: readMetadataString(
        source.metadata,
        "notes",
      ),
      lastCheckedAt: source.last_checked_at,
      lastSuccessfulIngestAt:
        source.last_successful_ingest_at,
    }),
  );
}
