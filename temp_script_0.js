
        // 全局错误捕获：任何未处理错误都会弹出提示
        window.onerror = function(msg, src, line, col, err) {
            console.error('[GLOBAL ERROR]', msg, 'at line', line, col, err);
            toast('系统错误: ' + msg + ' (行' + line + ')', 'error');
            return true; // 不显示浏览器默认错误
        };
        
        let supabase = null;
        let currentUser = null;
        let allVideos = [];
        let allAccounts = [];
        let allUsers = [];
        let allGroups = [];
        let allSalaryConfigs = [];
        let allSalaries = [];

        (async function init() {
            try {
                const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
                window._createClient = createClient;
            } catch (e) {
                console.error('Supabase SDK 加载失败:', e);
            }
            loadSettings();
            const savedUser = localStorage.getItem('campus_user');
            if (savedUser) {
                currentUser = JSON.parse(savedUser);
                document.getElementById('loginPage').style.display = 'none';
                document.getElementById('appPage').style.display = 'flex';
                document.getElementById('currentUser').textContent = '欢迎，' + (currentUser.real_name || currentUser.username);
                updateSidebarByRole();
                showPage(isAdmin() ? 'dashboard' : 'videos');
                loadAllData();
            }
            initDateFilters();
        })();

        function loadSettings() {
            const cfg = JSON.parse(localStorage.getItem('campus_cfg') || '{}');
            const projectId = cfg.projectId || 'eeuvrabunfvsaxgpaiub';
            const anonKey = cfg.anonKey || 'sb_publishable_fETyamK-jikojdIg9QwcJw__06jEb7A';
            initSupabase(projectId, anonKey);
        }

        function initSupabase(projectId, anonKey) {
            if (!window._createClient) return;
            supabase = window._createClient('https://' + projectId + '.supabase.co', anonKey);
            document.getElementById('cfgProjectId').value = projectId;
            document.getElementById('cfgAnonKey').value = anonKey;
        }

        function saveSettings() {
            const projectId = document.getElementById('cfgProjectId').value;
            const anonKey = document.getElementById('cfgAnonKey').value;
            localStorage.setItem('campus_cfg', JSON.stringify({ projectId, anonKey }));
            initSupabase(projectId, anonKey);
            toast('设置已保存', 'success');
        }

        // ============ Login ============
        async function doLogin() {
            const u = document.getElementById('loginUser').value.trim();
            const p = document.getElementById('loginPass').value;
            if (!u || !p) { toast('请输入姓名和密码', 'error'); return; }
            
            // 确保 Supabase SDK 已加载
            if (!window._createClient) {
                toast('正在加载系统...', 'error');
                // 等待 SDK 加载
                for (let i = 0; i < 50; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    if (window._createClient) break;
                }
                if (!window._createClient) {
                    toast('系统加载失败，请刷新页面重试', 'error');
                    return;
                }
                // 重新初始化 Supabase
                loadSettings();
            }
            
            // admin 管理员登录
            if (u === 'admin' && p === 'admin123') {
                currentUser = { username: u, role: 'admin' };
                localStorage.setItem('campus_user', JSON.stringify(currentUser));
                document.getElementById('loginPage').style.display = 'none';
                document.getElementById('appPage').style.display = 'flex';
                document.getElementById('currentUser').textContent = '欢迎，管理员';
                updateSidebarByRole();
                showPage('videos');
                loadAllData();
                return;
            }
            
            // 从数据库查找用户（按姓名匹配）
            try {
                const { data: users, error } = await supabase.from('users').select('*').eq('real_name', u);
                if (error) throw error;
                
                // 如果没找到，再试试 name 字段
                let user = users && users[0];
                if (!user) {
                    const { data: users2 } = await supabase.from('users').select('*').eq('name', u);
                    user = users2 && users2[0];
                }
                
                if (user && (p === '123456' || p === user.password)) {
                    const userName = user.real_name || user.name || u;
                    currentUser = { username: u, real_name: userName, role: user.role || 'student', id: user.id };
                    localStorage.setItem('campus_user', JSON.stringify(currentUser));
                    document.getElementById('loginPage').style.display = 'none';
                    document.getElementById('appPage').style.display = 'flex';
                    document.getElementById('currentUser').textContent = '欢迎，' + userName;
                    updateSidebarByRole();
                    showPage('videos');
                    loadAllData();
                } else {
                    toast('姓名或密码错误', 'error');
                }
            } catch (e) {
                toast('登录失败: ' + e.message, 'error');
            }
        }

        // 根据角色更新侧边栏显示
        function updateSidebarByRole() {
            const isAdminUser = currentUser && currentUser.role === 'admin';
            document.body.classList.toggle('is-admin', isAdminUser);
        }

        // 检查用户角色
        function isAdmin() {
            return currentUser && currentUser.role === 'admin';
        }

        // 获取当前用户角色（admin / teacher / student）
        function getUserRole() {
            return currentUser?.role || 'student';
        }

        // 获取当前用户的组别
        function getUserGroup() {
            if (!currentUser) return null;
            if (currentUser.role === 'admin') return null;
            // 从 allUsers 中查找当前用户的 group_name
            const user = allUsers.find(u => (u.real_name === currentUser.real_name || u.name === currentUser.real_name));
            return user?.group_name || null;
        }

        // 获取当前老师所带的学生列表
        function getMyStudents() {
            const group = getUserGroup();
            if (!group) return [];
            return allUsers.filter(u => u.role === 'student' && u.group_name === group);
        }

        // 判断当前用户是否可以查看某条视频
        // 获取当前用户的所有可能姓名
        function getCurrentUserNames() {
            if (!currentUser) return [];
            const names = new Set();
            if (currentUser.real_name) names.add(currentUser.real_name);
            if (currentUser.username) names.add(currentUser.username);
            return [...names];
        }

        // 获取某用户的所有可能姓名
        function getUserAllNames(user) {
            const names = new Set();
            if (user.real_name) names.add(user.real_name);
            if (user.name) names.add(user.name);
            if (user.username) names.add(user.username);
            return [...names];
        }

        // 获取视频的发布月份（YYYY-MM）
        function getVideoMonth(v) {
            let dateStr = v.post_date || v.created_at || '';
            if (!dateStr) return '';
            // 处理 2026/5/12 格式
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length >= 2) {
                    return `${parts[0]}-${parts[1].padStart(2, '0')}`;
                }
            }
            // 处理 ISO 格式 2026-05-12T10:30:00Z（转本地时区避免跨月问题）
            if (dateStr.length >= 7) {
                // 如果是完整ISO格式，转为本地日期再提取月份
                if (dateStr.includes('T')) {
                    const d = new Date(dateStr);
                    if (!isNaN(d.getTime())) {
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, '0');
                        return `${y}-${m}`;
                    }
                }
                return dateStr.substring(0, 7);
            }
            return '';
        }
        
        // 调试：打印视频日期字段的原始值
        function debugVideoDates() {
            console.log('=== 调试视频日期 ===');
            allVideos.forEach((v, i) => {
                console.log(`视频${i}: post_date=${v.post_date}, created_at=${v.created_at}, publisher=${v.publisher}`);
            });
        }

        function canViewVideo(v) {
            if (isAdmin()) return true;
            const myNames = getCurrentUserNames();
            const group = getUserGroup();
            if (currentUser?.role === 'student') {
                return myNames.includes(v.publisher);
            }
            if (currentUser?.role === 'teacher') {
                // 老师：看自己和所带学生的视频
                if (myNames.includes(v.publisher)) return true;
                // 检查是否是你带的学生
                const myStudents = getMyStudents();
                return myStudents.some(s => getUserAllNames(s).includes(v.publisher));
            }
            return myNames.includes(v.publisher);
        }

        // 判断当前用户是否可以编辑某条视频
        function canEditVideo(v) {
            if (isAdmin()) return true;
            const myNames = getCurrentUserNames();
            // 自己发的可以编辑
            if (myNames.includes(v.publisher)) return true;
            // 老师可以编辑所带学生的视频
            if (currentUser?.role === 'teacher') {
                const myStudents = getMyStudents();
                return myStudents.some(s => getUserAllNames(s).includes(v.publisher));
            }
            return false;
        }

        // 判断当前用户是否可以查看某个用户
        function canViewUser(u) {
            if (isAdmin()) return true;
            if (currentUser?.role === 'student') {
                // 学生只能看到老师
                return u.role === 'teacher';
            }
            if (currentUser?.role === 'teacher') {
                // 老师：看所有老师和同组学生
                if (u.role === 'teacher') return true;
                const group = getUserGroup();
                return u.role === 'student' && u.group_name === group;
            }
            return true;
        }

        // 判断当前用户是否可以查看某个账号
        function canViewAccount(a) {
            if (isAdmin()) return true;
            const group = getUserGroup();
            if (currentUser?.role === 'student') return true; // 学生可看账号列表
            if (currentUser?.role === 'teacher') {
                return !group || a.group_name === group;
            }
            return false;
        }

        // 获取当前用户可见的视频列表（用于展示和导出）
        function getMyVideos() {
            return allVideos.filter(v => canViewVideo(v));
        }

        // 获取当前用户可见的账号列表
        function getMyAccounts() {
            return allAccounts.filter(a => canViewAccount(a));
        }

        // 获取当前用户可见的用户列表
        function getMyUsers() {
            return allUsers.filter(u => canViewUser(u));
        }

        // ============ 修改密码 ============
        function initPasswordPage() {
            const info = document.getElementById('passwordInfo');
            if (!info) return;
            if (isAdmin()) {
                info.textContent = '⚠️ 管理员账号不支持修改密码（使用固定密码 admin123）';
            } else {
                info.textContent = `当前用户：${currentUser?.real_name || currentUser?.username || '未知'}（默认密码：123456）`;
            }
            resetPasswordForm();
        }

        function resetPasswordForm() {
            document.getElementById('pwdCurrent').value = '';
            document.getElementById('pwdNew').value = '';
            document.getElementById('pwdConfirm').value = '';
        }

        async function changePassword() {
            if (isAdmin()) {
                toast('管理员账号不支持修改密码', 'error');
                return;
            }
            const currentPwd = document.getElementById('pwdCurrent').value;
            const newPwd = document.getElementById('pwdNew').value;
            const confirmPwd = document.getElementById('pwdConfirm').value;

            if (!currentPwd) { toast('请输入当前密码', 'error'); return; }
            if (!newPwd) { toast('请输入新密码', 'error'); return; }
            if (newPwd.length < 6) { toast('新密码至少6位', 'error'); return; }
            if (newPwd !== confirmPwd) { toast('两次输入的新密码不一致', 'error'); return; }

            try {
                // 验证当前密码（默认密码123456）
                if (currentPwd !== '123456') {
                    toast('当前密码错误', 'error');
                    return;
                }

                // 更新数据库中的密码
                const userId = currentUser?.id;
                if (!userId) {
                    toast('用户信息不完整，请重新登录', 'error');
                    return;
                }

                const { data, error } = await supabase.from('users').update({ password: newPwd }).eq('id', userId);
                if (error) throw error;

                toast('密码修改成功！', 'success');
                resetPasswordForm();
            } catch (e) {
                toast('修改失败: ' + e.message, 'error');
            }
        }

        function logout() {
            localStorage.removeItem('campus_user');
            location.reload();
        }

        // ============ Page Navigation ============
        function showPage(page) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById('page-' + page).classList.add('active');
            document.querySelectorAll('.nav-item').forEach(n => {
                n.classList.remove('active');
                if (n.getAttribute('onclick')?.includes(page)) n.classList.add('active');
            });
            if (page === 'dashboard') {
                // 等待数据加载完成后再渲染看板
                loadAllData().then(() => updateDashboard());
            }
            if (page === 'videos') loadVideos();
            if (page === 'accounts') loadAccounts();
            if (page === 'users') loadUsers();
            if (page === 'groups') { loadUsers(); loadGroups(); }
            if (page === 'salaryConfig') loadSalaryConfigs();
            if (page === 'salary') { initSalaryMonth(); loadSalaryData(); }
            if (page === 'password') initPasswordPage();
        }

        // ============ Toast ============
        function toast(msg, type = 'success') {
            const t = document.getElementById('toast');
            t.textContent = msg;
            t.className = 'toast ' + type;
            t.style.display = 'block';
            setTimeout(() => t.style.display = 'none', 3000);
        }

        // ============ Modal ============
        function closeModal(id) { document.getElementById(id).classList.remove('show'); }

        // ============ Date Filters ============
        function initDateFilters() {
            const today = new Date();
            document.getElementById('filterDateEnd').value = today.toISOString().slice(0, 10);
            const weekAgo = new Date(today - 7 * 24 * 60 * 60 * 1000);
            document.getElementById('filterDateStart').value = weekAgo.toISOString().slice(0, 10);
        }

        function setDateRange(type) {
            const today = new Date();
            let start = '', end = '';
            if (type === 'today') {
                start = today.toISOString().slice(0, 10);
                end = start;
            } else if (type === 'week') {
                const d = new Date(today);
                d.setDate(d.getDate() - d.getDay());
                start = d.toISOString().slice(0, 10);
                end = today.toISOString().slice(0, 10);
            } else if (type === 'month') {
                const d = new Date(today.getFullYear(), today.getMonth(), 1);
                start = d.toISOString().slice(0, 10);
                end = today.toISOString().slice(0, 10);
            }
            // 设置数据看板的日期筛选器
            document.getElementById('filterDateStart').value = start;
            document.getElementById('filterDateEnd').value = end;
            // 同时设置视频记录页面的日期筛选器（保持联动）
            const videoStartInput = document.getElementById('page-videos').querySelector('#filterDateStart');
            const videoEndInput = document.getElementById('page-videos').querySelector('#filterDateEnd');
            if (videoStartInput) videoStartInput.value = start;
            if (videoEndInput) videoEndInput.value = end;
            // 刷新数据看板
            updateDashboard();
        }

        function getFilteredVideos() {
            const start = document.getElementById('filterDateStart').value;
            const end = document.getElementById('filterDateEnd').value;
            const group = document.getElementById('filterGroup')?.value;
            return allVideos.filter(v => {
                const date = v.created_at?.slice(0, 10);
                if (start && date < start) return false;
                if (end && date > end) return false;
                // 组别筛选
                if (group) {
                    const videoGroup = getVideoGroupForFilter(v);
                    if (videoGroup !== group) return false;
                }
                return true;
            });
        }

        // ============ Load All Data ============
        async function loadAllData() {
            // 先加载用户，再并行加载其他数据
            await loadUsers();
            await Promise.all([loadVideos(), loadAccounts(), loadGroups(), loadSalaryConfigs(), loadSalaries()]);
            // 加载完成后刷新导出预览
            loadExportPreview();
        }

        // ============ Videos ============
        async function loadVideos() {
            try {
                let query = supabase.from('videos').select('*').order('created_at', { ascending: false });
                const platform = document.getElementById('filterPlatform')?.value;
                const status = document.getElementById('filterStatus')?.value;
                const keyword = document.getElementById('searchKeyword')?.value.trim();
                const dateStart = document.getElementById('filterDateStart')?.value;
                const dateEnd = document.getElementById('filterDateEnd')?.value;
                
                if (platform) query = query.eq('platform', platform);
                if (status) query = query.eq('status', status);
                if (keyword) query = query.or(`account_name.ilike.%${keyword}%,publisher.ilike.%${keyword}%`);
                
                const { data, error } = await query;
                if (error) throw error;
                let filteredVideos = data || [];
                
                // 日期筛选（客户端筛选）
                if (dateStart) {
                    filteredVideos = filteredVideos.filter(v => v.created_at?.slice(0, 10) >= dateStart);
                }
                if (dateEnd) {
                    filteredVideos = filteredVideos.filter(v => v.created_at?.slice(0, 10) <= dateEnd);
                }
                
                // 根据角色过滤可见视频
                allVideos = filteredVideos.filter(v => canViewVideo(v));
                
                renderVideoTable();
                updateTeacherSelect();
                updateStudentVideoStats();
            } catch (e) { console.error(e); toast('加载视频失败', 'error'); }
        }
        
        // 视频记录日期筛选变化时调用
        function onVideoFilterChange() {
            loadVideos();
            // 同时更新数据看板的日期筛选器（保持同步）
            syncDateFilterToDashboard();
            // 如果当前在数据看板页面，也更新看板数据
            if (document.getElementById('page-dashboard')?.classList.contains('active')) {
                updateDashboard();
            }
        }
        
        // 同步视频记录的日期筛选到数据看板
        function syncDateFilterToDashboard() {
            const videoStart = document.getElementById('filterDateStart')?.value;
            const videoEnd = document.getElementById('filterDateEnd')?.value;
            if (document.getElementById('filterDateStart')) {
                document.getElementById('filterDateStart').value = videoStart || '';
            }
            if (document.getElementById('filterDateEnd')) {
                document.getElementById('filterDateEnd').value = videoEnd || '';
            }
        }
        
        // 设置视频记录的日期范围
        function setVideoDateRange(range) {
            const today = new Date();
            let start = '', end = '';
            if (range === 'today') {
                start = today.toISOString().slice(0, 10);
                end = start;
            } else if (range === 'week') {
                const weekAgo = new Date(today - 7 * 24 * 60 * 60 * 1000);
                start = weekAgo.toISOString().slice(0, 10);
                end = today.toISOString().slice(0, 10);
            } else if (range === 'month') {
                const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                start = monthStart.toISOString().slice(0, 10);
                end = today.toISOString().slice(0, 10);
            }
            // 同时设置视频记录页面和数据看板页面的日期筛选器
            document.getElementById('filterDateStart').value = start;
            document.getElementById('filterDateEnd').value = end;
            onVideoFilterChange();
        }

        // 计算视频发布后第N天的日期（修复时区问题：使用本地时间解析）
        function getDayDate(publishDate, dayN) {
            if (!publishDate) return null;
            // 解析 YYYY-MM-DD 为本地时间午夜（避免UTC偏移问题）
            const parts = publishDate.split('-').map(Number);
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            d.setDate(d.getDate() + dayN);
            return d;
        }

        // 判断是否应该填写第N天数据（今天是否到达或超过第N天）
        function shouldFillDayN(publishDate, dayN) {
            if (!publishDate) return false;
            const dayDate = getDayDate(publishDate, dayN);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return today >= dayDate;
        }

        // 判断第N天数据是否已填写
        function isDayNFilled(v, dayN) {
            if (dayN === 3) return v.views_day3 !== null && v.views_day3 !== undefined;
            if (dayN === 7) return v.views_day7 !== null && v.views_day7 !== undefined;
            return false;
        }

        // 获取提醒状态：是否需要填写第3天或第7天数据
        function getStatsReminder(v) {
            const publishDate = v.created_at?.slice(0, 10);
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            
            if (!publishDate) return { needDay3: false, needDay7: false };
            
            const day3Date = getDayDate(publishDate, 3);
            const day7Date = getDayDate(publishDate, 7);
            
            const needDay3 = now >= day3Date && !isDayNFilled(v, 3);
            const needDay7 = now >= day7Date && !isDayNFilled(v, 7);
            
            return { needDay3, needDay7 };
        }

        // 格式化统计数据显示（播放量+点赞数）
        function formatStatsCell(views, likes, isEmpty, fillStatus) {
            if (isEmpty) {
                return `<span class="stats-pending" title="${fillStatus}">待填写</span>`;
            }
            return `<div class="stats-cell">
                <span class="stat-item">播:${views || 0}</span>
                <span class="stat-item">赞:${likes || 0}</span>
            </div>`;
        }

        // 计算数据达标状态（万赞优先，同链接只算一次）
        function getDataStandardStatus(v) {
            const likes = [v.likes_day3, v.likes_day7, v.likes_month_end, v.likes].filter(l => l != null && l !== '');
            // 检查是否有万赞（≥10000）
            const hasWanZan = likes.some(l => parseInt(l) >= 10000);
            // 检查是否有千赞（≥1000但<10000）
            const hasQianZan = likes.some(l => parseInt(l) >= 1000 && parseInt(l) < 10000);
            if (hasWanZan) return { status: '万赞', class: 'badge-danger', style: 'background:#ef4444;color:#fff' };
            if (hasQianZan) return { status: '千赞', class: 'badge-warning', style: 'background:#f59e0b;color:#fff' };
            return { status: '-', class: '', style: '' };
        }

        function renderVideoTable() {
            const tbody = document.getElementById('videoTable');
            if (!tbody) return;
            if (allVideos.length === 0) { tbody.innerHTML = '<tr><td colspan="12" class="empty-state">暂无数据</td></tr>'; return; }
            tbody.innerHTML = allVideos.map(v => {
                const statusClass = v.status === '爆款' ? 'badge-danger' : v.status === '已发布' ? 'badge-success' : v.status === '失败' ? 'badge-warning' : 'badge-purple';
                const canEdit = canEditVideo(v);
                const reminder = getStatsReminder(v);
                const publishDate = v.created_at?.slice(0, 10);
                const day3Filled = isDayNFilled(v, 3);
                const day7Filled = isDayNFilled(v, 7);
                const day3Date = publishDate ? getDayDate(publishDate, 3).toLocaleDateString('zh-CN', {month:'numeric',day:'numeric'}) : '-';
                const day7Date = publishDate ? getDayDate(publishDate, 7).toLocaleDateString('zh-CN', {month:'numeric',day:'numeric'}) : '-';
                const standardStatus = getDataStandardStatus(v);
                
                return `<tr class="${reminder.needDay3 || reminder.needDay7 ? 'row-reminder' : ''}">
                    <td>${v.created_at ? new Date(v.created_at).toLocaleDateString('zh-CN') : '-'}</td>
                    <td>${v.platform || '-'}</td>
                    <td>${v.account_name || '-'}</td>
                    <td>${v.publisher || '-'}</td>
                    <td>${v.group_name || '-'}</td>
                    <td>${v.video_link ? `<a href="${v.video_link}" target="_blank" class="link">查看</a>` : '-'}</td>
                    <td class="${reminder.needDay3 ? 'cell-reminder' : ''}" title="${day3Date} (发布后第3天)">
                        ${formatStatsCell(v.views_day3, v.likes_day3, !day3Filled, '第3天')}
                    </td>
                    <td class="${reminder.needDay7 ? 'cell-reminder-day7' : ''}" title="${day7Date} (发布后第7天)">
                        ${formatStatsCell(v.views_day7, v.likes_day7, !day7Filled, '第7天')}
                    </td>
                    <td>${formatStatsCell(v.views_month_end, v.likes_month_end, v.views_month_end == null, '月中/末')}</td>
                    <td><span class="badge" style="${standardStatus.style}">${standardStatus.status}</span></td>
                    <td><span class="badge ${statusClass}">${v.status || '待发布'}</span></td>
                    <td>${canEdit ? `<button class="btn btn-sm btn-secondary" onclick="editVideo('${String(v.id).replace(/'/g,"\\'")}')">编辑</button><button class="btn btn-sm btn-danger" onclick="if(confirm('确认删除？'))deleteVideo('${String(v.id).replace(/'/g,"\\'")}')">删除</button>` : '-'}</td>
                </tr>`;
            }).join('');
        }

        function updateTeacherSelect() {
            const select = document.getElementById('filterTeacher');
            if (!select) return;
            const teachers = allUsers.filter(u => u.role === 'teacher');
            select.innerHTML = '<option value="">全部老师</option>' + teachers.map(t => `<option value="${t.real_name || t.name}">${t.real_name || t.name}</option>`).join('');
        }

        function updateStudentVideoStats() {
            const studentStats = document.getElementById('studentVideoStats');
            if (!studentStats) return;
            
            if (!isAdmin()) {
                studentStats.style.display = 'block';
                // 老师：统计所带学生的视频；学生：只统计自己的视频
                let myVideos;
                if (currentUser?.role === 'teacher') {
                    const myStudents = getMyStudents();
                    const studentNames = new Set();
                    myStudents.forEach(s => getUserAllNames(s).forEach(n => studentNames.add(n)));
                    myVideos = allVideos.filter(v => studentNames.has(v.publisher));
                } else {
                    const myNames = getCurrentUserNames();
                    myVideos = allVideos.filter(v => myNames.includes(v.publisher));
                }
                const videoCount = myVideos.length;
                // 使用统一的数据达标计算（同链接只算一次，万赞优先）
                let thousandCount = 0;
                let tenThousandCount = 0;
                const countedLinks = new Set(); // 按视频链接去重
                myVideos.forEach(v => {
                    const link = v.video_link || v.id; // 用链接或ID作为唯一标识
                    if (countedLinks.has(link)) return; // 同一链接只算一次
                    const status = getDataStandardStatus(v);
                    if (status.status === '万赞') { tenThousandCount++; countedLinks.add(link); }
                    else if (status.status === '千赞') { thousandCount++; countedLinks.add(link); }
                });
                
                document.getElementById('myVideoCount').textContent = videoCount;
                document.getElementById('myThousandLike').textContent = thousandCount;
                document.getElementById('myTenThousandLike').textContent = tenThousandCount;
                
                // 老师视角：更新卡片标签为"组内"前缀
                const isTeacher = currentUser?.role === 'teacher';
                const labels = studentStats.querySelectorAll('.stat-label');
                if (labels.length >= 3) {
                    labels[0].textContent = isTeacher ? '组内发片数' : '我的发片数';
                    labels[1].textContent = isTeacher ? '组内千赞数' : '我的千赞数';
                    labels[2].textContent = isTeacher ? '组内万赞数' : '我的万赞数';
                }
                
                // 计算薪资并展示
                updateMySalaryDisplay(videoCount, thousandCount, tenThousandCount);
                
                // 更新待填写数据提醒
                const reminderBar = document.getElementById('statsReminder');
                const reminderText = document.getElementById('reminderText');
                if (reminderBar && reminderText) {
                    const pendingDay3 = myVideos.filter(v => shouldFillDayN(v.created_at, 3) && !isDayNFilled(v, 3)).length;
                    const pendingDay7 = myVideos.filter(v => shouldFillDayN(v.created_at, 7) && !isDayNFilled(v, 7)).length;
                    
                    const parts = [];
                    if (pendingDay3 > 0) parts.push(`有 <b>${pendingDay3}</b> 个视频待填写第3天数据`);
                    if (pendingDay7 > 0) parts.push(`有 <b>${pendingDay7}</b> 个视频待填写第7天数据`);
                    
                    if (parts.length > 0) {
                        reminderBar.style.display = 'flex';
                        reminderText.innerHTML = parts.join('，') + '，请及时补充！';
                    } else {
                        reminderBar.style.display = 'none';
                    }
                }
            } else {
                studentStats.style.display = 'none';
            }
        }

        // 更新我的薪资展示
        function updateMySalaryDisplay(videoCount, thousandCount, tenThousandCount) {
            const salaryCard = document.getElementById('mySalaryCard');
            const salaryDetail = document.getElementById('mySalaryDetail');
            const salaryResult = document.getElementById('mySalaryResult');
            if (!salaryCard || !salaryDetail || !salaryResult) return;
            
            const isTeacher = currentUser?.role === 'teacher';
            salaryCard.style.display = 'block';
            
            if (isTeacher) {
                // 老师：显示带教奖金
                const group = getUserGroup();
                const now = new Date();
                const month = now.toISOString().slice(0, 7); // 当前月份 YYYY-MM
                const bonusInfo = calcTeacherBonus(group, month);
                
                let detailHTML = '';
                detailHTML += `<div style="margin-bottom:8px"><b>📊 组内数据：</b></div>`;
                detailHTML += `<div style="padding-left:16px;color:var(--gray-600);font-size:13px;">`;
                detailHTML += `组内发片总数：${bonusInfo.groupVideoCount} 条<br>`;
                detailHTML += `学生奖金总和：¥${bonusInfo.studentBonus}<br>`;
                detailHTML += `达标条件：组内发片 ≥ 12 条 → ${bonusInfo.qualified ? '<span style="color:var(--success)">✅ 已达标</span>' : '<span style="color:var(--danger)">❌ 未达标</span>'}`;
                detailHTML += `</div>`;
                
                detailHTML += `<div style="margin-top:12px;margin-bottom:8px"><b>🏆 带教奖金计算：</b></div>`;
                detailHTML += `<div style="padding-left:16px;color:var(--gray-600);font-size:13px;">`;
                detailHTML += `带教奖金 = 学生奖金总和 × 带教比例<br>`;
                if (bonusInfo.qualified) {
                    detailHTML += `= ¥${bonusInfo.studentBonus} × ${(getSalaryConfig('teacher').ten_thousand_bonus || 50)}% = <b>¥${bonusInfo.total}</b>`;
                } else {
                    detailHTML += `组内发片未达12条，暂不带教奖金`;
                }
                detailHTML += `</div>`;
                
                salaryDetail.innerHTML = detailHTML;
                if (bonusInfo.qualified) {
                    salaryResult.innerHTML = `💰 本月预计带教奖金：<span style="font-size:24px">¥${bonusInfo.total}</span>`;
                } else {
                    salaryResult.innerHTML = `💰 本月预计带教奖金：<span style="font-size:24px">¥0</span>　（组内发片未达12条）`;
                }
            } else {
                // 学生：显示底薪+奖金
                const config = getSalaryConfig('student');
                const qualifiedCount = thousandCount + tenThousandCount;
                const tier1Min = config.tier1_min ?? 0;
                const tier1Max = config.tier1_max ?? 2;
                const tier1Salary = config.tier1_salary ?? 20;
                const tier2Min = config.tier2_min ?? 3;
                const tier2Max = config.tier2_max ?? 5;
                const tier2Salary = config.tier2_salary ?? 25;
                const tier3Min = config.tier3_min ?? 6;
                const tier3Salary = config.tier3_salary ?? 30;
                
                let unitPrice;
                if (qualifiedCount >= tier3Min) {
                    unitPrice = tier3Salary;
                } else if (qualifiedCount >= tier2Min && qualifiedCount <= tier2Max) {
                    unitPrice = tier2Salary;
                } else {
                    unitPrice = tier1Salary;
                }
                const baseSalary = unitPrice * videoCount;
                
                const thousandBonus = thousandCount * (config.thousand_bonus || 80);
                const tenThousandBonus = tenThousandCount * (config.ten_thousand_bonus || 120);
                const totalBonus = thousandBonus + tenThousandBonus;
                const total = baseSalary + totalBonus;
                
                let detailHTML = '';
                detailHTML += `<div style="margin-bottom:8px"><b>📊 底薪计算：</b></div>`;
                detailHTML += `<div style="padding-left:16px;color:var(--gray-600);font-size:13px;">`;
                if (videoCount <= 2) {
                    detailHTML += `发片数 ${videoCount} 条（0-2条档）→ 单价 20元/条<br>`;
                } else if (videoCount <= 5) {
                    detailHTML += `发片数 ${videoCount} 条（3-5条档）→ 单价 25元/条<br>`;
                } else {
                    detailHTML += `发片数 ${videoCount} 条（>5条档）→ 单价 30元/条<br>`;
                }
                detailHTML += `底薪 = ${unitPrice} × ${videoCount} = <b>${baseSalary}元</b>`;
                detailHTML += `</div>`;
                
                detailHTML += `<div style="margin-top:12px;margin-bottom:8px"><b>🏆 奖金计算：</b></div>`;
                detailHTML += `<div style="padding-left:16px;color:var(--gray-600);font-size:13px;">`;
                detailHTML += `千赞数 ${thousandCount} 条 × 80元 = ${thousandBonus}元<br>`;
                detailHTML += `万赞数 ${tenThousandCount} 条 × 120元 = ${tenThousandBonus}元<br>`;
                detailHTML += `奖金合计 = <b>${totalBonus}元</b>`;
                detailHTML += `</div>`;
                
                salaryDetail.innerHTML = detailHTML;
                salaryResult.innerHTML = `💰 本月预计薪资：<span style="font-size:24px">¥${total}</span>　（底薪¥${baseSalary} + 奖金¥${totalBonus}）`;
            }
        }

        function openVideoModal(id = null) {
            try {
                console.log('[DEBUG] openVideoModal called, id=', id);
                const el = (id2) => document.getElementById(id2);
                
                const vid = el('videoId'); if (vid) vid.value = id || '';
                const vtitle = el('videoModalTitle'); if (vtitle) vtitle.textContent = id ? '编辑视频记录' : '添加视频记录';
                
                // 清空第3天数据
                const v3d = el('videoViewsDay3'); if (v3d) v3d.value = '';
                const l3d = el('videoLikesDay3'); if (l3d) l3d.value = '';
                const f3d = el('videoScreenshotDay3'); if (f3d) f3d.value = '';
                // 清空第7天数据
                const v7d = el('videoViewsDay7'); if (v7d) v7d.value = '';
                const l7d = el('videoLikesDay7'); if (l7d) l7d.value = '';
                const f7d = el('videoScreenshotDay7'); if (f7d) f7d.value = '';
                // 清空月终数据
                const vme = el('videoViewsMonthEnd'); if (vme) vme.value = '';
                const lme = el('videoLikesMonthEnd'); if (lme) lme.value = '';
                const fme = el('videoScreenshotMonthEnd'); if (fme) fme.value = '';
                // 清空提示
                const d3h = el('day3Hint'); if (d3h) d3h.textContent = '';
                const d7h = el('day7Hint'); if (d7h) d7h.textContent = '';
                
                if (!id) {
                    const vt = el('videoTime'); if (vt) vt.value = new Date().toISOString().slice(0, 16);
                    const vp = el('videoPlatform'); if (vp) vp.value = '抖音';
                    const vs = el('videoStatus'); if (vs) vs.value = '待发布';
                    const vl = el('videoLink'); if (vl) vl.value = '';
                    const vpub = el('videoPublisher'); 
                    if (vpub) {
                        if (!isAdmin() && currentUser && currentUser.real_name) {
                            vpub.value = currentUser.real_name;
                        } else {
                            vpub.value = '';
                        }
                    }
                    const va = el('videoAccount'); if (va) va.value = '';
                    const vg = el('videoGroup'); if (vg) vg.value = '';
                } else {
                    const video = allVideos.find(v => v.id === id);
                    if (video) {
                        el('videoViewsDay3').value = video.views_day3 ?? '';
                        el('videoLikesDay3').value = video.likes_day3 ?? '';
                        el('videoViewsDay7').value = video.views_day7 ?? '';
                        el('videoLikesDay7').value = video.likes_day7 ?? '';
                        el('videoViewsMonthEnd').value = video.views_month_end ?? '';
                        el('videoLikesMonthEnd').value = video.likes_month_end ?? '';
                        if (video.created_at) {
                            const today = new Date(); today.setHours(0,0,0,0);
                            const day3Date = getDayDate(video.created_at, 3);
                            const day7Date = getDayDate(video.created_at, 7);
                            if (today >= day3Date) {
                                el('day3Hint').textContent = (video.views_day3 !== null && video.views_day3 !== undefined) ? '✓ 已填写' : '⚠️ 待填写';
                            }
                            if (today >= day7Date) {
                                el('day7Hint').textContent = (video.views_day7 !== null && video.views_day7 !== undefined) ? '✓ 已填写' : '⚠️ 待填写';
                            }
                        }
                    }
                }
                updateVideoAccountSelect();
                updateVideoGroupSelect();
                el('videoModal').classList.add('show');
                console.log('[DEBUG] modal shown successfully');
            } catch(e) {
                console.error('[ERROR] openVideoModal failed:', e);
                toast('打开弹窗失败: ' + e.message, 'error');
            }
        }

        function updateVideoAccountSelect() {
            const select = document.getElementById('videoAccount');
            if (!select) return;
            select.innerHTML = allAccounts.map(a => `<option value="${a.account_name}">${a.platform} - ${a.account_name}</option>`).join('');
        }
        
        function updateVideoGroupSelect() {
            const select = document.getElementById('videoGroup');
            if (!select) return;
            // 从 users 和 accounts 合并去重的组别
            const userGroups = allUsers.map(u => u.group_name).filter(Boolean);
            const accountGroups = allAccounts.map(a => a.group_name).filter(Boolean);
            const groups = [...new Set([...userGroups, ...accountGroups])];
            select.innerHTML = '<option value="">-- 请选择组别 --</option>' + 
                groups.map(g => `<option value="${g}">${g}</option>`).join('');
        }

        async function editVideo(id) {
            try {
                console.log('[DEBUG] editVideo called, id=', id);
                let v = allVideos.find(x => x.id == id);
                if (!v) {
                    try {
                        const { data } = await supabase.from('videos').select('*').eq('id', id).single();
                        v = data;
                    } catch(e) { console.error(e); }
                }
                if (!v) { toast('未找到该记录', 'error'); return; }
                const el = (eid) => document.getElementById(eid);
                const e_vid = el('videoId'); if (e_vid) e_vid.value = id;
                const e_title = el('videoModalTitle'); if (e_title) e_title.textContent = '编辑视频记录';
                const e_plat = el('videoPlatform'); if (e_plat) e_plat.value = v.platform || '抖音';
                updateVideoAccountSelect();
                const e_acct = el('videoAccount'); if (e_acct) e_acct.value = v.account_name || '';
                const e_time = el('videoTime'); if (e_time) e_time.value = v.created_at ? new Date(v.created_at).toISOString().slice(0, 16) : '';
                const e_status = el('videoStatus'); if (e_status) e_status.value = v.status || '待发布';
                const e_link = el('videoLink'); if (e_link) e_link.value = v.video_link || '';
                const e_pub = el('videoPublisher'); if (e_pub) e_pub.value = v.publisher || '';
                const e_v3 = el('videoViewsDay3'); if (e_v3) e_v3.value = v.views_day3 ?? '';
                const e_l3 = el('videoLikesDay3'); if (e_l3) e_l3.value = v.likes_day3 ?? '';
                const e_v7 = el('videoViewsDay7'); if (e_v7) e_v7.value = v.views_day7 ?? '';
                const e_l7 = el('videoLikesDay7'); if (e_l7) e_l7.value = v.likes_day7 ?? '';
                const e_vme = el('videoViewsMonthEnd'); if (e_vme) e_vme.value = v.views_month_end ?? '';
                const e_lme = el('videoLikesMonthEnd'); if (e_lme) e_lme.value = v.likes_month_end ?? '';
                const e_d3 = el('day3Hint'); if (e_d3) e_d3.textContent = '';
                const e_d7 = el('day7Hint'); if (e_d7) e_d7.textContent = '';
                if (v.created_at) {
                    const today = new Date(); today.setHours(0,0,0,0);
                    const day3Date = getDayDate(v.created_at, 3);
                    const day7Date = getDayDate(v.created_at, 7);
                    if (today >= day3Date) { const e_d3h = el('day3Hint'); if (e_d3h) e_d3h.textContent = (v.views_day3 !== null && v.views_day3 !== undefined) ? '✓ 已填写' : '⚠️ 待填写'; }
                    if (today >= day7Date) { const e_d7h = el('day7Hint'); if (e_d7h) e_d7h.textContent = (v.views_day7 !== null && v.views_day7 !== undefined) ? '✓ 已填写' : '⚠️ 待填写'; }
                }
                updateVideoGroupSelect();
                const e_grp = el('videoGroup'); if (e_grp) e_grp.value = v.group_name || '';
                el('videoModal').classList.add('show');
                console.log('[DEBUG] editVideo modal shown successfully');
            } catch(e) {
                console.error('[ERROR] editVideo failed:', e);
                toast('打开编辑失败: ' + e.message, 'error');
            }
        }

        async function saveVideo() {
            const getEl = (id) => document.getElementById(id);
            const id = getEl('videoId') ? getEl('videoId').value : '';
            const now = new Date().toISOString();
            const getVal = (id) => {
                const el = getEl(id);
                return el ? parseInt(el.value) || null : null;
            };
            const getText = (id) => {
                const el = getEl(id);
                return el ? el.value : '';
            };
            
            const videoLink = getText('videoLink');
            const publisher = getText('videoPublisher');
            
            // 新增时检测重复链接
            if (!id && videoLink) {
                const existing = allVideos.find(v => v.video_link === videoLink && v.publisher === publisher);
                if (existing) {
                    toast('该链接已存在（发布者：' + publisher + '）', 'error');
                    return;
                }
            }
            
            const data = {
                platform: getText('videoPlatform'),
                account_name: getText('videoAccount'),
                status: getText('videoStatus'),
                video_link: videoLink,
                publisher: publisher,
                group_name: getText('videoGroup'),
                created_at: getText('videoTime') || now,
                // 第3天数据
                views_day3: getVal('videoViewsDay3'),
                likes_day3: getVal('videoLikesDay3'),
                // 第7天数据
                views_day7: getVal('videoViewsDay7'),
                likes_day7: getVal('videoLikesDay7'),
                // 月中/末数据
                views_month_end: getVal('videoViewsMonthEnd'),
                likes_month_end: getVal('videoLikesMonthEnd'),
            };
            // 填写时自动记录时间
            if (data.views_day3 !== null && data.views_day3 !== undefined) data.stats_day3_at = now;
            if (data.views_day7 !== null && data.views_day7 !== undefined) data.stats_day7_at = now;
            
            try {
                if (id) {
                    const { error } = await supabase.from('videos').update(data).eq('id', id);
                    if (error) throw error;
                    toast('更新成功');
                } else {
                    const { error } = await supabase.from('videos').insert(data);
                    if (error) throw error;
                    toast('添加成功');
                }
                closeModal('videoModal');
                loadVideos();
            } catch (e) { toast('保存失败: ' + e.message, 'error'); }
        }

        async function deleteVideo(id) {
            if (!confirm('确定要删除吗？')) return;
            try {
                const { error } = await supabase.from('videos').delete().eq('id', id);
                if (error) throw error;
                toast('删除成功');
                loadVideos();
            } catch (e) { toast('删除失败', 'error'); }
        }

        // ============ Accounts ============
        async function loadAccounts() {
            try {
                const { data, error } = await supabase.from('accounts').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                allAccounts = (data || []).filter(a => canViewAccount(a));
                renderAccountTable();
            } catch (e) { console.error(e); }
        }

        function renderAccountTable() {
            const tbody = document.getElementById('accountTable');
            if (!tbody) return;
            if (allAccounts.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无数据</td></tr>'; return; }
            tbody.innerHTML = allAccounts.map(a => `<tr>
                <td>${a.platform || '-'}</td>
                <td>${a.account_name || '-'}</td>
                <td>${a.owner || '-'}</td>
                <td>${a.group_name || '-'}</td>
                <td><span class="badge ${a.active ? 'badge-success' : 'badge-danger'}">${a.active ? '正常' : '停用'}</span></td>
                <td><button class="btn btn-sm btn-secondary" onclick="editAccount(${a.id})">编辑</button><button class="btn btn-sm btn-danger" onclick="deleteAccount(${a.id})">删除</button></td>
            </tr>`).join('');
        }

        function updateAccountSelects() {
            const ownerSelect = document.getElementById('accountOwner');
            const currentOwner = ownerSelect?.value || '';
            ownerSelect.innerHTML = '<option value="">-- 选择负责人 --</option>';
            allUsers.forEach(u => { ownerSelect.innerHTML += `<option value="${u.real_name || u.name || u.username}">${u.real_name || u.name || u.username}</option>`; });
            if (ownerSelect) ownerSelect.value = currentOwner;

            const groupSelect = document.getElementById('accountGroup');
            const currentGroup = groupSelect?.value || '';
            groupSelect.innerHTML = '<option value="">-- 选择分组 --</option>';
            const groups = [...new Set([...allUsers.filter(u => u.group_name).map(u => u.group_name), ...allAccounts.filter(a => a.group_name).map(a => a.group_name)])];
            groups.forEach(g => { groupSelect.innerHTML += `<option value="${g}">${g}</option>`; });
            if (groupSelect) groupSelect.value = currentGroup;
        }

        function openAccountModal(id = null) {
            document.getElementById('accountId').value = id || '';
            document.getElementById('accountModalTitle').textContent = id ? '编辑账号' : '添加账号';
            if (!id) { document.getElementById('accountPlatform').value = '抖音'; document.getElementById('accountName').value = ''; }
            updateAccountSelects();
            document.getElementById('accountModal').classList.add('show');
        }

        async function editAccount(id) {
            const a = allAccounts.find(x => x.id == id);
            if (!a) { toast('未找到该账号', 'error'); return; }
            document.getElementById('accountId').value = id;
            document.getElementById('accountModalTitle').textContent = '编辑账号';
            document.getElementById('accountPlatform').value = a.platform || '抖音';
            document.getElementById('accountName').value = a.account_name || '';
            updateAccountSelects();
            document.getElementById('accountOwner').value = a.owner || '';
            document.getElementById('accountGroup').value = a.group_name || '';
            document.getElementById('accountModal').classList.add('show');
        }

        async function saveAccount() {
            const id = document.getElementById('accountId').value;
            const data = {
                name: document.getElementById('accountName').value,
                account_name: document.getElementById('accountName').value,
                platform: document.getElementById('accountPlatform').value,
                owner: document.getElementById('accountOwner').value,
                group_name: document.getElementById('accountGroup').value,
                active: true
            };
            try {
                if (id) {
                    const { error } = await supabase.from('accounts').update(data).eq('id', id);
                    if (error) throw error;
                    toast('更新成功');
                } else {
                    const { error } = await supabase.from('accounts').insert(data);
                    if (error) throw error;
                    toast('添加成功');
                }
                closeModal('accountModal');
                loadAccounts();
            } catch (e) { toast('保存失败: ' + e.message, 'error'); }
        }

        async function deleteAccount(id) {
            if (!confirm('确定要删除吗？')) return;
            try { const { error } = await supabase.from('accounts').delete().eq('id', id); if (error) throw error; toast('删除成功'); loadAccounts(); } catch (e) { toast('删除失败', 'error'); }
        }

        // ============ Users ============
        async function loadUsers() {
            try {
                const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                allUsers = data || [];
                renderUserTable();
            } catch (e) { console.error(e); }
        }

        function renderUserTable() {
            const tbody = document.getElementById('userTable');
            if (!tbody) return;
            // 根据角色过滤可见用户
            const visibleUsers = allUsers.filter(u => canViewUser(u));
            if (visibleUsers.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无数据</td></tr>'; return; }
            const roleMap = { admin: '管理员', teacher: '教师/编导', student: '学生' };
            tbody.innerHTML = visibleUsers.map(u => `<tr>
                <td>${u.real_name || '-'}</td>
                <td>${u.username || '-'}</td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-purple' : u.role === 'teacher' ? 'badge-success' : 'badge-warning'}">${roleMap[u.role] || u.role}</span></td>
                <td>${u.group_name || '-'}</td>
                <td><span class="badge ${u.active ? 'badge-success' : 'badge-danger'}">${u.active ? '正常' : '停用'}</span></td>
                <td><button class="btn btn-sm btn-secondary" onclick="editUser(${u.id})">编辑</button><button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">删除</button></td>
            </tr>`).join('');
        }

        function openUserModal(id = null) {
            document.getElementById('userId').value = id || '';
            document.getElementById('userModalTitle').textContent = id ? '编辑成员' : '添加成员';
            updateUserGroupSelect();
            if (!id) { document.getElementById('userName').value = ''; document.getElementById('userUsername').value = ''; document.getElementById('userRole').value = 'student'; document.getElementById('userGroup').value = ''; document.getElementById('userPassword').value = '123456'; }
            document.getElementById('userModal').classList.add('show');
        }

        async function editUser(id) {
            const u = allUsers.find(x => x.id == id);
            if (!u) { toast('未找到该成员', 'error'); return; }
            document.getElementById('userId').value = id;
            document.getElementById('userModalTitle').textContent = '编辑成员';
            document.getElementById('userName').value = u.real_name || '';
            document.getElementById('userUsername').value = u.username || '';
            document.getElementById('userRole').value = u.role || 'student';
            updateUserGroupSelect();
            document.getElementById('userGroup').value = u.group_name || '';
            document.getElementById('userPassword').value = '';
            document.getElementById('userModal').classList.add('show');
        }

        async function saveUser() {
            const id = document.getElementById('userId').value;
            const realName = document.getElementById('userName').value.trim();
            if (!realName) { toast('姓名不能为空', 'error'); return; }
            const username = realName; // 用户名默认等于姓名
            const data = { name: realName, real_name: realName, username: username, role: document.getElementById('userRole').value, group_name: document.getElementById('userGroup').value, active: true, password: '123456' };
            try {
                if (id) {
                    const { error } = await supabase.from('users').update(data).eq('id', id);
                    if (error) throw error;
                    toast('更新成功');
                } else {
                    const { error } = await supabase.from('users').insert(data);
                    if (error) throw error;
                    toast('添加成功');
                }
                closeModal('userModal');
                loadUsers();
            } catch (e) { toast('保存失败: ' + e.message, 'error'); }
        }

        async function deleteUser(id) {
            if (!confirm('确定要删除吗？')) return;
            try { const { error } = await supabase.from('users').delete().eq('id', id); if (error) throw error; toast('删除成功'); loadUsers(); } catch (e) { toast('删除失败', 'error'); }
        }

        // ============ Groups ============
        async function loadGroups() {
            try {
                const { data, error } = await supabase.from('groups').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                allGroups = data || [];
                renderGroupTable();
                updateGroupLeaderSelect();
            } catch (e) { console.error(e); allGroups = []; renderGroupTable(); }
        }

        function renderGroupTable() {
            const tbody = document.getElementById('groupTable');
            if (!tbody) return;
            
            // 更新筛选下拉框选项
            const filterSelect = document.getElementById('groupFilter');
            if (filterSelect && filterSelect.options.length <= 1) {
                const currentVal = filterSelect.value;
                filterSelect.innerHTML = '<option value="">全部分组</option>';
                allGroups.forEach(g => {
                    filterSelect.innerHTML += `<option value="${g.name}">${g.name}</option>`;
                });
                filterSelect.value = currentVal;
            }
            
            const filterValue = document.getElementById('groupFilter')?.value || '';
            
            // 全部分组视图：显示分组列表和成员数
            if (!filterValue) {
                if (allGroups.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无分组</td></tr>'; return; }
                tbody.innerHTML = allGroups.map(g => {
                    const memberCount = allUsers.filter(u => u.group_name === g.name && u.role === 'student').length;
                    return `<tr>
                    <td>${g.name || '-'}</td>
                    <td>${g.leader || '-'}</td>
                    <td>${memberCount}</td>
                    <td>${g.note || '-'}</td>
                    <td><button class="btn btn-sm btn-secondary" onclick="editGroup(${g.id})">编辑</button><button class="btn btn-sm btn-danger" onclick="deleteGroup(${g.id})">删除</button></td>
                </tr>`;
                }).join('');
                return;
            }
            
            // 筛选了具体分组：显示该组所有学生姓名列表
            const groupInfo = allGroups.find(g => g.name === filterValue);
            const students = allUsers.filter(u => u.group_name === filterValue && u.role === 'student');
            
            if (students.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="empty-state">「${filterValue}」暂无学生</td></tr>`;
                return;
            }
            
            let html = `<tr style="background:#f0f4ff;font-weight:600;">
                <td colspan="5" style="padding:8px 12px;">
                    📁 ${groupInfo?.name || filterValue} — ${students.length} 名学生
                    <span style="color:#888;font-weight:normal">（负责人：${groupInfo?.leader || '-'）</span>
                </td>
            </tr>`;
            html += `<tr style="background:#f8fafc;color:#666;font-size:12px;">
                <td>姓名</td><td>用户名</td><td>分组</td><td>状态</td><td>操作</td>
            </tr>`;
            html += students.map(s => `<tr>
                <td>${s.real_name || s.name || '-'}</td>
                <td>${s.username || '-'}</td>
                <td>${s.group_name || '-'}</td>
                <td><span class="badge ${s.active ? 'badge-success' : 'badge-danger'}">${s.active ? '正常' : '停用'}</span></td>
                <td><button class="btn btn-sm btn-secondary" onclick="editUser(${s.id})">编辑</button></td>
            </tr>`).join('');
            tbody.innerHTML = html;
        }

        function updateGroupLeaderSelect() {
            const select = document.getElementById('groupLeader');
            if (!select) return;
            const teachers = allUsers.filter(u => u.role === 'teacher');
            select.innerHTML = '<option value="">-- 选择负责人 --</option>' + teachers.map(t => `<option value="${t.real_name || t.name}">${t.real_name || t.name}</option>`).join('');
        }

        function updateUserGroupSelect() {
            const select = document.getElementById('userGroup');
            if (!select) return;
            const currentValue = select.value || '';
            select.innerHTML = '<option value="">-- 选择分组 --</option>';
            // 从 groups 表获取分组列表
            allGroups.forEach(g => {
                select.innerHTML += `<option value="${g.name}">${g.name}</option>`;
            });
            select.value = currentValue;
        }

        function openGroupModal(id = null) {
            document.getElementById('groupId').value = id || '';
            document.getElementById('groupModalTitle').textContent = id ? '编辑分组' : '添加分组';
            if (!id) { document.getElementById('groupName').value = ''; document.getElementById('groupNote').value = ''; }
            updateGroupLeaderSelect();
            document.getElementById('groupModal').classList.add('show');
        }

        async function editGroup(id) {
            const g = allGroups.find(x => x.id == id);
            if (!g) { toast('未找到该分组', 'error'); return; }
            document.getElementById('groupId').value = id;
            document.getElementById('groupModalTitle').textContent = '编辑分组';
            document.getElementById('groupName').value = g.name || '';
            updateGroupLeaderSelect();
            document.getElementById('groupLeader').value = g.leader || '';
            document.getElementById('groupNote').value = g.note || '';
            document.getElementById('groupModal').classList.add('show');
        }

        async function saveGroup() {
            const id = document.getElementById('groupId').value;
            const name = document.getElementById('groupName').value.trim();
            if (!name) { toast('分组名称不能为空', 'error'); return; }
            const data = { name, leader: document.getElementById('groupLeader').value, note: document.getElementById('groupNote').value };
            try {
                if (id) { const { error } = await supabase.from('groups').update(data).eq('id', id); if (error) throw error; toast('更新成功'); }
                else { const { error } = await supabase.from('groups').insert(data); if (error) throw error; toast('添加成功'); }
                closeModal('groupModal');
                loadGroups();
            } catch (e) { toast('保存失败: ' + e.message, 'error'); }
        }

        async function deleteGroup(id) {
            if (!confirm('确定要删除吗？')) return;
            try { const { error } = await supabase.from('groups').delete().eq('id', id); if (error) throw error; toast('删除成功'); loadGroups(); } catch (e) { toast('删除失败', 'error'); }
        }

        // ============ Salary Config ============
        async function loadSalaryConfigs() {
            try {
                const { data, error } = await supabase.from('salary_configs').select('*').order('created_at', { ascending: false });
                if (error) throw error;
                allSalaryConfigs = data || [];
                renderSalaryConfigTable();
            } catch (e) { console.error(e); allSalaryConfigs = []; renderSalaryConfigTable(); }
        }

        function renderSalaryConfigTable() {
            const tbody = document.getElementById('salaryConfigTable');
            if (!tbody) return;
            if (allSalaryConfigs.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无配置</td></tr>'; return; }
            const roleMap = { teacher: '教师/编导', student: '学生' };
            tbody.innerHTML = allSalaryConfigs.map(c => {
                const isTeacher = c.role === 'teacher';
                if (isTeacher) {
                    return `<tr>
                    <td><span class="badge badge-success">${roleMap[c.role]}</span></td>
                    <td>-</td>
                    <td>-</td>
                    <td>${(c.ten_thousand_bonus || 50)}%</td>
                    <td>${c.note || '-'}</td>
                    <td><button class="btn btn-sm btn-secondary" onclick="editSalaryConfig(${c.id})">编辑</button><button class="btn btn-sm btn-danger" onclick="deleteSalaryConfig(${c.id})">删除</button></td>
                </tr>`;
                } else {
                    // 学生配置：显示阶梯底薪
                    const tier1 = `${c.tier1_min}-${c.tier1_max}条:${c.tier1_salary || 20}元`;
                    const tier2 = `${c.tier2_min}-${c.tier2_max}条:${c.tier2_salary || 25}元`;
                    const tier3 = `${c.tier3_min || 6}条以上:${c.tier3_salary || 30}元`;
                    return `<tr>
                    <td><span class="badge badge-warning">${roleMap[c.role]}</span></td>
                    <td><small>${tier1}<br>${tier2}<br>${tier3}</small></td>
                    <td>¥${c.thousand_bonus || 80}/条</td>
                    <td>¥${c.ten_thousand_bonus || 120}/条</td>
                    <td>${c.note || '-'}</td>
                    <td><button class="btn btn-sm btn-secondary" onclick="editSalaryConfig(${c.id})">编辑</button><button class="btn btn-sm btn-danger" onclick="deleteSalaryConfig(${c.id})">删除</button></td>
                </tr>`;
                }
            }).join('');
        }

        function updateSalaryConfigFields() {
            const role = document.getElementById('salaryConfigRole').value;
            const studentFields = document.getElementById('studentConfigFields');
            const teacherFields = document.getElementById('teacherConfigFields');
            if (studentFields) studentFields.style.display = role === 'student' ? 'block' : 'none';
            if (teacherFields) teacherFields.style.display = role === 'teacher' ? 'block' : 'none';
        }

        function openSalaryConfigModal(id = null) {
            document.getElementById('salaryConfigId').value = id || '';
            document.getElementById('salaryConfigModalTitle').textContent = id ? '编辑配置' : '添加配置';
            document.getElementById('salaryConfigRole').value = 'student';
            updateSalaryConfigFields();
            if (!id) { 
                // 默认阶梯底薪配置
                document.getElementById('tier1Min').value = '0';
                document.getElementById('tier1Max').value = '2';
                document.getElementById('tier1Salary').value = '20';
                document.getElementById('tier2Min').value = '3';
                document.getElementById('tier2Max').value = '5';
                document.getElementById('tier2Salary').value = '25';
                document.getElementById('tier3Min').value = '6';
                document.getElementById('tier3Salary').value = '30';
                document.getElementById('salaryConfigThousand').value = '80';
                document.getElementById('salaryConfigTenThousand').value = '120';
                document.getElementById('salaryConfigNote').value = '';
                document.getElementById('salaryConfigRatio').value = '50';
                document.getElementById('salaryConfigNoteTeacher').value = '';
            }
            document.getElementById('salaryConfigModal').classList.add('show');
        }

        async function editSalaryConfig(id) {
            const c = allSalaryConfigs.find(x => x.id == id);
            if (!c) { toast('未找到该配置', 'error'); return; }
            document.getElementById('salaryConfigId').value = id;
            document.getElementById('salaryConfigModalTitle').textContent = '编辑配置';
            document.getElementById('salaryConfigRole').value = c.role || 'student';
            updateSalaryConfigFields();
            if (c.role === 'student') {
                // 阶梯底薪配置
                document.getElementById('tier1Min').value = c.tier1_min ?? 0;
                document.getElementById('tier1Max').value = c.tier1_max ?? 2;
                document.getElementById('tier1Salary').value = c.tier1_salary ?? 20;
                document.getElementById('tier2Min').value = c.tier2_min ?? 3;
                document.getElementById('tier2Max').value = c.tier2_max ?? 5;
                document.getElementById('tier2Salary').value = c.tier2_salary ?? 25;
                document.getElementById('tier3Min').value = c.tier3_min ?? 6;
                document.getElementById('tier3Salary').value = c.tier3_salary ?? 30;
                document.getElementById('salaryConfigThousand').value = c.thousand_bonus || 80;
                document.getElementById('salaryConfigTenThousand').value = c.ten_thousand_bonus || 120;
                document.getElementById('salaryConfigNote').value = c.note || '';
            } else {
                document.getElementById('salaryConfigRatio').value = c.ten_thousand_bonus || 50;
                document.getElementById('salaryConfigNoteTeacher').value = c.note || '';
            }
            document.getElementById('salaryConfigModal').classList.add('show');
        }

        async function saveSalaryConfig() {
            const id = document.getElementById('salaryConfigId').value;
            const role = document.getElementById('salaryConfigRole').value;
            let data = { role: role };
            
            if (role === 'student') {
                // 阶梯底薪配置
                data.tier1_min = parseInt(document.getElementById('tier1Min').value) || 0;
                data.tier1_max = parseInt(document.getElementById('tier1Max').value) || 2;
                data.tier1_salary = parseFloat(document.getElementById('tier1Salary').value) || 20;
                data.tier2_min = parseInt(document.getElementById('tier2Min').value) || 3;
                data.tier2_max = parseInt(document.getElementById('tier2Max').value) || 5;
                data.tier2_salary = parseFloat(document.getElementById('tier2Salary').value) || 25;
                data.tier3_min = parseInt(document.getElementById('tier3Min').value) || 6;
                data.tier3_salary = parseFloat(document.getElementById('tier3Salary').value) || 30;
                data.thousand_bonus = parseFloat(document.getElementById('salaryConfigThousand').value) || 80;
                data.ten_thousand_bonus = parseFloat(document.getElementById('salaryConfigTenThousand').value) || 120;
                data.note = document.getElementById('salaryConfigNote').value;
            } else {
                // 老师配置：ten_thousand_bonus 字段存放带教比例
                data.tier1_salary = 0;
                data.tier2_salary = 0;
                data.tier3_salary = 0;
                data.thousand_bonus = 0;
                data.ten_thousand_bonus = parseFloat(document.getElementById('salaryConfigRatio').value) || 50;
                data.note = document.getElementById('salaryConfigNoteTeacher').value;
            }
            
            try {
                if (id) { const { error } = await supabase.from('salary_configs').update(data).eq('id', id); if (error) throw error; toast('更新成功'); }
                else { const { error } = await supabase.from('salary_configs').insert(data); if (error) throw error; toast('添加成功'); }
                closeModal('salaryConfigModal');
                loadSalaryConfigs();
            } catch (e) { toast('保存失败: ' + e.message, 'error'); }
        }

        async function deleteSalaryConfig(id) {
            if (!confirm('确定要删除吗？')) return;
            try { const { error } = await supabase.from('salary_configs').delete().eq('id', id); if (error) throw error; toast('删除成功'); loadSalaryConfigs(); } catch (e) { toast('删除失败', 'error'); }
        }

        // ============ Salary ============
        function initSalaryMonth() {
            const select = document.getElementById('salaryMonth');
            if (!select) return;
            const now = new Date();
            select.innerHTML = '';
            for (let i = 0; i < 12; i++) {
                const year = now.getFullYear();
                const month = now.getMonth() - i;
                // 处理跨年的月份计算
                const d = new Date(year, month, 1);
                const y = d.getFullYear();
                const m = d.getMonth() + 1;
                const value = `${y}-${String(m).padStart(2, '0')}`;
                const label = `${y}年${m}月`;
                select.innerHTML += `<option value="${value}" ${i === 0 ? 'selected' : ''}>${label}</option>`;
            }
        }

        async function loadSalaryData() {
            await loadSalaries();
            await loadSalarySummary();
        }

        async function loadSalaries() {
            try {
                const month = document.getElementById('salaryMonth')?.value || new Date().toISOString().slice(0, 7);
                const { data, error } = await supabase.from('salaries').select('*').eq('month', month).order('created_at', { ascending: false });
                if (error) throw error;
                allSalaries = data || [];
                updateSalaryNameFilter();
                renderSalaryTable();
            } catch (e) { console.error(e); allSalaries = []; renderSalaryTable(); }
        }

        // 更新姓名筛选下拉框选项
        function updateSalaryNameFilter() {
            const select = document.getElementById('salaryNameFilter');
            if (!select) return;
            const currentValue = select.value;
            const names = [...new Set(allSalaries.map(s => s.user_name).filter(Boolean))].sort();
            select.innerHTML = '<option value="">全部人员</option>' + names.map(n => `<option value="${n}">${n}</option>`).join('');
            select.value = currentValue;
        }

        // 筛选薪资表格
        function filterSalaryTable() {
            renderSalaryTable();
        }

        function renderSalaryTable() {
            const tbody = document.getElementById('salaryTable');
            if (!tbody) return;
            const nameFilter = document.getElementById('salaryNameFilter')?.value || '';
            let filtered = allSalaries;
            if (nameFilter) {
                filtered = allSalaries.filter(s => s.user_name === nameFilter);
            }
            if (filtered.length === 0) { tbody.innerHTML = '<tr><td colspan="11" class="empty-state">暂无结算数据</td></tr>'; return; }
            tbody.innerHTML = filtered.map(s => {
                const isTeacher = s.role === 'teacher';
                const deduction = s.deduction || 0;
                return `<tr style="cursor:pointer;" onclick="showSalaryDetail(${s.id})">
                <td><a href="javascript:void(0)" style="color:var(--primary);text-decoration:none;" onclick="event.stopPropagation();showSalaryDetail(${s.id})">${s.user_name || '-'}</a></td>
                <td><span class="badge ${isTeacher ? 'badge-success' : 'badge-warning'}">${isTeacher ? '老师' : '学生'}</span></td>
                <td>${s.group_name || '-'}</td>
                <td>${s.video_count || 0}</td>
                <td>${s.thousand_count || 0}</td>
                <td>${s.ten_thousand_count || 0}</td>
                <td>¥${s.base_salary || 0}</td>
                <td>¥${s.bonus || 0}${isTeacher && deduction > 0 ? '<br><small style="color:var(--gray-400)">需达标12条</small>' : ''}</td>
                <td><strong>¥${s.total || 0}</strong></td>
                <td><span class="badge ${s.status === '已结算' ? 'badge-success' : 'badge-warning'}">${s.status || '待结算'}</span></td>
                <td><button class="btn btn-sm ${s.status === '已结算' ? 'btn-success' : 'btn-secondary'}" onclick="event.stopPropagation();markSalaryPaid(${s.id})" ${s.status === '已结算' ? 'disabled' : ''}>${s.status === '已结算' ? '已结算' : '确认结算'}</button></td>
            </tr>`;
            }).join('');
        }

        async function loadSalarySummary() {
            const total = allSalaries.reduce((sum, s) => sum + (s.total || 0), 0);
            const paid = allSalaries.filter(s => s.status === '已结算').reduce((sum, s) => sum + (s.total || 0), 0);
            const pending = allSalaries.filter(s => s.status !== '已结算').reduce((sum, s) => sum + (s.total || 0), 0);
            const deduction = allSalaries.reduce((sum, s) => sum + (s.deduction || 0), 0);
            document.getElementById('salaryTotal').textContent = '¥' + total;
            document.getElementById('salaryPaid').textContent = '¥' + paid;
            document.getElementById('salaryPending').textContent = '¥' + pending;
            document.getElementById('salaryDeduction').textContent = '¥' + deduction;
        }

        // 获取薪资配置（根据角色）
        function getSalaryConfig(role) {
            const config = allSalaryConfigs.find(c => c.role === role);
            if (config) return config;
            // 默认配置
            return {
                base_salary: role === 'student' ? 0 : 0,
                thousand_bonus: 80,
                ten_thousand_bonus: 120,
                note: ''
            };
        }

        // 计算学生的薪资（从配置读取阶梯底薪）
        function calcStudentSalary(videoCount, thousandCount, tenThousandCount) {
            const config = getSalaryConfig('student');
            // 达标视频数量（千赞+万赞）
            const qualifiedCount = thousandCount + tenThousandCount;
            
            // 从配置读取阶梯底薪参数
            const tier1Min = config.tier1_min ?? 0;
            const tier1Max = config.tier1_max ?? 2;
            const tier1Salary = config.tier1_salary ?? 20;
            const tier2Min = config.tier2_min ?? 3;
            const tier2Max = config.tier2_max ?? 5;
            const tier2Salary = config.tier2_salary ?? 25;
            const tier3Min = config.tier3_min ?? 6;
            const tier3Salary = config.tier3_salary ?? 30;
            
            // 根据达标数量匹配档位
            let unitPrice;
            if (qualifiedCount >= tier3Min) {
                unitPrice = tier3Salary;  // 第3档
            } else if (qualifiedCount >= tier2Min && qualifiedCount <= tier2Max) {
                unitPrice = tier2Salary;  // 第2档
            } else {
                unitPrice = tier1Salary;  // 第1档
            }
            
            // 底薪 = 阶梯单价 × 发片条数
            const baseSalary = unitPrice * videoCount;
            // 千赞奖金：从配置读取
            const thousandBonus = thousandCount * (config.thousand_bonus || 80);
            // 万赞奖金：从配置读取
            const tenThousandBonus = tenThousandCount * (config.ten_thousand_bonus || 120);
            // 总薪资 = 底薪 + 奖金
            return {
                unitPrice,
                qualifiedCount,
                tier1Salary,
                tier2Salary,
                tier3Salary,
                baseSalary,
                thousandBonus,
                tenThousandBonus,
                total: baseSalary + thousandBonus + tenThousandBonus
            };
        }

        // 计算老师的带教奖金（从配置读取）
        function calcTeacherBonus(groupName, month) {
            if (!groupName) return { total: 0, studentBonus: 0, qualified: false, groupVideoCount: 0 };
            
            const teacherConfig = getSalaryConfig('teacher');
            const teacherRatio = teacherConfig.ten_thousand_bonus || 50; // 默认50%，存放在ten_thousand_bonus字段
            
            // 获取该组的所有学生
            const groupStudents = allUsers.filter(u => u.role === 'student' && u.group_name === groupName);
            if (groupStudents.length === 0) return { total: 0, studentBonus: 0, qualified: false, groupVideoCount: 0 };
            
            // 计算小组内所有学生的发片总数
            let groupVideoCount = 0;
            let totalStudentBonus = 0;
            
            for (const student of groupStudents) {
                const studentNames = getUserAllNames(student);
                const studentVideos = allVideos.filter(v => {
                    const videoMonth = getVideoMonth(v);
                    return studentNames.includes(v.publisher) && videoMonth === month;
                });
                groupVideoCount += studentVideos.length;
                
                    // 计算每个学生的奖励（使用统一数据达标计算，按链接去重）
                    let thousandCount = 0;
                    let tenThousandCount = 0;
                    const countedLinks = new Set();
                    studentVideos.forEach(v => {
                        const link = v.video_link || v.id;
                        if (countedLinks.has(link)) return;
                        const status = getDataStandardStatus(v);
                        if (status.status === '万赞') { tenThousandCount++; countedLinks.add(link); }
                        else if (status.status === '千赞') { thousandCount++; countedLinks.add(link); }
                    });
                // 从配置读取学生的奖金标准
                const studentConfig = getSalaryConfig('student');
                const thousandBonus = thousandCount * (studentConfig.thousand_bonus || 80);
                const tenThousandBonus = tenThousandCount * (studentConfig.ten_thousand_bonus || 120);
                totalStudentBonus += thousandBonus + tenThousandBonus;
            }
            
            // 在小组内所有账号发够12条视频的前提下，老师奖金 = 学生奖励总和 × 配置的比例
            const qualified = groupVideoCount >= 12;
            const ratio = qualified ? teacherRatio / 100 : 0;
            const total = qualified ? Math.round(totalStudentBonus * ratio) : 0;
            
            return { total, studentBonus: totalStudentBonus, qualified, groupVideoCount };
        }

        async function openSalaryModal() {
            console.log('>>> openSalaryModal 被调用');
            const month = document.getElementById('salaryMonth')?.value;
            console.log('>>> 选择的月份:', month);
            if (!month) { toast('请选择月份', 'error'); return; }
            
            // 确保视频和用户数据已加载
            if (allVideos.length === 0) {
                console.log('>>> 视频数据为空，重新加载');
                await loadVideos();
            }
            if (allUsers.length === 0) {
                console.log('>>> 用户数据为空，重新加载');
                await loadUsers();
            }
            
            // 先重新加载现有薪资记录，避免重复
            console.log('>>> 开始 loadSalaries');
            await loadSalaries();
            console.log('>>> loadSalaries 完成, allSalaries:', allSalaries.length);
            
            // 先计算所有学生的薪资（底薪+奖金）
            console.log('生成薪资 - 月份:', month, '视频总数:', allVideos.length, '学生数:', allUsers.filter(u => u.role === 'student').length, 'allUsers:', allUsers.length);
            // 打印所有视频的 publisher 和日期，用于排查
            console.log('=== 所有视频的 publisher 和月份 ===');
            allVideos.forEach(v => console.log('视频:', v.publisher, '月份:', getVideoMonth(v), '链接:', v.video_link?.substring(0, 30)));
            console.log('===================================');
            for (const student of allUsers.filter(u => u.role === 'student')) {
                const userNames = getUserAllNames(student);
                // 匹配视频：publisher 在 userNames 中，且日期匹配
                const targetMonth = String(month).trim();
                const userVideos = allVideos.filter(v => {
                    const videoMonth = String(getVideoMonth(v) || '').trim();
                    const nameMatch = userNames.includes(v.publisher);
                    const monthMatch = videoMonth === targetMonth;
                    if (nameMatch) console.log('名字匹配:', v.publisher, '视频月份:[', videoMonth, '] 目标月份:[', targetMonth, '] 月份匹配:', monthMatch);
                    const match = nameMatch && monthMatch;
                    if (match) console.log('✅ 匹配视频:', v.publisher, '月份:', videoMonth, '链接:', v.video_link);
                    return match;
                });
                console.log('学生:', student.real_name || student.name, '别名:', userNames, '匹配视频数:', userVideos.length);
                // 使用统一数据达标计算（同链接只算一次，万赞优先）
                let thousandCount = 0;
                let tenThousandCount = 0;
                const countedLinks = new Set();
                userVideos.forEach(v => {
                    const link = v.video_link || v.id;
                    if (countedLinks.has(link)) return;
                    const status = getDataStandardStatus(v);
                    if (status.status === '万赞') { tenThousandCount++; countedLinks.add(link); }
                    else if (status.status === '千赞') { thousandCount++; countedLinks.add(link); }
                });
                const salaryInfo = calcStudentSalary(userVideos.length, thousandCount, tenThousandCount);
                const data = { 
                    user_id: student.id, 
                    user_name: student.real_name || student.name, 
                    role: 'student', 
                    group_name: student.group_name, 
                    month, 
                    video_count: userVideos.length, 
                    thousand_count: thousandCount, 
                    ten_thousand_count: tenThousandCount, 
                    unit_price: salaryInfo.unitPrice,
                    base_salary: salaryInfo.baseSalary, 
                    thousand_bonus: salaryInfo.thousandBonus,
                    ten_thousand_bonus: salaryInfo.tenThousandBonus,
                    bonus: salaryInfo.thousandBonus + salaryInfo.tenThousandBonus,
                    total: salaryInfo.total, 
                    status: '待结算' 
                };
                try {
                    // 使用 user_id + month + role 作为唯一标识查找
                    const existing = allSalaries.find(s => s.user_id === student.id && s.month === month && s.role === 'student');
                    if (existing) {
                        await supabase.from('salaries').update(data).eq('id', existing.id);
                    } else {
                        await supabase.from('salaries').insert(data);
                    }
                } catch (e) { console.error('保存学生薪资失败:', e); }
            }
            
            // 再计算老师的带教奖金
            const groups = [...new Set(allUsers.filter(u => u.group_name).map(u => u.group_name))];
            console.log('>>> 开始计算老师奖金, 小组数:', groups.length);
            for (const groupName of groups) {
                const teacher = allUsers.find(u => u.role === 'teacher' && u.group_name === groupName);
                if (!teacher) continue;
                
                const teacherBonusInfo = calcTeacherBonus(groupName, month);
                const data = { 
                    user_id: teacher.id, 
                    user_name: teacher.real_name || teacher.name, 
                    role: 'teacher', 
                    group_name: groupName, 
                    month, 
                    video_count: teacherBonusInfo.groupVideoCount,
                    thousand_count: 0, 
                    ten_thousand_count: 0, 
                    unit_price: 0,
                    base_salary: 0, 
                    thousand_bonus: 0,
                    ten_thousand_bonus: 0,
                    bonus: teacherBonusInfo.total,
                    total: teacherBonusInfo.total, 
                    deduction: teacherBonusInfo.qualified ? 0 : teacherBonusInfo.studentBonus,
                    status: '待结算' 
                };
                try {
                    const existing = allSalaries.find(s => s.user_id === teacher.id && s.month === month && s.role === 'teacher');
                    if (existing) {
                        await supabase.from('salaries').update(data).eq('id', existing.id);
                    } else {
                        await supabase.from('salaries').insert(data);
                    }
                } catch (e) { console.error('保存老师薪资失败:', e); }
            }
            
            console.log('>>> 薪资生成完成，准备刷新表格');
            toast('薪资已生成');
            loadSalaries();
            loadSalarySummary();
        }

        async function markSalaryPaid(id) {
            try { const { error } = await supabase.from('salaries').update({ status: '已结算' }).eq('id', id); if (error) throw error; toast('已标记为结算'); loadSalaries(); loadSalarySummary(); } catch (e) { toast('操作失败', 'error'); }
        }

        // 显示薪资明细弹窗
        function showSalaryDetail(id) {
            const s = allSalaries.find(x => x.id == id);
            if (!s) return;
            const isTeacher = s.role === 'teacher';
            const month = document.getElementById('salaryMonth')?.value || '';
            
            let html = '';
            if (isTeacher) {
                // 老师明细
                const groupStudents = allUsers.filter(u => u.role === 'student' && u.group_name === s.group_name);
                html += `<div style="margin-bottom:16px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>姓名</span><b>${s.user_name}</b></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>角色</span><span class="badge badge-success">老师</span></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>分组</span><span>${s.group_name || '-'}</span></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>月份</span><span>${month}</span></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>小组发片总数</span><span>${s.video_count || 0} 条</span></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>达标状态</span><span style="color:${s.deduction > 0 ? 'var(--danger)' : 'var(--success)'}">${s.deduction > 0 ? '未达标（需≥12条）' : '已达标'}</span></div>
                </div>`;
                html += `<div style="background:var(--gray-50);padding:12px;border-radius:8px;margin-bottom:16px;">
                    <div style="font-weight:600;margin-bottom:8px;">带教奖金计算</div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>学生奖金总和</span><span>¥${s.deduction > 0 ? (s.deduction + s.bonus) : s.bonus}</span></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>带教比例</span><span>${s.deduction > 0 ? '0%' : '50%'}</span></div>
                    <div style="border-top:1px solid var(--gray-200);margin:8px 0;padding-top:8px;display:flex;justify-content:space-between;"><span>带教奖金</span><b>¥${s.bonus || 0}</b></div>
                </div>`;
                if (s.deduction > 0) {
                    html += `<div style="color:var(--danger);font-size:13px;">* 小组发片未满12条，带教奖金为0</div>`;
                }
            } else {
                // 学生明细
                const config = getSalaryConfig('student');
                const qualifiedCount = (s.thousand_count || 0) + (s.ten_thousand_count || 0);
                html += `<div style="margin-bottom:16px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>姓名</span><b>${s.user_name}</b></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>角色</span><span class="badge badge-warning">学生</span></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>分组</span><span>${s.group_name || '-'}</span></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>月份</span><span>${month}</span></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>发片数量</span><span>${s.video_count || 0} 条</span></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span>达标数量</span><span>${qualifiedCount} 条（千赞${s.thousand_count || 0} + 万赞${s.ten_thousand_count || 0}）</span></div>
                </div>`;
                html += `<div style="background:var(--gray-50);padding:12px;border-radius:8px;margin-bottom:16px;">
                    <div style="font-weight:600;margin-bottom:8px;">薪资明细</div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>适用档位</span><span>${s.unit_price || 20}元/条</span></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>底薪</span><span>${s.video_count || 0}条 × ${s.unit_price || 20}元 = ¥${s.base_salary || 0}</span></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>千赞奖金</span><span>${s.thousand_count || 0}条 × ¥${config.thousand_bonus || 80} = ¥${s.thousand_bonus || 0}</span></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>万赞奖金</span><span>${s.ten_thousand_count || 0}条 × ¥${config.ten_thousand_bonus || 120} = ¥${s.ten_thousand_bonus || 0}</span></div>
                    <div style="border-top:1px solid var(--gray-200);margin:8px 0;padding-top:8px;display:flex;justify-content:space-between;"><span>实发合计</span><b style="font-size:18px;color:var(--primary)">¥${s.total || 0}</b></div>
                </div>`;
                html += `<div style="display:flex;justify-content:space-between;align-items:center;">
                    <span>状态</span>
                    <span class="badge ${s.status === '已结算' ? 'badge-success' : 'badge-warning'}">${s.status || '待结算'}</span>
                </div>`;
            }
            
            document.getElementById('salaryDetailTitle').textContent = `${s.user_name} - ${month}薪资明细`;
            document.getElementById('salaryDetailContent').innerHTML = html;
            document.getElementById('salaryDetailModal').classList.add('show');
        }

        // 获取视频的组别（用于筛选）
        function getVideoGroupForFilter(v) {
            // 1. 优先使用视频记录中直接设置的组别
            if (v.group_name) return v.group_name;
            // 2. 从人员表查找发布者对应的组别（匹配所有可能的姓名）
            const user = allUsers.find(u => {
                if (!u.group_name) return false;
                const names = new Set();
                if (u.real_name) names.add(u.real_name);
                if (u.name) names.add(u.name);
                if (u.username) names.add(u.username);
                return names.has(v.publisher) && u.group_name;
            });
            if (user) return user.group_name;
            // 3. 从账号表查找组别
            const account = allAccounts.find(a => a.account_name === v.account_name && a.group_name);
            if (account) return account.group_name;
            return null;
        }

        // 更新组别筛选器选项
        function updateGroupFilterOptions() {
            const select = document.getElementById('filterGroup');
            if (!select) return;
            
            // 保存当前选中的值
            const currentValue = select.value;
            
            // 从 users 和 accounts 表获取分组，并合并去重
            const userGroups = allUsers.map(u => u.group_name).filter(Boolean);
            const accountGroups = allAccounts.map(a => a.group_name).filter(Boolean);
            const groups = [...new Set([...userGroups, ...accountGroups])].sort();
            
            // 更新选项
            select.innerHTML = '<option value="">全部分组</option>' + 
                groups.map(g => `<option value="${g}" ${g === currentValue ? 'selected' : ''}>${g}</option>`).join('');
        }
        
        // ============ Dashboard ============
        async function updateDashboard() {
            // 更新组别筛选器选项
            updateGroupFilterOptions();
            
            const videos = getFilteredVideos();
            const group = document.getElementById('filterGroup')?.value;
            // 根据角色和组别筛选老师和学生
            const teachers = allUsers.filter(u => u.role === 'teacher' && canViewUser(u) && (!group || u.group_name === group));
            const students = allUsers.filter(u => u.role === 'student' && canViewUser(u) && (!group || u.group_name === group));
            const thousandVideos = videos.filter(v => v.likes >= 1000);
            const tenThousandVideos = videos.filter(v => v.likes >= 10000);

            document.getElementById('statTeachers').textContent = teachers.length;
            document.getElementById('statStudents').textContent = students.length;
            document.getElementById('statAccounts').textContent = allAccounts.length;
            document.getElementById('statVideos').textContent = videos.length;
            document.getElementById('statThousand').textContent = thousandVideos.length;
            document.getElementById('statTenThousand').textContent = tenThousandVideos.length;

            renderTeacherGrid(teachers, videos, students);
            
            // 加载 Chart.js 后渲染图表
            await loadChartJS();
            destroyOldCharts();
            
            // 如果选择了组别，隐藏"发片趋势（按组别）"图表
            const groupChartCard = document.querySelector('#groupChart')?.closest('.chart-card');
            if (group && groupChartCard) {
                groupChartCard.style.display = 'none';
            } else {
                if (groupChartCard) groupChartCard.style.display = 'block';
                renderGroupChart(videos);
            }
            
            renderTopLists(videos);
            
            // 如果 Chart 仍未定义，说明 CDN 加载失败，显示提示
            if (typeof Chart === 'undefined') {
                document.querySelectorAll('.chart-card').forEach(card => {
                    const canvas = card.querySelector('canvas');
                    if (canvas && !card.querySelector('.chart-error')) {
                        card.innerHTML += '<div class="chart-error" style="color: var(--gray-500); font-size: 12px; margin-top: 8px;">图表库加载失败，请检查网络连接</div>';
                    }
                });
            }
        }

        // 获取老师的所有匹配姓名（real_name, name, 以及username）
        function getTeacherNames(t) {
            const names = new Set();
            if (t.real_name) names.add(t.real_name);
            if (t.name) names.add(t.name);
            if (t.username) names.add(t.username);
            return [...names];
        }

        function renderTeacherGrid(teachers, videos, students) {
            const grid = document.getElementById('teacherGrid');
            if (!grid) return;
            if (teachers.length === 0) { grid.innerHTML = '<div class="empty-state">暂无老师数据</div>'; return; }
            grid.innerHTML = teachers.map(t => {
                // 获取该老师组的所有学生
                const groupStudents = students.filter(s => s.group_name === t.group_name);
                const isGroupLeader = groupStudents.length > 0;
                
                // 获取老师的所有可能姓名
                const teacherNames = getTeacherNames(t);
                
                // 如果是组长，统计整个组的视频（老师 + 所有组员）；否则只统计老师自己的
                let tVideos;
                if (isGroupLeader) {
                    // 组长的发片数 = 老师自己 + 所有组员的视频
                    const allMemberNames = [...teacherNames, ...groupStudents.map(s => s.real_name || s.name).filter(Boolean)];
                    tVideos = videos.filter(v => allMemberNames.includes(v.publisher));
                } else {
                    tVideos = videos.filter(v => teacherNames.includes(v.publisher));
                }
                
                const tThousand = tVideos.filter(v => v.likes >= 1000).length;
                const tTenThousand = tVideos.filter(v => v.likes >= 10000).length;
                const tStudents = groupStudents.length;
                const thousandRate = tVideos.length > 0 ? ((tThousand / tVideos.length) * 100).toFixed(1) : 0;
                const tenThousandRate = tVideos.length > 0 ? ((tTenThousand / tVideos.length) * 100).toFixed(1) : 0;
                return `<div class="teacher-card">
                    <div class="teacher-header">
                        <span class="teacher-name">${t.real_name || t.name}</span>
                        <span class="badge ${t.active ? 'badge-success' : 'badge-danger'}">${t.group_name || '未分组'}</span>
                    </div>
                    <div class="teacher-stats">
                        <div class="teacher-stat"><div class="teacher-stat-value">${tVideos.length}</div><div class="teacher-stat-label">发片数</div></div>
                        <div class="teacher-stat"><div class="teacher-stat-value">${tStudents}</div><div class="teacher-stat-label">学生数</div></div>
                        <div class="teacher-stat"><div class="teacher-stat-value gold">${tThousand}</div><div class="teacher-stat-label">千赞数</div></div>
                        <div class="teacher-stat"><div class="teacher-stat-value red">${tTenThousand}</div><div class="teacher-stat-label">万赞数</div></div>
                    </div>
                    <div style="margin-top:8px;font-size:12px;color:var(--gray-500)">千赞率: ${thousandRate}% | 万赞率: ${tenThousandRate}%</div>
                </div>`;
            }).join('');
        }

        // 销毁旧的图表实例
        function destroyOldCharts() {
            Object.keys(chartInstances).forEach(key => {
                if (chartInstances[key]) {
                    chartInstances[key].destroy();
                }
            });
            chartInstances = {};
        }
        
        // ============ Chart Colors ============
        const chartColors = {
            primary: 'rgba(37, 99, 235, 0.8)',
            success: 'rgba(16, 185, 129, 0.8)',
            warning: 'rgba(245, 158, 11, 0.8)',
            danger: 'rgba(239, 68, 68, 0.8)',
            purple: 'rgba(139, 92, 246, 0.8)',
            pink: 'rgba(236, 72, 153, 0.8)',
            primaryBorder: 'rgb(37, 99, 235)',
            successBorder: 'rgb(16, 185, 129)',
            warningBorder: 'rgb(245, 158, 11)',
            dangerBorder: 'rgb(239, 68, 68)',
            purpleBorder: 'rgb(139, 92, 246)',
            pinkBorder: 'rgb(236, 72, 153)',
        };
        
        function renderGroupChart(videos) {
            const chartCanvas = document.getElementById('groupChart');
            if (!chartCanvas) return;
            
            // 如果 Chart 未加载，跳过
            if (typeof Chart === 'undefined') return;
            
            // 从 users 和 accounts 两个表获取分组，并合并去重
            const userGroups = allUsers.map(u => u.group_name).filter(Boolean);
            const accountGroups = allAccounts.map(a => a.group_name).filter(Boolean);
            const groups = [...new Set([...userGroups, ...accountGroups])];
            
            const groupData = groups.map(g => ({
                name: g,
                count: videos.filter(v => getVideoGroupForFilter(v) === g).length
            }));
            groupData.sort((a, b) => b.count - a.count);
            
            // 如果没有数据，显示提示
            if (groupData.length === 0 || videos.length === 0) {
                chartCanvas.style.display = 'none';
                const parent = chartCanvas.parentElement;
                if (!parent.querySelector('.empty-state')) {
                    parent.innerHTML += '<div class="empty-state" style="padding: 40px;">暂无分组数据</div>';
                }
                return;
            }
            
            chartCanvas.style.display = 'block';
            
            const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
            
            if (chartInstances['group']) {
                chartInstances['group'].destroy();
            }
            
            chartInstances['group'] = new Chart(chartCanvas, {
                type: 'bar',
                data: {
                    labels: groupData.slice(0, 6).map(d => d.name),
                    datasets: [{
                        label: '发片数',
                        data: groupData.slice(0, 6).map(d => d.count),
                        backgroundColor: groupData.slice(0, 6).map((_, i) => colors[i % colors.length]),
                        borderColor: groupData.slice(0, 6).map((_, i) => colors[i % colors.length].replace(')', '').replace('rgb', 'rgba').replace('#', '')),
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { stepSize: 1 }
                        }
                    }
                }
            });
        }

        function renderTopLists(videos) {
            // 千赞TOP5 - 柱状图
            const topThousand = [...videos].filter(v => v.likes >= 1000).sort((a, b) => b.likes - a.likes).slice(0, 5);
            const thousandCanvas = document.getElementById('topThousandChart');
            if (thousandCanvas && topThousand.length > 0) {
                if (chartInstances['thousand']) chartInstances['thousand'].destroy();
                chartInstances['thousand'] = new Chart(thousandCanvas, {
                    type: 'bar',
                    data: {
                        labels: topThousand.map(v => v.publisher || '-'),
                        datasets: [{
                            label: '点赞数',
                            data: topThousand.map(v => v.likes),
                            backgroundColor: 'rgba(245, 158, 11, 0.8)',
                            borderColor: 'rgb(245, 158, 11)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: { legend: { display: false } },
                        scales: { x: { beginAtZero: true } }
                    }
                });
            } else if (thousandCanvas) {
                thousandCanvas.parentElement.innerHTML = '<div class="empty-state" style="padding: 40px;">暂无千赞数据</div>';
            }

            // 万赞TOP5 - 柱状图
            const topTenThousand = [...videos].filter(v => v.likes >= 10000).sort((a, b) => b.likes - a.likes).slice(0, 5);
            const tenThousandCanvas = document.getElementById('topTenThousandChart');
            if (tenThousandCanvas && topTenThousand.length > 0) {
                if (chartInstances['tenThousand']) chartInstances['tenThousand'].destroy();
                chartInstances['tenThousand'] = new Chart(tenThousandCanvas, {
                    type: 'bar',
                    data: {
                        labels: topTenThousand.map(v => v.publisher || '-'),
                        datasets: [{
                            label: '点赞数',
                            data: topTenThousand.map(v => v.likes),
                            backgroundColor: 'rgba(139, 92, 246, 0.8)',
                            borderColor: 'rgb(139, 92, 246)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: { legend: { display: false } },
                        scales: { x: { beginAtZero: true } }
                    }
                });
            } else if (tenThousandCanvas) {
                tenThousandCanvas.parentElement.innerHTML = '<div class="empty-state" style="padding: 40px;">暂无万赞数据</div>';
            }

            // 同学发片数排名 - 柱状图
            const publishers = [...new Set(videos.map(v => v.publisher).filter(Boolean))];
            const pubStats = publishers.map(p => ({
                name: p,
                count: videos.filter(v => v.publisher === p).length
            })).sort((a, b) => b.count - a.count).slice(0, 5);
            
            const studentCanvas = document.getElementById('studentRankChart');
            if (studentCanvas && pubStats.length > 0) {
                if (chartInstances['student']) chartInstances['student'].destroy();
                chartInstances['student'] = new Chart(studentCanvas, {
                    type: 'bar',
                    data: {
                        labels: pubStats.map(p => p.name),
                        datasets: [{
                            label: '发片数',
                            data: pubStats.map(p => p.count),
                            backgroundColor: 'rgba(16, 185, 129, 0.8)',
                            borderColor: 'rgb(16, 185, 129)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: { legend: { display: false } },
                        scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
                    }
                });
            } else if (studentCanvas) {
                studentCanvas.parentElement.innerHTML = '<div class="empty-state" style="padding: 40px;">暂无发片数据</div>';
            }
        }

        // ============ Utilities ============
        function formatDate(dateStr) {
            if (!dateStr) return '-';
            const d = new Date(dateStr);
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }

        // ============ Export Preview ============
        function loadExportPreview() {
            const type = document.getElementById('exportType').value;
            const startDate = document.getElementById('exportDateStart').value;
            const endDate = document.getElementById('exportDateEnd').value;
            
            const previewCard = document.getElementById('exportPreviewCard');
            const previewTable = document.getElementById('exportPreviewTable');
            const previewCount = document.getElementById('exportPreviewCount');
            
            if (type !== 'videos') {
                previewCard.style.display = 'none';
                return;
            }
            
            // 根据日期筛选视频
            const filteredVideos = allVideos.filter(v => {
                const date = v.created_at?.slice(0, 10);
                if (startDate && date < startDate) return false;
                if (endDate && date > endDate) return false;
                return true;
            });
            
            // 如果没有日期筛选条件且没有视频数据，隐藏预览
            if (!startDate && !endDate && filteredVideos.length === 0) {
                previewCard.style.display = 'none';
                return;
            }
            
            // 显示预览区域
            previewCard.style.display = 'block';
            previewCount.textContent = filteredVideos.length;
            
            // 渲染预览表格
            if (filteredVideos.length === 0) {
                previewTable.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#999;">暂无符合条件的视频数据</td></tr>';
            } else {
                previewTable.innerHTML = filteredVideos.slice(0, 50).map(v => {
                    const standardStatus = getDataStandardStatus(v);
                    return `<tr>
                        <td>${formatDate(v.created_at)}</td>
                        <td>${v.platform || '-'}</td>
                        <td>${v.account_name || '-'}</td>
                        <td>${v.publisher || '-'}</td>
                        <td>${v.views_day3!=null ? v.views_day3+' / '+v.likes_day3 : '-'}</td>
                        <td>${v.views_day7!=null ? v.views_day7+' / '+v.likes_day7 : '-'}</td>
                        <td>${v.views_month_end!=null ? v.views_month_end+' / '+v.likes_month_end : '-'}</td>
                        <td><span class="badge" style="${standardStatus.style}">${standardStatus.status}</span></td>
                        <td><span class="status-badge ${v.status === '已发布' ? 'published' : ''}">${v.status || '-'}</span></td>
                    </tr>`;
                }).join('');
                
                if (filteredVideos.length > 50) {
                    previewTable.innerHTML += `<tr><td colspan="9" style="text-align:center;color:#999;">共 ${filteredVideos.length} 条数据，显示前50条...</td></tr>`;
                }
            }
        }
        
        // ============ Export ============
        function doExport() {
            const type = document.getElementById('exportType').value;
            let data, headers, filename;
            if (type === 'videos') {
                // 使用导出页面的日期筛选器，仅导出当前用户可见的数据
                const startDate = document.getElementById('exportDateStart').value;
                const endDate = document.getElementById('exportDateEnd').value;
                data = getMyVideos().filter(v => {
                    const date = v.created_at?.slice(0, 10);
                    if (startDate && date < startDate) return false;
                    if (endDate && date > endDate) return false;
                    return true;
                });
                headers = ['时间', '平台', '账号', '发布者', '组别', '链接', '播放(发布)', '点赞(发布)', '播放(D3)', '点赞(D3)', '播放(D7)', '点赞(D7)', '状态'];
                filename = '视频记录';
            } else if (type === 'accounts') {
                data = getMyAccounts();
                headers = ['平台', '账号名', '负责人', '分组', '状态'];
                filename = '账号列表';
            } else if (type === 'users') {
                data = getMyUsers();
                headers = ['姓名', '用户名', '角色', '分组', '状态'];
                filename = '人员名单';
            } else if (type === 'salary') {
                data = allSalaries;
                headers = ['姓名', '角色', '分组', '发片数', '千赞数', '万赞数', '奖金', '实发', '状态'];
                filename = '薪资结算';
            }
            exportToXLSX(data, headers, filename);
        }

        function exportVideos() {
            const data = getMyVideos();
            const headers = ['时间', '平台', '账号', '发布者', '组别', '链接', '播放(发布)', '点赞(发布)', '播放(D3)', '点赞(D3)', '播放(D7)', '点赞(D7)', '状态'];
            exportToXLSX(data, headers, '视频记录');
        }

        function exportWeeklyReport() {
            const now = new Date();
            const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
            const weekVideos = getMyVideos().filter(v => new Date(v.created_at) > weekAgo);
            const report = [{ '报表类型': '周报', '日期范围': `${weekAgo.toLocaleDateString()} ~ ${now.toLocaleDateString()}`, '发片总数': weekVideos.length, '千赞数': weekVideos.filter(v => v.likes >= 1000).length, '万赞数': weekVideos.filter(v => v.likes >= 10000).length }];
            exportToXLSX(report, Object.keys(report[0]), '周报');
        }

        function exportMonthlyReport() {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthVideos = getMyVideos().filter(v => new Date(v.created_at) >= monthStart);
            const report = [{ '报表类型': '月报', '月份': `${now.getFullYear()}年${now.getMonth() + 1}月`, '发片总数': monthVideos.length, '千赞数': monthVideos.filter(v => v.likes >= 1000).length, '万赞数': monthVideos.filter(v => v.likes >= 10000).length }];
            exportToXLSX(report, Object.keys(report[0]), '月报');
        }

        // 导出全部数据（多个工作表）
        async function exportAllSheets() {
            if (typeof XLSX === 'undefined') {
                await loadSheetJS();
            }
            const wb = XLSX.utils.book_new();
            
            // 视频记录
            const videoData = allVideos.map(v => ({
                '时间': formatDate(v.created_at),
                '平台': v.platform || '',
                '账号': v.account_name || '',
                '发布者': v.publisher || '',
                '链接': v.video_link || '',
                '播放': v.views || 0,
                '点赞': v.likes || 0,
                '状态': v.status || ''
            }));
            const videoSheet = XLSX.utils.json_to_sheet(videoData);
            XLSX.utils.book_append_sheet(wb, videoSheet, '视频记录');
            
            // 账号管理
            const accountData = allAccounts.map(a => ({
                '账号名': a.name || a.account_name || '',
                '平台': a.platform || '',
                '负责人': a.owner || '',
                '分组': a.group_name || '',
                '状态': a.active === false ? '停用' : '正常'
            }));
            const accountSheet = XLSX.utils.json_to_sheet(accountData);
            XLSX.utils.book_append_sheet(wb, accountSheet, '账号管理');
            
            // 人员名单
            const userData = allUsers.map(u => ({
                '姓名': u.real_name || u.name || '',
                '用户名': u.username || '',
                '角色': u.role || '',
                '分组': u.group_name || '',
                '状态': u.active === false ? '停用' : '正常'
            }));
            const userSheet = XLSX.utils.json_to_sheet(userData);
            XLSX.utils.book_append_sheet(wb, userSheet, '人员名单');
            
            // 薪资结算
            const salaryData = allSalaries.map(s => ({
                '姓名': s.user_name || '',
                '角色': s.role || '',
                '分组': s.group_name || '',
                '月份': s.month || '',
                '发片数': s.video_count || 0,
                '千赞数': s.thousand_count || 0,
                '万赞数': s.ten_thousand_count || 0,
                '奖金': s.bonus || 0,
                '实发': s.total || 0,
                '状态': s.status || ''
            }));
            const salarySheet = XLSX.utils.json_to_sheet(salaryData);
            XLSX.utils.book_append_sheet(wb, salarySheet, '薪资结算');
            
            XLSX.writeFile(wb, '全部数据_' + new Date().toISOString().slice(0, 10) + '.xlsx');
            toast('导出成功！');
        }

        // 动态加载 SheetJS 库
        async function loadSheetJS() {
            return new Promise((resolve, reject) => {
                if (typeof XLSX !== 'undefined') { resolve(); return; }
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
                script.onload = resolve;
                script.onerror = () => toast('加载Excel库失败，请检查网络', 'error');
                document.head.appendChild(script);
            });
        }
        
        // 动态加载 Chart.js
        let chartInstances = {};
        async function loadChartJS() {
            return new Promise((resolve) => {
                if (typeof Chart !== 'undefined') { resolve(); return; }
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
                script.onload = () => resolve();
                script.onerror = () => {
                    toast('加载图表库失败，请检查网络', 'error');
                    resolve(); // 即使失败也继续执行，避免卡住
                };
                document.head.appendChild(script);
            });
        }

        // 导出为 xlsx 格式
        async function exportToXLSX(data, headers, filename) {
            if (!data || data.length === 0) { toast('暂无数据可导出', 'error'); return; }
            if (typeof XLSX === 'undefined') {
                await loadSheetJS();
            }
            
            const rows = data.map(row => {
                const obj = {};
                headers.forEach(h => {
                    obj[h] = getNestedValue(row, h);
                });
                return obj;
            });
            
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, filename);
            XLSX.writeFile(wb, filename + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
            toast('导出成功！');
        }

        function getNestedValue(obj, key) {
            const map = {
                '时间': 'created_at', '平台': 'platform', '账号': 'account_name', '发布者': 'publisher', 
                '组别': 'group_name', '链接': 'video_link', 
                '播放(发布)': 'views', '点赞(发布)': 'likes',
                '播放(D3)': 'views_day3', '点赞(D3)': 'likes_day3',
                '播放(D7)': 'views_day7', '点赞(D7)': 'likes_day7',
                '状态': 'status', '账号名': 'account_name', '负责人': 'owner', '分组': 'group_name', 
                '姓名': 'real_name', '用户名': 'username', '角色': 'role', '奖金': 'bonus', '实发': 'total',
                '播放': 'views', '点赞': 'likes'
            };
            const k = map[key] || key;
            if (obj[k] === undefined || obj[k] === null) return '';
            if (obj[k] === true) return '正常';
            if (obj[k] === false) return '停用';
            if (typeof obj[k] === 'object') return JSON.stringify(obj[k]);
            return obj[k];
        }

        // ============ Init Tables ============
        async function initTables() {
            if (!confirm('这将创建/更新所有必要的数据库表。继续吗？')) return;
            try {
                const sqls = [
                    `CREATE TABLE IF NOT EXISTS groups (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, leader TEXT, member_count INTEGER DEFAULT 0, note TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
                    `CREATE TABLE IF NOT EXISTS salary_configs (id BIGSERIAL PRIMARY KEY, role TEXT NOT NULL, thousand_bonus NUMERIC DEFAULT 0, ten_thousand_bonus NUMERIC DEFAULT 0, tier1_min INTEGER DEFAULT 0, tier1_max INTEGER DEFAULT 2, tier1_salary NUMERIC DEFAULT 20, tier2_min INTEGER DEFAULT 3, tier2_max INTEGER DEFAULT 5, tier2_salary NUMERIC DEFAULT 25, tier3_min INTEGER DEFAULT 6, tier3_salary NUMERIC DEFAULT 30, note TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
                    `CREATE TABLE IF NOT EXISTS salaries (id BIGSERIAL PRIMARY KEY, user_id INTEGER, user_name TEXT, role TEXT, group_name TEXT, month TEXT, video_count INTEGER DEFAULT 0, thousand_count INTEGER DEFAULT 0, ten_thousand_count INTEGER DEFAULT 0, base_salary NUMERIC DEFAULT 0, bonus NUMERIC DEFAULT 0, deduction NUMERIC DEFAULT 0, total NUMERIC DEFAULT 0, status TEXT DEFAULT '待结算', created_at TIMESTAMPTZ DEFAULT NOW())`
                ];
                for (const sql of sqls) {
                    try { await supabase.rpc('pgio', { query: sql }); } catch (e) { console.log('SQL执行:', e.message); }
                }
                // RLS
                const rls = [`ALTER TABLE groups ENABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS "pub" ON groups; CREATE POLICY "pub" ON groups FOR ALL USING (true) WITH CHECK (true);`, `ALTER TABLE salary_configs ENABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS "pub" ON salary_configs; CREATE POLICY "pub" ON salary_configs FOR ALL USING (true) WITH CHECK (true);`, `ALTER TABLE salaries ENABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS "pub" ON salaries; CREATE POLICY "pub" ON salaries FOR ALL USING (true) WITH CHECK (true);`];
                for (const r of rls) { try { await supabase.rpc('pgio', { query: r }); } catch (e) { console.log('RLS:', e.message); } }
                toast('数据库初始化完成！', 'success');
                loadAllData();
            } catch (e) { toast('初始化遇到问题', 'error'); }
        }

        async function clearAllData() {
            if (!confirm('确定要清空所有数据吗？')) return;
            if (!confirm('再次确认：所有数据将被永久删除！')) return;
            try { await supabase.from('videos').delete().neq('id', 0); await supabase.from('accounts').delete().neq('id', 0); await supabase.from('users').delete().neq('id', 0); await supabase.from('groups').delete().neq('id', 0); await supabase.from('salaries').delete().neq('id', 0); toast('数据已清空'); loadAllData(); } catch (e) { toast('清空失败', 'error'); }
        }
    