-- ============================================================
-- 创建默认用户账号
-- 在 Supabase SQL Editor 中运行此文件
-- ============================================================

-- 先插入角色（如果不存在）
INSERT INTO public.co_roles (id, name, description, perms) VALUES
  ('admin', '管理员', '系统管理员，拥有所有权限', '["all"]'),
  ('teacher', '教师/组长', '负责管理小组成员', '["view_group", "edit_group", "view_salary"]'),
  ('student', '学生', '普通成员', '["view_self", "edit_self"]')
ON CONFLICT (id) DO NOTHING;

-- 插入默认管理员账号
INSERT INTO public.co_users (username, password, real_name, role, active) VALUES
  ('admin', 'admin123', '系统管理员', 'admin', true)
ON CONFLICT (username) DO NOTHING;

-- 插入示例教师账号
INSERT INTO public.co_users (username, password, real_name, role, active) VALUES
  ('teacher1', 'teacher123', '张教师', 'teacher', true)
ON CONFLICT (username) DO NOTHING;

-- 插入示例学生账号（需要先创建分组，再分配 group_id）
-- 先创建示例分组
INSERT INTO public.co_groups (name, teacher_name) VALUES
  ('A组', '张教师')
ON CONFLICT DO NOTHING;

-- 获取分组ID并插入学生
DO $$
DECLARE
  group_id bigint;
BEGIN
  SELECT id INTO group_id FROM public.co_groups WHERE name = 'A组' LIMIT 1;
  
  INSERT INTO public.co_users (username, password, real_name, role, group_id, active) VALUES
    ('student1', 'student123', '李明', 'student', group_id, true),
    ('student2', 'student123', '王芳', 'student', group_id, true)
  ON CONFLICT (username) DO NOTHING;
END $$;

-- 查询结果
SELECT id, username, real_name, role, group_id, active FROM public.co_users ORDER BY id;
