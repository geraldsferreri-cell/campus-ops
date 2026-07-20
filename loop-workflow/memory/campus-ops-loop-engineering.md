---
name: campus-ops-loop-engineering
description: 校园运营网站循环迭代更新流程（loop engineering），用于每次按需修改 index.html 并部署
metadata:
  type: project
---

# campus-ops Loop Engineering 流程

## 固定参数
- **线上地址**: https://<你的用户名>.github.io/<你的仓库>/
- **本地主文件**: `你的/本地/路径/index.html`
- **GitHub 仓库**: https://github.com/<你的用户名>/<你的仓库>.git
- **分支**: main
- **部署方式**: push to main → GitHub Pages 自动部署

## 操作标准流程（5步法 | 全自动模式）

### 第1步：接收指令
用户会指明：
- **哪个板块**（如：数据看板、视频记录、账号管理、薪资配置、资讯热点等）
- **具体操作内容**（如：添加字段、修改文案、调整样式、新增功能等）
- **最终标准**（操作后应达到的效果）

### 第2步：定位代码
在 `index.html` 中定位到对应板块的代码位置，不触碰其他无关代码。

### 第3步：执行修改
**无需确认，直接修改。** 只修改需要修改的代码，保持其他部分不变。

### 第4步：自检循环（最多3轮）
修改完成后自行检查：
- 代码语法是否正确
- 修改是否符合用户要求
- 是否影响了其他功能
- 不符合则调整，最多循环3轮

### 第5步：自动部署 + 输出结果
自检通过后自动 commit + push 部署，直接输出最终结果给用户。

## 部署命令
```bash
cd "你的/本地/路径" && git add index.html && git commit -m "update: [修改描述]" && git push origin main
```

## 板块索引
1. 登录页（Splash/Login）
2. 主导航菜单（顶部栏）
3. 首页/品牌介绍区（Hero + 理念卡片 + 数据统计）
4. 数据看板（Dashboard）
5. 视频记录（Video Records）
6. 账号管理（Account Management）
7. 人员管理（Personnel Management）
8. 数据导出（Data Export）
9. 编导分组（Director Grouping）
10. 薪资配置（Salary Configuration）
11. 薪资结算（Salary Settlement）
12. 系统设置（System Settings）
13. 修改密码（Change Password）
14. 资讯热点（Trending Topics）
15. 近期选题（Topic Selection）
16. 数据复盘（Data Review）
17. 模态弹窗（Modal Dialogs，8种：添加视频、添加账号、添加成员、添加分组、添加薪资配置、提交选题、薪资明细、选题详情）
18. 全局 Footer

## 触发方式
在 Claude Code 对话中说以下任意一句即可激活 Loop 模式：
- "校园运营loop更新"
- "campus-ops"
- "loop engineering"
- 直接说板块名 + 要改什么
