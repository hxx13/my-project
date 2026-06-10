# 学生物资申领系统 · 设计规格

> 版本: 1.0 | 日期: 2026-06-10 | 工作流: ① 新功能开发

## 1. 概述

### 1.1 定位

全新独立的物资申领管理系统，面向学生申领 + 教职工审核的闭环业务。复用现有 `supplies` 模块的业务模式（购物车 → 申领 → 审核 → 出库 → 流水），但数据完全隔离、命名空间完全独立。

### 1.2 核心原则

- **数据隔离**：独立数据库表，不与 `supplies` 模块打通数据
- **命名独立**：所有类/表/API 使用 `material` 前缀，避免与 `supplies` 命名冲突
- **业务复用**：复制 supplies 的成熟业务模式，调整为学生-教职工场景
- **入口简洁**：学生端一个入口，教职工端一个审核文件夹

## 2. 角色与权限

| 角色 | 可见范围 | 核心操作 |
|------|----------|----------|
| **学生 (STUDENT)** | 仅自己的申领记录 | 浏览物资 → 购物车 → 提交申领 → 查看记录/统计 |
| **教职工 (STAFF+)** | 所有人的申领记录 | 审核申领 → 出库履行 → 物品上架管理 → 统计审计 |
| **管理员 (ADMIN)** | 全量 | 教职工全部权限 + 系统配置 |

### 2.1 审核人指派规则

审核人必须同时满足两个条件：
1. 账号在物品配置的 `reviewer_ids`（或 `second_reviewer_ids`）列表中
2. 拥有 STAFF 或更高角色权限

任一条件不满足则不可审核该物品的申领。

## 3. 命名对照（避免冲突）

| 层级 | 现有 supplies | 新系统 material |
|------|--------------|-----------------|
| 后端模块 | `modules/supplies/` | `modules/material/` |
| 物品实体 | `SupplyItem` | `MaterialItem` |
| 分类实体 | `SupplyCategory` | `MaterialCategory` |
| 申领单 | `SupplyClaimOrder` | `MaterialRequest` |
| 申领行 | `SupplyClaimLine` | `MaterialRequestLine` |
| 库存流水 | `SupplyInventoryMovement` | `MaterialStockMovement` |
| 购物车 | `SupplyUserCart` | `MaterialCart` |
| 操作日志 | `SupplyOperationLog` | `MaterialOperationLog` |
| API 前缀 | `/supplies/` | `/material/` |
| 学生端前端路由 | — | `/student/material` |
| 教职工前端路由 | — | 管理后台 `/material/review` |

## 4. 业务流程

### 4.1 申领单状态机

物品可配置两种审核流程（物品级选择）：

**简单流程（SIMPLE，默认）：**
```
DRAFT → PENDING → APPROVED → FULFILLED → RECEIVED
                   ↘ REJECTED（结束）
```
- `DRAFT`：学生暂存购物车内容，未正式提交
- `PENDING`：学生已提交，等待审核
- `APPROVED`：审核通过，等待出库
- `REJECTED`：审核拒绝，申领关闭
- `FULFILLED`：已出库，等待学生确认
- `RECEIVED`：学生确认领取，流程完成

**复核流程（DUAL_REVIEW，敏感物品可选）：**
```
DRAFT → PENDING → FIRST_OK → APPROVED → FULFILLED → RECEIVED
                   ↘ REJECTED（结束）
```
- `FIRST_OK`：初审通过，等待复审
- 其余状态同上
- REJECTED 可从 PENDING 或 FIRST_OK 触发

### 4.2 学生申领流程

1. 进入"申领物品"页面（从学生中心侧边栏或扫码弹窗快捷业务入口）
2. 浏览物资分类与列表（左侧分类、右侧物品卡片）
3. 加入购物车（数量限制、云端持久化）
4. 提交申领 → 生成 `MaterialRequest`
5. 查看"我的申领"跟踪状态
6. 出库后确认领取 → 状态变为 `RECEIVED`

### 4.3 教职工审核流程

1. 进入管理后台 → "审核"文件夹 → "申领审核"
2. 查看待审核列表（按提交时间排序）
3. 展开申领详情 → 逐行审批
4. 简单流程：通过/拒绝
5. 复核流程：初审人处理 → 复审人处理
6. 审核通过后 → 出库履行（扣减库存、生成流水）

### 4.4 学生需求建议通道

- 学生可提交"我想要某物"的需求建议
- 教职工可在系统设置中开关此入口的可见性
- 需求建议独立于正式申领，不做硬性关联

## 5. 数据库表设计

### 5.1 material_category（物资分类）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | 主键 |
| name | VARCHAR(64) | 分类名称 |
| sort_order | INT | 排序 |
| status | TINYINT | 0=禁用 1=启用 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 5.2 material_item（物资物品）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | 主键 |
| category_id | BIGINT | 分类ID |
| name | VARCHAR(128) | 物品名称 |
| subtitle | VARCHAR(256) | 副标题/描述 |
| cover_url | VARCHAR(512) | 封面图 |
| shelf_status | VARCHAR(32) | DRAFT/PUBLISHED/ARCHIVED |
| stock_mode | VARCHAR(32) | LIMITED/UNLIMITED |
| stock_qty | INT | 当前库存 |
| workflow_type | VARCHAR(32) | SIMPLE / DUAL_REVIEW |
| reviewer_ids | JSON/TEXT | 审核人账号ID列表 |
| second_reviewer_ids | JSON/TEXT | 复审人账号ID列表（仅DUAL_REVIEW） |
| deleted | TINYINT | 软删除标记 |
| deleted_time | DATETIME | 删除时间 |
| deleted_by | VARCHAR(64) | 删除人 |
| purge_after_time | DATETIME | 可彻底清除时间 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| last_inbound_at | DATETIME | 最近入库时间 |

### 5.3 material_cart（购物车）

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | VARCHAR(64) | 用户ID |
| item_id | BIGINT | 物品ID |
| qty | INT | 数量 |
| updated_at | DATETIME | 更新时间 |

主键：(user_id, item_id)

### 5.4 material_request（申领单）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(32) | 主键，业务ID |
| user_id | VARCHAR(64) | 申请人ID |
| applicant_name | VARCHAR(64) | 申请人姓名（冗余） |
| applicant_group | VARCHAR(128) | 申请人所属课题组（冗余） |
| status | VARCHAR(32) | DRAFT/PENDING/APPROVED/REJECTED/FIRST_OK/FULFILLED/RECEIVED |
| workflow_type | VARCHAR(32) | 快照物品的workflow_type |
| first_reviewer_id | VARCHAR(64) | 初审人ID |
| first_review_time | DATETIME | 初审时间 |
| second_reviewer_id | VARCHAR(64) | 复审人ID |
| second_review_time | DATETIME | 复审时间 |
| fulfilled_at | DATETIME | 出库时间 |
| fulfilled_by | VARCHAR(64) | 出库操作人 |
| received_at | DATETIME | 学生确认领取时间 |
| deleted | TINYINT | 软删除 |
| deleted_time | DATETIME | 删除时间 |
| deleted_by | VARCHAR(64) | 删除人 |
| purge_after_time | DATETIME | 可彻底清除时间 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 5.5 material_request_line（申领行）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | 主键 |
| request_id | VARCHAR(32) | 申领单ID |
| item_id | BIGINT | 物品ID |
| qty | INT | 申领数量 |
| snapshot_name | VARCHAR(128) | 物品名称快照 |
| fulfilled_qty | INT | 实际出库数量 |
| created_at | DATETIME | 创建时间 |

### 5.6 material_stock_movement（库存流水）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | 主键 |
| item_id | BIGINT | 物品ID |
| movement_type | VARCHAR(32) | INBOUND/OUTBOUND/ADJUST |
| qty | INT | 变动数量（出库为负） |
| stock_after | INT | 变动后库存 |
| request_id | VARCHAR(32) | 关联申领单ID |
| request_line_id | BIGINT | 关联申领行ID |
| operator_user_id | VARCHAR(64) | 操作人ID |
| applicant_user_id | VARCHAR(64) | 申领人ID（出库时） |
| remark | VARCHAR(512) | 备注 |
| created_at | DATETIME | 创建时间 |

### 5.7 material_operation_log（操作日志）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT | 主键 |
| target_type | VARCHAR(32) | ITEM/REQUEST/CATEGORY |
| target_id | VARCHAR(64) | 目标ID |
| action | VARCHAR(32) | CREATE/UPDATE/DELETE/SUBMIT/APPROVE/REJECT/FULFILL/RECEIVE/INBOUND |
| operator_user_id | VARCHAR(64) | 操作人ID |
| detail | TEXT | 操作详情JSON |
| created_at | DATETIME | 操作时间 |

## 6. API 设计

### 6.1 学生端 API（`/material`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/material/categories` | 获取启用的分类列表 |
| GET | `/material/items` | 获取物品列表（按分类筛选） |
| GET | `/material/items/{id}` | 获取物品详情 |
| GET | `/material/cart` | 获取当前用户购物车 |
| PUT | `/material/cart` | 保存购物车 |
| POST | `/material/requests` | 提交申领单 |
| GET | `/material/requests/mine` | 我的申领记录（分页、状态筛选） |
| GET | `/material/requests/{id}` | 申领单详情 |
| POST | `/material/requests/{id}/withdraw` | 撤回申领 |
| POST | `/material/requests/{id}/receive` | 确认领取 |
| GET | `/material/stats/mine` | 个人领用统计 |

### 6.2 教职工端 API（`/material/admin`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/material/admin/categories` | 分类管理 |
| POST | `/material/admin/categories` | 新增分类 |
| PATCH | `/material/admin/categories/{id}` | 编辑分类 |
| DELETE | `/material/admin/categories/{id}` | 删除分类 |
| GET | `/material/admin/items` | 物品管理列表 |
| POST | `/material/admin/items` | 上架新物品 |
| PATCH | `/material/admin/items/{id}` | 编辑物品 |
| DELETE | `/material/admin/items/{id}` | 删除物品 |
| POST | `/material/admin/inbound` | 入库 |
| PATCH | `/material/admin/items/{id}/stock` | 调整库存 |
| GET | `/material/admin/requests/pending` | 待审核申领 |
| GET | `/material/admin/requests/all` | 全部申领记录 |
| GET | `/material/admin/requests/{id}` | 申领详情 |
| POST | `/material/admin/requests/{id}/approve` | 审核通过 |
| POST | `/material/admin/requests/{id}/reject` | 审核拒绝 |
| POST | `/material/admin/requests/{id}/fulfill` | 出库履行 |
| GET | `/material/admin/stats/overview` | 统计概览 |
| GET | `/material/admin/stats/audit` | 审计流水（分页、多维度筛选） |
| GET | `/material/admin/stats/export` | 导出统计报表 |

### 6.3 快捷入口预留接口

扫码弹窗的快捷业务区需要跳转到物资申领页。前端路由：

```
/student/material        → 物资商城主页
/student/material?category=X  → 按分类筛选
/student/material?item=Y      → 直接定位到某物品
```

路径简单、参数清晰，弹窗直接 `navigate()` 即可，无需额外 API。

## 7. 前端设计

### 7.1 学生端入口

**侧边栏入口**：在学生首页左侧"快捷操作"卡片中新增一项：
```
🆕 申领物品  →  navigate("/student/material")
```

**扫码弹窗入口**：弹窗中间"快捷业务"区域预留按钮，navigate 到 `/student/material`。

### 7.2 学生端页面

遵循现有 `features/student/` 目录结构：

```
features/student/pages/
  student-material.tsx          ← 新建：物资商城（浏览+购物车+提交）
  student-material-requests.tsx ← 新建：我的申领记录
  student-material-stats.tsx    ← 新建：个人领用统计
```

### 7.3 教职工端页面

在管理后台导航注册中新增"审核"文件夹。

**⚠️ 关键实现说明**：管理后台导航由数据库 `admin_nav_config` 表驱动（`AdminNavConfigSchemaMigrator`），前端 `buildAdminNavModel()` 优先使用服务端配置。仅修改 `adminNavRegistry.ts` 的硬编码注册不生效——必须同时在 `AdminNavConfigSchemaMigrator.java` 的 `run()` 方法中添加 `INSERT IGNORE` 语句，确保启动时写入数据库：

```java
// admin_nav_config 表 —— INSERT IGNORE 确保幂等
"INSERT IGNORE INTO admin_nav_config (id, parent_id, type, title, sort_order) " +
"VALUES ('material-review', NULL, 'GROUP', '审核', 7)";
"INSERT IGNORE INTO admin_nav_config (id, parent_id, type, title, item_path, item_icon, sort_order) " +
"VALUES ('item-material-review', 'material-review', 'ITEM', '申领审核', '/admin/material/review', 'ClipboardCheck', 0)";
```

两层注册缺一不可：
1. **数据库**：`AdminNavConfigSchemaMigrator` → `INSERT IGNORE`（运行时生效）
2. **前端硬编码**：`adminNavRegistry.ts` → `ADMIN_NAV_REGISTRY`（fallback、首页工作台命令面板、路由标题推导）

```
pages/
  MaterialReviewPage.tsx        ← 新建：申领审核（待审+历史）
  MaterialAuditPage.tsx         ← 新建：统计审计面板
```

### 7.4 设计系统

遵循 🍱 Bento 设计系统，颜色引用 `--app-color-*` 语义令牌，禁止硬编码颜色。学生端页面复用 `features/student/components/ui` 组件库（StudentCard、Badge、Skeleton 等），保持视觉一致。

## 8. 统计审计设计

### 8.1 统计分类

在统计系统中新增 `material` 分类，与现有统计分类并列。

### 8.2 统计维度

**学生维度（不包含审核人效率）：**
- 申领总量 / 频次趋势（按人·按天/周/月）
- 物品种类分布（按人·按分类）
- 通过率 / 拒绝率（按人·按时间段）
- 平均审核等待时长（按人·按物品）
- 所属课题组汇总（按课题组·按时间）
- 异常申领标记（高频/超额/非工作时间）

**物资维度：**
- 被申领次数/数量排行（按物品·按分类）
- 库存周转率（入库量/出库量/当前库存）
- 需求频率趋势（按周/月·按分类）
- 库存预警（低于阈值自动标记）

**审计流水：**
- 全字段记录：申领人、数量、物品、所属课题组、时间、审核人、审核时间、出库时间、状态
- 支持 Excel 导出
- 支持按时间区间、物品分类、课题组筛选

### 8.3 Agent 接口预留

每个统计项封装为独立查询方法，方法签名清晰，带完整 Javadoc/TSDoc 注释：

```java
// 示例：学生申领趋势
// @param studentId 学生ID
// @param from 起始日期（含）
// @param to 截止日期（含）
// @param granularity DAY/WEEK/MONTH
// @return 时间段+申领数量的有序列表
List<MaterialTrendPoint> getStudentRequestTrend(
    String studentId, LocalDate from, LocalDate to, String granularity);
```

前端统计组件同理，每个统计区块独立封装，props 接口清晰，便于后续 agent 对接。

## 9. 与现有系统的边界

| 边界 | 规则 |
|------|------|
| `material` ↔ `supplies` | 数据不互通，表独立，API 独立 |
| `material` → `student` | 入口嵌入学生中心侧边栏和扫码弹窗 |
| `material` → `admin` | 教职工审核入口注册到管理后台导航 |
| `material` → `notification` | 申领状态变更时发送通知（复用现有通知基础设施） |
| `material` → `auth` | 复用现有角色权限体系，审核人双校验 |

## 10. 不在范围内

- 不修改现有 `supplies` 模块任何代码
- 不新增审核人效率统计（明确排除）
- 不在学生端展示他人申领记录
- 第一阶段不实现复核流程的自动指派（手动选择）

## 11. 已确认的设计决策

| # | 决策 | 来源 |
|---|------|------|
| 1 | 独立模块 material，数据完全隔离 | 用户要求 |
| 2 | 学生需求通道 C（已有物资 + 需求建议），入口可见性由教职工控制 | 用户选择 |
| 3 | 学生端侧边栏仅一个"申领物品"入口 | 用户精简 |
| 4 | 教职工端新增"审核"文件夹，不扩增其他菜单 | 用户精简 |
| 5 | 学生只能看个人记录，教职工看全部 | 用户要求 |
| 6 | 物品级可选审核流程（SIMPLE/DUAL_REVIEW） | 用户选择 |
| 7 | 审核人按账号+权限双重校验 | 用户要求 |
| 8 | 统计不含审核人效率维度 | 用户排除 |
| 9 | 扫码弹窗快捷业务预留 navigation 路由入口 | 用户说明 |
