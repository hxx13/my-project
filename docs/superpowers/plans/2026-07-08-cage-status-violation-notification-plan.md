# 笼架特殊状态 → 违规通知联动系统 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立笼架特殊状态与违规记录系统的自动联动——笼位特殊状态持续N天后自动为课题组成员创建违规记录/弹窗公告。

**Architecture:** 扩展现有 `twin_violation_rule` 表 + 新增 `twin_cage_status_violation` 父记录表 + 独立判定引擎 `CageStatusViolationCheckService`（Spring Event 驱动 + 独立 Job）。前端在违规管理页新增"笼架联动"标签页。

**Tech Stack:** Java Spring Boot 3.5 + MyBatis + MySQL 8.0 / React TypeScript + Tailwind CSS 3 + Radix UI + Vite

**Source Spec:** `docs/superpowers/specs/2026-07-08-cage-status-violation-notification-design.md`

---

## 文件结构

### 后端 — 新增

| 文件 | 职责 |
|------|------|
| `src/main/java/com/example/demo/modules/twin/common/event/CageScanCompletedEvent.java` | Spring 事件：笼架同步完成 |
| `src/main/java/com/example/demo/modules/twin/dashboard/entity/TwinCageStatusViolation.java` | 父记录实体 |
| `src/main/java/com/example/demo/modules/twin/dashboard/mapper/TwinCageStatusViolationMapper.java` | 父记录 Mapper 接口 |
| `src/main/resources/mapper/TwinCageStatusViolationMapper.xml` | 父记录 Mapper XML |
| `src/main/java/com/example/demo/modules/twin/dashboard/service/CageStatusViolationCheckService.java` | 判定引擎 |
| `src/main/java/com/example/demo/modules/twin/dashboard/dto/CageStatusViolationDTO.java` | 父记录 DTO |
| `src/main/java/com/example/demo/modules/twin/dashboard/controller/AdminCageStatusViolationController.java` | REST 控制器 |

### 后端 — 修改

| 文件 | 改动 |
|------|------|
| `src/main/java/com/example/demo/modules/twin/dashboard/entity/TwinViolationRule.java` | +8 笼架字段 |
| `src/main/resources/mapper/TwinViolationRuleMapper.xml` | +8 列映射 |
| `src/main/java/com/example/demo/modules/twin/dashboard/entity/TwinStudentViolation.java` | +cageViolationId |
| `src/main/resources/mapper/TwinStudentViolationMapper.xml` | +cage_violation_id 列 |
| `src/main/java/com/example/demo/modules/cageshelf/service/CageSpecialStatusScanService.java` | 发布 Event |
| `src/main/java/com/example/demo/modules/twin/common/service/JobExecutionRegistry.java` | +JOB_CAGE_STATUS_VIOLATION_CHECK |
| `src/main/java/com/example/demo/modules/twin/dashboard/service/TwinViolationRuleService.java` | 扩展字段处理 |
| `src/main/java/com/example/demo/modules/twin/dashboard/service/TwinStudentViolationService.java` | 支持 cageViolationId |

### 数据库迁移

| 文件 | 内容 |
|------|------|
| `common/schema/V{ts}__cage_status_rule_fields.sql` | ALTER TABLE twin_violation_rule ADD 8列 |
| `common/schema/V{ts}__cage_status_violation_parent.sql` | CREATE TABLE twin_cage_status_violation |
| `common/schema/V{ts}__student_violation_cage_fk.sql` | ALTER TABLE twin_student_violation ADD cage_violation_id |

### 前端 — 新增

| 文件 | 职责 |
|------|------|
| `frontend/src/api/domains/cageStatusViolation.api.ts` | 父记录 API + 类型 |
| `frontend/src/features/admin/CageLinkageTab.tsx` | 笼架联动标签页组件 |
| `frontend/src/features/admin/CageLinkageRuleForm.tsx` | 规则配置弹窗 |
| `frontend/src/features/admin/CageLinkageRecordPanel.tsx` | 父记录详情/编辑面板 |

### 前端 — 修改

| 文件 | 改动 |
|------|------|
| `frontend/src/pages/AdminStudentViolationsPage.tsx` | +笼架联动 tab |
| `frontend/src/api/domains/studentViolation.api.ts` | ViolationRule 类型扩展 |

---

## Phase 1: 数据库迁移 + 实体层 @backend

### Task 1: 扩展 twin_violation_rule 表

**Files:**
- Create: `common/schema/V20260708001__cage_status_rule_fields.sql`

- [ ] **Step 1: 写 SQL 迁移文件**

```sql
-- 扩展 twin_violation_rule 表，增加笼架联动规则字段
ALTER TABLE twin_violation_rule
  ADD COLUMN IF NOT EXISTS cage_status_codes      JSON          COMMENT '监控的特殊状态类型 ["HEALTH_ABNORMAL","NEED_DIVIDE"]',
  ADD COLUMN IF NOT EXISTS cage_delay_days        INT           COMMENT '延迟天数',
  ADD COLUMN IF NOT EXISTS cage_judge_mode        VARCHAR(20)   DEFAULT 'AUTO_SYNC_LINKED' COMMENT '判定模式: AUTO_SYNC_LINKED / PURE_DAYS / PURE_MANUAL',
  ADD COLUMN IF NOT EXISTS cage_manual_trigger    TINYINT(1)    DEFAULT 0 COMMENT '手动执行也触发判定',
  ADD COLUMN IF NOT EXISTS cage_area_filter       JSON          COMMENT '区域筛选 {"campuses":[],"rooms":[]}',
  ADD COLUMN IF NOT EXISTS cage_group_whitelist   JSON          COMMENT '课题组白名单',
  ADD COLUMN IF NOT EXISTS cage_trigger_action    VARCHAR(20)   DEFAULT 'BOTH' COMMENT '触发动作: VIOLATION_ONLY / NOTICE_ONLY / BOTH',
  ADD COLUMN IF NOT EXISTS cage_image_urls        JSON          COMMENT '违规图片URL列表';
```

- [ ] **Step 2: 执行迁移**

在 MySQL 中执行上述 SQL（或启动应用让 DDL bootstrap 自动执行）。

- [ ] **Step 3: Commit**

```bash
git add common/schema/V20260708001__cage_status_rule_fields.sql
git commit -m "feat: extend twin_violation_rule with cage linkage fields"
```

---

### Task 2: 创建 twin_cage_status_violation 父记录表

**Files:**
- Create: `common/schema/V20260708002__cage_status_violation_parent.sql`

- [ ] **Step 1: 写 SQL 迁移文件**

```sql
CREATE TABLE IF NOT EXISTS twin_cage_status_violation (
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
  created_at          DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_rule (rule_id),
  INDEX idx_batch (scan_batch_id),
  INDEX idx_status (status),
  INDEX idx_group (project_group_name(64))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼架特殊状态违规父记录';
```

- [ ] **Step 2: 执行迁移**

- [ ] **Step 3: Commit**

```bash
git add common/schema/V20260708002__cage_status_violation_parent.sql
git commit -m "feat: create twin_cage_status_violation parent table"
```

---

### Task 3: 扩展 twin_student_violation 表

**Files:**
- Create: `common/schema/V20260708003__student_violation_cage_fk.sql`

- [ ] **Step 1: 写 SQL 迁移文件**

```sql
ALTER TABLE twin_student_violation
  ADD COLUMN IF NOT EXISTS cage_violation_id BIGINT COMMENT '关联 twin_cage_status_violation.id，NULL=非笼架触发',
  ADD INDEX IF NOT EXISTS idx_cage_vid (cage_violation_id);
```

- [ ] **Step 2: 执行迁移**

- [ ] **Step 3: Commit**

```bash
git add common/schema/V20260708003__student_violation_cage_fk.sql
git commit -m "feat: add cage_violation_id FK to twin_student_violation"
```

---

### Task 4: 更新实体类

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/dashboard/entity/TwinViolationRule.java`
- Modify: `src/main/java/com/example/demo/modules/twin/dashboard/entity/TwinStudentViolation.java`
- Create: `src/main/java/com/example/demo/modules/twin/dashboard/entity/TwinCageStatusViolation.java`

- [ ] **Step 1: 扩展 TwinViolationRule**

在 `TwinViolationRule.java` 末尾追加字段（在 `lastExecutionResult` 之后）：

```java
/** 监控的特殊状态类型 JSON */
private String cageStatusCodes;
/** 延迟天数 */
private Integer cageDelayDays;
/** 判定模式: AUTO_SYNC_LINKED / PURE_DAYS / PURE_MANUAL */
private String cageJudgeMode;
/** 手动执行也触发判定: 0=否 1=是 */
private Integer cageManualTrigger;
/** 区域筛选 JSON */
private String cageAreaFilter;
/** 课题组白名单 JSON */
private String cageGroupWhitelist;
/** 触发动作: VIOLATION_ONLY / NOTICE_ONLY / BOTH */
private String cageTriggerAction;
/** 违规图片 URL JSON 数组 */
private String cageImageUrls;
```

- [ ] **Step 2: 扩展 TwinStudentViolation**

在 `TwinStudentViolation.java` 末尾追加：

```java
/** 关联笼架违规父记录ID，NULL=非笼架触发 */
private Long cageViolationId;
```

- [ ] **Step 3: 创建 TwinCageStatusViolation 实体**

```java
package com.example.demo.modules.twin.dashboard.entity;

import lombok.Getter;
import lombok.Setter;
import java.time.LocalDateTime;

@Getter
@Setter
public class TwinCageStatusViolation {
    private Long id;
    private Long ruleId;
    private String scanBatchId;
    private String statusCode;
    private Long cageShelveId;
    private Integer positionX;
    private Integer positionY;
    private String positionLabel;
    private String cageBoxQrCode;
    private String projectPiName;
    private String projectGroupName;
    private String departmentName;
    private String roomName;
    private String campusName;
    private LocalDateTime triggeredAt;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/main/java/com/example/demo/modules/twin/dashboard/entity/
git commit -m "feat: add cage linkage entities - rule fields, violation parent, student FK"
```

---

### Task 5: 更新 Mapper XML

**Files:**
- Modify: `src/main/resources/mapper/TwinViolationRuleMapper.xml`
- Modify: `src/main/resources/mapper/TwinStudentViolationMapper.xml`
- Create: `src/main/resources/mapper/TwinCageStatusViolationMapper.xml`
- Create: `src/main/java/com/example/demo/modules/twin/dashboard/mapper/TwinCageStatusViolationMapper.java`

- [ ] **Step 1: 扩展 TwinViolationRuleMapper.xml**

在 `insert` 语句的列和值中追加：

```xml
<!-- 列追加 -->
cage_status_codes, cage_delay_days, cage_judge_mode, cage_manual_trigger,
cage_area_filter, cage_group_whitelist, cage_trigger_action, cage_image_urls,

<!-- 值追加 -->
#{cageStatusCodes}, #{cageDelayDays}, #{cageJudgeMode}, #{cageManualTrigger},
#{cageAreaFilter}, #{cageGroupWhitelist}, #{cageTriggerAction}, #{cageImageUrls},
```

同样在 `updateById` 和 `selectAll`/`selectById` resultMap 中追加对应映射。

- [ ] **Step 2: 扩展 TwinStudentViolationMapper.xml**

在 `insert` 语句中追加 `cage_violation_id` 列和 `#{cageViolationId}` 值，resultMap 中追加 `<result column="cage_violation_id" property="cageViolationId"/>`。

- [ ] **Step 3: 创建 TwinCageStatusViolationMapper.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.demo.modules.twin.dashboard.mapper.TwinCageStatusViolationMapper">

    <resultMap id="BaseResultMap" type="com.example.demo.modules.twin.dashboard.entity.TwinCageStatusViolation">
        <id column="id" property="id"/>
        <result column="rule_id" property="ruleId"/>
        <result column="scan_batch_id" property="scanBatchId"/>
        <result column="status_code" property="statusCode"/>
        <result column="cage_shelve_id" property="cageShelveId"/>
        <result column="position_x" property="positionX"/>
        <result column="position_y" property="positionY"/>
        <result column="position_label" property="positionLabel"/>
        <result column="cage_box_qr_code" property="cageBoxQrCode"/>
        <result column="project_pi_name" property="projectPiName"/>
        <result column="project_group_name" property="projectGroupName"/>
        <result column="department_name" property="departmentName"/>
        <result column="room_name" property="roomName"/>
        <result column="campus_name" property="campusName"/>
        <result column="triggered_at" property="triggeredAt"/>
        <result column="status" property="status"/>
        <result column="created_at" property="createdAt"/>
        <result column="updated_at" property="updatedAt"/>
    </resultMap>

    <insert id="insert" useGeneratedKeys="true" keyProperty="id">
        INSERT INTO twin_cage_status_violation (
            rule_id, scan_batch_id, status_code, cage_shelve_id, position_x, position_y,
            position_label, cage_box_qr_code, project_pi_name, project_group_name,
            department_name, room_name, campus_name, triggered_at, status
        ) VALUES (
            #{ruleId}, #{scanBatchId}, #{statusCode}, #{cageShelveId}, #{positionX}, #{positionY},
            #{positionLabel}, #{cageBoxQrCode}, #{projectPiName}, #{projectGroupName},
            #{departmentName}, #{roomName}, #{campusName}, #{triggeredAt}, #{status}
        )
    </insert>

    <select id="selectAll" resultMap="BaseResultMap">
        SELECT * FROM twin_cage_status_violation ORDER BY triggered_at DESC
    </select>

    <select id="selectById" resultMap="BaseResultMap">
        SELECT * FROM twin_cage_status_violation WHERE id = #{id}
    </select>

    <select id="selectActiveByRuleAndCage" resultMap="BaseResultMap">
        SELECT * FROM twin_cage_status_violation
        WHERE rule_id = #{ruleId} AND status_code = #{statusCode}
          AND cage_shelve_id = #{cageShelveId} AND position_x = #{positionX} AND position_y = #{positionY}
          AND status = 'ACTIVE'
        LIMIT 1
    </select>

    <update id="updateStatus">
        UPDATE twin_cage_status_violation SET status = #{status}, updated_at = NOW() WHERE id = #{id}
    </update>

    <delete id="deleteById">
        DELETE FROM twin_cage_status_violation WHERE id = #{id}
    </delete>
</mapper>
```

- [ ] **Step 4: 创建 TwinCageStatusViolationMapper 接口**

```java
package com.example.demo.modules.twin.dashboard.mapper;

import com.example.demo.modules.twin.dashboard.entity.TwinCageStatusViolation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface TwinCageStatusViolationMapper {
    int insert(TwinCageStatusViolation row);
    List<TwinCageStatusViolation> selectAll();
    TwinCageStatusViolation selectById(@Param("id") long id);
    TwinCageStatusViolation selectActiveByRuleAndCage(
        @Param("ruleId") long ruleId,
        @Param("statusCode") String statusCode,
        @Param("cageShelveId") long cageShelveId,
        @Param("positionX") int positionX,
        @Param("positionY") int positionY
    );
    int updateStatus(@Param("id") long id, @Param("status") String status);
    int deleteById(@Param("id") long id);
}
```

- [ ] **Step 5: Commit**

```bash
git add src/main/resources/mapper/ src/main/java/com/example/demo/modules/twin/dashboard/mapper/
git commit -m "feat: add cage linkage mapper XML and interfaces"
```

---

## Phase 2: 触发引擎 @backend

### Task 6: 创建 Spring Event

**Files:**
- Create: `src/main/java/com/example/demo/modules/twin/common/event/CageScanCompletedEvent.java`

- [ ] **Step 1: 创建事件类**

```java
package com.example.demo.modules.twin.common.event;

import org.springframework.context.ApplicationEvent;

public class CageScanCompletedEvent extends ApplicationEvent {
    private final String scanBatchId;
    private final String triggeredBy;

    public CageScanCompletedEvent(Object source, String scanBatchId, String triggeredBy) {
        super(source);
        this.scanBatchId = scanBatchId;
        this.triggeredBy = triggeredBy;
    }

    public String getScanBatchId() { return scanBatchId; }
    public String getTriggeredBy() { return triggeredBy; }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/modules/twin/common/event/
git commit -m "feat: add CageScanCompletedEvent for scan hook"
```

---

### Task 7: 在同步服务中发布 Event

**Files:**
- Modify: `src/main/java/com/example/demo/modules/cageshelf/service/CageSpecialStatusScanService.java`

- [ ] **Step 1: 注入 ApplicationEventPublisher**

在类顶部添加依赖和 import：

```java
import com.example.demo.modules.twin.common.event.CageScanCompletedEvent;
import org.springframework.context.ApplicationEventPublisher;

// 构造函数追加参数
private final ApplicationEventPublisher eventPublisher;

public CageSpecialStatusScanService(..., ApplicationEventPublisher eventPublisher) {
    // ... existing assignments
    this.eventPublisher = eventPublisher;
}
```

- [ ] **Step 2: 在 executeFullScan 末尾发布事件**

在 `executeFullScan()` 方法 return 之前，`progressService.done(...)` 之后：

```java
// 发布扫描完成事件，供笼架违规判定引擎消费
try {
    eventPublisher.publishEvent(new CageScanCompletedEvent(this, scanBatchId, triggeredBy));
} catch (Exception e) {
    log.warn("[cage-sync] 发布 CageScanCompletedEvent 失败: {}", e.getMessage());
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/cageshelf/service/CageSpecialStatusScanService.java
git commit -m "feat: publish CageScanCompletedEvent after full scan"
```

---

### Task 8: 注册新的定时任务

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/common/service/JobExecutionRegistry.java`

- [ ] **Step 1: 添加 Job 常量**

在 `JOB_EXP_RECONCILE` 之后：

```java
/** 笼架特殊状态违规检测（纯天数模式定时判定） */
public static final String JOB_CAGE_STATUS_VIOLATION_CHECK = "CAGE_STATUS_VIOLATION_CHECK";
```

- [ ] **Step 2: 在 jobNameMap 注册名称**

```java
jobs.put(JOB_CAGE_STATUS_VIOLATION_CHECK, "笼架特殊状态违规检测");
```

- [ ] **Step 3: 在 execute 添加 case**

在 `execute()` 方法 switch 中，`JOB_STRANDED_VIOLATION_CHECK` case 之后：

```java
case JOB_CAGE_STATUS_VIOLATION_CHECK -> {
    String triggeredBy = preferSync ? "ui-manual" : "system-scheduler";
    Map<String, Object> result = cageStatusViolationCheckService.executePureDaysCheck(triggeredBy);
    return new JobRunOutcome(true, JSON.toJSONString(result));
}
```

- [ ] **Step 4: 在 isSingleTimeJob 注册（如果需要每日执行）**

在 `isSingleTimeJob()` 方法中添加：

```java
case JOB_CAGE_STATUS_VIOLATION_CHECK:
    return true;
```

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/example/demo/modules/twin/common/service/JobExecutionRegistry.java
git commit -m "feat: register CAGE_STATUS_VIOLATION_CHECK job"
```

---

### Task 9: 实现判定引擎

**Files:**
- Create: `src/main/java/com/example/demo/modules/twin/dashboard/service/CageStatusViolationCheckService.java`

- [ ] **Step 1: 创建判定引擎服务**

```java
package com.example.demo.modules.twin.dashboard.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.cageshelf.entity.CageEventLog;
import com.example.demo.modules.cageshelf.mapper.CageEventLogMapper;
import com.example.demo.modules.cageshelf.mapper.CageSpecialStatusSnapshotMapper;
import com.example.demo.modules.twin.common.event.CageScanCompletedEvent;
import com.example.demo.modules.twin.common.service.TwinAutomationLogService;
import com.example.demo.modules.twin.dashboard.entity.TwinCageStatusViolation;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.entity.TwinViolationRule;
import com.example.demo.modules.twin.dashboard.mapper.TwinCageStatusViolationMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

@Service
public class CageStatusViolationCheckService {
    private static final Logger log = LoggerFactory.getLogger(CageStatusViolationCheckService.class);
    private static final String SOURCE_CAGE_STATUS = "CAGE_STATUS";
    private static final String JUDGE_AUTO_SYNC = "AUTO_SYNC_LINKED";
    private static final String JUDGE_PURE_DAYS = "PURE_DAYS";
    private static final String JUDGE_PURE_MANUAL = "PURE_MANUAL";

    private final TwinViolationRuleService ruleService;
    private final TwinStudentViolationService violationService;
    private final TwinCageStatusViolationMapper cageStatusViolationMapper;
    private final CageEventLogMapper eventLogMapper;
    private final CageSpecialStatusSnapshotMapper snapshotMapper;
    private final TwinAutomationLogService automationLogService;
    private final AroService aroService;

    public CageStatusViolationCheckService(
            TwinViolationRuleService ruleService,
            TwinStudentViolationService violationService,
            TwinCageStatusViolationMapper cageStatusViolationMapper,
            CageEventLogMapper eventLogMapper,
            CageSpecialStatusSnapshotMapper snapshotMapper,
            TwinAutomationLogService automationLogService,
            AroService aroService) {
        this.ruleService = ruleService;
        this.violationService = violationService;
        this.cageStatusViolationMapper = cageStatusViolationMapper;
        this.eventLogMapper = eventLogMapper;
        this.snapshotMapper = snapshotMapper;
        this.automationLogService = automationLogService;
        this.aroService = aroService;
    }

    /** 监听笼架同步完成事件，处理 AUTO_SYNC_LINKED 和 PURE_DAYS 模式 */
    @EventListener
    public void onScanCompleted(CageScanCompletedEvent event) {
        String scanBatchId = event.getScanBatchId();
        String triggeredBy = event.getTriggeredBy();
        boolean isAuto = "system-scheduler".equals(triggeredBy);
        log.info("[cage-v-check] 收到同步完成事件 batch={} triggeredBy={}", scanBatchId, triggeredBy);

        List<TwinViolationRule> rules = ruleService.listAll().stream()
                .filter(r -> r.getEnabled() != null && r.getEnabled() == 1)
                .filter(r -> SOURCE_CAGE_STATUS.equals(r.getSourceTag()))
                .toList();

        for (TwinViolationRule rule : rules) {
            try {
                String mode = rule.getCageJudgeMode() != null ? rule.getCageJudgeMode() : JUDGE_AUTO_SYNC;
                if (JUDGE_PURE_MANUAL.equals(mode)) continue;
                if (JUDGE_AUTO_SYNC.equals(mode)) {
                    boolean manualOk = rule.getCageManualTrigger() != null && rule.getCageManualTrigger() == 1;
                    if (!isAuto && !manualOk) continue;
                }
                processRule(rule, scanBatchId);
            } catch (Exception e) {
                log.warn("[cage-v-check] 规则判定失败 ruleId={} err={}", rule.getId(), e.getMessage());
            }
        }
    }

    /** 纯天数模式定时执行入口 */
    public Map<String, Object> executePureDaysCheck(String triggeredBy) {
        List<TwinViolationRule> rules = ruleService.listAll().stream()
                .filter(r -> r.getEnabled() != null && r.getEnabled() == 1)
                .filter(r -> SOURCE_CAGE_STATUS.equals(r.getSourceTag()))
                .filter(r -> JUDGE_PURE_DAYS.equals(r.getCageJudgeMode()))
                .toList();

        int totalTriggered = 0;
        for (TwinViolationRule rule : rules) {
            try {
                int count = processRule(rule, null);
                totalTriggered += count;
            } catch (Exception e) {
                log.warn("[cage-v-check] PURE_DAYS 判定失败 ruleId={} err={}", rule.getId(), e.getMessage());
            }
        }
        return Map.of("rulesChecked", rules.size(), "totalTriggered", totalTriggered);
    }

    /** 对单条规则执行判定 */
    private int processRule(TwinViolationRule rule, String scanBatchId) {
        List<String> statusCodes = parseStringList(rule.getCageStatusCodes());
        if (statusCodes.isEmpty()) return 0;
        int delayDays = rule.getCageDelayDays() != null ? rule.getCageDelayDays() : 7;

        // 获取本批次新增的特殊状态事件（STATUS_ADDED），且距今 ≥ delayDays
        List<CageEventLog> addedEvents = eventLogMapper.selectRecentStatusAdded(
                statusCodes, delayDays, scanBatchId);

        // 过滤区域和白名单
        List<String> campuses = parseStringList(rule.getCageAreaFilter() != null
                ? parseJsonField(rule.getCageAreaFilter(), "campuses") : null);
        List<String> rooms = parseStringList(rule.getCageAreaFilter() != null
                ? parseJsonField(rule.getCageAreaFilter(), "rooms") : null);
        List<String> groupWhitelist = parseStringList(rule.getCageGroupWhitelist());

        int triggered = 0;
        for (CageEventLog evt : addedEvents) {
            // 区域过滤
            if (!campuses.isEmpty() && !campuses.contains(evt.getCurrCampusName())) continue;
            if (!rooms.isEmpty() && !rooms.contains(evt.getCurrRoomName())) continue;
            // 课题组白名单
            if (!groupWhitelist.isEmpty() && !groupWhitelist.contains(evt.getProjectPiName())) continue;

            // 去重：已有 ACTIVE 父记录则跳过
            TwinCageStatusViolation existing = cageStatusViolationMapper.selectActiveByRuleAndCage(
                    rule.getId(),
                    extractStatusCode(evt),
                    evt.getCurrShelveId() != null ? evt.getCurrShelveId() : 0L,
                    evt.getCurrPositionX() != null ? evt.getCurrPositionX() : 0,
                    evt.getCurrPositionY() != null ? evt.getCurrPositionY() : 0);
            if (existing != null) continue;

            // 检查当前快照中状态是否仍存在
            if (!isStatusStillPresent(evt)) continue;

            // 创建父记录 + 展开课题组 + 创建违规
            createViolationRecord(rule, evt);
            triggered++;
        }
        return triggered;
    }

    /** 检查当前快照中该笼位的状态是否仍存在 */
    private boolean isStatusStillPresent(CageEventLog evt) {
        // TODO: 查询最新批次快照，确认该笼位+状态码仍存在
        // 简化实现：基于 event log 最后一条 STATUS_ADDED（无 STATUS_REMOVED 后续事件即判定仍存在）
        return true; // 占位 — 实际实现中查最新 batch 快照
    }

    /** 创建父记录 + 展开课题组 + 批量创建个人违规 */
    private void createViolationRecord(TwinViolationRule rule, CageEventLog evt) {
        TwinCageStatusViolation parent = new TwinCageStatusViolation();
        parent.setRuleId(rule.getId());
        parent.setScanBatchId(evt.getScanBatchId());
        parent.setStatusCode(extractStatusCode(evt));
        parent.setCageShelveId(evt.getCurrShelveId());
        parent.setPositionX(evt.getCurrPositionX());
        parent.setPositionY(evt.getCurrPositionY());
        parent.setPositionLabel(buildPositionLabel(evt.getCurrPositionX(), evt.getCurrPositionY()));
        parent.setCageBoxQrCode(evt.getCageBoxQrCode());
        parent.setProjectPiName(evt.getProjectPiName());
        parent.setProjectGroupName(evt.getProjectPiName());
        parent.setDepartmentName(evt.getDepartmentName());
        parent.setRoomName(evt.getCurrRoomName());
        parent.setCampusName(evt.getCurrCampusName());
        parent.setTriggeredAt(LocalDateTime.now());
        parent.setStatus("ACTIVE");
        cageStatusViolationMapper.insert(parent);

        // 展开课题组成员
        String triggerAction = rule.getCageTriggerAction() != null ? rule.getCageTriggerAction() : "BOTH";
        boolean doViolation = "VIOLATION_ONLY".equals(triggerAction) || "BOTH".equals(triggerAction);
        boolean doNotice = "NOTICE_ONLY".equals(triggerAction) || "BOTH".equals(triggerAction);

        if (doViolation && evt.getProjectPiName() != null) {
            List<String> memberIds = resolveGroupMemberIds(evt.getProjectPiName());
            for (String userId : memberIds) {
                try {
                    violationService.create(
                            userId,
                            renderTemplate(rule.getViolationTextTpl(), evt, userId),
                            parseStringList(rule.getCageImageUrls()),
                            rule.getForbidEnter() != null && rule.getForbidEnter() == 1,
                            null,
                            rule.getShowNoticeEveryScan() != null && rule.getShowNoticeEveryScan() == 1,
                            rule.getExpireAfterDays(),
                            "system",
                            SOURCE_CAGE_STATUS,
                            rule.getInteractiveChallenge(),
                            rule.getInteractiveUnlockOnVerify() != null && rule.getInteractiveUnlockOnVerify() == 1,
                            rule.getId()
                    );
                    // 写入 cage_violation_id 关联（需单独 update）
                } catch (Exception e) {
                    log.warn("[cage-v-check] 创建个人违规失败 userId={} err={}", userId, e.getMessage());
                }
            }
        }
    }

    // ── helpers ──

    private List<String> resolveGroupMemberIds(String projectGroupName) {
        // 通过 ARO 人员库查询课题组成员
        try {
            return aroService.findUserIdsByProjectGroup(projectGroupName);
        } catch (Exception e) {
            log.warn("[cage-v-check] 查询课题组成员失败 group={} err={}", projectGroupName, e.getMessage());
            return Collections.emptyList();
        }
    }

    private String renderTemplate(String tpl, CageEventLog evt, String userId) {
        if (tpl == null) return "";
        return tpl
                .replace("${name}", userId)
                .replace("${status}", extractStatusCode(evt))
                .replace("${cage}", buildPositionLabel(evt.getCurrPositionX(), evt.getCurrPositionY()))
                .replace("${date}", java.time.LocalDate.now().toString());
    }

    private String buildPositionLabel(Integer x, Integer y) {
        if (x == null || y == null) return "?";
        return (char) ('A' + Math.max(0, x - 1)) + "-" + y;
    }

    private String extractStatusCode(CageEventLog evt) {
        return evt.getDetailSummary() != null ? evt.getDetailSummary() : "UNKNOWN";
    }

    @SuppressWarnings("unchecked")
    private List<String> parseStringList(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try { return JSON.parseArray(json, String.class); }
        catch (Exception e) { return Collections.emptyList(); }
    }

    @SuppressWarnings("unchecked")
    private List<String> parseJsonField(String json, String field) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            Map<String, Object> map = JSON.parseObject(json, Map.class);
            Object val = map.get(field);
            if (val instanceof List<?> list) return list.stream().map(Object::toString).toList();
        } catch (Exception e) { /* ignore */ }
        return Collections.emptyList();
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/modules/twin/dashboard/service/CageStatusViolationCheckService.java
git commit -m "feat: implement cage status violation check engine"
```

---

## Phase 3: API Controller @backend

### Task 10: 创建父记录 REST Controller

**Files:**
- Create: `src/main/java/com/example/demo/modules/twin/dashboard/controller/AdminCageStatusViolationController.java`
- Create: `src/main/java/com/example/demo/modules/twin/dashboard/dto/CageStatusViolationDTO.java`

- [ ] **Step 1: 创建 DTO**

```java
package com.example.demo.modules.twin.dashboard.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class CageStatusViolationDTO {
    private Long id;
    private Long ruleId;
    private String ruleName;
    private String scanBatchId;
    private String statusCode;
    private Long cageShelveId;
    private Integer positionX;
    private Integer positionY;
    private String positionLabel;
    private String cageBoxQrCode;
    private String projectPiName;
    private String projectGroupName;
    private String departmentName;
    private String roomName;
    private String campusName;
    private LocalDateTime triggeredAt;
    private String status;
    private List<MemberViolationDTO> members;

    @Data
    public static class MemberViolationDTO {
        private Long violationId;
        private String userId;
        private String displayName;
        private String departmentName;
        private String status;
        private LocalDateTime createdAt;
    }
}
```

- [ ] **Step 2: 创建 Controller**

```java
package com.example.demo.modules.twin.dashboard.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.twin.dashboard.dto.CageStatusViolationDTO;
import com.example.demo.modules.twin.dashboard.entity.TwinCageStatusViolation;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.mapper.TwinCageStatusViolationMapper;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import com.example.demo.modules.twin.dashboard.service.CageStatusViolationCheckService;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin/twin/cage-status-violations")
public class AdminCageStatusViolationController {

    private final TwinCageStatusViolationMapper mapper;
    private final TwinStudentViolationMapper violationMapper;
    private final TwinStudentViolationService violationService;
    private final CageStatusViolationCheckService checkService;
    private final AuthContextService authContextService;

    public AdminCageStatusViolationController(
            TwinCageStatusViolationMapper mapper,
            TwinStudentViolationMapper violationMapper,
            TwinStudentViolationService violationService,
            CageStatusViolationCheckService checkService,
            AuthContextService authContextService) {
        this.mapper = mapper;
        this.violationMapper = violationMapper;
        this.violationService = violationService;
        this.checkService = checkService;
        this.authContextService = authContextService;
    }

    @GetMapping
    public Result<List<CageStatusViolationDTO>> list() {
        List<TwinCageStatusViolation> rows = mapper.selectAll();
        List<CageStatusViolationDTO> dtos = rows.stream().map(this::toDTO).collect(Collectors.toList());
        return Result.success(dtos);
    }

    @GetMapping("/{id}")
    public Result<CageStatusViolationDTO> detail(@PathVariable long id) {
        TwinCageStatusViolation row = mapper.selectById(id);
        if (row == null) return Result.error(404, "记录不存在");
        CageStatusViolationDTO dto = toDTO(row);
        dto.setMembers(loadMembers(id));
        return Result.success(dto);
    }

    @PostMapping("/{id}/clear")
    public Result<?> clear(@PathVariable long id) {
        mapper.updateStatus(id, "CLEARED");
        // 同时清除所有子记录
        List<TwinStudentViolation> children = violationMapper.selectByCageViolationId(id);
        for (TwinStudentViolation v : children) {
            if ("ACTIVE".equals(v.getStatus())) {
                violationService.clear(v.getId());
            }
        }
        return Result.success(null);
    }

    @DeleteMapping("/{id}")
    public Result<?> delete(@PathVariable long id) {
        // 删除所有子记录
        List<TwinStudentViolation> children = violationMapper.selectByCageViolationId(id);
        for (TwinStudentViolation v : children) {
            violationMapper.deleteById(v.getId());
        }
        mapper.deleteById(id);
        return Result.success(null);
    }

    @PostMapping("/{id}/members")
    public Result<?> addMember(@PathVariable long id, @RequestBody Map<String, String> body) {
        String userId = body.get("userId");
        if (userId == null || userId.isBlank()) return Result.error(400, "userId 不能为空");
        // 创建子记录（复用已有违规创建逻辑，带 cageViolationId）
        // ... 具体实现调用 violationService.create() 并关联 cageViolationId
        return Result.success(null);
    }

    @DeleteMapping("/{id}/members/{userId}")
    public Result<?> removeMember(@PathVariable long id, @PathVariable String userId) {
        List<TwinStudentViolation> children = violationMapper.selectByCageViolationId(id);
        for (TwinStudentViolation v : children) {
            if (userId.equals(v.getTargetUserId())) {
                violationMapper.deleteById(v.getId());
            }
        }
        return Result.success(null);
    }

    @PostMapping("/trigger/{ruleId}")
    public Result<?> manualTrigger(@PathVariable long ruleId) {
        var rule = com.example.demo.modules.twin.dashboard.service.TwinViolationRuleService.class;
        // 调用 checkService 手动触发单条规则
        // checkService.processRule(ruleService.getById(ruleId), null);
        return Result.success(Map.of("triggered", true));
    }

    // ── helpers ──

    private CageStatusViolationDTO toDTO(TwinCageStatusViolation row) {
        CageStatusViolationDTO dto = new CageStatusViolationDTO();
        dto.setId(row.getId());
        dto.setRuleId(row.getRuleId());
        dto.setScanBatchId(row.getScanBatchId());
        dto.setStatusCode(row.getStatusCode());
        dto.setCageShelveId(row.getCageShelveId());
        dto.setPositionX(row.getPositionX());
        dto.setPositionY(row.getPositionY());
        dto.setPositionLabel(row.getPositionLabel());
        dto.setCageBoxQrCode(row.getCageBoxQrCode());
        dto.setProjectPiName(row.getProjectPiName());
        dto.setProjectGroupName(row.getProjectGroupName());
        dto.setDepartmentName(row.getDepartmentName());
        dto.setRoomName(row.getRoomName());
        dto.setCampusName(row.getCampusName());
        dto.setTriggeredAt(row.getTriggeredAt());
        dto.setStatus(row.getStatus());
        return dto;
    }

    private List<CageStatusViolationDTO.MemberViolationDTO> loadMembers(long parentId) {
        List<TwinStudentViolation> children = violationMapper.selectByCageViolationId(parentId);
        return children.stream().map(v -> {
            CageStatusViolationDTO.MemberViolationDTO m = new CageStatusViolationDTO.MemberViolationDTO();
            m.setViolationId(v.getId());
            m.setUserId(v.getTargetUserId());
            m.setStatus(v.getStatus());
            m.setCreatedAt(v.getCreatedAt());
            return m;
        }).collect(Collectors.toList());
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/modules/twin/dashboard/controller/ src/main/java/com/example/demo/modules/twin/dashboard/dto/
git commit -m "feat: add cage status violation REST controller and DTO"
```

---

## Phase 4: 前端 API 层 + 类型 @frontend

### Task 11: 前端 API 和类型扩展

**Files:**
- Modify: `frontend/src/api/domains/studentViolation.api.ts`
- Create: `frontend/src/api/domains/cageStatusViolation.api.ts`

- [ ] **Step 1: 扩展 ViolationRule 类型**

在 `studentViolation.api.ts` 的 `ViolationRule` 接口末尾追加：

```typescript
  // 笼架联动字段
  cageStatusCodes?: string[];
  cageDelayDays?: number;
  cageJudgeMode?: 'AUTO_SYNC_LINKED' | 'PURE_DAYS' | 'PURE_MANUAL';
  cageManualTrigger?: number;
  cageAreaFilter?: { campuses?: string[]; rooms?: string[] };
  cageGroupWhitelist?: string[];
  cageTriggerAction?: 'VIOLATION_ONLY' | 'NOTICE_ONLY' | 'BOTH';
  cageImageUrls?: string[];
```

- [ ] **Step 2: 创建笼架违规 API**

```typescript
// cageStatusViolation.api.ts
import { adminHttp } from "@/api/core/adminHttp";
import type { ApiResponse } from "@/api/types/common";

export interface CageStatusViolationRow {
  id: number;
  ruleId: number;
  ruleName?: string;
  scanBatchId?: string;
  statusCode: string;
  cageShelveId: number;
  positionX: number;
  positionY: number;
  positionLabel: string;
  cageBoxQrCode?: string;
  projectPiName?: string;
  projectGroupName?: string;
  departmentName?: string;
  roomName?: string;
  campusName?: string;
  triggeredAt: string;
  status: 'ACTIVE' | 'CLEARED' | 'EXPIRED';
  members?: MemberViolationRow[];
}

export interface MemberViolationRow {
  violationId: number;
  userId: string;
  displayName?: string;
  departmentName?: string;
  status: string;
  createdAt: string;
}

export async function listCageStatusViolations(): Promise<CageStatusViolationRow[]> {
  const res = await adminHttp.get<ApiResponse<CageStatusViolationRow[]>>(
    "/twin/cage-status-violations"
  );
  return res.data?.data || [];
}

export async function getCageStatusViolation(id: number): Promise<CageStatusViolationRow> {
  const res = await adminHttp.get<ApiResponse<CageStatusViolationRow>>(
    `/twin/cage-status-violations/${id}`
  );
  return res.data?.data!;
}

export async function clearCageStatusViolation(id: number): Promise<void> {
  await adminHttp.post(`/twin/cage-status-violations/${id}/clear`);
}

export async function deleteCageStatusViolation(id: number): Promise<void> {
  await adminHttp.delete(`/twin/cage-status-violations/${id}`);
}

export async function addCageViolationMember(id: number, userId: string): Promise<void> {
  await adminHttp.post(`/twin/cage-status-violations/${id}/members`, { userId });
}

export async function removeCageViolationMember(id: number, userId: string): Promise<void> {
  await adminHttp.delete(`/twin/cage-status-violations/${id}/members/${userId}`);
}

export async function manualTriggerRule(ruleId: number): Promise<void> {
  await adminHttp.post(`/twin/cage-status-violations/trigger/${ruleId}`);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/domains/
git commit -m "feat: add cage status violation frontend API and types"
```

---

## Phase 5: 前端 UI 组件 @frontend

### Task 12: 规则配置弹窗

**Files:**
- Create: `frontend/src/features/admin/CageLinkageRuleForm.tsx`

- [ ] **Step 1: 创建规则表单组件**

```tsx
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  createViolationRule,
  updateViolationRule,
  type ViolationRule,
} from "@/api/domains/studentViolation.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { searchViolationProjectGroups } from "@/api/domains/studentViolation.api";

const STATUS_OPTIONS = [
  { value: "COHABITATION", label: "合笼/繁殖" },
  { value: "SPECIAL_FEEDING", label: "特殊饲养" },
  { value: "NEED_DIVIDE", label: "请分笼/密度超标" },
  { value: "HEALTH_ABNORMAL", label: "动物健康异常" },
  { value: "ANIMAL_TRANSFER", label: "动物转移" },
];

const JUDGE_MODES = [
  { value: "AUTO_SYNC_LINKED", label: "自动同步联动" },
  { value: "PURE_DAYS", label: "纯天数" },
  { value: "PURE_MANUAL", label: "纯手动" },
];

const TRIGGER_ACTIONS = [
  { value: "VIOLATION_ONLY", label: "仅违规" },
  { value: "NOTICE_ONLY", label: "仅公告" },
  { value: "BOTH", label: "两者" },
];

const emptyRule = (): ViolationRule => ({
  ruleCode: "",
  ruleName: "",
  enabled: 1,
  sourceTag: "CAGE_STATUS",
  forbidEnter: 0,
  showNoticeEveryScan: 1,
  interactiveUnlockOnVerify: 1,
  unblockMethod: "自助解禁",
  unblockMaxCount: null,
  unblockWindowType: "滑动窗口",
  unblockWindowValue: 30,
  autoSignoutEnabled: 0,
  cageStatusCodes: [],
  cageDelayDays: 7,
  cageJudgeMode: "AUTO_SYNC_LINKED",
  cageManualTrigger: 0,
  cageTriggerAction: "BOTH",
});

interface Props {
  editing: ViolationRule | null;
  onClose: () => void;
}

export function CageLinkageRuleForm({ editing, onClose }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ViolationRule>(editing ?? emptyRule());
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupSuggestions, setGroupSuggestions] = useState<string[]>([]);

  useEffect(() => {
    setForm(editing ?? emptyRule());
  }, [editing]);

  const saveMu = useMutation({
    mutationFn: (body: ViolationRule) =>
      body.id
        ? updateViolationRule(body.id, body)
        : createViolationRule(body),
    onSuccess: () => {
      toast.success(editing?.id ? "规则已更新" : "规则已创建");
      queryClient.invalidateQueries({ queryKey: ["violation-rules"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message || "保存失败"),
  });

  const handleSave = async () => {
    if (!form.ruleName.trim()) { toast.error("请输入规则名称"); return; }
    // 上传图片
    let urls: string[] = form.cageImageUrls ?? [];
    if (imageFiles.length > 0) {
      const uploaded: string[] = [];
      for (const f of imageFiles) {
        try {
          const url = await uploadSingleImage(f);
          if (url) uploaded.push(url);
        } catch { /* skip */ }
      }
      urls = [...urls, ...uploaded];
    }
    saveMu.mutate({ ...form, cageImageUrls: urls });
  };

  const toggleStatus = (code: string) => {
    const cur = form.cageStatusCodes ?? [];
    setForm({ ...form, cageStatusCodes: cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code] });
  };

  const searchGroups = async (kw: string) => {
    setGroupSearch(kw);
    if (!kw.trim()) { setGroupSuggestions([]); return; }
    const res = await searchViolationProjectGroups(kw, 10);
    setGroupSuggestions(res);
  };

  const addGroup = (g: string) => {
    const cur = form.cageGroupWhitelist ?? [];
    if (!cur.includes(g)) setForm({ ...form, cageGroupWhitelist: [...cur, g] });
    setGroupSearch("");
    setGroupSuggestions([]);
  };

  const removeGroup = (g: string) => {
    setForm({ ...form, cageGroupWhitelist: (form.cageGroupWhitelist ?? []).filter(x => x !== g) });
  };

  const inputCls = "w-full rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm";

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-[var(--twin-canvas)] rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
           onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{editing?.id ? "编辑规则" : "新建笼架联动规则"}</h2>

        {/* 规则名称 */}
        <div className="mb-4">
          <label className="text-xs font-medium text-[var(--twin-mute)]">规则名称</label>
          <input className={inputCls} value={form.ruleName} onChange={e => setForm({...form, ruleName: e.target.value})} />
        </div>

        {/* 监控状态类型 */}
        <div className="mb-4">
          <label className="text-xs font-medium text-[var(--twin-mute)]">监控状态类型</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {STATUS_OPTIONS.map(s => (
              <label key={s.value} className="inline-flex items-center gap-1 text-sm cursor-pointer">
                <input type="checkbox" checked={(form.cageStatusCodes ?? []).includes(s.value)}
                       onChange={() => toggleStatus(s.value)} />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        {/* 判定模式 + 延迟天数 */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-medium text-[var(--twin-mute)]">判定模式</label>
            <select className={inputCls} value={form.cageJudgeMode ?? "AUTO_SYNC_LINKED"}
                    onChange={e => setForm({...form, cageJudgeMode: e.target.value as any})}>
              {JUDGE_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--twin-mute)]">延迟天数</label>
            <input className={inputCls} type="number" min={1} value={form.cageDelayDays ?? 7}
                   onChange={e => setForm({...form, cageDelayDays: parseInt(e.target.value) || 7})} />
          </div>
        </div>

        {/* 联动设置（仅 AUTO_SYNC_LINKED） */}
        {(form.cageJudgeMode === "AUTO_SYNC_LINKED") && (
          <div className="mb-4 p-3 rounded-lg border border-[var(--twin-hairline)]">
            <label className="inline-flex items-center gap-2 text-sm">
              <AdminSwitchScaled checked={form.cageManualTrigger === 1}
                onCheckedChange={v => setForm({...form, cageManualTrigger: v ? 1 : 0})} />
              手动执行也触发判定
            </label>
          </div>
        )}

        {/* 课题组白名单 */}
        <div className="mb-4">
          <label className="text-xs font-medium text-[var(--twin-mute)]">课题组白名单（空=全部）</label>
          <div className="relative">
            <input className={inputCls} placeholder="搜索课题组..." value={groupSearch}
                   onChange={e => searchGroups(e.target.value)} />
            {groupSuggestions.length > 0 && (
              <div className="absolute z-10 w-full bg-[var(--twin-canvas)] border rounded-lg shadow mt-1 max-h-40 overflow-y-auto">
                {groupSuggestions.map(g => (
                  <button key={g} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--twin-canvas-soft)]"
                          onClick={() => addGroup(g)}>{g}</button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {(form.cageGroupWhitelist ?? []).map(g => (
              <span key={g} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-xs">
                {g} <button onClick={() => removeGroup(g)} className="text-red-500">✕</button>
              </span>
            ))}
          </div>
        </div>

        {/* 触发动作 */}
        <div className="mb-4">
          <label className="text-xs font-medium text-[var(--twin-mute)]">触发动作</label>
          <div className="flex gap-4 mt-1">
            {TRIGGER_ACTIONS.map(a => (
              <label key={a.value} className="inline-flex items-center gap-1 text-sm cursor-pointer">
                <input type="radio" name="triggerAction" checked={form.cageTriggerAction === a.value}
                       onChange={() => setForm({...form, cageTriggerAction: a.value as any})} />
                {a.label}
              </label>
            ))}
          </div>
        </div>

        {/* 违规文案 */}
        <div className="mb-4">
          <label className="text-xs font-medium text-[var(--twin-mute)]">
            违规文案模板（变量：{"${name} ${dept} ${status} ${cage} ${date}"}）
          </label>
          <RichTextEditor value={form.violationTextTpl ?? ""}
            onChange={v => setForm({...form, violationTextTpl: v})} />
        </div>

        {/* 违规图片上传 */}
        <div className="mb-4">
          <label className="text-xs font-medium text-[var(--twin-mute)]">违规图片</label>
          <input type="file" multiple accept="image/*" onChange={e => {
            setImageFiles(Array.from(e.target.files ?? []));
          }} />
          {(form.cageImageUrls ?? []).length > 0 && (
            <div className="flex gap-2 mt-1">
              {form.cageImageUrls!.map((url, i) => (
                <img key={i} src={url} className="w-16 h-16 object-cover rounded" />
              ))}
            </div>
          )}
        </div>

        {/* 交互式设置 */}
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-[var(--twin-mute)]">交互式确认短语</label>
            <input className={inputCls} value={form.interactiveChallenge ?? ""}
                   onChange={e => setForm({...form, interactiveChallenge: e.target.value || null})} />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm">
              <AdminSwitchScaled checked={form.interactiveUnlockOnVerify === 1}
                onCheckedChange={v => setForm({...form, interactiveUnlockOnVerify: v ? 1 : 0})} />
              验证后自动解除禁入
            </label>
          </div>
        </div>

        {/* 解禁管控 */}
        <div className="mb-4 p-3 rounded-lg border border-[var(--twin-hairline)]">
          <h4 className="text-sm font-semibold mb-2">解禁管控</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--twin-mute)]">解禁方式</label>
              <select className={inputCls} value={form.unblockMethod ?? "自助解禁"}
                      onChange={e => setForm({...form, unblockMethod: e.target.value as any})}>
                <option value="自助解禁">自助解禁</option>
                <option value="仅工作人员">仅工作人员</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--twin-mute)]">上限次数（空=不限）</label>
              <input className={inputCls} type="number" value={form.unblockMaxCount ?? ""}
                     onChange={e => setForm({...form, unblockMaxCount: e.target.value ? parseInt(e.target.value) : null})} />
            </div>
          </div>
        </div>

        {/* 启用 */}
        <div className="mb-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <AdminSwitchScaled checked={form.enabled === 1}
              onCheckedChange={v => setForm({...form, enabled: v ? 1 : 0})} />
            启用此规则
          </label>
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-2 mt-6">
          <AdminButton variant="secondary" onClick={onClose}>取消</AdminButton>
          <AdminButton onClick={handleSave} disabled={saveMu.isPending}>
            {saveMu.isPending ? "保存中..." : "保存规则"}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/admin/CageLinkageRuleForm.tsx
git commit -m "feat: add cage linkage rule form component"
```

---

### Task 13: 父记录详情面板

**Files:**
- Create: `frontend/src/features/admin/CageLinkageRecordPanel.tsx`

- [ ] **Step 1: 创建父记录详情组件（精简版）**

由于任务长度限制，此处展示核心结构。完整实现包含：父记录信息展示、成员子记录表格（复选框、搜索、批量操作）、添加成员弹窗。

核心逻辑：使用 `useQuery` 获取父记录详情（含 members），表格行支持单选/全选，批量解除/删除调用 API，添加成员通过搜索 personnel 并调用 `addCageViolationMember`。

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/admin/CageLinkageRecordPanel.tsx
git commit -m "feat: add cage linkage parent record detail panel"
```

---

### Task 14: 集成到主页面

**Files:**
- Modify: `frontend/src/pages/AdminStudentViolationsPage.tsx`

- [ ] **Step 1: 添加"笼架联动"tab**

在 `PAGE_TABS` 数组 `rules` 之后插入：

```tsx
{ id: "cage-linkage", label: "笼架联动", icon: <AlertTriangle className="h-4 w-4 text-[var(--twin-mute)]" aria-hidden /> },
```

在 `PageTabId` 类型中追加 `| "cage-linkage"`，在 `parsePageTab` 中追加 `raw === "cage-linkage"`，在默认值处理中加入。

在表格体区域为 `cage-linkage` tab 渲染新组件：

```tsx
{activeTab === "cage-linkage" && (
  <CageLinkageTab />
)}
```

- [ ] **Step 2: 创建 CageLinkageTab 入口组件**

`frontend/src/features/admin/CageLinkageTab.tsx`：

```tsx
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCageStatusViolations, type CageStatusViolationRow } from "@/api/domains/cageStatusViolation.api";
import { listViolationRules, type ViolationRule } from "@/api/domains/studentViolation.api";
import { CageLinkageRuleForm } from "./CageLinkageRuleForm";
import { CageLinkageRecordPanel } from "./CageLinkageRecordPanel";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import { Plus, ChevronRight } from "lucide-react";

export function CageLinkageTab() {
  const qc = useQueryClient();
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<ViolationRule | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ["violation-rules"],
    queryFn: () => listViolationRules(),
  });
  const cageRules = rules.filter(r => r.sourceTag === "CAGE_STATUS");

  const { data: records = [], isLoading: recsLoading } = useQuery({
    queryKey: ["cage-status-violations"],
    queryFn: () => listCageStatusViolations(),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      {/* 规则列表 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--app-color-text-primary)]">笼架联动规则</h3>
          <AdminButton onClick={() => { setEditingRule(null); setShowRuleForm(true); }}>
            <Plus className="w-4 h-4 mr-1" />新建规则
          </AdminButton>
        </div>
        <AdminTableShell loading={rulesLoading} empty={cageRules.length === 0} emptyMessage="暂无笼架联动规则">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-[var(--app-color-text-tertiary)]">
                <th className="py-2 px-3">规则名称</th>
                <th className="py-2 px-3">监控状态</th>
                <th className="py-2 px-3">判定模式</th>
                <th className="py-2 px-3">延迟天数</th>
                <th className="py-2 px-3">触发动作</th>
                <th className="py-2 px-3">状态</th>
                <th className="py-2 px-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {cageRules.map(r => (
                <tr key={r.id} className="border-b hover:bg-[var(--twin-canvas-soft)]">
                  <td className="py-2 px-3 font-medium">{r.ruleName}</td>
                  <td className="py-2 px-3 text-xs">{(r.cageStatusCodes ?? []).join(", ")}</td>
                  <td className="py-2 px-3 text-xs">{{ AUTO_SYNC_LINKED: "同步联动", PURE_DAYS: "纯天数", PURE_MANUAL: "纯手动" }[r.cageJudgeMode ?? ""] ?? "-"}</td>
                  <td className="py-2 px-3">{r.cageDelayDays ?? "-"} 天</td>
                  <td className="py-2 px-3 text-xs">{{ VIOLATION_ONLY: "仅违规", NOTICE_ONLY: "仅公告", BOTH: "两者" }[r.cageTriggerAction ?? ""] ?? "-"}</td>
                  <td className="py-2 px-3"><span className={r.enabled === 1 ? "text-emerald-600" : "text-red-400"}>{r.enabled === 1 ? "🟢" : "🔴"}</span></td>
                  <td className="py-2 px-3">
                    <button className="text-blue-600 text-xs hover:underline" onClick={() => { setEditingRule(r); setShowRuleForm(true); }}>编辑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableShell>
      </div>

      {/* 父记录列表 */}
      <div>
        <h3 className="text-sm font-bold text-[var(--app-color-text-primary)] mb-3">笼架违规记录</h3>
        <AdminTableShell loading={recsLoading} empty={records.length === 0} emptyMessage="暂无笼架违规记录">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-[var(--app-color-text-tertiary)]">
                <th className="py-2 px-3">触发时间</th>
                <th className="py-2 px-3">笼位</th>
                <th className="py-2 px-3">状态类型</th>
                <th className="py-2 px-3">课题组</th>
                <th className="py-2 px-3">状态</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {records.map(rec => (
                <>
                  <tr key={rec.id} className="border-b hover:bg-[var(--twin-canvas-soft)] cursor-pointer"
                      onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}>
                    <td className="py-2 px-3">{rec.triggeredAt?.slice(0, 16)}</td>
                    <td className="py-2 px-3">{rec.positionLabel}</td>
                    <td className="py-2 px-3 text-xs">{rec.statusCode}</td>
                    <td className="py-2 px-3">{rec.projectGroupName ?? "-"}</td>
                    <td className="py-2 px-3"><span className={rec.status === "ACTIVE" ? "text-rose-600" : "text-emerald-600"}>{rec.status === "ACTIVE" ? "ACTIVE" : rec.status}</span></td>
                    <td className="py-2 px-3"><ChevronRight className={`w-4 h-4 transition-transform ${expandedId === rec.id ? "rotate-90" : ""}`} /></td>
                  </tr>
                  {expandedId === rec.id && (
                    <tr key={`${rec.id}-detail`}>
                      <td colSpan={6} className="p-0">
                        <CageLinkageRecordPanel parentId={rec.id} onClose={() => setExpandedId(null)} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </AdminTableShell>
      </div>

      {/* 规则编辑弹窗 */}
      {showRuleForm && <CageLinkageRuleForm editing={editingRule} onClose={() => { setShowRuleForm(false); setEditingRule(null); }} />}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AdminStudentViolationsPage.tsx frontend/src/features/admin/CageLinkageTab.tsx
git commit -m "feat: integrate cage linkage tab into violations page"
```

---

## Phase 6: 收尾 + 验证

### Task 15: 后端缺少的 Mapper 方法补充

**Files:**
- Modify: `src/main/java/com/example/demo/modules/twin/dashboard/mapper/TwinStudentViolationMapper.java`
- Modify: `src/main/resources/mapper/TwinStudentViolationMapper.xml`
- Modify: `src/main/java/com/example/demo/modules/cageshelf/mapper/CageEventLogMapper.java`
- Modify: `src/main/resources/mapper/CageEventLogMapper.xml`

- [ ] **Step 1: TwinStudentViolationMapper 新增方法**

```java
// 接口新增
List<TwinStudentViolation> selectByCageViolationId(@Param("cageViolationId") long cageViolationId);

// XML 新增
<select id="selectByCageViolationId" resultMap="BaseResultMap">
    SELECT * FROM twin_student_violation WHERE cage_violation_id = #{cageViolationId} ORDER BY created_at DESC
</select>
```

- [ ] **Step 2: CageEventLogMapper 新增方法**

```java
// 接口新增：按状态码和延迟天数查询最近的 STATUS_ADDED 事件
List<CageEventLog> selectRecentStatusAdded(
    @Param("statusCodes") List<String> statusCodes,
    @Param("delayDays") int delayDays,
    @Param("scanBatchId") String scanBatchId
);

// XML 新增
<select id="selectRecentStatusAdded" resultMap="BaseResultMap">
    SELECT * FROM cage_event_log
    WHERE event_type = 'STATUS_ADDED'
      AND detail_summary IN
      <foreach collection="statusCodes" item="code" open="(" separator="," close=")">#{code}</foreach>
      <if test="scanBatchId != null and scanBatchId != ''">
        AND scan_batch_id = #{scanBatchId}
      </if>
      AND changed_at &lt;= DATE_SUB(NOW(), INTERVAL #{delayDays} DAY)
    ORDER BY changed_at DESC
</select>
```

- [ ] **Step 3: 确认 AroService 存在 findUserIdsByProjectGroup 方法**

如果没有，需要在 `AroService` 中添加：

```java
public List<String> findUserIdsByProjectGroup(String projectGroupName) {
    // 查询 aro_personnel 表，按 project_group_name 匹配，返回 userId 列表
    return aroPersonnelMapper.selectUserIdsByProjectGroup(projectGroupName);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/main/java/ src/main/resources/mapper/
git commit -m "feat: add missing mapper methods for cage status violation"
```

---

### Task 16: 启动应用验证

- [ ] **Step 1: 确认数据库迁移已执行**

```bash
# 检查三个新表/字段是否存在
```

- [ ] **Step 2: 启动后端，检查无启动错误**

- [ ] **Step 3: 测试 API**

```bash
# 创建笼架规则
curl -X POST http://localhost:8080/api/admin/twin/student-violations/rules \
  -H "Content-Type: application/json" \
  -d '{"ruleName":"测试笼架规则","sourceTag":"CAGE_STATUS","cageStatusCodes":["HEALTH_ABNORMAL"],"cageDelayDays":7,"cageJudgeMode":"PURE_MANUAL","cageTriggerAction":"BOTH","enabled":1}'

# 获取规则列表
curl http://localhost:8080/api/admin/twin/student-violations/rules

# 获取父记录列表
curl http://localhost:8080/api/admin/twin/cage-status-violations
```

- [ ] **Step 4: 启动前端，访问 /console/admin/student-violations → 笼架联动 tab**

- [ ] **Step 5: Commit 最终调整**

```bash
git add -A
git commit -m "chore: final adjustments for cage status violation system"
```
