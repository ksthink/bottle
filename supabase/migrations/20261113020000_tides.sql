-- 4단계: 시간. 못 찾은 병은 밀물이 다시 가져가고, 회원 섬에는 7일 안에 한 통이 온다.
-- 도착 시각과 해변 위치는 무작위다. 날씨·바람·조수는 화면 연출로만 쓴다(lib/island/env.js).
--
-- 잠정값 (PLAN.md 8. 미정 사항)
--   사람 편지는 보낸 뒤 1시간~7일 사이에 회원 섬에 닿는다 (손님 섬에는 보내지 않는다. 1시간 뒤면 대개 떠나고 없다)
--   밀물이 가져간 편지는 가져간 때부터 다시 1시간~7일
--   못 찾은 병: 회원은 닿은 지 2일, 손님은 떠난 지 30분이 지나면 밀물이 가져간다
--   최근 접속: 7일. 7일 보장: 자리가 있는데 6일 동안 아무것도 오지 않았으면 12시간 안에 한 통

alter table public.bottles drop constraint bottles_state_check;
alter table public.bottles add constraint bottles_state_check
  check (state in ('drifting', 'opened', 'kept', 'sunk', 'reclaimed'));

-- 선반이 가득(3개) 찼다가 자리가 난 시각. 7일 보장은 이때부터 센다
alter table public.islands add column last_full_at timestamptz;

-- 정해진 시각에 닿는 병. 해변 위치는 무작위
create function public._deliver_at(p_letter bigint, p_island uuid, p_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bottles (letter_id, island, arrive_at, angle)
  values (p_letter, p_island, p_at, random() * 2 * pi())
  on conflict (island, letter_id) do nothing;
  update public.islands set last_received_at = p_at where owner = p_island;
end;
$$;

create or replace function public._deliver(p_letter bigint, p_island uuid, p_delay interval) returns void
language sql security definer set search_path = '' as $$
  select public._deliver_at(p_letter, p_island, now() + p_delay);
$$;

-- 사람 편지가 닿을 시각: 보낸 뒤 1시간~7일 사이 무작위. 밀물이 가져간 적 있으면 지금부터 다시 1시간~7일.
-- 받을 섬을 늦게 찾아 7일이 지났으면 1시간 안에 닿게 한다
create function public._arrival(p_letter bigint) returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
declare
  born timestamptz;
  lo timestamptz;
  hi timestamptz;
begin
  select created_at into born from public.letters where id = p_letter;
  if exists (select 1 from public.bottles where letter_id = p_letter and state = 'reclaimed') then
    born := now();
  end if;
  lo := greatest(now(), born + interval '1 hour');
  hi := born + interval '7 days';
  if hi <= lo then
    return now() + make_interval(secs => 300 + random() * 3300);
  end if;
  return lo + (hi - lo) * random();
end;
$$;

-- 배정: 회원 섬만. 쓴 사람과 받은 적 있는 섬(회수된 것 포함)은 빼고, 병이 3개 미만이고
-- 최근 7일 안에 들어온 섬 중 오래 못 받은 섬부터
create or replace function public._assign(p_letter bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  writer uuid;
  target uuid;
begin
  select author into writer from public.letters where id = p_letter and kind = 'user' and status = 'ok';
  if not found then return false; end if;
  select i.owner into target
    from public.islands i join auth.users u on u.id = i.owner
   where i.owner is distinct from writer
     and not u.is_anonymous
     and i.last_seen_at > now() - interval '7 days'
     and not exists (select 1 from public.bottles b where b.island = i.owner and b.letter_id = p_letter)
     and public._total(i.owner) < 3
   order by i.last_received_at nulls first, random()
   limit 1
   for update of i skip locked;
  if target is null then return false; end if;
  perform public._deliver_at(p_letter, target, public._arrival(p_letter));
  return true;
end;
$$;

-- 가득 찬 섬에서 병이 하나 빠지는 순간을 적는다
create function public._note_full(p_island uuid) returns void
language sql security definer set search_path = '' as $$
  update public.islands set last_full_at = now() where owner = p_island and public._total(p_island) >= 3;
$$;

-- 던지기·가라앉히기 전에 가득 차 있었는지 적는다 (기존 함수의 앞부분에 끼운다)
create or replace function public.throw_bottle(p_user uuid, p_body text, p_ip inet, p_blocked boolean)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  isl public.islands;
  txt text := btrim(p_body);
  lid bigint;
  st text;
begin
  select * into isl from public.islands where owner = p_user for update;
  if not found then raise exception 'no_island'; end if;
  if isl.held < 1 then raise exception 'no_bottle'; end if;
  if char_length(txt) < 5 or char_length(txt) > 300 then raise exception 'bad_length'; end if;
  perform public._note_full(p_user);
  st := case when p_blocked or exists (select 1 from public.blocked_ips where ip = p_ip) then 'blocked' else 'ok' end;
  update public.islands set held = held - 1 where owner = p_user;
  insert into public.letters (author, body, status, sent_ip) values (p_user, txt, st, p_ip) returning id into lid;
  if st = 'ok' then perform public._assign(lid); end if;
  perform public._give_rules(p_user);
  return isl.held - 1;
end;
$$;

create or replace function public.sink_bottle(p_bottle bigint)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lid bigint;
begin
  perform public._note_full(uid);
  update public.bottles set state = 'sunk' where id = p_bottle and island = uid and state = 'opened'
  returning letter_id into lid;
  if not found then raise exception 'not_here'; end if;
  update public.letters set status = 'reported' where id = lid and kind = 'user';
  perform public._give_rules(uid);
  return (select held from public.islands where owner = uid);
end;
$$;

-- 아직 아무 섬에도 가 있지 않은 사람 편지 (회수된 병만 있는 것 포함)
create or replace function public.assign_drifting() returns int
language plpgsql security definer set search_path = '' as $$
declare
  l record;
  n int := 0;
begin
  for l in
    select id from public.letters x
     where x.kind = 'user' and x.status = 'ok' and x.created_at > now() - interval '30 days'
       and not exists (select 1 from public.bottles b where b.letter_id = x.id and b.state <> 'reclaimed')
     order by x.created_at
     limit 200
  loop
    if public._assign(l.id) then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

-- 못 찾은 병을 밀물이 가져간다. 사람 편지만(규칙 편지는 그대로 둔다).
-- 회원: 닿은 지 2일 지나도록 열지 않은 병. 손님: 떠난 지 30분 지난 섬의 열지 않은 병(오는 중인 것 포함)
-- 가져간 편지는 assign_drifting 이 다른 섬으로 보낸다
create function public.reclaim_unfound() returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  update public.bottles b set state = 'reclaimed'
    from public.letters l, public.islands i, auth.users u
   where l.id = b.letter_id and i.owner = b.island and u.id = b.island
     and l.kind = 'user' and b.state = 'drifting'
     and ((not u.is_anonymous and b.arrive_at < now() - interval '2 days')
       or (u.is_anonymous and i.last_seen_at < now() - interval '30 minutes'));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 7일 보장: 최근 7일 안에 들어온 회원 섬 중, 자리가 있고 오는 병이 없으며
-- 마지막으로 받은 때(또는 자리가 난 때, 섬이 생긴 때)부터 6일이 지난 섬에 12시간 안에 한 통을 보낸다.
-- 아직 아무에게도 가지 않은 사람 편지가 먼저, 없으면 이미 읽힌 편지를 다시 띄운다
create function public.ensure_arrivals() returns int
language plpgsql security definer set search_path = '' as $$
declare
  isl record;
  pick bigint;
  arrive timestamptz;
  n int := 0;
begin
  for isl in
    select i.owner from public.islands i join auth.users u on u.id = i.owner
     where not u.is_anonymous
       and i.last_seen_at > now() - interval '7 days'
       and public._total(i.owner) < 3
       and not exists (select 1 from public.bottles b where b.island = i.owner and b.state = 'drifting' and b.arrive_at > now())
       and greatest(i.created_at, coalesce(i.last_received_at, '-infinity'), coalesce(i.last_full_at, '-infinity')) < now() - interval '6 days'
     for update of i skip locked
  loop
    arrive := now() + make_interval(secs => 1800 + random() * 41400);
    select x.id into pick from public.letters x
     where x.kind = 'user' and x.status = 'ok' and x.author is distinct from isl.owner
       and not exists (select 1 from public.bottles b where b.letter_id = x.id and b.state <> 'reclaimed')
       and not exists (select 1 from public.bottles b where b.letter_id = x.id and b.island = isl.owner)
     order by x.created_at limit 1;
    if pick is not null then
      perform public._deliver_at(pick, isl.owner,
        greatest(arrive, (select created_at from public.letters where id = pick) + interval '1 hour'));
    else
      perform public._recirculate_at(isl.owner, arrive);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 재유통을 정해진 시각에 닿게 (기존 _recirculate 는 이것을 부른다)
create function public._recirculate_at(p_island uuid, p_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pick bigint;
begin
  if public._total(p_island) >= 3 then return; end if;
  select l.id into pick
    from public.letters l
   where l.kind = 'user' and l.status = 'ok'
     and l.author is distinct from p_island
     and exists (select 1 from public.bottles b where b.letter_id = l.id and b.state = 'kept')
     and not exists (select 1 from public.bottles b where b.letter_id = l.id and b.island = p_island)
   order by random()
   limit 1;
  if pick is not null then
    perform public._deliver_at(pick, p_island, p_at);
  end if;
end;
$$;

create or replace function public._recirculate(p_island uuid, p_delay interval) returns void
language sql security definer set search_path = '' as $$
  select public._recirculate_at(p_island, now() + p_delay);
$$;

revoke execute on function public._deliver_at(bigint, uuid, timestamptz), public._note_full(uuid), public._arrival(bigint), public._recirculate_at(uuid, timestamptz),
  public.reclaim_unfound(), public.ensure_arrivals()
  from public, anon, authenticated;

select cron.schedule('못 찾은 병 회수', '20 * * * *', $$select public.reclaim_unfound()$$);
select cron.schedule('7일 보장', '40 * * * *', $$select public.ensure_arrivals()$$);
