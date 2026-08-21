# 动物订购时间管理 — 设计规格

| 属性 | 值 |
|---|---|
| 状态 | 已锁定（实现前基线） |
| 日期 | 2026-08-21 |
| 范围 | Web 控制台动物订购（`/#/console/admin/animal-order`）可购窗口 + 预计送达日 |
| 方案 | 规范化多表（方案 2） |

---

## 1. 背景与目标

### 1.1 问题

动物订购页当前无「可购时间窗口」与「预计送达日」的统一策略。管理员无法配置维护窗口、节假日调休，学生端也无法在闭窗期获得明确反馈。

### 1.2 目标

1. **可购窗口**：按全局默认 + 可选品类覆盖，限制前端加购/结算；后端在 `submitOrder` 热路径二次校验。
2. **预计送达日（ETA）**：下单时计算并持久化到 `ref_order.estimated_delivery_date`；展示给学生与管理员。
3. **节假日**：本地表驱动工作日计算；支持离线 JSON 导入与管理员一键从 NateScarlet/holiday-cn 拉取入库；**订购热路径不访问外网**。

### 1.3 非目标（Out of Scope）

| 排除项 | 说明 |
|---|---|
| 政府官方节假日 API | 不依赖 timor.tech 等第三方实时接口 |
| 订购热路径外网 | 结算/ETA 仅读本地 `animal_order_holiday` |
| 小程序对等实现 | 本期以 Web 控制台为主；小程序可后续复用同一套 API（follow-up） |
| 订单审批流改造 | 不改变现有 `ref_order` 审批状态机 |
| 多 ETA 策略并存 | `RELATIVE` 与 `FIXED` 全局仅一种生效 |

### 1.4 现有代码锚点

| 位置 | 用途 |
|---|---|
| `frontend/src/features/reference-data/ReferenceDataManager.tsx` | 动物订购主 UI；`isAdmin = mode === "admin" && hasMinRole(role, "SUPER_ADMIN")`；「规格模板」按钮同位置新增「时间管理」 |
| `frontend/src/features/reference-data/SpecTemplateManager.tsx` | `OrderTimeManager` 模态框交互与布局参考 |
| `frontend/src/pages/ReferenceDataPage.tsx` | 路由 `/#/console/admin/animal-order` → `mode="admin"` |
| `src/main/java/com/example/demo/modules/referencedata/service/ReferenceDataService.java` | `submitOrder` 结算入口，集成 `canOrder` + ETA 持久化 |
| `src/main/java/com/example/demo/modules/referencedata/controller/ReferenceDataController.java` | 参考数据 API 前缀 `/api/reference-data` |
| `src/main/java/com/example/demo/modules/twin/order/controller/AnimalOrderController.java` | 官方订单同步/看板（`aro_animal_order`），与本特性订单主表 `ref_order` 分离 |

---

## 2. 产品行为

### 2.1 管理入口

- **路由**：`/#/console/admin/animal-order` 工具栏，「规格模板」按钮右侧新增 **「时间管理」**。
- **可见性**：与规格模板一致 — `mode === "admin" && hasMinRole(role, "SUPER_ADMIN")`。
- **组件**：`OrderTimeManager` 全屏/大模态（对齐 `SpecTemplateManager`），含三个 Tab：可购窗口 / 预计送达 / 节假日。

### 2.2 学生与管理订购 UI

| 状态 | 行为 |
|---|---|
| 当前不可购 | 禁用加购、提交订单包、组长结算；展示闭窗原因 + **下次开放时间**（`nextOpenAt`） |
| 当前可购 | 正常交互；购物车/结算区展示 **预计送达日**（来自策略实时预览或下单后订单字段） |
| 结算成功 | 订单行写入 `estimated_delivery_date`（`DATE`），与当时策略快照一致 |

前端禁用仅为 UX；后端 `submitOrder` 必须调用 `canOrder(orderAt, categoryKey)`，失败返回 `400` + 业务码。

### 2.3 品类键（`category_key`）

- 类型：`VARCHAR(64)`，可为空（仅 `scope=GLOBAL` 规则）。
- 语义：引用数据树中 **可购叶子节点的直接父级类型键**，与 `ref_data.ref_type` 层级一致。首期约定为 **品系（`STRAIN`）所属品种（`BREED`）节点的 `id` 字符串化**，即同一品种下所有品系共享窗口。
- 前端加购时从当前选中物品的 `breedId`（或等价父节点 id）传入引擎；无父级时仅匹配 `GLOBAL` 规则。

---

## 3. 运行时引擎

所有时间运算使用 **服务器本地时区**（`Asia/Shanghai`），与节假日表一致。

### 3.1 数据结构（内存模型）

```
Policy {
  defaultMode: OPEN | CLOSED
  etaMode: RELATIVE | FIXED
  etaWorkdayOffset: int   // ≥ 0，仅 RELATIVE
  etaFixedDate: LocalDate // 仅 FIXED
}

WindowRule {
  scope: GLOBAL | CATEGORY
  categoryKey: string?
  effect: OPEN | DISABLE
  shape: DAILY | RANGE
  dailyStart, dailyEnd: LocalTime?   // DAILY
  rangeStart, rangeEnd: ZonedDateTime? // RANGE，闭区间 [start, end]
}

HolidayMap: Map<LocalDate, HOLIDAY | WORKDAY_SHIFT>
```

### 3.2 `isWorkday(date)`

| 条件 | 结果 |
|---|---|
| `HolidayMap[date] == HOLIDAY` | `false` |
| `HolidayMap[date] == WORKDAY_SHIFT` | `true` |
| 周一至周五 | `true` |
| 周六、周日 | `false` |

**空年份**：该年无节假日记录时，仅按周一至周五计算；管理端导入/拉取面板对该年显示 **警告横幅**（不阻断计算）。

### 3.3 `selectRuleSet(categoryKey)`

```
if exists active rules where scope=CATEGORY and category_key=categoryKey:
    return those rules
else:
    return active rules where scope=GLOBAL
```

品类规则与全局规则 **不合并**；有品类规则时完全替代全局规则集。

### 3.4 `ruleCoversInstant(rule, instant)`

**DAILY**（每日重复，按本地日历日）：

- 令 `t = instant` 的本地时间部分，`d = instant` 的本地日期。
- 若 `dailyStart <= dailyEnd`（不跨午夜）：覆盖当且仅当 `dailyStart <= t <= dailyEnd`。
- 若 `dailyStart > dailyEnd`（跨午夜）：覆盖当且仅当 `t >= dailyStart`（属于 `d` 当日后半段）**或** `t <= dailyEnd`（属于 `d` 当日凌晨，语义上延续自 `d-1` 开始的窗口）。实现上对 `instant` 同时检测「当日跨午夜后半」与「次日跨午夜前半」。

**RANGE**：`rangeStart <= instant <= rangeEnd`（含端点）。

### 3.5 `effectiveEffectAt(instant, categoryKey)`

```
rules = selectRuleSet(categoryKey)
matched = [ r.effect for r in rules if ruleCoversInstant(r, instant) ]

if matched contains both OPEN and DISABLE:
    // 保存期应已拦截；运行时视为系统错误
    throw ANIMAL_ORDER_WINDOW_CONFLICT

if matched is empty:
    return defaultMode  // OPEN 或 CLOSED

if any matched == DISABLE:
    return CLOSED       // DISABLE 优先于 OPEN

return OPEN             // 仅 OPEN 命中
```

将 `OPEN` 映射为可购、`CLOSED` 映射为不可购。

### 3.6 `canOrder(orderAt, categoryKey)`

```
effect = effectiveEffectAt(orderAt, categoryKey)
return effect == OPEN
```

批量结算（多品类行）：**任一行不可购则整单拒绝**；返回第一个不可购行的 `categoryKey` 与原因。

### 3.7 `findUnavailableSegmentContaining(instant, categoryKey)`

在 `orderAt = instant` 时，若 `canOrder` 为 `true`，返回 `null`。

否则向前/向后扩展，得到 **最大连续不可购区间** `[segStart, segEnd]`（按 `effectiveEffectAt` 判定，DAILY 规则按日展开为连续时间段拼接）。

用于 ETA 锚点：若 `instant` 落在该区间内，锚点时刻 = `segEnd`（区间结束后的下一瞬间，取日期部分进入工作日计算）。

### 3.8 `estimateDelivery(orderAt, categoryKey, policy, holidayMap)`

**步骤 A — 锚点时刻**

```
seg = findUnavailableSegmentContaining(orderAt, categoryKey)
if seg != null:
    anchor = seg.end  // 不可购段结束时刻（开区间右侧）
else:
    anchor = orderAt
anchorDate = anchor.toLocalDate()
```

**步骤 B — 按 ETA 模式**

**RELATIVE**（`etaWorkdayOffset = N`，`N >= 0`）：

1. `startWorkday` = `anchorDate` 起第一个 `isWorkday` 为真的日期（含当日）。
2. 从 `startWorkday` 起再前进 `N` 个工作日（`N=0` 时结果就是 `startWorkday`）。
3. 返回该日期。

**FIXED**（`etaFixedDate = D`）：

1. 若 `isWorkday(D)`，返回 `D`。
2. 否则从 `D` 起向前滚动至下一个 `isWorkday` 为真的日期并返回。

RELATIVE 与 FIXED **互斥**；策略表仅一种 `eta_mode` 生效。

### 3.9 引擎错误码

| 代码 | HTTP | 场景 | 用户可见文案（中文） |
|---|---|---|---|
| `ANIMAL_ORDER_WINDOW_CLOSED` | 400 | `submitOrder` 时 `canOrder=false` | 当前不在可购时间窗口内 |
| `ANIMAL_ORDER_WINDOW_CONFLICT` | 500 | 运行时仍出现 OPEN/DISABLE 同刻冲突（数据被绕过校验） | 时间窗口配置异常，请联系管理员 |
| `ANIMAL_ORDER_WINDOW_RULE_CONFLICT` | 400 | 管理端保存规则时相反效果重叠 | 存在相反效果的重叠时间段，请调整规则 |
| `ANIMAL_ORDER_ETA_POLICY_INVALID` | 400 | `eta_mode=FIXED` 但 `eta_fixed_date` 为空 | 固定送达日未配置 |
| `ANIMAL_ORDER_HOLIDAY_YEAR_EMPTY` | 200（警告） | 目标年份无节假日数据 | 该年度节假日数据为空，仅按周末排除计算 |

---

## 4. 可购窗口规则

### 4.1 规则字段

| 字段 | 说明 |
|---|---|
| `effect` | `OPEN`：显式开放；`DISABLE`：显式关闭 |
| `shape` | `DAILY`：`HH:mm–HH:mm`，可跨午夜；`RANGE`：`datetime–datetime` 一次性区间 |
| `scope` | `GLOBAL` 或 `CATEGORY` |
| `category_key` | `scope=CATEGORY` 时必填 |
| `active` | `1` 参与计算，`0` 软删除/停用 |

### 4.2 默认模式

- 表 `animal_order_time_policy.default_mode`：`OPEN` 或 `CLOSED`。
- **无任何规则覆盖当前时刻** 时，采用 `default_mode`。
- 典型配置：
  - `default_mode=CLOSED` + 若干 `OPEN` 规则 → 白名单开放；
  - `default_mode=OPEN` + 若干 `DISABLE` 规则 → 黑名单维护窗。

### 4.3 保存期冲突校验

对 **同一规则集**（同一 `scope` + 同一 `category_key`，或全局集）：

1. 将每条规则投影到 **未来 400 天** 的时间轴（DAILY 按日展开，RANGE 原样）。
2. 合并 **相同 `effect`** 的重叠区间（并集）。
3. 若存在时刻同时被 `OPEN` 与 `DISABLE` 覆盖 → **拒绝保存**，HTTP `400`，码 `ANIMAL_ORDER_WINDOW_RULE_CONFLICT`。
4. 相同效果重叠 **允许**（合并语义）。

前端 `TimeWindowRuleEditor` 在提交前做同等校验，减少往返。

### 4.4 示例

| default | 规则 | 周一 10:00 可购？ |
|---|---|---|
| `CLOSED` | DAILY OPEN 09:00–17:00 | 是 |
| `OPEN` | DAILY DISABLE 12:00–13:00 | 否（午休） |
| `OPEN` | RANGE DISABLE 2026-10-01 00:00 – 2026-10-07 23:59 | 国庆期间否 |

---

## 5. 预计送达（ETA）策略

全局单例策略（`animal_order_time_policy` 表一行，`id=1`）。

| `eta_mode` | 字段 | 行为 |
|---|---|---|
| `RELATIVE` | `eta_workday_offset`（`INT >= 0`） | 见 §3.8 RELATIVE；`0` = 锚点当日若为工作日则当日送达，否则下一工作日 |
| `FIXED` | `eta_fixed_date`（`DATE`） | 见 §3.8 FIXED；全体订单统一滚动后的固定送达日 |

切换 `eta_mode` 时 UI 禁用另一模式的字段；保存时校验必填项。

**下单快照**：`ref_order.estimated_delivery_date` 在 `submitOrder` 成功时写入，事后改策略 **不追溯** 已下单。

---

## 6. 节假日

### 6.1 表 `animal_order_holiday`

本地权威数据源；引擎只读此表。

### 6.2 数据来源（A + B）

| 方式 | 操作者 | `source` 值 |
|---|---|---|
| A. 离线 JSON 导入 | `SUPER_ADMIN` 上传文件 | `IMPORT` |
| B. 一键 CDN 拉取 | `SUPER_ADMIN` 点「从 holiday-cn 同步」 | `CDN` |
| 管理端手工增删 | `SUPER_ADMIN` | `MANUAL` |

**CDN 源**（实现任选其一，管理员操作触发，非热路径）：

- `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/{year}.json`
- 或 `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/{year}.json`

**JSON 行映射**（holiday-cn 格式）：

```json
{ "date": "2026-01-01", "isOffDay": true, "name": "元旦" }
```

| `isOffDay` | `day_type` |
|---|---|
| `true` | `HOLIDAY` |
| `false` | `WORKDAY_SHIFT` |

### 6.3 Upsert 语义

- 唯一键：`holiday_date`。
- 同日期再次导入/拉取：**覆盖** `day_type`、`name`、`source`。
- 不删除未出现在导入文件中的既有日期（避免部分年份文件误删调休）；手工删除走 DELETE API。

### 6.4 空年警告

GET 节假日列表或 ETA 预览时，若查询年份 `COUNT(*)=0`，响应 `warnings: ["ANIMAL_ORDER_HOLIDAY_YEAR_EMPTY"]`；管理端 Tab 顶部展示黄色提示。

---

## 7. 数据库设计

遵循 `数据库字段档案/01-建表要求与规范.md`：双轨 SQL（`common/schema/V{YYYYMMDD}{seq}__*.sql` + `src/main/resources/db/bootstrap-*.sql`）、`snake_case`、`utf8mb4`、列 `COMMENT`、审计时间戳。

### 7.1 `animal_order_time_policy`（单例行）

```sql
CREATE TABLE IF NOT EXISTS animal_order_time_policy (
    id                   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    default_mode         VARCHAR(16)  NOT NULL DEFAULT 'OPEN'
        COMMENT '无规则命中时的默认可购性：OPEN|CLOSED',
    eta_mode             VARCHAR(16)  NOT NULL DEFAULT 'RELATIVE'
        COMMENT 'RELATIVE|FIXED，全局仅一种生效',
    eta_workday_offset   INT          NOT NULL DEFAULT 3
        COMMENT 'RELATIVE：锚点后第 N 个工作日，0=锚点当日或下一工作日',
    eta_fixed_date       DATE         NULL
        COMMENT 'FIXED：固定送达基准日',
    active               TINYINT      NOT NULL DEFAULT 1,
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动物订购时间策略（单例）';
```

种子：`INSERT` 默认行 `id=1, default_mode='OPEN', eta_mode='RELATIVE', eta_workday_offset=3`。

### 7.2 `animal_order_window_rule`

```sql
CREATE TABLE IF NOT EXISTS animal_order_window_rule (
    id                   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    scope                VARCHAR(16)  NOT NULL DEFAULT 'GLOBAL'
        COMMENT 'GLOBAL|CATEGORY',
    category_key         VARCHAR(64)  NULL
        COMMENT 'scope=CATEGORY 时必填，如品种 ref_data.id',
    effect               VARCHAR(16)  NOT NULL
        COMMENT 'OPEN|DISABLE',
    shape                VARCHAR(16)  NOT NULL
        COMMENT 'DAILY|RANGE',
    daily_start_time     TIME         NULL
        COMMENT 'DAILY 开始时刻',
    daily_end_time       TIME         NULL
        COMMENT 'DAILY 结束时刻，可小于 start 表示跨午夜',
    range_start_at       DATETIME     NULL
        COMMENT 'RANGE 含起点',
    range_end_at         DATETIME     NULL
        COMMENT 'RANGE 含终点',
    label                VARCHAR(128) NULL
        COMMENT '管理端展示用说明',
    sort_order           INT          NOT NULL DEFAULT 0,
    active               TINYINT      NOT NULL DEFAULT 1,
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_window_scope_category (scope, category_key, active),
    KEY idx_window_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动物订购可购窗口规则';
```

CHECK 约束由应用层校验：`DAILY` 必填 `daily_*`；`RANGE` 必填 `range_*` 且 `range_start_at <= range_end_at`。

### 7.3 `animal_order_holiday`

```sql
CREATE TABLE IF NOT EXISTS animal_order_holiday (
    id                   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    holiday_date         DATE         NOT NULL
        COMMENT '自然日',
    day_type             VARCHAR(16)  NOT NULL
        COMMENT 'HOLIDAY|WORKDAY_SHIFT',
    name                 VARCHAR(128) NULL
        COMMENT '节日或调休说明',
    source               VARCHAR(16)  NOT NULL DEFAULT 'MANUAL'
        COMMENT 'IMPORT|CDN|MANUAL',
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_holiday_date (holiday_date),
    KEY idx_holiday_year (holiday_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动物订购节假日与调休';
```

### 7.4 `ref_order` 扩展

```sql
ALTER TABLE ref_order
    ADD COLUMN estimated_delivery_date DATE NULL
        COMMENT '下单时计算的预计送达日（工作日）'
        AFTER submitted_at;
```

同步更新 `ReferenceDataSchemaMigrator` 幂等加列。

---

## 8. API 设计

控制器建议：`AnimalOrderTimeController`，`@RequestMapping("/api/animal-order")`。鉴权与现有模块一致（JWT / Session）。

### 8.1 有效策略摘要（登录用户）

```
GET /api/animal-order/time-policy
```

**Query**：`categoryKey`（可选，预览用）、`at`（可选 ISO 时间，默认 `now`）

**Response 200**：

```json
{
  "defaultMode": "OPEN",
  "canOrderNow": true,
  "closedReason": null,
  "nextOpenAt": null,
  "etaMode": "RELATIVE",
  "estimatedDeliveryDate": "2026-08-26",
  "etaWorkdayOffset": 3,
  "warnings": []
}
```

闭窗时：`canOrderNow=false`，`closedReason` 中文说明，`nextOpenAt` 为下一可购时刻（ISO 8601）。

### 8.2 管理 — 策略与规则

```
GET  /api/animal-order/time-policy/admin
PUT  /api/animal-order/time-policy/admin
```

**权限**：`SUPER_ADMIN`

**PUT Body**：

```json
{
  "defaultMode": "CLOSED",
  "etaMode": "RELATIVE",
  "etaWorkdayOffset": 3,
  "etaFixedDate": null,
  "rules": [ { "id": 1, "scope": "GLOBAL", "effect": "OPEN", "shape": "DAILY", ... } ]
}
```

- 服务端执行 §4.3 冲突校验；失败 `400` + `ANIMAL_ORDER_WINDOW_RULE_CONFLICT`。
- 规则 `id` 省略表示新建；`active=0` 表示删除。

### 8.3 节假日

```
GET    /api/animal-order/holidays?year=2026
POST   /api/animal-order/holidays
DELETE /api/animal-order/holidays/{id}
POST   /api/animal-order/holidays/import        // multipart JSON 文件
POST   /api/animal-order/holidays/sync-cdn      // body: { "year": 2026 }
```

**权限**：写操作 `SUPER_ADMIN`；`GET` 登录可读（学生端 ETA 预览可复用）。

**POST 单条 Body**：`{ "holidayDate": "2026-01-01", "dayType": "HOLIDAY", "name": "元旦" }`

**import / sync-cdn Response**：`{ "upserted": 28, "year": 2026, "warnings": [] }`

### 8.4 结算集成

`ReferenceDataService.submitOrder` 在 allowlist 校验之后、落库之前：

```java
ZonedDateTime orderAt = ZonedDateTime.now(ZoneId.of("Asia/Shanghai"));
for (line : itemsToProcess) {
    String categoryKey = resolveCategoryKey(line.getRefDataId());
    if (!timePolicyEngine.canOrder(orderAt, categoryKey)) {
        throw new TwinBusinessException(400, "ANIMAL_ORDER_WINDOW_CLOSED", "当前不在可购时间窗口内");
    }
}
LocalDate eta = timePolicyEngine.estimateDelivery(orderAt, dominantCategoryKey, policy);
order.setEstimatedDeliveryDate(eta);
```

多行订单 ETA：采用 **所有行锚点与策略相同** 时取最晚品类 ETA，或简化为 **整单使用第一行 `categoryKey`** — **本期锁定：整单一个 ETA，取各行 `estimateDelivery` 的 **最大值（最晚送达）**。

---

## 9. 前端组件

### 9.1 组件树

```
ReferenceDataManager
  └── OrderTimeManager (modal)
        ├── Tab: 可购窗口 → TimeWindowRuleEditor
        ├── Tab: 预计送达 → EtaPolicyEditor
        └── Tab: 节假日   → HolidayImportPanel
```

### 9.2 `TimeWindowRuleEditor`

- 列表 + 内联表单：scope、category 选择器、`effect`、`shape`、时间控件、`label`。
- 客户端冲突检测（§4.3）与保存错误展示。
- 全局 `defaultMode` 单选。

### 9.3 `EtaPolicyEditor`

- 模式切换 `RELATIVE` / `FIXED`。
- RELATIVE：`etaWorkdayOffset` 数字步进（≥0），实时预览「若现在下单 → 预计送达」。
- FIXED：日期选择器 + 工作日滚动预览。

### 9.4 `HolidayImportPanel`

- 年份筛选表格：日期、类型、名称、来源。
- 按钮：上传 JSON、**从 holiday-cn 同步**、手工新增/删除。
- 空年警告条。

### 9.5 订购页集成

- `useAnimalOrderTimePolicy(categoryKey)` hook 轮询/聚焦刷新 `GET /time-policy`。
- 闭窗：加购按钮 `disabled`，展示 `closedReason` + `nextOpenAt` 格式化。
- 开窗：侧栏/结算条展示 `estimatedDeliveryDate`。

### 9.6 API 客户端

新增 `frontend/src/api/domains/animalOrderTime.api.ts` 与 hooks，与 `useReferenceData` 模式一致。

---

## 10. 后端模块结构

```
com.example.demo.modules.animalorder
  ├── controller.AnimalOrderTimeController
  ├── service.AnimalOrderTimePolicyService
  ├── engine.AnimalOrderTimeEngine        // §3 纯函数
  ├── engine.WindowRuleConflictValidator
  ├── entity.AnimalOrderTimePolicy
  ├── entity.AnimalOrderWindowRule
  ├── entity.AnimalOrderHoliday
  └── mapper.*Mapper + resources/mapper/*.xml
```

- 引擎类无 Spring 依赖，便于单元测试。
- 节假日 CDN 拉取在 `HolidaySyncService` 中用 `RestTemplate` / `WebClient`，**仅管理 API 调用**。

---

## 11. 测试要点

| 用例 | 预期 |
|---|---|
| 默认 CLOSED，无 OPEN 规则 | 全天不可购 |
| DAILY OPEN 跨午夜 22:00–06:00 | 23:00 可购，10:00 不可购（若默认 CLOSED） |
| 相反效果重叠保存 | 400 `ANIMAL_ORDER_WINDOW_RULE_CONFLICT` |
| 同效果重叠保存 | 200 |
| 品类规则存在 | 忽略全局规则 |
| 品类规则不存在 | 回退全局规则 |
| RELATIVE offset=0，周五下单 | ETA 周五；周六下单 → 下周一 |
| 下单在 DISABLE 段内 | 锚点为段末后首个时刻再计工作日 |
| FIXED 落在周六 | 滚动至下周一 |
| HOLIDAY 覆盖周三 | 该日不计入工作日 |
| WORKDAY_SHIFT 周日 | 计入工作日 |
| 空节假日年 | 仅周末排除 + 管理警告 |
| submitOrder 闭窗 | 400，不写库 |
| submitOrder 开窗 | `estimated_delivery_date` 有值 |

---

## 12. 实施顺序

1. Flyway + bootstrap 四表/列（§7）。
2. `AnimalOrderTimeEngine` + 冲突校验单元测试。
3. 管理 API + `SUPER_ADMIN` 鉴权。
4. `OrderTimeManager` 三 Tab。
5. `ReferenceDataManager` 入口按钮 + 学生端禁用/ETA 展示。
6. `submitOrder` 集成与 `ref_order` 字段回显。

---

## 13. 自审清单（已完成）

- [x] 无 TBD / TODO 占位
- [x] 窗口方案明确为规范化多表（方案 2）
- [x] OPEN/DISABLE、DAILY/RANGE、默认模式、品类回退 GLOBAL 均已定义
- [x] 相反效果重叠禁止、同效果合并已定义
- [x] ETA RELATIVE/FIXED 互斥；offset=0 语义明确
- [x] 节假日双来源、Upsert、热路径不联网
- [x] `isWorkday` / `canOrder` / `estimateDelivery` / 错误表完整
- [x] 表名/列名符合仓库 Flyway 惯例
- [x] API 路径、权限、结算集成点明确
- [x] Out of scope 显式列出
- [x] 现有代码锚点已引用
