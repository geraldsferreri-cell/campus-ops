-- ============================================================
-- 校园运营系统 - 资讯热点表
-- 在 Supabase SQL Editor 中运行此文件
-- ============================================================

-- 创建新闻资讯表
CREATE TABLE IF NOT EXISTS public.co_news (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT DEFAULT '',
    source TEXT DEFAULT '',
    url TEXT DEFAULT '',
    category TEXT NOT NULL,
    category_name TEXT DEFAULT '',
    category_color TEXT DEFAULT '#3b82f6',
    scrape_date TEXT DEFAULT '',
    published_time TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_co_news_category ON public.co_news(category);
CREATE INDEX IF NOT EXISTS idx_co_news_scrape_date ON public.co_news(scrape_date);
CREATE INDEX IF NOT EXISTS idx_co_news_created_at ON public.co_news(created_at DESC);

-- 关闭 RLS（允许匿名读取）
ALTER TABLE public.co_news DISABLE ROW LEVEL SECURITY;

-- 允许所有用户读取（匿名访问）
CREATE POLICY "允许所有人读取资讯"
ON public.co_news FOR SELECT
USING (true);

-- 允许 service_role 写入（通过 API key）
-- Supabase 默认允许 service_role 做任何操作，无需额外策略

SELECT 'co_news table created successfully!' AS result;
