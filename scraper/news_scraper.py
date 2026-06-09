# -*- coding: utf-8 -*-
"""
校园运营系统 - 每日新闻自动抓取器 v2
覆盖 10 个板块 + 4 个视频平台热榜
数据源：微博/百度/36氪/知乎/今日头条/B站/抖音/小红书/视频号
通过 GitHub Actions 每日 10:00 CST 自动运行
"""

import os, sys, json, time, re, hashlib, logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup

try:
    from supabase import create_client, Client
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False

# ── 配置 ───────────────────────────────────────────────────
SUPABASE_URL  = os.environ.get("SUPABASE_URL", "https://eeuvrabunfvsaxgpaiub.supabase.co")
SUPABASE_KEY  = os.environ.get("SUPABASE_KEY", "")
CST = timezone(timedelta(hours=8))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
logger = logging.getLogger("news_scraper")

MOBILE_UA = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
)
DESKTOP_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
DOUYIN_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
)

# ── 10 个资讯板块 + 4 个视频平台热榜 ──────────────────────
CATEGORY_SOURCES = {
    "tech": {
        "name": "🤖 科技", "color": "#3b82f6",
        "keywords": ["科技","手机","芯片","半导体","互联网","数码","电动车","新能源","操作系统","App","发布","旗舰","处理器","WWDC","索尼","任天堂","Steam"]
    },
    "ai": {
        "name": "🧠 AI", "color": "#8b5cf6",
        "keywords": ["AI","人工智能","大模型","GPT","Claude","OpenAI","深度学习","机器学习","AGI","智能体","Agent","ChatGPT","Copilot","AIGC","生成式","Anthropic","Gemini","Llama","DeepSeek","Grok"]
    },
    "sports": {
        "name": "⚽ 体育", "color": "#10b981",
        "keywords": ["足球","篮球","NBA","世界杯","欧冠","英超","法网","网球","奥运","F1","电竞","田径","游泳","乒乓","羽毛球","马拉松","拳击","MMA","梅西","C罗","WTT","温网","世预赛"]
    },
    "show": {
        "name": "🌟 秀场", "color": "#ec4899",
        "keywords": ["红毯","时装周","秀场","代言","大片","写真","封面","街拍","穿搭","品牌大使","高定","Look","妆容","发型","出发图","活动生图"]
    },
    "fashion": {
        "name": "👗 时尚", "color": "#f43f5e",
        "keywords": ["时尚","潮流","联名","限量","球鞋","奢侈品","腕表","珠宝","美妆","护肤","穿搭","OOTD","VOGUE","ELLE","芭莎","Nike","Adidas","Supreme","LV","Gucci","Chanel"]
    },
    "variety": {
        "name": "📺 综艺", "color": "#f59e0b",
        "keywords": ["综艺","真人秀","乘风","披荆","脱口秀","选秀","街舞","说唱","恋综","喜剧","春晚","跨年","舞台","公演","淘汰","成团"]
    },
    "film": {
        "name": "🎬 影视", "color": "#6366f1",
        "keywords": ["电影","票房","上映","定档","预告","导演","影帝","影后","奥斯卡","剧集","网剧","国产剧","美剧","韩剧","番","动画","暑期档","撤档"]
    },
    "kpop": {
        "name": "🇰🇷 韩娱", "color": "#14b8a6",
        "keywords": ["韩娱","aespa","BTS","BLACKPINK","IVE","NewJeans","LE SSERAFIM","TWICE","SEVENTEEN","NCT","EXO","Stray Kids","ILLIT","SM","YG","JYP","HYBE","回归","打歌","K-pop"]
    },
    "marketing": {
        "name": "📊 营销", "color": "#f97316",
        "keywords": ["营销","广告","品牌","案例","SocialBeta","出圈","刷屏","campaign","增长","私域","直播带货","KOL","MCN","投放","内容营销","事件营销","联名款"]
    },
    "fun": {
        "name": "🎮 好玩有趣", "color": "#22c55e",
        "keywords": ["搞笑","趣闻","段子","整活","创意","发明","DIY","旅行","美食","萌宠","动物","奇葩","神操作","脑洞","新奇","黑科技","游戏","桌游","密室","剧本杀"]
    },
}


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
                logger.debug(f"  请求失败 [{url[:60]}]: {e}")
    return None


def match_any(text, keywords):
    """任意关键词命中即返回 True"""
    tl = text.lower()
    return any(kw.lower() in tl for kw in keywords)


def dedup_key(title):
    """去重指纹（取前20字并规范化）"""
    return re.sub(r'\s+', '', title)[:20].lower()


# ═══════════════════════════════════════════════════════════
#  新闻源 → 图文资讯
# ═══════════════════════════════════════════════════════════

def fetch_weibo_hot():
    """微博热搜 (JSON API)"""
    items = []
    try:
        resp = safe_get("https://weibo.com/ajax/side/hotSearch", timeout=10, as_json=True)
        if not resp:
            return items
        for entry in resp.get("data", {}).get("realtime", [])[:50]:
            word = (entry.get("word") or "").strip()
            if not word or "广告" in (entry.get("flag_desc") or ""):
                continue
            raw_hot = entry.get("raw_hot", 0)
            items.append({
                "title": word,
                "url": f"https://s.weibo.com/weibo?q={requests.utils.quote(word)}",
                "source": "微博热搜",
                "hot_score": raw_hot,
                "time": datetime.now(CST).strftime("%m/%d %H:%M"),
            })
        logger.info(f"  微博热搜 → {len(items)} 条")
    except Exception as e:
        logger.warning(f"  微博热搜失败: {e}")
    return items


def fetch_baidu_hot():
    """百度热搜"""
    items = []
    try:
        resp = safe_get("https://top.baidu.com/board?tab=realtime", timeout=15)
        if not resp:
            return items
        soup = BeautifulSoup(resp.text, "html.parser")
        for card in soup.select('[class*="category-wrap"]')[:50]:
            t = card.select_one('[class*="c-single-text-ellipsis"], .normal-word, .hot-title')
            if not t: continue
            title = t.get_text(strip=True)
            if not title: continue
            a = card.select_one('a[href]')
            item_url = a["href"] if a and a.get("href") else f"https://www.baidu.com/s?wd={requests.utils.quote(title)}"
            if not item_url.startswith("http"):
                item_url = f"https://top.baidu.com{item_url}"
            hot_el = card.select_one('[class*="hot-index"]')
            hot_score = 0
            if hot_el:
                try:
                    txt = hot_el.get_text(strip=True).replace(",","").replace("万","0000")
                    hot_score = int(float(txt))
                except: pass
            items.append({"title": title, "url": item_url, "source": "百度热搜", "hot_score": hot_score,
                          "time": datetime.now(CST).strftime("%m/%d %H:%M")})
        logger.info(f"  百度热搜 → {len(items)} 条")
    except Exception as e:
        logger.warning(f"  百度热搜失败: {e}")
    return items


def fetch_36kr():
    """36氪 RSS"""
    items = []
    try:
        resp = safe_get("https://36kr.com/feed", timeout=15)
        if not resp: return items
        soup = BeautifulSoup(resp.content, "xml")
        for e in soup.find_all("item")[:15]:
            t = e.find("title"); link = e.find("link")
            if not t or not link: continue
            desc_text = ""
            d = e.find("description")
            if d:
                ds = BeautifulSoup(d.get_text(strip=True), "html.parser")
                desc_text = ds.get_text(strip=True)[:200]
            items.append({"title": t.get_text(strip=True), "url": link.get_text(strip=True),
                          "source": "36氪", "summary": desc_text, "time": datetime.now(CST).strftime("%m/%d")})
        logger.info(f"  36氪 → {len(items)} 条")
    except Exception as e:
        logger.warning(f"  36氪失败: {e}")
    return items


def fetch_zhihu():
    """知乎热榜 (JSON API，比 RSS 更稳定)"""
    items = []
    try:
        resp = safe_get("https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50&desktop=true",
                        timeout=10, as_json=True)
        if not resp: return items
        for entry in resp.get("data", [])[:30]:
            target = entry.get("target", {})
            title = target.get("title", "").strip()
            if not title: continue
            qid = target.get("id", "")
            items.append({
                "title": title,
                "url": f"https://www.zhihu.com/question/{qid}" if qid else "#",
                "source": "知乎",
                "summary": target.get("excerpt", "")[:200],
                "time": datetime.now(CST).strftime("%m/%d"),
            })
        logger.info(f"  知乎热榜 → {len(items)} 条")
    except Exception as e:
        logger.warning(f"  知乎失败: {e}")
    return items


def fetch_toutiao():
    """今日头条热榜 (newsnow 聚合 API)"""
    items = []
    try:
        resp = safe_get("https://newsnow.busiyi.world/api/s?id=toutiao&cat=all", timeout=12, as_json=True)
        if not resp: return items
        entries = resp.get("items") or resp.get("data") or []
        for e in entries[:40]:
            title = (e.get("title") or "").strip()
            if not title: continue
            items.append({
                "title": title,
                "url": e.get("url") or f"https://www.toutiao.com/search/?keyword={requests.utils.quote(title)}",
                "source": "今日头条",
                "summary": (e.get("description") or e.get("desc") or "")[:200],
                "time": datetime.now(CST).strftime("%m/%d"),
            })
        logger.info(f"  今日头条 → {len(items)} 条")
    except Exception as e:
        logger.debug(f"  今日头条失败: {e}")
    return items


# ═══════════════════════════════════════════════════════════
#  视频平台热榜
# ═══════════════════════════════════════════════════════════

def fetch_bilibili_hot():
    """
    B站热门视频 → 放入「好玩有趣」分类
    使用官方公开 API（无需登录）
    """
    items = []
    try:
        # B站热门视频 API
        resp = safe_get("https://api.bilibili.com/x/web-interface/popular?ps=30&pn=1",
                        timeout=12, as_json=True)
        if not resp or resp.get("code") != 0:
            # 降级：热门搜索词
            resp2 = safe_get("https://s.search.bilibili.com/main/hotword?limit=20",
                             timeout=10, as_json=True)
            if resp2:
                for kw in (resp2.get("list") or [])[:20]:
                    word = (kw.get("keyword") or kw.get("word") or "").strip()
                    if not word: continue
                    items.append({
                        "title": f"B站热搜：{word}",
                        "url": f"https://search.bilibili.com/all?keyword={requests.utils.quote(word)}",
                        "source": "B站",
                        "summary": f"B站实时热搜：{word}",
                        "time": datetime.now(CST).strftime("%m/%d"),
                    })
                logger.info(f"  B站热搜词 → {len(items)} 条")
                return items
            return items

        for v in resp.get("data", {}).get("list", [])[:20]:
            title = v.get("title", "").strip()
            if not title: continue
            owner = v.get("owner", {})
            stat = v.get("stat", {})
            views = stat.get("view", 0)
            danmu = stat.get("danmaku", 0)
            views_str = f"{views/10000:.1f}万" if views >= 10000 else str(views)
            items.append({
                "title": title,
                "url": f"https://www.bilibili.com/video/{v.get('bvid', '')}",
                "source": "B站",
                "summary": f"UP主「{owner.get('name','')}」| 📺{views_str}播放 | 💬{danmu}弹幕 | {v.get('desc','')[:100]}",
                "thumbnail": v.get("pic", ""),
                "is_video": True,
                "video_play": views_str,
                "video_author": owner.get("name", ""),
                "time": datetime.now(CST).strftime("%m/%d"),
            })
        logger.info(f"  B站热门 → {len(items)} 条")
    except Exception as e:
        logger.warning(f"  B站失败: {e}")
    return items


def fetch_douyin_hot():
    """
    抖音热榜 → 综合资讯
    通过公开 API + 聚合 API
    """
    items = []
    try:
        # 方案1: 抖音官方热榜 API
        h = {"User-Agent": DOUYIN_UA, "Referer": "https://www.douyin.com/"}
        resp = safe_get("https://www.douyin.com/aweme/v1/web/hot/search/list/?detail_list=1&count=20",
                        headers=h, timeout=12, as_json=True)
        if resp:
            for entry in (resp.get("data", {}).get("word_list") or [])[:20]:
                word_info = entry.get("word") or entry
                word = (word_info if isinstance(word_info, str) else word_info.get("word", "")).strip()
                if not word: continue
                items.append({
                    "title": word,
                    "url": f"https://www.douyin.com/search/{requests.utils.quote(word)}",
                    "source": "抖音",
                    "summary": f"抖音实时热榜：{word}",
                    "time": datetime.now(CST).strftime("%m/%d"),
                })
            if items:
                logger.info(f"  抖音热榜 → {len(items)} 条")
                return items
    except Exception as e:
        logger.debug(f"  抖音官方API失败: {e}")

    # 方案2: 聚合 API
    try:
        resp = safe_get("https://newsnow.busiyi.world/api/s?id=douyin&cat=all", timeout=12, as_json=True)
        if resp:
            entries = resp.get("items") or resp.get("data") or []
            for e in entries[:20]:
                title = (e.get("title") or "").strip()
                if not title: continue
                items.append({
                    "title": title,
                    "url": e.get("url") or f"https://www.douyin.com/search/{requests.utils.quote(title)}",
                    "source": "抖音",
                    "summary": (e.get("description") or e.get("desc") or "")[:200],
                    "time": datetime.now(CST).strftime("%m/%d"),
                })
            logger.info(f"  抖音(聚合) → {len(items)} 条")
    except Exception as e:
        logger.debug(f"  抖音聚合失败: {e}")

    return items


def fetch_xiaohongshu_hot():
    """
    小红书热榜 → 综合资讯
    通过第三方聚合 API (小红书官方API需要登录)
    """
    items = []
    try:
        # newsnow 聚合平台的小红书热榜
        resp = safe_get("https://newsnow.busiyi.world/api/s?id=xiaohongshu&cat=all", timeout=12, as_json=True)
        if resp:
            entries = resp.get("items") or resp.get("data") or []
            for e in entries[:20]:
                title = (e.get("title") or "").strip()
                if not title: continue
                items.append({
                    "title": title,
                    "url": e.get("url") or f"https://www.xiaohongshu.com/search_result?keyword={requests.utils.quote(title)}",
                    "source": "小红书",
                    "summary": (e.get("description") or e.get("desc") or "")[:200],
                    "time": datetime.now(CST).strftime("%m/%d"),
                })
            logger.info(f"  小红书 → {len(items)} 条")
    except Exception as e:
        logger.debug(f"  小红书失败: {e}")
    return items


def fetch_weishi_hot():
    """
    微信视频号热榜 → 通过聚合 API
    视频号没有公开 API，使用新浪/聚合数据源
    """
    items = []
    try:
        resp = safe_get("https://newsnow.busiyi.world/api/s?id=weixin&cat=all", timeout=12, as_json=True)
        if resp:
            entries = resp.get("items") or resp.get("data") or []
            for e in entries[:15]:
                title = (e.get("title") or "").strip()
                if not title: continue
                items.append({
                    "title": title,
                    "url": e.get("url") or f"https://weixin.qq.com/",
                    "source": "视频号",
                    "summary": (e.get("description") or e.get("desc") or "")[:200],
                    "time": datetime.now(CST).strftime("%m/%d"),
                })
            logger.info(f"  视频号 → {len(items)} 条")
    except Exception as e:
        logger.debug(f"  视频号失败: {e}")
    return items


# ═══════════════════════════════════════════════════════════
#  主抓取 & 分类逻辑
# ═══════════════════════════════════════════════════════════

def fetch_all_sources():
    """并行抓取所有来源（串行以避免被 ban）"""
    all_items = []

    logger.info("▸ 图文资讯源")
    all_items.extend(fetch_weibo_hot())
    all_items.extend(fetch_baidu_hot())
    all_items.extend(fetch_36kr())
    all_items.extend(fetch_zhihu())
    all_items.extend(fetch_toutiao())

    logger.info("▸ 视频平台热榜")
    all_items.extend(fetch_bilibili_hot())
    all_items.extend(fetch_douyin_hot())
    all_items.extend(fetch_xiaohongshu_hot())
    all_items.extend(fetch_weishi_hot())

    return all_items


def categorize_items(items):
    """将条目按关键词分入对应板块"""
    categorized = {cid: [] for cid in CATEGORY_SOURCES}

    for item in items:
        title = item.get("title", "")
        source = item.get("source", "")
        assigned = False

        # 来源预判
        if source == "36氪":
            target = "ai" if match_any(title, CATEGORY_SOURCES["ai"]["keywords"]) else "tech"
            categorized[target].append(item)
            continue
        if source == "B站":
            # B站视频按内容分类
            for cid in ["tech", "ai", "sports", "variety", "film", "fashion", "kpop", "marketing", "fun"]:
                if match_any(title, CATEGORY_SOURCES[cid]["keywords"]):
                    categorized[cid].append(item)
                    assigned = True
                    break
            if not assigned:
                categorized["fun"].append(item)
            continue
        if source in ("抖音", "小红书", "视频号"):
            # 视频平台热搜先尝试匹配所有分类
            for cid in ["kpop", "variety", "show", "film", "fashion", "sports", "ai", "tech", "marketing", "fun"]:
                if match_any(title, CATEGORY_SOURCES[cid]["keywords"]):
                    categorized[cid].append(item)
                    assigned = True
                    break
            if not assigned:
                categorized["fun"].append(item)
            continue

        # 通用关键词匹配
        priority = ["ai","kpop","variety","show","film","fashion","marketing","sports","fun","tech"]
        for cid in priority:
            if match_any(title, CATEGORY_SOURCES[cid]["keywords"]):
                categorized[cid].append(item)
                assigned = True
                break
        if not assigned:
            categorized["fun"].append(item)

    return categorized


def deduplicate(categorized):
    """标题去重，每个分类最多 15 条"""
    for cid in categorized:
        seen = set()
        uniq = []
        for item in categorized[cid]:
            k = dedup_key(item["title"])
            if k not in seen:
                seen.add(k)
                uniq.append(item)
        categorized[cid] = uniq[:15]
    return categorized


def make_summary(item):
    """为每条新闻生成摘要文本"""
    if item.get("summary"):
        return item["summary"][:200]
    title = item.get("title", "")
    src = item.get("source", "")
    hs = item.get("hot_score", 0)
    if hs > 10000:
        heat = f"热度{hs/10000:.1f}万"
    elif hs > 0:
        heat = f"热度{hs}"
    else:
        heat = ""
    tips = f"（{heat}）" if heat else ""
    if src == "微博热搜": return f"微博实时热搜话题：{title}{tips}"
    if src == "百度热搜": return f"百度实时热搜话题：{title}{tips}"
    if src in ("B站", "抖音", "小红书", "视频号"): return f"平台热榜：{title}{tips}"
    return f"最新资讯：{title}"


# ═══════════════════════════════════════════════════════════
#  存储层
# ═══════════════════════════════════════════════════════════

def save_to_json(categorized, path="news_output.json"):
    """本地 JSON 备份"""
    result = {"scrape_date": datetime.now(CST).strftime("%Y-%m-%d"),
              "scrape_time": datetime.now(CST).isoformat(), "categories": []}
    for cid, items in categorized.items():
        if not items: continue
        cfg = CATEGORY_SOURCES[cid]
        result["categories"].append({
            "id": cid, "name": cfg["name"], "color": cfg["color"], "count": len(items),
            "items": [{"title": i.get("title",""),"summary": make_summary(i),"source": i.get("source",""),
                       "url": i.get("url",""),"time": i.get("time",""),
                       "is_video": i.get("is_video", False),
                       "thumbnail": i.get("thumbnail",""),
                       "video_play": i.get("video_play",""),
                       "video_author": i.get("video_author",""),
                      } for i in items]
        })
    with open(path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    total = sum(len(v) for v in categorized.values())
    logger.info(f"  ✅ JSON 备份: {total} 条 → {path}")
    return result


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
    logger.info("📡 校园运营系统 - 每日新闻抓取器 v2")
    logger.info(f"⏰ {t0.strftime('%Y-%m-%d %H:%M:%S')} CST")
    logger.info("=" * 60)

    # 1) 抓取
    logger.info("\n[1/4] 抓取所有源 ...")
    all_items = fetch_all_sources()
    logger.info(f"  共抓取 {len(all_items)} 条原始条目")

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
    save_to_json(categorized)
    save_to_supabase(categorized)

    elapsed = (datetime.now(CST) - t0).total_seconds()
    logger.info(f"\n🎉 完成！耗时 {elapsed:.1f}s | 下次: 明天 10:00 CST")
    logger.info("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
