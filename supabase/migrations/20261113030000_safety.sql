-- 5단계: 안전. 신고는 서버를 거쳐 신고한 사람의 IP를 남기고 관리자에게 메일을 보낸다. 탈퇴하면 보낸 편지를 거둬들인다.

-- 탈퇴한 사람이 보낸 편지: 더 이상 떠돌지 않는다 (이미 받은 사람의 편지함에는 남는다)
alter table public.letters drop constraint letters_status_check;
alter table public.letters add constraint letters_status_check
  check (status in ('ok', 'blocked', 'reported', 'withdrawn'));

create table public.reports (
  id          bigint generated always as identity primary key,
  letter_id   bigint not null references public.letters (id) on delete cascade,
  bottle_id   bigint references public.bottles (id) on delete set null,
  reporter    uuid references auth.users (id) on delete set null,
  reporter_ip inet,
  created_at  timestamptz not null default now(),
  mailed_at   timestamptz -- 관리자 메일을 보낸 시각. 비어 있으면 보내지 못한 것
);
alter table public.reports enable row level security;

-- 가라앉히기(신고). 서버 함수만 부른다. 병은 얻지 못하고, 사람 편지면 '신고됨'이 되어 다시 떠돌지 않는다.
-- 사람 편지면 관리자 메일에 넣을 내용을 함께 돌려준다
create function public.report_bottle(p_user uuid, p_bottle bigint, p_ip inet)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.bottles;
  l public.letters;
  rid bigint;
begin
  select * into b from public.bottles where id = p_bottle and island = p_user and state = 'opened' for update;
  if not found then raise exception 'not_here'; end if;
  perform public._note_full(p_user);
  update public.bottles set state = 'sunk' where id = p_bottle;
  select * into l from public.letters where id = b.letter_id;
  perform public._give_rules(p_user);
  if l.kind <> 'user' then
    return jsonb_build_object('held', (select held from public.islands where owner = p_user), 'report', null);
  end if;
  update public.letters set status = 'reported' where id = l.id and status = 'ok';
  insert into public.reports (letter_id, bottle_id, reporter, reporter_ip) values (l.id, b.id, p_user, p_ip)
  returning id into rid;
  return jsonb_build_object(
    'held', (select held from public.islands where owner = p_user),
    'report', jsonb_build_object(
      'id', rid,
      'letter_id', l.id,
      'body', l.body,
      'sent_at', l.created_at,
      'sent_ip', host(l.sent_ip),
      'author_email', (select email from auth.users where id = l.author and not is_anonymous),
      'author_member', (select not is_anonymous from auth.users where id = l.author),
      'received_at', b.opened_at,
      'received_ip', host(b.opened_ip),
      'reported_at', now(),
      'reporter_ip', host(p_ip)));
end;
$$;

create function public.mark_report_mailed(p_report bigint) returns void
language sql security definer set search_path = '' as $$
  update public.reports set mailed_at = now() where id = p_report;
$$;

-- 탈퇴 준비: 보낸 편지를 거둬들인다. 바다에 떠 있거나 해변에서 아직 열리지 않은 병은 회수한다.
-- 계정 삭제는 서버 함수가 이어서 한다 (섬과 받은 병은 함께 지워진다)
create function public.withdraw(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.bottles set state = 'reclaimed'
   where state = 'drifting'
     and letter_id in (select id from public.letters where author = p_user and kind = 'user');
  update public.letters set status = 'withdrawn' where author = p_user and kind = 'user' and status = 'ok';
end;
$$;

-- 신고는 이제 서버(/api/sink)를 거친다. 화면에서 바로 부르던 sink_bottle 은 막는다
revoke execute on function public.sink_bottle(bigint) from authenticated;

revoke execute on function public.report_bottle(uuid, bigint, inet), public.mark_report_mailed(bigint), public.withdraw(uuid)
  from public, anon, authenticated;
grant execute on function public.report_bottle(uuid, bigint, inet), public.mark_report_mailed(bigint), public.withdraw(uuid)
  to service_role;

-- 한 달 지난 IP 삭제에 신고한 사람의 IP도 넣는다 (메일에는 이미 담겨 있다)
create or replace function public.purge_ips() returns void
language sql security definer set search_path = '' as $$
  update public.letters set sent_ip = null where sent_ip is not null and created_at < now() - interval '1 month';
  update public.bottles set opened_ip = null where opened_ip is not null and opened_at < now() - interval '1 month';
  update public.reports set reporter_ip = null where reporter_ip is not null and created_at < now() - interval '1 month';
$$;
