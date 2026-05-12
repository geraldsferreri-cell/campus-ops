/**
 * 校园资讯组运营管理系统 - 数据库初始化模块
 * 使用 better-sqlite3，单文件SQLite，无需独立数据库服务
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'campus_ops.db');

function initDB() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    -- 用户表（管理员/老师/学生）
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,         -- bcrypt hash
      real_name   TEXT NOT NULL,
      role        TEXT NOT NULL CHECK(role IN ('admin','teacher','student')),
      phone       TEXT,
      school      TEXT,                  -- 学生所在学校
      group_id    INTEGER REFERENCES groups(id),
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active   INTEGER DEFAULT 1
    );

    -- 编导老师分组表
    CREATE TABLE IF NOT EXISTS groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,          -- e.g. "A组"
      teacher_id  INTEGER REFERENCES users(id),
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 账号表
    CREATE TABLE IF NOT EXISTS accounts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      platform      TEXT DEFAULT '小红书',
      account_type  TEXT NOT NULL CHECK(account_type IN ('时尚资讯','营销资讯','广告资讯','科技资讯')),
      account_name  TEXT NOT NULL,        -- 账号昵称
      account_id    TEXT,                 -- 平台ID/UID
      account_url   TEXT,                 -- 主页链接
      assigned_to   INTEGER REFERENCES users(id),  -- 分配给哪个学生
      status        TEXT DEFAULT '未分配' CHECK(status IN ('未分配','使用中','停用')),
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 视频投稿记录表
    CREATE TABLE IF NOT EXISTS posts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id      INTEGER NOT NULL REFERENCES users(id),
      account_id      INTEGER NOT NULL REFERENCES accounts(id),
      post_url        TEXT NOT NULL,       -- 小红书笔记链接
      note_id         TEXT,                -- 小红书笔记ID（解析自URL）
      title           TEXT,                -- 视频标题
      post_date       DATE,                -- 发布日期
      submitted_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      -- 数据抓取字段
      views           INTEGER DEFAULT 0,   -- 播放量
      likes           INTEGER DEFAULT 0,   -- 点赞量
      collects        INTEGER DEFAULT 0,   -- 收藏量
      comments        INTEGER DEFAULT 0,   -- 评论量
      last_fetched_at DATETIME,            -- 最后抓取时间
      fetch_status    TEXT DEFAULT '待抓取' CHECK(fetch_status IN ('待抓取','已抓取','抓取失败'))
    );

    -- 薪资配置表
    CREATE TABLE IF NOT EXISTS salary_config (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      base_salary     REAL DEFAULT 0,      -- 保底薪资（元/月）
      views_rate      REAL DEFAULT 0.001,  -- 每播放量单价（元/次）
      likes_rate      REAL DEFAULT 0.01,   -- 每点赞单价（元/次）
      post_bonus      REAL DEFAULT 5,      -- 每发一条视频奖励（元）
      effective_from  DATE NOT NULL,
      created_by      INTEGER REFERENCES users(id),
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 月度薪资结算记录
    CREATE TABLE IF NOT EXISTS salary_records (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id      INTEGER NOT NULL REFERENCES users(id),
      year_month      TEXT NOT NULL,        -- e.g. "2026-04"
      post_count      INTEGER DEFAULT 0,
      total_views     INTEGER DEFAULT 0,
      total_likes     INTEGER DEFAULT 0,
      base_salary     REAL DEFAULT 0,
      performance     REAL DEFAULT 0,
      total_salary    REAL DEFAULT 0,
      status          TEXT DEFAULT '待确认' CHECK(status IN ('待确认','已确认','已发放')),
      calculated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 系统操作日志
    CREATE TABLE IF NOT EXISTS logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER REFERENCES users(id),
      action      TEXT NOT NULL,
      detail      TEXT,
      ip          TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 插入默认管理员账号（首次运行）
  const adminExists = db.prepare("SELECT id FROM users WHERE username='admin'").get();
  if (!adminExists) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password, real_name, role)
      VALUES ('admin', ?, '系统管理员', 'admin')
    `).run(hash);

    // 默认薪资配置
    db.prepare(`
      INSERT INTO salary_config (base_salary, views_rate, likes_rate, post_bonus, effective_from, created_by)
      VALUES (1500, 0.001, 0.01, 5, date('now'), 1)
    `).run();

    console.log('✅ 数据库初始化完成，默认管理员: admin / admin123');
  }

  return db;
}

module.exports = { initDB, DB_PATH };
