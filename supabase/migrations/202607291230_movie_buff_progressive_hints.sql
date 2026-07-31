create or replace function public.get_movie_buff_hint_genre_clue(
  p_genres text[]
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_genres text[] := coalesce(p_genres, array[]::text[]);
begin
  if 'screwball' = any(v_genres) then
    return 'Expect fast banter and playful energy.';
  end if;

  if 'film noir' = any(v_genres) then
    return 'Think in terms of darker noir tension.';
  end if;

  if 'zombie' = any(v_genres) then
    return 'Expect undead horror.';
  end if;

  if 'psychological' = any(v_genres) then
    return 'Expect a more psychological mood.';
  end if;

  if 'expressionist' = any(v_genres) then
    return 'Look for a stylized expressionist feel.';
  end if;

  if 'silent' = any(v_genres) then
    return 'This one comes from the silent era.';
  end if;

  if 'western' = any(v_genres) then
    return 'Think frontier or cowboy territory.';
  end if;

  if 'adventure' = any(v_genres) then
    return 'Expect a bigger adventure feel.';
  end if;

  if 'horror' = any(v_genres) then
    return 'Expect eerie or unsettling horror tone.';
  end if;

  if 'thriller' = any(v_genres) then
    return 'Expect a tense, dangerous mood.';
  end if;

  if 'comedy' = any(v_genres) then
    return 'Expect a lighter comedic tone.';
  end if;

  return null;
end;
$$;

create or replace function public.build_movie_buff_hint_text(
  p_description text,
  p_prompt text,
  p_release_year integer,
  p_director text,
  p_difficulty text,
  p_metadata jsonb
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_difficulty text := lower(coalesce(p_difficulty, 'medium'));
  v_sanitized_description text :=
    public.sanitize_movie_buff_hint_text(
      p_description
    );
  v_prompt_hint text;
  v_country text;
  v_country_phrase text;
  v_genres_pretty text[] := array[]::text[];
  v_genres_lower text[] := array[]::text[];
  v_genre_limit integer := 2;
  v_genre_phrase text;
  v_tone_hint text;
  v_base_hint text;
  v_fallback_hint text;
  v_description_is_generic boolean := false;
begin
  if v_difficulty not in ('easy', 'medium', 'hard') then
    v_difficulty := 'medium';
  end if;

  if v_difficulty = 'easy' then
    v_genre_limit := 3;
  elsif v_difficulty = 'hard' then
    v_genre_limit := 1;
  end if;

  if
    p_metadata is not null
    and jsonb_typeof(
      p_metadata -> 'genres'
    ) = 'array'
  then
    select coalesce(
      array_agg(
        lower(trim(value))
      ),
      array[]::text[]
    )
    into v_genres_lower
    from (
      select distinct
        value
      from jsonb_array_elements_text(
        p_metadata -> 'genres'
      ) as genre(value)
      where trim(value) <> ''
    ) as genre_values;

    select coalesce(
      array_agg(
        initcap(
          replace(
            replace(
              trim(value),
              '-',
              ' '
            ),
            '_',
            ' '
          )
        )
      ),
      array[]::text[]
    )
    into v_genres_pretty
    from (
      select distinct
        value
      from jsonb_array_elements_text(
        p_metadata -> 'genres'
      ) as genre(value)
      where trim(value) <> ''
    ) as genre_values;
  end if;

  v_country := nullif(
    trim(
      coalesce(
        p_metadata ->> 'countryOrOrigin',
        ''
      )
    ),
    ''
  );

  v_country_phrase := case
    when v_country = 'United States' then
      'the United States'
    when v_country = 'United Kingdom' then
      'the United Kingdom'
    else
      v_country
  end;

  if array_length(v_genres_pretty, 1) > 0 then
    v_genre_phrase := array_to_string(
      v_genres_pretty[
        1:least(
          v_genre_limit,
          array_length(v_genres_pretty, 1)
        )
      ],
      ' / '
    );
  end if;

  v_tone_hint :=
    public.get_movie_buff_hint_genre_clue(
      v_genres_lower
    );

  v_description_is_generic :=
    coalesce(v_sanitized_description, '') ~* '^A .* movie from .* released in \d{4}\.( Directed by .+\.)?$';

  if
    v_difficulty = 'easy'
    and v_sanitized_description is not null
    and not v_description_is_generic
  then
    return v_sanitized_description;
  end if;

  if
    nullif(trim(coalesce(p_prompt, '')), '') is not null
    and trim(p_prompt) !~* '^Name the movie from this 30-second montage'
  then
    v_prompt_hint := regexp_replace(
      trim(p_prompt),
      '\s+Name the movie\.?$',
      '',
      'i'
    );

    v_fallback_hint := public.sanitize_movie_buff_hint_text(
      v_prompt_hint
    );
  end if;

  if
    v_genre_phrase is not null
    and v_country_phrase is not null
    and p_release_year is not null
  then
    if v_difficulty = 'hard' then
      v_base_hint := format(
        'A %s movie from the %ss.',
        v_genre_phrase,
        (p_release_year / 10) * 10
      );
    else
      v_base_hint := format(
        'A %s movie from %s released in %s.',
        v_genre_phrase,
        v_country_phrase,
        p_release_year
      );
    end if;
  elsif v_genre_phrase is not null and p_release_year is not null then
    if v_difficulty = 'hard' then
      v_base_hint := format(
        'A %s movie from the %ss.',
        v_genre_phrase,
        (p_release_year / 10) * 10
      );
    else
      v_base_hint := format(
        'A %s movie released in %s.',
        v_genre_phrase,
        p_release_year
      );
    end if;
  elsif v_genre_phrase is not null and v_country_phrase is not null then
    v_base_hint := format(
      'A %s movie from %s.',
      v_genre_phrase,
      v_country_phrase
    );
  elsif v_genre_phrase is not null then
    v_base_hint := format(
      'A %s movie.',
      v_genre_phrase
    );
  elsif p_release_year is not null then
    if v_difficulty = 'hard' then
      v_base_hint := format(
        'A movie from the %ss.',
        (p_release_year / 10) * 10
      );
    else
      v_base_hint := format(
        'A movie released in %s.',
        p_release_year
      );
    end if;
  end if;

  if v_base_hint is null then
    if v_sanitized_description is not null then
      return v_sanitized_description;
    end if;

    return v_fallback_hint;
  end if;

  if v_difficulty = 'easy' then
    if v_tone_hint is not null and nullif(trim(coalesce(p_director, '')), '') is not null then
      return format(
        '%s %s Directed by %s.',
        v_base_hint,
        v_tone_hint,
        trim(p_director)
      );
    end if;

    if v_tone_hint is not null then
      return format(
        '%s %s',
        v_base_hint,
        v_tone_hint
      );
    end if;

    if nullif(trim(coalesce(p_director, '')), '') is not null then
      return format(
        '%s Directed by %s.',
        v_base_hint,
        trim(p_director)
      );
    end if;

    return v_base_hint;
  end if;

  if v_difficulty = 'medium' then
    if v_tone_hint is not null then
      return format(
        '%s %s',
        v_base_hint,
        v_tone_hint
      );
    end if;

    return v_base_hint;
  end if;

  return v_base_hint;
end;
$$;

create or replace function public.get_movie_buff_round(
  p_room_id uuid
)
returns table (
  result_match_id uuid,
  result_round_id uuid,
  result_round_number integer,
  result_total_rounds integer,
  result_time_limit_seconds integer,
  result_started_at timestamptz,
  result_time_left_seconds integer,
  result_clip_type text,
  result_prompt text,
  result_quote_text text,
  result_media_url text,
  result_playback_started_at timestamptz,
  result_hint_text text,
  result_hint_used boolean,
  result_hint_penalty_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_round_id uuid;
  v_round_number integer;
  v_total_rounds integer;
  v_time_limit_seconds integer;
  v_started_at timestamptz;
  v_clip_type text;
  v_prompt text;
  v_quote_text text;
  v_media_url text;
  v_playback_started_at timestamptz;
  v_hint_text text;
  v_hint_used boolean;
  v_hint_penalty_seconds integer;
  v_effective_time_limit integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1
    from public.room_players as rp
    where rp.room_id = p_room_id
      and rp.player_id = auth.uid()
      and rp.left_at is null
  ) then
    raise exception 'You are not an active player in this room.';
  end if;

  select
    m.id,
    mr.id,
    mr.round_number,
    gr.total_rounds,
    mr.time_limit_seconds,
    mr.started_at,
    c.clip_type,
    c.prompt,
    c.quote_text,
    c.media_url,
    mr.playback_started_at,
    public.build_movie_buff_hint_text(
      mo.description,
      c.prompt,
      mo.release_year,
      mo.director,
      coalesce(nullif(trim(c.difficulty), ''), mo.difficulty),
      ci.metadata
    ),
    player_hint.used_at is not null,
    coalesce(player_hint.penalty_seconds, 0)
  into
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    v_hint_used,
    v_hint_penalty_seconds
  from public.game_rooms as gr
  join public.matches as m
    on m.room_id = gr.id
   and m.status = 'active'
  join public.match_rounds as mr
    on mr.match_id = m.id
   and mr.round_number = gr.current_round
  left join public.clips as c
    on c.id = mr.clip_id
  left join public.movies as mo
    on mo.id = c.movie_id
  left join public.content_items as ci
    on ci.legacy_movie_id = mo.id
  left join public.match_round_player_hints as player_hint
    on player_hint.round_id = mr.id
   and player_hint.player_id = auth.uid()
  where gr.id = p_room_id
  order by m.started_at desc
  limit 1;

  if v_round_id is null then
    raise exception 'The current round is unavailable.';
  end if;

  v_effective_time_limit := greatest(
    0,
    v_time_limit_seconds -
    coalesce(v_hint_penalty_seconds, 0)
  );

  return query
  select
    v_match_id,
    v_round_id,
    v_round_number,
    v_total_rounds,
    v_time_limit_seconds,
    v_started_at,
    greatest(
      0,
      v_effective_time_limit -
      case
        when v_playback_started_at is null then
          0
        else
          floor(
            extract(
              epoch from (
                now() - v_playback_started_at
              )
            )
          )::integer
      end
    ),
    v_clip_type,
    v_prompt,
    v_quote_text,
    v_media_url,
    v_playback_started_at,
    v_hint_text,
    coalesce(v_hint_used, false),
    coalesce(v_hint_penalty_seconds, 0);
end;
$$;

notify pgrst, 'reload schema';
