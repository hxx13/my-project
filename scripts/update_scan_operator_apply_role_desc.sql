-- 一次性：将「生效角色」配置说明改为按当前登录扫码操作员判断（未绑卡 + 扫码公告）
-- 目标库默认 twin_system；可在 Navicat / mysql 客户端执行

UPDATE sys_system_config_def
SET description = 'JSON 数组，如 ["STUDENT"]；仅当当前网页登录扫码操作员的 sys_user 角色在列表内时生效未绑卡提示与禁入。'
WHERE module = 'student_violation'
  AND config_key = 'student.violation.unbound.notice.apply_role_codes';

UPDATE sys_system_config_def
SET description = 'JSON 数组，如 ["STUDENT"]；仅当当前网页登录扫码操作员的 sys_user 角色在列表内时展示扫码弹窗公告。'
WHERE module = 'student_violation'
  AND config_key = 'student.scan.announcement.apply_role_codes';
