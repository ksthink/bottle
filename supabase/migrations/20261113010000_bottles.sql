-- 3단계: 편지와 병.
-- 표는 모두 RLS로 막아 두고(정책 없음) 아래 함수로만 읽고 쓴다. 병 개수는 서버가 센다.
--
-- 병 하나가 곧 수신 기록이다. 같은 섬에 같은 편지는 한 번만 간다 (unique).
--   drifting: 바다에 있거나(arrive_at 전) 해변에 닿아 있다(arrive_at 후)
--   opened:   열어서 읽었지만 아직 챙기지도 가라앉히지도 않았다
--   kept:     챙겼다. 손에 든 병이 하나 는다
--   sunk:     가라앉혔다(신고). 병을 얻지 못한다
-- 상한 3개 = 손에 든 병(held) + 이 섬으로 오는 중이거나 해변에 있는 병(drifting, opened)

alter table public.islands
  add column held smallint not null default 1 check (held between 0 and 3),
  add column last_received_at timestamptz;

create table public.letters (
  id         bigint generated always as identity primary key,
  author     uuid references auth.users (id) on delete set null, -- 익명 계정이 정리돼도 보낸 편지는 남는다
  kind       text not null default 'user' check (kind in ('user', 'rule')),
  rule_no    smallint unique check (rule_no between 1 and 3),
  body       text not null,
  status     text not null default 'ok' check (status in ('ok', 'blocked', 'reported')),
  sent_ip    inet,
  created_at timestamptz not null default now()
);
create index letters_author on public.letters (author);

create table public.bottles (
  id         bigint generated always as identity primary key,
  letter_id  bigint not null references public.letters (id) on delete cascade,
  island     uuid not null references public.islands (owner) on delete cascade,
  state      text not null default 'drifting' check (state in ('drifting', 'opened', 'kept', 'sunk')),
  arrive_at  timestamptz not null,
  angle      real not null, -- 해변 위치(섬 중심에서 본 각도, 라디안)
  opened_at  timestamptz,
  opened_ip  inet,
  created_at timestamptz not null default now(),
  unique (island, letter_id)
);
create index bottles_island_state on public.bottles (island, state);
create index bottles_letter on public.bottles (letter_id);

-- 관리자가 Supabase 화면에서 직접 넣는다. 이 IP에서 던진 병은 조용히 '차단됨'이 된다
create table public.blocked_ips (
  ip         inet primary key,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.letters enable row level security;
alter table public.bottles enable row level security;
alter table public.blocked_ips enable row level security;

-- 규칙 편지 세 통 (lib/island/letters.js 의 RULES)
insert into public.letters (kind, rule_no, body)
select 'rule', v.n, v.body from (values
  (1, '이 병을 주운 분께.

저도 혼자 있기로 하고 이런 섬에 왔습니다. 먹을 것은 걱정하지 않아도 됩니다. 여기서는 할 일이 많지 않습니다. 걷고, 기다리고, 가끔 이렇게 씁니다.

당신에게는 처음부터 병이 하나 있었을 겁니다. 그리고 지금 이 병도 당신 것이 되었습니다. 병에 글을 넣어 바다에 던지면 어딘가의 누군가에게 반드시 닿습니다. 누구에게 닿을지는 고를 수 없습니다. 닿았는지도, 읽혔는지도 끝내 알 수 없습니다. 답장도 오지 않습니다. 저 역시 이 편지가 당신에게 닿았다는 것을 모릅니다.

그래도 저는 던졌습니다.'),
  (2, '병은 세 개까지만 곁에 둘 수 있습니다. 그늘막 선반이 세 칸인 것을 보셨을 겁니다.

선반이 가득 찬 동안에는 바다가 아무것도 보내지 않습니다. 저는 그걸 모르고 오랫동안 빈 해변만 걸었습니다.

한 칸이라도 비어 있으면 이레 안에 병 하나는 옵니다. 더 일찍 올 때도 있지만 이레를 넘긴 적은 없었습니다.

조용히 지내고 싶으면 세 개를 그대로 두면 됩니다. 바깥이 궁금해지면 하나를 써서 보내세요.'),
  (3, '라디오는 언제든 켜집니다. 음악도 나오고, 날씨와 물때 이야기도 나옵니다. 물때 이야기는 생각보다 쓸모가 있습니다.

병은 파도와 물때와 바람을 따라 오기 때문에 매번 다른 곳에 닿습니다. 큰 바람이 지나간 다음 날에는 평소 가지 않던 쪽 해변도 걸어보세요. 도착한 병을 오래 찾지 못하면 밀물이 다시 가져가서 다른 섬으로 보냅니다.

두 가지만 더 적습니다. 편지에 이름이나 사는 곳, 연락할 방법은 적지 마세요. 그런 글은 병에 들어가지 않습니다. 그리고 받은 편지가 누군가를 해치려는 글이라면 병째 바다에 가라앉히세요. 가라앉은 편지는 다시 떠오르지 않습니다.')
) as v(n, body);

-- ───────── 내부 함수 (밖에서 부를 수 없다) ─────────

-- 상한에 드는 병 수
create function public._total(p_island uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select held from public.islands where owner = p_island), 0)
       + (select count(*) from public.bottles where island = p_island and state in ('drifting', 'opened'))::int;
$$;

create function public._is_guest(p_island uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_anonymous from auth.users where id = p_island), true);
$$;

-- 편지 한 통을 섬으로 띄운다
create function public._deliver(p_letter bigint, p_island uuid, p_delay interval) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.bottles (letter_id, island, arrive_at, angle)
  values (p_letter, p_island, now() + p_delay, random() * 2 * pi())
  on conflict (island, letter_id) do nothing;
  update public.islands set last_received_at = now() + p_delay where owner = p_island;
end;
$$;

-- 규칙 편지: 1) 섬이 생길 때 해변에 2) 첫 편지를 던진 뒤 3) 두 번째를 읽은 뒤. 한 번에 한 통씩
create function public._give_rules(p_island uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  has1 boolean; has2 boolean; done2 boolean; has3 boolean;
  delay interval := make_interval(secs => 60 + random() * 120); -- 임시: 4단계에서 물때에 맞춘다
begin
  if public._total(p_island) >= 3 then return; end if;
  select bool_or(l.rule_no = 1), bool_or(l.rule_no = 2), bool_or(l.rule_no = 2 and b.state in ('kept', 'sunk')), bool_or(l.rule_no = 3)
    into has1, has2, done2, has3
    from public.bottles b join public.letters l on l.id = b.letter_id
   where b.island = p_island and l.kind = 'rule';
  if not coalesce(has1, false) then
    perform public._deliver((select id from public.letters where rule_no = 1), p_island, interval '0');
  elsif not coalesce(has2, false) and exists (select 1 from public.letters where author = p_island) then
    perform public._deliver((select id from public.letters where rule_no = 2), p_island, delay);
  elsif coalesce(done2, false) and not coalesce(has3, false) then
    perform public._deliver((select id from public.letters where rule_no = 3), p_island, delay);
  end if;
end;
$$;

-- 이미 누군가 읽은 사람 편지 한 통을 다시 띄운다 (재유통). 받은 적 없고 내가 쓰지 않은 것 중에서
create function public._recirculate(p_island uuid, p_delay interval) returns void
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
    perform public._deliver(pick, p_island, p_delay);
  end if;
end;
$$;

-- 던진 편지를 받을 섬을 고른다. 쓴 사람과 이미 받은 섬은 빼고, 병이 3개 미만인 섬 중
-- 오래 못 받은 섬부터. 회원은 최근 7일 안에 들어온 섬, 손님은 지금(10분 안) 머무는 섬만
create function public._assign(p_letter bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  writer uuid;
  target uuid;
  guest boolean;
begin
  select author into writer from public.letters where id = p_letter and kind = 'user' and status = 'ok';
  if not found then return false; end if;
  select i.owner, u.is_anonymous into target, guest
    from public.islands i join auth.users u on u.id = i.owner
   where i.owner is distinct from writer
     and not exists (select 1 from public.bottles b where b.island = i.owner and b.letter_id = p_letter)
     and ((not u.is_anonymous and i.last_seen_at > now() - interval '7 days')
       or (u.is_anonymous and i.last_seen_at > now() - interval '10 minutes'))
     and public._total(i.owner) < 3
   order by i.last_received_at nulls first, random()
   limit 1
   for update of i skip locked;
  if target is null then return false; end if;
  -- 임시 도착 시각: 4단계에서 파도·조수·바람으로 바꾼다
  perform public._deliver(p_letter, target,
    case when guest then make_interval(secs => 60 + random() * 240)
         else make_interval(secs => 600 + random() * 3000) end);
  return true;
end;
$$;

revoke execute on function public._total(uuid), public._is_guest(uuid), public._deliver(bigint, uuid, interval),
  public._give_rules(uuid), public._recirculate(uuid, interval), public._assign(bigint)
  from public, anon, authenticated;

-- ───────── 서버 함수 전용 (secret 키로만 부른다. IP를 서버가 넘긴다) ─────────

-- 병 던지기. 손에 든 병이 하나 줄고 편지가 바다로 간다. 걸린 편지와 차단 IP의 편지는 아무에게도 가지 않는다
create function public.throw_bottle(p_user uuid, p_body text, p_ip inet, p_blocked boolean)
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
  st := case when p_blocked or exists (select 1 from public.blocked_ips where ip = p_ip) then 'blocked' else 'ok' end;
  update public.islands set held = held - 1 where owner = p_user;
  insert into public.letters (author, body, status, sent_ip) values (p_user, txt, st, p_ip) returning id into lid;
  if st = 'ok' then perform public._assign(lid); end if;
  perform public._give_rules(p_user);
  return isl.held - 1;
end;
$$;

-- 해변에 닿은 병 열기. 이때 편지 내용을 처음 돌려주고 연 IP를 남긴다. 다시 열어도 같은 편지를 준다
create function public.open_bottle(p_user uuid, p_bottle bigint, p_ip inet)
returns table (kind text, rule_no smallint, body text)
language plpgsql security definer set search_path = '' as $$
declare
  b public.bottles;
begin
  select * into b from public.bottles where id = p_bottle and island = p_user for update;
  if not found or b.state not in ('drifting', 'opened') or b.arrive_at > now() then
    raise exception 'not_here';
  end if;
  if b.state = 'drifting' then
    update public.bottles set state = 'opened', opened_at = now(), opened_ip = p_ip where id = p_bottle;
  end if;
  return query select l.kind, l.rule_no, l.body from public.letters l where l.id = b.letter_id;
end;
$$;

revoke execute on function public.throw_bottle(uuid, text, inet, boolean), public.open_bottle(uuid, bigint, inet)
  from public, anon, authenticated;
grant execute on function public.throw_bottle(uuid, text, inet, boolean), public.open_bottle(uuid, bigint, inet)
  to service_role;

-- ───────── 화면에서 부르는 함수 (로그인한 본인 것만) ─────────

-- 섬: 처음이면 만들고 규칙 편지 첫 통과 다시 떠도는 편지 한 통을 해변에 놓는다
create or replace function public.my_island()
returns public.islands
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r public.islands;
begin
  if uid is null then raise exception '로그인이 필요합니다' using errcode = '28000'; end if;
  insert into public.islands (owner, seed)
  values (uid, 10000 + floor(random() * 90000)::int)
  on conflict (owner) do nothing
  returning * into r;
  if found then
    perform public._give_rules(uid);
    perform public._recirculate(uid, interval '0');
  else
    update public.islands set last_seen_at = now() where owner = uid;
    perform public._give_rules(uid);
  end if;
  select * into r from public.islands where owner = uid;
  return r;
end;
$$;

-- 해변 상태: 손에 든 병 수와 해변에 닿아 있는 병들. 내용은 열 때만 준다. 머무는 동안 주기적으로 부른다
create function public.my_beach()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception '로그인이 필요합니다' using errcode = '28000'; end if;
  update public.islands set last_seen_at = now() where owner = uid;
  return jsonb_build_object(
    'held', (select held from public.islands where owner = uid),
    'beach', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'angle', b.angle, 'rule', l.rule_no) order by b.arrive_at)
        from public.bottles b join public.letters l on l.id = b.letter_id
       where b.island = uid and b.state in ('drifting', 'opened') and b.arrive_at <= now()), '[]'::jsonb));
end;
$$;

-- 열어 본 병을 챙긴다. 손에 든 병이 하나 는다
create function public.keep_bottle(p_bottle bigint)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  h int;
begin
  update public.bottles set state = 'kept' where id = p_bottle and island = uid and state = 'opened';
  if not found then raise exception 'not_here'; end if;
  update public.islands set held = held + 1 where owner = uid returning held into h;
  perform public._give_rules(uid);
  return h;
end;
$$;

-- 열어 본 병을 가라앉힌다(신고). 병은 얻지 못하고 그 편지는 다시 떠돌지 않는다. 신고 메일은 5단계
create function public.sink_bottle(p_bottle bigint)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lid bigint;
begin
  update public.bottles set state = 'sunk' where id = p_bottle and island = uid and state = 'opened'
  returning letter_id into lid;
  if not found then raise exception 'not_here'; end if;
  update public.letters set status = 'reported' where id = lid and kind = 'user';
  perform public._give_rules(uid);
  return (select held from public.islands where owner = uid);
end;
$$;

-- 편지함 (회원만): 받은 편지(열어 본 것, 가라앉힌 것은 뺀다)와 보낸 편지(본문과 날짜만)
create function public.my_letters()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or public._is_guest(uid) then raise exception 'members_only'; end if;
  return jsonb_build_object(
    'received', coalesce((
      select jsonb_agg(jsonb_build_object('body', l.body, 'rule', l.rule_no, 'at', b.opened_at) order by b.opened_at desc)
        from public.bottles b join public.letters l on l.id = b.letter_id
       where b.island = uid and b.state in ('opened', 'kept')), '[]'::jsonb),
    'sent', coalesce((
      select jsonb_agg(jsonb_build_object('body', l.body, 'at', l.created_at) order by l.created_at desc)
        from public.letters l where l.author = uid), '[]'::jsonb));
end;
$$;

revoke execute on function public.my_beach(), public.keep_bottle(bigint), public.sink_bottle(bigint), public.my_letters()
  from public, anon;
grant execute on function public.my_beach(), public.keep_bottle(bigint), public.sink_bottle(bigint), public.my_letters()
  to authenticated;

-- ───────── 주기 작업 ─────────

-- 받을 섬을 아직 못 찾은 편지를 다시 배정한다 (5분마다)
create function public.assign_drifting() returns int
language plpgsql security definer set search_path = '' as $$
declare
  l record;
  n int := 0;
begin
  for l in
    select id from public.letters x
     where x.kind = 'user' and x.status = 'ok' and x.created_at > now() - interval '30 days'
       and not exists (select 1 from public.bottles b where b.letter_id = x.id)
     order by x.created_at
     limit 200
  loop
    if public._assign(l.id) then n := n + 1; end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public.assign_drifting() from public, anon, authenticated;

select cron.schedule('떠도는 편지 배정', '*/5 * * * *', $$select public.assign_drifting()$$);

-- IP는 한 달만 보관한다 (매일 04:10 KST)
create function public.purge_ips() returns void
language sql security definer set search_path = '' as $$
  update public.letters set sent_ip = null where sent_ip is not null and created_at < now() - interval '1 month';
  update public.bottles set opened_ip = null where opened_ip is not null and opened_at < now() - interval '1 month';
$$;
revoke execute on function public.purge_ips() from public, anon, authenticated;

select cron.schedule('IP 삭제', '10 19 * * *', $$select public.purge_ips()$$);
