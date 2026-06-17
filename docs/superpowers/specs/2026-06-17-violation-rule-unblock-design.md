# 违规触发规则 & 解禁次数管控 — 设计文档

- **日期**: 2026-06-17
- **状态**: 待评审
- **关联页面**: `/admin/student-violations?tab=records`

## 1. 业务背景

当前系统仅有一种自动违规触发方式（滞留未签退 AUTO_STRANDED），所有违规共用同一套配置。解禁方式单一：后台人工清除或交互拼图验证。缺乏：

- 按触发规则类型的独立配置
- 按人+规则维度的解禁次数限制
- 时间窗口内的累计计数管控
- 达到上限后的强制阻断

## 2. 核心目标

1. **可扩展的触发规则体系** — 新增触发规则只需 INSERT 一行，无需改代码
2. **按人+规则+时间窗口独立计数** — 每个人在每条规则下独立累计，窗口外自动滚出
3. **两级解禁路径** — 自助解禁（拼图验证）/ 仅工作人员解禁，规则级配置
4. **上限强制覆盖** — 达到上限后 forbid_enter 强制=1，自助解禁关闭，形成「关键记录」
5. **删除即减计数** — 违规记录物理删除后 COUNT 自动减少，无需额外同步

## 3. 数据模型

### 3.1 新增表 `twin_violation_rule`（触发规则）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | BIGINT PK AUTO_INCREMENT | Y | 规则ID |
| `rule_code` | VARCHAR(64) UNIQUE | Y | 编码：AUTO_STRANDED、MANUAL、TAILGATE 等 |
| `rule_name` | VARCHAR(128) | Y | 显示名：「滞留未签退」「手动违规」 |
| `enabled` | TINYINT(1) | Y | 是否启用，默认 1 |
| `source_tag` | VARCHAR(30) | N | 对应违规记录 source 值 |
| `violation_text_tpl` | TEXT | N | 文案模板，支持 `${name}` `${dept}` `${date}` |
| `forbid_enter` | TINYINT(1) | Y | 是否禁止进入，默认 0 |
| `expire_after_days` | INT | N | 自动过期天数 |
| `show_notice_every_scan` | TINYINT(1) | Y | 每次扫码弹窗，默认 1 |
| `interactive_challenge` | VARCHAR(255) | N | 自助拼图短语，NULL 则无需拼图 |
| `interactive_unlock_on_verify` | TINYINT(1) | Y | 拼图通过即解禁 forbid_enter，默认 1 |
| `unblock_method` | VARCHAR(20) | Y | 解禁方式：`自助解禁` / `仅工作人员`，默认`自助解禁` |
| `unblock_max_count` | INT | N | 窗口内最大违规次数，NULL=不限制 |
| `unblock_window_type` | VARCHAR(20) | N | 窗口类型：`滑动窗口` / `固定周期`，默认`滑动窗口` |
| `unblock_window_value` | INT | N | 滑动天数（30=30天）/ 固定周期编号（1=自然月 2=自然周 3=学期），默认 30 |
| `auto_signout_enabled` | TINYINT(1) | N | 触发时自动签退 |
| `whitelist_depts` | JSON | N | 部门白名单 |
| `cron_expression` | VARCHAR(64) | N | 定时触发 cron，NULL=不自动触发 |
| `last_execution_at` | DATETIME | N | 上次执行时间 |
| `last_execution_result` | TEXT | N | 上次执行结果 |
| `created_at` | DATETIME | Y | |
| `updated_at` | DATETIME | Y | |

### 3.2 修改表 `twin_student_violation` 加列

```sql
ALTER TABLE twin_student_violation ADD COLUMN rule_id BIGINT NULL;
ALTER TABLE twin_student_violation ADD INDEX idx_tsv_rule (rule_id);
```

### 3.3 状态枚举（中文命名）

| 旧值 | 新值 | 含义 |
|------|------|------|
| ACTIVE | 生效中 | 正在生效的违规 |
| CLEARED | 已解除 | 后台或自助解禁 |
| EXPIRED | 已过期 | 超过 expire_at |
| SUPERSEDED | 已替换 | 被新违规顶替 |
| PROCESSED | 已处理 | 标记处理完毕 |

> 后端 DB 列值保持不变（英文），仅在 API 返回和前端展示时映射为中文。前端的 `StudentViolationStatus` 类型同步更新。

## 4. 核心业务逻辑

### 4.1 解禁计数查询

```sql
SELECT COUNT(*)
FROM twin_student_violation
WHERE target_user_id = :userId
  AND rule_id = :ruleId
  AND created_at >= :windowStart
```

- 包含所有状态（生效中/已解除/已过期/已处理/已替换），历史存在即计入
- 物理删除自动不计入
- `rule_id IS NULL` 的记录跳过不计
- `windowStart` 由规则配置实时计算：
  - 滑动窗口：`NOW() - INTERVAL unblock_window_value DAY`
  - 固定周期：返回当前周期第一天 00:00:00

### 4.2 解禁判定（违规创建/扫码分析时调用）

```
输入: userId, ruleId, forbid_enter(规则原始值)
输出: effective_forbid_enter, is_critical(关键记录), remaining_count

步骤:
  K = COUNT(userId, ruleId, windowStart) + 1   // 含本次，共第几次
  max = rule.unblock_max_count

  IF max IS NULL THEN
    effective_forbid_enter = forbid_enter       // 不设上限，原样返回
    is_critical = false
  ELSE IF K < max THEN
    effective_forbid_enter = forbid_enter       // 未达上限，按规则
    is_critical = false
  ELSE  // K >= max
    effective_forbid_enter = 1                  // 强制覆盖禁入
    is_critical = true                          // 标记为关键记录
  END IF

  remaining = max - K                           // 剩余容忍次数（≤0 时无剩余）
```

### 4.3 自助解禁判定

```
输入: violationId, userId
输出: can_self_unblock

步骤:
  row = getById(violationId)
  rule = getRule(row.rule_id)
  IF rule.unblock_method != '自助解禁' THEN return false
  K = COUNT(userId, ruleId, windowStart)   // 含本条
  IF K >= rule.unblock_max_count THEN return false  // 达到上限，关闭自助
  return true
```

### 4.4 后台解禁（管理员操作）

```
后台清除/标记已处理：不受次数限制，任何情况下均可执行。
规则配置 unblock_method = '仅工作人员' 时，这是唯一解禁路径。

操作后记录状态变为「已解除」/「已处理」，但 COUNT 仍计入（历史存在），
意味着该人下次触发时 K 值不变（或增1），逐步逼近上限。
```

### 4.5 上限强制覆盖示例

规则配置：`unblock_max_count = 3`，`forbid_enter = 0`（宽松模式），`unblock_method = 自助解禁`

| 次数 | 行为 | forbid_enter | 自助解禁 | 状态 |
|------|------|:---:|:---:|------|
| 第1次 | 警告弹窗 | 0 | ✅ 可用 | 可能被解除 |
| 第2次 | 警告弹窗 | 0 | ✅ 可用 | 可能被解除 |
| 第3次 | **强制禁入** | **1（覆盖）** | ❌ 不可用 | 关键记录 |

规则配置：`unblock_max_count = 3`，`forbid_enter = 1`（严格模式）

| 次数 | 行为 | forbid_enter | 自助解禁 | 状态 |
|------|------|:---:|:---:|------|
| 第1次 | 禁入+弹窗 | 1 | ✅ 可用 | 拼图解除 |
| 第2次 | 禁入+弹窗 | 1 | ✅ 可用 | 拼图解除 |
| 第3次 | **强制禁入** | **1（覆盖）** | ❌ 不可用 | 关键记录 |

## 5. 两种解禁路径

| | 自助解禁 | 仅工作人员 |
|---|---|---|
| **扫码弹窗拼图** | ✅ 可用（未达上限时） | ❌ 不显示 |
| **后台清除/处理** | ✅ 兜底可用 | ✅ 唯一方式 |
| **达到上限后** | ❌ 拼图灰掉 | ✅ 后台操作 |

## 6. 迁移策略

### 6.1 原则

- 现有违规记录 `rule_id = NULL`，解禁计数跳过（`WHERE rule_id IS NOT NULL`）
- 仅新产生的违规受规则管控
- 不做自动数据回填

### 6.2 部署步骤

1. 执行 DDL：创建 `twin_violation_rule` 表、`twin_student_violation` 加列
2. 执行种子数据：插入两条默认规则
   - `AUTO_STRANDED`：「滞留未签退」，从 `stranded_violation_config` 迁移配置数据
   - `MANUAL`：「手动违规」，仅工作人员可解除，不限次数
3. 修改 `StrandedViolationService`：改为从 `twin_violation_rule` 读取配置
4. 修改违规创建逻辑：写入时关联 `rule_id`
5. 废弃 `stranded_violation_config` 表（保留数据不删除，仅不再读写）

## 7. 前后端改动清单

### 7.1 后端

| 模块 | 改动 |
|------|------|
| `TwinViolationRule` entity | 新增 |
| `TwinViolationRuleMapper` + XML | 新增 CRUD |
| `TwinViolationRuleService` | 新增：CRUD、计数查询、解禁判定 |
| `TwinStudentViolation` entity | +`ruleId` 字段 |
| `TwinStudentViolationMapper.xml` | insert/select 补充 rule_id |
| `TwinStudentViolationService` | create 接收 ruleId；buildNotice 集成解禁判定 |
| `AdminTwinStudentViolationController` | 新增规则 CRUD 端点；列表返回规则名 |
| `StrandedViolationService` | 改为读 `twin_violation_rule` 配置 |
| `TwinScanController` | 解禁判定集成到 analyze |
| SQL 迁移文件 | `V{ts}__violation-rule.sql` |

### 7.2 前端

| 模块 | 改动 |
|------|------|
| `studentViolation.api.ts` | 新增规则 API（CRUD）；状态枚举中文化 |
| `AdminStudentViolationsPage.tsx` | 新增「触发规则」管理 Tab；records Tab 显示规则名+解禁状态 |
| `ScanPopupNoticeBanner.tsx` | 自助解禁按钮根据上限判定灰掉/隐藏 |
| `ScanPopupNoticeCoordinator.tsx` | 集成解禁判定 |
| `twinViolationInteractive.ts` | 自助解禁增加次数检查 |

## 8. API 端点设计

### 8.1 规则 CRUD（管理端）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/admin/twin/violation-rules` | 规则列表 |
| GET | `/api/admin/twin/violation-rules/{id}` | 规则详情 |
| POST | `/api/admin/twin/violation-rules` | 新建规则 |
| PUT | `/api/admin/twin/violation-rules/{id}` | 编辑规则 |
| DELETE | `/api/admin/twin/violation-rules/{id}` | 删除规则（有关联记录时禁止） |

### 8.2 解禁相关（扫描端）

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/scan/violation/unblock-status?userId=&ruleId=` | 查询当前解禁状态（次数/剩余/可自助否） |

### 8.3 已有端点改动

- `POST /api/admin/twin/student-violations` — 请求体新增 `ruleId`
- `GET /api/admin/twin/student-violations` — 响应新增 `ruleId`、`ruleName`
- 扫码 analyze 响应中的 `StudentViolationNotice` 新增 `isCritical`、`canSelfUnblock`

## 9. 自审清单

- [x] 无硬编码占位符或 TODO
- [x] 数据模型与业务逻辑一致
- [x] 计数逻辑覆盖所有状态（生效中/已解除/已过期/已处理/已替换）
- [x] 物理删除自动减计数（COUNT 天然行为）
- [x] 迁移策略明确（仅新记录，不自动回填）
- [x] 上限强制覆盖逻辑明确
- [x] 两种解禁路径职责清晰
- [x] API 端点完整列出
