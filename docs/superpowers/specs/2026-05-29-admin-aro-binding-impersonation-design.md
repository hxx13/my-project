# 超级管理员 ARO 绑定与身份模拟

**目标：** 超级管理员可将教职工账号绑定到 ARO 人员，并切换为学生视图调试学生端功能。

**架构：** 单向绑定（教职工→ARO）+ JWT 模拟身份。切换时签发新 JWT（role=STUDENT, userId=aroUserId, impersonatedBy=staffId），学生端 API 零改动。前端暂存原始 token，退出时恢复。

---

## 数据模型

**新建表 `user_aro_binding`：**

```sql
CREATE TABLE user_aro_binding (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL COMMENT 'sys_user.id',
    aro_user_id VARCHAR(50) NOT NULL COMMENT 'aro_personnel.user_id',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user (user_id),
    UNIQUE KEY uk_aro_user (aro_user_id),
    INDEX idx_user (user_id)
);
```

约束：一个教职工只能绑定一个 ARO 人员（`uk_user`），一个 ARO 人员只能被一个教职工绑定（`uk_aro_user`）。绑定方向单向：只允许教职工绑定 ARO，不允许 ARO 反向绑定。

---

## API 设计

### 绑定管理

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/admin/account/bind-aro` | Body: `{ aroUserId }` — 校验 aro_personnel 存在，upsert 绑定 |
| DELETE | `/api/admin/account/bind-aro` | 解除当前用户的绑定 |
| GET | `/api/admin/account/binding` | 返回绑定信息（aroUserId, name, departmentName, 无绑定时返回 null） |
| DELETE | `/api/admin/personnel/{userId}/aro-binding` | 管理员在人员页面解绑任意用户的 ARO 绑定 |

### 身份模拟

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/impersonate` | 签发模拟 JWT：role=STUDENT, userId=aroUserId, impersonatedBy=原userId |

`impersonate/exit` 不需要后端接口 —— 前端自行保存原始 token，退出时恢复即可。

---

## JWT 设计

**模拟 JWT 包含的 claims：**
- `sub` / `userId` = ARO 人员 user_id（19位数字）
- `role` = `STUDENT`
- `impersonatedBy` = 原始教职工 sys_user.id（STAFF_xxx）

**AuthContextService 改造：**
- 解析 JWT 时检查 `impersonatedBy` claim
- 若存在且 userId 不是 `STAFF_` 或 `STU_` 前缀：视为 ARO user_id，从 `aro_personnel` 构造轻量 User 对象
- 此时 user.getId() = aroUserId，所有 student API 可直接用于查询

---

## 前端交互

### 教职工后台侧

**AdminLayout 右上角（SUPER_ADMIN+ 可见）：**

未绑定状态：显示「绑定ARO」按钮 → 点击弹出输入框 → 输入 ARO 用户 ID → 调用 bind API

已绑定状态：显示「姓名（ARO ID）」标签 + 下拉菜单：
- 「切换学生视图」→ 保存当前 token/location → 调用 `/api/auth/impersonate` → 替换 token/role → 跳转 `/student/home`
- 「解除绑定」→ 确认弹窗 → 调用 DELETE API

### 学生端侧

**检测模拟身份：** 检查 JWT 中是否有 `impersonatedBy` claim（或 role=STUDENT 但 token 中有此字段）

**模拟身份标识：** StudentLayout 顶部固定显示黄色提示条：
- 左侧：「当前以 ARO 人员身份查看：[姓名]（[ARO ID]）」
- 右侧：「返回教职工后台」按钮
- 点击返回：恢复 localStorage 中的原始 token/role → 跳转原始页面

### 人员授权页面（AdminPersonnelPage）

**新增列「ARO绑定」：**
- 已绑定：显示绑定人姓名 + ARO ID + 「解绑」按钮（调用 DELETE /api/admin/personnel/{userId}/aro-binding）
- 未绑定：显示「-」

---

## 路由与权限

- `/student/*` 路由守卫不变（`AuthGuard` 检查 role=STUDENT）
- 模拟 JWT 的 role 就是 STUDENT，现有守卫无需改动
- 学生端各 API 无需改动 —— AuthContextService 从 JWT 解析出的 userId 即为 ARO user_id

---

## 边界情况

- 绑定时 ARO user_id 在 aro_personnel 中不存在 → 返回 400 "ARO 人员不存在"
- 该 ARO 人员已被其他人绑定 → 返回 409 "该 ARO 人员已被绑定"
- 模拟 JWT 过期 → 前端检测 401 → 恢复原始 token → 清除模拟状态
- 未绑定时请求 impersonate → 返回 400 "请先绑定 ARO 人员"
