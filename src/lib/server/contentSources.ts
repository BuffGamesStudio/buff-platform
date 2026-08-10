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

const FALLBACK_CONTENT_SOURCES: ContentSourceSummary[] = [
  {
    id: "fallback-library-of-congress",
    slug: "library-of-congress-national-screening-room",
    name: "Library of Congress",
    type: "archive",
    baseUrl:
      "https://www.loc.gov/collections/national-screening-room/",
    country: "United States",
    language: "English",
    trustLevel: "high",
    legalBasis: "item_level_rights_validation",
    clipIngestSuitability: "approved",
    watchSuitability: "approved",
    validationRule:
      "Require item-level confirmation before gameplay use; treat archive trust as high but not universal.",
    autoIngestAllowed: false,
    isActive: true,
    policyState: "approved_now",
    notes:
      "Highest-trust historical source for Movie Buff foundation.",
    lastCheckedAt: null,
    lastSuccessfulIngestAt: null,
  },
  {
    id: "fallback-internet-archive",
    slug: "internet-archive-verified-pd-cc",
    name: "Internet Archive",
    type: "archive",
    baseUrl: "https://archive.org/details/feature_films",
    country: "International",
    language: "Mixed",
    trustLevel: "medium",
    legalBasis:
      "verified_public_domain_or_creative_commons_only",
    clipIngestSuitability: "approved",
    watchSuitability: "approved",
    validationRule:
      "Only approve items with explicit public-domain or Creative Commons rights basis.",
    autoIngestAllowed: false,
    isActive: true,
    policyState: "approved_now",
    notes:
      "Best practical ingest source, but still requires item-level rights validation.",
    lastCheckedAt: null,
    lastSuccessfulIngestAt: null,
  },
  {
    id: "fallback-public-domain-movie",
    slug: "public-domain-movie-discovery",
    name: "Public Domain Movie",
    type: "catalog",
    baseUrl: "https://publicdomainmovie.net/",
    country: "United States",
    language: "English",
    trustLevel: "low",
    legalBasis: "discovery_only_manual_confirmation",
    clipIngestSuitability: "conditional",
    watchSuitability: "conditional",
    validationRule:
      "Use only as a discovery layer; do not treat source claims as final legal authority.",
    autoIngestAllowed: false,
    isActive: true,
    policyState: "discovery_only",
    notes:
      "Useful for discovery, but not sufficient as standalone gameplay-rights proof.",
    lastCheckedAt: null,
    lastSuccessfulIngestAt: null,
  },
  {
    id: "fallback-european-film-gateway",
    slug: "european-film-gateway",
    name: "European Film Gateway",
    type: "archive",
    baseUrl: "https://www.europeanfilmgateway.eu/",
    country: "International",
    language: "Mixed",
    trustLevel: "medium",
    legalBasis: "item_level_rights_validation",
    clipIngestSuitability: "conditional",
    watchSuitability: "conditional",
    validationRule:
      "Rights vary by item; validate each title before clip or watch approval.",
    autoIngestAllowed: false,
    isActive: true,
    policyState: "conditional_next",
    notes:
      "Useful international discovery lane once item rights are explicit.",
    lastCheckedAt: null,
    lastSuccessfulIngestAt: null,
  },
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseServiceRoleKey) {
  throw new Error(
    "Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
  );
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

function isMissingContentSourcesSchema(
  message: string | null | undefined,
) {
  const normalizedMessage =
    message?.toLowerCase() ?? "";

  return (
    normalizedMessage.includes("content_sources") &&
    (normalizedMessage.includes("schema cache") ||
      normalizedMessage.includes("does not exist"))
  );
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
    if (isMissingContentSourcesSchema(error.message)) {
      return FALLBACK_CONTENT_SOURCES;
    }

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
