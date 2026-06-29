# H5 首页豁免状态实时展示 — 设计文档

**日期**: 2026-06-29  
**分支**: feature/face-verification  
**状态**: 设计完成，待实施

---

## 1. 需求概述

在 H5 学生端首页的「进入状态」区域（`MobilePresenceStatusBar`）实时展示当前人员的豁免/延迟授权状态，作为明显提示。展示内容包括：授权房间、到期时间、权限模式、审核状态。

## 2. 安置方案

**方案 A：扩展 `MobilePresenceStatusBar` 内部**

在现有 PresenceBar 卡片底部追加一行豁免信息条，dashed 分隔线与现有进出状态行区隔。紧贴「进入状态」语义，不增加额外纵向卡片。

### 2.1 视觉样式

- 文案：「已授权」替代「豁免中」
- 图标：`Sparkles` (Lucide)，替代盾牌
- 颜色：绿色系（授权生效）、琥珀色（待审核）、红色（已过期）、灰色（已拒绝）
- 风格：与现有 pill（在场时长/签退倒计时）保持一致

## 3. 状态机

```
无申请 (none)
  │ 用户提交延迟免冻结申请
  ▼
已申请·待审核 (pending_review)  图标: Clock      颜色: 琥珀 #d97706
  ├─ 管理员通过 ──▶ 已授权·生效中 (approved_active)  图标: Sparkles  颜色: 绿 #16a34a
  │                  │ 到期/次数用尽
  │                  ▼
  │                已授权·已过期 (approved_expired)  图标: AlarmClock  颜色: 红 #dc2626
  │                  │ 次日清除
  │                  ▼
  │                none
  │
  └─ 管理员拒绝 ──▶ 已申请·已拒绝 (rejected)  图标: XCircle  颜色: 灰 #6b7280
                     │ 次日清除
                     ▼
                   none
```

### 3.1 各状态展示格式

| 状态 | 格式 |
|------|------|
| `none` | 不渲染豁免行 |
| `pending_review` | `已申请 · {房间列表} · 延长至 {时间} · 待审核` |
| `approved_active` (TIME/BOTH) | `已授权 · {房间列表} · 剩余 {时长} · 至 {时间}` |
| `approved_active` (COUNT) | `已授权 · {房间列表} · 剩余 {n}/{m} 次` |
| `approved_active` (BOTH) | `已授权 · {房间列表} · 剩余 {时长} · 剩余 {n}/{m} 次` |
| `approved_expired` | `已授权 · {房间列表} · 已到期（至 {时间}）` |
| `rejected` | `已申请 · {房间列表} · 已拒绝` |

### 3.2 当天清除规则

- `approved_expired`：后端定时任务每 60s 将到期 flag 置 0，次日凌晨统一清除
- `rejected`：后端仅返回当天创建的拒绝记录，次日不再返回

## 4. 数据模型

### 4.1 前端类型

```typescript
type ExemptDisplayPhase =
  | "none"
  | "pending_review"
  | "approved_active"
  | "approved_expired"
  | "rejected";

type ExemptStatus = {
  phase: ExemptDisplayPhase;
  mode: "TIME" | "COUNT" | "BOTH" | null;
  expireAt: string | null;       // yyyy-MM-dd HH:mm:ss
  remainingText: string;          // 前端计算，如 "剩余 2h30m"
  roomNames: string[];            // ["P3实验室", "P5实验室"]
  maxCount: number | null;
  usedCount: number;
  requestId?: number;             // pending/rejected 时用
};
```

`MobilePresenceSnapshot` 新增 `exemptStatus?: ExemptStatus | null`。

### 4.2 后端 DTO

新建 `ExemptStatusDTO`，字段对应前端 `ExemptStatus`。`phase` 由后端综合 `twin_card_mapping` 和 `twin_scan_delay_request` 推导。

## 5. 架构与数据流

### 5.1 两条 H5 路径

| | 直链 Token 模式 | 登录 JWT 模式 |
|------|------|------|
| 入口 | `/m/sc/:token` | `/m/home` |
| HTTP | `publicHttp` | `authHttp` |
| 数据源 | `GET /public/mobile-center/{token}/room-dashboard` | `GET /student/mobile/exempt-status` |
| 策略 | analyze DTO 内嵌 exemptStatus | 独立轻量接口 |

### 5.2 数据流

```
Token 模式:
  fetchMobileRoomDashboard → MobileRoomAnalyzeDto.exemptStatus
    → useMobilePresenceStatus 提取 → MobilePresenceSnapshot.exemptStatus
      → MobilePresenceStatusBar 渲染

JWT 模式:
  fetchStudentMobileExemptStatus → ExemptStatusDto
    → useMobilePresenceStatus 补充 → MobilePresenceSnapshot.exemptStatus
      → MobilePresenceStatusBar 渲染
```

### 5.3 计时策略

复用 `useMobilePresenceStatus` 现有 1s tick 机制。在 useMemo 内根据 `expireAt - Date.now()` 实时计算 `remainingText`。归零时本地切换 `phase → approved_expired`。

### 5.4 WebSocket 联动

`presenceRefresh` 通知 → `load()` 重拉 → 豁免状态随 dashboard 一起刷新，无需额外机制。

## 6. 涉及文件

### 前端

| 文件 | 变更 |
|------|------|
| `frontend/src/pages/mobile/useMobilePresenceStatus.ts` | `MobilePresenceSnapshot` 加 `exemptStatus`，JWT 模式补充调用 |
| `frontend/src/pages/mobile/mobilePresenceTheme.ts` | 新增 `EXEMPT_DISPLAY` 主题映射 |
| `frontend/src/pages/mobile/MobilePresenceStatusBar.tsx` | 渲染豁免行 |
| `frontend/src/api/domains/studentMobile.api.ts` | 🆕 `fetchStudentMobileExemptStatus()` |
| `frontend/src/api/domains/mobileStudent.api.ts` | `MobileRoomAnalyzeDto` 加 `exemptStatus` |
| `frontend/src/constants/exemptDurationPresets.ts` | 已有 `formatExemptRemaining` 等工具，复用 |

### 后端

| 文件 | 变更 |
|------|------|
| `ScanAnalyzeResponseDTO.java` | 加 `exemptStatus` 字段 |
| `ExemptStatusDTO.java` | 🆕 新建 |
| `TwinScanAppService.java` | `analyzeScan()` 填充 exemptStatus |
| `StudentMobileController.java` | 🆕 `GET /student/mobile/exempt-status` |
| `MobileStudentController.java` | 确认 room-dashboard token 路径包含 exemptStatus |

## 7. 边界情况

| 场景 | 处理 |
|------|------|
| 无网络/接口超时 | `exemptStatus = null`，静默不显示，不阻塞页面 |
| 豁免被管理员撤销 | WebSocket → presenceRefresh → phase → `none` |
| 同时多条延迟申请 | 取 `created_at` 最新一条 |
| `freezeExemptRoomIds` JSON 解析失败 | `roomNames = []`，显示"—" |
| OUTSIDE/UNKNOWN 但有豁免 | 照样显示豁免行（豁免不依赖进出状态） |
| `expireAt` 格式异常 | `try-catch` → `remainingText = "—"` |
| JWT exempt-status 接口失败 | 静默，不显示豁免行 |
| COUNT 次数用尽 | 后端 `usedCount >= maxCount` → phase → `approved_expired` |
