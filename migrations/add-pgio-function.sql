-- ============================================================
-- 校园运营系统 - pgio 函数 + RLS 修复
-- 在 Supabase SQL Editor 中运行此文件
-- https://supabase.com/dashboard/project/eeuvrabunfvsaxgpaiub
-- ============================================================

-- 1. 创建 pgio 函数（允许前端通过 RPC 执行动态 SQL）
--    SECURITY DEFINER 使函数以创建者权限运行，anon key 也能调用
CREATE OR REPLACE FUNCTION public.pgio(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE query;
END;
$$;

-- 授权所有角色调用
GRANT EXECUTE ON FUNCTION public.pgio(text) TO anon, authenticated, service_role;

-- 2. 修复所有表的 RLS 策略（幂等操作）
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['videos','accounts','users','groups','salary_configs','salaries','market_reports'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- 启用 RLS
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY', tbl);
    -- 删除旧策略（避免重复）
    EXECUTE format('DROP POLICY IF EXISTS "pub" ON public.%I', tbl);
    -- 创建全开放策略
    EXECUTE format('CREATE POLICY "pub" ON public.%I FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END;
$$;

-- 3. 为 videos 表添加 created_by 字段（追溯创建者）
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS created_by bigint;

-- 4. 验证结果
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

SELECT 'pgio 函数 + RLS 修复完成！' AS result;
