alter table public.match_rounds
  add column if not exists playback_started_at timestamptz,
  add column if not exists hint_used_at timestamptz,
  add column if not exists hint_penalty_seconds integer not null default 0;

alter table public.match_rounds
  drop constraint if exists match_rounds_hint_penalty_seconds_check;

alter table public.match_rounds
  add constraint match_rounds_hint_penalty_seconds_check
  check (hint_penalty_seconds >= 0 and hint_penalty_seconds <= 10);

notify pgrst, 'reload schema';
