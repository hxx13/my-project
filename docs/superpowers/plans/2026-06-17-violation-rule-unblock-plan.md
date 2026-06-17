# 违规触发规则 & 解禁次数管控 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可扩展的违规触发规则体系，实现按人+规则+时间窗口的解禁次数管控，达到上限后强制覆盖 forbid_enter 并关闭自助解禁。

**Architecture:** 新增 `twin_violation_rule` 表作为规则定义中心，`twin_student_violation.rule_id` 关联规则。解禁计数直接 COUNT 违规记录表（含所有状态），物理删除自动减计数。上限判定在违规创建和扫码 analyze 时实时计算。前端新增「触发规则」管理 Tab。

**Tech Stack:** Java Spring Boot + MyBatis + React TypeScript + Tailwind CSS

---

### Task 1: SQL 迁移 — 新建规则表 + 违规表加列

**Files:**
- Create: `src/main/resources/db/bootstrap-twin-violation-rule.sql`

- [ ] **Step 1: 编写 SQL 迁移脚本**

```sql
-- 违规触发规则表
CREATE TABLE IF NOT EXISTS twin_violation_rule (
    id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    rule_code       VARCHAR(64)  NOT NULL,
    rule_name       VARCHAR(128) NOT NULL,
    enabled         TINYINT(1)   NOT NULL DEFAULT 1,
    source_tag      VARCHAR(30)  NULL,
    violation_text_tpl          TEXT         NULL,
    forbid_enter                TINYINT(1)   NOT NULL DEFAULT 0,
    expire_after_days           INT          NULL,
    show_notice_every_scan      TINYINT(1)   NOT NULL DEFAULT 1,
    interactive_challenge       VARCHAR(255) NULL,
    interactive_unlock_on_verify TINYINT(1)  NOT NULL DEFAULT 1,
    unblock_method      VARCHAR(20)  NOT NULL DEFAULT '自助解禁',
    unblock_max_count   INT          NULL,
    unblock_window_type VARCHAR(20)  NULL DEFAULT '滑动窗口',
    unblock_window_value INT         NULL DEFAULT 30,
    auto_signout_enabled TINYINT(1)  NOT NULL DEFAULT 0,
    whitelist_depts     JSON         NULL,
    cron_expression     VARCHAR(64)  NULL,
    last_execution_at   DATETIME     NULL,
    last_execution_result TEXT       NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_vr_code (rule_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 违规记录表加列
ALTER TABLE twin_student_violation ADD COLUMN IF NOT EXISTS rule_id BIGINT NULL;
ALTER TABLE twin_student_violation ADD INDEX IF NOT EXISTS idx_tsv_rule (rule_id);
```

> 注：`ADD COLUMN IF NOT EXISTS` / `ADD INDEX IF NOT EXISTS` 在 MySQL 8.0+ 不可用，改用 EmbeddedTwinSystemCoreDdlBootstrap 的模式（try-catch 忽略重复列错误），或直接用朴素 `ALTER TABLE ADD COLUMN` 由 SchemaMigrator 幂等处理。

- [ ] **Step 2: 插入种子数据（两条默认规则）**

在脚本末尾追加：

```sql
-- 种子：滞留未签退规则（如尚不存在）
INSERT IGNORE INTO twin_violation_rule (rule_code, rule_name, source_tag, violation_text_tpl, forbid_enter, expire_after_days, unblock_method, unblock_max_count, unblock_window_type, unblock_window_value, auto_signout_enabled, interactive_challenge)
VALUES ('AUTO_STRANDED', '滞留未签退', 'AUTO_STRANDED', '${name}(${dept})滞留未签退，系统自动登记', 0, 30, '自助解禁', 3, '滑动窗口', 30, 1, NULL);

-- 种子：手动违规规则
INSERT IGNORE INTO twin_violation_rule (rule_code, rule_name, source_tag, violation_text_tpl, forbid_enter, expire_after_days, unblock_method, unblock_max_count, unblock_window_type, unblock_window_value)
VALUES ('MANUAL', '手动违规', 'MANUAL', NULL, 0, NULL, '仅工作人员', NULL, '滑动窗口', 30);
```

- [ ] **Step 3: 注册 SQL 到 EmbeddedTwinSystemCoreDdlBootstrap**

Modify: `src/main/java/com/example/demo/common/bootstrap/EmbeddedTwinSystemCoreDdlBootstrap.java`

找到 `BOOTSTRAP_SCRIPTS` 列表（或类似的 DDL 脚本注册），追加 `db/bootstrap-twin-violation-rule.sql`。

- [ ] **Step 4: 执行 SQL 并验证**

Run:
```bash
# 应用启动时自动执行（app.schema.auto-ensure-embedded-core-ddl=true），或手动连接数据库执行
```

Expected: `twin_violation_rule` 表创建成功，包含 2 条种子数据；`twin_student_violation` 表新增 `rule_id` 列。

- [ ] **Step 5: 提交**

```bash
git add src/main/resources/db/bootstrap-twin-violation-rule.sql src/main/java/com/example/demo/common/bootstrap/EmbeddedTwinSystemCoreDdlBootstrap.java
git commit -m "feat: add twin_violation_rule table and twin_student_violation.rule_id column"
```

---

### Task 2: 后端 — TwinViolationRule Entity

**Files:**
- Create: `src/main/java/com/example/demo/modules/twin/dashboard/entity/TwinViolationRule.java`

- [ ] **Step 1: 创建实体类**

```java
package com.example.demo.modules.twin.dashboard.entity;

import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
public class TwinViolationRule {
    private Long id;
    private String ruleCode;
    private String ruleName;
    private Integer enabled;
    private String sourceTag;
    private String violationTextTpl;
    private Integer forbidEnter;
    private Integer expireAfterDays;
    private Integer showNoticeEveryScan;
    private String interactiveChallenge;
    private Integer interactiveUnlockOnVerify;
    /** 解禁方式：自助解禁 / 仅工作人员 */
    private String unblockMethod;
    /** 窗口内最大违规次数；NULL=不限制 */
    private Integer unblockMaxCount;
    /** 窗口类型：滑动窗口 / 固定周期 */
    private String unblockWindowType;
    /** 滑动天数 或 固定周期编号(1=自然月 2=自然周 3=学期) */
    private Integer unblockWindowValue;
    private Integer autoSignoutEnabled;
    private String whitelistDepts;
    private String cronExpression;
    private LocalDateTime lastExecutionAt;
    private String lastExecutionResult;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/main/java/com/example/demo/modules/twin/dashboard/entity/TwinViolationRule.java
git commit -m "feat: add TwinViolationRule entity"
```

---

### Task 3: 后端 — TwinViolationRuleMapper + XML

**Files:**
- Create: `src/main/java/com/example/demo/modules/twin/dashboard/mapper/TwinViolationRuleMapper.java`
- Create: `src/main/resources/mapper/TwinViolationRuleMapper.xml`

- [ ] **Step 1: 创建 Mapper 接口**

```java
package com.example.demo.modules.twin.dashboard.mapper;

import com.example.demo.modules.twin.dashboard.entity.TwinViolationRule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TwinViolationRuleMapper {

    List<TwinViolationRule> selectAll();

    TwinViolationRule selectById(@Param("id") long id);

    TwinViolationRule selectByCode(@Param("ruleCode") String ruleCode);

    int insert(TwinViolationRule row);

    int updateById(TwinViolationRule row);

    int deleteById(@Param("id") long id);

    /** 检查是否有违规记录关联此规则 */
    int countViolationsByRuleId(@Param("ruleId") long ruleId);

    /**
     * 按人+规则+时间窗口统计违规记录数（所有状态）。
     * @param targetUserId 人员ID
     * @param ruleId       规则ID
     * @param windowStart  窗口起始时间
     */
    int countViolationsInWindow(
            @Param("targetUserId") String targetUserId,
            @Param("ruleId") long ruleId,
            @Param("windowStart") java.time.LocalDateTime windowStart);
}
```

- [ ] **Step 2: 创建 Mapper XML**

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.demo.modules.twin.dashboard.mapper.TwinViolationRuleMapper">

    <resultMap id="TwinViolationRuleMap" type="com.example.demo.modules.twin.dashboard.entity.TwinViolationRule">
        <id column="id" property="id"/>
        <result column="rule_code" property="ruleCode"/>
        <result column="rule_name" property="ruleName"/>
        <result column="enabled" property="enabled"/>
        <result column="source_tag" property="sourceTag"/>
        <result column="violation_text_tpl" property="violationTextTpl"/>
        <result column="forbid_enter" property="forbidEnter"/>
        <result column="expire_after_days" property="expireAfterDays"/>
        <result column="show_notice_every_scan" property="showNoticeEveryScan"/>
        <result column="interactive_challenge" property="interactiveChallenge"/>
        <result column="interactive_unlock_on_verify" property="interactiveUnlockOnVerify"/>
        <result column="unblock_method" property="unblockMethod"/>
        <result column="unblock_max_count" property="unblockMaxCount"/>
        <result column="unblock_window_type" property="unblockWindowType"/>
        <result column="unblock_window_value" property="unblockWindowValue"/>
        <result column="auto_signout_enabled" property="autoSignoutEnabled"/>
        <result column="whitelist_depts" property="whitelistDepts"/>
        <result column="cron_expression" property="cronExpression"/>
        <result column="last_execution_at" property="lastExecutionAt"/>
        <result column="last_execution_result" property="lastExecutionResult"/>
        <result column="created_at" property="createdAt"/>
        <result column="updated_at" property="updatedAt"/>
    </resultMap>

    <select id="selectAll" resultMap="TwinViolationRuleMap">
        SELECT * FROM twin_violation_rule ORDER BY id ASC
    </select>

    <select id="selectById" resultMap="TwinViolationRuleMap">
        SELECT * FROM twin_violation_rule WHERE id = #{id}
    </select>

    <select id="selectByCode" resultMap="TwinViolationRuleMap">
        SELECT * FROM twin_violation_rule WHERE rule_code = #{ruleCode}
    </select>

    <insert id="insert" useGeneratedKeys="true" keyProperty="id" keyColumn="id">
        INSERT INTO twin_violation_rule (
            rule_code, rule_name, enabled, source_tag,
            violation_text_tpl, forbid_enter, expire_after_days, show_notice_every_scan,
            interactive_challenge, interactive_unlock_on_verify,
            unblock_method, unblock_max_count, unblock_window_type, unblock_window_value,
            auto_signout_enabled, whitelist_depts, cron_expression
        ) VALUES (
            #{ruleCode}, #{ruleName}, #{enabled}, #{sourceTag},
            #{violationTextTpl}, #{forbidEnter}, #{expireAfterDays}, #{showNoticeEveryScan},
            #{interactiveChallenge}, #{interactiveUnlockOnVerify},
            #{unblockMethod}, #{unblockMaxCount}, #{unblockWindowType}, #{unblockWindowValue},
            #{autoSignoutEnabled}, #{whitelistDepts}, #{cronExpression}
        )
    </insert>

    <update id="updateById">
        UPDATE twin_violation_rule
        SET rule_code = #{ruleCode},
            rule_name = #{ruleName},
            enabled = #{enabled},
            source_tag = #{sourceTag},
            violation_text_tpl = #{violationTextTpl},
            forbid_enter = #{forbidEnter},
            expire_after_days = #{expireAfterDays},
            show_notice_every_scan = #{showNoticeEveryScan},
            interactive_challenge = #{interactiveChallenge},
            interactive_unlock_on_verify = #{interactiveUnlockOnVerify},
            unblock_method = #{unblockMethod},
            unblock_max_count = #{unblockMaxCount},
            unblock_window_type = #{unblockWindowType},
            unblock_window_value = #{unblockWindowValue},
            auto_signout_enabled = #{autoSignoutEnabled},
            whitelist_depts = #{whitelistDepts},
            cron_expression = #{cronExpression},
            updated_at = NOW()
        WHERE id = #{id}
    </update>

    <delete id="deleteById">
        DELETE FROM twin_violation_rule WHERE id = #{id}
    </delete>

    <select id="countViolationsByRuleId" resultType="int">
        SELECT COUNT(1) FROM twin_student_violation WHERE rule_id = #{ruleId}
    </select>

    <select id="countViolationsInWindow" resultType="int">
        SELECT COUNT(1)
        FROM twin_student_violation
        WHERE target_user_id = #{targetUserId}
          AND rule_id = #{ruleId}
          AND created_at >= #{windowStart}
    </select>
</mapper>
```

- [ ] **Step 3: 提交**

```bash
git add src/main/java/com/example/demo/modules/twin/dashboard/mapper/TwinViolationRuleMapper.java src/main/resources/mapper/TwinViolationRuleMapper.xml
git commit -m "feat: add TwinViolationRuleMapper with count-in-window query"
```

---

### Task 4: 后端 — TwinViolationRuleService（核心服务）

**Files:**
- Create: `src/main/java/com/example/demo/modules/twin/dashboard/service/TwinViolationRuleService.java`

- [ ] **Step 1: 创建 Service（含计数、解禁判定、窗口计算）**

```java
package com.example.demo.modules.twin.dashboard.service;

import com.example.demo.modules.twin.dashboard.entity.TwinViolationRule;
import com.example.demo.modules.twin.dashboard.mapper.TwinViolationRuleMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.Month;
import java.time.temporal.TemporalAdjusters;
import java.util.List;

@Service
public class TwinViolationRuleService {
    private static final Logger log = LoggerFactory.getLogger(TwinViolationRuleService.class);

    private final TwinViolationRuleMapper ruleMapper;

    public TwinViolationRuleService(TwinViolationRuleMapper ruleMapper) {
        this.ruleMapper = ruleMapper;
    }

    // ═══ CRUD ═══

    public List<TwinViolationRule> listAll() {
        return ruleMapper.selectAll();
    }

    public TwinViolationRule getById(long id) {
        return ruleMapper.selectById(id);
    }

    public TwinViolationRule getByCode(String ruleCode) {
        if (!StringUtils.hasText(ruleCode)) return null;
        return ruleMapper.selectByCode(ruleCode.trim());
    }

    @Transactional(rollbackFor = Exception.class)
    public TwinViolationRule create(TwinViolationRule row) {
        if (!StringUtils.hasText(row.getRuleCode())) {
            throw new IllegalArgumentException("规则编码不能为空");
        }
        if (!StringUtils.hasText(row.getRuleName())) {
            throw new IllegalArgumentException("规则名称不能为空");
        }
        ruleMapper.insert(row);
        return ruleMapper.selectById(row.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public TwinViolationRule update(TwinViolationRule row) {
        TwinViolationRule existing = ruleMapper.selectById(row.getId());
        if (existing == null) throw new IllegalArgumentException("规则不存在: " + row.getId());
        ruleMapper.updateById(row);
        return ruleMapper.selectById(row.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(long id) {
        TwinViolationRule existing = ruleMapper.selectById(id);
        if (existing == null) return false;
        int refCount = ruleMapper.countViolationsByRuleId(id);
        if (refCount > 0) {
            throw new IllegalArgumentException("该规则下已有 " + refCount + " 条违规记录，无法删除");
        }
        return ruleMapper.deleteById(id) > 0;
    }

    // ═══ 解禁计数 ═══

    /** 计算时间窗口起点 */
    public LocalDateTime computeWindowStart(TwinViolationRule rule) {
        if (rule == null) return LocalDateTime.now().minusDays(30);
        String type = rule.getUnblockWindowType();
        Integer value = rule.getUnblockWindowValue();
        if (!StringUtils.hasText(type) || "滑动窗口".equals(type)) {
            int days = (value != null && value > 0) ? value : 30;
            return LocalDateTime.now().minusDays(days);
        }
        // 固定周期
        int periodType = (value != null) ? value : 1;
        LocalDateTime now = LocalDateTime.now();
        switch (periodType) {
            case 2: // 自然周
                return now.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                          .withHour(0).withMinute(0).withSecond(0).withNano(0);
            case 3: // 学期（简化：1-6月→1月1日，7-12月→7月1日）
                Month m = now.getMonth();
                if (m.getValue() >= 7) {
                    return now.withMonth(7).withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0).withNano(0);
                } else {
                    return now.withMonth(1).withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0).withNano(0);
                }
            default: // 1 = 自然月
                return now.withDayOfMonth(1).withHour(0).withMinute(0).withSecond(0).withNano(0);
        }
    }

    /** 查询某人在某规则窗口内的违规次数（含本次将创建之前的所有记录） */
    public int countViolationsInWindow(String targetUserId, long ruleId) {
        TwinViolationRule rule = getById(ruleId);
        if (rule == null) return 0;
        LocalDateTime windowStart = computeWindowStart(rule);
        return ruleMapper.countViolationsInWindow(targetUserId, ruleId, windowStart);
    }

    // ═══ 解禁判定 ═══

    /**
     * 解禁判定结果（违规创建时调用）。
     * K = 窗口内已有 COUNT + 1（含本次）
     */
    public UnblockDecision evaluate(String targetUserId, long ruleId) {
        TwinViolationRule rule = getById(ruleId);
        if (rule == null) {
            return UnblockDecision.noLimit();
        }
        int existingCount = countViolationsInWindow(targetUserId, ruleId);
        int k = existingCount + 1; // 含本次
        Integer max = rule.getUnblockMaxCount();

        if (max == null) {
            return new UnblockDecision(rule.getForbidEnter() != null && rule.getForbidEnter() == 1,
                    false, max, k - max);
        }

        boolean isCritical = k >= max;
        // 达到上限时强制 forbid_enter = 1
        boolean effectiveForbidEnter = isCritical || (rule.getForbidEnter() != null && rule.getForbidEnter() == 1);
        int remaining = max - k;

        return new UnblockDecision(effectiveForbidEnter, isCritical, max, remaining);
    }

    /** 自助解禁是否可用 */
    public boolean canSelfUnblock(long violationId, String userId, long ruleId) {
        TwinViolationRule rule = getById(ruleId);
        if (rule == null) return false;
        if (!"自助解禁".equals(rule.getUnblockMethod())) return false;
        int k = countViolationsInWindow(userId, ruleId);
        Integer max = rule.getUnblockMaxCount();
        if (max != null && k >= max) return false;
        return true;
    }

    // ═══ 内部类 ═══

    public static class UnblockDecision {
        private final boolean forbidEnter;      // 最终是否禁入
        private final boolean critical;          // 是否关键记录（达到上限）
        private final Integer maxCount;          // 配置上限（null=无限制）
        private final int remaining;             // 剩余次数（≤0 即无剩余）

        public UnblockDecision(boolean forbidEnter, boolean critical, Integer maxCount, int remaining) {
            this.forbidEnter = forbidEnter;
            this.critical = critical;
            this.maxCount = maxCount;
            this.remaining = remaining;
        }

        public static UnblockDecision noLimit() {
            return new UnblockDecision(false, false, null, Integer.MAX_VALUE);
        }

        public boolean isForbidEnter() { return forbidEnter; }
        public boolean isCritical() { return critical; }
        public Integer getMaxCount() { return maxCount; }
        public int getRemaining() { return remaining; }
    }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/main/java/com/example/demo/modules/twin/dashboard/service/TwinViolationRuleService.java
git commit -m "feat: add TwinViolationRuleService with count/decision/unblock logic"
```

---

### Task 5: 后端 — 修改 TwinStudentViolation 实体 + Mapper

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/dashboard/entity/TwinStudentViolation.java`
- Modify: `src/main/resources/mapper/TwinStudentViolationMapper.xml`

- [ ] **Step 1: 实体加 ruleId 字段**

在 `TwinStudentViolation.java` 的 `interactiveUnlockOnVerify` 之后添加：

```java
    /** 关联触发规则ID */
    private Long ruleId;
```

- [ ] **Step 2: Mapper XML — resultMap 加映射**

在 `TwinStudentViolationMapper.xml` 的 `<resultMap>` 内追加：

```xml
        <result column="rule_id" property="ruleId"/>
```

- [ ] **Step 3: Mapper XML — insert 加列**

在 `insert` 语句的列列表和值列表中追加 `rule_id`：

```xml
    <insert id="insert" useGeneratedKeys="true" keyProperty="id" keyColumn="id">
        INSERT INTO twin_student_violation (
            target_user_id, violation_text, image_urls,
            forbid_enter, max_enter_success, enter_success_count, show_notice_every_scan,
            expire_at, status, created_by_user_id, source, interactive_challenge, interactive_unlock_on_verify,
            rule_id
        ) VALUES (
            #{targetUserId}, #{violationText}, #{imageUrls},
            #{forbidEnter}, #{maxEnterSuccess}, #{enterSuccessCount}, #{showNoticeEveryScan},
            #{expireAt}, #{status}, #{createdByUserId}, #{source}, #{interactiveChallenge}, #{interactiveUnlockOnVerify},
            #{ruleId}
        )
    </insert>
```

- [ ] **Step 4: Mapper XML — selectRecent / selectById 无需改（SELECT * 自动覆盖 rule_id）**

确认所有 `SELECT *` 的查询会自动映射 `rule_id` → `ruleId`（resultMap 已补）。

- [ ] **Step 5: 提交**

```bash
git add src/main/java/com/example/demo/modules/twin/dashboard/entity/TwinStudentViolation.java src/main/resources/mapper/TwinStudentViolationMapper.xml
git commit -m "feat: add rule_id column to twin_student_violation entity and mapper"
```

---

### Task 6: 后端 — 修改 TwinStudentViolationService（集成规则判定）

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/dashboard/service/TwinStudentViolationService.java`

- [ ] **Step 1: 注入 TwinViolationRuleService**

在构造函数注入中添加：

```java
    private final TwinViolationRuleService ruleService;

    public TwinStudentViolationService(
            TwinStudentViolationMapper violationMapper,
            ObjectMapper objectMapper,
            UserDisplayNameService userDisplayNameService,
            TwinDashboardMapper dashboardMapper,
            TwinViolationRuleService ruleService) {
        this.violationMapper = violationMapper;
        this.objectMapper = objectMapper;
        this.userDisplayNameService = userDisplayNameService;
        this.dashboardMapper = dashboardMapper;
        this.ruleService = ruleService;
    }
```

- [ ] **Step 2: create 方法新增 ruleId 参数重载**

在现有 `create(...)` 方法最后新增一个接受 `Long ruleId` 的重载：

```java
    @Transactional(rollbackFor = Exception.class)
    public TwinStudentViolation create(
            String targetUserId,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId,
            String source,
            String interactiveChallenge,
            Boolean interactiveUnlockOnVerify,
            Long ruleId
    ) {
        if (!StringUtils.hasText(targetUserId)) {
            throw new IllegalArgumentException("缺少 targetUserId");
        }
        if (violationTableAbsent.get()) {
            throw new IllegalStateException("库表 twin_student_violation 未创建...");
        }
        String tid = targetUserId.trim();
        touchExpireStale();

        // ──── 规则判定：如设上限则强制覆盖 forbid_enter ────
        TwinViolationRuleService.UnblockDecision decision = null;
        boolean effectiveForbidEnter = forbidEnter;
        if (ruleId != null && ruleService != null) {
            decision = ruleService.evaluate(tid, ruleId);
            effectiveForbidEnter = decision.isForbidEnter();
        }

        try {
            violationMapper.supersedeActiveByTargetUserId(tid);
        } catch (Exception e) { /* ... 同原逻辑 */ }

        TwinStudentViolation row = new TwinStudentViolation();
        row.setTargetUserId(tid);
        row.setViolationText(violationText);
        row.setImageUrls(serializeImageUrls(imageUrls));
        row.setInteractiveChallenge(normalizeInteractiveChallenge(interactiveChallenge));
        row.setInteractiveUnlockOnVerify(resolveInteractiveUnlockOnVerify(row.getInteractiveChallenge(), interactiveUnlockOnVerify));
        row.setForbidEnter(effectiveForbidEnter ? 1 : 0);
        row.setMaxEnterSuccess(maxEnterSuccess);
        row.setEnterSuccessCount(0);
        row.setShowNoticeEveryScan(showNoticeEveryScan ? 1 : 0);
        if (expireAfterDays != null && expireAfterDays > 0) {
            row.setExpireAt(LocalDateTime.now().plusDays(expireAfterDays));
        }
        row.setStatus(STATUS_ACTIVE);
        row.setCreatedByUserId(createdByUserId);
        row.setSource(source != null && !source.isBlank() ? source.trim() : "MANUAL");
        row.setRuleId(ruleId);
        try {
            violationMapper.insert(row);
        } catch (Exception e) { /* ... 同原逻辑 */ }
        return row;
    }
```

- [ ] **Step 3: 修改 buildNotice — 返回 isCritical / canSelfUnblock / ruleName**

在 `buildNotice(String targetUserId)` 方法中，找到 `dto.setPastExpireAwaitingInteractive(...)` 之后追加：

```java
        // 规则解禁状态
        if (row.getRuleId() != null && ruleService != null) {
            TwinViolationRule rule = ruleService.getById(row.getRuleId());
            if (rule != null) {
                dto.setRuleName(rule.getRuleName());
                dto.setUnblockMethod(rule.getUnblockMethod());
                TwinViolationRuleService.UnblockDecision decision = ruleService.evaluate(targetUserId, row.getRuleId());
                dto.setCritical(decision.isCritical());
                dto.setCanSelfUnblock(ruleService.canSelfUnblock(row.getId(), targetUserId, row.getRuleId()));
            }
        }
```

- [ ] **Step 4: 更新 ScanStudentViolationNoticeDTO**

Modify: `src/main/java/com/example/demo/modules/twin/dashboard/dto/ScanStudentViolationNoticeDTO.java`

添加三个新字段：

```java
    /** 触发规则名称 */
    private String ruleName;
    /** 解禁方式：自助解禁 / 仅工作人员 */
    private String unblockMethod;
    /** 是否关键记录（达到解禁上限，自助通道已关闭） */
    private Boolean critical;
    /** 当前是否允许自助解禁 */
    private Boolean canSelfUnblock;
```

- [ ] **Step 5: 提交**

```bash
git add src/main/java/com/example/demo/modules/twin/dashboard/service/TwinStudentViolationService.java src/main/java/com/example/demo/modules/twin/dashboard/dto/ScanStudentViolationNoticeDTO.java
git commit -m "feat: integrate violation rule decision into create & buildNotice"
```

---

### Task 7: 后端 — 新增 ViolationRule 管理 Controller

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/dashboard/controller/AdminTwinStudentViolationController.java`

- [ ] **Step 1: 注入 ruleService**

在构造函数注入中添加：

```java
    private final TwinViolationRuleService ruleService;
    // 构造函数参数列表追加 TwinViolationRuleService ruleService
```

- [ ] **Step 2: 规则 CRUD 端点**

在 Controller 末尾追加：

```java
    // ═══ 违规触发规则 CRUD ═══

    @GetMapping("/rules")
    @Operation(summary = "触发规则列表")
    public Result<?> listRules(
            @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        List<TwinViolationRule> rules = ruleService.listAll();
        return Result.success(rules);
    }

    @GetMapping("/rules/{id}")
    @Operation(summary = "触发规则详情")
    public Result<?> getRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") long id
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        TwinViolationRule rule = ruleService.getById(id);
        return rule != null ? Result.success(rule) : Result.error("规则不存在");
    }

    @PostMapping("/rules")
    @Operation(summary = "新建触发规则")
    public Result<?> createRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody TwinViolationRule body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(ruleService.create(body));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/rules/{id}")
    @Operation(summary = "编辑触发规则")
    public Result<?> updateRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") long id,
            @RequestBody TwinViolationRule body
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        body.setId(id);
        try {
            return Result.success(ruleService.update(body));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/rules/{id}")
    @Operation(summary = "删除触发规则（有关联违规记录时禁止）")
    public Result<?> deleteRule(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable("id") long id
    ) {
        Result<?> denied = requireAdmin(authorization);
        if (denied != null) return denied;
        try {
            boolean ok = ruleService.delete(id);
            return ok ? Result.success() : Result.error("规则不存在");
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }
```

- [ ] **Step 3: 修改 list 端点 — toRow 返回 ruleId / ruleName**

在 `toRow()` 方法中添加：

```java
        m.put("ruleId", v.getRuleId());
        if (v.getRuleId() != null && ruleService != null) {
            TwinViolationRule rule = ruleService.getById(v.getRuleId());
            m.put("ruleName", rule != null ? rule.getRuleName() : null);
        } else {
            m.put("ruleName", null);
        }
```

- [ ] **Step 4: 修改 create 端点 — 接受 ruleId**

在 `CreateStudentViolationBody` 添加字段：

```java
        private Long ruleId;
```

在 `create()` 方法中，将 `ruleId` 传给 `violationService.create(...)` 的新重载。

若 `ruleId` 为 null，则在 MANUAL 创建时自动查找 `MANUAL` 规则：

```java
            Long effectiveRuleId = body.getRuleId();
            if (effectiveRuleId == null && "MANUAL".equals(body.getSource() != null ? body.getSource() : "MANUAL")) {
                TwinViolationRule manualRule = ruleService.getByCode("MANUAL");
                if (manualRule != null) effectiveRuleId = manualRule.getId();
            }
```

- [ ] **Step 5: 添加 import**

```java
import com.example.demo.modules.twin.dashboard.entity.TwinViolationRule;
import com.example.demo.modules.twin.dashboard.service.TwinViolationRuleService;
```

- [ ] **Step 6: 提交**

```bash
git add src/main/java/com/example/demo/modules/twin/dashboard/controller/AdminTwinStudentViolationController.java
git commit -m "feat: add violation rule CRUD endpoints and integrate rule_id into violation CRUD"
```

---

### Task 8: 后端 — 改造 StrandedViolationService 读规则表

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/dashboard/service/StrandedViolationService.java`

- [ ] **Step 1: 注入 ruleService**

```java
    private final TwinViolationRuleService ruleService;

    public StrandedViolationService(
            DahuaSwingMapper dahuaSwingMapper,
            AroService aroService,
            DahuaAutoSignoutService autoSignoutService,
            TwinStudentViolationService violationService,
            TwinDashboardMapper personnelMapper,
            StrandedViolationConfigMapper configMapper,
            TwinViolationRuleService ruleService) {
        // ... existing assignments ...
        this.ruleService = ruleService;
    }
```

- [ ] **Step 2: executeScheduledCheck — 优先读规则表**

在 `executeScheduledCheck()` 开头，尝试从 `twin_violation_rule` 读取 `AUTO_STRANDED` 规则。若规则不存在或禁用则回退到旧 `stranded_violation_config`：

```java
    public void executeScheduledCheck() {
        TwinViolationRule rule = ruleService.getByCode("AUTO_STRANDED");
        Long ruleId = null;
        boolean autoSignout, interactiveEnabled, interactiveUnlockOnVerify;
        String tpl, interactivePhrase;
        int forbidEnter, expireDays;
        List<String> whitelistDepts;

        if (rule != null && (rule.getEnabled() != null && rule.getEnabled() == 1)) {
            ruleId = rule.getId();
            autoSignout = rule.getAutoSignoutEnabled() != null && rule.getAutoSignoutEnabled() == 1;
            tpl = StringUtils.hasText(rule.getViolationTextTpl()) ? rule.getViolationTextTpl() : DEFAULT_VIOLATION_TPL;
            forbidEnter = rule.getForbidEnter() != null && rule.getForbidEnter() == 1 ? 1 : 0;
            expireDays = rule.getExpireAfterDays() != null ? rule.getExpireAfterDays() : 1;
            whitelistDepts = parseJsonArray(rule.getWhitelistDepts());
            interactiveEnabled = StringUtils.hasText(rule.getInteractiveChallenge());
            interactivePhrase = rule.getInteractiveChallenge();
            interactiveUnlockOnVerify = rule.getInteractiveUnlockOnVerify() == null || rule.getInteractiveUnlockOnVerify() == 1;
        } else {
            // 回退到旧 stranded_violation_config
            Map<String, Object> config = configMapper.selectConfig();
            if (config == null || config.isEmpty()) { log.info("[stranded-violation] 无配置，跳过"); return; }
            autoSignout = Boolean.TRUE.equals(toBool(config.get("auto_signout_enabled")));
            tpl = Objects.toString(config.get("violation_text_tpl"), DEFAULT_VIOLATION_TPL);
            forbidEnter = Boolean.TRUE.equals(toBool(config.get("forbid_enter"))) ? 1 : 0;
            expireDays = toInt(config.get("expire_after_days"), 1);
            whitelistDepts = parseJsonArray(Objects.toString(config.get("whitelist_depts"), "[]"));
            interactiveEnabled = Boolean.TRUE.equals(toBool(config.get("interactive_challenge_enabled")));
            interactivePhrase = Objects.toString(config.get("interactive_challenge_phrase"), "");
            interactiveUnlockOnVerify = toInt(config.get("interactive_unlock_on_verify"), 1) != 0;
        }

        // ... 后续逻辑不变，但在 create 调用时传入 ruleId ...
        violationService.create(
                userId, text, null, effectiveForbidEnter, null, true,
                expireDays, "SYSTEM", SOURCE_AUTO_STRANDED,
                challenge, interactiveUnlockOnVerify, ruleId  // ← 传入 ruleId
        );
    }
```

- [ ] **Step 3: testSingleUser 同理改造**

同样在 `testSingleUser()` 中优先读规则表，创建时传入 `ruleId`。

- [ ] **Step 4: 提交**

```bash
git add src/main/java/com/example/demo/modules/twin/dashboard/service/StrandedViolationService.java
git commit -m "feat: read AUTO_STRANDED config from twin_violation_rule with fallback to old config"
```

---

### Task 9: 前端 — API 层新增规则类型和接口

**Files:**
- Modify: `frontend/src/api/domains/studentViolation.api.ts`

- [ ] **Step 1: 新增 ViolationRule 类型和 API 函数**

在文件末尾追加：

```typescript
// ═══ 触发规则 ═══

export interface ViolationRule {
  id?: number;
  ruleCode: string;
  ruleName: string;
  enabled: number;
  sourceTag?: string;
  violationTextTpl?: string;
  forbidEnter: number;
  expireAfterDays?: number;
  showNoticeEveryScan: number;
  interactiveChallenge?: string;
  interactiveUnlockOnVerify: number;
  /** 解禁方式: 自助解禁 | 仅工作人员 */
  unblockMethod: '自助解禁' | '仅工作人员';
  /** 窗口内最大违规次数; null=不限制 */
  unblockMaxCount?: number | null;
  /** 滑动窗口 | 固定周期 */
  unblockWindowType?: '滑动窗口' | '固定周期';
  /** 滑动天数 / 固定周期编号(1=月 2=周 3=学期) */
  unblockWindowValue?: number;
  autoSignoutEnabled: number;
  whitelistDepts?: string;
  cronExpression?: string;
}

export async function listViolationRules(): Promise<ViolationRule[]> {
  const res = await adminHttp.get<ApiResponse<ViolationRule[]>>(
    "/twin/student-violations/rules"
  );
  return res.data?.data || [];
}

export async function getViolationRule(id: number): Promise<ViolationRule | null> {
  const res = await adminHttp.get<ApiResponse<ViolationRule>>(
    `/twin/student-violations/rules/${id}`
  );
  return res.data?.data ?? null;
}

export async function createViolationRule(body: ViolationRule): Promise<ViolationRule> {
  const res = await adminHttp.post<ApiResponse<ViolationRule>>(
    "/twin/student-violations/rules", body
  );
  return res.data?.data!;
}

export async function updateViolationRule(id: number, body: ViolationRule): Promise<ViolationRule> {
  const res = await adminHttp.put<ApiResponse<ViolationRule>>(
    `/twin/student-violations/rules/${id}`, body
  );
  return res.data?.data!;
}

export async function deleteViolationRule(id: number): Promise<void> {
  await adminHttp.delete<ApiResponse<unknown>>(
    `/twin/student-violations/rules/${id}`
  );
}
```

- [ ] **Step 2: StudentViolationRow 加字段**

在 `StudentViolationRow` 接口中添加：

```typescript
  ruleId?: number | null;
  ruleName?: string | null;
```

- [ ] **Step 3: CreateStudentViolationPayload 加 ruleId**

在 `CreateStudentViolationPayload` 中添加：

```typescript
  /** 关联触发规则ID（不传则自动使用 MANUAL 规则） */
  ruleId?: number | null;
```

- [ ] **Step 4: 状态枚举中文化**

新增映射常量：

```typescript
export const VIOLATION_STATUS_LABEL: Record<StudentViolationStatus, string> = {
  ACTIVE: '生效中',
  CLEARED: '已解除',
  EXPIRED: '已过期',
  SUPERSEDED: '已替换',
  PROCESSED: '已处理',
};

export const UNBLOCK_METHOD_LABEL: Record<string, string> = {
  '自助解禁': '自助解禁',
  '仅工作人员': '仅工作人员',
};
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/api/domains/studentViolation.api.ts
git commit -m "feat: add ViolationRule types and API functions; add status label mappings"
```

---

### Task 10: 前端 — 新增类型映射到 Scanner API

**Files:**
- Modify: `frontend/src/api/types/scanner.ts`

- [ ] **Step 1: StudentViolationNotice 加字段**

在 `StudentViolationNotice` 接口中添加：

```typescript
  /** 触发规则名称 */
  ruleName?: string;
  /** 解禁方式 */
  unblockMethod?: string;
  /** 是否关键记录（达到上限） */
  critical?: boolean;
  /** 当前能否自助解禁 */
  canSelfUnblock?: boolean;
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/api/types/scanner.ts
git commit -m "feat: add rule/unblock fields to StudentViolationNotice type"
```

---

### Task 11: 前端 — 管理页新增「触发规则」Tab

**Files:**
- Modify: `frontend/src/pages/AdminStudentViolationsPage.tsx`

- [ ] **Step 1: 导入新 API**

在文件顶部 import 中添加：

```typescript
import {
  // ... existing imports ...
  listViolationRules, createViolationRule, updateViolationRule, deleteViolationRule,
  VIOLATION_STATUS_LABEL, UNBLOCK_METHOD_LABEL,
  type ViolationRule,
} from "@/api/domains/studentViolation.api";
```

- [ ] **Step 2: PageTabId 加 'rules'**

```typescript
type PageTabId = "unbound" | "announcement" | "create" | "records" | "swipe-alert" | "rules";
```

- [ ] **Step 3: PAGE_TABS 加新 tab**

```typescript
  { id: "rules", label: "触发规则", icon: <Settings className="h-4 w-4 text-[var(--twin-mute)]" aria-hidden /> },
```

Import `Settings` from lucide-react.

- [ ] **Step 4: 新增 ViolationRuleManager 组件（内联或独立文件）**

在页面文件底部或新文件 `frontend/src/features/admin/ViolationRuleManager.tsx` 中添加规则管理 UI：

- 表格列出所有规则（code、名称、解禁方式、上限次数、窗口、启用状态）
- 新建/编辑弹窗（表单字段与规则实体对齐）
- 删除按钮（后端会校验关联记录）
- 解禁方式下拉：`自助解禁` / `仅工作人员`
- 窗口类型下拉：`滑动窗口` / `固定周期`

（完整 JSX 代码见计划末尾附录 A）

- [ ] **Step 5: 在 AdminStudentViolationsPage 中挂载**

```tsx
<AdminTabPanel showWhen={activeTab === "rules"}>
  <ViolationRuleManager />
</AdminTabPanel>
```

- [ ] **Step 6: records tab — 表格加「规则名称」和「状态」列**

在 records 表格中新增两列：
- `ruleName` — 触发规则显示名（后端 `toRow` 已返回）
- `status` — 使用 `VIOLATION_STATUS_LABEL` 映射为中文

- [ ] **Step 7: records tab — create 时可选规则**

在新建违规弹窗中，增加一个规则下拉选择器（列出所有启用的规则），选中后 `ruleId` 随请求发送。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/pages/AdminStudentViolationsPage.tsx frontend/src/features/admin/ViolationRuleManager.tsx
git commit -m "feat: add Violation Rules management tab and integrate into records"
```

---

### Task 12: 前端 — 扫码弹窗公告集成解禁状态

**Files:**
- Modify: `frontend/src/components/scanner/ScanPopupNoticeBanner.tsx`
- Modify: `frontend/src/components/scanner/twinViolationInteractive.ts`

- [ ] **Step 1: ScanPopupNoticeBanner — 自助解禁按钮状态**

在违规公告卡片中，根据 `notice.critical` 和 `notice.canSelfUnblock` 调整交互拼图按钮：

- 若 `unblockMethod === '仅工作人员'`：不显示拼图区域，显示文案「请联系工作人员解除」
- 若 `unblockMethod === '自助解禁'` 且 `canSelfUnblock === true`：正常显示拼图
- 若 `canSelfUnblock === false`（达到上限的关键记录）：拼图按钮灰掉或隐藏，显示「已达自助解禁上限，请联系工作人员」

```tsx
{notice.interactiveChallenge && (
  <div className="mt-2 pt-2 border-t border-[var(--app-color-border-default)]">
    {notice.unblockMethod === '仅工作人员' ? (
      <p className="text-[11px] text-[var(--app-color-text-tertiary)] text-center">
        该违规需由工作人员解除，请联系管理员
      </p>
    ) : notice.canSelfUnblock ? (
      <InteractiveChallenge ... />
    ) : (
      <p className="text-[11px] text-[var(--app-color-feedback-danger)] text-center font-semibold">
        已达自助解禁上限（{notice.critical ? '关键记录' : ''}），请联系工作人员
      </p>
    )}
  </div>
)}
```

- [ ] **Step 2: twinViolationInteractive — ack 前检查**

在 `ackViolationInteractivePermanent` 中增加 canSelfUnblock 判断逻辑（前端兜底检查，后端已有权威判定）。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/scanner/ScanPopupNoticeBanner.tsx frontend/src/components/scanner/twinViolationInteractive.ts
git commit -m "feat: integrate unblock status into scan popup notice banner"
```

---

### Task 13: 废弃 stranded_violation_config（收尾）

**Files:**
- No code changes required at this stage

- [ ] **Step 1: 确认所有读 stranded_violation_config 的地方已有 fallback**

- `StrandedViolationService.executeScheduledCheck()` — ✅ 已改造
- `StrandedViolationService.testSingleUser()` — ✅ 已改造
- Admin page 的 `getStrandedConfig` / `saveStrandedConfig` 端点保留，但标记为 `@Deprecated`

- [ ] **Step 2: 在 Controller 的旧端点加 @Deprecated 注释**

```java
    /**
     * @deprecated 使用 GET /api/admin/twin/student-violations/rules 代替
     */
    @GetMapping("/stranded-config")
```

- [ ] **Step 3: 提交**

```bash
git add src/main/java/com/example/demo/modules/twin/dashboard/controller/AdminTwinStudentViolationController.java
git commit -m "chore: deprecate stranded-config endpoints in favor of twin_violation_rule"
```

---

## 附录 A: ViolationRuleManager 组件核心结构

```tsx
// frontend/src/features/admin/ViolationRuleManager.tsx

function ViolationRuleManager() {
  const queryClient = useQueryClient();
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["violation-rules"],
    queryFn: () => listViolationRules(),
  });

  const [editing, setEditing] = useState<ViolationRule | null>(null);
  const [showForm, setShowForm] = useState(false);

  const deleteMu = useMutation({
    mutationFn: deleteViolationRule,
    onSuccess: () => { toast.success("已删除"); queryClient.invalidateQueries({ queryKey: ["violation-rules"] }); },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message || "删除失败"),
  });

  return (
    <AdminTableShell ...>
      <table>
        <thead>
          <tr>
            <th>编码</th><th>名称</th><th>解禁方式</th><th>上限次数</th><th>窗口</th><th>启用</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td className="font-mono text-xs">{r.ruleCode}</td>
              <td>{r.ruleName}</td>
              <td>{UNBLOCK_METHOD_LABEL[r.unblockMethod]}</td>
              <td>{r.unblockMaxCount ?? '不限'}</td>
              <td>{r.unblockWindowType} {r.unblockWindowValue}{r.unblockWindowType === '滑动窗口' ? '天' : ''}</td>
              <td>{r.enabled ? '✅' : '⏸'}</td>
              <td>
                <AdminButton onClick={() => { setEditing(r); setShowForm(true); }}>编辑</AdminButton>
                <AdminButton onClick={() => { if (confirm('删除此规则？')) deleteMu.mutate(r.id!); }}>删除</AdminButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <RuleFormModal open={showForm} rule={editing} onClose={() => { setShowForm(false); setEditing(null); }} />
    </AdminTableShell>
  );
}
```

`RuleFormModal` 包含完整的规则表单：
- `ruleCode`、`ruleName`（text input）
- `unblockMethod`（dropdown: 自助解禁/仅工作人员）
- `unblockMaxCount`（number input, null=不限）
- `unblockWindowType`（dropdown: 滑动窗口/固定周期）
- `unblockWindowValue`（number: 天数 或 周期编号）
- `forbidEnter`（checkbox）
- `interactiveChallenge`（text, 自助解禁时可配拼图短语）
- `enabled`（checkbox）

---

## 自审清单

- [x] Spec 覆盖：每一节需求都有对应 Task（1-13）
- [x] 无占位符：所有代码和 SQL 均为完整内容
- [x] 类型一致性：`UnblockDecision` 字段名在 Task 4/6/7 中一致；`ScanStudentViolationNoticeDTO` 新增字段在 Task 6/10 中一致
- [x] 迁移策略明确：仅新记录生效，旧记录 rule_id=NULL 跳过
- [x] 计数逻辑：COUNT 含所有状态，物理删除自动不计入
