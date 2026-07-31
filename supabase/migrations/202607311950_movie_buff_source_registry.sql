create table if not exists public.content_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  source_name text not null,
  source_type text not null
    check (
      source_type in (
        'archive',
        'collection',
        'catalog',
        'feed',
        'manual',
        'other'
      )
    ),
  base_url text,
  collection_identifier text,
  country text,
  language text,
  trust_level text not null default 'medium'
    check (trust_level in ('high', 'medium', 'low')),
  legal_basis text not null default 'manual_review',
  clip_ingest_suitability text not null default 'conditional'
    check (
      clip_ingest_suitability in (
        'approved',
        'conditional',
        'rejected'
      )
    ),
  watch_suitability text not null default 'conditional'
    check (
      watch_suitability in (
        'approved',
        'conditional',
        'rejected'
      )
    ),
  validation_rule text,
  auto_ingest_allowed boolean not null default false,
  polling_frequency_minutes integer
    check (
      polling_frequency_minutes is null
      or polling_frequency_minutes > 0
    ),
  last_checked_at timestamptz,
  last_successful_ingest_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.content_source_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null
    references public.content_sources(id)
    on delete cascade,
  content_id uuid
    references public.content_items(id)
    on delete set null,
  source_item_key text not null,
  source_item_url text,
  source_title text,
  source_release_year integer,
  rights_status text not null default 'pending'
    check (
      rights_status in (
        'pending',
        'verified',
        'rejected'
      )
    ),
  rights_basis text,
  clip_ingest_allowed boolean not null default false,
  watch_allowed boolean not null default false,
  validation_status text not null default 'candidate'
    check (
      validation_status in (
        'candidate',
        'validated',
        'rejected',
        'queued',
        'published'
      )
    ),
  media_status text not null default 'unknown'
    check (
      media_status in (
        'unknown',
        'playable',
        'broken',
        'missing'
      )
    ),
  metadata_quality_status text not null default 'unknown'
    check (
      metadata_quality_status in (
        'unknown',
        'strong',
        'weak'
      )
    ),
  duplicate_risk text not null default 'unknown'
    check (
      duplicate_risk in (
        'unknown',
        'low',
        'medium',
        'high'
      )
    ),
  review_notes text,
  validated_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_id, source_item_key)
);

alter table public.content_items
  add column if not exists source_id uuid
  references public.content_sources(id)
  on delete set null;

alter table public.content_media
  add column if not exists source_id uuid
  references public.content_sources(id)
  on delete set null;

create index if not exists content_sources_active_idx
on public.content_sources(is_active);

create index if not exists content_sources_clip_ingest_suitability_idx
on public.content_sources(clip_ingest_suitability);

create index if not exists content_source_items_source_id_idx
on public.content_source_items(source_id);

create index if not exists content_source_items_content_id_idx
on public.content_source_items(content_id);

create index if not exists content_source_items_validation_status_idx
on public.content_source_items(validation_status);

create index if not exists content_items_source_id_idx
on public.content_items(source_id);

create index if not exists content_media_source_id_idx
on public.content_media(source_id);

drop trigger if exists content_sources_set_updated_at
on public.content_sources;

create trigger content_sources_set_updated_at
before update on public.content_sources
for each row
execute procedure public.set_updated_at();

drop trigger if exists content_source_items_set_updated_at
on public.content_source_items;

create trigger content_source_items_set_updated_at
before update on public.content_source_items
for each row
execute procedure public.set_updated_at();

alter table public.content_sources enable row level security;
alter table public.content_source_items enable row level security;

drop policy if exists "content_sources are viewable by everyone"
on public.content_sources;

create policy "content_sources are viewable by everyone"
on public.content_sources
for select
using (true);

drop policy if exists "content_source_items are viewable by everyone"
on public.content_source_items;

create policy "content_source_items are viewable by everyone"
on public.content_source_items
for select
using (true);

drop policy if exists "service role can manage content_sources"
on public.content_sources;

create policy "service role can manage content_sources"
on public.content_sources
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "service role can manage content_source_items"
on public.content_source_items;

create policy "service role can manage content_source_items"
on public.content_source_items
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

insert into public.content_sources (
  slug,
  source_name,
  source_type,
  base_url,
  country,
  language,
  trust_level,
  legal_basis,
  clip_ingest_suitability,
  watch_suitability,
  validation_rule,
  auto_ingest_allowed,
  metadata
) values
  (
    'library-of-congress-national-screening-room',
    'Library of Congress',
    'archive',
    'https://www.loc.gov/collections/national-screening-room/',
    'United States',
    'English',
    'high',
    'item_level_rights_validation',
    'approved',
    'approved',
    'Require item-level confirmation before gameplay use; treat archive trust as high but not universal.',
    false,
    jsonb_build_object(
      'launch_policy_state', 'approved_now',
      'notes', 'Highest-trust historical source for Movie Buff foundation.'
    )
  ),
  (
    'internet-archive-verified-pd-cc',
    'Internet Archive',
    'archive',
    'https://archive.org/details/feature_films',
    'International',
    'Mixed',
    'medium',
    'verified_public_domain_or_creative_commons_only',
    'approved',
    'approved',
    'Only approve items with explicit public-domain or Creative Commons rights basis.',
    false,
    jsonb_build_object(
      'launch_policy_state', 'approved_now',
      'notes', 'Primary practical ingest lane, but item-level rights proof is mandatory.'
    )
  ),
  (
    'public-domain-movie-discovery',
    'Public Domain Movie',
    'catalog',
    'https://publicdomainmovie.net/',
    'United States',
    'English',
    'medium',
    'discovery_only_not_authoritative',
    'conditional',
    'conditional',
    'Use for discovery only; do not accept title claims without separate rights proof.',
    false,
    jsonb_build_object(
      'launch_policy_state', 'discovery_only',
      'notes', 'Useful for finding candidates, not as sole legal authority.'
    )
  ),
  (
    'european-film-gateway',
    'European Film Gateway',
    'collection',
    'https://www.europeanfilmgateway.eu/',
    'Europe',
    'Mixed',
    'medium',
    'item_level_rights_validation',
    'conditional',
    'approved',
    'Rights vary by item; never auto-ingest without metadata validation.',
    false,
    jsonb_build_object(
      'launch_policy_state', 'conditional_next',
      'notes', 'International discovery lane with variable item rights.'
    )
  ),
  (
    'creative-commons-film-catalogs',
    'Creative Commons Film Catalogs',
    'catalog',
    null,
    'International',
    'Mixed',
    'medium',
    'explicit_creative_commons_rights_required',
    'conditional',
    'approved',
    'Only approve entries with explicit reusable license metadata and playback proof.',
    false,
    jsonb_build_object(
      'launch_policy_state', 'conditional_next'
    )
  ),
  (
    'wikimedia-film-collections',
    'Wikimedia Commons Film Collections',
    'collection',
    'https://commons.wikimedia.org/',
    'International',
    'Mixed',
    'medium',
    'explicit_file_level_license_required',
    'conditional',
    'approved',
    'Require file-level license validation and duplicate screening before ingest.',
    false,
    jsonb_build_object(
      'launch_policy_state', 'conditional_next'
    )
  )
on conflict (slug) do update
set
  source_name = excluded.source_name,
  source_type = excluded.source_type,
  base_url = excluded.base_url,
  country = excluded.country,
  language = excluded.language,
  trust_level = excluded.trust_level,
  legal_basis = excluded.legal_basis,
  clip_ingest_suitability = excluded.clip_ingest_suitability,
  watch_suitability = excluded.watch_suitability,
  validation_rule = excluded.validation_rule,
  auto_ingest_allowed = excluded.auto_ingest_allowed,
  metadata = excluded.metadata;

update public.content_items as ci
set source_id = cs.id
from public.content_sources as cs
where ci.source_id is null
  and ci.source_name is not null
  and (
    lower(ci.source_name) = lower(cs.source_name)
    or (
      ci.source_name ilike '%internet archive%'
      and cs.slug = 'internet-archive-verified-pd-cc'
    )
    or (
      ci.source_name ilike '%library of congress%'
      and cs.slug = 'library-of-congress-national-screening-room'
    )
    or (
      ci.source_name ilike '%public domain movie%'
      and cs.slug = 'public-domain-movie-discovery'
    )
    or (
      ci.source_name ilike '%european film gateway%'
      and cs.slug = 'european-film-gateway'
    )
  );

update public.content_media as cm
set source_id = cs.id
from public.content_sources as cs
where cm.source_id is null
  and cm.source_name is not null
  and (
    lower(cm.source_name) = lower(cs.source_name)
    or (
      cm.source_name ilike '%internet archive%'
      and cs.slug = 'internet-archive-verified-pd-cc'
    )
    or (
      cm.source_name ilike '%library of congress%'
      and cs.slug = 'library-of-congress-national-screening-room'
    )
    or (
      cm.source_name ilike '%public domain movie%'
      and cs.slug = 'public-domain-movie-discovery'
    )
    or (
      cm.source_name ilike '%european film gateway%'
      and cs.slug = 'european-film-gateway'
    )
  );
