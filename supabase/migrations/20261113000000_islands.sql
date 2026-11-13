-- 2단계: 섬. 계정(익명 포함)마다 섬 하나. 저장하는 것은 시드뿐이고 지형은 화면에서 다시 계산한다.
-- 회원 여부는 auth.users.is_anonymous 로 판단하므로 따로 적지 않는다.

create table public.islands (
  owner        uuid primary key references auth.users (id) on delete cascade,
  seed         integer not null check (seed between 10000 and 99999),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.islands enable row level security;

-- 자기 섬만 읽을 수 있다. 쓰기는 아래 함수로만 한다.
create policy "자기 섬 읽기" on public.islands
  for select to authenticated
  using (owner = (select auth.uid()));

-- 내 섬을 돌려준다. 없으면 시드를 뽑아 만들고, 있으면 마지막 접속 시각만 고친다.
create function public.my_island()
returns public.islands
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.islands;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다' using errcode = '28000';
  end if;
  insert into public.islands (owner, seed)
  values (auth.uid(), 10000 + floor(random() * 90000)::int)
  on conflict (owner) do update set last_seen_at = now()
  returning * into r;
  return r;
end;
$$;

revoke execute on function public.my_island() from public, anon;
grant execute on function public.my_island() to authenticated;

-- 비회원(익명) 계정은 접속마다 새로 생기므로, 만든 지 이틀이 지난 것을 매일 지운다. 섬도 함께 지워진다.
create extension if not exists pg_cron;

select cron.schedule(
  '익명 계정 정리',
  '0 19 * * *', -- 매일 04:00 KST
  $$delete from auth.users where is_anonymous and created_at < now() - interval '2 days'$$
);
