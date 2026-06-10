# -*- coding: utf-8 -*-
"""
校园运营系统 - 每日新闻自动抓取器 v4
主源：DailyHot API（微博/B站/知乎/百度/抖音等36+平台聚合）
备用：直接抓取微博/知乎/B站热榜
同时更新 index.html 的 NEWS_DEFAULTS + 写入 Supabase
通过 GitHub Actions 每日 10:00 CST 自动运行
"""

import os, sys, json, time, re, logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

try:
    from supabase import create_client, Client
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False

# ── 配置 ───────────────────────────────────────────────────
SUPABASE_URL  = os.environ.get("SUPABASE_URL", "https://eeuvrabunfvsaxgpaiub.supabase.co")
SUPABASE_KEY  = os.environ.get("SUPABASE_KEY", "")
DAILYHOT_API  = os.environ.get("DAILYHOT_API", "https://api-hot.imsyy.top")
CST = timezone(timedelta(hours=8))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
logger = logging.getLogger("news_scraper")

DESKTOP_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)

# ── 10 个资讯板块 ──────────────────────────────────────────
CATEGORY_SOURCES = {
    "tech": {
        "name": "🤖 科技", "color": "#3b82f6",
        "keywords": ["科技","手机","芯片","半导体","互联网","数码","电动车","新能源","操作系统","App","发布","旗舰","处理器","WWDC","索尼","任天堂","Steam","华为","小米","苹果","荣耀","OPPO","vivo","一加"]
    },
    "ai": {
        "name": "🧠 AI", "color": "#8b5cf6",
        "keywords": ["AI","人工智能","大模型","GPT","Claude","OpenAI","深度学习","机器学习","AGI","智能体","Agent","ChatGPT","Copilot","AIGC","生成式","Anthropic","Gemini","Llama","DeepSeek","Grok","Midjourney","Sora"]
    },
    "sports": {
        "name": "⚽ 体育", "color": "#10b981",
        "keywords": ["足球","篮球","NBA","世界杯","欧冠","英超","法网","网球","奥运","F1","电竞","田径","游泳","乒乓","羽毛球","马拉松","拳击","MMA","梅西","C罗","WTT","温网","世预赛","湖人","勇士"]
    },
    "show": {
        "name": "🌟 秀场", "color": "#ec4899",
        "keywords": ["红毯","时装周","秀场","代言","大片","写真","封面","街拍","穿搭","品牌大使","高定","Look","妆容","发型","出发图","活动生图","明星","艺人","爱豆","偶像"]
    },
    "fashion": {
        "name": "👗 时尚", "color": "#f43f5e",
        "keywords": ["时尚","潮流","联名","限量","球鞋","奢侈品","腕表","珠宝","美妆","护肤","穿搭","OOTD","VOGUE","ELLE","芭莎","Nike","Adidas","Supreme","LV","Gucci","Chanel","Dior","Prada"]
    },
    "variety": {
        "name": "📺 综艺", "color": "#f59e0b",
        "keywords": ["综艺","真人秀","乘风","披荆","脱口秀","选秀","街舞","说唱","恋综","喜剧","春晚","跨年","舞台","公演","淘汰","成团","快乐大本营","奔跑吧","极挑"]
    },
    "film": {
        "name": "🎬 影视", "color": "#6366f1",
        "keywords": ["电影","票房","上映","定档","预告","导演","影帝","影后","奥斯卡","剧集","网剧","国产剧","美剧","韩剧","番","动画","暑期档","撤档","豆瓣","IMDb","漫威"]
    },
    "kpop": {
        "name": "🇰🇷 韩娱", "color": "#14b8a6",
        "keywords": ["韩娱","aespa","BTS","BLACKPINK","IVE","NewJeans","LE SSERAFIM","TWICE","SEVENTEEN","NCT","EXO","Stray Kids","ILLIT","SM","YG","JYP","HYBE","回归","打歌","K-pop","韩剧","韩国"]
    },
    "marketing": {
        "name": "📊 营销", "color": "#f97316",
        "keywords": ["营销","广告","品牌","案例","SocialBeta","出圈","刷屏","campaign","增长","私域","直播带货","KOL","MCN","投放","内容营销","事件营销","联名款","瑞幸","蜜雪冰城"]
    },
    "fun": {
        "name": "🎮 好玩有趣", "color": "#22c55e",
        "keywords": ["搞笑","趣闻","段子","整活","创意","发明","DIY","旅行","美食","萌宠","动物","奇葩","神操作","脑洞","新奇","黑科技","游戏","桌游","密室","剧本杀","B站","UP主"]
    },
}

# ── DailyHot API 平台映射 ──────────────────────────────────
DAILYHOT_SOURCES = [
    ("weibo",       ["kpop", "variety", "show", "film", "fashion", "sports", "ai", "tech", "marketing", "fun"]),
    ("bilibili",    ["tech", "ai", "sports", "variety", "film", "fashion", "kpop", "marketing", "fun"]),
    ("zhihu",       ["ai", "tech", "sports", "film", "variety", "marketing", "fun"]),
    ("baidu",       ["kpop", "variety", "show", "film", "fashion", "sports", "ai", "tech", "marketing", "fun"]),
    ("douyin",      ["kpop", "variety", "show", "film", "fashion", "sports", "ai", "tech", "marketing", "fun"]),
    ("toutiao",     ["sports", "tech", "ai", "film", "variety", "marketing", "fun"]),
    ("douban-movie",["film", "show", "variety", "fun"]),
]


# ── 工具函数 ───────────────────────────────────────────────
def safe_get(url, headers=None, timeout=15, retries=2, as_json=False):
    """安全的 HTTP GET"""
    for attempt in range(retries + 1):
        try:
            h = headers or {"User-Agent": DESKTOP_UA}
            resp = requests.get(url, headers=h, timeout=timeout, allow_redirects=True)
            resp.raise_for_status()
            return resp.json() if as_json else resp
        except Exception as e:
            if attempt < retries:
                time.sleep(2)
            else:
                logger.info(f"  请求失败 [{url[:80]}]: {e}")
    return None


def match_any(text, keywords):
    """任意关键词命中即返回 True"""
    tl = text.lower()
    return any(kw.lower() in tl for kw in keywords)


def dedup_key(title):
    """去重指纹"""
    return re.sub(r'\s+', '', title)[:20].lower()


# ═══════════════════════════════════════════════════════════
#  DailyHot API 抓取
# ═══════════════════════════════════════════════════════════

def fetch_dailyhot(platform):
    """从 DailyHot API 获取单个平台热榜"""
    items = []
    try:
        url = f"{DAILYHOT_API}/{platform}"
        resp = safe_get(url, timeout=12, as_json=True)
        if not resp:
            logger.info(f"  DailyHot/{platform}: 请求无响应")
            return items
        if resp.get("code") != 200:
            logger.info(f"  DailyHot/{platform}: code={resp.get('code')}, msg={resp.get('msg','')}")
            return items

        data = resp.get("data", [])
        for entry in data:
            title = (entry.get("title") or "").strip()
            if not title:
                continue
            item = {
                "title": title,
                "url": entry.get("url", ""),
                "source": platform,
                "summary": (entry.get("desc") or "")[:200],
                "hot_score": entry.get("hot", 0),
                "time": datetime.now(CST).strftime("%-m/%-d"),
            }
            if platform == "bilibili" and entry.get("author"):
                item["is_video"] = True
                item["video_author"] = entry.get("author", "")
            items.append(item)

        logger.info(f"  DailyHot/{platform} → {len(items)} 条")
    except Exception as e:
        logger.info(f"  DailyHot/{platform} 失败: {e}")
    return items


def fetch_all_dailyhot():
    """从 DailyHot API 抓取所有配置的平台"""
    all_items = []
    for platform, _ in DAILYHOT_SOURCES:
        items = fetch_dailyhot(platform)
        all_items.extend(items)
        time.sleep(0.5)
    return all_items


# ═══════════════════════════════════════════════════════════
#  备用数据源：直接抓取各平台热榜
# ═══════════════════════════════════════════════════════════

def fetch_weibo_hot():
    """备用：抓取微博热搜"""
    items = []
    try:
        url = "https://weibo.com/ajax/side/hotSearch"
        resp = safe_get(url, timeout=12, as_json=True)
        if not resp:
            return items
        data = resp.get("data", {}).get("realtime", [])
        for entry in data[:30]:
            title = (entry.get("note") or "").strip()
            if not title:
                continue
            items.append({
                "title": title,
                "url": f"https://s.weibo.com/weibo?q=%23{title}%23",
                "source": "weibo",
                "summary": (entry.get("word") or "")[:200],
                "hot_score": entry.get("raw_hot", 0),
                "time": datetime.now(CST).strftime("%-m/%-d"),
            })
        logger.info(f"  备用/微博热搜 → {len(items)} 条")
    except Exception as e:
        logger.info(f"  备用/微博热搜 失败: {e}")
    return items


def fetch_zhihu_hot():
    """备用：抓取知乎热榜"""
    items = []
    try:
        url = "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total"
        headers = {"User-Agent": DESKTOP_UA, "Referer": "https://www.zhihu.com/"}
        resp = safe_get(url, headers=headers, timeout=12, as_json=True)
        if not resp:
            return items
        data = resp.get("data", [])
        for entry in data[:30]:
            card = entry.get("target", {})
            title = (card.get("title") or "").strip()
            if not title:
                continue
            items.append({
                "title": title,
                "url": card.get("url", "").replace("http://", "https://"),
                "source": "zhihu",
                "summary": (card.get("excerpt", ""))[:200],
                "hot_score": entry.get("detail_text", ""),
                "time": datetime.now(CST).strftime("%-m/%-d"),
            })
        logger.info(f"  备用/知乎热榜 → {len(items)} 条")
    except Exception as e:
        logger.info(f"  备用/知乎热榜 失败: {e}")
    return items


def fetch_bilibili_hot():
    """备用：抓取B站热门"""
    items = []
    try:
        url = "https://api.bilibili.com/x/web-interface/popular?ps=30"
        headers = {"User-Agent": DESKTOP_UA, "Referer": "https://www.bilibili.com"}
        resp = safe_get(url, headers=headers, timeout=12, as_json=True)
        if not resp:
            return items
        data = resp.get("data", {}).get("list", [])
        for entry in data[:30]:
            title = (entry.get("title") or "").strip()
            if not title:
                continue
            owner = entry.get("owner", {})
            items.append({
                "title": title,
                "url": entry.get("short_link_v2") or f"https://www.bilibili.com/video/{entry.get('bvid','')}",
                "source": "bilibili",
                "summary": (entry.get("rcmd_reason", {}).get("content", ""))[:200],
                "hot_score": entry.get("stat", {}).get("view", 0),
                "time": datetime.now(CST).strftime("%-m/%-d"),
                "is_video": True,
                "video_author": owner.get("name", ""),
            })
        logger.info(f"  备用/B站热门 → {len(items)} 条")
    except Exception as e:
        logger.info(f"  备用/B站热门 失败: {e}")
    return items


def fetch_fallback_sources():
    """当 DailyHot 失败时，使用备用数据源"""
    logger.info("\n[备用] DailyHot 无数据，尝试直接抓取各平台 ...")
    all_items = []
    all_items.extend(fetch_weibo_hot())
    all_items.extend(fetch_zhihu_hot())
    all_items.extend(fetch_bilibili_hot())
    logger.info(f"  备用源共抓取 {len(all_items)} 条")
    return all_items


# ═══════════════════════════════════════════════════════════
#  分类 & 去重
# ═══════════════════════════════════════════════════════════

PLATFORM_NAMES = {
    "weibo": "微博热搜", "bilibili": "B站", "zhihu": "知乎",
    "baidu": "百度热搜", "douyin": "抖音", "toutiao": "今日头条",
    "douban-movie": "豆瓣电影", "kuaishou": "快手",
    "36kr": "36氪", "ithome": "IT之家", "thepaper": "澎湃新闻",
}


def categorize_items(items):
    """将条目按关键词分入对应板块"""
    categorized = {cid: [] for cid in CATEGORY_SOURCES}

    for item in items:
        title = item.get("title", "")
        source = item.get("source", "")
        assigned = False

        priority = ["fun"]
        for plat, prio in DAILYHOT_SOURCES:
            if plat == source:
                priority = prio
                break

        for cid in priority:
            if match_any(title, CATEGORY_SOURCES[cid]["keywords"]):
                categorized[cid].append(item)
                assigned = True
                break

        if not assigned:
            categorized["fun"].append(item)

        item["source"] = PLATFORM_NAMES.get(source, source)

    return categorized


def deduplicate(categorized):
    """标题去重，每个分类最多 4 条"""
    for cid in categorized:
        seen = set()
        uniq = []
        for item in categorized[cid]:
            k = dedup_key(item["title"])
            if k not in seen:
                seen.add(k)
                uniq.append(item)
        categorized[cid] = uniq[:4]
    return categorized


def make_summary(item):
    """为每条新闻生成摘要文本"""
    if item.get("summary"):
        return item["summary"][:200]
    title = item.get("title", "")
    hs = item.get("hot_score", 0)
    if isinstance(hs, (int, float)) and hs > 10000:
        heat = f"热度{hs/10000:.1f}万"
    elif isinstance(hs, (int, float)) and hs > 0:
        heat = f"热度{int(hs)}"
    else:
        heat = ""
    tips = f"（{heat}）" if heat else ""
    return f"最新资讯：{title}{tips}"


# ═══════════════════════════════════════════════════════════
#  存储：HTML 更新 + Supabase
# ═══════════════════════════════════════════════════════════

def update_html_news_defaults(categorized):
    """更新 index.html 中的 NEWS_DEFAULTS 块"""
    html_path = Path(__file__).parent.parent / "index.html"
    if not html_path.exists():
        logger.error(f"  ❌ 找不到 {html_path}")
        return False

    with open(html_path, "r", encoding="utf-8") as f:
        content = f.read()

    start_marker = "// ============ 资讯热点模块 ============"
    end_marker = "// ============ 近期选题数据 ============"

    start_idx = content.find(start_marker)
    end_idx = content.find(end_marker)
    if start_idx == -1 or end_idx == -1:
        logger.error("  ❌ 找不到边界标记，无法更新 HTML")
        return False

    today = datetime.now(CST).strftime("%Y-%m-%d")
    categories_js = ""
    for cid, items in categorized.items():
        if not items:
            continue
        cfg = CATEGORY_SOURCES[cid]
        items_js = ""
        for item in items:
            items_js += f'                    {{ title: "{escape_js(item.get("title",""))}", summary: "{escape_js(make_summary(item))}", source: "{escape_js(item.get("source",""))}", url: "{escape_js(item.get("url",""))}", time: "{item.get("time","")}" }},\n'
        categories_js += '                {{ id: "{}", name: "{}", color: "{}", items: [\n{}                }},\n'.format(cid, cfg['name'], cfg['color'], items_js)

    new_block = f"""                // ============ 资讯热点模块 ============
        // 【每日 10:00 由 GitHub Actions 自动抓取并写入】
        // 抓取时间：{datetime.now(CST).strftime("%Y-%m-%d %H:%M")} CST
        const NEWS_DEFAULTS = {{
            date: "{today}",
            categories: [
{categories_js}            ]
        }};

        // 运行时数据（优先从 Supabase 加载，失败降级为内置默认数据）
        let NEWS_DATA = JSON.parse(JSON.stringify(NEWS_DEFAULTS));

        """

    new_content = content[:start_idx] + new_block + content[end_idx:]

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    logger.info(f"  ✅ HTML 更新完成: NEWS_DEFAULTS 已刷新 ({today})")
    return True


def escape_js(s):
    """转义 JS 字符串中的特殊字符"""
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ").replace("\r", "").replace("`", "'")


def save_to_supabase(categorized):
    """写入 Supabase co_news 表"""
    if not HAS_SUPABASE:
        logger.warning("  ⚠️  supabase 包未安装，跳过数据库写入")
        return 0
    if not SUPABASE_KEY:
        logger.warning("  ⚠️  SUPABASE_KEY 未设置，跳过数据库写入")
        return 0
    try:
        client = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logger.error(f"  ❌ Supabase 初始化失败: {e}")
        return 0

    today = datetime.now(CST).strftime("%Y-%m-%d")
    try:
        client.table("co_news").delete().eq("scrape_date", today).execute()
    except Exception:
        pass

    total = 0
    for cid, items in categorized.items():
        cfg = CATEGORY_SOURCES[cid]
        for item in items:
            try:
                client.table("co_news").insert({
                    "title": item.get("title", ""),
                    "summary": make_summary(item),
                    "source": item.get("source", "未知"),
                    "url": item.get("url", ""),
                    "category": cid,
                    "category_name": cfg["name"],
                    "category_color": cfg["color"],
                    "scrape_date": today,
                    "published_time": item.get("time", ""),
                    "created_at": datetime.now(CST).isoformat(),
                }).execute()
                total += 1
            except Exception:
                pass
    logger.info(f"  ✅ Supabase: {total} 条写入 co_news")
    return total


# ═══════════════════════════════════════════════════════════
#  main
# ═══════════════════════════════════════════════════════════
def main():
    t0 = datetime.now(CST)
    logger.info("=" * 60)
    logger.info("📡 校园运营系统 - 每日新闻抓取器 v4")
    logger.info(f"⏰ {t0.strftime('%Y-%m-%d %H:%M:%S')} CST")
    logger.info("=" * 60)

    # 1) 从 DailyHot API 抓取
    logger.info("\n[1/4] 从 DailyHot API 抓取热榜 ...")
    all_items = fetch_all_dailyhot()
    logger.info(f"  DailyHot 共抓取 {len(all_items)} 条")

    # 2) 如果 DailyHot 失败，使用备用源
    if not all_items:
        all_items = fetch_fallback_sources()

    if not all_items:
        logger.warning("⚠️ 所有数据源均无数据，跳过本次更新（保留已有内容）")
        return 0

    # 3) 分类
    logger.info("\n[2/4] 关键词分类 ...")
    categorized = categorize_items(all_items)
    for cid, items in categorized.items():
        logger.info(f"  {CATEGORY_SOURCES[cid]['name']:12s} → {len(items):3d} 条")

    # 4) 去重
    logger.info("\n[3/4] 去重 ...")
    categorized = deduplicate(categorized)
    total = sum(len(v) for v in categorized.values())
    logger.info(f"  去重后 {total} 条")

    # 5) 存储
    logger.info("\n[4/4] 存储 ...")
    html_ok = update_html_news_defaults(categorized)
    db_count = save_to_supabase(categorized)

    # 保存 JSON 备份
    backup = {"scrape_date": datetime.now(CST).strftime("%Y-%m-%d"), "categories": []}
    for cid, items in categorized.items():
        if not items:
            continue
        cfg = CATEGORY_SOURCES[cid]
        backup["categories"].append({
            "id": cid, "name": cfg["name"], "color": cfg["color"],
            "items": [{"title": i.get("title",""), "summary": make_summary(i), "source": i.get("source",""),
                       "url": i.get("url",""), "time": i.get("time","")} for i in items]
        })
    with open("news_output.json", "w", encoding="utf-8") as f:
        json.dump(backup, f, ensure_ascii=False, indent=2)

    elapsed = (datetime.now(CST) - t0).total_seconds()
    logger.info(f"\n🎉 完成！耗时 {elapsed:.1f}s | HTML={html_ok} | DB={db_count}条")
    logger.info(f"⏭️  下次运行: 明天 10:00 CST")
    logger.info("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
