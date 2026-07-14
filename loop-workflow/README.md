# 🐯 Loop Engineering 工作流

> 方片校园运营系统 · 全自动循环迭代更新框架

---

## 📦 这是什么？

Loop Engineering 是一个基于 **Claude Code** 的全自动前端迭代工作流。你只需要用自然语言告诉它改什么，它自动完成：代码定位 → 修改 → 自检 → 部署上线。

**零确认 · 全自动 · 上线即生效**

---

## 🚀 快速上手（3步）

### 第1步：安装 Claude Code

```bash
# 官方安装指南：https://docs.anthropic.com/en/docs/claude-code
npm install -g @anthropic-ai/claude-code
claude  # 登录 Anthropic 账号
```

### 第2步：导入记忆文件

将本 zip 中的 `memory/` 目录下的 3 个文件复制到你的 Claude Code 记忆目录：

```
Windows: C:\Users\<你的用户名>\.claude\projects\C--Users-Windows\memory\
Mac/Linux: ~/.claude/projects/<project>/memory/
```

3 个文件：
```
memory/
├── MEMORY.md                          # 索引（自动加载到每个对话）
├── campus-ops-project.md              # 项目上下文（配色、结构、技术栈）
└── campus-ops-loop-engineering.md     # Loop 工作流定义（5步流程）
```

### 第3步：调整参数

打开 `campus-ops-loop-engineering.md`，修改为你自己的配置：

```markdown
- 线上地址: https://你的域名.github.io/你的仓库/
- 本地主文件: `你的/本地/路径/index.html`
- GitHub 仓库: https://github.com/你的用户名/你的仓库.git
- 分支: main
```

---

## 🎯 使用方式

在 Claude Code 对话中，直接用自然语言下指令：

```
校园运营loop更新
【数据看板】→ 顶部加一个"本月爆款"统计卡片 → 跟现有6个指标卡风格一致
```

Loop 自动执行：

```
① 接收指令 → ② 定位代码 → ③ 执行修改 → ④ 自检3轮 → ⑤ 自动部署
```

---

## 📋 支持的板块

| # | 板块 | # | 板块 |
|---|---|---|---|
| 1 | 登录页 | 10 | 薪资配置 |
| 2 | 导航菜单 | 11 | 薪资结算 |
| 3 | 首页品牌区 | 12 | 系统设置 |
| 4 | 数据看板 | 13 | 修改密码 |
| 5 | 视频记录 | 14 | 资讯热点 |
| 6 | 账号管理 | 15 | 近期选题 |
| 7 | 人员管理 | 16 | 数据复盘 |
| 8 | 数据导出 | 17 | 模态弹窗(×8) |
| 9 | 编导分组 | 18 | Footer |

---

## 🔧 技术栈

| 环节 | 工具 |
|---|---|
| 前端 | 纯前端 SPA（单 HTML 文件） |
| 数据库 | Supabase |
| 托管 | GitHub Pages（push 自动部署） |
| AI引擎 | Claude Code |
| 记忆系统 | Markdown 持久化记忆文件 |

---

## ⚠️ 注意事项

- GitHub push 完全自动，无需手动操作
- Supabase 改表结构需要后台权限（改代码无需）
- 每次修改只动目标代码，不误伤其他部分
- 自检最多3轮，不达标自动重调

---

🐯 Built with Loop Engineering · 2026
