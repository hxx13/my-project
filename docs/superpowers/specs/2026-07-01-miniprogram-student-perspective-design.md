# 小程序学生视角首页改造 + 统一登录 · 设计规格

> **版本**: 1.0 | **日期**: 2026-07-01 | **状态**: 设计阶段

---

## 1. 概述与上下文

### 1.1 目标

将 H5 学生端首页的完整布局（进出状态指示条 + 七入口宫格）迁移到微信小程序，使学生账号登录小程序后获得与 H5 一致的使用体验。同时统一"我的"页面为账号密码登录入口，注册逻辑对齐 H5。

### 1.2 核心约束

- **复用不重建**：申领入口复用小程序现有 `studentMaterial` 页面，物资图标复用 `icon-supplies.png`
- **教职工零影响**：非学生账号看到的首页 + 底部 Tab 完全保持现有布局不变
- **学生判定对齐 Web**：使用 `accountSource === "STUDENT"` 作为首要判断条件，与前端 `postLoginNavigation.ts` 一致
- **自定义 TabBar**：小程序已启用 `"custom": true`，支持运行时动态切换底部导航项
- **本次范围仅首页 + 登录**：笼架/出入记录/课题组/违规记录的独立子页面不在本次范围——入口点击后暂以 toast 提示"即将上线"，后续逐一按 H5 对应页面迁移

### 1.3 范围边界

| 在本次范围内 | 不在本次范围 |
|-------------|-------------|
| 首页七入口布局 + 状态指示条 | 笼架子页面完整实现 |
| 底部 Tab 动态切换 | 出入记录子页面 |
| 「我的」登录/注册表单 | 课题组子页面 |
| `isStudentAccount()` 判定函数 | 违规记录子页面 |
| 四个新增图标资源 | 后端新接口（全部复用已有） |

### 1.3 涉及范围

| 层 | 文件 | 变更类型 |
|----|------|----------|
| 小程序首页 | `pages/index/index.js` | 改造：条件渲染学生/教职工布局 |
| 小程序首页 | `pages/index/index.wxml` | 改造：新增学生布局模板 |
| 小程序首页 | `pages/index/index.wxss` | 改造：新增学生布局样式 |
| 底部导航 | `custom-tab-bar/index.js` | 改造：根据 accountSource 动态切换 tabs |
| 底部导航 | `custom-tab-bar/index.wxml` | 改造：条件渲染不同 tab 项 |
| 我的页面 | `pages/mine/index.js` | 改造：未登录显示登录表单，登录后显示信息 |
| 我的页面 | `pages/mine/index.wxml` | 改造：登录表单 + 注册引导 |
| 角色工具 | `utils/roleAccess.js` | 改造：新增 `isStudentAccount()` |
| 权限工具 | `utils/pagePermission.js` | 改造：学生入口权限判断 |
| 新增图标 | `pages/assets/images/icon-cage.png` | 新增 |
| 新增图标 | `pages/assets/images/icon-records.png` | 新增 |
| 新增图标 | `pages/assets/images/icon-group.png` | 新增 |
| 新增图标 | `pages/assets/images/icon-violation.png` | 新增 |

---

## 2. 学生判定逻辑

### 2.1 判定函数

在 `utils/roleAccess.js` 新增：

```
isStudentAccount()
  → 读取 wx.storage 中的 userInfo.accountSource
  → "STUDENT" → true
  → "STAFF"  → false
  → null/undefined → 降级判断: role level < STAFF(2) → true
```

与 Web 端 `postLoginNavigation.ts` 的 `isStudentAccount()` 完全一致。

### 2.2 存储时机

登录成功（`POST /api/auth/login/web`）返回的 `AuthData.userInfo` 中包含 `accountSource`，存入 `wx.setStorageSync('auth_user_info', ...)`。

已有自动登录链路（`app.js` 中的 Spring 静默登录）返回的 userInfo 也已包含 `accountSource`，无需额外请求。

---

## 3. 首页改造（pages/index/index）

### 3.1 布局分支

```
onShow() → isStudentAccount()
  ├── true  → 渲染学生布局（新增）
  └── false → 渲染现有布局（不变）
```

### 3.2 学生布局结构

```
Hero 轮播（保持）
登录条（保持）
┌─ 进出状态指示条 ─────────────────┐  ← 新增
│ [图标] 已进入  1F01室  在场 02:15   │
│       豁免待审核 · 1F02室 · 延长至18:00│
└──────────────────────────────────┘
┌─ 七入口宫格 ─────────────────────┐
│  上排（大图标 56×56）：            │
│  [房间]    [申领]    [笼架]        │
│  ───────── 分隔线 ─────────       │
│  下排（小图标 40×40）：            │
│  [出入记录] [通知②] [课题组] [违规] │
└──────────────────────────────────┘
新闻/公告 Tab（保持）
```

### 3.3 七入口定义

| 位置 | id | 标签 | 图标 | 目标 | 权限 | 备注 |
|------|-----|------|------|------|------|------|
| 上1 | room | 房间 | icon-room.png | `wx.switchTab /pages/room/index` | STUDENT+ | 已有页面 |
| 上2 | material | 申领 | icon-supplies.png | `wx.navigateTo studentMaterial/index` | STUDENT+ | 已有页面，复用物资图标 |
| 上3 | cage | 笼架 | icon-cage.png（新） | toast "即将上线" | STUDENT+ | 子页面后续迁移 |
| 下1 | records | 出入记录 | icon-records.png（新） | toast "即将上线" | STUDENT+ | 子页面后续迁移 |
| 下2 | notices | 通知 | icon-notify.png | `wx.navigateTo notifications/index` | STUDENT+ | 已有页面，带角标 |
| 下3 | group | 课题组 | icon-group.png（新） | toast "即将上线" | STUDENT+ | 子页面后续迁移 |
| 下4 | violations | 违规记录 | icon-violation.png（新） | toast "即将上线" | STUDENT+ | 子页面后续迁移 |

### 3.4 申领 = 物资统一入口

- 学生点"申领" → `package-feature/pages/studentMaterial/index`（已有，展示学生申领数据）
- 教职工点"物资" → `supplies/index` 或 `suppliesMine/index`（现有逻辑不变）
- 共用同一图标资源 `icon-supplies.png`

### 3.5 进出状态指示条

数据结构对齐 H5 `MobilePresenceSnapshot`，通过 `useMobilePresenceStatus` 对应的后端接口获取。

**展示规则**：

| 状态 | 图标 | 标签 | 附加信息 |
|------|------|------|----------|
| 已进入 (inside) | 绿色 | 已进入 + 房间名 | 在场时长 |
| 待激活 (pending_activation) | 橙色 | 待激活 + 房间名 | 激活倒计时 |
| 待离开 (pending_leave) | 红色 | 待离开 + 房间名 | 签退倒计时 |
| 已离开 (outside) | 灰色 | 已离开 | "当前不在实验区域内" |
| 未知 (unknown) | 橙色 | — | "等待系统同步" |

**豁免行**（当 `exemptStatus.phase !== "none"`）：

| 豁免状态 | 标签 | 附加信息 |
|----------|------|----------|
| pending_review | 待审核（琥珀色） | 延长至 HH:mm |
| approved_active | 已授权（绿色） | 剩余次数 / 剩余时间 |
| approved_expired | 已过期（红色） | 已到期（至 HH:mm） |
| rejected | 已拒绝（灰色） | 已申请 · 房间名 · 已拒绝 |

HTTP 数据源：优先复用 H5 的 `/api/student/mobile/presence`（JWT），小程序侧通过 `wx.request` + Bearer token 调用。

### 3.6 教职工布局

完全保持现有 `primarySlots`（房间/学生审核/预留）+ `quick-row`（报修/采购/信息/物资）不变。新增代码通过 `wx:if="{{ isStudentView }}"` 与学生布局隔离。

---

## 4. 底部导航栏改造（custom-tab-bar）

### 4.1 动态切换

```javascript
// custom-tab-bar/index.js
const { isStudentAccount } = require('../utils/roleAccess.js');

// 在 refreshTabs() 中：
if (isStudentAccount()) {
  this.setData({ tabs: STUDENT_TABS });   // 首页/房间/申领/笼架/我的
} else {
  this.setData({ tabs: STAFF_TABS });     // 首页/房间/概览/温湿度/我的
}
```

### 4.2 学生 Tab 定义

| 序号 | 文本 | 图标 | pagePath | 点击行为 |
|------|------|------|----------|----------|
| 0 | 首页 | home | pages/index/index | switchTab |
| 1 | 房间 | room | pages/room/index | switchTab |
| 2 | 申领 | supplies（复用物资图标） | — | navigateTo studentMaterial |
| 3 | 笼架 | cage（新） | — | toast "即将上线" |
| 4 | 我的 | mine | pages/mine/index | switchTab |

其中"申领"和"笼架"不是 tabBar 页面（不在 `app.json` 的 `tabBar.list` 中），在 custom-tab-bar 中以 `wx.navigateTo` 方式跳转，但保持视觉上的 tab 选中态。"笼架"暂无对应页面，暂显 toast，后续补充。

### 4.3 教职工 Tab 保持

现有 5 个 tab（首页/房间/概览/温湿度/我的）完全不变。

---

## 5. "我的"登录改造（pages/mine/index）

### 5.1 未登录态：账号密码登录表单

```
┌─ 登录 ────────────────────────────┐
│                                    │
│  [账号输入框]                       │
│  [密码输入框]                       │
│  [登录按钮]                         │
│                                    │
│  没有账号？去注册 →                  │
└────────────────────────────────────┘
```

- 调用 `POST /api/auth/login/web`（与 Web/H5 完全相同）
- 成功后存储：token、role、userInfo（含 accountSource）
- 失败提示错误信息
- "去注册"跳转到注册表单

### 5.2 注册表单

```
┌─ 注册 ────────────────────────────┐
│                                    │
│  账号类型：[学生] [教职工]  ← 单选   │
│                                    │
│  学生：                             │
│  [19位学号] [姓名] [密码] [确认密码] │
│                                    │
│  教职工：                           │
│  [邀请码] [账号] [密码] [确认密码]   │
│                                    │
│  [注册按钮]                         │
│  已有账号？去登录 →                  │
└────────────────────────────────────┘
```

- 学生注册调 `POST /api/auth/register/student`（已有接口）
- 教职工注册调 `POST /api/auth/register/staff`（已有接口）
- 注册成功 → 自动跳回登录页，不自动登录
- 登录成功后 → 刷新首页和底部 Tab

### 5.3 已登录态：个人信息

保持现有布局（头像、昵称、快捷入口等），新增退出登录按钮。

### 5.4 去除微信静默登录限制

不再以微信 `wx.login()` + `code2session` 作为唯一登录入口。Spring 静默登录（`springAuth.js`）保留用于已绑定用户的自动恢复，但未绑定用户不再被阻拦——直接看到登录表单。

---

## 6. 数据流

```
app.js onLaunch
  ├── springAuth 自动恢复（已有 token → 直接进入）
  └── 无 token → 首页以未登录态展示
       │
       └── 用户进入「我的」→ 输入账号密码
              │
              ▼
       POST /api/auth/login/web (与Web相同)
              │
              ▼
       AuthData { token, role, accountSource, userInfo }
              │
              ├── 存入 wx.storage
              ├── 首页 onShow 重新判断 isStudentAccount()
              ├── custom-tab-bar 切换为学生/教职工 tabs
              └── 所有入口根据 accountSource + role 控制可见性
```

---

## 7. 权限矩阵

| 入口 | 学生（accountSource=STUDENT） | 教职工（其他） |
|------|------------------------------|---------------|
| 房间 | ✅ | ✅ |
| 申领/物资 | ✅ → studentMaterial | ✅ → supplies |
| 笼架 | ✅ | ❌（教职工通过其他路径） |
| 出入记录 | ✅ | ✅ |
| 通知 | ✅（角标badge） | ✅（角标badge） |
| 课题组 | ✅ | ✅ |
| 违规记录 | ✅ | ✅ |
| 报修 | ❌ | ✅ (STAFF+) |
| 采购 | ❌ | ✅ (STAFF+) |
| 学生审核 | ❌ | ✅ (STAFF+) |

---

## 8. 与 H5 的对应关系

| H5 组件/文件 | 小程序对应 |
|-------------|-----------|
| `MobileHomeTab.tsx`（七入口） | `pages/index/index` 学生布局 |
| `MobilePresenceStatusBar.tsx` | `pages/index/index` 状态指示条模板 |
| `useMobilePresenceStatus.ts` | 同名 JS 逻辑 + HTTP 调用 |
| `mobilePresenceTheme.ts`（主题色） | WXSS 变量映射 |
| `MobileBottomTabBar.tsx` | `custom-tab-bar/index` |
| `auth/MobileLoginPage.tsx` | `pages/mine/index` 登录表单 |
| `auth/MobileRegisterPage.tsx` | `pages/mine/index` 注册表单 |
| `postLoginNavigation.ts` 的 `isStudentAccount()` | `utils/roleAccess.js` 新增同名函数 |
