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
SET search_path = public
AS $$
BEGIN
  EXECUTE query;
END;
$$;

-- 授权所有角色调用
GRANT EXECUTE ON FUNCTION public.pgio(text) TO anon, authenticated, service_role;

-- 2. 关闭所有应用表的 RLS（跳过不存在的表）
--    原因：整个系统使用 anon key，没有 Supabase Auth，RLS 不提供安全价值
--    客户端 canViewVideo/canViewUser 已处理访问控制
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['videos','accounts','users','groups','salary_configs','salaries','market_reports'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- 检查表是否存在（避免 market_reports 等未创建的表报错）
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('DROP POLICY IF EXISTS "pub" ON public.%I', tbl);
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END;
$$;

-- 3. 为 videos 表添加 created_by 字段（追溯创建者）
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS created_by bigint;

-- 4. 验证结果
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('videos','accounts','users','groups','salary_configs','salaries','market_reports')
ORDER BY tablename;

SELECT '✅ pgio 函数已创建，所有表 RLS 已关闭！' AS result;
