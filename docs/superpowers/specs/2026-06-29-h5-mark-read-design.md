# H5 通知页面 — 点击进入即标记已读

**日期**: 2026-06-29  
**分支**: feature/face-verification  
**状态**: 设计完成，待实施

---

## 1. 需求概述

用户点击 H5 首页「通知」按钮打开反馈通知面板时，自动将该用户所有未读的反馈类通知标记为已读。首页通知角标随之消失。

## 2. 范围限定

仅标记**反馈类通知**（`material_feedback`、`scan_delay_feedback`），对应 `StudentNotification` 表。公告/违规/豁免是全局通知，不涉及个人已读状态。

## 3. 数据流

```
用户点击「通知」
  → openFeedback()
    → loadAlerts() 拉列表
    → markAllAlertsRead() 标已读（fire-and-forget）
    → 下次 loadAlerts → isRead=true → 角标归零
```

## 4. 后端

### 4.1 新增批量已读接口

**JWT 路径**: `POST /api/student/mobile/alerts/read-all`  
**Token 路径**: `POST /api/public/mobile-center/{token}/alerts/read-all`

内部均调用 `studentNotificationMapper.markAllReadByUserId(userId)`，将该用户所有 `is_read=0` 的 `student_notification` 记录更新为 `is_read=1`。

### 4.2 涉及后端文件

| 文件 | 变更 |
|------|------|
| `StudentMobileController.java` | 🆕 `POST /alerts/read-all` |
| `StudentMobileCenterController.java` | 🆕 `POST /{token}/alerts/read-all` |
| `StudentNotificationMapper.java` | 🆕 `markAllReadByUserId`（如不存在） |

## 5. 前端

### 5.1 新增 API 函数

```typescript
// studentMobile.api.ts (JWT)
markStudentMobileAlertsReadAll(): Promise<void>
  → POST /student/mobile/alerts/read-all

// mobileStudent.api.ts (Token)  
markMobileAlertsReadAll(token: string): Promise<void>
  → POST /public/mobile-center/{token}/alerts/read-all
```

### 5.2 调用点

`MobileStudentCenterPage.tsx` 的 `openFeedback()` 中，`loadAlerts()` 后追加调用，fire-and-forget。

### 5.3 涉及前端文件

| 文件 | 变更 |
|------|------|
| `frontend/src/api/domains/studentMobile.api.ts` | 🆕 `markStudentMobileAlertsReadAll` |
| `frontend/src/api/domains/mobileStudent.api.ts` | 🆕 `markMobileAlertsReadAll` |
| `frontend/src/pages/mobile/MobileStudentCenterPage.tsx` | `openFeedback()` 追加调用 |

## 6. 边界情况

| 场景 | 处理 |
|------|------|
| 无未读通知 | 接口幂等，不报错 |
| 接口失败 | fire-and-forget，不影响面板展示 |
| 网络延迟 | 本次面板可能仍显示旧角标，下次打开刷新 |
