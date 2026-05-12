# 小红书数据爬虫方案

## 目标
从小红书创作者服务中心抓取视频数据，同步到「校园资讯组运营管理系统」

---

## 一、完整使用流程

### 第一步：安装依赖

```bash
# 进入爬虫目录
cd campus-ops/scraper

# 安装 Python 依赖
pip install -r requirements.txt

# 安装 Playwright 浏览器
playwright install chromium
```

### 第二步：首次登录

```bash
python xhs_scraper.py
```

程序会自动打开浏览器，进入小红书登录页面。请使用账号密码登录。

> 登录成功后，cookies 会自动保存到 `data/xhs_cookies.json`，后续无需重复登录。

### 第三步：抓取数据

```bash
python xhs_scraper.py
```

程序会自动：
1. 加载保存的 cookies
2. 访问创作者服务中心
3. 滚动页面收集视频数据
4. 导出到 `data/xhs_videos.json`

### 第四步：导入管理系统

1. 打开「校园资讯组运营管理系统」
2. 进入「视频记录」页面
3. 点击右上角「📥 导入数据」按钮
4. 选择 `xhs_videos.json` 文件
5. 选择对应的账号和学生
6. 点击「导入数据」

---

## 二、数据字段映射

### 小红书原始数据 → 系统数据

| 小红书字段 | 系统字段 | 说明 |
|-----------|---------|------|
| id / note_id | noteId | 视频唯一标识 |
| title / desc | title | 视频标题 |
| play_count / views | views | 播放量 |
| liked_count / likes | likes | 点赞数 |
| comment_count | comments | 评论数 |
| collect_count | collect | 收藏数 |
| time / create_time | createdAt | 发布时间 |

---

## 三、常见问题

### Q: Cookies 过期了怎么办？
A: 删除 `data/xhs_cookies.json`，重新运行脚本，按提示重新登录。

### Q: 抓取不到数据？
A: 可能是小红书页面结构更新，脚本可能需要适配新版本。请查看 `scraper.log` 日志文件获取详细信息。

### Q: 如何抓取其他平台数据？
A: 目前脚本针对小红书设计。其他平台（抖音、B站等）需要单独编写对应的爬虫脚本。

---

## 四、技术架构

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   小红书网页     │ ──→  │  Python 爬虫     │ ──→  │  JSON 文件      │
│  (创作者中心)    │      │  (Playwright)    │      │  (xhs_videos)   │
└─────────────────┘      └─────────────────┘      └────────┬────────┘
                                                          │
                                                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  数据看板        │ ←──  │  管理系统       │ ←──  │  文件导入       │
│  (实时统计)      │      │  (视频记录)     │      │  (导入功能)     │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

---

## 五、文件结构

```
campus-ops/
├── frontend/
│   └── index.html          # 运营管理系统前端
├── scraper/
│   ├── xhs_scraper.py      # 小红书爬虫主脚本
│   ├── config.py           # 配置文件
│   ├── requirements.txt    # Python 依赖
│   └── README.md           # 本文件
└── data/                   # 数据目录（自动创建）
    ├── xhs_cookies.json    # 登录凭证
    ├── xhs_videos.json     # 抓取的视频数据
    └── scraper.log         # 运行日志
```

---

## 六、注意事项

1. **Cookies 时效**：小红书 cookies 通常 7-30 天过期，过期后需重新登录
2. **抓取频率**：建议每周手动抓取一次，避免触发反爬机制
3. **合规使用**：请遵守小红书平台规则，不要过于频繁抓取
4. **数据备份**：重要数据请定期备份
