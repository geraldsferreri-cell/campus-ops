-- ============================================================
-- 校园运营管理系统 - Supabase 建表 SQL
-- 在 Supabase SQL Editor 中运行此文件
-- ============================================================

-- 1. 角色表
create table if not exists public.co_roles (
  id text primary key,
  name text not null,
  description text default '',
  perms jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- 2. 用户表
create table if not exists public.co_users (
  id bigserial primary key,
  username text unique not null,
  password text not null,
  real_name text default '',
  role text not null default 'student',
  group_id bigint,
  active boolean default true,
  created_at timestamptz default now()
);

-- 3. 平台表
create table if not exists public.co_platforms (
  id text primary key,
  name text not null,
  color text default '#3b82f6',
  created_at timestamptz default now()
);

-- 4. 分组表
create table if not exists public.co_groups (
  id bigserial primary key,
  name text not null,
  teacher_id bigint,
  teacher_name text default '',
  created_at timestamptz default now()
);

-- 5. 账号表
create table if not exists public.co_accounts (
  id bigserial primary key,
  name text not null,
  platform text references public.co_platforms(id),
  status text default '未分配',
  group_id bigint references public.co_groups(id),
  group_name text default '',
  assigned_to bigint,
  created_at timestamptz default now()
);

-- 6. 视频/内容表
create table if not exists public.co_posts (
  id bigserial primary key,
  note_id text,
  platform text,
  account_id bigint references public.co_accounts(id),
  user_id bigint references public.co_users(id),
  title text default '',
  url text default '',
  note text default '',
  views bigint default 0,
  likes bigint default 0,
  comments bigint default 0,
  collect bigint default 0,
  fetch_status text default '待抓取',
  post_date text default '',
  created_at timestamptz default now()
);

-- 7. 薪资记录表
create table if not exists public.co_salary_records (
  id bigserial primary key,
  user_id bigint references public.co_users(id),
  user_name text default '',
  year_month text not null,
  base_salary numeric default 0,
  post_bonus numeric default 0,
  like_bonus numeric default 0,
  teach_bonus numeric default 0,
  total numeric default 0,
  detail jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 8. 配置表（薪资配置等）
create table if not exists public.co_configs (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- ============================================================
-- 关闭 RLS（允许匿名访问，适合内部管理系统）
-- ============================================================
alter table public.co_roles disable row level security;
alter table public.co_users disable row level security;
alter table public.co_platforms disable row level security;
alter table public.co_groups disable row level security;
alter table public.co_accounts disable row level security;
alter table public.co_posts disable row level security;
alter table public.co_salary_records disable row level security;
alter table public.co_configs disable row level security;

-- ============================================================
-- 插入初始管理员账号（用户名: admin 密码: admin123）
-- ============================================================
insert into public.co_roles (id, name, description, perms)
values ('admin', '超级管理员', '拥有所有权限', '[]'::jsonb)
on conflict (id) do nothing;

insert into public.co_users (username, password, real_name, role, active)
values ('admin', 'admin123', '管理员', 'admin', true)
on conflict (username) do nothing;

-- 插入常用平台
insert into public.co_platforms (id, name, color) values
  ('xhs', '小红书', '#ff2442'),
  ('dy', '抖音', '#000000'),
  ('wx', '微信视频号', '#07c160'),
  ('wb', '微博', '#e6162d'),
  ('bili', 'B站', '#00a1d6')
on conflict (id) do nothing;

select 'tables created and initialized successfully!' as result;
