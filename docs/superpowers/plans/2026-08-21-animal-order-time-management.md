# 动物订购时间管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Web 控制台动物订购页实现可购时间窗口、预计送达日（ETA）与节假日驱动的运行时引擎，管理员可配置，学生端闭窗禁用加购/结算，后端 `submitOrder` 二次校验并持久化 `estimated_delivery_date`。

**Architecture:** 规范化三表（`animal_order_time_policy` / `animal_order_window_rule` / `animal_order_holiday`）+ `ref_order.estimated_delivery_date`；纯 Java 引擎 `AnimalOrderTimeEngine`（无 Spring）承载 §3 算法；`AnimalOrderTimePolicyService` 读库组装引擎输入；`AnimalOrderTimeController` 暴露 `/api/animal-order/*`；前端 `OrderTimeManager` 三 Tab 模态框对齐 `SpecTemplateManager`，订购页通过 `useAnimalOrderTimePolicy` 轮询策略摘要。

**Tech Stack:** Java 17 / Spring Boot / MyBatis XML、JUnit 5、React + TanStack Query + Tailwind（twin 设计 token）、Flyway + bootstrap 双轨 DDL

**Design spec:** `docs/superpowers/specs/2026-08-21-animal-order-time-management-design.md`

---

## File map（创建 / 修改一览）

| 职责 | 路径 |
|---|---|
| Flyway 归档 | `common/schema/V20260821019__animal_order_time_management.sql` |
| Bootstrap 幂等 DDL | `src/main/resources/db/bootstrap-animal-order-time.sql` |
| 启动链注册 | `src/main/java/com/example/demo/common/bootstrap/EmbeddedTwinSystemCoreDdlBootstrap.java` |
| ref_order 加列 | `src/main/java/com/example/demo/modules/referencedata/config/ReferenceDataSchemaMigrator.java` |
| 变更留痕 | `数据库字段档案/变更日志.md` |
| 错误码 | `src/main/java/com/example/demo/common/exception/ErrorCodeConstants.java` |
| 引擎 + 校验器 | `src/main/java/com/example/demo/modules/animalorder/engine/*.java` |
| 实体 / Mapper | `src/main/java/com/example/demo/modules/animalorder/entity/*.java`, `mapper/*.java`, `src/main/resources/mapper/AnimalOrder*.xml` |
| 服务 | `src/main/java/com/example/demo/modules/animalorder/service/*.java` |
| 控制器 | `src/main/java/com/example/demo/modules/animalorder/controller/AnimalOrderTimeController.java` |
| 结算集成 | `src/main/java/com/example/demo/modules/referencedata/service/ReferenceDataService.java` |
| 订单 DTO/实体 | `RefOrder.java`, `RefOrderView.java`, `RefOrderMapper.xml` |
| 引擎测试 | `src/test/java/com/example/demo/modules/animalorder/engine/AnimalOrderTimeEngineTest.java`, `WindowRuleConflictValidatorTest.java` |
| API 客户端 | `frontend/src/api/domains/animalOrderTime.api.ts` |
| Hooks / keys | `frontend/src/api/hooks/useAnimalOrderTime.ts`, `frontend/src/api/hooks/queryKeys.ts` |
| 管理 UI | `frontend/src/features/reference-data/OrderTimeManager.tsx`, `TimeWindowRuleEditor.tsx`, `EtaPolicyEditor.tsx`, `HolidayImportPanel.tsx` |
| 订购页集成 | `frontend/src/features/reference-data/ReferenceDataManager.tsx`, `OrderHistoryPanel.tsx` |

---

### Task 1: 数据库双轨迁移 + ref_order 加列

**Files:**
- Create: `common/schema/V20260821019__animal_order_time_management.sql`
- Create: `src/main/resources/db/bootstrap-animal-order-time.sql`
- Modify: `src/main/java/com/example/demo/common/bootstrap/EmbeddedTwinSystemCoreDdlBootstrap.java`（在 obligation 块之后追加 `runScript`）
- Modify: `src/main/java/com/example/demo/modules/referencedata/config/ReferenceDataSchemaMigrator.java`
- Modify: `数据库字段档案/变更日志.md`

- [ ] **Step 1: 编写 Flyway 归档 SQL**

`common/schema/V20260821019__animal_order_time_management.sql` — 内容与 spec §7.1–7.3 一致，并含 `ref_order` 加列：

```sql
-- 动物订购时间管理：策略 / 窗口规则 / 节假日 + ref_order.estimated_delivery_date
-- 运行时 bootstrap 幂等；本文件为 Flyway 归档。

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

INSERT INTO animal_order_time_policy (id, default_mode, eta_mode, eta_workday_offset)
SELECT 1, 'OPEN', 'RELATIVE', 3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM animal_order_time_policy WHERE id = 1);

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
    daily_start_time     TIME         NULL,
    daily_end_time       TIME         NULL,
    range_start_at       DATETIME     NULL,
    range_end_at         DATETIME     NULL,
    label                VARCHAR(128) NULL,
    sort_order           INT          NOT NULL DEFAULT 0,
    active               TINYINT      NOT NULL DEFAULT 1,
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_window_scope_category (scope, category_key, active),
    KEY idx_window_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动物订购可购窗口规则';

CREATE TABLE IF NOT EXISTS animal_order_holiday (
    id                   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    holiday_date         DATE         NOT NULL COMMENT '自然日',
    day_type             VARCHAR(16)  NOT NULL COMMENT 'HOLIDAY|WORKDAY_SHIFT',
    name                 VARCHAR(128) NULL,
    source               VARCHAR(16)  NOT NULL DEFAULT 'MANUAL' COMMENT 'IMPORT|CDN|MANUAL',
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_holiday_date (holiday_date),
    KEY idx_holiday_year (holiday_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动物订购节假日与调休';

ALTER TABLE ref_order
    ADD COLUMN estimated_delivery_date DATE NULL
        COMMENT '下单时计算的预计送达日（工作日）'
        AFTER submitted_at;
```

- [ ] **Step 2: 编写 bootstrap 幂等 SQL（与 Flyway 同源）**

`src/main/resources/db/bootstrap-animal-order-time.sql` — 三张表用 `CREATE TABLE IF NOT EXISTS`（与 Step 1 建表段相同）；种子行用：

```sql
INSERT INTO animal_order_time_policy (id, default_mode, eta_mode, eta_workday_offset)
SELECT 1, 'OPEN', 'RELATIVE', 3 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM animal_order_time_policy WHERE id = 1);
```

`ref_order` 加列**不要**写在此文件——沿用 `ReferenceDataSchemaMigrator` 模式。

- [ ] **Step 3: 注册 bootstrap 到启动链**

在 `EmbeddedTwinSystemCoreDdlBootstrap.runAllScripts` 中，`bootstrap-obligation-content-json.sql` 之后追加：

```java
total++; if (runScript("db/bootstrap-animal-order-time.sql", ctx)) success++;
```

- [ ] **Step 4: ReferenceDataSchemaMigrator 幂等加列**

在 `ref_order` 段 `ensureColumnExists` 列表末尾追加：

```java
ensureColumnExists("ref_order", "estimated_delivery_date",
        "ALTER TABLE ref_order ADD COLUMN estimated_delivery_date DATE NULL COMMENT '下单时计算的预计送达日（工作日）' AFTER submitted_at");
```

- [ ] **Step 5: 更新变更日志**

在 `数据库字段档案/变更日志.md` 顶部追加一条（日期 2026-08-21）：

```markdown
## 2026-08-21 动物订购时间管理
- 新增表：`animal_order_time_policy`、`animal_order_window_rule`、`animal_order_holiday`
- `ref_order` 加列：`estimated_delivery_date`（DATE，下单 ETA 快照）
- Flyway：`V20260821019__animal_order_time_management.sql`；bootstrap：`bootstrap-animal-order-time.sql`
```

- [ ] **Step 6: 验证**

启动应用（或仅跑 Flyway 若环境已配置）后执行：

```sql
SHOW TABLES LIKE 'animal_order%';
SHOW COLUMNS FROM ref_order LIKE 'estimated_delivery_date';
SELECT * FROM animal_order_time_policy WHERE id = 1;
```

Expected: 三表存在；`ref_order.estimated_delivery_date` 存在；策略种子行 `default_mode=OPEN`, `eta_mode=RELATIVE`, `eta_workday_offset=3`。

- [ ] **Step 7: Commit**

```bash
git add common/schema/V20260821019__animal_order_time_management.sql \
  src/main/resources/db/bootstrap-animal-order-time.sql \
  src/main/java/com/example/demo/common/bootstrap/EmbeddedTwinSystemCoreDdlBootstrap.java \
  src/main/java/com/example/demo/modules/referencedata/config/ReferenceDataSchemaMigrator.java \
  数据库字段档案/变更日志.md
git commit -m "feat(animal-order): add time policy schema and ref_order ETA column"
```

---

### Task 2: 错误码 + 实体 + MyBatis Mapper

**Files:**
- Modify: `src/main/java/com/example/demo/common/exception/ErrorCodeConstants.java`
- Create: `src/main/java/com/example/demo/modules/animalorder/entity/AnimalOrderTimePolicy.java`
- Create: `src/main/java/com/example/demo/modules/animalorder/entity/AnimalOrderWindowRule.java`
- Create: `src/main/java/com/example/demo/modules/animalorder/entity/AnimalOrderHoliday.java`
- Create: `src/main/java/com/example/demo/modules/animalorder/mapper/AnimalOrderTimePolicyMapper.java`
- Create: `src/main/java/com/example/demo/modules/animalorder/mapper/AnimalOrderWindowRuleMapper.java`
- Create: `src/main/java/com/example/demo/modules/animalorder/mapper/AnimalOrderHolidayMapper.java`
- Create: `src/main/resources/mapper/AnimalOrderTimePolicyMapper.xml`
- Create: `src/main/resources/mapper/AnimalOrderWindowRuleMapper.xml`
- Create: `src/main/resources/mapper/AnimalOrderHolidayMapper.xml`

- [ ] **Step 1: 追加错误码**

在 `ErrorCodeConstants.java` AGV 段之后追加：

```java
/** 动物订购 animal-order 1-013-xxx */
public static final int ANIMAL_ORDER_WINDOW_CLOSED        = 1_013_001; // 当前不在可购时间窗口内
public static final int ANIMAL_ORDER_WINDOW_CONFLICT      = 1_013_002; // 时间窗口配置异常
public static final int ANIMAL_ORDER_WINDOW_RULE_CONFLICT = 1_013_003; // 相反效果重叠时间段
public static final int ANIMAL_ORDER_ETA_POLICY_INVALID   = 1_013_004; // 固定送达日未配置
```

- [ ] **Step 2: 创建实体（Lombok `@Data`，字段与表列一一对应）**

`AnimalOrderTimePolicy.java`：

```java
package com.example.demo.modules.animalorder.entity;

import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class AnimalOrderTimePolicy {
    private Long id;
    private String defaultMode;      // OPEN | CLOSED
    private String etaMode;          // RELATIVE | FIXED
    private Integer etaWorkdayOffset;
    private LocalDate etaFixedDate;
    private Integer active;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

`AnimalOrderWindowRule.java` — 含 `scope`, `categoryKey`, `effect`, `shape`, `dailyStartTime`/`dailyEndTime`（`LocalTime`）, `rangeStartAt`/`rangeEndAt`（`LocalDateTime`）, `label`, `sortOrder`, `active`, 时间戳。

`AnimalOrderHoliday.java` — 含 `holidayDate`（`LocalDate`）, `dayType`, `name`, `source`, 时间戳。

- [ ] **Step 3: Mapper 接口**

`AnimalOrderTimePolicyMapper.java`：

```java
@Mapper
public interface AnimalOrderTimePolicyMapper {
    AnimalOrderTimePolicy findById(@Param("id") Long id);
    int update(AnimalOrderTimePolicy row);
}
```

`AnimalOrderWindowRuleMapper.java`：

```java
@Mapper
public interface AnimalOrderWindowRuleMapper {
    List<AnimalOrderWindowRule> listActive();
    List<AnimalOrderWindowRule> listActiveByScope(@Param("scope") String scope, @Param("categoryKey") String categoryKey);
    int insert(AnimalOrderWindowRule row);
    int update(AnimalOrderWindowRule row);
    int softDelete(@Param("id") Long id);
}
```

`AnimalOrderHolidayMapper.java`：

```java
@Mapper
public interface AnimalOrderHolidayMapper {
    List<AnimalOrderHoliday> listByYear(@Param("year") int year);
    int countByYear(@Param("year") int year);
    AnimalOrderHoliday findById(@Param("id") Long id);
    int upsert(AnimalOrderHoliday row);
    int deleteById(@Param("id") Long id);
}
```

- [ ] **Step 4: MyBatis XML**

参照 `RefOrderMapper.xml` 的 `resultMap` + snake_case 列映射。`AnimalOrderHolidayMapper.xml` 的 `upsert`：

```xml
<insert id="upsert">
  INSERT INTO animal_order_holiday (holiday_date, day_type, name, source)
  VALUES (#{holidayDate}, #{dayType}, #{name}, #{source})
  ON DUPLICATE KEY UPDATE
    day_type = VALUES(day_type),
    name = VALUES(name),
    source = VALUES(source),
    updated_at = CURRENT_TIMESTAMP
</insert>
```

- [ ] **Step 5: 编译验证**

Run: `mvn -q -DskipTests compile`
Expected: BUILD SUCCESS

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/example/demo/common/exception/ErrorCodeConstants.java \
  src/main/java/com/example/demo/modules/animalorder/ \
  src/main/resources/mapper/AnimalOrder*.xml
git commit -m "feat(animal-order): add entities and mappers for time management"
```

---

### Task 3: AnimalOrderTimeEngine — 工作日与可购窗口核心

**Files:**
- Create: `src/main/java/com/example/demo/modules/animalorder/engine/AnimalOrderTimeEngine.java`
- Create: `src/main/java/com/example/demo/modules/animalorder/engine/AnimalOrderTimeModels.java`（`Policy`, `WindowRule`, `HolidayMap`, `TimeSegment` 等）
- Test: `src/test/java/com/example/demo/modules/animalorder/engine/AnimalOrderTimeEngineTest.java`

- [ ] **Step 1: 编写失败测试 — isWorkday 与 defaultMode**

`AnimalOrderTimeEngineTest.java`：

```java
package com.example.demo.modules.animalorder.engine;

import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class AnimalOrderTimeEngineTest {

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

  @Test
  void isWorkday_weekendWithoutHoliday_false() {
    Map<LocalDate, String> holidays = Map.of();
    assertFalse(AnimalOrderTimeEngine.isWorkday(LocalDate.of(2026, 8, 22), holidays)); // Saturday
  }

  @Test
  void isWorkday_workdayShiftOnSunday_true() {
    Map<LocalDate, String> holidays = Map.of(LocalDate.of(2026, 8, 23), "WORKDAY_SHIFT");
    assertTrue(AnimalOrderTimeEngine.isWorkday(LocalDate.of(2026, 8, 23), holidays));
  }

  @Test
  void defaultClosed_noRules_alwaysCannotOrder() {
    var policy = AnimalOrderTimeModels.policy("CLOSED", "RELATIVE", 3, null);
    var engine = new AnimalOrderTimeEngine(policy, List.of(), Map.of());
    var at = ZonedDateTime.of(2026, 8, 21, 10, 0, 0, 0, ZONE);
    assertFalse(engine.canOrder(at, null));
  }
}
```

（补充 `import java.time.*`）

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -q -Dtest=AnimalOrderTimeEngineTest test`
Expected: FAIL — class/method not found

- [ ] **Step 3: 实现模型与引擎核心**

`AnimalOrderTimeModels.java` — 提供工厂方法：

```java
public static Policy policy(String defaultMode, String etaMode, int offset, LocalDate fixed) { ... }
public static WindowRule daily(String scope, String categoryKey, String effect, LocalTime start, LocalTime end) { ... }
public static WindowRule range(String scope, String categoryKey, String effect, ZonedDateTime start, ZonedDateTime end) { ... }
```

`AnimalOrderTimeEngine.java` 实现（纯函数，无 Spring）：

- `static boolean isWorkday(LocalDate date, Map<LocalDate, String> holidayMap)` — spec §3.2
- `List<WindowRule> selectRuleSet(String categoryKey, List<WindowRule> allRules)` — spec §3.3
- `boolean ruleCoversInstant(WindowRule rule, ZonedDateTime instant)` — spec §3.4，含跨午夜 DAILY
- `String effectiveEffectAt(ZonedDateTime instant, String categoryKey)` — 返回 `OPEN`/`CLOSED`；OPEN+DISABLE 同刻 → 抛 `TwinBusinessException.of(ANIMAL_ORDER_WINDOW_CONFLICT, ...)`
- `boolean canOrder(ZonedDateTime orderAt, String categoryKey)`

常量：`EFFECT_OPEN = "OPEN"`, `EFFECT_DISABLE = "DISABLE"`, `SHAPE_DAILY = "DAILY"`, `SHAPE_RANGE = "RANGE"`。

DAILY 跨午夜 `ruleCoversInstant` 参考现有 `ScanPopupEntryWindowEvaluator.withinBand` 思路：

```java
private static boolean dailyCovers(LocalTime t, LocalTime start, LocalTime end) {
  if (start.compareTo(end) <= 0) {
    return !t.isBefore(start) && !t.isAfter(end);
  }
  return !t.isBefore(start) || !t.isAfter(end);
}
```

- [ ] **Step 4: 追加测试 — DAILY OPEN 白名单**

```java
@Test
void dailyOpen_whitelist_allowsInsideWindow() {
  var rule = AnimalOrderTimeModels.daily("GLOBAL", null, "OPEN",
      LocalTime.of(9, 0), LocalTime.of(17, 0));
  var engine = new AnimalOrderTimeEngine(
      AnimalOrderTimeModels.policy("CLOSED", "RELATIVE", 3, null),
      List.of(rule), Map.of());
  var at = ZonedDateTime.of(2026, 8, 21, 10, 0, 0, 0, ZONE); // Monday
  assertTrue(engine.canOrder(at, null));
}
```

- [ ] **Step 5: 运行测试**

Run: `mvn -q -Dtest=AnimalOrderTimeEngineTest test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/example/demo/modules/animalorder/engine/ \
  src/test/java/com/example/demo/modules/animalorder/engine/AnimalOrderTimeEngineTest.java
git commit -m "feat(animal-order): add time engine workday and window core"
```

---

### Task 4: 引擎 ETA、不可购区间与品类回退

**Files:**
- Modify: `src/main/java/com/example/demo/modules/animalorder/engine/AnimalOrderTimeEngine.java`
- Modify: `src/test/java/com/example/demo/modules/animalorder/engine/AnimalOrderTimeEngineTest.java`

- [ ] **Step 1: 编写失败测试 — RELATIVE offset=0 与 DISABLE 锚点**

```java
@Test
void relativeOffsetZero_fridayOrder_sameFriday() {
  var engine = new AnimalOrderTimeEngine(
      AnimalOrderTimeModels.policy("OPEN", "RELATIVE", 0, null),
      List.of(), Map.of());
  var friday = ZonedDateTime.of(2026, 8, 21, 10, 0, 0, 0, ZONE);
  assertEquals(LocalDate.of(2026, 8, 21), engine.estimateDelivery(friday, null));
}

@Test
void relativeOffsetZero_saturdayOrder_nextMonday() {
  var engine = new AnimalOrderTimeEngine(
      AnimalOrderTimeModels.policy("OPEN", "RELATIVE", 0, null),
      List.of(), Map.of());
  var saturday = ZonedDateTime.of(2026, 8, 22, 10, 0, 0, 0, ZONE);
  assertEquals(LocalDate.of(2026, 8, 24), engine.estimateDelivery(saturday, null));
}

@Test
void categoryRules_replaceGlobal() {
  var globalDisable = AnimalOrderTimeModels.daily("GLOBAL", null, "DISABLE",
      LocalTime.of(0, 0), LocalTime.of(23, 59));
  var categoryOpen = AnimalOrderTimeModels.daily("CATEGORY", "42", "OPEN",
      LocalTime.of(9, 0), LocalTime.of(17, 0));
  var engine = new AnimalOrderTimeEngine(
      AnimalOrderTimeModels.policy("CLOSED", "RELATIVE", 0, null),
      List.of(globalDisable, categoryOpen), Map.of());
  var at = ZonedDateTime.of(2026, 8, 21, 10, 0, 0, 0, ZONE);
  assertTrue(engine.canOrder(at, "42"));
  assertFalse(engine.canOrder(at, "99"));
}
```

- [ ] **Step 2: 运行确认失败**

Run: `mvn -q -Dtest=AnimalOrderTimeEngineTest#relativeOffsetZero_fridayOrder_sameFriday test`
Expected: FAIL

- [ ] **Step 3: 实现 `findUnavailableSegmentContaining` + `estimateDelivery` + `findNextOpenAt`**

在 `AnimalOrderTimeEngine` 追加：

```java
public TimeSegment findUnavailableSegmentContaining(ZonedDateTime instant, String categoryKey) {
  if (canOrder(instant, categoryKey)) return null;
  // 向前/向后按分钟或秒扩展，直到 effectiveEffectAt 变化；DAILY 按日展开
  ...
}

public LocalDate estimateDelivery(ZonedDateTime orderAt, String categoryKey) {
  var seg = findUnavailableSegmentContaining(orderAt, categoryKey);
  ZonedDateTime anchor = seg != null ? seg.getEndExclusive() : orderAt;
  LocalDate anchorDate = anchor.toLocalDate();
  if ("FIXED".equals(policy.getEtaMode())) {
    LocalDate d = policy.getEtaFixedDate();
  ...
  }
  // RELATIVE: startWorkday from anchorDate, then advance N workdays
}

public ZonedDateTime findNextOpenAt(ZonedDateTime from, String categoryKey) {
  // 从 from 起每分钟前探最多 400 天，返回第一个 canOrder=true 的时刻
}
```

`TimeSegment`：`ZonedDateTime startInclusive`, `ZonedDateTime endExclusive`（段末开区间右侧 = 锚点）。

FIXED 模式：若 `etaFixedDate` 非工作日，向前滚动到下一 `isWorkday`。

- [ ] **Step 4: 运行全部引擎测试**

Run: `mvn -q -Dtest=AnimalOrderTimeEngineTest test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/example/demo/modules/animalorder/engine/ \
  src/test/java/com/example/demo/modules/animalorder/engine/AnimalOrderTimeEngineTest.java
git commit -m "feat(animal-order): add ETA calculation and category rule fallback"
```

---

### Task 5: WindowRuleConflictValidator

**Files:**
- Create: `src/main/java/com/example/demo/modules/animalorder/engine/WindowRuleConflictValidator.java`
- Test: `src/test/java/com/example/demo/modules/animalorder/engine/WindowRuleConflictValidatorTest.java`

- [ ] **Step 1: 编写失败测试**

```java
@Test
void oppositeOverlap_rejected() {
  var open = AnimalOrderTimeModels.daily("GLOBAL", null, "OPEN",
      LocalTime.of(9, 0), LocalTime.of(17, 0));
  var disable = AnimalOrderTimeModels.daily("GLOBAL", null, "DISABLE",
      LocalTime.of(12, 0), LocalTime.of(13, 0));
  assertThrows(TwinBusinessException.class,
      () -> WindowRuleConflictValidator.validateNoOppositeOverlap(List.of(open, disable)));
}

@Test
void sameEffectOverlap_allowed() {
  var a = AnimalOrderTimeModels.daily("GLOBAL", null, "OPEN",
      LocalTime.of(9, 0), LocalTime.of(12, 0));
  var b = AnimalOrderTimeModels.daily("GLOBAL", null, "OPEN",
      LocalTime.of(11, 0), LocalTime.of(17, 0));
  WindowRuleConflictValidator.validateNoOppositeOverlap(List.of(a, b)); // no throw
}
```

- [ ] **Step 2: 运行确认失败**

Run: `mvn -q -Dtest=WindowRuleConflictValidatorTest test`
Expected: FAIL

- [ ] **Step 3: 实现校验器**

投影未来 400 天（复用引擎 `ruleCoversInstant` 或独立展开 DAILY/RANGE），逐分钟或按事件点检测是否存在同时 OPEN 与 DISABLE。冲突时：

```java
throw TwinBusinessException.of(
    ErrorCodeConstants.ANIMAL_ORDER_WINDOW_RULE_CONFLICT,
    "存在相反效果的重叠时间段，请调整规则");
```

- [ ] **Step 4: 运行测试**

Run: `mvn -q -Dtest=WindowRuleConflictValidatorTest test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/example/demo/modules/animalorder/engine/WindowRuleConflictValidator.java \
  src/test/java/com/example/demo/modules/animalorder/engine/WindowRuleConflictValidatorTest.java
git commit -m "feat(animal-order): add window rule opposite-effect conflict validator"
```

---

### Task 6: AnimalOrderTimePolicyService

**Files:**
- Create: `src/main/java/com/example/demo/modules/animalorder/service/AnimalOrderTimePolicyService.java`
- Create: `src/main/java/com/example/demo/modules/animalorder/dto/AnimalOrderTimePolicySummaryDto.java`
- Create: `src/main/java/com/example/demo/modules/animalorder/dto/AnimalOrderTimePolicyAdminDto.java`
- Create: `src/main/java/com/example/demo/modules/animalorder/dto/AnimalOrderWindowRuleDto.java`
- Create: `src/main/java/com/example/demo/modules/animalorder/dto/AnimalOrderHolidayDto.java`

- [ ] **Step 1: 实现服务骨架**

`AnimalOrderTimePolicyService`（`@Service`）注入三个 Mapper + 构建引擎：

```java
private AnimalOrderTimeEngine buildEngine() {
  var policy = policyMapper.findById(1L);
  var rules = ruleMapper.listActive();
  var holidays = holidayMapper.listByYear(LocalDate.now(ZONE).getYear());
  // 合并多年：listByYear 当前年 ±1 或 listAll — 引擎需要完整 HolidayMap
  Map<LocalDate, String> map = ...;
  return new AnimalOrderTimeEngine(toModel(policy), toRules(rules), map);
}
```

公开方法：

- `AnimalOrderTimePolicySummaryDto getSummary(String categoryKey, ZonedDateTime at)` — 填 `canOrderNow`, `closedReason`, `nextOpenAt`, `estimatedDeliveryDate`, `warnings`（空年 → `ANIMAL_ORDER_HOLIDAY_YEAR_EMPTY`）
- `AnimalOrderTimePolicyAdminDto getAdminView()` — 策略 + 全部 active 规则
- `void saveAdmin(AnimalOrderTimePolicyAdminDto body)` — 校验 ETA（FIXED 必填 date）、`WindowRuleConflictValidator` 按 scope+categoryKey 分组校验、upsert 规则（`id` 缺省 insert；`active=0` soft delete）
- 节假日：`listHolidays(int year)`, `upsertHoliday(...)`, `deleteHoliday(long id)`

`closedReason` 文案：`"当前不在可购时间窗口内"`（与 spec 一致）。

- [ ] **Step 2: 编译**

Run: `mvn -q -DskipTests compile`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/animalorder/
git commit -m "feat(animal-order): add time policy service with summary and admin save"
```

---

### Task 7: HolidaySyncService（CDN / JSON 导入）

**Files:**
- Create: `src/main/java/com/example/demo/modules/animalorder/service/HolidaySyncService.java`
- Create: `src/main/java/com/example/demo/modules/animalorder/dto/HolidayImportResultDto.java`

- [ ] **Step 1: 实现 HolidaySyncService**

```java
@Service
public class HolidaySyncService {
  private static final String CDN_URL =
      "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/%d.json";

  public HolidayImportResultDto importJson(String json, String source) {
    // Jackson 解析 List<{date,isOffDay,name}>
    // day_type = isOffDay ? HOLIDAY : WORKDAY_SHIFT
    // holidayMapper.upsert per row
  }

  public HolidayImportResultDto syncFromCdn(int year) {
    String url = String.format(CDN_URL, year);
  // 使用默认 RestTemplate 或 new RestTemplate()（短超时）；仅管理 API 调用
    String body = restTemplate.getForObject(url, String.class);
    return importJson(body, "CDN");
  }
}
```

Response：`{ upserted, year, warnings }`；若该年 count=0 后仍为空则 warnings 含 `ANIMAL_ORDER_HOLIDAY_YEAR_EMPTY`。

- [ ] **Step 2: 手动冒烟（可选，需网络）**

本地启动后 `POST /api/animal-order/holidays/sync-cdn` body `{"year":2026}`（Task 8 完成后）或单独单元测试 mock RestTemplate。

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/animalorder/service/HolidaySyncService.java \
  src/main/java/com/example/demo/modules/animalorder/dto/HolidayImportResultDto.java
git commit -m "feat(animal-order): add holiday JSON import and CDN sync"
```

---

### Task 8: AnimalOrderTimeController

**Files:**
- Create: `src/main/java/com/example/demo/modules/animalorder/controller/AnimalOrderTimeController.java`

- [ ] **Step 1: 实现控制器**

参照 `KnowledgeCategoryController` 的 `requireMinRole(request, RoleEnum.SUPER_ADMIN)`：

```java
@RestController
@RequestMapping("/api/animal-order")
@Tag(name = "动物订购时间", description = "可购窗口 / ETA / 节假日")
public class AnimalOrderTimeController {

  @GetMapping("/time-policy")
  public Result<AnimalOrderTimePolicySummaryDto> getSummary(
      @RequestParam(required = false) String categoryKey,
      @RequestParam(required = false) String at,
      HttpServletRequest request) {
    requireLogin(request);
    ZonedDateTime when = parseAt(at);
    return Result.success(policyService.getSummary(categoryKey, when));
  }

  @GetMapping("/time-policy/admin")
  public Result<AnimalOrderTimePolicyAdminDto> getAdmin(HttpServletRequest request) {
    if (denySuperAdmin(request) != null) return Result.error(...);
    return Result.success(policyService.getAdminView());
  }

  @PutMapping("/time-policy/admin")
  public Result<Void> saveAdmin(@RequestBody AnimalOrderTimePolicyAdminDto body,
                                HttpServletRequest request) { ... }

  @GetMapping("/holidays")
  public Result<List<AnimalOrderHolidayDto>> listHolidays(@RequestParam int year, ...) { ... }

  @PostMapping("/holidays")
  public Result<AnimalOrderHolidayDto> createHoliday(...) { ... }

  @DeleteMapping("/holidays/{id}")
  public Result<Void> deleteHoliday(@PathVariable long id, ...) { ... }

  @PostMapping("/holidays/import")
  public Result<HolidayImportResultDto> importHolidays(
      @RequestParam("file") MultipartFile file, HttpServletRequest request) { ... }

  @PostMapping("/holidays/sync-cdn")
  public Result<HolidayImportResultDto> syncCdn(
      @RequestBody Map<String, Integer> body, HttpServletRequest request) {
    int year = body.getOrDefault("year", LocalDate.now().getYear());
    ...
  }
}
```

登录校验：从 `AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR` 或 `AuthContextService` 读取（与 `ReferenceDataController.resolveUser` 一致）。

- [ ] **Step 2: 编译 + 启动冒烟**

Run: `mvn -q -DskipTests compile`
启动后：`curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8080/api/animal-order/time-policy"`
Expected: JSON `canOrderNow`, `estimatedDeliveryDate`, `warnings`

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/animalorder/controller/
git commit -m "feat(animal-order): expose time policy and holiday REST APIs"
```

---

### Task 9: submitOrder 集成 + 订单 ETA 回显

**Files:**
- Modify: `src/main/java/com/example/demo/modules/referencedata/service/ReferenceDataService.java`（`submitOrder` 约在 348–444 行，allowlist 校验之后、`orderMapper.insert` 之前）
- Modify: `src/main/java/com/example/demo/modules/referencedata/entity/RefOrder.java`
- Modify: `src/main/java/com/example/demo/modules/referencedata/dto/RefOrderView.java`
- Modify: `src/main/resources/mapper/RefOrderMapper.xml`
- Modify: `src/main/java/com/example/demo/modules/referencedata/service/ReferenceDataService.java`（`toOrderView` 映射）

- [ ] **Step 1: 扩展 RefOrder 与 Mapper**

`RefOrder.java` 追加 `private LocalDate estimatedDeliveryDate;`

`RefOrderMapper.xml` — `resultMap` 与 `insert` 加入 `estimated_delivery_date`：

```xml
<result property="estimatedDeliveryDate" column="estimated_delivery_date"/>
...
INSERT INTO ref_order(..., estimated_delivery_date)
VALUES (..., #{estimatedDeliveryDate})
```

`RefOrderView.java` 追加 `private LocalDate estimatedDeliveryDate;`

- [ ] **Step 2: submitOrder 集成**

在 `ReferenceDataService` 注入 `AnimalOrderTimePolicyService`，在 allowlist 校验通过后：

```java
ZonedDateTime orderAt = ZonedDateTime.now(ZoneId.of("Asia/Shanghai"));
LocalDate maxEta = null;
for (RefCart item : itemsToProcess) {
    String categoryKey = resolveBreedCategoryKey(item.getRefDataId());
    if (!timePolicyService.canOrderAt(orderAt, categoryKey)) {
        throw TwinBusinessException.of(
            ErrorCodeConstants.ANIMAL_ORDER_WINDOW_CLOSED,
            "当前不在可购时间窗口内");
    }
    LocalDate lineEta = timePolicyService.estimateDeliveryAt(orderAt, categoryKey);
    if (maxEta == null || lineEta.isAfter(maxEta)) {
        maxEta = lineEta;
    }
}
// 在 orderMapper.insert 之前设置（若 insert 在前则需调整顺序）
order.setEstimatedDeliveryDate(maxEta);
```

新增私有方法 `resolveBreedCategoryKey(Long refDataId)`：

```java
private String resolveBreedCategoryKey(Long refDataId) {
    List<RefData> ancestors = referenceDataMapper.findAncestors(refDataId);
    if (ancestors == null) return null;
    for (RefData node : ancestors) {
        if ("ANIMAL_BREED".equals(node.getRefType())) {
            return String.valueOf(node.getId());
        }
    }
    return null;
}
```

**注意：** 将 `orderMapper.insert(order)` 移到窗口校验与 `setEstimatedDeliveryDate` **之后**（当前代码在 444 行 insert，需把 insert 下移到 ETA 计算完成之后，行循环之前仅构建 order 对象）。

- [ ] **Step 3: toOrderView 映射 estimatedDeliveryDate**

- [ ] **Step 4: 手动验证闭窗**

配置 `default_mode=CLOSED` 且无 OPEN 规则 → 调用 `POST /api/reference-data/orders/submit` → Expected: `code=1013001`, message 含「不在可购时间窗口」

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/example/demo/modules/referencedata/ \
  src/main/resources/mapper/RefOrderMapper.xml
git commit -m "feat(animal-order): validate purchase window on submit and persist ETA"
```

---

### Task 10: 前端 API 客户端与 Hooks

**Files:**
- Create: `frontend/src/api/domains/animalOrderTime.api.ts`
- Create: `frontend/src/api/hooks/useAnimalOrderTime.ts`
- Modify: `frontend/src/api/hooks/queryKeys.ts`

- [ ] **Step 1: API 客户端**

`animalOrderTime.api.ts`（模式对齐 `referenceData.api.ts`）：

```typescript
import { authHttp } from "@/api/core/authHttp";

export interface AnimalOrderTimePolicySummary {
  defaultMode: string;
  canOrderNow: boolean;
  closedReason: string | null;
  nextOpenAt: string | null;
  etaMode: string;
  estimatedDeliveryDate: string | null;
  etaWorkdayOffset: number;
  warnings: string[];
}

export interface AnimalOrderWindowRule {
  id?: number;
  scope: "GLOBAL" | "CATEGORY";
  categoryKey?: string | null;
  effect: "OPEN" | "DISABLE";
  shape: "DAILY" | "RANGE";
  dailyStartTime?: string;
  dailyEndTime?: string;
  rangeStartAt?: string;
  rangeEndAt?: string;
  label?: string;
  sortOrder?: number;
  active?: number;
}

export interface AnimalOrderTimePolicyAdmin {
  defaultMode: string;
  etaMode: string;
  etaWorkdayOffset: number;
  etaFixedDate: string | null;
  rules: AnimalOrderWindowRule[];
}

export async function fetchTimePolicySummary(params?: {
  categoryKey?: string;
  at?: string;
}): Promise<AnimalOrderTimePolicySummary> {
  const res = await authHttp.get<Result<AnimalOrderTimePolicySummary>>(
    "/api/animal-order/time-policy",
    { params },
  );
  if (!res.data.success) throw new Error(res.data.message);
  return res.data.data;
}

export async function fetchTimePolicyAdmin(): Promise<AnimalOrderTimePolicyAdmin> { ... }
export async function saveTimePolicyAdmin(body: AnimalOrderTimePolicyAdmin): Promise<void> { ... }
// holidays: list, create, delete, importFile, syncCdn
```

- [ ] **Step 2: queryKeys**

在 `queryKeys.ts` 追加：

```typescript
animalOrderTime: {
  all: ["animalOrderTime"] as const,
  summary: (categoryKey?: string) =>
    ["animalOrderTime", "summary", categoryKey ?? "global"] as const,
  admin: ["animalOrderTime", "admin"] as const,
  holidays: (year: number) => ["animalOrderTime", "holidays", year] as const,
},
```

- [ ] **Step 3: Hooks**

`useAnimalOrderTime.ts`：

```typescript
export function useAnimalOrderTimePolicy(categoryKey?: string) {
  return useQuery({
    queryKey: queryKeys.animalOrderTime.summary(categoryKey),
    queryFn: () => fetchTimePolicySummary({ categoryKey }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useAnimalOrderTimePolicyAdmin() { ... }
export function useSaveAnimalOrderTimePolicyAdmin() { ... }
export function useAnimalOrderHolidays(year: number) { ... }
// mutations for holiday CRUD, import, syncCdn
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npm run typecheck`（或 `npx tsc --noEmit`）
Expected: 无新增类型错误

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/domains/animalOrderTime.api.ts \
  frontend/src/api/hooks/useAnimalOrderTime.ts \
  frontend/src/api/hooks/queryKeys.ts
git commit -m "feat(animal-order): add frontend API client and hooks for time policy"
```

---

### Task 11: OrderTimeManager 模态框与三 Tab 编辑器

**Files:**
- Create: `frontend/src/features/reference-data/OrderTimeManager.tsx`
- Create: `frontend/src/features/reference-data/TimeWindowRuleEditor.tsx`
- Create: `frontend/src/features/reference-data/EtaPolicyEditor.tsx`
- Create: `frontend/src/features/reference-data/HolidayImportPanel.tsx`

- [ ] **Step 1: OrderTimeManager 壳**

对齐 `SpecTemplateManager.tsx`：`createPortal` + `fixed inset-0 z-[var(--z-modal)]` + `max-w-4xl`（比规格模板更宽）。三 Tab 按钮：`可购窗口` / `预计送达` / `节假日`。`useAnimalOrderTimePolicyAdmin` 加载数据；关闭按钮右上角。

- [ ] **Step 2: TimeWindowRuleEditor**

- `defaultMode` 单选 OPEN/CLOSED
- 规则列表 + 内联表单：scope、category（复用 `SpecTemplateManager` 的 `useRefDataList("ANIMAL_BREED")` 选项，`categoryKey = String(breed.id)`）
- DAILY：时间选择；RANGE：datetime-local
- 保存前客户端冲突检测（调用与后端相同逻辑的 TS 函数 `validateNoOppositeOverlap(rules)` — 可放在 `frontend/src/features/reference-data/timeWindowConflict.ts`）
- 保存调用 `useSaveAnimalOrderTimePolicyAdmin`

- [ ] **Step 3: EtaPolicyEditor**

- RELATIVE / FIXED 单选；切换时禁用另一模式字段
- RELATIVE：`etaWorkdayOffset` number input min=0
- FIXED：date input
- 实时预览：调用 `fetchTimePolicySummary({ categoryKey: undefined })` 或本地用 summary 字段展示「若现在下单 → 预计送达」

- [ ] **Step 4: HolidayImportPanel**

- 年份 select + 表格（日期、类型、名称、来源）
- 空年警告：`warnings.includes("ANIMAL_ORDER_HOLIDAY_YEAR_EMPTY")` → 黄色横幅
- 按钮：上传 JSON（`<input type="file">` → `importHolidays`）、「从 holiday-cn 同步」、手工新增行、删除行

- [ ] **Step 5: 手动 UI 验证**

登录 SUPER_ADMIN → `/#/console/admin/animal-order` → 打开时间管理（Task 12 接线后）→ 三 Tab 可切换、保存策略成功 toast

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/reference-data/OrderTimeManager.tsx \
  frontend/src/features/reference-data/TimeWindowRuleEditor.tsx \
  frontend/src/features/reference-data/EtaPolicyEditor.tsx \
  frontend/src/features/reference-data/HolidayImportPanel.tsx \
  frontend/src/features/reference-data/timeWindowConflict.ts
git commit -m "feat(animal-order): add OrderTimeManager admin UI with three tabs"
```

---

### Task 12: ReferenceDataManager 入口与订购页 UX

**Files:**
- Modify: `frontend/src/features/reference-data/ReferenceDataManager.tsx`（`isAdmin` 约 93 行；工具栏按钮约 552–560 行；加购/结算约 294–414、679–704 行）
- Modify: `frontend/src/features/reference-data/OrderHistoryPanel.tsx`

- [ ] **Step 1: 管理入口按钮**

在 `ReferenceDataManager.tsx`：

```typescript
const [timeManagerOpen, setTimeManagerOpen] = useState(false);
```

工具栏「规格模板」按钮后追加（同 `isAdmin` 条件）：

```tsx
<button
  type="button"
  className="rounded-full border border-[var(--twin-hairline)] px-3 py-1 text-xs font-medium ..."
  onClick={() => setTimeManagerOpen(true)}
>
  时间管理
</button>
```

底部 portal：

```tsx
{timeManagerOpen && <OrderTimeManager onClose={() => setTimeManagerOpen(false)} />}
```

- [ ] **Step 2: useAnimalOrderTimePolicy 与 categoryKey**

从当前 drill 上下文或加购物品解析 `breedCategoryKey`：

```typescript
const breedCategoryKey = specSelectItem?.parentId != null
  ? String(specSelectItem.parentId)
  : undefined;
const { data: timePolicy } = useAnimalOrderTimePolicy(breedCategoryKey);
const orderingBlocked = timePolicy != null && !timePolicy.canOrderNow;
```

- [ ] **Step 3: 闭窗禁用 UX**

- `handleAddToCart` 开头：若 `orderingBlocked` → `toast.error(timePolicy.closedReason ?? "当前不可购")` return
- 加购按钮 / `handleSpecConfirm` 路径增加 `disabled={orderingBlocked}`
- `markReady` / `submitOrder` 按钮：`disabled={orderingBlocked || ...}`
- 购物车侧栏展示闭窗条：

```tsx
{orderingBlocked && (
  <div className="rounded-twin-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
    {timePolicy?.closedReason}
    {timePolicy?.nextOpenAt && (
      <span> · 下次开放：{formatDateTime(timePolicy.nextOpenAt)}</span>
    )}
  </div>
)}
```

- [ ] **Step 4: 开窗展示 ETA**

侧栏/结算区：

```tsx
{timePolicy?.canOrderNow && timePolicy.estimatedDeliveryDate && (
  <div className="text-xs text-[var(--twin-body)]">
    预计送达：{timePolicy.estimatedDeliveryDate}
  </div>
)}
```

- [ ] **Step 5: OrderHistoryPanel 回显订单 ETA**

订单列表项展示 `order.estimatedDeliveryDate`（需 API 已返回该字段）。

- [ ] **Step 6: 端到端验证**

| 步骤 | 预期 |
|---|---|
| SUPER_ADMIN 配置 DAILY OPEN 09–17 + default CLOSED | 10:00 可购，20:00 不可购 |
| 学生加购 | 闭窗时按钮灰显 + 提示 |
| 组长结算 | 闭窗 POST 400；开窗成功且订单含 ETA |
| 订单记录 | 显示 `estimatedDeliveryDate` |

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/reference-data/ReferenceDataManager.tsx \
  frontend/src/features/reference-data/OrderHistoryPanel.tsx
git commit -m "feat(animal-order): wire time policy into purchase UI and order history"
```

---

## Spec coverage checklist（自审）

| Spec § | Task |
|---|---|
| §2.1 管理入口 SUPER_ADMIN | Task 12 Step 1 |
| §2.2 闭窗禁用 + nextOpenAt | Task 12 Step 3 |
| §2.2 开窗 ETA 展示 | Task 12 Step 4 |
| §2.3 category_key = BREED id | Task 9 `resolveBreedCategoryKey` |
| §3 运行时引擎 | Tasks 3–5 |
| §4 规则冲突校验 | Task 5 |
| §5 ETA 策略 | Tasks 4, 6, 11 |
| §6 节假日 import/CDN/upsert | Tasks 7, 8, 11 |
| §7 数据库 | Task 1 |
| §8 API | Task 8 |
| §8.4 submitOrder 集成 | Task 9 |
| §9 前端组件树 | Tasks 10–12 |
| §11 测试要点 | Tasks 3–5 单元测试 + Task 12 E2E |

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-21-animal-order-time-management.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks
2. **Inline Execution** — execute tasks in one session using executing-plans, batch with checkpoints

**Which approach?**
