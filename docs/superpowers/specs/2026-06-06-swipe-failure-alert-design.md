# 刷卡失败告警 · 全局灵动岛通知

> 日期：2026-06-06 | 状态：设计阶段

## 1. 概述

针对门禁记录库中刷卡失败的记录，实时向管理员及以上角色推送**灵动岛样式**全局弹窗通知。告警规则高度可配（阈值、部门、通道、开门类型），通过 WebSocket 广播，支持全局联动已读。

**核心交互：**

- 顶部居中黑色胶囊（灵动岛），脉冲动画 + 倒计时进度条
- WebSocket 实时推送，到达阈值即触发
- 任一管理员点击"已读" → 所有客户端同步消失
- 告警规则在「警告与弹窗公告」页面新增 Tab 配置，无需写死

## 2. 数据流

```
Dahua 实时拉取任务 → 刷卡记录入库 (swing_record)
                          ↓
                    规则引擎（后端新增）
                    · 过滤 openResult=0 或 openType=52
                    · 匹配活跃告警规则（通道/部门/开门类型）
                    · 滑动窗口计数（按 ruleId + 维度分组）
                    · 达到阈值 + 未在冷却期 → 触发
                          ↓
                    WebSocket 广播
                    event: SWIPE_FAILURE_ALERT
                    payload: { alertId, ruleId, ruleName,
                               matchedRecords, count,
                               windowSec, bannerDurationSec }
                          ↓
                    前端灵动岛 Banner（Globally mounted）
                    · AdminRoleGate：仅 ADMIN+ 可见
                    · 渲染胶囊 + 脉冲 + 倒计时
                    · 已读 → WS SWIPE_FAILURE_ALERT_ACK
                          ↓
                    后端收到 ACK → 广播 ACK 给所有客户端
                    · 所有客户端同步 dismiss
```

## 3. 后端设计

### 3.1 告警规则模型

```sql
CREATE TABLE swipe_alert_rule (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  enabled       TINYINT(1) NOT NULL DEFAULT 1,
  channels      JSON,          -- ["CH01","CH02"] or null=全通道
  departments   JSON,          -- ["物理学院","计算机学院"] or null
  open_types    VARCHAR(200),  -- "52" or "52,0" (逗号分隔)
  title_template        VARCHAR(200) DEFAULT '🚨 刷卡失败告警 · ${dept}',
  body_template         VARCHAR(500) DEFAULT '过去 ${windowMin} 分钟内 ${count} 次非法刷卡，涉及：${persons}',
  threshold_count       INT NOT NULL DEFAULT 3,
  threshold_window_sec  INT NOT NULL DEFAULT 300,   -- 滑动窗口秒数
  banner_duration_sec   INT NOT NULL DEFAULT 10,    -- 0=不自动消失
  min_role_level        INT NOT NULL DEFAULT 4,     -- ADMIN
  cooldown_sec          INT NOT NULL DEFAULT 60,    -- 同一规则两次告警最小间隔
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 3.2 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/swipe-alert/rules` | 列出所有规则 |
| POST | `/api/swipe-alert/rules` | 创建规则 |
| PUT | `/api/swipe-alert/rules/{id}` | 更新规则 |
| DELETE | `/api/swipe-alert/rules/{id}` | 删除规则 |
| PATCH | `/api/swipe-alert/rules/{id}/toggle` | 启用/停用 |
| GET | `/api/swipe-alert/rules/{id}/recent-alerts` | 该规则最近的告警记录 |

### 3.3 规则引擎

- **触发点**：刷卡记录写入后（hook/event listener），仅处理 `openResult=0` 或 `openType=52`
- **匹配逻辑**：对每条活跃规则检查 channels、departments、open_types 过滤条件
- **滑动窗口**：内存中维护 `Map<ruleId_department_channelKey, Deque<timestamp>>`，每次命中清理过期条目、追加新时间戳
- **阈值判定**：窗口内条目数 >= threshold_count，且距离上次触发 > cooldown_sec
- **WebSocket 广播**：构建 alert 载荷，通过 Socket.IO 向拥有角色 >= min_role_level 的连接广播
- **冷却**：记录 `lastFiredAt` 在内存中（或 Redis 若有多实例），防止同一规则重复触发

### 3.4 WebSocket 事件定义

**服务端 → 客户端：**
```
SWIPE_FAILURE_ALERT
{
  alertId: string (UUID),
  ruleId: number,
  ruleName: string,
  matchedRecords: [{ personName, personCode, departmentName, channelName,
                     openTypeLabel, swingTime }],
  count: number,
  windowSec: number,
  bannerDurationSec: number
}
```

**客户端 → 服务端：**
```
SWIPE_FAILURE_ALERT_ACK
{ alertId: string, userId: string }
```

**服务端 → 所有客户端（ACK 广播）：**
```
SWIPE_FAILURE_ALERT_DISMISS
{ alertId: string, dismissedBy: string }
```

## 4. 前端设计

### 4.1 配置页（Tab 新增）

在 `AdminStudentViolationsPage.tsx` 新增第5个 Tab `swipe-alert`（刷卡失败告警）：

```
Tab 结构:
┌──────────────────────────────────────────────────────┐
│ 未绑卡提示 │ 扫码弹窗公告 │ 新建违规 │ 违规记录 │ 🚨 刷卡失败告警 │
└──────────────────────────────────────────────────────┘
```

**告警规则列表卡片：**
- 表格列：名称、通道、部门、阈值（N次/M秒）、显示时长、状态（启用/停用开关）
- 操作：编辑、删除、查看最近告警

**新建/编辑规则表单卡片：**
- 规则名称（input）
- 启用（checkbox）
- 通道筛选 → 复用 `AccessChannelMultiSelect` 组件（inline 模式）
- 部门筛选 → 文本输入，逗号分隔部门名
- 开门类型 → checkbox 多选：非法刷卡(52) / 刷卡失败(0) / 全部
- 阈值次数（input number，默认 3）
- 时间窗口（input number + 单位选择：秒/分，默认 300秒）
- 横幅显示时长（input number，秒，0=不自动消失，默认 10）
- 通知标题模板（input，默认 `${dept}` 等变量组合）
- 通知正文模板（textarea，默认 `${persons}` 等变量组合）
- 最低通知角色 → 复用角色选择组件 `ROLE_LEVEL_MAP`，默认 ADMIN
- 冷却间隔（input number，秒，默认 60）

**可用模板变量：** `${count}` `${dept}` `${channel}` `${persons}` `${windowSec}` `${windowMin}` `${threshold}`

**复用组件：**
- `AdminPageShell` / `AdminFormCard` — 页面壳和表单容器
- `AdminPageTabs` / `AdminTabPanel` — Tab 切换
- `AccessChannelMultiSelect` — 通道多选（来自 `features/analytics`）
- `AdminButton` / `AdminTableShell` — 按钮和表格
- `UNBOUND_APPLY_ROLE_OPTIONS` — 角色选择项（来自 `scanPopupAnnouncement.api`）

### 4.2 灵动岛 Banner 组件

**文件：** `frontend/src/features/swipe-alert/SwipeFailureBanner.tsx`

**位置：** 挂载在 `App.tsx`，与 `<Toaster />` 同级

**视觉规格（灵动岛样式）：**
```
┌──────────────────────────────────────────────────┐
│  🚨 刷卡失败告警 · 物理学院              [查看→][已读✓] │
│  过去 5 分钟内 3 次非法刷卡，涉及：赵强、孙伟、吴敏      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━ (倒计时进度条)     │
└──────────────────────────────────────────────────┘
   ↑ 居中定位 top:16px    ↑ 黑色磨砂 bg    ↑ 圆角 28px
```

**技术规格：**
- `position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 9998`
- 背景 `#0f172a`（slate-900），圆角 28px，`backdrop-filter: blur(20px)`
- 进入动画：`opacity 0→1 + translateY(-24→0) + scale(0.85→1)`，500ms cubic-bezier
- 退出动画：`opacity 1→0 + translateY(0→-20) + scale(1→0.95)`，300ms
- 红色脉冲光环（图标外圈）：绝对定位伪元素，scale 1→2.2，opacity 0.8→0，2s 循环
- 倒计时进度条：绝对定位在文字下方，height 2px，`rgba(239,68,68,0.5)`，动画从 full→0 宽度，时长 = bannerDurationSec
- 字体：13px title bold，11px detail #94a3b8
- "已读"按钮：白色 bg，黑色文字，圆角 999px
- "查看详情"按钮：白色半透明 bg，圆角 999px，点击跳转到门禁记录库（带筛选条件）

**行为逻辑：**
- 监听 WebSocket `SWIPE_FAILURE_ALERT` → 渲染 Banner
- 若 `bannerDurationSec > 0` → 启动倒计时，到期自动 dismiss
- 点击"已读" → 发送 `SWIPE_FAILURE_ALERT_ACK` → 本地 dismiss
- 收到 `SWIPE_FAILURE_ALERT_DISMISS` → 本地 dismiss（远端已读联动）
- 新告警覆盖旧告警（同一时间只有一条，新来即替换）
- 仅当 `hasMinRole(currentRole, minRoleLevel)` 为 true 时渲染

### 4.3 WebSocket 集成

在 `App.tsx` 的 `GlobalSocketListener` 中新增事件订阅：

```ts
// 新订阅
socket.on("SWIPE_FAILURE_ALERT", handler);
socket.on("SWIPE_FAILURE_ALERT_DISMISS", handler);
```

状态管理：使用轻量 Zustand store 或 React state 管理当前活跃告警：
```ts
// store/useSwipeAlertStore.ts
interface SwipeAlertState {
  activeAlert: SwipeAlertPayload | null;
  show: (alert: SwipeAlertPayload) => void;
  dismiss: () => void;
}
```

### 4.4 路由与导航

- 配置 Tab 在现有页面 `/admin/student-violations?tab=swipe-alert`
- 不新增独立路由
- 灵动岛 Banner 不依赖路由，全局渲染

## 5. 可复用模块清单

| 模块 | 路径 | 用途 |
|------|------|------|
| `AccessChannelMultiSelect` | `features/analytics/AccessChannelMultiSelect.tsx` | 告警规则通道筛选 |
| `AdminPageShell` / `AdminFormCard` / `AdminTableShell` | `components/admin/AdminPageShell.tsx` | 配置页布局 |
| `AdminPageTabs` / `AdminTabPanel` | `components/admin/AdminPageTabs.tsx` | Tab 切换 |
| `AdminButton` | `components/admin/AdminButton.tsx` | 按钮 |
| `useSocket` / socket singleton | `hooks/useSocket.ts` | WebSocket 连接 |
| `UNBOUND_APPLY_ROLE_OPTIONS` | `api/domains/scanPopupAnnouncement.api.ts` | 角色多选 |
| `ROLE_LEVEL_MAP` / `hasMinRole` | `features/auth/roleAccess.ts` | 角色判断 |
| `toast` (react-hot-toast) | 全局 | 保存成功/失败反馈 |
| `AdminDahuaSwingTasksPage` Tab 系统 | `pages/AdminDahuaSwingTasksPage.tsx` | 通道选择 UI 参考模式 |

## 6. 新增文件清单

| 文件 | 说明 |
|------|------|
| `frontend/src/api/domains/swipeAlert.api.ts` | 告警规则 CRUD API 客户端 |
| `frontend/src/features/swipe-alert/SwipeAlertRuleList.tsx` | 规则列表卡片 |
| `frontend/src/features/swipe-alert/SwipeAlertRuleForm.tsx` | 新建/编辑规则表单卡片 |
| `frontend/src/features/swipe-alert/SwipeFailureBanner.tsx` | 灵动岛 Banner 组件 |
| `frontend/src/store/useSwipeAlertStore.ts` | 告警状态管理（Zustand） |
| （修改）`frontend/src/pages/AdminStudentViolationsPage.tsx` | 新增 Tab |
| （修改）`frontend/src/App.tsx` | 挂载 Banner + WS 监听 |
| （修改）`frontend/src/config/socketEvents.ts` | 新事件常量 |
| （后端）告警规则 CRUD API | 新 Controller + Service |
| （后端）规则引擎 | 新 Service（hook 到 swing record 写入流） |
| （后端）WebSocket 事件处理 | 扩展现有 WS handler |
| （后端）DB migration | swipe_alert_rule 建表 |

## 7. 边缘情况与错误处理

- **无活跃规则**：不触发任何告警，Banner 不渲染
- **同一规则连续触发**：冷却期（cooldown_sec）内重复命中不重复广播
- **WebSocket 断连**：重连后不回溯历史告警（避免轰炸），只接收新告警
- **多客户端已读竞态**：第一个 ACK 到达后服务端立即广播 DISMISS，后续 ACK 忽略
- **显示时长为 0**：Banner 不自动消失，等待手动已读或页面刷新
- **部门名/通道名为空**：规则匹配时跳过空字段，视为"全匹配"
- **非法角色（< ADMIN）**：Banner 组件检测角色不足时完全不渲染，即使 WS 事件到达也不展示
