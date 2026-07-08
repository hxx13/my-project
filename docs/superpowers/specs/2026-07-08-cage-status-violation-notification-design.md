# 笼架特殊状态 → 违规通知联动系统 · 设计文档

版本: 1.0 | 日期: 2026-07-08 | 作者: hxx13

---

## 1. 概述

### 1.1 目标

建立笼架特殊状态与违规记录系统之间的自动联动。当笼位出现特定特殊状态且持续一定天数后，自动为相关课题组成员创建违规记录和/或扫码弹窗公告。

### 1.2 数据源

- `/console/admin/cage-shelves` — 笼架网格页面（各笼位的特殊状态标记）
- `/console/admin/cage-shelves/special-status` — 特殊状态总览页（按状态类型聚合）

### 1.3 配置入口

- `/console/admin/student-violations` → 新增"笼架联动"标签页

---

## 2. 核心逻辑

### 2.1 "首次出现"定义

每次 `CAGE_SPECIAL_STATUS_SCAN` 全量同步完成后，对比新旧批次快照。本批次新增的特殊状态（`cage_event_log.STATUS_ADDED`）即视为"首次出现"。不管该笼位历史上是否出现过该状态。

### 2.2 判定规则

状态首次出现后，等待配置天数，复查当前快照：

| 复查结果 | 判定 |
|---------|------|
| 状态仍存在 | ✅ 触发违规/公告 |
| 状态已消失 | ✅ 正常通过，不触发 |

### 2.3 三种判定模式

| 模式 | 枚举值 | 逻辑 |
|------|--------|------|
| 自动同步联动 | `AUTO_SYNC_LINKED` | 状态首次出现后等 N 天，**下一次自动同步**（`triggeredBy = "system-scheduler"`）完成后检查状态是否仍存在 |
| 纯天数 | `PURE_DAYS` | 状态首次出现后等 N 天，到达时间直接检查当前快照，不受同步任务影响 |
| 纯手动 | `PURE_MANUAL` | 不自动触发，仅管理员在父记录页面手动操作时触发 |

### 2.4 手动触发开关

`cage_manual_trigger`：开启后，管理员在定时管理中点击"立即执行"也会触发 `AUTO_SYNC_LINKED` 判定。默认为关闭。

### 2.5 去重

同一笼位 + 同一状态码 + 同一规则，若已存在 ACTIVE 状态的 `twin_cage_status_violation` 父记录，则不再重复触发。

---

## 3. 数据模型

### 3.1 扩展 `twin_violation_rule`

新增 `sourceTag` 枚举值：`"CAGE_STATUS"`

新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `cage_status_codes` | JSON | 监控的特殊状态类型，如 `["HEALTH_ABNORMAL","NEED_DIVIDE"]` |
| `cage_delay_days` | INT | 延迟天数 |
| `cage_judge_mode` | VARCHAR(20) | 判定模式：`AUTO_SYNC_LINKED` / `PURE_DAYS` / `PURE_MANUAL` |
| `cage_manual_trigger` | TINYINT(1) | 手动执行也触发判定：0=否 1=是 |
| `cage_area_filter` | JSON | 区域筛选 `{"campuses":[],"rooms":[]}`，空=全部 |
| `cage_group_whitelist` | JSON | 课题组白名单 `["徐楠杰的课题组"]`，空=全部 |
| `cage_trigger_action` | VARCHAR(20) | 触发动作：`VIOLATION_ONLY` / `NOTICE_ONLY` / `BOTH` |

### 3.2 新增 `twin_cage_status_violation`（父记录表）

```sql
CREATE TABLE twin_cage_status_violation (
  id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
  rule_id             BIGINT        NOT NULL COMMENT '关联 twin_violation_rule.id',
  scan_batch_id       VARCHAR(64)   COMMENT '触发时的同步批次ID',
  status_code         VARCHAR(32)   COMMENT '触发的特殊状态类型',
  cage_shelve_id      BIGINT        COMMENT '笼架ID',
  position_x          INT           COMMENT '笼位X坐标',
  position_y          INT           COMMENT '笼位Y坐标',
  position_label      VARCHAR(16)   COMMENT '笼位标签如 A-3',
  cage_box_qr_code    VARCHAR(512)  COMMENT '笼盒卡号',
  project_pi_name     VARCHAR(128)  COMMENT '课题组PI',
  project_group_name  VARCHAR(256)  COMMENT '课题组名称',
  department_name     VARCHAR(256)  COMMENT '部门',
  room_name           VARCHAR(128)  COMMENT '房间名称',
  campus_name         VARCHAR(64)   COMMENT '园区名称',
  triggered_at        DATETIME      COMMENT '触发时间',
  status              VARCHAR(20)   DEFAULT 'ACTIVE' COMMENT 'ACTIVE / CLEARED / EXPIRED',
  created_at          DATETIME      DEFAULT NOW(),
  updated_at          DATETIME      DEFAULT NOW() ON UPDATE NOW(),
  INDEX idx_rule (rule_id),
  INDEX idx_batch (scan_batch_id),
  INDEX idx_status (status)
);
```

### 3.3 扩展 `twin_student_violation`

新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `cage_violation_id` | BIGINT | 关联 `twin_cage_status_violation.id`，NULL=非笼架触发的违规 |

---

## 4. 触发引擎

### 4.1 架构

独立判定引擎 `CageStatusViolationCheckService`，通过 Spring Event 与同步任务解耦：

```
CageSpecialStatusScanService.executeFullScan()
  └─ 发布 CageScanCompletedEvent(scanBatchId, triggeredBy)
       └─ CageStatusViolationCheckService.onScanCompleted()
            └─ 遍历启用的 CAGE_STATUS 规则 → 判定 → 创建违规/公告
```

另注册独立 Job `CAGE_STATUS_VIOLATION_CHECK` 处理 `PURE_DAYS` 模式的定时判定。

### 4.2 AUTO_SYNC_LINKED 判定流程

```
1. 获取本批次 STATUS_ADDED 事件
2. 过滤：状态码 ∈ rule.cage_status_codes
3. 过滤：区域 ∈ rule.cage_area_filter（空=全部）
4. 过滤：课题组 ∈ rule.cage_group_whitelist（空=全部）
5. 对每个符合的笼位：
   a. 查 cage_event_log 中该位置+状态码的最早 STATUS_ADDED 时间 T0
   b. 判定：NOW - T0 ≥ cage_delay_days？
       → 是：查当前快照，状态仍存在 → 触发
       → 否：跳过，等下次同步
6. 去重：已有 ACTIVE 父记录 → 跳过
```

### 4.3 PURE_DAYS 判定流程

独立定时任务 `CAGE_STATUS_VIOLATION_CHECK`：

```
1. 读最新 scan_batch_id
2. 查 cage_event_log 中 STATUS_ADDED 且距今 ≥ cage_delay_days 的笼位
3. 交叉比对当前快照：状态仍存在 → 触发
4. 去重
```

### 4.4 课题组展开 + 违规创建

```
触发判定通过：
  1. 创建 twin_cage_status_violation 父记录
  2. 通过 project_group_name 查 aro_personnel 获取所有成员 userId
     + 合并管理员手动指定的额外人员
  3. 对每个成员：
     - 若 trigger_action = VIOLATION_ONLY 或 BOTH
       → TwinStudentViolationService.create()
           source = "CAGE_STATUS"
           cageViolationId = 父记录ID
           violationText = 规则模板渲染
           imageUrls = 规则配置的图片
           interactiveChallenge = 规则配置
     - 若 trigger_action = NOTICE_ONLY 或 BOTH
       → 为成员创建违规通知（绑定扫码弹窗，不入通用公告池）
  4. 记录执行日志
```

---

## 5. 前端设计

### 5.1 新标签页

在 `AdminStudentViolationsPage` 新增 "笼架联动" tab（`id: "cage-linkage"`），包含两个区域：
- 上部：规则管理列表
- 下部：笼架违规父记录列表

### 5.2 规则配置弹窗

字段清单：

- **规则名称**（必填）
- **监控状态类型**：多选（合笼/特殊饲养/请分笼/健康异常/动物转移）
- **判定模式**：单选（自动同步联动 / 纯天数 / 纯手动）
- **延迟天数**：整数
- **联动设置**（仅 AUTO_SYNC_LINKED 显示）：
  - 手动执行也触发判定：开关
- **区域筛选**：园区多选 + 房间多选（空=全部）
- **课题组白名单**：搜索 + 多选标签（空=全部）
- **触发动作**：单选（仅违规 / 仅公告 / 两者）
- **违规文案模板**：富文本（变量：`${name}` `${dept}` `${status}` `${cage}` `${date}`）
- **违规图片**：多图上传（富文本粘贴 + 文件选择）
- **交互式确认短语**：文本输入
- **验证后自动解除禁入**：开关
- **解禁方式**：单选（自助解禁 / 仅工作人员）
- **上限次数**：整数（空=不限）
- **计数窗口**：滑动窗口（N天）或固定周期（MM-DD 至 MM-DD）
- **达到上限替换文案**：富文本
- **启用**：开关

### 5.3 父记录详情面板

点击父记录行展开，包含：
- 触发信息（规则名、笼位、课题组、时间、状态）
- **成员子记录表格**：
  - 列：复选框、姓名、工号、部门、状态、操作（解除/删除）
  - 搜索筛选 + "仅看生效中"开关
  - 批量操作：全选、批量解除、批量删除
  - 添加成员按钮（可搜索添加额外个人）
- **父记录操作**：解除此笼架违规、删除此记录

---

## 6. API 设计

### 6.1 规则 CRUD（复用现有 + 扩展）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/admin/twin/student-violations/rules` | 列表（已有，新增 cage 字段） |
| POST | `/api/admin/twin/student-violations/rules` | 创建（已有，扩展字段） |
| PUT | `/api/admin/twin/student-violations/rules/{id}` | 更新（已有） |
| DELETE | `/api/admin/twin/student-violations/rules/{id}` | 删除（已有） |

### 6.2 父记录

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/admin/twin/cage-status-violations` | 父记录列表 |
| GET | `/api/admin/twin/cage-status-violations/{id}` | 父记录详情 + 子记录列表 |
| PUT | `/api/admin/twin/cage-status-violations/{id}` | 编辑（增删子记录成员） |
| POST | `/api/admin/twin/cage-status-violations/{id}/clear` | 解除 |
| DELETE | `/api/admin/twin/cage-status-violations/{id}` | 删除 |

### 6.3 子记录操作

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/admin/twin/cage-status-violations/{id}/members` | 添加成员 |
| DELETE | `/api/admin/twin/cage-status-violations/{id}/members/{userId}` | 移除单个成员 |
| POST | `/api/admin/twin/cage-status-violations/{id}/members/batch-clear` | 批量解除 |
| POST | `/api/admin/twin/cage-status-violations/{id}/members/batch-delete` | 批量删除 |

### 6.4 手动触发

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/admin/twin/cage-status-violations/trigger/{ruleId}` | 对指定规则手动执行判定 |

---

## 7. 后端模块结构

```
modules/twin/dashboard/
  ├─ entity/
  │    └─ TwinCageStatusViolation.java          (新增)
  ├─ mapper/
  │    └─ TwinCageStatusViolationMapper.java    (新增)
  ├─ service/
  │    └─ CageStatusViolationCheckService.java  (新增 — 判定引擎)
  ├─ dto/
  │    └─ CageStatusViolationDTO.java           (新增)
  └─ controller/
       └─ AdminCageStatusViolationController.java (新增)

modules/cageshelf/
  └─ service/
       └─ CageSpecialStatusScanService.java     (修改 — 发布 Event)

modules/twin/common/
  ├─ service/
  │    └─ JobExecutionRegistry.java             (修改 — 新增 JOB_CAGE_STATUS_VIOLATION_CHECK)
  └─ event/
       └─ CageScanCompletedEvent.java           (新增)
```

---

## 8. 数据库迁移

所有 SQL 迁移文件放在 `common/schema/` 下：

1. `V{timestamp}__cage_status_violation_rule_fields.sql` — 扩展 `twin_violation_rule`
2. `V{timestamp}__cage_status_violation_parent.sql` — 创建 `twin_cage_status_violation`
3. `V{timestamp}__student_violation_cage_fk.sql` — 扩展 `twin_student_violation`

---

## 9. 边界情况

| 场景 | 处理 |
|------|------|
| 同一笼位多次触发同一规则 | 去重：已有 ACTIVE 父记录则跳过 |
| 课题组在人员库中查不到成员 | 创建父记录但子记录为空，管理员可手动添加 |
| 同步任务失败 | 不发布 Event，本次不触发判定 |
| 规则被禁用 | 判定时跳过 disabled 规则 |
| 父记录被清除后状态再次出现 | 可再次触发（去重基于 ACTIVE 状态） |
| 课题组白名单为空 | 匹配所有课题组 |
| 区域筛选为空 | 匹配所有区域 |
