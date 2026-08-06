-- MOV-16 follow-up: a category-restricted VIP must not pass when the match
-- category is null. Replace only the internal eligibility helper.

create or replace function public.movie_buff_vip_ineligibility_reason(
  p_player_id uuid,
  p_vip_id uuid,
  p_room_id uuid,
  p_match_id uuid,
  p_round_id uuid,
  p_at timestamptz
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_definition public.movie_buff_vip_definitions%rowtype;
  v_inventory public.movie_buff_vip_inventory%rowtype;
  v_room public.game_rooms%rowtype;
  v_match public.matches%rowtype;
  v_round public.match_rounds%rowtype;
begin
  select d.* into v_definition
  from public.movie_buff_vip_definitions as d
  where d.id = p_vip_id;
  if not found then return 'VIP definition is missing'; end if;

  select i.* into v_inventory
  from public.movie_buff_vip_inventory as i
  where i.player_id = p_player_id
    and i.vip_id = p_vip_id;
  if not found then return 'VIP is not owned'; end if;

  select gr.* into v_room
  from public.game_rooms as gr
  where gr.id = p_room_id;
  if not found then return 'Room context is missing'; end if;

  select m.* into v_match
  from public.matches as m
  where m.id = p_match_id
    and m.room_id = p_room_id;
  if not found or v_match.status <> 'active' then
    return 'Active match context is missing';
  end if;

  select mr.* into v_round
  from public.match_rounds as mr
  where mr.id = p_round_id
    and mr.match_id = p_match_id;
  if not found then return 'Round does not belong to the active match'; end if;

  if v_match.category_id is distinct from v_room.category_id
     or v_match.difficulty is distinct from v_room.difficulty
     or v_match.total_rounds is distinct from v_room.total_rounds then
    return 'Room and match eligibility context is inconsistent';
  end if;

  if not v_definition.is_active then return 'VIP is inactive'; end if;
  if not v_definition.eligibility_configured then
    return 'VIP eligibility is not configured';
  end if;
  if v_definition.is_stackable or v_definition.max_per_round <> 1 then
    return 'Multi-VIP stacking is not supported';
  end if;
  if v_inventory.quantity_remaining <= 0 then return 'No quantity remaining'; end if;
  if v_inventory.expires_at is not null and v_inventory.expires_at <= p_at then
    return 'VIP inventory has expired';
  end if;
  if v_inventory.cooldown_until is not null and v_inventory.cooldown_until > p_at then
    return 'VIP is cooling down';
  end if;
  if v_definition.active_from is not null and v_definition.active_from > p_at then
    return 'VIP is not active yet';
  end if;
  if v_definition.active_until is not null and v_definition.active_until <= p_at then
    return 'VIP is no longer active';
  end if;
  if not (v_room.room_type = any(v_definition.allowed_room_types)) then
    return 'VIP is not allowed for this room type';
  end if;
  if not (v_match.difficulty = any(v_definition.allowed_difficulties)) then
    return 'VIP is not allowed for this difficulty';
  end if;
  if not v_definition.allow_any_category
     and (
       v_match.category_id is null
       or not (v_match.category_id = any(v_definition.allowed_category_ids))
     ) then
    return 'VIP is not allowed for this category';
  end if;
  if v_room.is_ranked and not v_definition.allow_ranked then
    return 'VIP is not allowed in ranked matches';
  end if;
  if not v_room.is_ranked and not v_definition.allow_unranked then
    return 'VIP is not allowed in unranked matches';
  end if;
  if v_round.round_number < v_definition.minimum_round_number then
    return 'VIP is not available for this round number';
  end if;
  if v_definition.maximum_round_number is not null
     and v_round.round_number > v_definition.maximum_round_number then
    return 'VIP is not available for this round number';
  end if;

  return null;
end;
$$;

alter function public.movie_buff_vip_ineligibility_reason(
  uuid, uuid, uuid, uuid, uuid, timestamptz
) owner to postgres;

revoke all on function public.movie_buff_vip_ineligibility_reason(
  uuid, uuid, uuid, uuid, uuid, timestamptz
) from public, anon, authenticated, service_role;
