# -*- coding: utf-8 -*-
"""
校园运营系统 - 每日新闻自动抓取器
覆盖10个板块：科技/AI/体育/秀场/时尚/综艺/影视/韩娱/营销/好玩有趣
通过 GitHub Actions 每日 10:00 CST 自动运行
"""

import os
import sys
import json
import time
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests
from bs4 import BeautifulSoup

# Supabase client (需安装 supabase 包)
try:
    from supabase import create_client, Client
    HAS_SUPABASE = True
except ImportError:
    HAS_SUPABASE = False

# ============================================================
# 配置
# ============================================================
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://eeuvrabunfvsaxgpaiub.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")  # 需要在 GitHub Secrets 中配置

# 北京时间
CST = timezone(timedelta(hours=8))

# 日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("news_scraper")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

# ============================================================
# 10 个资讯板块的新闻源配置
# ============================================================
CATEGORY_SOURCES = {
    "tech": {
        "name": "🤖 科技",
        "color": "#3b82f6",
        "feeds": [
            "https://36kr.com/feed",
        ],
        "keywords": ["科技", "手机", "芯片", "半导体", "互联网", "数码", "AI", "人工智能", "机器人", "电动车", "新能源", "操作系统", "App"],
        "weibo_hot_filter": ["科技", "手机", "芯片", "新品", "发布"]
    },
    "ai": {
        "name": "🧠 AI",
        "color": "#8b5cf6",
        "feeds": [],
        "keywords": ["AI", "人工智能", "大模型", "GPT", "Claude", "OpenAI", "深度学习", "机器学习", "AGI", "智能体", "Agent", "ChatGPT", "Copilot", "AIGC", "生成式"],
        "weibo_hot_filter": ["AI", "人工智能", "ChatGPT", "OpenAI", "大模型", "GPT"]
    },
    "sports": {
        "name": "⚽ 体育",
        "color": "#10b981",
        "feeds": [
            "https://feedx.net/rss/sina_sports.xml",
        ],
        "keywords": ["足球", "篮球", "NBA", "世界杯", "欧冠", "英超", "法网", "网球", "奥运", "F1", "电竞", "田径", "游泳", "乒乓", "羽毛球", "马拉松", "拳击", "MMA"],
        "weibo_hot_filter": ["足球", "篮球", "NBA", "世界杯", "欧冠", "决赛", "冠军", "联赛", "球王", "梅西", "C罗"]
    },
    "show": {
        "name": "🌟 秀场",
        "color": "#ec4899",
        "feeds": [],
        "keywords": ["红毯", "时装周", "秀场", "代言", "大片", "写真", "封面", "街拍", "穿搭", "品牌大使", "高定", "Look", "妆容", "发型"],
        "weibo_hot_filter": ["红毯", "大片", "封面", "代言", "写真", "活动生图", "造型", "出席"]
    },
    "fashion": {
        "name": "👗 时尚",
        "color": "#f43f5e",
        "feeds": [],
        "keywords": ["时尚", "潮流", "联名", "限量", "球鞋", "奢侈品", "腕表", "珠宝", "美妆", "护肤", "穿搭", "OOTD", "VOGUE", "ELLE", "芭莎", "Nike", "Adidas", "Supreme"],
        "weibo_hot_filter": ["时尚", "潮流", "联名", "美妆", "球鞋", "限量"]
    },
    "variety": {
        "name": "📺 综艺",
        "color": "#f59e0b",
        "feeds": [],
        "keywords": ["综艺", "真人秀", "乘风", "披荆", "脱口秀", "选秀", "街舞", "说唱", "观察", "恋综", "喜剧", "春晚", "跨年", "舞台", "公演", "淘汰"],
        "weibo_hot_filter": ["综艺", "淘汰", "公演", "成团", "舞台", "乘风", "披荆"]
    },
    "film": {
        "name": "🎬 影视",
        "color": "#6366f1",
        "feeds": [],
        "keywords": ["电影", "票房", "上映", "定档", "预告", "导演", "影帝", "影后", "奥斯卡", "剧集", "网剧", "国产剧", "美剧", "韩剧", "番", "动画"],
        "weibo_hot_filter": ["电影", "票房", "上映", "定档", "电视剧", "剧集", "预告片"]
    },
    "kpop": {
        "name": "🇰🇷 韩娱",
        "color": "#14b8a6",
        "feeds": [],
        "keywords": ["韩娱", "aespa", "BTS", "BLACKPINK", "IVE", "NewJeans", "LE SSERAFIM", "TWICE", "SEVENTEEN", "NCT", "EXO", "Stray Kids", "ILLIT", "SM", "YG", "JYP", "HYBE", "回归", "打歌", "一位", "K-pop"],
        "weibo_hot_filter": ["韩娱", "aespa", "BTS", "BLACKPINK", "IVE", "NewJeans", "回归", "SM", "YG", "JYP", "HYBE"]
    },
    "marketing": {
        "name": "📊 营销",
        "color": "#f97316",
        "feeds": [],
        "keywords": ["营销", "广告", "品牌", "案例", "Social", "SocialBeta", "出圈", "刷屏", "campaign", "增长", "私域", "直播带货", "KOL", "MCN", "投放", "内容营销", "事件营销"],
        "weibo_hot_filter": ["营销", "广告", "品牌", "刷屏", "出圈"]
    },
    "fun": {
        "name": "🎮 好玩有趣",
        "color": "#22c55e",
        "feeds": [
            "https://www.zhihu.com/rss",
        ],
        "keywords": ["搞笑", "趣闻", "段子", "整活", "创意", "发明", "DIY", "旅行", "美食", "萌宠", "动物", "奇葩", "神操作", "脑洞", "新奇", "黑科技", "游戏", "桌游", "密室", "剧本杀"],
        "weibo_hot_filter": ["搞笑", "趣闻", "段子", "萌宠", "脑洞"]
    },
}


# ============================================================
# 工具函数
# ============================================================
def safe_get(url, timeout=15, retries=2):
    """安全的 HTTP GET 请求"""
    for attempt in range(retries + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=timeout, allow_redirects=True)
            resp.raise_for_status()
            return resp
        except Exception as e:
            if attempt < retries:
                logger.debug(f"请求 {url[:60]} 失败，重试... ({attempt+1})")
                time.sleep(2)
            else:
                logger.debug(f"请求 {url[:60]} 最终失败: {e}")
    return None


def make_id(title, source):
    """生成唯一 ID"""
    h = hashlib.md5(f"{title}|{source}".encode()).hexdigest()[:12]
    return int(h, 16) % (10**12)


def match_category(text, cat_keywords):
    """简单关键词匹配判断文本是否属于某分类"""
    text_lower = text.lower()
    for kw in cat_keywords:
        if kw.lower() in text_lower:
            return True
    return False


# ============================================================
# 新闻源抓取函数
# ============================================================

def fetch_weibo_hot():
    """
    微博热搜榜 (JSON API)
    返回: [{title, url, hot_score, category_hint}, ...]
    """
    items = []
    url = "https://weibo.com/ajax/side/hotSearch"
    try:
        resp = safe_get(url, timeout=10)
        if not resp:
            return items

        data = resp.json()
        realtime = data.get("data", {}).get("realtime", [])

        for entry in realtime[:50]:
            word = entry.get("word", "").strip()
            raw_hot = entry.get("raw_hot", 0)

            if not word or "广告" in entry.get("flag_desc", ""):
                continue

            # 构建链接
            scheme = entry.get("scheme", "")
            item_url = f"https://s.weibo.com/weibo?q={requests.utils.quote(word)}"
            if scheme:
                item_url = f"https://weibo.com/ajax/side/hotSearch?q={requests.utils.quote(word)}"

            items.append({
                "title": word,
                "url": item_url,
                "source": "微博热搜",
                "hot_score": raw_hot,
                "time": datetime.now(CST).strftime("%m/%d %H:%M"),
            })

        logger.info(f"微博热搜: 抓取到 {len(items)} 条")
    except Exception as e:
        logger.warning(f"微博热搜抓取失败: {e}")

    return items


def fetch_baidu_hot():
    """
    百度热搜榜
    返回: [{title, url, source, hot_score}, ...]
    """
    items = []
    url = "https://top.baidu.com/board?tab=realtime"
    try:
        resp = safe_get(url, timeout=15)
        if not resp:
            return items

        soup = BeautifulSoup(resp.text, "html.parser")

        # 百度热搜用 category-wrap_ 类包裹每条热搜
        cards = soup.select('[class*="category-wrap"]')
        for card in cards[:50]:
            title_el = card.select_one('[class*="c-single-text-ellipsis"]')
            if not title_el:
                title_el = card.select_one('.normal-word, .hot-title')
            if not title_el:
                continue

            title = title_el.get_text(strip=True)

            link_el = card.select_one('a[href]')
            item_url = ""
            if link_el:
                href = link_el.get("href", "")
                if href:
                    item_url = href if href.startswith("http") else f"https://top.baidu.com{href}"

            hot_el = card.select_one('[class*="hot-index"]')
            hot_score = 0
            if hot_el:
                try:
                    hot_score = int(hot_el.get_text(strip=True).replace(",", "").replace("万", "0000"))
                except:
                    pass

            if title:
                items.append({
                    "title": title,
                    "url": item_url or f"https://www.baidu.com/s?wd={requests.utils.quote(title)}",
                    "source": "百度热搜",
                    "hot_score": hot_score,
                    "time": datetime.now(CST).strftime("%m/%d %H:%M"),
                })

        logger.info(f"百度热搜: 抓取到 {len(items)} 条")
    except Exception as e:
        logger.warning(f"百度热搜抓取失败: {e}")

    return items


def fetch_36kr():
    """36氪 RSS（科技类）"""
    items = []
    try:
        resp = safe_get("https://36kr.com/feed", timeout=15)
        if not resp:
            return items

        soup = BeautifulSoup(resp.content, "xml")
        for entry in soup.find_all("item")[:15]:
            title = entry.find("title")
            link = entry.find("link")
            desc = entry.find("description")

            if title and link:
                title_text = title.get_text(strip=True)
                desc_text = ""
                if desc:
                    desc_soup = BeautifulSoup(desc.get_text(strip=True), "html.parser")
                    desc_text = desc_soup.get_text(strip=True)[:200]

                items.append({
                    "title": title_text,
                    "url": link.get_text(strip=True) if link else "",
                    "source": "36氪",
                    "summary": desc_text,
                    "time": datetime.now(CST).strftime("%m/%d"),
                })

        logger.info(f"36氪 RSS: 抓取到 {len(items)} 条")
    except Exception as e:
        logger.warning(f"36氪 RSS 抓取失败: {e}")

    return items


def fetch_zhihu_daily():
    """知乎 RSS"""
    items = []
    try:
        resp = safe_get("https://www.zhihu.com/rss", timeout=15)
        if not resp:
            return items

        soup = BeautifulSoup(resp.content, "xml")
        for entry in soup.find_all("item")[:20]:
            title = entry.find("title")
            link = entry.find("link")
            desc = entry.find("description")

            if title:
                title_text = title.get_text(strip=True)
                desc_text = ""
                if desc:
                    desc_soup = BeautifulSoup(desc.get_text(strip=True), "html.parser")
                    desc_text = desc_soup.get_text(strip=True)[:200]

                items.append({
                    "title": title_text,
                    "url": link.get_text(strip=True) if link else "",
                    "source": "知乎",
                    "summary": desc_text,
                    "time": datetime.now(CST).strftime("%m/%d"),
                })

        logger.info(f"知乎 RSS: 抓取到 {len(items)} 条")
    except Exception as e:
        logger.warning(f"知乎 RSS 抓取失败: {e}")

    return items


def fetch_toutiao_hot():
    """
    今日头条热榜 (通过聚合API)
    """
    items = []
    try:
        # 使用 newsnow 聚合 API (免费、公开)
        url = "https://newsnow.busiyi.world/api/s?id=toutiao&cat=all"
        resp = safe_get(url, timeout=10)
        if not resp:
            return items

        data = resp.json()
        entries = data.get("items", data.get("data", []))

        for entry in entries[:40]:
            title = entry.get("title", "").strip()
            item_url = entry.get("url", "")
            if not title:
                continue

            items.append({
                "title": title,
                "url": item_url or f"https://www.toutiao.com/search/?keyword={requests.utils.quote(title)}",
                "source": "今日头条",
                "summary": entry.get("description", entry.get("desc", ""))[:200],
                "time": datetime.now(CST).strftime("%m/%d"),
            })

        logger.info(f"今日头条: 抓取到 {len(items)} 条")
    except Exception as e:
        logger.debug(f"今日头条抓取失败 (可忽略): {e}")

    return items


# ============================================================
# 主抓取逻辑
# ============================================================
def fetch_all_sources():
    """从所有来源抓取新闻"""
    all_items = []

    # 1. 微博热搜（覆盖面广）
    weibo_items = fetch_weibo_hot()
    all_items.extend(weibo_items)

    # 2. 百度热搜
    baidu_items = fetch_baidu_hot()
    all_items.extend(baidu_items)

    # 3. 36氪 RSS（科技类专用）
    kr36_items = fetch_36kr()
    all_items.extend(kr36_items)

    # 4. 知乎 RSS
    zhihu_items = fetch_zhihu_daily()
    all_items.extend(zhihu_items)

    # 5. 今日头条热榜
    toutiao_items = fetch_toutiao_hot()
    all_items.extend(toutiao_items)

    return all_items


def categorize_items(items):
    """将所有抓取到的条目分配到 10 个分类"""
    categorized = {cat_id: [] for cat_id in CATEGORY_SOURCES}

    for item in items:
        title = item.get("title", "")
        source = item.get("source", "")

        # 先根据来源预判分类
        assigned = False

        # 36氪 → 科技
        if source == "36氪":
            if match_category(title, CATEGORY_SOURCES["ai"]["keywords"]):
                categorized["ai"].append(item)
            else:
                categorized["tech"].append(item)
            assigned = True

        # 知乎 → 好玩有趣 或 AI
        if source == "知乎":
            if match_category(title, CATEGORY_SOURCES["fun"]["keywords"]):
                categorized["fun"].append(item)
            elif match_category(title, CATEGORY_SOURCES["ai"]["keywords"]):
                categorized["ai"].append(item)
            elif match_category(title, CATEGORY_SOURCES["tech"]["keywords"]):
                categorized["tech"].append(item)
            else:
                categorized["fun"].append(item)
            assigned = True

        if assigned:
            continue

        # 关键词匹配（按优先级）
        priority_order = ["ai", "kpop", "variety", "show", "film", "fashion", "marketing", "sports", "fun", "tech"]
        for cat_id in priority_order:
            cfg = CATEGORY_SOURCES[cat_id]
            if match_category(title, cfg["keywords"]):
                categorized[cat_id].append(item)
                assigned = True
                break

        # 未匹配的放入「好玩有趣」
        if not assigned:
            categorized["fun"].append(item)

    return categorized


def deduplicate(categorized):
    """每个分类内去重（按标题相似度）"""
    for cat_id in categorized:
        seen = set()
        unique = []
        for item in categorized[cat_id]:
            # 简化的标题指纹
            key = item["title"][:30].strip().lower()
            if key not in seen:
                seen.add(key)
                unique.append(item)
        # 每个分类最多 15 条
        categorized[cat_id] = unique[:15]
    return categorized


def make_summary(item):
    """为微博热搜条目生成一句话摘要"""
    if item.get("summary"):
        return item["summary"][:200]

    title = item.get("title", "")
    source = item.get("source", "")

    if source == "微博热搜":
        hot_score = item.get("hot_score", 0)
        if hot_score > 0:
            hs = f"{hot_score/10000:.1f}万" if hot_score >= 10000 else str(hot_score)
            return f"微博热搜第{href}位，热度{hs}"
        return f"微博实时热搜话题：{title}"
    elif source == "百度热搜":
        return f"百度实时热搜话题：{title}"
    else:
        return f"最新资讯：{title}"


# ============================================================
# Supabase 存储
# ============================================================
def init_supabase():
    """初始化 Supabase 客户端"""
    if not HAS_SUPABASE:
        logger.error("supabase 包未安装，请运行: pip install supabase")
        return None
    if not SUPABASE_KEY:
        logger.error("SUPABASE_KEY 环境变量未设置")
        return None
    try:
        client = create_client(SUPABASE_URL, SUPABASE_KEY)
        return client
    except Exception as e:
        logger.error(f"Supabase 初始化失败: {e}")
        return None


def save_to_supabase(client, categorized):
    """将新闻保存到 Supabase"""
    today = datetime.now(CST).strftime("%Y-%m-%d")

    # 先清理今天已抓取的旧数据（避免重复）
    try:
        client.table("co_news").delete().eq("scrape_date", today).execute()
        logger.info(f"已清理 {today} 的旧数据")
    except Exception as e:
        logger.warning(f"清理旧数据失败 (表可能还不存在): {e}")

    total = 0
    for cat_id, items in categorized.items():
        cfg = CATEGORY_SOURCES[cat_id]
        for item in items:
            try:
                record = {
                    "title": item.get("title", ""),
                    "summary": make_summary(item),
                    "source": item.get("source", "未知来源"),
                    "url": item.get("url", ""),
                    "category": cat_id,
                    "category_name": cfg["name"],
                    "category_color": cfg["color"],
                    "scrape_date": today,
                    "published_time": item.get("time", ""),
                    "created_at": datetime.now(CST).isoformat(),
                }
                client.table("co_news").insert(record).execute()
                total += 1
            except Exception as e:
                logger.debug(f"插入失败 [{item.get('title', '')[:30]}]: {e}")

    logger.info(f"✅ 共保存 {total} 条新闻到 Supabase")
    return total


def save_to_json(categorized, output_path="news_output.json"):
    """备用：保存到本地 JSON 文件（当 Supabase 不可用时）"""
    result = {
        "scrape_date": datetime.now(CST).strftime("%Y-%m-%d"),
        "scrape_time": datetime.now(CST).isoformat(),
        "categories": []
    }

    for cat_id, items in categorized.items():
        if not items:
            continue
        cfg = CATEGORY_SOURCES[cat_id]
        result["categories"].append({
            "id": cat_id,
            "name": cfg["name"],
            "color": cfg["color"],
            "count": len(items),
            "items": [{
                "title": item.get("title", ""),
                "summary": make_summary(item),
                "source": item.get("source", ""),
                "url": item.get("url", ""),
                "time": item.get("time", ""),
            } for item in items]
        })

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    total = sum(len(v) for v in categorized.values())
    logger.info(f"✅ 已保存 {total} 条新闻到 {output_path}")
    return result


# ============================================================
# 主入口
# ============================================================
def main():
    logger.info("=" * 60)
    logger.info("📡 校园运营系统 - 每日新闻自动抓取器")
    logger.info(f"⏰ 抓取时间: {datetime.now(CST).strftime('%Y-%m-%d %H:%M:%S')} CST")
    logger.info("=" * 60)

    # Step 1: 从各来源抓取
    logger.info("\n[1/4] 正在从微博、百度、36氪、知乎、今日头条抓取新闻...")
    all_items = fetch_all_sources()
    logger.info(f"  总计抓取到 {len(all_items)} 条原始条目")

    # Step 2: 分类
    logger.info("\n[2/4] 正在按10个板块分类...")
    categorized = categorize_items(all_items)
    for cat_id, items in categorized.items():
        cfg = CATEGORY_SOURCES[cat_id]
        logger.info(f"  {cfg['name']}: {len(items)} 条")

    # Step 3: 去重
    logger.info("\n[3/4] 正在去重...")
    categorized = deduplicate(categorized)
    total_after = sum(len(v) for v in categorized.values())
    logger.info(f"  去重后共 {total_after} 条")

    # Step 4: 存储
    logger.info("\n[4/4] 正在存储...")

    # 尝试 Supabase
    client = init_supabase()
    if client:
        total = save_to_supabase(client, categorized)
        # 同时保存本地副本
        save_to_json(categorized)
        logger.info(f"\n🎉 抓取完成！{total} 条新闻已存入 Supabase")
    else:
        # 降级：仅保存 JSON（后续可以手动导入或由前端读取）
        result = save_to_json(categorized)
        logger.info("\n⚠️  Supabase 不可用，已保存到本地 news_output.json")

    logger.info(f"\n📅 下次抓取: 明天 10:00 CST")
    logger.info("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
