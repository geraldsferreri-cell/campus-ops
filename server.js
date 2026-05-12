/**
 * 校园资讯组运营管理系统 - 后端服务
 * 数据存储：JSON文件（无需数据库）
 * 启动：node server.js
 */
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();

// 前端静态文件服务（同源，无跨域问题）
app.use(express.static(path.join(__dirname, '../frontend')));
const PORT = 3001;
const JWT_SECRET = 'campus_ops_secret_v2_2026';
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());

// ─── 简单JSON数据库 ─────────────────────────────────────────────────────────
let DB = { users:[], groups:[], accounts:[], posts:[], salaryConfigs:{}, salaryRecords:[], roles:[], platforms:[] };

function loadDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      DB = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch(e) { console.log('初始化新数据库'); }
  // 确保结构完整
  DB.users = DB.users || [];
  DB.groups = DB.groups || [];
  DB.accounts = DB.accounts || [];
  DB.posts = DB.posts || [];
  DB.salaryConfigs = DB.salaryConfigs || {};
  DB.salaryRecords = DB.salaryRecords || [];
  DB.roles = DB.roles || [];
  DB.platforms = DB.platforms || [];
}
loadDB();

function saveDB() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2));
}

// 初始化默认数据
function initDefaults() {
  // 默认角色
  if (!DB.roles.length) {
    DB.roles = [
      { id: 'admin', name: '超级管理员', desc: '系统管理员，拥有全部权限' },
      { id: 'teacher_director', name: '编导老师', desc: '负责内容策划与指导' },
      { id: 'teacher_editor', name: '剪辑老师', desc: '负责视频剪辑指导' },
      { id: 'student', name: '学生', desc: '内容创作者' }
    ];
  }
  // 默认平台
  if (!DB.platforms.length) {
    DB.platforms = [
      { id: 'xiaohongshu', name: '小红书', color: '#ff2442' },
      { id: 'douyin', name: '抖音', color: '#00f2ea' },
      { id: 'weishi', name: '视频号', color: '#07c160' },
      { id: 'bilibili', name: 'B站', color: '#00a1d6' }
    ];
  }
  // 默认薪资配置
  if (!DB.salaryConfigs.student) {
    DB.salaryConfigs.student = {
      // 千赞奖金：80元/条（点赞>=1000）
      thousandLikeBonus: 80,
      // 万赞奖金：120元/条（点赞>=10000）
      tenThousandLikeBonus: 120,
      // 底薪规则（按千赞+万赞视频总数）
      baseRules: [
        { min: 0, max: 2, amount: 20 },   // 0-2条：20元/条
        { min: 3, max: 5, amount: 25 },   // 3-5条：25元/条
        { min: 6, max: Infinity, amount: 30 }  // >5条：30元/条
      ]
    };
  }
  if (!DB.salaryConfigs.teacher_director) {
    DB.salaryConfigs.teacher_director = { base: 0, postBonus: 0, views: 0, likes: 0, studentBonus: 50, bonuses: {} };
  }
  if (!DB.salaryConfigs.teacher_editor) {
    DB.salaryConfigs.teacher_editor = { base: 0, postBonus: 0, views: 0, likes: 0, studentBonus: 30, bonuses: {} };
  }
  // 默认管理员
  if (!DB.users.find(u => u.username === 'admin')) {
    const hash = bcrypt.hashSync('admin123', 10);
    DB.users.push({ id: 1, username: 'admin', password: hash, realName: '系统管理员', role: 'admin', phone: '', school: '', groupId: null, active: true, createdAt: new Date().toISOString() });
  }
  saveDB();
  console.log('✅ 默认数据初始化完成');
}
initDefaults();

// ─── 工具函数 ───────────────────────────────────────────────────────────────
function genId(arr) { return arr.length ? Math.max(...arr.map(i => i.id)) + 1 : 1; }

function auth(roles = []) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '请先登录' });
    try {
      const user = jwt.verify(token, JWT_SECRET);
      if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: '权限不足' });
      req.user = user; next();
    } catch { return res.status(401).json({ error: '登录状态已失效' }); }
  };
}

// ─── 登录 ──────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = DB.users.find(u => u.username === username && u.active);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, realName: user.realName, groupId: user.groupId }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, realName: user.realName } });
});

// ─── 角色管理 ───────────────────────────────────────────────────────────────
app.get('/api/roles', auth(['admin']), (req, res) => { res.json(DB.roles); });
app.post('/api/roles', auth(['admin']), (req, res) => {
  const { name, desc } = req.body;
  const id = Date.now().toString(36);
  DB.roles.push({ id, name, desc: desc || '' });
  saveDB();
  res.json({ id, message: '角色添加成功' });
});
app.put('/api/roles/:id', auth(['admin']), (req, res) => {
  const r = DB.roles.find(r => r.id === req.params.id);
  if (!r) return res.status(404).json({ error: '角色不存在' });
  Object.assign(r, req.body);
  saveDB();
  res.json({ message: '更新成功' });
});
app.delete('/api/roles/:id', auth(['admin']), (req, res) => {
  const idx = DB.roles.findIndex(r => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: '角色不存在' });
  DB.roles.splice(idx, 1);
  saveDB();
  res.json({ message: '删除成功' });
});

// ─── 平台管理 ───────────────────────────────────────────────────────────────
app.get('/api/platforms', auth([]), (req, res) => { res.json(DB.platforms); });
app.post('/api/platforms', auth(['admin']), (req, res) => {
  const { name, color } = req.body;
  const id = name.toPinyin ? name.toPinyin().replace(/\s/g, '').toLowerCase() : name.slice(0, 2).toLowerCase();
  if (DB.platforms.find(p => p.id === id)) return res.status(400).json({ error: '平台ID已存在' });
  DB.platforms.push({ id, name, color: color || '#666' });
  saveDB();
  res.json({ id, message: '平台添加成功' });
});
app.delete('/api/platforms/:id', auth(['admin']), (req, res) => {
  const idx = DB.platforms.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: '平台不存在' });
  DB.platforms.splice(idx, 1);
  saveDB();
  res.json({ message: '删除成功' });
});

// ─── 账号类型 ───────────────────────────────────────────────────────────────
app.get('/api/account-types', auth([]), (req, res) => {
  const types = ['时尚资讯', '营销资讯', '广告资讯', '科技资讯'];
  res.json(types.map(t => ({ id: t, name: t })));
});

// ─── 分组管理 ───────────────────────────────────────────────────────────────
app.get('/api/groups', auth(['admin', 'teacher_director', 'teacher_editor']), (req, res) => {
  res.json(DB.groups.map(g => {
    const teacher = DB.users.find(u => u.id === g.teacherId);
    const students = DB.users.filter(u => u.groupId === g.id && u.role === 'student');
    return { ...g, teacherName: teacher?.realName, studentCount: students.length, students };
  }));
});

app.post('/api/groups', auth(['admin']), (req, res) => {
  const { name, teacherId } = req.body;
  const id = genId(DB.groups);
  DB.groups.push({ id, name, teacherId: teacherId || null });
  saveDB();
  res.json({ id, message: '分组创建成功' });
});

app.put('/api/groups/:id', auth(['admin']), (req, res) => {
  const g = DB.groups.find(g => g.id === parseInt(req.params.id));
  if (!g) return res.status(404).json({ error: '分组不存在' });
  Object.assign(g, req.body);
  saveDB();
  res.json({ message: '更新成功' });
});

app.delete('/api/groups/:id', auth(['admin']), (req, res) => {
  const idx = DB.groups.findIndex(g => g.id === parseInt(req.params.id));
  if (idx < 0) return res.status(404).json({ error: '分组不存在' });
  DB.groups.splice(idx, 1);
  DB.users.forEach(u => { if (u.groupId === parseInt(req.params.id)) u.groupId = null; });
  saveDB();
  res.json({ message: '删除成功' });
});

// ─── 用户管理 ───────────────────────────────────────────────────────────────
app.get('/api/users', auth(['admin', 'teacher_director', 'teacher_editor']), (req, res) => {
  const { role } = req.query;
  let users = DB.users.map(u => {
    const group = DB.groups.find(g => g.id === u.groupId);
    const account = DB.accounts.find(a => a.assignedTo === u.id && a.status === '使用中');
    return { ...u, password: undefined, groupName: group?.name, accountName: account?.name, accountType: account?.type };
  });
  if (role) users = users.filter(u => u.role === role);
  // 老师只能看自己的学生
  if (['teacher_director', 'teacher_editor'].includes(req.user.role)) {
    users = users.filter(u => u.groupId && DB.groups.find(g => g.id === u.groupId && g.teacherId === req.user.id));
  }
  res.json(users);
});

app.post('/api/users', auth(['admin']), (req, res) => {
  const { username, password, realName, role, phone, school, groupId } = req.body;
  if (DB.users.find(u => u.username === username)) return res.status(400).json({ error: '用户名已存在' });
  const hash = bcrypt.hashSync(password || '123456', 10);
  const user = { id: genId(DB.users), username, password: hash, realName, role, phone: phone || '', school: school || '', groupId: groupId || null, active: true, createdAt: new Date().toISOString() };
  DB.users.push(user);
  saveDB();
  res.json({ id: user.id, message: '创建成功' });
});

app.put('/api/users/:id', auth(['admin']), (req, res) => {
  const u = DB.users.find(u => u.id === parseInt(req.params.id));
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const { realName, phone, school, groupId, active } = req.body;
  if (realName !== undefined) u.realName = realName;
  if (phone !== undefined) u.phone = phone;
  if (school !== undefined) u.school = school;
  if (groupId !== undefined) u.groupId = groupId || null;
  if (active !== undefined) u.active = active;
  saveDB();
  res.json({ message: '更新成功' });
});

app.delete('/api/users/:id', auth(['admin']), (req, res) => {
  const idx = DB.users.findIndex(u => u.id === parseInt(req.params.id));
  if (idx < 0) return res.status(404).json({ error: '用户不存在' });
  DB.users.splice(idx, 1);
  saveDB();
  res.json({ message: '删除成功' });
});

// ─── 账号管理 ───────────────────────────────────────────────────────────────
app.get('/api/accounts', auth([]), (req, res) => {
  res.json(DB.accounts.map(a => {
    const student = DB.users.find(u => u.id === a.assignedTo);
    const group = student ? DB.groups.find(g => g.id === student.groupId) : null;
    return { ...a, studentName: student?.realName, studentSchool: student?.school, groupName: group?.name };
  }));
});

app.post('/api/accounts', auth(['admin']), (req, res) => {
  const { platform, type, name, uid, url, groupId } = req.body;
  if (!groupId) return res.status(400).json({ error: '请选择所在分组（必填）' });
  const group = DB.groups.find(g => g.id === groupId);
  const id = genId(DB.accounts);
  DB.accounts.push({ id, platform: platform || 'xiaohongshu', type, name, uid: uid || '', url: url || '', assignedTo: null, groupId: groupId || null, groupName: group?.name || '', status: '未分配', createdAt: new Date().toISOString() });
  saveDB();
  res.json({ id, message: '账号添加成功' });
});

app.put('/api/accounts/:id', auth(['admin']), (req, res) => {
  const a = DB.accounts.find(a => a.id === parseInt(req.params.id));
  if (!a) return res.status(404).json({ error: '账号不存在' });
  Object.assign(a, req.body);
  if (req.body.assignedTo) a.status = '使用中';
  else if (req.body.status === '停用') a.status = '停用';
  else a.status = '未分配';
  saveDB();
  res.json({ message: '更新成功' });
});

app.delete('/api/accounts/:id', auth(['admin']), (req, res) => {
  const idx = DB.accounts.findIndex(a => a.id === parseInt(req.params.id));
  if (idx < 0) return res.status(404).json({ error: '账号不存在' });
  DB.accounts.splice(idx, 1);
  saveDB();
  res.json({ message: '删除成功' });
});

// ─── 视频投稿 ───────────────────────────────────────────────────────────────
app.get('/api/posts', auth([]), (req, res) => {
  let posts = DB.posts.map(p => {
    const student = DB.users.find(u => u.id === p.studentId);
    const account = DB.accounts.find(a => a.id === p.accountId);
    const group = student ? DB.groups.find(g => g.id === student.groupId) : null;
    const platform = DB.platforms.find(pl => pl.id === account?.platform);
    return { ...p, studentName: student?.realName, studentSchool: student?.school, accountName: account?.name, accountType: account?.type, platformName: platform?.name, platformColor: platform?.color, groupName: group?.name };
  });
  if (req.user.role === 'student') posts = posts.filter(p => p.studentId === req.user.id);
  else if (['teacher_director', 'teacher_editor'].includes(req.user.role)) {
    posts = posts.filter(p => {
      const student = DB.users.find(u => u.id === p.studentId);
      return student && student.groupId && DB.groups.find(g => g.id === student.groupId && g.teacherId === req.user.id);
    });
  }
  posts.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  res.json(posts);
});

app.post('/api/posts', auth(['student', 'admin']), (req, res) => {
  const { postUrl, title, postDate, accountId } = req.body;
  const studentId = req.user.role === 'student' ? req.user.id : req.body.studentId;

  // 自动获取分配给该学生的账号
  let account = null;
  if (accountId) {
    account = DB.accounts.find(a => a.id === accountId);
  } else {
    account = DB.accounts.find(a => a.assignedTo === studentId && a.status === '使用中');
  }
  if (!account) return res.status(400).json({ error: '该学生尚未分配账号' });

  const id = genId(DB.posts);
  DB.posts.push({ id, studentId, accountId: account.id, postUrl, title: title || '', postDate: postDate || new Date().toISOString().slice(0,10), submittedAt: new Date().toISOString(), views: 0, likes: 0, collects: 0, comments: 0, fetchStatus: '待抓取', lastFetched: null });
  saveDB();
  res.json({ id, message: '提交成功' });
});

app.put('/api/posts/:id', auth(['admin']), (req, res) => {
  const p = DB.posts.find(p => p.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: '记录不存在' });
  Object.assign(p, req.body);
  saveDB();
  res.json({ message: '更新成功' });
});

// ─── 数据抓取 ───────────────────────────────────────────────────────────────
async function fetchXHS(url) {
  try {
    const resp = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1', 'Accept': 'text/html', 'Accept-Language': 'zh-CN,zh;q=0.9' }, maxRedirects: 5 });
    const html = resp.data;
    const viewM = html.match(/"likedCount":(\d+)/) || html.match(/"viewCount":(\d+)/);
    const likeM = html.match(/"likedCount":(\d+)/);
    const collM = html.match(/"collectedCount":(\d+)/);
    const commM = html.match(/"commentCount":(\d+)/);
    const titleM = html.match(/"title":"([^"]+)"/);
    return { success: true, views: viewM ? parseInt(viewM[1]) : 0, likes: likeM ? parseInt(likeM[1]) : 0, collects: collM ? parseInt(collM[1]) : 0, comments: commM ? parseInt(commM[1]) : 0, title: titleM ? titleM[1] : '' };
  } catch(e) { return { success: false, error: e.message }; }
}

app.post('/api/fetch/:postId', auth(['admin']), async (req, res) => {
  const p = DB.posts.find(p => p.id === parseInt(req.params.postId));
  if (!p) return res.status(404).json({ error: '记录不存在' });
  const result = await fetchXHS(p.postUrl);
  if (result.success) {
    Object.assign(p, { views: result.views, likes: result.likes, collects: result.collects, comments: result.comments, fetchStatus: '已抓取', lastFetched: new Date().toISOString(), title: result.title || p.title });
    saveDB();
    res.json({ message: '抓取成功', data: result });
  } else {
    p.fetchStatus = '抓取失败';
    saveDB();
    res.status(500).json({ error: '抓取失败', detail: result.error });
  }
});

app.post('/api/fetch-all', auth(['admin']), async (req, res) => {
  const pending = DB.posts.filter(p => p.fetchStatus !== '抓取失败');
  res.json({ message: `开始抓取 ${pending.length} 条，请稍后刷新` });
  for (const p of pending) {
    const result = await fetchXHS(p.postUrl);
    if (result.success) {
      Object.assign(p, { views: result.views, likes: result.likes, collects: result.collects, comments: result.comments, fetchStatus: '已抓取', lastFetched: new Date().toISOString() });
    } else {
      p.fetchStatus = '抓取失败';
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  saveDB();
  console.log('✅ 批量抓取完成');
});

// ─── 薪资配置 ───────────────────────────────────────────────────────────────
app.get('/api/salary/configs', auth([]), (req, res) => {
  res.json(DB.salaryConfigs);
});

app.put('/api/salary/configs', auth(['admin']), (req, res) => {
  Object.assign(DB.salaryConfigs, req.body);
  saveDB();
  res.json({ message: '薪资配置已保存' });
});

// ─── 薪资计算 ───────────────────────────────────────────────────────────────
app.post('/api/salary/calculate', auth(['admin']), (req, res) => {
  const { yearMonth } = req.body;
  const configs = DB.salaryConfigs;
  const records = [];

  // 学生薪资 = 底薪 + 奖励
  DB.users.filter(u => u.role === 'student' && u.active).forEach(s => {
    const posts = DB.posts.filter(p => p.studentId === s.id && p.postDate?.startsWith(yearMonth));
    const postCount = posts.length;
    const cfg = configs.student || {};
    const rules = cfg.baseRules || [
      { min: 0, max: 2, amount: 20 },
      { min: 3, max: 5, amount: 25 },
      { min: 6, max: Infinity, amount: 30 }
    ];

    // 从salaryInputs获取手动填写的达标视频数，否则从视频数据计算
    const inputKey = `salaryInputs_${s.id}_${yearMonth}`;
    const milestoneCount = DB.salaryInputs?.[s.id]?.[yearMonth]?.milestoneCount;

    // 计算底薪和奖金
    const baseRule = rules.find(r => milestoneCount >= r.min && milestoneCount <= r.max) || rules[rules.length - 1];
    const base = milestoneCount * baseRule.amount;
    const bonus = milestoneCount * baseRule.amount; // 奖金也按底薪规则算

    const total = base + bonus;
    upsertSalary(s.id, yearMonth, 'student', { postCount, milestoneCount, baseRule: baseRule.amount, base, bonus, total });
    records.push({ role: '学生', name: s.realName, total });
  });

  // 老师薪资（按各自组内学生的总播放量计算）
  ['teacher_director', 'teacher_editor'].forEach(role => {
    const teachers = DB.users.filter(u => u.role === role && u.active);
    teachers.forEach(t => {
      const myGroups = DB.groups.filter(g => g.teacherId === t.id);
      const myStudents = DB.users.filter(u => myGroups.some(g => g.id === u.groupId) && u.role === 'student');
      const myPosts = DB.posts.filter(p => myStudents.some(s => s.id === p.studentId) && p.postDate?.startsWith(yearMonth));
      const postCount = myPosts.length;
      const totalViews = myPosts.reduce((sum, p) => sum + (p.views || 0), 0);
      const totalLikes = myPosts.reduce((sum, p) => sum + (p.likes || 0), 0);
      const cfg = configs[role] || {};
      const base = cfg.base || 0;
      const performance = (cfg.studentBonus ? myStudents.length * cfg.studentBonus : 0);
      const total = base + performance;
      upsertSalary(t.id, yearMonth, role, { postCount, totalViews, totalLikes, studentCount: myStudents.length, base, performance, total });
      const roleLabel = role === 'teacher_director' ? '编导老师' : '剪辑老师';
      records.push({ role: roleLabel, name: t.realName, total });
    });
  });

  saveDB();
  res.json({ message: `${yearMonth} 薪资计算完成`, records });
});

function upsertSalary(userId, yearMonth, role, data) {
  const idx = DB.salaryRecords.findIndex(r => r.userId === userId && r.yearMonth === yearMonth);
  const record = { userId, yearMonth, role, ...data, status: '待确认', calculatedAt: new Date().toISOString() };
  if (idx >= 0) DB.salaryRecords[idx] = record;
  else DB.salaryRecords.push(record);
}

app.get('/api/salary/records', auth([]), (req, res) => {
  let records = DB.salaryRecords.map(r => {
    const user = DB.users.find(u => u.id === r.userId);
    const group = user ? DB.groups.find(g => g.id === user.groupId) : null;
    return { ...r, userName: user?.realName, userSchool: user?.school, roleName: user?.role, groupName: group?.name };
  });
  if (req.user.role === 'student') records = records.filter(r => r.userId === req.user.id);
  else if (['teacher_director', 'teacher_editor'].includes(req.user.role)) {
    records = records.filter(r => {
      if (r.role === 'student') {
        const user = DB.users.find(u => u.id === r.userId);
        return user && user.groupId && DB.groups.find(g => g.id === user.groupId && g.teacherId === req.user.id);
      }
      return r.userId === req.user.id;
    });
  }
  records.sort((a, b) => (b.yearMonth || '').localeCompare(a.yearMonth || ''));
  res.json(records);
});

app.put('/api/salary/records/:id', auth(['admin']), (req, res) => {
  const r = DB.salaryRecords.find(r => r.id === parseInt(req.params.id));
  if (!r) return res.status(404).json({ error: '记录不存在' });
  Object.assign(r, req.body);
  saveDB();
  res.json({ message: '状态更新成功' });
});

// ─── 数据看板 ───────────────────────────────────────────────────────────────
app.get('/api/dashboard', auth([]), (req, res) => {
  const user = req.user;
  if (user.role === 'admin') {
    const allPosts = DB.posts;
    const totalPosts = allPosts.length;
    const totalViews = allPosts.reduce((s, p) => s + (p.views || 0), 0);
    const totalLikes = allPosts.reduce((s, p) => s + (p.likes || 0), 0);
    const thousandLike = allPosts.filter(p => (p.likes || 0) >= 1000).length;
    const tenThousandView = allPosts.filter(p => (p.views || 0) >= 10000).length;
    // 按组统计
    const byGroup = DB.groups.map(g => {
      const students = DB.users.filter(u => u.groupId === g.id && u.role === 'student');
      const posts = allPosts.filter(p => students.some(s => s.id === p.studentId));
      const teacher = DB.users.find(u => u.id === g.teacherId);
      return { groupId: g.id, groupName: g.name, teacherName: teacher?.realName, studentCount: students.length, postCount: posts.length, totalViews: posts.reduce((s, p) => s + (p.views || 0), 0), totalLikes: posts.reduce((s, p) => s + (p.likes || 0), 0) };
    });
    // 趋势数据（最近6个月按月统计）
    const months = getLastMonths(6);
    const trendData = months.map(m => ({
      month: m, postCount: allPosts.filter(p => p.postDate?.startsWith(m)).length,
      views: allPosts.filter(p => p.postDate?.startsWith(m)).reduce((s, p) => s + (p.views || 0), 0),
      likes: allPosts.filter(p => p.postDate?.startsWith(m)).reduce((s, p) => s + (p.likes || 0), 0)
    }));
    // 千赞万赞排名
    const studentRank = DB.users.filter(u => u.role === 'student' && u.active).map(s => {
      const sp = allPosts.filter(p => p.studentId === s.id);
      return { id: s.id, name: s.realName, school: s.school, groupName: DB.groups.find(g => g.id === s.groupId)?.name, totalPosts: sp.length, totalViews: sp.reduce((s2, p) => s2 + (p.views || 0), 0), totalLikes: sp.reduce((s2, p) => s2 + (p.likes || 0), 0), thousandLike: sp.filter(p => (p.likes || 0) >= 1000).length, tenThousandView: sp.filter(p => (p.views || 0) >= 10000).length };
    }).sort((a, b) => b.totalLikes - a.totalLikes);
    res.json({ teacherCount: DB.users.filter(u => ['teacher_director', 'teacher_editor'].includes(u.role) && u.active).length, studentCount: DB.users.filter(u => u.role === 'student' && u.active).length, accountCount: DB.accounts.filter(a => a.status === '使用中').length, totalPosts, totalViews, totalLikes, thousandLike, tenThousandView, byGroup, trendData, studentRank, pendingFetch: allPosts.filter(p => p.fetchStatus === '待抓取').length });
  } else if (user.role === 'student') {
    const myPosts = DB.posts.filter(p => p.studentId === user.id);
    const trendData = getLastMonths(6).map(m => ({ month: m, postCount: myPosts.filter(p => p.postDate?.startsWith(m)).length, views: myPosts.filter(p => p.postDate?.startsWith(m)).reduce((s, p) => s + (p.views || 0), 0), likes: myPosts.filter(p => p.postDate?.startsWith(m)).reduce((s, p) => s + (p.likes || 0), 0) }));
    const account = DB.accounts.find(a => a.assignedTo === user.id && a.status === '使用中');
    res.json({ myPosts: myPosts.length, totalViews: myPosts.reduce((s, p) => s + (p.views || 0), 0), totalLikes: myPosts.reduce((s, p) => s + (p.likes || 0), 0), thousandLike: myPosts.filter(p => (p.likes || 0) >= 1000).length, tenThousandView: myPosts.filter(p => (p.views || 0) >= 10000).length, accountName: account?.name, accountType: account?.type, trendData });
  } else {
    // 老师
    const myGroups = DB.groups.filter(g => g.teacherId === user.id);
    const myStudents = DB.users.filter(u => myGroups.some(g => g.id === u.groupId) && u.role === 'student');
    const myPosts = DB.posts.filter(p => myStudents.some(s => s.id === p.studentId));
    const trendData = getLastMonths(6).map(m => ({ month: m, postCount: myPosts.filter(p => p.postDate?.startsWith(m)).length, views: myPosts.filter(p => p.postDate?.startsWith(m)).reduce((s, p) => s + (p.views || 0), 0), likes: myPosts.filter(p => p.postDate?.startsWith(m)).reduce((s, p) => s + (p.likes || 0), 0) }));
    const studentRank = myStudents.map(s => { const sp = myPosts.filter(p => p.studentId === s.id); return { id: s.id, name: s.realName, school: s.school, totalPosts: sp.length, totalViews: sp.reduce((s2, p) => s2 + (p.views || 0), 0), totalLikes: sp.reduce((s2, p) => s2 + (p.likes || 0), 0), thousandLike: sp.filter(p => (p.likes || 0) >= 1000).length, tenThousandView: sp.filter(p => (p.views || 0) >= 10000).length }; }).sort((a, b) => b.totalLikes - a.totalLikes);
    res.json({ studentCount: myStudents.length, groupCount: myGroups.length, totalPosts: myPosts.length, totalViews: myPosts.reduce((s, p) => s + (p.views || 0), 0), totalLikes: myPosts.reduce((s, p) => s + (p.likes || 0), 0), thousandLike: myPosts.filter(p => (p.likes || 0) >= 1000).length, tenThousandView: myPosts.filter(p => (p.views || 0) >= 10000).length, trendData, studentRank, byGroup: myGroups.map(g => { const gp = myPosts.filter(p => myStudents.some(s => s.id === p.studentId && s.groupId === g.id)); return { groupId: g.id, groupName: g.name, postCount: gp.length, totalViews: gp.reduce((s, p) => s + (p.views || 0), 0) }; }) });
  }
});

function getLastMonths(n) {
  const result = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

// ─── 导出 ───────────────────────────────────────────────────────────────────
app.get('/api/export/posts', auth(['admin', 'teacher_director', 'teacher_editor']), (req, res) => {
  let posts = DB.posts.map(p => {
    const student = DB.users.find(u => u.id === p.studentId);
    const account = DB.accounts.find(a => a.id === p.accountId);
    const group = student ? DB.groups.find(g => g.id === student.groupId) : null;
    const platform = DB.platforms.find(pl => pl.id === account?.platform);
    return { 发布日期: p.postDate, 学生: student?.realName, 学校: student?.school, 所在组: group?.name, 平台: platform?.name, 账号类型: account?.type, 账号: account?.name, 视频标题: p.title, 播放量: p.views, 点赞量: p.likes, 收藏量: p.collects, 评论量: p.comments, 链接: p.postUrl };
  });
  if (['teacher_director', 'teacher_editor'].includes(req.user.role)) {
    posts = posts.filter(p => {
      const student = DB.users.find(u => u.realName === p.学生);
      return student && student.groupId && DB.groups.find(g => g.id === student.groupId && g.teacherId === req.user.id);
    });
  }
  const headers = Object.keys(posts[0] || {});
  const csv = ['\uFEFF' + headers.join(','), ...posts.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv;charset=utf-8');
  res.setHeader('Content-Disposition', `attachment;filename=posts_${Date.now()}.csv`);
  res.send(csv);
});

app.get('/api/export/salary', auth(['admin']), (req, res) => {
  const records = DB.salaryRecords.map(r => {
    const user = DB.users.find(u => u.id === r.userId);
    if (r.role === 'student') {
      return {
        月份: r.yearMonth, 姓名: user?.realName, 角色: '学生', 学校: user?.school,
        发片数: r.postCount, 千赞视频: r.thousandLikeCount || 0, 万赞视频: r.tenThousandLikeCount || 0,
        里程碑总数: r.milestoneCount || 0, 底薪单价: r.baseRule || 0,
        底薪: r.base || 0, 奖金: r.bonus || 0, 合计: r.total, 状态: r.status
      };
    }
    return { 月份: r.yearMonth, 姓名: user?.realName, 角色: r.roleName, 学校: user?.school, 发片数: r.postCount, 总播放量: r.totalViews, 总点赞: r.totalLikes, 保底: r.base, 绩效: r.performance, 合计: r.total, 状态: r.status };
  });
  const headers = Object.keys(records[0] || {});
  const csv = ['\uFEFF' + headers.join(','), ...records.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv;charset=utf-8');
  res.setHeader('Content-Disposition', `attachment;filename=salary_${Date.now()}.csv`);
  res.send(csv);
});

// ─── 定时抓取 ───────────────────────────────────────────────────────────────
cron.schedule('0 8 * * *', async () => {
  console.log('⏰ 定时抓取开始...');
  for (const p of DB.posts.filter(p => p.fetchStatus !== '抓取失败')) {
    const result = await fetchXHS(p.postUrl);
    if (result.success) Object.assign(p, { views: result.views, likes: result.likes, collects: result.collects, comments: result.comments, fetchStatus: '已抓取', lastFetched: new Date().toISOString() });
    else p.fetchStatus = '抓取失败';
    await new Promise(r => setTimeout(r, 3000));
  }
  saveDB();
  console.log('✅ 定时抓取完成');
}, { timezone: 'Asia/Shanghai' });

app.listen(PORT, () => { console.log(`🚀 服务已启动：http://localhost:${PORT}`); });
