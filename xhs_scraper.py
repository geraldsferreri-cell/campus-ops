# -*- coding: utf-8 -*-
"""
小红书数据爬虫
从创作者服务中心抓取视频数据并导出为 JSON
"""

import os
import sys
import json
import time
import logging
from pathlib import Path
from datetime import datetime
from dateutil import parser as date_parser

# 导入配置
from config import (
    COOKIES_FILE, EXPORT_FILE, DATA_DIR, LOG_FILE,
    XHS_CONFIG, BROWSER_CONFIG, LOG_CONFIG
)

# 设置日志
def setup_logging():
    """配置日志"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=getattr(logging, LOG_CONFIG["level"]),
        format=LOG_CONFIG["format"],
        datefmt=LOG_CONFIG["date_format"],
        handlers=[
            logging.FileHandler(LOG_FILE, encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ]
    )
    return logging.getLogger(__name__)

logger = setup_logging()


class XHSConnector:
    """小红书数据连接器"""

    def __init__(self):
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.cookies = []

    def init_browser(self):
        """初始化浏览器"""
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            logger.error("请先安装 playwright: pip install playwright && playwright install chromium")
            sys.exit(1)

        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(
            headless=BROWSER_CONFIG["headless"]
        )
        self.context = self.browser.new_context(
            user_agent=BROWSER_CONFIG["user_agent"]
        )
        self.page = self.context.new_page()
        self.page.set_default_timeout(BROWSER_CONFIG["timeout"])
        logger.info("浏览器初始化完成")

    def load_cookies(self):
        """加载 cookies"""
        if COOKIES_FILE.exists():
            with open(COOKIES_FILE, 'r', encoding='utf-8') as f:
                self.cookies = json.load(f)
            logger.info(f"已加载 {len(self.cookies)} 条 cookies")
            return True
        return False

    def save_cookies(self):
        """保存 cookies"""
        cookies = self.context.cookies()
        COOKIES_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(COOKIES_FILE, 'w', encoding='utf-8') as f:
            json.dump(cookies, f, ensure_ascii=False, indent=2)
        logger.info(f"已保存 {len(cookies)} 条 cookies 到 {COOKIES_FILE}")

    def check_login(self):
        """检查是否已登录"""
        try:
            self.page.goto(XHS_CONFIG["creator_url"], wait_until="networkidle")
            time.sleep(2)

            # 检查是否跳转到登录页
            if "login" in self.page.url or "passport" in self.page.url:
                logger.warning("检测到未登录状态")
                return False

            # 检查页面内容
            content = self.page.content()
            if "登录" in content and "注册" in content:
                logger.warning("页面显示需要登录")
                return False

            logger.info("登录状态正常")
            return True
        except Exception as e:
            logger.error(f"检查登录状态失败: {e}")
            return False

    def manual_login(self):
        """手动登录"""
        print("\n" + "="*60)
        print("需要手动登录小红书")
        print("="*60)
        print(f"\n请在打开的浏览器中完成登录...")
        print(f"登录地址: {XHS_CONFIG['login_url']}")
        print("\n登录完成后，程序将自动检测并保存 cookies\n")

        self.page.goto(XHS_CONFIG["login_url"], wait_until="networkidle")

        # 等待用户登录，最多等待 5 分钟
        max_wait = 300
        start_time = time.time()
        while time.time() - start_time < max_wait:
            time.sleep(2)
            current_url = self.page.url
            if "login" not in current_url and "passport" not in current_url:
                logger.info("检测到登录成功")
                break

            # 检查页面是否显示用户信息
            try:
                user_info = self.page.query_selector('[class*="user"]')
                if user_info:
                    logger.info("检测到用户信息，登录成功")
                    break
            except:
                pass
        else:
            logger.error("登录超时，请重试")
            return False

        # 保存 cookies
        self.save_cookies()
        return True

    def apply_cookies(self):
        """应用 cookies"""
        if self.cookies:
            # 转换 cookies 格式
            formatted_cookies = []
            for cookie in self.cookies:
                formatted_cookie = {
                    "name": cookie.get("name"),
                    "value": cookie.get("value"),
                    "domain": cookie.get("domain", ".xiaohongshu.com"),
                    "path": cookie.get("path", "/"),
                }
                if "expires" in cookie:
                    formatted_cookie["expires"] = cookie["expires"]
                formatted_cookies.append(formatted_cookie)

            try:
                self.context.add_cookies(formatted_cookies)
                logger.info("Cookies 应用成功")
                return True
            except Exception as e:
                logger.warning(f"应用 cookies 失败: {e}")
                return False
        return False

    def navigate_to_content(self):
        """导航到内容页面"""
        logger.info("正在访问创作者中心...")
        try:
            self.page.goto(XHS_CONFIG["content_url"], wait_until="networkidle", timeout=60000)
            time.sleep(3)
            logger.info("已到达内容页面")
            return True
        except Exception as e:
            logger.error(f"导航失败: {e}")
            return False

    def scroll_and_collect(self):
        """滚动页面收集数据"""
        logger.info("开始收集视频数据...")

        videos = []
        last_height = 0
        scroll_count = 0
        max_scrolls = 50  # 最多滚动次数

        while scroll_count < max_scrolls:
            # 滚动到页面底部
            self.page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(2)

            # 等待内容加载
            self.page.wait_for_load_state("networkidle", timeout=10000)
            time.sleep(1)

            # 获取当前高度
            current_height = self.page.evaluate("document.body.scrollHeight")

            # 提取视频数据
            try:
                # 方法1: 通过页面元素提取
                video_cards = self.page.query_selector_all('[class*="note-item"], [class*="video-item"], .feeds-page .item')

                for card in video_cards:
                    try:
                        video_data = self._extract_video_from_card(card)
                        if video_data and video_data not in videos:
                            videos.append(video_data)
                    except Exception as e:
                        continue

                # 方法2: 尝试从页面脚本中提取数据
                page_data = self._extract_from_page_script()
                for item in page_data:
                    if item not in videos:
                        videos.append(item)

            except Exception as e:
                logger.debug(f"提取数据时出错: {e}")

            # 检查是否已滚动到底部
            if current_height == last_height:
                scroll_count += 1
                if scroll_count >= 3:  # 连续3次高度不变则认为到底
                    logger.info("已到达页面底部")
                    break
            else:
                scroll_count = 0

            last_height = current_height
            logger.info(f"已滚动 {current_height}px，收集到 {len(videos)} 条数据")

        return videos

    def _extract_video_from_card(self, card):
        """从卡片元素中提取视频数据"""
        try:
            video = {}

            # 提取标题
            title_elem = card.query_selector('[class*="title"], [class*="desc"], .title')
            if title_elem:
                video['title'] = title_elem.inner_text().strip()

            # 提取播放量
            play_elem = card.query_selector('[class*="play"], [class*="view"], .play-count')
            if play_elem:
                play_text = play_elem.inner_text().strip()
                video['views'] = self._parse_number(play_text)

            # 提取点赞数
            like_elem = card.query_selector('[class*="like"], [class*="liked"], .like-count')
            if like_elem:
                like_text = like_elem.inner_text().strip()
                video['likes'] = self._parse_number(like_text)

            # 提取评论数
            comment_elem = card.query_selector('[class*="comment"], .comment-count')
            if comment_elem:
                comment_text = comment_elem.inner_text().strip()
                video['comments'] = self._parse_number(comment_text)

            # 提取收藏数
            collect_elem = card.query_selector('[class*="collect"], .collect-count')
            if collect_elem:
                collect_text = collect_elem.inner_text().strip()
                video['collect'] = self._parse_number(collect_text)

            # 提取发布时间
            time_elem = card.query_selector('[class*="time"], [class*="date"], .time')
            if time_elem:
                video['publish_time'] = time_elem.inner_text().strip()

            # 提取链接/ID
            link_elem = card.query_selector('a[href*="/discovery/item/"]')
            if link_elem:
                href = link_elem.get_attribute('href')
                video['id'] = self._extract_id_from_url(href)

            return video if video.get('title') or video.get('id') else None

        except Exception as e:
            logger.debug(f"提取卡片数据失败: {e}")
            return None

    def _extract_from_page_script(self):
        """从页面脚本中提取数据"""
        videos = []
        try:
            # 尝试从 __INITIAL_STATE__ 或类似全局变量中提取
            data = self.page.evaluate("""
                () => {
                    // 尝试多种方式获取数据
                    const sources = [
                        window.__INITIAL_STATE__,
                        window.__NUXT__,
                        window.__PRELOADED_STATE__,
                        window.__REDUX_STATE__
                    ];

                    const videos = [];

                    for (const source of sources) {
                        if (source && source.feeds) {
                            for (const feed of source.feeds) {
                                if (feed.note && feed.note.id) {
                                    videos.push({
                                        id: feed.note.id,
                                        title: feed.note.title || feed.note.desc || '',
                                        likes: feed.note.interactInfo?.likedCount || feed.note.likes || 0,
                                        views: feed.note.playCount || feed.note.views || feed.note.video?.play_count || 0,
                                        comments: feed.note.commentCount || feed.note.comments || 0,
                                        collect: feed.note.collectCount || feed.note.collect || 0,
                                        publish_time: feed.note.time || feed.note.publishTime || ''
                                    });
                                }
                            }
                        }
                    }

                    return videos;
                }
            """)
            if data:
                videos.extend(data)
        except Exception as e:
            logger.debug(f"从脚本提取数据失败: {e}")
        return videos

    def _parse_number(self, text):
        """解析数字文本"""
        if not text:
            return 0
        text = text.strip()
        try:
            if '万' in text:
                return int(float(text.replace('万', '')) * 10000)
            elif '亿' in text:
                return int(float(text.replace('亿', '')) * 100000000)
            else:
                return int(text.replace(',', '').replace(' ', ''))
        except:
            return 0

    def _extract_id_from_url(self, url):
        """从 URL 中提取 ID"""
        if not url:
            return None
        # 尝试从 URL 中提取 note ID
        import re
        match = re.search(r'/discovery/item/([a-zA-Z0-9]+)', url)
        if match:
            return match.group(1)
        return url

    def export_videos(self, videos):
        """导出视频数据"""
        if not videos:
            logger.warning("没有收集到视频数据")
            return False

        EXPORT_FILE.parent.mkdir(parents=True, exist_ok=True)

        # 按时间排序
        videos.sort(key=lambda x: x.get('publish_time', ''), reverse=True)

        # 添加元数据
        export_data = {
            "export_time": datetime.now().isoformat(),
            "total_count": len(videos),
            "videos": videos
        }

        with open(EXPORT_FILE, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)

        logger.info(f"已导出 {len(videos)} 条视频数据到 {EXPORT_FILE}")
        return True

    def close(self):
        """关闭浏览器"""
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()
        logger.info("浏览器已关闭")


def main():
    """主函数"""
    print("\n" + "="*60)
    print("小红书数据爬虫 v1.0")
    print("="*60 + "\n")

    connector = XHSConnector()

    try:
        # 1. 初始化浏览器
        connector.init_browser()

        # 2. 尝试加载 cookies
        has_cookies = connector.load_cookies()

        if has_cookies:
            # 应用 cookies 并检查登录状态
            connector.apply_cookies()
            if not connector.check_login():
                logger.info("Cookies 已过期，需要重新登录")
                if not connector.manual_login():
                    logger.error("登录失败，程序退出")
                    sys.exit(1)
        else:
            # 需要手动登录
            if not connector.manual_login():
                logger.error("登录失败，程序退出")
                sys.exit(1)

        # 3. 导航到内容页面
        if not connector.navigate_to_content():
            logger.error("无法访问创作者中心")
            sys.exit(1)

        # 4. 收集数据
        videos = connector.scroll_and_collect()

        if not videos:
            logger.warning("\n未收集到视频数据，可能是以下原因：")
            logger.warning("1. 页面结构已变化，需要更新抓取规则")
            logger.warning("2. 未登录或 cookies 已过期")
            logger.warning("3. 网络连接问题")
            logger.warning("\n请查看日志文件获取详细信息")
            sys.exit(1)

        # 5. 导出数据
        connector.export_videos(videos)

        print("\n" + "="*60)
        print("抓取完成!")
        print("="*60)
        print(f"共收集到 {len(videos)} 条视频数据")
        print(f"数据已保存到: {EXPORT_FILE}")
        print("\n下一步:")
        print("1. 在管理系统中点击「导入数据」")
        print("2. 选择导出的 JSON 文件")
        print("3. 系统将自动匹配账号和学生，更新数据")
        print("="*60 + "\n")

    except KeyboardInterrupt:
        logger.info("用户中断程序")
    except Exception as e:
        logger.error(f"程序出错: {e}")
        import traceback
        traceback.print_exc()
    finally:
        connector.close()


if __name__ == "__main__":
    main()
