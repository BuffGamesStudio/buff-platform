create or replace function public.normalize_movie_answer(
  p_answer text
)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
    lower(coalesce(p_answer, '')),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

revoke all on function
  public.normalize_movie_answer(text)
from public;

grant execute on function
  public.normalize_movie_answer(text)
to authenticated;

notify pgrst, 'reload schema';