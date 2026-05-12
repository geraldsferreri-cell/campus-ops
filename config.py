# -*- coding: utf-8 -*-
"""
配置文件
"""

import os
from pathlib import Path

# 项目根目录
BASE_DIR = Path(__file__).parent.parent.parent

# Cookies 文件路径
COOKIES_FILE = BASE_DIR / "data" / "xhs_cookies.json"

# 数据导出目录
DATA_DIR = BASE_DIR / "data"
EXPORT_FILE = DATA_DIR / "xhs_videos.json"

# 日志文件
LOG_FILE = DATA_DIR / "scraper.log"

# 小红书相关配置
XHS_CONFIG = {
    # 创作者中心网址
    "creator_url": "https://creator.xiaohongshu.com",
    # 登录页面
    "login_url": "https://www.xiaohongshu.com",
    # 内容数据页面
    "content_url": "https://creator.xiaohongshu.com/explore/all",
    # 视频数据 API（可能需要根据实际情况调整）
    "video_api": "https://edith.xiaohongshu.com/api/sns/web/v1/feed",
    # 请求间隔（秒）
    "request_interval": 2,
    # 最大重试次数
    "max_retries": 3,
}

# 浏览器配置
BROWSER_CONFIG = {
    "headless": False,  # 是否无头模式运行
    "slow_mo": 100,    # 操作延迟（毫秒）
    "timeout": 30000,   # 超时时间（毫秒）
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

# 日志配置
LOG_CONFIG = {
    "level": "INFO",
    "format": "%(asctime)s - %(levelname)s - %(message)s",
    "date_format": "%Y-%m-%d %H:%M:%S"
}
