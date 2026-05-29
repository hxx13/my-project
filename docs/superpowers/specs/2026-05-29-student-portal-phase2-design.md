# 学生端门户 Phase 2 设计基线

> **创建日期**：2026-05-29
>
> **上游依赖**：[Phase 1 设计基线](./2026-05-29-student-portal-design.md)（设计令牌、布局、路由、隔离规则已在 Phase 1 落地）
>
> **设计目标**：将 Phase 1 的骨架扩展为功能完整的学生后台，覆盖数据聚合、房间管理、违规记录、通知公告、帮助反馈五大能力域。
>
> **后续 agent 读取指引**：本文档是 Phase 2 所有前端页面和后端 API 的设计真相源。

---

## 一、核心设计原则（新增）

Phase 1 的六层隔离规则仍然有效。Phase 2 追加以下原则：

| 原则 | 说明 |
|------|------|
| **课题组不可见** | 课题组仅是后端数据过滤标签，不出现在任何 UI 中。个人信息行轻量提及名称即可。 |
| **纯个人视角** | 所有数据围绕"我"展开，不展示任何他人数据。不设组长管理、组动态、组管理。 |
| **事实优于评价** | 不制造评分/等级/定性标签。展示可验证的统计数据（次数、时长、分布），让学生自己得出结论。 |
| **独立端点，独立缓存** | 每个数据域一个 API 端点，TanStack Query 按域独立缓存，新功能 = 新端点不破坏旧契约。 |
| **扩展冗余前置** | 每个设计层面预留扩展入口（Tab 配置驱动、筛选器自动生成、卡片可插拔注册、type enum 可扩展等）。 |

---

## 二、侧边栏导航重构

### 2.1 从 5 项扩展为 7 项（扁平列表式）

Phase 1 侧边栏项：首页 / 出入记录 / 权限 / 档案 / 设置

Phase 2 重新组织为：

| 导航项 | 路由 | 变更类型 | 说明 |
|--------|------|---------|------|
| 首页 | `/student/home` | 重写 | 仪表盘 V2 纯个人视角 |
| 出入记录 | `/student/records` | 重写 | 含违规子 Tab |
| 我的房间 | `/student/rooms` | **新增** | 卡片网格 + 列表双视图 |
| 数据统计 | `/student/stats` | **新增** | 原 AI 画像改名，事实数据看板 |
| 通知 | `/student/notifications` | **新增** | ARO + 平台双源统一列表 |
| 帮助反馈 | `/student/feedback` | **新增** | FAQ + 留言工单 |
| 设置 | `/student/settings` | 保留 | Phase 1 已有 |

移除项：`/student/permissions`（门禁权限集成到房间页）、`/student/profile`（档案集成到仪表盘个人卡片）

### 2.2 扩展策略

扁平列表在当前 7 项下运行良好。当导航项超过 8-9 项时，自然演进为分组折叠式（主导航组 + 辅助组），不提前过度设计。新增导航项只需在侧边栏配置数组中追加一条记录。

---

## 三、页面设计

### 3.1 首页仪表盘 V2（`/student/home`）

**布局**：左列 260px（个人身份卡 + 快捷入口）+ 右列主内容区

**左列内容**：
- 个人身份卡：头像、姓名、角色标签（PI助理等）、课题组名（轻量灰色文字）、授权状态 Badge
- 快捷操作：门禁权限、出入记录、违规记录、AI 个人画像（图标 + 文字列表）

**右列内容**：
- 数据摘要卡片行：今日进出次数、违规记录数、未读通知数、可进房间数（4 个统计卡片）
- 常用房间卡片区：逐间展示，每间一个 200px 卡片（名称、楼层位置、在室/容量、占用进度条、状态标签：空闲/较满/已满），末尾 "+" 虚线卡片用于添加
- 最近出入记录 + 通知公告（双列）

**数据来源**：聚合端点 `GET /api/student/dashboard`（一次返回仪表盘所需全部摘要数据）

**扩展策略**：
- 统计卡片区用 flex-wrap，新增卡片自动换行
- 快捷操作为可配置列表，后端或配置文件驱动
- 房间卡片 "+" 入口预留

### 3.2 出入记录页（`/student/records`）

**布局**：双 Tab + 筛选器 + 表格 + 分页

**Tab 结构**：
- Tab 1：出入记录（默认激活）
- Tab 2：违规记录（标签上显示 Badge 计数）

**出入记录 Tab**：
- 筛选器：日期范围（默认近 7 天）、进出类型（进入/离开）、房间筛选
- 表格列：时间、类型 Badge（进入绿色/离开琥珀）、房间名、门禁点
- 点击行展开详情：授权方式、设备编号、在室时长、记录 ID
- 后端分页（page/pageSize），TanStack Query keepPreviousData

**违规记录 Tab**：
- 表格列：违规时间、类型、关联房间、扣分/处罚状态
- 展开详情：违规描述、处理人、处理时间

**数据来源**：`GET /api/student/access-records`（已有）+ `GET /api/student/violations`（新增）

**扩展策略**：Tab 由配置数组驱动，新增 Tab（如"异常记录""访客记录"）只需加配置项。

### 3.3 房间管理页（`/student/rooms`）

**布局**：Tab 切换（我的置顶 / 全部房间）+ 搜索筛选栏 + 卡片网格（默认）+ 列表视图切换按钮

**卡片网格视图**：
- 3 列响应式网格
- 每张卡片：房间名、楼层位置、在室人数/容量、占用进度条、状态标签（空闲/较满/已满）
- 悬停显示 ⭐ 置顶/取消按钮
- 卡片与仪表盘常用房间复用同一个 RoomCard 组件

**列表视图**：
- 表格式：置顶 ⭐ 标记、房间名、位置、在室/容量、占用率进度条+百分比、状态
- 置顶项自动排到列表顶部

**筛选器**：搜索框（房间名模糊匹配）、楼层下拉、状态下拉（空闲/较满/已满）

**数据来源**：`GET /api/student/rooms?pinned=true&floor=&status=&search=&view=card|list`

**扩展策略**：
- 卡片组件接受泛型 metadata，新增展示字段无需改组件
- 筛选器列表由后端房间元数据动态生成
- 视图模式通过 URL searchParam 持久化

### 3.4 数据统计页（`/student/stats`）

**定位**：事实数据看板，非 AI 评价。所有数字从 access 记录直接计算。

**布局**：
- 顶部摘要栏：统计周期 + 总进出次数、日均、出勤天数、涉及房间数、违规数（分隔线分隔，纯数字）
- 左侧：近 7 天进出趋势柱状图（纯 CSS 实现，不引入图表库）
- 左下：时段分布柱状图（00-06 / 06-12 / 12-18 / 18-24 四个桶）
- 右侧：房间访问分布（次数 + 百分比 + 进度条）
- 右下：平均在室时长（按房间）

**空状态**："数据积累中，至少需要 7 天进出记录才能生成统计"

**数据来源**：`GET /api/student/stats?period=30d`

**扩展策略**：统计指标面板可插拔注册，图表容器统一渲染。新增指标 = 新增一个 Panel 配置。

### 3.5 通知公告页（`/student/notifications`）

**布局**：类型筛选 pills + 统一信息流列表 + 分页

**类型筛选**：全部 / ARO 官方（红色 Badge）/ 平台公告（蓝色 Badge），筛选 pills 由后端 type 枚举自动生成

**列表项**：
- 未读标记：左侧红点 + 浅紫背景
- 类型 Badge：ARO 官方（红）/ 平台公告（蓝）
- 标题（未读加粗）+ 日期 + 摘要（2 行截断）
- 点击展开全文

**数据来源**：`GET /api/student/notifications?type=&page=&size=`（后端合并 ARO 新闻 + 平台公告两个数据源，type 字段区分来源）

**扩展策略**：type 字段 enum 可扩展（如增加"课题组通知""系统告警"），筛选 pills 自动渲染新类型。

### 3.6 帮助反馈页（`/student/feedback`）

**布局**：双 Tab（常见问题 / 我的留言）

**常见问题 Tab**：
- 搜索框 + 分类折叠面板（FAQ accordion）
- 分组由后端配置驱动（如"门禁使用""账号管理""违规申诉"等）
- 点击展开答案

**我的留言 Tab**：
- 新建留言表单：主题、内容、可选截图
- 留言列表：主题、状态 Badge（待处理/已回复/已关闭）、时间
- 点击展开对话线程（回复链）

**数据来源**：`GET /api/student/feedback/faq` + `GET/POST /api/student/feedback/tickets`

**扩展策略**：FAQ 分组由后端配置驱动，新增分类无需改前端。留言类型可扩展（建议/故障/申诉）。

---

## 四、后端 API 契约

### 4.1 新增端点总览

| 端点 | 方法 | 说明 | 数据来源 |
|------|------|------|---------|
| `/api/student/dashboard` | GET | 仪表盘聚合数据 | 聚合多个数据源 |
| `/api/student/violations` | GET | 违规记录（分页） | twin 模块 |
| `/api/student/rooms` | GET | 可访问房间列表（含占用） | aro_personnel + 房间实时数据 |
| `/api/student/rooms/{id}/pin` | PUT | 置顶/取消置顶房间 | 新增 student_room_pin 表 |
| `/api/student/stats` | GET | 个人统计数据 | access 记录聚合计算 |
| `/api/student/notifications` | GET | 双源通知合并列表 | ARO news + platform notice |
| `/api/student/notifications/{id}/read` | PUT | 标记已读 | 新增 student_notice_read 表 |
| `/api/student/feedback/faq` | GET | FAQ 分组列表 | 新增或复用 FAQ 配置 |
| `/api/student/feedback/tickets` | GET/POST | 留言工单列表/新建 | 新增 student_feedback 表 |

### 4.2 关键端点契约

**仪表盘聚合**：
```
GET /api/student/dashboard
  → 200 {
    profile: { name, departmentName, projectGroupName, roleLabel, authStatus },
    stats: { todayAccessCount, violationCount, unreadNoticeCount, accessibleRoomCount },
    pinnedRooms: [{ roomName, floor, zone, occupantCount, capacity, status, ... }],
    recentRecords: [{ time, type, roomName, ... }] (最近5条),
    recentNotices: [{ title, type, date, ... }] (最近3条)
  }
```

**房间列表**：
```
GET /api/student/rooms?pinned=&floor=&status=&search=&page=&size=
  → 200 {
    data: [{
      roomId, roomName, floor, zone,
      occupantCount, capacity, occupancyRate,
      status: "idle" | "busy" | "full",
      isPinned
    }],
    total, page, size
  }
```

**统计数据**：
```
GET /api/student/stats?period=30d
  → 200 {
    period: { start, end, days },
    summary: { totalAccess, dailyAvg, attendanceDays, roomCount, violationCount },
    dailyTrend: [{ date, count }],
    hourlyDistribution: [{ bucket: "00-06"|"06-12"|"12-18"|"18-24", count }],
    roomDistribution: [{ roomName, count, percentage }],
    avgStayDuration: [{ roomName, durationMinutes }]
  }
```

**通知列表**：
```
GET /api/student/notifications?type=ARO|PLATFORM&page=&size=
  → 200 {
    data: [{
      id, title, summary, type: "ARO"|"PLATFORM",
      publishDate, isRead, sourceUrl
    }],
    total, unreadCount
  }
```

**违规记录**：
```
GET /api/student/violations?page=&size=&startDate=&endDate=
  → 200 {
    data: [{
      id, time, type, roomName, doorName,
      description, penalty, status: "pending"|"processed"|"appealing",
      processedBy, processedTime
    }],
    total
  }
```

---

## 五、前端组件新增

在 Phase 1 的 17 个 UI 组件基础上，Phase 2 新增以下组件：

| 组件 | 路径 | 用途 |
|------|------|------|
| `RoomCard` | `components/ui/room-card.tsx` | 房间卡片（仪表盘 + 房间页复用） |
| `StatPanel` | `components/ui/stat-panel.tsx` | 可插拔统计面板容器 |
| `BarChart` | `components/ui/bar-chart.tsx` | 纯 CSS 柱状图 |
| `NotificationItem` | `components/ui/notification-item.tsx` | 通知列表项 |
| `FaqAccordion` | `components/ui/faq-accordion.tsx` | FAQ 折叠面板 |
| `FeedbackForm` | `components/ui/feedback-form.tsx` | 留言表单 |
| `ViewToggle` | `components/ui/view-toggle.tsx` | 卡片/列表视图切换 |

Phase 1 已有组件直接复用：Button, Input, Card, Badge, Avatar, Skeleton, EmptyState, ErrorRetry, Table, Tabs, Dialog, Toast, Select, Switch, Checkbox, Tooltip, ThemePicker。

---

## 六、路由变更

在 Phase 1 路由基础上：

**移除**：
- `/student/permissions`（集成到房间页）
- `/student/profile`（集成到仪表盘个人卡片）

**新增**：
- `/student/rooms` — 房间管理页
- `/student/stats` — 数据统计页
- `/student/notifications` — 通知公告页
- `/student/feedback` — 帮助反馈页

**修改**：
- `/student/home` — 重写为仪表盘 V2
- `/student/records` — 重写为双 Tab（出入记录 + 违规记录）

---

## 七、扩展冗余设计

### 7.1 各层扩展点汇总

| 层次 | 扩展点 | 机制 |
|------|--------|------|
| 侧边栏 | 新增导航项 | 配置数组追加，超过 8 项自然演进分组折叠 |
| 仪表盘 | 新增统计卡片、快捷操作、房间 | flex-wrap 自动换行，快捷操作为可配置列表 |
| 出入记录 | 新增 Tab（如异常/访客记录） | Tab 配置数组驱动 |
| 房间管理 | 新增筛选维度、房间详情字段 | 筛选器由元数据生成，卡片接受泛型 metadata |
| 数据统计 | 新增统计指标、图表类型 | 面板可插拔注册，图表容器统一渲染 |
| 通知公告 | 新增来源类型 | type enum 可扩展，筛选 pills 自动生成 |
| 帮助反馈 | 新增 FAQ 分类、留言类型 | FAQ 后端配置驱动，留言类型 enum 可扩展 |
| API | 新增数据域 | 独立端点策略，新域 = 新端点 |

### 7.2 课题组预留

当前课题组只在代码层面作为数据过滤标签（`projectGroupName`），未来如需扩展为组级功能（批量授权、组通知等），只需：
1. 后端新增组级 API 端点
2. 前端在个人身份卡旁增加轻量入口
3. 不改变现有个人视角页面结构

---

## 八、实施阶段

| 阶段 | 内容 | 依赖 | 说明 |
|------|------|------|------|
| 0 | 本文档（设计基线） | Phase 1 完成 | ✅ 当前 |
| 1 | 后端新 API：dashboard / rooms / stats / violations / notifications / feedback | 阶段 0 | 6 个新端点 + 2 个新表 |
| 2 | 前端新组件：RoomCard / StatPanel / BarChart / NotificationItem / FaqAccordion / FeedbackForm / ViewToggle | 阶段 0 | 7 个新组件 |
| 3 | 侧边栏重构 + 路由变更 | 阶段 2 | 5 项 → 7 项 |
| 4 | 仪表盘 V2 重写 | 阶段 1-3 | 聚合端点 + RoomCard 复用 |
| 5 | 出入记录页重写 + 违规 Tab | 阶段 1-3 | Table 组件复用 |
| 6 | 房间管理页 | 阶段 1-3 | RoomCard + ViewToggle |
| 7 | 数据统计页 | 阶段 1-3 | BarChart + StatPanel |
| 8 | 通知公告页 | 阶段 1-3 | NotificationItem + Tabs |
| 9 | 帮助反馈页 | 阶段 1-3 | FaqAccordion + FeedbackForm |
| 10 | 集成验证、端到端测试、合并 | 阶段 4-9 | |

---

## 九、关联文档

- [Phase 1 设计基线](./2026-05-29-student-portal-design.md)（令牌/布局/路由/隔离规则）
- Phase 2 设计原型（浏览器 mockup）：`.superpowers/brainstorm/3389-1780030995/content/`
  - `dashboard-v2.html` — 仪表盘 V2
  - `sidebar-navigation.html` — 侧边栏方案对比
  - `room-page.html` — 房间管理页
  - `records-page.html` — 出入记录页
  - `ai-portrait-v2.html` — 数据统计页
  - `notifications.html` — 通知公告页
  - `full-review.html` — 全景回顾
