# 学生端门户 Phase 2 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Phase 1 的学生端骨架扩展为功能完整的后台，覆盖数据聚合、房间管理、违规记录、通知公告、帮助反馈五大能力域。

**Architecture:** 后端新增 6 个 API 端点（独立端点策略），复用 aro/twin/notification 模块现有数据源。前端新增 7 个 UI 组件，重写/新增 6 个页面。TanStack Query 独立缓存每个数据域，侧边栏 5→7 项扁平列表。

**Tech Stack:** Spring Boot 3.x (Java), React 18 + TypeScript, TanStack Query, Tailwind CSS, Radix UI primitives, Lucide icons

**Design Spec:** [2026-05-29-student-portal-phase2-design.md](../specs/2026-05-29-student-portal-phase2-design.md)

---

## File Structure Map

```
Backend (src/main/java/com/example/demo/modules/student/):
  controller/
    StudentDashboardController.java   ← NEW: 仪表盘聚合端点
    StudentRoomController.java        ← NEW: 房间列表 + 置顶
    StudentStatsController.java       ← NEW: 统计数据
    StudentNotificationController.java ← NEW: 通知合并列表
    StudentFeedbackController.java    ← NEW: FAQ + 工单
    StudentAuthController.java        ← EXISTING
    StudentProfileController.java     ← MODIFY: 移除占位，违规划到新控制器

  service/
    StudentDashboardService.java      ← NEW
    StudentRoomService.java           ← NEW
    StudentStatsService.java          ← NEW
    StudentNotificationService.java   ← NEW
    StudentFeedbackService.java       ← NEW
    StudentRegistrationService.java   ← EXISTING
    StudentProfileService.java        ← EXISTING

  dto/
    StudentDashboardResponse.java     ← NEW
    StudentRoomResponse.java          ← NEW
    StudentStatsResponse.java         ← NEW
    StudentNotificationResponse.java  ← NEW
    StudentViolationResponse.java     ← NEW
    StudentFeedbackTicketRequest.java ← NEW
    (Phase 1 DTOs kept as-is)

  entity/
    StudentRoomPin.java               ← NEW: 房间置顶关联表
    StudentFeedbackTicket.java        ← NEW: 留言工单表
    StudentNotificationRead.java      ← NEW: 通知已读记录表

Frontend (frontend/src/features/student/):
  components/ui/
    room-card.tsx                     ← NEW
    view-toggle.tsx                   ← NEW
    bar-chart.tsx                     ← NEW
    stat-panel.tsx                    ← NEW
    notification-item.tsx             ← NEW
    faq-accordion.tsx                 ← NEW
    feedback-form.tsx                 ← NEW
    (Phase 1 17 components + index.ts kept, index.ts MODIFY)

  hooks/
    use-student-dashboard.ts          ← NEW
    use-student-rooms.ts             ← NEW
    use-student-stats.ts             ← NEW
    use-student-notifications.ts     ← NEW
    use-student-violations.ts        ← NEW
    use-student-feedback.ts          ← NEW
    (Phase 1 hooks + index.ts kept, index.ts MODIFY)

  api/
    student.api.ts                    ← MODIFY: 追加 Phase 2 函数

  pages/
    student-home.tsx                  ← REWRITE: 仪表盘 V2
    student-records.tsx               ← REWRITE: 双 Tab + 违规
    student-rooms.tsx                 ← NEW
    student-stats.tsx                 ← NEW
    student-notifications.tsx         ← NEW
    student-feedback.tsx              ← NEW
    student-permissions.tsx           ← REMOVE
    student-profile.tsx               ← REMOVE (集成到仪表盘)
    (student-login/register/settings kept)

  components/layout/
    student-sidebar.tsx               ← MODIFY: 导航项重构

Frontend router:
  src/router/index.tsx                ← MODIFY: 路由变更
```

---

### Task 1: Backend — Dashboard 聚合端点

**Files:**
- Create: `src/main/java/com/example/demo/modules/student/controller/StudentDashboardController.java`
- Create: `src/main/java/com/example/demo/modules/student/service/StudentDashboardService.java`
- Create: `src/main/java/com/example/demo/modules/student/dto/StudentDashboardResponse.java`

**Description:** 新建 `GET /api/student/dashboard`，从多个数据源聚合仪表盘所需全部摘要数据。在现有 `StudentProfileController` 中已有 `/profile` 端点，dashboard 端点在本控制器独立放置以保持职责清晰。

- [ ] **Step 1: 创建 DTO**

  `StudentDashboardResponse.java` — 内嵌 5 个静态内部类：

  | 内部类 | 字段 | 类型 | 来源 |
  |--------|------|------|------|
  | `ProfileSummary` | name, departmentName, projectGroupName, roleLabel, authStatus | String×4, String | aro_personnel + sys_user |
  | `StatsSummary` | todayAccessCount, violationCount, unreadNoticeCount, accessibleRoomCount | int×4 | access 记录 + twin 违规 + 通知 + aro 权限 |
  | `PinnedRoom` | roomName, floor, zone, occupantCount, capacity, status(idle/busy/full) | String×3, int×2, String | aro_personnel.allowed_rooms + 实时占用数据 |
  | `RecentRecord` | time, type(进入/离开), roomName | String×3 | access 记录最近 5 条 |
  | `RecentNotice` | title, type(ARO/PLATFORM), publishDate | String×3 | ARO news + 平台公告最近 3 条 |

  所有字段加 `@JsonInclude(NON_NULL)`。

- [ ] **Step 2: 创建 Service**

  `StudentDashboardService.java` — 注入 `AroPersonnelMapper`, `StudentProfileService`（复用 buildProfile 已有逻辑），新增方法：

  - `buildDashboard(User user)` → 组装 `StudentDashboardResponse`
  - `countTodayAccess(User user)` → 查 access 记录今日次数（需注入 Access 相关 Mapper）
  - `fetchPinnedRooms(User user)` → 查 `student_room_pin` 表 + aro_personnel.allowed_rooms
  - `fetchRecentRecords(User user)` → access 最近 5 条
  - `fetchRecentNotices()` → ARO news + 平台公告最近 3 条

  未就绪的数据源（access 记录、实时占用、通知合并）先返回硬编码占位值，后续 Task 逐步接入。

- [ ] **Step 3: 创建 Controller**

  `StudentDashboardController.java` — `@RestController`, `@RequestMapping("/api/student")`，构造函数注入 `AuthContextService` + `StudentDashboardService`：

  ```
  GET /api/student/dashboard → Result<StudentDashboardResponse>
  ```

  参考 `StudentProfileController` 的认证解析模式（`authContextService.resolveUserFromBearer`）。

- [ ] **Step 4: 编译验证**

  ```bash
  cd d:/codex/verson.1.2/20260416 && mvn compile -q
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/main/java/com/example/demo/modules/student/controller/StudentDashboardController.java \
          src/main/java/com/example/demo/modules/student/service/StudentDashboardService.java \
          src/main/java/com/example/demo/modules/student/dto/StudentDashboardResponse.java
  git commit -m "feat: add student dashboard aggregation endpoint"
  ```

---

### Task 2: Backend — 违规记录端点

**Files:**
- Create: `src/main/java/com/example/demo/modules/student/dto/StudentViolationResponse.java`
- Modify: `src/main/java/com/example/demo/modules/student/controller/StudentProfileController.java`

**Description:** 新增 `GET /api/student/violations`，从 twin 模块的 `TwinStudentViolationMapper` 查询当前学生的违规记录。直接挂在 `StudentProfileController` 中（不新建文件），减少碎片化。

- [ ] **Step 1: 创建 DTO**

  `StudentViolationResponse.java` — 字段：`id (String)`, `time (LocalDateTime)`, `type (String)`, `roomName (String)`, `doorName (String)`, `description (String)`, `penalty (String)`, `status (String: pending/processed/appealing)`, `processedBy (String)`, `processedTime (LocalDateTime)`。

- [ ] **Step 2: 在 ProfileController 中添加端点**

  `StudentProfileController.java` 新增方法：

  ```
  GET /api/student/violations?page=1&size=20&startDate=&endDate=
    → Result<Map<String, Object>> { data: StudentViolationResponse[], total }
  ```

  注入 `TwinStudentViolationMapper`（`com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper`）。实现逻辑：
  1. `authContextService.resolveUserFromBearer` 获取当前用户
  2. 通过 `AroPersonnelMapper` 查找关联的 aro personnel（拿到 user_id）
  3. 用 user_id 查询 `TwinStudentViolationMapper` 的分页方法

- [ ] **Step 3: 编译验证**

  ```bash
  cd d:/codex/verson.1.2/20260416 && mvn compile -q
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/main/java/com/example/demo/modules/student/dto/StudentViolationResponse.java \
          src/main/java/com/example/demo/modules/student/controller/StudentProfileController.java
  git commit -m "feat: add student violation records endpoint"
  ```

---

### Task 3: Backend — 房间列表 + 置顶端点

**Files:**
- Create: `src/main/java/com/example/demo/modules/student/controller/StudentRoomController.java`
- Create: `src/main/java/com/example/demo/modules/student/service/StudentRoomService.java`
- Create: `src/main/java/com/example/demo/modules/student/dto/StudentRoomResponse.java`
- Create: `src/main/java/com/example/demo/modules/student/entity/StudentRoomPin.java`

**Description:** 新建 `GET /api/student/rooms` 和 `PUT /api/student/rooms/{roomId}/pin`。房间列表数据来自 aro_personnel 的 `allowed_rooms` 字段解析 + 实时占用数据（如暂无实时数据源则返回 capacity 占位值）。

- [ ] **Step 1: 创建 entity**

  `StudentRoomPin.java` — `@Table("student_room_pin")`，字段：`id (Long, PK, AUTO)`, `userId (String, 关联 sys_user.id)`, `roomName (String)`, `createdAt (LocalDateTime)`。唯一约束 `(userId, roomName)`。

- [ ] **Step 2: 创建 DTO**

  `StudentRoomResponse.java` — 字段：`roomId (String)`, `roomName (String)`, `floor (String)`, `zone (String)`, `occupantCount (int)`, `capacity (int)`, `occupancyRate (int, 百分比 0-100)`, `status (String: idle/busy/full)`, `isPinned (boolean)`。

- [ ] **Step 3: 创建 Service**

  `StudentRoomService.java` — 注入 `AroPersonnelMapper`，新增方法：

  - `getRooms(User user, String pinned, String floor, String status, String search, int page, int size)` → 分页结果
    - 从 aro_personnel.allowed_rooms 解析出所有可访问房间
    - 查询 `student_room_pin` 表标记 isPinned
    - pinned=1 时仅返回置顶房间并忽略分页
    - 支持 floor/status/search 筛选
  - `togglePin(User user, String roomId)` → 翻转置顶状态
  - `getOccupantCount(String roomName)` → 实时在室人数（当前返回 0 占位，后续接入 access 实时查询）

- [ ] **Step 4: 创建 Controller**

  `StudentRoomController.java`：
  ```
  GET  /api/student/rooms?pinned=&floor=&status=&search=&page=&size=
       → Result<Map<String, Object>> { data: StudentRoomResponse[], total, page, size }
  PUT  /api/student/rooms/{roomId}/pin
       → Result<Void>
  ```

- [ ] **Step 5: 编译验证 + Commit**

  ```bash
  cd d:/codex/verson.1.2/20260416 && mvn compile -q
  git add src/main/java/com/example/demo/modules/student/controller/StudentRoomController.java \
          src/main/java/com/example/demo/modules/student/service/StudentRoomService.java \
          src/main/java/com/example/demo/modules/student/dto/StudentRoomResponse.java \
          src/main/java/com/example/demo/modules/student/entity/StudentRoomPin.java
  git commit -m "feat: add student room list and pin endpoints"
  ```

---

### Task 4: Backend — 统计数据端点

**Files:**
- Create: `src/main/java/com/example/demo/modules/student/controller/StudentStatsController.java`
- Create: `src/main/java/com/example/demo/modules/student/service/StudentStatsService.java`
- Create: `src/main/java/com/example/demo/modules/student/dto/StudentStatsResponse.java`

**Description:** 新建 `GET /api/student/stats?period=30d`，从 access 记录计算所有统计数据。当前 access 数据可能未就绪，先返回占位数据结构。

- [ ] **Step 1: 创建 DTO**

  `StudentStatsResponse.java` — 内嵌类：

  | 内部类 | 字段 | 说明 |
  |--------|------|------|
  | `PeriodInfo` | start, end (LocalDate), days (int) | 统计周期 |
  | `SummaryInfo` | totalAccess, dailyAvg, attendanceDays, roomCount, violationCount | 摘要数字 |
  | `DailyTrend` | date (LocalDate), count (int) | 每日进出趋势 |
  | `HourlyDist` | bucket (String: 00-06/06-12/12-18/18-24), count (int) | 时段分布 |
  | `RoomDist` | roomName (String), count (int), percentage (int) | 房间分布 |
  | `StayDuration` | roomName (String), durationMinutes (int) | 平均在室时长 |

- [ ] **Step 2: 创建 Service**

  `StudentStatsService.java` — `buildStats(User user, String period)` 方法返回占位数据（summary 全为 0，趋势/分布/时长列表为空），待 access 记录 API 就绪后接入真实计算。

- [ ] **Step 3: 创建 Controller**

  `StudentStatsController.java`：
  ```
  GET /api/student/stats?period=30d → Result<StudentStatsResponse>
  ```

- [ ] **Step 4: 编译验证 + Commit**

  ```bash
  cd d:/codex/verson.1.2/20260416 && mvn compile -q
  git add src/main/java/com/example/demo/modules/student/controller/StudentStatsController.java \
          src/main/java/com/example/demo/modules/student/service/StudentStatsService.java \
          src/main/java/com/example/demo/modules/student/dto/StudentStatsResponse.java
  git commit -m "feat: add student stats endpoint"
  ```

---

### Task 5: Backend — 通知合并端点

**Files:**
- Create: `src/main/java/com/example/demo/modules/student/controller/StudentNotificationController.java`
- Create: `src/main/java/com/example/demo/modules/student/service/StudentNotificationService.java`
- Create: `src/main/java/com/example/demo/modules/student/dto/StudentNotificationResponse.java`
- Create: `src/main/java/com/example/demo/modules/student/entity/StudentNotificationRead.java`

**Description:** 新建 `GET /api/student/notifications`，合并 ARO 新闻 + 平台公告两个数据源为统一列表。

- [ ] **Step 1: 创建 entity**

  `StudentNotificationRead.java` — `@Table("student_notification_read")`，字段：`id (Long, PK, AUTO)`, `userId (String)`, `noticeId (String)`, `readAt (LocalDateTime)`。用于追踪平台公告的已读状态（ARO 新闻根据发布时间判定）。

- [ ] **Step 2: 创建 DTO**

  `StudentNotificationResponse.java` — 字段：`id (String)`, `title (String)`, `summary (String)`, `type (String: ARO/PLATFORM)`, `publishDate (LocalDateTime)`, `isRead (boolean)`, `sourceUrl (String, nullable)`。

- [ ] **Step 3: 创建 Service**

  `StudentNotificationService.java` — 注入 ARO 新闻源（`PublicAroNewsController` 对应的 Service/Mapper）+ 平台公告源（`NotificationPushService`）：

  - `getNotifications(User user, String type, int page, int size)` → 分页结果
    - type=null：合并两个数据源，按 publishDate 倒序
    - type=ARO：仅 ARO 新闻
    - type=PLATFORM：仅平台公告
    - ARO 来源的 isRead 根据 publishDate vs 注册时间判断
    - 平台公告的 isRead 查 `student_notification_read` 表
  - `markRead(User user, Long noticeId)` → 写入已读记录

- [ ] **Step 4: 创建 Controller**

  `StudentNotificationController.java`：
  ```
  GET  /api/student/notifications?type=&page=&size=
       → Result<Map<String, Object>> { data, total, unreadCount }
  PUT  /api/student/notifications/{id}/read
       → Result<Void>
  ```

- [ ] **Step 5: 编译验证 + Commit**

  ```bash
  cd d:/codex/verson.1.2/20260416 && mvn compile -q
  git add src/main/java/com/example/demo/modules/student/controller/StudentNotificationController.java \
          src/main/java/com/example/demo/modules/student/service/StudentNotificationService.java \
          src/main/java/com/example/demo/modules/student/dto/StudentNotificationResponse.java \
          src/main/java/com/example/demo/modules/student/entity/StudentNotificationRead.java
  git commit -m "feat: add student notification merge endpoint"
  ```

---

### Task 6: Backend — 帮助反馈端点

**Files:**
- Create: `src/main/java/com/example/demo/modules/student/controller/StudentFeedbackController.java`
- Create: `src/main/java/com/example/demo/modules/student/service/StudentFeedbackService.java`
- Create: `src/main/java/com/example/demo/modules/student/dto/StudentFeedbackTicketRequest.java`
- Create: `src/main/java/com/example/demo/modules/student/entity/StudentFeedbackTicket.java`

**Description:** 新建 FAQ 查询和工单 CRUD 端点。

- [ ] **Step 1: 创建 entity**

  `StudentFeedbackTicket.java` — `@Table("student_feedback_ticket")`，字段：`id (Long, PK, AUTO)`, `userId (String)`, `subject (String)`, `content (String, TEXT)`, `type (String: suggestion/bug/appeal)`, `status (String: pending/replied/closed)`, `createdAt (LocalDateTime)`, `updatedAt (LocalDateTime)`。

- [ ] **Step 2: 创建 DTO**

  `StudentFeedbackTicketRequest.java` — 字段：`subject (String, @NotBlank)`, `content (String, @NotBlank)`, `type (String, default "suggestion")`。

- [ ] **Step 3: 创建 Service**

  `StudentFeedbackService.java`：
  - `getFaqGroups()` → 返回 FAQ 分组列表（当前硬编码 3 组："门禁使用""账号管理""违规申诉"，后续改为数据库驱动）
  - `getTickets(User user, int page, int size)` → 分页工单列表
  - `createTicket(User user, StudentFeedbackTicketRequest req)` → 新建工单
  - `getTicketDetail(Long ticketId)` → 工单详情（含回复链，回复功能后续扩展）

- [ ] **Step 4: 创建 Controller**

  `StudentFeedbackController.java`：
  ```
  GET    /api/student/feedback/faq → Result<List<FaqGroup>>
  GET    /api/student/feedback/tickets?page=&size= → Result<Map<String, Object>>
  POST   /api/student/feedback/tickets → Result<StudentFeedbackTicket>
  ```

- [ ] **Step 5: 编译验证 + Commit**

  ```bash
  cd d:/codex/verson.1.2/20260416 && mvn compile -q
  git add src/main/java/com/example/demo/modules/student/controller/StudentFeedbackController.java \
          src/main/java/com/example/demo/modules/student/service/StudentFeedbackService.java \
          src/main/java/com/example/demo/modules/student/dto/StudentFeedbackTicketRequest.java \
          src/main/java/com/example/demo/modules/student/entity/StudentFeedbackTicket.java
  git commit -m "feat: add student feedback and FAQ endpoints"
  ```

---

### Task 7: Frontend — RoomCard + ViewToggle + BarChart 组件

**Files:**
- Create: `frontend/src/features/student/components/ui/room-card.tsx`
- Create: `frontend/src/features/student/components/ui/view-toggle.tsx`
- Create: `frontend/src/features/student/components/ui/bar-chart.tsx`
- Modify: `frontend/src/features/student/components/ui/index.ts`

**Description:** 创建 3 个新 UI 组件。所有组件使用 `--student-*` 设计令牌，用 `forwardRef` 模式，保持与 Phase 1 组件一致。

- [ ] **Step 1: 创建 RoomCard**

  `room-card.tsx` — Props：
  ```typescript
  interface RoomCardProps {
    roomName: string;
    floor: string;
    zone: string;
    occupantCount: number;
    capacity: number;
    status: 'idle' | 'busy' | 'full';
    isPinned?: boolean;
    onTogglePin?: () => void;
    onClick?: () => void;
    className?: string;
  }
  ```

  渲染逻辑：
  - 卡片容器：`rounded-[var(--student-radius-md)]`，边框 `--student-hairline`，padding 14px
  - 左侧状态色条：`border-l-[3px]`，颜色由 status 决定（idle=绿/busy=琥珀/full=红）
  - 顶部行：房间名（`font-weight:600`）+ 状态 Badge（复用 Phase 1 Badge 组件）
  - 位置行：楼层 · 区域（`caption` 灰色）
  - 人数行：在室 X人 / 容量 X人
  - 占用进度条：`height:4px`，`background:--student-hairline`，内层宽度 `{occupancyRate}%`，颜色同 status
  - 悬停时右上角出现 ⭐ 置顶/取消按钮（opacity 过渡）

- [ ] **Step 2: 创建 ViewToggle**

  `view-toggle.tsx` — Props：
  ```typescript
  interface ViewToggleProps {
    value: 'card' | 'list';
    onChange: (view: 'card' | 'list') => void;
  }
  ```

  渲染两个图标按钮（网格 ▦ / 列表 ▤），选中态 `bg-[var(--student-primary-soft)] text-[var(--student-primary)]`。

- [ ] **Step 3: 创建 BarChart**

  `bar-chart.tsx` — 纯 CSS 柱状图，不引入图表库：
  ```typescript
  interface BarChartProps {
    data: { label: string; value: number; maxValue?: number }[];
    height?: number;  // 默认 120px
    color?: string;   // 默认 --student-primary
    showLabel?: boolean;
    showValue?: boolean;
  }
  ```

  渲染逻辑：
  - 横向 flex 容器，`align-items:flex-end`，gap 自动均分
  - 每根柱子：底部 label + value 文字，柱体 `rounded-t`，高度 `(value / maxValue) * height`
  - 柱体颜色：多柱时使用 `--student-primary` 不同透明度（100→400→500→600 等）

- [ ] **Step 4: 更新 barrel export**

  在 `index.ts` 追加：
  ```typescript
  export { RoomCard } from "./room-card";
  export type { RoomCardProps } from "./room-card";
  export { ViewToggle } from "./view-toggle";
  export type { ViewToggleProps } from "./view-toggle";
  export { BarChart } from "./bar-chart";
  export type { BarChartProps } from "./bar-chart";
  ```

- [ ] **Step 5: TypeCheck + Commit**

  ```bash
  cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit --pretty 2>&1 | head -20
  git add frontend/src/features/student/components/ui/
  git commit -m "feat: add RoomCard, ViewToggle, BarChart components"
  ```

---

### Task 8: Frontend — StatPanel + NotificationItem + FaqAccordion + FeedbackForm 组件

**Files:**
- Create: `frontend/src/features/student/components/ui/stat-panel.tsx`
- Create: `frontend/src/features/student/components/ui/notification-item.tsx`
- Create: `frontend/src/features/student/components/ui/faq-accordion.tsx`
- Create: `frontend/src/features/student/components/ui/feedback-form.tsx`
- Modify: `frontend/src/features/student/components/ui/index.ts`

- [ ] **Step 1: 创建 StatPanel**

  `stat-panel.tsx` — 可插拔统计面板容器：
  ```typescript
  interface StatPanelProps {
    title: string;
    children: React.ReactNode;
    className?: string;
    emptyText?: string;
    isEmpty?: boolean;
  }
  ```
  渲染：Card 样式容器 + 标题 + 内容区。`isEmpty=true` 时渲染 EmptyState 组件。

- [ ] **Step 2: 创建 NotificationItem**

  `notification-item.tsx`：
  ```typescript
  interface NotificationItemProps {
    title: string;
    summary: string;
    type: 'ARO' | 'PLATFORM';
    publishDate: string;
    isRead: boolean;
    onClick: () => void;
  }
  ```
  渲染：左侧红点（未读）+ 类型 Badge（红/蓝）+ 标题（未读加粗）+ 日期 + 摘要（2行截断 `line-clamp-2`）。整行可点击。

- [ ] **Step 3: 创建 FaqAccordion**

  `faq-accordion.tsx`：
  ```typescript
  interface FaqGroup {
    category: string;
    items: { question: string; answer: string }[];
  }
  interface FaqAccordionProps {
    groups: FaqGroup[];
    searchQuery?: string;
  }
  ```
  渲染：手风琴折叠面板，每个分组一个 `details/summary` 或 Radix Accordion。支持搜索高亮。

- [ ] **Step 4: 创建 FeedbackForm**

  `feedback-form.tsx`：
  ```typescript
  interface FeedbackFormProps {
    onSubmit: (data: { subject: string; content: string; type: string }) => Promise<void>;
    isSubmitting: boolean;
  }
  ```
  渲染：主题 Input + 类型 Select（建议/故障/申诉）+ 内容 textarea + 提交 Button。参考 Phase 1 StudentInput/StudentButton 组件。

- [ ] **Step 5: 更新 barrel export + TypeCheck + Commit**

  ```bash
  cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit --pretty 2>&1 | head -20
  git add frontend/src/features/student/components/ui/
  git commit -m "feat: add StatPanel, NotificationItem, FaqAccordion, FeedbackForm components"
  ```

---

### Task 9: Frontend — API 客户端 + Hooks 扩展

**Files:**
- Modify: `frontend/src/features/student/api/student.api.ts`
- Create: `frontend/src/features/student/hooks/use-student-dashboard.ts`
- Create: `frontend/src/features/student/hooks/use-student-rooms.ts`
- Create: `frontend/src/features/student/hooks/use-student-stats.ts`
- Create: `frontend/src/features/student/hooks/use-student-notifications.ts`
- Create: `frontend/src/features/student/hooks/use-student-violations.ts`
- Create: `frontend/src/features/student/hooks/use-student-feedback.ts`
- Modify: `frontend/src/features/student/hooks/index.ts`

- [ ] **Step 1: 扩展 API 客户端**

  在 `student.api.ts` 末尾追加 Phase 2 函数和类型。每个函数遵循现有模式（`authHttp.get/post` → 检查 `res.data.success` → 返回 `res.data.data`）。

  新增类型定义（与后端 DTO 对齐）：

  | 类型 | 关键字段 |
  |------|---------|
  | `StudentDashboard` | `profile: ProfileSummary`, `stats: StatsSummary`, `pinnedRooms: PinnedRoom[]`, `recentRecords: RecentRecord[]`, `recentNotices: RecentNotice[]` |
  | `StudentRoom` | `roomId, roomName, floor, zone, occupantCount, capacity, occupancyRate, status, isPinned` |
  | `StudentStats` | `period: PeriodInfo`, `summary: SummaryInfo`, `dailyTrend: DailyTrend[]`, `hourlyDistribution: HourlyDist[]`, `roomDistribution: RoomDist[]`, `avgStayDuration: StayDuration[]` |
  | `StudentNotification` | `id, title, summary, type, publishDate, isRead, sourceUrl` |
  | `StudentViolation` | `id, time, type, roomName, doorName, description, penalty, status, processedBy, processedTime` |
  | `FeedbackTicket` | `id, subject, content, type, status, createdAt, updatedAt` |
  | `FaqGroup` | `category: string`, `items: { question, answer }[]` |

  新增函数：

  ```
  fetchStudentDashboard()           → GET  /api/student/dashboard
  fetchStudentRooms(params)          → GET  /api/student/rooms
  toggleRoomPin(roomId)              → PUT  /api/student/rooms/{roomId}/pin
  fetchStudentStats(period)          → GET  /api/student/stats
  fetchStudentNotifications(params)  → GET  /api/student/notifications
  markNotificationRead(id)           → PUT  /api/student/notifications/{id}/read
  fetchStudentViolations(params)     → GET  /api/student/violations
  fetchFaqGroups()                   → GET  /api/student/feedback/faq
  fetchFeedbackTickets(page, size)   → GET  /api/student/feedback/tickets
  createFeedbackTicket(data)         → POST /api/student/feedback/tickets
  ```

- [ ] **Step 2: 创建 6 个新 Hooks**

  每个 hook 遵循 `useStudentProfile` 的模式：`useQuery` / `useMutation`，`queryKey` 以 `["student", ...]` 为前缀，`staleTime` 按数据特性设置：

  | Hook | Query Key | staleTime |
  |------|-----------|-----------|
  | `useStudentDashboard` | `["student", "dashboard"]` | 60s |
  | `useStudentRooms` | `["student", "rooms", params]` | 30s（实时占用） |
  | `useStudentStats` | `["student", "stats", period]` | 5min |
  | `useStudentNotifications` | `["student", "notifications", params]` | 30s |
  | `useStudentViolations` | `["student", "violations", params]` | 5min |
  | `useStudentFeedback` | `["student", "feedback"]` (含 useMutation) | 60s |

- [ ] **Step 3: 更新 barrel exports + TypeCheck + Commit**

  ```bash
  cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit --pretty 2>&1 | head -30
  git add frontend/src/features/student/api/ frontend/src/features/student/hooks/
  git commit -m "feat: add Phase 2 API client functions and hooks"
  ```

---

### Task 10: Frontend — 侧边栏 + 路由重构

**Files:**
- Modify: `frontend/src/features/student/components/layout/student-sidebar.tsx`
- Modify: `frontend/src/router/index.tsx`

- [ ] **Step 1: 重构侧边栏导航项**

  `student-sidebar.tsx` 中的 `navItems` 数组替换为：

  ```typescript
  import { Home, FileText, DoorOpen, BarChart3, Bell, MessageSquare, Settings } from "lucide-react";

  const navItems: NavItem[] = [
    { to: "/student/home", icon: Home, label: "首页" },
    { to: "/student/records", icon: FileText, label: "出入记录" },
    { to: "/student/rooms", icon: DoorOpen, label: "我的房间" },
    { to: "/student/stats", icon: BarChart3, label: "数据统计" },
    { to: "/student/notifications", icon: Bell, label: "通知" },
  ];

  const bottomItems: NavItem[] = [
    { to: "/student/feedback", icon: MessageSquare, label: "帮助反馈" },
    { to: "/student/settings", icon: Settings, label: "设置" },
  ];
  ```

  底部辅助项（帮助反馈/设置）用分隔线 `border-t` 隔开，与主导航区分。

- [ ] **Step 2: 更新路由配置**

  `router/index.tsx` 中 `/student` 路由段修改：

  移除：
  - `{ path: "permissions", ... }` 行
  - `{ path: "profile", ... }` 行
  - 对应的 import 语句

  新增：
  ```typescript
  import StudentRoomsPage from "@/features/student/pages/student-rooms";
  import StudentStatsPage from "@/features/student/pages/student-stats";
  import StudentNotificationsPage from "@/features/student/pages/student-notifications";
  import StudentFeedbackPage from "@/features/student/pages/student-feedback";
  ```

  路由 children 追加：
  ```typescript
  { path: "rooms", element: <StudentRoomsPage /> },
  { path: "stats", element: <StudentStatsPage /> },
  { path: "notifications", element: <StudentNotificationsPage /> },
  { path: "feedback", element: <StudentFeedbackPage /> },
  ```

- [ ] **Step 3: TypeCheck + Commit**

  ```bash
  cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit --pretty 2>&1 | head -20
  git add frontend/src/features/student/components/layout/student-sidebar.tsx \
          frontend/src/router/index.tsx
  git commit -m "feat: refactor sidebar navigation and routes for Phase 2"
  ```

---

### Task 11: Frontend — 仪表盘 V2 页面重写

**Files:**
- Modify: `frontend/src/features/student/pages/student-home.tsx`

**Description:** 将 Phase 1 的占位卡片替换为 V2 仪表盘布局。左列 260px（个人身份卡 + 快捷操作）+ 右列（统计行 + 常用房间 + 最近记录 + 通知）。

- [ ] **Step 1: 重写 student-home.tsx**

  布局结构：
  ```
  <div className="flex gap-5 p-6 bg-[var(--student-canvas-soft)]">
    {/* 左列 260px */}
    <div className="w-[260px] shrink-0 flex flex-col gap-3">
      {/* 个人身份卡 */}
      <StudentCard>头像 + 姓名 + 角色标签 + 课题组(灰色小字) + 授权 Badge</StudentCard>
      {/* 快捷操作 */}
      <StudentCard>门禁权限 / 出入记录 / 违规记录 / AI 个人画像 → Link 列表</StudentCard>
    </div>

    {/* 右列 flex-1 */}
    <div className="flex-1 flex flex-col gap-3">
      {/* 统计卡片行：今日进出/违规/未读通知/可进房间 */}
      <div className="flex gap-2.5">4 个 StatPanel</div>
      {/* 常用房间区 */}
      <StudentCard>
        标题栏 "⭐ 我的常用房间" + "管理置顶 →"
        <div className="flex gap-2.5 flex-wrap">
          pinnedRooms.map(room => <RoomCard ... />)
          <div className="...+虚线卡片" />
        </div>
      </StudentCard>
      {/* 最近记录 + 通知 双列 */}
      <div className="flex gap-2.5">
        <StudentCard>最近出入记录列表 (5条)</StudentCard>
        <StudentCard>通知公告列表 (3条)</StudentCard>
      </div>
    </div>
  </div>
  ```

  使用 `useStudentDashboard` hook 获取数据。Loading 态用 Skeleton，Error 态用 ErrorRetry，空房间列表不显示 "+" 虚线卡片。

- [ ] **Step 2: TypeCheck + Commit**

  ```bash
  cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit --pretty 2>&1 | head -20
  git add frontend/src/features/student/pages/student-home.tsx
  git commit -m "feat: rewrite student home as Dashboard V2"
  ```

---

### Task 12: Frontend — 出入记录页重写（含违规 Tab）

**Files:**
- Modify: `frontend/src/features/student/pages/student-records.tsx`

**Description:** 重写为双 Tab 结构（出入记录 + 违规记录），点击行展开详情。

- [ ] **Step 1: 重写 student-records.tsx**

  使用 Phase 1 Tabs 组件（pills 变体），两个 Tab：

  **Tab 1 "出入记录"**：
  - 筛选器：日期范围（两个 date input，默认近 7 天）+ 类型 Select + 房间 Select + 查询 Button
  - 使用 Phase 1 Table 组件，列：展开箭头、时间、类型 Badge、房间、门禁点
  - 点击行展开详情行（colSpan 全宽）：授权方式、设备编号、在室时长、记录 ID
  - 展开状态用 `useState<Set<string>>` 管理
  - 分页器使用 TanStack Query 的 `page/setPage`

  **Tab 2 "违规记录"**：
  - 同样的日期筛选器
  - Table 列：时间、类型、房间、扣分、状态 Badge（待处理/已处理/申诉中）
  - 点击展开：违规描述、处理人、处理时间
  - Tab 标签显示 Badge 计数：`⚠️ 违规记录 (2)`

  使用 `useStudentAccessRecords`（已有）+ `useStudentViolations`（Task 9 创建）。

- [ ] **Step 2: TypeCheck + Commit**

  ```bash
  cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit --pretty 2>&1 | head -20
  git add frontend/src/features/student/pages/student-records.tsx
  git commit -m "feat: rewrite records page with violation tab"
  ```

---

### Task 13: Frontend — 房间管理页

**Files:**
- Create: `frontend/src/features/student/pages/student-rooms.tsx`

**Description:** 卡片网格默认视图 + 列表切换 + 置顶/全部双 Tab + 搜索筛选。

- [ ] **Step 1: 创建 student-rooms.tsx**

  状态管理：
  - `activeTab`: `'pinned' | 'all'`
  - `viewMode`: `'card' | 'list'`（从 localStorage 读取默认值）
  - `search`, `floor`, `status`: 筛选参数
  - `page`: 分页

  布局：
  ```
  <div>
    {/* 顶部栏 */}
    <Tabs activeTab={activeTab} onTabChange={...}>
      "⭐ 我的置顶 (4)" / "全部房间 (12)"
    </Tabs>
    <ViewToggle value={viewMode} onChange={...} />

    {/* 筛选栏 */}
    <Input placeholder="搜索房间..." /> + <Select>楼层</Select> + <Select>状态</Select>

    {/* 内容区 */}
    {viewMode === 'card' ? (
      <div className="grid grid-cols-3 gap-2.5">
        {rooms.map(room => <RoomCard key={room.roomId} ... />)}
      </div>
    ) : (
      <Table data={rooms} columns={...} />  {/* 列表视图 */}
    )}

    {/* 分页 */}
    <Pagination ... />
  </div>
  ```

  使用 `useStudentRooms` hook。切换 Tab 时 `pinned` Tab 不分页（一次返回全量），`all` Tab 分页。

- [ ] **Step 2: TypeCheck + Commit**

  ```bash
  cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit --pretty 2>&1 | head -20
  git add frontend/src/features/student/pages/student-rooms.tsx
  git commit -m "feat: add room management page"
  ```

---

### Task 14: Frontend — 数据统计页

**Files:**
- Create: `frontend/src/features/student/pages/student-stats.tsx`

**Description:** 事实数据看板：摘要栏 + 趋势图 + 时段分布 + 房间分布 + 在室时长。纯 CSS，不引入图表库。

- [ ] **Step 1: 创建 student-stats.tsx**

  使用 `useStudentStats` hook。空数据时显示 EmptyState："数据积累中，至少需要 7 天进出记录"。

  布局：
  ```
  <div>
    {/* 摘要栏：统计周期 | 总进出 | 日均 | 出勤天数 | 涉及房间 | 违规 */}
    <div className="flex items-center gap-8 bg-white rounded-xl px-6 py-5">
      <PeriodBadge>近 30 天</PeriodBadge>
      <Divider />
      <Stat label="总进出次数" value={126} unit="次" />
      <Divider />
      <Stat label="日均进出" value={4.2} unit="次/天" />
      ... (分隔线用 1px × 32px bg-gray-200)
    </div>

    {/* 两列 */}
    <div className="flex gap-2.5 mt-3">
      {/* 左列 */}
      <div className="flex-1">
        <StatPanel title="近 7 天进出趋势">
          <BarChart data={dailyTrend} height={120} />
        </StatPanel>
        <StatPanel title="时段分布">
          <BarChart data={hourlyDistribution} height={80} />
        </StatPanel>
      </div>
      {/* 右列 */}
      <div className="w-[300px]">
        <StatPanel title="房间访问分布">
          {roomDistribution.map(r => (
            <div>{r.roomName} {r.count}次 {r.percentage}% <ProgressBar width={r.percentage} /></div>
          ))}
        </StatPanel>
        <StatPanel title="平均在室时长">
          {avgStayDuration.map(d => (
            <div className="flex justify-between">{d.roomName} <b>{d.durationMinutes}min</b></div>
          ))}
        </StatPanel>
      </div>
    </div>
  </div>
  ```

- [ ] **Step 2: TypeCheck + Commit**

  ```bash
  cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit --pretty 2>&1 | head -20
  git add frontend/src/features/student/pages/student-stats.tsx
  git commit -m "feat: add student stats page"
  ```

---

### Task 15: Frontend — 通知公告页

**Files:**
- Create: `frontend/src/features/student/pages/student-notifications.tsx`

**Description:** 双源统一列表 + 类型筛选 pills + 已读/未读。

- [ ] **Step 1: 创建 student-notifications.tsx**

  状态：`activeType: 'ALL' | 'ARO' | 'PLATFORM'`, `page`。

  使用 `useStudentNotifications` hook。点击列表项调用 `markNotificationRead` mutation 并展开全文。

  布局：
  ```
  <div>
    {/* Filter pills */}
    <div className="flex gap-2">
      <Pill active={activeType==='ALL'}>全部</Pill>
      <Pill active={activeType==='ARO'}>🔴 ARO 官方</Pill>
      <Pill active={activeType==='PLATFORM'}>🔵 平台公告</Pill>
      <span className="ml-auto text-caption text-mute">共 {total} 条，{unreadCount} 条未读</span>
    </div>

    {/* Notification list */}
    <div className="flex flex-col gap-1.5 mt-3">
      {notifications.map(n => <NotificationItem key={n.id} {...n} />)}
    </div>

    {/* 展开全文用 Dialog 或 inline expand */}
    <Pagination ... />
  </div>
  ```

  Filter pills 从 `['ALL', 'ARO', 'PLATFORM']` 数组生成（后续有新 type 时自动渲染）。

- [ ] **Step 2: TypeCheck + Commit**

  ```bash
  cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit --pretty 2>&1 | head -20
  git add frontend/src/features/student/pages/student-notifications.tsx
  git commit -m "feat: add student notifications page"
  ```

---

### Task 16: Frontend — 帮助反馈页

**Files:**
- Create: `frontend/src/features/student/pages/student-feedback.tsx`

**Description:** 双 Tab（常见问题 + 我的留言），FAQ 手风琴 + 留言表单 + 工单列表。

- [ ] **Step 1: 创建 student-feedback.tsx**

  布局：
  ```
  <div>
    <Tabs activeTab={...}>
      "📖 常见问题" / "💬 我的留言"
    </Tabs>

    {tab === 'faq' && (
      <>
        <Input placeholder="搜索问题..." />
        <FaqAccordion groups={faqGroups} searchQuery={search} />
      </>
    )}

    {tab === 'feedback' && (
      <>
        <FeedbackForm onSubmit={createTicket} isSubmitting={isPending} />
        <div className="mt-4">
          <h3>我的留言</h3>
          {tickets.map(ticket => (
            <div>
              <Badge>{ticket.status}</Badge> {ticket.subject}
              <span className="text-caption">{ticket.createdAt}</span>
            </div>
          ))}
          <Pagination ... />
        </div>
      </>
    )}
  </div>
  ```

  使用 `useStudentFeedback` hook 中的 `useFaqGroups`、`useTickets`（query）和 `useCreateTicket`（mutation）。

- [ ] **Step 2: TypeCheck + Commit**

  ```bash
  cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit --pretty 2>&1 | head -20
  git add frontend/src/features/student/pages/student-feedback.tsx
  git commit -m "feat: add student feedback page"
  ```

---

### Task 17: 集成验证 + 清理

**Files:**
- Delete: `frontend/src/features/student/pages/student-permissions.tsx`
- Delete: `frontend/src/features/student/pages/student-profile.tsx`
- Modify: `frontend/src/features/student/index.ts`（移除已删除页面的 export）

**Description:** 删除 Phase 1 中被替代的页面，清理无用 import，全量 TypeCheck 确保零编译错误。

- [ ] **Step 1: 删除废弃文件**

  ```bash
  rm frontend/src/features/student/pages/student-permissions.tsx
  rm frontend/src/features/student/pages/student-profile.tsx
  ```

- [ ] **Step 2: 更新顶层 barrel export**

  在 `frontend/src/features/student/index.ts` 中移除对已删除页面的 re-export。

- [ ] **Step 3: 清理 router 中残留的 import**

  确认 `router/index.tsx` 无 `StudentPermissionsPage` 和 `StudentProfilePage` 的 import。

- [ ] **Step 4: 全量 TypeCheck**

  ```bash
  cd d:/codex/verson.1.2/20260416/frontend && npx tsc --noEmit --pretty
  ```
  预期：零错误。

- [ ] **Step 5: 后端 Maven 编译验证**

  ```bash
  cd d:/codex/verson.1.2/20260416 && mvn compile
  ```
  预期：BUILD SUCCESS。

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "chore: remove deprecated Phase 1 pages, full TypeCheck pass"
  ```

---

## Self-Review Checklist

- [ ] Spec coverage: Dashboard (Task 1+11), Records (Task 2+12), Rooms (Task 3+13), Stats (Task 4+14), Notifications (Task 5+15), Feedback (Task 6+16), Sidebar (Task 10), Extensions (all tasks use config-driven patterns)
- [ ] No placeholders: All types/interfaces are fully specified, all file paths are exact
- [ ] Type consistency: RoomCard props in Task 7 match usage in Tasks 11+13. NotificationItem props in Task 8 match usage in Task 15. DTO names consistent across backend/frontend.
