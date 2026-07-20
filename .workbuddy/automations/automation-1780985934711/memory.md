# 每日资讯热点抓取 — 执行记录

## 2026-07-15
- **状态**: 成功
- **操作**: 搜索8个分类热点新闻（科技/AI/体育/秀场/时尚/综艺/影视/韩娱），写入 news_data.json，git commit + push 成功
- **commit**: e22b612
- **数据来源**: 上观新闻、互联鱼、安兔兔、观察者网、澎湃新闻、CSDN、21世纪经济报道、智东西、腾讯新闻、虎扑、新浪娱乐、今日头条、潮库、JUKSY、搜狐、360娱乐、灯塔专业版、时光网、YG、Kpopn、网易
- **说明**: 继续沿用安全版方案——只更新 news_data.json；index.html 当前为异步加载 JSON 模式，无内联 NEWS_DATA 块；推送直连成功，无需代理

## 2026-07-10
- **状态**: 成功
- **操作**: 搜索8个分类热点新闻（科技/AI/体育/秀场/时尚/综艺/影视/韩娱），写入 news_data.json，git commit + push 成功
- **commit**: ed12402
- **数据来源**: 科技日报、36氪、中新社、央视财经、第一财经、新浪财经、深圳新闻网、央视体育、腾讯新闻、新浪体育、QQ新闻、中华网、网易球鞋、消费日报、VOGUE、新浪娱乐、电视猫、爱奇艺、灯塔专业版、同花顺、微博、搜狐、Kpoppann
- **说明**: 远端有新提交（60s.viki.moe管线）导致冲突，通过 checkout --theirs + rebase 解决后成功推送；继续沿用安全版方案——只更新 news_data.json

## 2026-07-06
- **状态**: 成功
- **操作**: 搜索8个分类热点新闻（科技/AI/体育/秀场/时尚/综艺/影视/韩娱），写入 news_data.json，git commit + push 成功
- **commit**: ec3d73a
- **数据来源**: QQ新闻、36氪、网易科技、AI工具实验室、IAI派、财联社、央视网、中时新闻网、中国娱乐网、腾讯新闻、TVCN、网易球鞋、FLIGHTCLUB、Notizie.it、爱奇艺、电视猫、猫眼、百度百家、新浪娱乐、PopoNote、KpopOfficial
- **说明**: 继续沿用安全版方案——只更新 news_data.json；index.html 当前为异步加载 JSON 模式，无内联 NEWS_DATA 块，因此未修改 index.html

## 2026-07-03
- **状态**: 成功
- **操作**: 搜索8个分类热点新闻（科技/AI/体育/秀场/时尚/综艺/影视/韩娱），写入 news_data.json，git commit + push 成功
- **commit**: b975423
- **遇到问题**: 远端 news_data.json 有更新（4ab64e7），rebase 时产生冲突，通过 checkout --theirs 保留本自动化版本，成功推送
- **数据来源**: 36氪、量子位、CSDN、新华社、新浪娱乐、微博热搜、KOTourLive、Kpann、腾讯新闻、百度百科、爱奇艺、电视猫
- **说明**: 继续沿用安全版方案——只更新 news_data.json，index.html 已从 JSON 异步加载，无需修改内联代码；注意用户原始指令要求替换 index.html 内联 NEWS_DATA，但当前项目结构已改为异步加载 JSON，故仅更新 JSON 数据文件

## 2026-07-02
- **状态**: 成功
- **操作**: 搜索8个分类热点新闻（科技/AI/体育/秀场/时尚/综艺/影视/韩娱），写入 news_data.json，git commit + push 成功
- **commit**: 830aaae
- **遇到问题**: 远端 news_data.json 有更新（bfdcfaf），rebase 时产生冲突，通过 checkout --theirs 保留本自动化版本，成功推送
- **数据来源**: IT之家、CNMO、华为、无矩AI、中工网、腾讯云、知乎、中国新闻网、中国宁波网、央视网、新浪、腾讯新闻、中时新闻网、网易娱乐、潮流新闻、钛媒体、VOGUE、电视猫、爱奇艺、抖音、百度百家、新浪影视、澎湃新闻、STARNEWS
- **说明**: 继续沿用安全版方案——只更新 news_data.json，index.html 已从 JSON 异步加载，无需修改内联代码

## 2026-06-30
- **状态**: 成功
- **操作**: 搜索8个分类热点新闻，整理为指定格式，写入 news_data.json，git commit + push 成功
- **commit**: a1914a9
- **遇到问题**: 远端 news_data.json 有更新（60s.viki.moe 14:06 版本），rebase 后 checkout --theirs 保留本自动化版本，成功推送
- **数据来源**: ZOL中关村在线、7M体育、网易娱乐、STARNEWS、Hypebeast、澎湃新闻、西网、搜狐、CSDN、文艺报、新浪娱乐、证券时报
- **说明**: index.html 已无内联 NEWS_DATA 定义，继续沿用安全版方案——只更新 news_data.json

## 2026-06-27
- **状态**: 成功
- **操作**: 搜索8个分类热点新闻（科技/AI/体育/秀场/时尚/综艺/影视/韩娱），写入 news_data.json，git commit + push 成功
- **commit**: 541f854
- **遇到问题**: 远端有新提交（60s.viki.moe 管线），冲突后 rebase（checkout --theirs 保留我们的数据）解决
- **数据来源**: 微博热搜/新浪科技/腾讯新闻/搜狐/快科技/央视/知乎/观察者网/IT之家/财联社/凤凰体育/新华社/Soompi/Kpann/JUKSY/芒果TV/猫眼
- **说明**: 沿用安全版方案——只更新 news_data.json，不修改 index.html 内联代码

## 2026-06-24
- **状态**: 成功
- **操作**: 搜索8个分类热点新闻（科技/AI/体育/秀场/时尚/综艺/影视/韩娱），写入 news_data.json，git commit + push 成功
- **commit**: 3e920b8
- **数据来源**: AI内参、AITNT、央视体育、新浪综艺/明星、JUKSY、KOTourLive、Kpann、beauty321、同花顺财经、新华社、知乎
- **说明**: push 直连成功，无需代理

## 2026-06-23
- **状态**: 成功
- **操作**: 搜索8个分类热点新闻（科技/AI/体育/秀场/时尚/综艺/影视/韩娱），写入 news_data.json，git commit + push 成功
- **遇到问题**: 远端有新提交（60s.viki.moe管线），stash + pull --rebase 解决冲突后 push 成功
- **commit**: 9d1c847
- **重要说明**: 继续沿用安全版方案——只更新 news_data.json，不修改 index.html 内联代码
- **数据来源**: 快科技、新浪财经、新华网、凤凰网科技、搜狐、央视网、中华网娱乐、知乎、抖音、FlightClub、JUKSY、晋江新闻网、芒果TV、腾讯新闻、灯塔数据、百度百家、羊城晚报、新浪科技、雪球、中国新闻网、新浪娱乐、beauty321

## 2026-06-18
- **状态**: 成功
- **操作**: 搜索8个分类热点新闻（科技/AI/体育/秀场/时尚/综艺/影视/韩娱），写入 news_data.json，git commit + push 成功
- **遇到问题**: 远端有另一个自动抓取管线（60s.viki.moe）的6/18数据，冲突后 rebase 取了远端版本，重新写入纠正
- **commit**: a25cb21
- **数据来源**: 快科技、OSChina、澎湃新闻、每日经济新闻、新浪财经、新浪娱乐、新浪明星、搜狐娱乐、抖音、腾讯新闻、Juksy、芒果TV、爱奇艺、腾讯视频、百度百家、KSD韩星网、今日头条、Kpann、YOHO潮流志

## 2026-06-17
- **状态**: 成功
- **操作**: 抓取8个分类热点新闻（科技/AI/体育/秀场/时尚/综艺/影视/韩娱），写入news_data.json（6/17数据），git commit + push成功
- **重要发现**: index.html 已经过安全版改造（NEWS_DATA改为从 news_data.json 异步加载），所以本次只更新 JSON 文件而非修改 index.html——这正是之前约束"只替换NEWS_DATA块"演进后的正确做法
- **遇到问题**: 工作目录中已有 6/16 的 staged 修改（带 scrape_time 字段），通过重新 `git add news_data.json` 覆盖为 6/17 最新数据
- **commit**: 5bb5b05
- **数据来源**: QQ看点、新浪科技、东方财富、人民网、腾讯云、QQ看点（秀场）、搜狐（时尚）、电视猫、爱奇艺、腾讯视频、百度百家、知乎、百度百科、证券时报、今日头条、百度知道、新浪娱乐

## 2026-06-11
- **状态**: 成功
- **操作**: 搜索8个分类热点新闻（科技/AI/体育/秀场/时尚/综艺/影视/韩娱），编译为NEWS_DEFAULTS，替换index.html数据块，git push成功
- **遇到问题**: 远程有GitHub Actions自动更新的旧数据（6/10 B站抓取），产生merge conflict，通过git checkout --theirs + rebase解决
- **commit**: 无记录
- **数据来源**: 澎湃新闻、OSChina、搜狐、中新网、新华社、新浪娱乐、VOGUE、芒果TV、Kpann、KOTourLive等
