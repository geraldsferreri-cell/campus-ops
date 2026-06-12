# -*- coding: utf-8 -*-
"""
校园运营系统 - 每日新闻自动抓取器 v6
数据源：60s.viki.moe API (微博/知乎/抖音/百度热榜聚合)
写入独立的 news_data.json 文件 + Supabase（不再修改 HTML 内嵌 JS）
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
BASE_API      = "https://60s.viki.moe/v2"  # 🔧 v5: 60s API (免费, 无需认证, Cloudflare Workers)
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
        "keywords": ["科技","手机","芯片","半导体","互联网","数码","电动车","新能源","操作系统","App","发布","旗舰","处理器","WWDC","索尼","任天堂","Steam","华为","小米","苹果","荣耀","OPPO","vivo","一加","无人机","机器人","卫星","航天","火箭","特斯拉","比亚迪","显卡","高通","英特尔","AMD","NVIDIA","5G","6G","折叠屏","智能"]
    },
    "ai": {
        "name": "🧠 AI", "color": "#8b5cf6",
        "keywords": ["AI","人工智能","大模型","GPT","Claude","OpenAI","深度学习","机器学习","AGI","智能体","Agent","ChatGPT","Copilot","AIGC","生成式","Anthropic","Gemini","Llama","DeepSeek","Grok","Midjourney","Sora"]
    },
    "sports": {
        "name": "⚽ 体育", "color": "#10b981",
        "keywords": ["足球","篮球","NBA","世界杯","欧冠","英超","法网","网球","奥运","F1","电竞","田径","游泳","乒乓","羽毛球","马拉松","拳击","MMA","梅西","C罗","WTT","温网","世预赛","湖人","勇士","墨西哥","韩国","捷克","揭幕战"]
    },
    "show": {
        "name": "🌟 秀场", "color": "#ec4899",
        "keywords": ["红毯","时装周","秀场","代言","大片","写真","封面","街拍","穿搭","品牌大使","高定","Look","妆容","发型","出发图","活动生图","明星","艺人","爱豆","偶像","白鹿","杨幂","迪丽热巴"]
    },
    "fashion": {
        "name": "👗 时尚", "color": "#f43f5e",
        "keywords": ["时尚","潮流","联名","限量","球鞋","奢侈品","腕表","珠宝","美妆","护肤","穿搭","OOTD","VOGUE","ELLE","芭莎","Nike","Adidas","Supreme","LV","Gucci","Chanel","Dior","Prada","口红","粉底","香水","眼影","精华","面膜","发型","染发","裙子","包包","配饰"]
    },
    "variety": {
        "name": "📺 综艺", "color": "#f59e0b",
        "keywords": ["综艺","真人秀","乘风","披荆","脱口秀","选秀","街舞","说唱","恋综","喜剧","春晚","跨年","舞台","公演","淘汰","成团","快乐大本营","奔跑吧","极挑","吐槽大会","一年一度","桃花坞","向往的生活","王牌对王牌"]
    },
    "film": {
        "name": "🎬 影视", "color": "#6366f1",
        "keywords": ["电影","票房","上映","定档","预告","导演","影帝","影后","奥斯卡","剧集","网剧","国产剧","美剧","韩剧","番","动画","暑期档","撤档","豆瓣","IMDb","漫威","电视剧"]
    },
    "kpop": {
        "name": "🇰🇷 韩娱", "color": "#14b8a6",
        "keywords": ["韩娱","aespa","BTS","BLACKPINK","IVE","NewJeans","LE SSERAFIM","TWICE","SEVENTEEN","NCT","EXO","Stray Kids","ILLIT","SM","YG","JYP","HYBE","回归","打歌","K-pop","韩剧","女团","男团","爱豆","Kpop"]
    },
    "marketing": {
        "name": "📊 营销", "color": "#f97316",
        "keywords": ["营销","广告","品牌","案例","SocialBeta","出圈","刷屏","campaign","增长","私域","直播带货","KOL","MCN","投放","内容营销","事件营销","联名款","瑞幸","蜜雪冰城"]
    },
    "fun": {
        "name": "🎮 好玩有趣", "color": "#22c55e",
        "keywords": ["搞笑","趣闻","段子","整活","创意","发明","DIY","旅行","美食","萌宠","动物","奇葩","神操作","脑洞","新奇","黑科技","游戏","桌游","密室","剧本杀","B站","UP主","梗","烂梗"]
    },
}

# ── 60s API 数据源配置 ─────────────────────────────────────
# (source_key, endpoint_path, 显示名称, 各分类的抓取优先级)
API_SOURCES = [
    ("weibo",  "weibo",     "微博热搜",  ["kpop", "variety", "show", "film", "fashion", "sports", "ai", "tech", "marketing", "fun"]),
    ("zhihu",  "zhihu",     "知乎",      ["ai", "tech", "sports", "film", "variety", "marketing", "fun"]),
    ("douyin", "douyin",    "抖音",      ["kpop", "variety", "show", "film", "fashion", "sports", "ai", "tech", "marketing", "fun"]),
    ("baidu",  "baidu/hot", "百度热搜",  ["kpop", "variety", "show", "film", "fashion", "sports", "ai", "tech", "marketing", "fun"]),
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
#  60s.viki.moe API 抓取
# ═══════════════════════════════════════════════════════════

def fetch_60s_api(endpoint):
    """从 60s.viki.moe API 获取单个平台热榜"""
    items = []
    try:
        url = f"{BASE_API}/{endpoint}"
        resp = safe_get(url, timeout=12, as_json=True)
        if not resp:
            logger.info(f"  60s/{endpoint}: 请求无响应")
            return items
        if resp.get("code") != 200:
            logger.info(f"  60s/{endpoint}: code={resp.get('code')}, msg={resp.get('message','')}")
            return items

        data = resp.get("data", [])
        for entry in data:
            title = (entry.get("title") or "").strip()
            if not title:
                continue
            # 统一 item 格式
            item = {
                "title": title,
                "url": entry.get("link", ""),
                "source": endpoint,
                "summary": (entry.get("detail") or entry.get("desc") or "")[:200],
                "hot_score": entry.get("hot_value") or entry.get("score") or 0,
                "time": f"{datetime.now(CST).month}/{datetime.now(CST).day}",
            }
            # 抖音可能有封面图
            if endpoint == "douyin" and entry.get("cover"):
                item["thumbnail"] = entry.get("cover", "")
            items.append(item)

        logger.info(f"  60s/{endpoint} → {len(items)} 条")
    except Exception as e:
        logger.info(f"  60s/{endpoint} 失败: {e}")
    return items


def fetch_all_sources():
    """从 60s API 抓取所有配置的平台"""
    all_items = []
    for _, endpoint, _, _ in API_SOURCES:
        items = fetch_60s_api(endpoint)
        all_items.extend(items)
        time.sleep(1.5)  # 避免 429 限流
    return all_items


# ═══════════════════════════════════════════════════════════
#  分类 & 去重
# ═══════════════════════════════════════════════════════════

def categorize_items(items):
    """将条目按关键词分入对应板块"""
    categorized = {cid: [] for cid in CATEGORY_SOURCES}

    for item in items:
        title = item.get("title", "")
        source = item.get("source", "")
        assigned = False

        # 每个平台有各自的分类优先级
        priority = ["fun"]
        for plat, _, _, prio in API_SOURCES:
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

        # 替换为中文显示名
        item["source"] = {p: n for p, _, n, _ in API_SOURCES}.get(source, source)

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

def update_news_json(categorized):
    """将新闻数据写入独立的 news_data.json 文件（不再修改 HTML 内嵌 JS）"""
    json_path = Path(__file__).parent.parent / "news_data.json"

    today = datetime.now(CST).strftime("%Y-%m-%d")
    news_obj = {
        "date": today,
        "scrape_time": datetime.now(CST).strftime("%Y-%m-%d %H:%M") + " CST",
        "data_source": "60s.viki.moe (微博/知乎/抖音/百度)",
        "categories": []
    }

    for cid, items in categorized.items():
        if not items:
            continue
        cfg = CATEGORY_SOURCES[cid]
        cat = {
            "id": cid,
            "name": cfg["name"],
            "color": cfg["color"],
            "items": [
                {
                    "title": item.get("title", ""),
                    "summary": make_summary(item),
                    "source": item.get("source", ""),
                    "url": item.get("url", ""),
                    "time": item.get("time", "")
                }
                for item in items
            ]
        }
        news_obj["categories"].append(cat)

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(news_obj, f, ensure_ascii=False, indent=2)

    logger.info(f"  ✅ news_data.json 写入完成 ({today}, {len(news_obj['categories'])}个分类)")
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
                    "published_time": f"{datetime.now(CST).month}/{datetime.now(CST).day}",
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
    logger.info("📡 校园运营系统 - 每日新闻抓取器 v6")
    logger.info(f"⏰ {t0.strftime('%Y-%m-%d %H:%M:%S')} CST")
    logger.info(f"🌐 数据源: 60s.viki.moe (微博/知乎/抖音/百度)")
    logger.info("=" * 60)

    # 1) 从 60s API 抓取
    logger.info("\n[1/4] 从 60s.viki.moe API 抓取热榜 ...")
    all_items = fetch_all_sources()
    logger.info(f"  API 共抓取 {len(all_items)} 条")

    if not all_items:
        logger.warning("⚠️ 所有数据源均无数据，跳过本次更新（保留已有内容）")
        return 0

    # 2) 分类
    logger.info("\n[2/4] 关键词分类 ...")
    categorized = categorize_items(all_items)
    for cid, items in categorized.items():
        logger.info(f"  {CATEGORY_SOURCES[cid]['name']:12s} → {len(items):3d} 条")

    # 3) 去重
    logger.info("\n[3/4] 去重 ...")
    categorized = deduplicate(categorized)
    total = sum(len(v) for v in categorized.values())
    logger.info(f"  去重后 {total} 条")

    # 4) 存储
    logger.info("\n[4/4] 存储 ...")
    html_ok = update_news_json(categorized)
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
