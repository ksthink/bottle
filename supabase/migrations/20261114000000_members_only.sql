-- 원칙: 편지는 가입한 회원만 보낸다. 비회원(익명 계정)은 받은 편지를 읽기만 한다.
-- 그래서 신고된 편지에는 늘 보낸 사람의 이메일이 있고, 관리자 메일(/api/sink)에 함께 간다.
-- 화면(game.js)과 서버(/api/throw)도 같은 원칙으로 막는다. 이 파일은 DB에서 마지막으로 지킨다.

-- 병 던지기: 비회원이면 거절한다(나머지는 20261113020000_tides.sql 과 같다)
create or replace function public.throw_bottle(p_user uuid, p_body text, p_ip inet, p_blocked boolean)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  isl public.islands;
  txt text := btrim(p_body);
  lid bigint;
  st text;
begin
  if public._is_guest(p_user) then raise exception 'members_only'; end if;
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

-- 섬이 받을 수 있는 상한(3)을 셀 때 비회원의 챙긴 병은 넣지 않는다.
-- 비회원은 병을 보내 비울 수 없으므로, 넣으면 세 통을 챙긴 뒤로는 더 받지 못한다
create or replace function public._total(p_island uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case when public._is_guest(p_island) then 0
              else coalesce((select held from public.islands where owner = p_island), 0) end
       + (select count(*) from public.bottles where island = p_island and state in ('drifting', 'opened'))::int;
$$;
