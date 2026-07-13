-- 为 users 表添加合作状态字段
-- 在 Supabase Dashboard 的 SQL Editor 中运行
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_cooperating BOOLEAN DEFAULT true;

-- 可选：为所有现有人员默认设置为合作状态
UPDATE public.users SET is_cooperating = true WHERE is_cooperating IS NULL;
