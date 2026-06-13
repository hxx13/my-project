# 填报报表新模块 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在全新路径与包名下实现「填报报表」模块：Word 式表格设计器 → 发布 → 独立填报中心。与旧 SmartSheet 零耦合。

**Architecture:** 前端 `features/report-form` (6页+14组件+3hooks)，后端 `modules/reportform` (2Controller+4Service+3Mapper+3Entity)，数据库 `report_form_*` 4表。双入口 `/admin/report-form` (管理) + `/admin/report-fill` (填报)。格驱动模型（cells[] + fields{}），发布时版本快照，协同/个人双模式。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Radix UI + Vite · Spring Boot 3.5 + MyBatis + MySQL 8.0 + JDK 17 + Apache POI

---

## 并行执行策略

```
Phase 0: 🔗 脚手架（FE 和 BE 可并行）
  ├─ 🟢 BE Agent: Task 0.1 DDL → Task 0.2 包骨架 → Task 0.3 权限种子
  └─ 🔵 FE Agent: Task 0.4 目录+types → Task 0.6 nav注册 → Task 0.5 路由注册 → Task 0.7 移除旧路由

Phase 1: 🔗 导入+设计器（FE 和 BE 可并行）
  ├─ 🟢 BE Agent: Task 1.1 POI导入 → Task 1.6 保存API
  └─ 🔵 FE Agent: Task 1.2~1.5 编辑器+面板 → Task 1.6 对接API

Phase 2: 🔗 主题+选项集+发布（FE 和 BE 可并行）
  ├─ 🟢 BE Agent: Task 2.1 API → Task 2.5 publish/unpublish → Task 2.6 兼容
  └─ 🔵 FE Agent: Task 2.1 管理页 → Task 2.2~2.4 面板+向导

Phase 3: 🔗 填报中心+留痕（FE 和 BE 可并行）
  ├─ 🟢 BE Agent: Task 3.4 submission API → Task 3.6 窗口+调度
  └─ 🔵 FE Agent: Task 3.1~3.3 页面+渲染 → Task 3.5 提交管理

Phase 4: 🔗 导出+打印（FE 和 BE 可并行）
  ├─ 🟢 BE Agent: Task 4.1~4.4 导出引擎 → Task 4.6 远程接口
  └─ 🔵 FE Agent: Task 4.5 模板管理UI

Phase 5: 🔗 模板+FILE/IMAGE（FE 和 BE 可并行）
  ├─ 🟢 BE Agent: Task 5.1~5.3 后端
  └─ 🔵 FE Agent: Task 5.2~5.5 前端

Phase 6: 归档+清理（顺序执行，先 FE 后 BE）
```

---

## Phase 0 — 脚手架

### Task 0.1: 数据库 DDL + bootstrap

**Files:**
- Create: `scripts/report_form.ddl.sql`
- Create: `src/main/resources/schema.sql` (append)
- Modify: `src/main/java/com/example/demo/common/bootstrap/EmbeddedTwinSystemCoreDdlBootstrap.java`

**端:** 🟢 BE

- [ ] **Step 1: 编写 report_form.ddl.sql**

```sql
-- scripts/report_form.ddl.sql
-- 填报报表模块 — 4 张新表

CREATE TABLE IF NOT EXISTS `report_form_definition` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `name` VARCHAR(255) NOT NULL COMMENT '报表名称',
  `description` VARCHAR(1000) DEFAULT NULL COMMENT '描述',
  `status` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft|published|archived',
  `layout_json` MEDIUMTEXT COMMENT '网格 cells[] + fields{}',
  `theme_json` MEDIUMTEXT COMMENT '表头/斑马纹/边框/字体/行列尺寸',
  `fill_policy_json` MEDIUMTEXT COMMENT 'mode+submitLabel+allowEditAfterSubmit',
  `permission_json` MEDIUMTEXT COMMENT 'visibleRoles[]+fieldRoleBindings{}',
  `schedule_json` MEDIUMTEXT COMMENT 'period(daily/weekly/monthly)+timeWindow',
  `word_template_ids_json` JSON DEFAULT NULL COMMENT '绑定的Word打印模板',
  `version_snapshots_json` MEDIUMTEXT COMMENT '发布历史快照数组',
  `created_by` VARCHAR(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` VARCHAR(64) DEFAULT NULL COMMENT '最后编辑人',
  `published_by` VARCHAR(64) DEFAULT NULL COMMENT '发布人',
  `published_at` DATETIME DEFAULT NULL COMMENT '发布时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_report_form_status` (`status`),
  KEY `idx_report_form_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='填报报表模板';

CREATE TABLE IF NOT EXISTS `report_form_submission` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `form_id` BIGINT NOT NULL COMMENT 'FK→definition',
  `user_id` BIGINT NOT NULL COMMENT '填写人ID，协同模式=0',
  `status` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft|submitted',
  `field_values_json` MEDIUMTEXT COMMENT '{fieldKey:value}',
  `version` INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  `submitted_at` DATETIME DEFAULT NULL COMMENT '提交时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_form_user` (`form_id`, `user_id`),
  KEY `idx_submission_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='填报记录';

CREATE TABLE IF NOT EXISTS `report_form_submission_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `submission_id` BIGINT NOT NULL COMMENT 'FK→submission',
  `user_id` BIGINT NOT NULL COMMENT '操作人',
  `action` VARCHAR(16) NOT NULL COMMENT 'save|submit',
  `field_values_snapshot_json` MEDIUMTEXT COMMENT '当时数据快照',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_log_submission` (`submission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提交日志';

CREATE TABLE IF NOT EXISTS `report_form_option_set` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `name` VARCHAR(255) NOT NULL COMMENT '选项集名称',
  `scope` VARCHAR(16) NOT NULL DEFAULT 'global' COMMENT 'global|form',
  `form_id` BIGINT DEFAULT NULL COMMENT '表单私有选项集',
  `items_json` MEDIUMTEXT NOT NULL COMMENT '[{label,sortOrder}]',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_opt_scope` (`scope`),
  KEY `idx_opt_form` (`form_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='选项集';
```

- [ ] **Step 2: 追加到 schema.sql**

在 `src/main/resources/schema.sql` 末尾添加：

```sql
-- 填报报表模块
SOURCE scripts/report_form.ddl.sql;
```

- [ ] **Step 3: 追加到 EmbeddedTwinSystemCoreDdlBootstrap**

在 `EmbeddedTwinSystemCoreDdlBootstrap.java` 的 `run()` 方法末尾添加：

```java
// 填报报表模块 — 4 表
executeResource(jdbcTemplate, "scripts/report_form.ddl.sql");
```

- [ ] **Step 4: 执行 DDL 验证**

```bash
# 启动应用，检查日志
# 预期: [report-form-ddl] 4 张表创建成功
```

- [ ] **Step 5: Commit**

```bash
git add scripts/report_form.ddl.sql src/main/resources/schema.sql \
  src/main/java/com/example/demo/common/bootstrap/EmbeddedTwinSystemCoreDdlBootstrap.java
git commit -m "feat(report-form): add report_form_* DDL (4 tables) + bootstrap"
```

---

### Task 0.2: 后端包骨架

**Files:**
- Create: `src/main/java/com/example/demo/modules/reportform/controller/ReportFormController.java`
- Create: `src/main/java/com/example/demo/modules/reportform/controller/ReportFillController.java`
- Create: `src/main/java/com/example/demo/modules/reportform/service/ReportFormService.java`
- Create: `src/main/java/com/example/demo/modules/reportform/service/ReportFillService.java`
- Create: `src/main/java/com/example/demo/modules/reportform/mapper/ReportFormDefinitionMapper.java`
- Create: `src/main/java/com/example/demo/modules/reportform/mapper/ReportFormSubmissionMapper.java`
- Create: `src/main/java/com/example/demo/modules/reportform/mapper/ReportFormOptionSetMapper.java`
- Create: `src/main/java/com/example/demo/modules/reportform/entity/ReportFormDefinition.java`
- Create: `src/main/java/com/example/demo/modules/reportform/entity/ReportFormSubmission.java`
- Create: `src/main/java/com/example/demo/modules/reportform/entity/ReportFormOptionSet.java`
- Create: `src/main/java/com/example/demo/modules/reportform/dto/ReportFormPageRequest.java`
- Create: `src/main/java/com/example/demo/modules/reportform/dto/ReportFormCreateRequest.java`
- Create: `src/main/java/com/example/demo/modules/reportform/dto/ReportFormUpdateRequest.java`

**端:** 🟢 BE

- [ ] **Step 1: 创建 Entity 类**

```java
// entity/ReportFormDefinition.java
package com.example.demo.modules.reportform.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReportFormDefinition {
    private Long id;
    private String name;
    private String description;
    private String status;           // draft | published | archived
    private String layoutJson;
    private String themeJson;
    private String fillPolicyJson;
    private String permissionJson;
    private String scheduleJson;
    private String wordTemplateIdsJson;
    private String versionSnapshotsJson;
    private String createdBy;
    private String updatedBy;
    private String publishedBy;
    private LocalDateTime publishedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

```java
// entity/ReportFormSubmission.java
package com.example.demo.modules.reportform.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReportFormSubmission {
    private Long id;
    private Long formId;
    private Long userId;
    private String status;           // draft | submitted
    private String fieldValuesJson;
    private Integer version;
    private LocalDateTime submittedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

```java
// entity/ReportFormOptionSet.java
package com.example.demo.modules.reportform.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ReportFormOptionSet {
    private Long id;
    private String name;
    private String scope;            // global | form
    private Long formId;
    private String itemsJson;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

- [ ] **Step 2: 创建 Mapper 接口**

```java
// mapper/ReportFormDefinitionMapper.java
package com.example.demo.modules.reportform.mapper;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ReportFormDefinitionMapper {

    @Select("SELECT * FROM report_form_definition WHERE id = #{id}")
    ReportFormDefinition selectById(Long id);

    @Select("SELECT * FROM report_form_definition WHERE status != 'archived' ORDER BY created_at DESC")
    List<ReportFormDefinition> selectPage();

    @Insert("INSERT INTO report_form_definition (name, description, status, layout_json, theme_json, " +
            "fill_policy_json, permission_json, schedule_json, word_template_ids_json, " +
            "version_snapshots_json, created_by, updated_by) " +
            "VALUES (#{name}, #{description}, #{status}, #{layoutJson}, #{themeJson}, " +
            "#{fillPolicyJson}, #{permissionJson}, #{scheduleJson}, #{wordTemplateIdsJson}, " +
            "#{versionSnapshotsJson}, #{createdBy}, #{updatedBy})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ReportFormDefinition entity);

    @Update("UPDATE report_form_definition SET name=#{name}, description=#{description}, " +
            "layout_json=#{layoutJson}, theme_json=#{themeJson}, fill_policy_json=#{fillPolicyJson}, " +
            "permission_json=#{permissionJson}, schedule_json=#{scheduleJson}, " +
            "word_template_ids_json=#{wordTemplateIdsJson}, updated_by=#{updatedBy} " +
            "WHERE id=#{id}")
    int update(ReportFormDefinition entity);

    @Update("UPDATE report_form_definition SET status=#{status}, published_by=#{publishedBy}, " +
            "published_at=#{publishedAt}, version_snapshots_json=#{versionSnapshotsJson}, " +
            "updated_by=#{updatedBy} WHERE id=#{id}")
    int updateStatus(ReportFormDefinition entity);

    @Delete("DELETE FROM report_form_definition WHERE id=#{id}")
    int deleteById(Long id);
}
```

```java
// mapper/ReportFormSubmissionMapper.java
package com.example.demo.modules.reportform.mapper;

import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ReportFormSubmissionMapper {

    @Select("SELECT * FROM report_form_submission WHERE id = #{id}")
    ReportFormSubmission selectById(Long id);

    @Select("SELECT * FROM report_form_submission WHERE form_id = #{formId} AND user_id = #{userId}")
    ReportFormSubmission selectByFormAndUser(@Param("formId") Long formId, @Param("userId") Long userId);

    @Select("SELECT * FROM report_form_submission WHERE form_id = #{formId}")
    List<ReportFormSubmission> selectByFormId(Long formId);

    @Insert("INSERT INTO report_form_submission (form_id, user_id, status, field_values_json, version) " +
            "VALUES (#{formId}, #{userId}, #{status}, #{fieldValuesJson}, #{version})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ReportFormSubmission entity);

    @Update("UPDATE report_form_submission SET field_values_json=#{fieldValuesJson}, " +
            "version=version+1, status=#{status}, updated_at=NOW() " +
            "WHERE id=#{id} AND version=#{version}")
    int updateWithVersion(ReportFormSubmission entity);  // 返回受影响行数，0=冲突

    @Update("UPDATE report_form_submission SET status='submitted', submitted_at=NOW(), " +
            "updated_at=NOW() WHERE id=#{id}")
    int submit(Long id);
}
```

```java
// mapper/ReportFormOptionSetMapper.java
package com.example.demo.modules.reportform.mapper;

import com.example.demo.modules.reportform.entity.ReportFormOptionSet;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ReportFormOptionSetMapper {

    @Select("SELECT * FROM report_form_option_set WHERE id = #{id}")
    ReportFormOptionSet selectById(Long id);

    @Select("SELECT * FROM report_form_option_set WHERE scope = 'global' OR form_id = #{formId}")
    List<ReportFormOptionSet> selectByScope(@Param("formId") Long formId);

    @Insert("INSERT INTO report_form_option_set (name, scope, form_id, items_json) " +
            "VALUES (#{name}, #{scope}, #{formId}, #{itemsJson})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ReportFormOptionSet entity);

    @Update("UPDATE report_form_option_set SET name=#{name}, items_json=#{itemsJson} WHERE id=#{id}")
    int update(ReportFormOptionSet entity);

    @Delete("DELETE FROM report_form_option_set WHERE id=#{id}")
    int deleteById(Long id);

    @Select("SELECT COUNT(*) FROM report_form_option_set WHERE id=#{id}")
    int countById(Long id);

    @Select("SELECT COUNT(*) FROM report_form_definition WHERE " +
            "JSON_CONTAINS(layout_json, JSON_OBJECT('optionSetId', CAST(#{id} AS CHAR)), '$.fields')")
    int countFieldRefsByOptionSetId(Long id);
}
```

- [ ] **Step 3: 创建 Controller 骨架**

```java
// controller/ReportFormController.java
package com.example.demo.modules.reportform.controller;

import com.example.demo.common.pojo.Result;
import com.example.demo.modules.reportform.service.ReportFormService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/report-form")
public class ReportFormController {

    private final ReportFormService reportFormService;

    public ReportFormController(ReportFormService reportFormService) {
        this.reportFormService = reportFormService;
    }

    @GetMapping("/forms/page")
    public Result<?> page() {
        return Result.success(reportFormService.page());
    }

    @GetMapping("/forms/{id}")
    public Result<?> getById(@PathVariable Long id) {
        return Result.success(reportFormService.getById(id));
    }
}
```

```java
// controller/ReportFillController.java
package com.example.demo.modules.reportform.controller;

import com.example.demo.common.pojo.Result;
import com.example.demo.modules.reportform.service.ReportFillService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/report-fill")
public class ReportFillController {

    private final ReportFillService reportFillService;

    public ReportFillController(ReportFillService reportFillService) {
        this.reportFillService = reportFillService;
    }

    @GetMapping("/available")
    public Result<?> available() {
        return Result.success(reportFillService.getAvailable());
    }
}
```

- [ ] **Step 4: 创建 Service 骨架**

```java
// service/ReportFormService.java
package com.example.demo.modules.reportform.service;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.auth.service.AuthContextService;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class ReportFormService {

    private final ReportFormDefinitionMapper definitionMapper;
    private final AuthContextService authContextService;

    public ReportFormService(ReportFormDefinitionMapper definitionMapper,
                             AuthContextService authContextService) {
        this.definitionMapper = definitionMapper;
        this.authContextService = authContextService;
    }

    public List<ReportFormDefinition> page() {
        String role = authContextService.getCurrentUserRole();
        // ADMIN only — 返回所有非 archived 的表单
        return definitionMapper.selectPage();
    }

    public ReportFormDefinition getById(Long id) {
        return definitionMapper.selectById(id);
    }
}
```

```java
// service/ReportFillService.java
package com.example.demo.modules.reportform.service;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.auth.service.AuthContextService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class ReportFillService {

    private final ReportFormDefinitionMapper definitionMapper;
    private final AuthContextService authContextService;
    private final ObjectMapper objectMapper;

    public ReportFillService(ReportFormDefinitionMapper definitionMapper,
                             AuthContextService authContextService,
                             ObjectMapper objectMapper) {
        this.definitionMapper = definitionMapper;
        this.authContextService = authContextService;
        this.objectMapper = objectMapper;
    }

    public List<ReportFormDefinition> getAvailable() {
        String role = authContextService.getCurrentUserRole();
        Long userId = authContextService.getCurrentUserId();
        List<ReportFormDefinition> all = definitionMapper.selectPage();
        // 过滤：仅 published + 用户在 visibleRoles 中
        return all.stream()
            .filter(f -> "published".equals(f.getStatus()))
            .filter(f -> userHasAccess(f, role, userId))
            .collect(Collectors.toList());
    }

    private boolean userHasAccess(ReportFormDefinition form, String role, Long userId) {
        // 解析 permission_json.visibleRoles 和 visibleUserIds
        // 匹配 role 或 userId
        try {
            var perm = objectMapper.readTree(form.getPermissionJson());
            var roles = perm.get("visibleRoles");
            if (roles != null) {
                for (var r : roles) {
                    if (r.asText().equals(role)) return true;
                }
            }
            var userIds = perm.get("visibleUserIds");
            if (userIds != null) {
                for (var u : userIds) {
                    if (u.asLong() == userId) return true;
                }
            }
        } catch (Exception e) {
            return false;
        }
        return false;
    }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/example/demo/modules/reportform/
git commit -m "feat(report-form): add backend package skeleton — 2 Controllers, 2 Services, 3 Mappers, 3 Entities"
```

---

### Task 0.3: PagePermission 种子

**Files:**
- Modify: `src/main/java/com/example/demo/modules/pagepermission/config/PagePermissionSchemaMigrator.java`

**端:** 🟢 BE

- [ ] **Step 1: 添加双入口种子**

在 `PagePermissionSchemaMigrator.java` 的 `run()` 方法末尾（`}` 前）添加：

```java
// ========== 填报报表模块 ==========
try {
    jdbcTemplate.execute("""
            INSERT IGNORE INTO page_permission_item(
                platform, node_key, node_type, display_name, path_or_route, entry_source,
                min_role, default_min_role, enabled, parent_node_key, chain_key,
                auto_discovered, manual_override
            ) VALUES (
                'WEB', 'entry:web:admin:report-form', 'ENTRY', '填报报表管理', '/admin/report-form', 'sidebar',
                'ADMIN', 'ADMIN', 1, NULL, NULL,
                0, 0
            )
            """);
    jdbcTemplate.execute("""
            INSERT IGNORE INTO page_permission_item(
                platform, node_key, node_type, display_name, path_or_route, entry_source,
                min_role, default_min_role, enabled, parent_node_key, chain_key,
                auto_discovered, manual_override
            ) VALUES (
                'WEB', 'entry:web:admin:report-fill', 'ENTRY', '填报中心', '/admin/report-fill', 'sidebar',
                'STAFF', 'STAFF', 1, NULL, NULL,
                0, 0
            )
            """);
    log.info("[page-permission-schema] 已种子填报报表模块双入口: report-form + report-fill");
} catch (Exception e) {
    log.debug("[page-permission-schema] 填报报表入口种子跳过: {}", e.getMessage());
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/modules/pagepermission/config/PagePermissionSchemaMigrator.java
git commit -m "feat(report-form): seed report-form + report-fill page permission entries"
```

---

### Task 0.4: 前端目录 + 类型定义

**Files:**
- Create: `frontend/src/features/report-form/types.ts`
- Create: `frontend/src/features/report-form/api/reportForm.api.ts` (骨架)
- Create: `frontend/src/features/report-form/api/reportFill.api.ts` (骨架)

**端:** 🔵 FE

- [ ] **Step 1: 创建 types.ts**

```typescript
// frontend/src/features/report-form/types.ts

export type FormStatus = 'draft' | 'published' | 'archived';
export type FillMode = 'shared' | 'individual';
export type FieldType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT'
  | 'MULTI_SELECT' | 'DATETIME' | 'IMAGE' | 'FILE' | 'USER';
export type CellKind = 'static' | 'field';
export type CellAlign = 'left' | 'center' | 'right';
export type SchedulePeriod = 'manual' | 'daily' | 'weekly' | 'monthly';

export interface CellStyle {
  align: CellAlign;
  bold?: boolean;
  fontSize?: number;
  bg?: string;
  color?: string;
}

export interface GridCell {
  id: string;
  row: number;
  col: number;
  colSpan: number;
  rowSpan: number;
  kind: CellKind;
  staticText?: string;
  fieldKey?: string;
  style: CellStyle;
}

export interface FieldDefinition {
  type: FieldType;
  label: string;
  required?: boolean;
  editableInFill?: boolean;
  editableByRoles?: string[];
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  optionSetId?: string;
  options?: { label: string; value: string }[];
  props?: Record<string, unknown>;
}

export interface LayoutJson {
  cells: GridCell[];
  fields: Record<string, FieldDefinition>;
  mergeGroups: { cellIds: string[] }[];
}

export interface ThemeJson {
  headerBg: string;
  headerColor: string;
  headerFontSize: number;
  headerBold: boolean;
  headerAlign: CellAlign;
  zebraStripe: boolean;
  oddRowBg: string;
  evenRowBg: string;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  cellPadding: number;
  defaultFontSize: number;
  defaultAlign: CellAlign;
  columnWidths: Record<number, number>;
  rowHeights: Record<number, number>;
}

export interface FillPolicyJson {
  mode: FillMode;
  submitLabel: string;
  allowEditAfterSubmit: boolean;
}

export interface PermissionJson {
  visibleRoles: string[];
  visibleUserIds: number[];
  fieldRoleBindings: Record<string, { editableByRoles: string[] }>;
  allowUnboundView: boolean;
}

export interface ScheduleJson {
  period: SchedulePeriod;
  dayOfWeek?: number;     // weekly: 1=Mon..7=Sun
  dayOfMonth?: number;    // monthly: 1-28
  timeWindowStart?: string; // HH:mm
  timeWindowEnd?: string;   // HH:mm
  graceDays?: number;     // 过期宽限期
}

export interface WordTemplateBinding {
  id: string;
  name: string;
  bookmarkMapping: Record<string, string>; // bookmark → fieldKey
}

export interface ReportFormDefinition {
  id: number;
  name: string;
  description: string;
  status: FormStatus;
  layoutJson: LayoutJson;
  themeJson: ThemeJson;
  fillPolicyJson: FillPolicyJson;
  permissionJson: PermissionJson;
  scheduleJson: ScheduleJson;
  wordTemplateIdsJson: WordTemplateBinding[];
  versionSnapshotsJson: VersionSnapshot[];
  createdBy: string;
  updatedBy: string;
  publishedBy: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface VersionSnapshot {
  version: number;
  publishedAt: string;
  publishedBy: string;
  snapshot: {
    layoutJson: LayoutJson;
    themeJson: ThemeJson;
    permissionJson: PermissionJson;
  };
}

export interface ReportFormSubmission {
  id: number;
  formId: number;
  userId: number;
  status: 'draft' | 'submitted';
  fieldValuesJson: Record<string, unknown>;
  version: number;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OptionSet {
  id: number;
  name: string;
  scope: 'global' | 'form';
  formId?: number;
  itemsJson: { label: string; sortOrder: number }[];
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
}
```

- [ ] **Step 2: 创建 API 骨架**

```typescript
// frontend/src/features/report-form/api/reportForm.api.ts
import { http } from '@/api/http';
import type { ReportFormDefinition, PageResult } from '../types';

const BASE = '/api/admin/report-form';

export function fetchFormPage(page = 1, size = 100): Promise<PageResult<ReportFormDefinition>> {
  return http.get(`${BASE}/forms/page`, { params: { page, size } });
}

export function fetchFormById(id: number): Promise<ReportFormDefinition> {
  return http.get(`${BASE}/forms/${id}`);
}
```

```typescript
// frontend/src/features/report-form/api/reportFill.api.ts
import { http } from '@/api/http';
import type { ReportFormDefinition } from '../types';

const BASE = '/api/admin/report-fill';

export function fetchAvailableForms(): Promise<ReportFormDefinition[]> {
  return http.get(`${BASE}/available`);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/report-form/
git commit -m "feat(report-form): add FE types + API skeletons"
```

---

### Task 0.5: 前端路由注册

**Files:**
- Modify: `frontend/src/router/index.tsx`
- Create: `frontend/src/features/report-form/pages/ReportFormListPage.tsx` (骨架)
- Create: `frontend/src/features/report-form/pages/ReportFormDesignPage.tsx` (骨架)
- Create: `frontend/src/features/report-form/pages/ReportFillHubPage.tsx` (骨架)
- Create: `frontend/src/features/report-form/pages/ReportFillPage.tsx` (骨架)
- Create: `frontend/src/features/report-form/pages/SubmissionManagePage.tsx` (骨架)

**端:** 🔵 FE

- [ ] **Step 1: 创建页面骨架**

```typescript
// pages/ReportFormListPage.tsx
import { AdminPageShell } from '@/components/admin/AdminPageShell';

export default function ReportFormListPage() {
  return (
    <AdminPageShell title="填报报表管理" description="创建、设计、发布填报报表">
      <div className="p-4 text-sm text-[var(--app-color-text-secondary)]">
        填报报表列表（Phase 1 实现完整功能）
      </div>
    </AdminPageShell>
  );
}
```

```typescript
// pages/ReportFormDesignPage.tsx
import { useParams } from 'react-router-dom';
import { AdminPageShell } from '@/components/admin/AdminPageShell';

export default function ReportFormDesignPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AdminPageShell title="报表设计器" description={`编辑报表 #${id}`}>
      <div className="p-4 text-sm text-[var(--app-color-text-secondary)]">
        设计器（Phase 1 实现完整功能）
      </div>
    </AdminPageShell>
  );
}
```

```typescript
// pages/ReportFillHubPage.tsx
import { AdminPageShell } from '@/components/admin/AdminPageShell';

export default function ReportFillHubPage() {
  return (
    <AdminPageShell title="填报中心" description="浏览并填写已发布的报表">
      <div className="p-4 text-sm text-[var(--app-color-text-secondary)]">
        填报中心列表（Phase 3 实现完整功能）
      </div>
    </AdminPageShell>
  );
}
```

```typescript
// pages/ReportFillPage.tsx
import { useParams } from 'react-router-dom';
import { AdminPageShell } from '@/components/admin/AdminPageShell';

export default function ReportFillPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AdminPageShell title="填报" description={`填写报表 #${id}`}>
      <div className="p-4 text-sm text-[var(--app-color-text-secondary)]">
        填报页（Phase 3 实现完整功能）
      </div>
    </AdminPageShell>
  );
}
```

```typescript
// pages/SubmissionManagePage.tsx
import { useParams } from 'react-router-dom';
import { AdminPageShell } from '@/components/admin/AdminPageShell';

export default function SubmissionManagePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AdminPageShell title="提交管理" description={`查看报表 #${id} 所有提交`}>
      <div className="p-4 text-sm text-[var(--app-color-text-secondary)]">
        提交管理（Phase 3 实现完整功能）
      </div>
    </AdminPageShell>
  );
}
```

- [ ] **Step 2: 注册路由**

在 `frontend/src/router/index.tsx` 中：

**(a) 添加 imports（在现有 smartsheet imports 下方）：**

```typescript
import ReportFormListPage from "@/features/report-form/pages/ReportFormListPage";
import ReportFormDesignPage from "@/features/report-form/pages/ReportFormDesignPage";
import ReportFillHubPage from "@/features/report-form/pages/ReportFillHubPage";
import ReportFillPage from "@/features/report-form/pages/ReportFillPage";
import SubmissionManagePage from "@/features/report-form/pages/SubmissionManagePage";
```

**(b) 在 AdminLayout children 中，smartsheet 路由旁边添加新路由：**

```typescript
// 填报报表 — 新模块
{ path: "report-form", element: <ReportFormListPage /> },
{ path: "report-form/:id/design", element: <ReportFormDesignPage /> },
{ path: "report-form/:id/submissions", element: <SubmissionManagePage /> },
{ path: "report-fill", element: <ReportFillHubPage /> },
{ path: "report-fill/:id", element: <ReportFillPage /> },
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/report-form/pages/ frontend/src/router/index.tsx
git commit -m "feat(report-form): add 5 page skeletons + 6 route registrations"
```

---

### Task 0.6: adminNavRegistry 添加双导航

**Files:**
- Modify: `frontend/src/features/admin/adminNavRegistry.ts`

**端:** 🔵 FE

- [ ] **Step 1: 添加导入**

在 `adminNavRegistry.ts` 顶部图标导入区添加：

```typescript
import { Table2, ClipboardCheck } from "lucide-react";
```

（`Table2` 已存在，确认 `ClipboardCheck` 已导入，如未导入则添加）

- [ ] **Step 2: 在"资产与运维"分组添加双入口**

在 `ADMIN_NAV_REGISTRY` 数组的 `asset-ops` 分组 items 中，`analytics` 条目之前添加：

```typescript
{
  id: "report-form",
  path: "/admin/report-form",
  label: "填报报表管理",
  icon: Table2,
  homeTone: "from-emerald-400 to-teal-500",
  fallbackMinRole: "ADMIN",
  sidebarVisible: (ctx) => show(ctx, "/admin/report-form", "ADMIN"),
},
{
  id: "report-fill",
  path: "/admin/report-fill",
  label: "填报中心",
  icon: ClipboardCheck,
  homeTone: "from-violet-400 to-purple-500",
  fallbackMinRole: "STAFF",
  sidebarVisible: (ctx) => show(ctx, "/admin/report-fill", "STAFF"),
},
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/admin/adminNavRegistry.ts
git commit -m "feat(report-form): add report-form + report-fill to admin nav registry"
```

---

### Task 0.7: 移除旧 smartsheet 路由+导航

**Files:**
- Modify: `frontend/src/router/index.tsx` (移除旧 smartsheet 路由)
- Modify: `frontend/src/features/admin/adminNavRegistry.ts` (移除旧 smartsheet 导航)

**端:** 🔵 FE

- [ ] **Step 1: 移除旧 smartsheet 路由**

在 `router/index.tsx` 中：

```diff
- import SmartSheetListPage from "@/features/smartsheet/SmartSheetListPage";
- import SmartSheetEditorPage from "@/features/smartsheet/SmartSheetEditorPage";
- import SmartSheetFillPage from "@/features/smartsheet/SmartSheetFillPage";
- import { Navigate, useParams } from "react-router-dom";
-
- function SmartSheetLegacyRedirect() {
-   const { id } = useParams<{ id: string }>();
-   return <Navigate to={`/admin/smartsheet/${id}/fill`} replace />;
- }
```

在 AdminLayout children 中移除：

```diff
- { path: "smartsheet", element: <SmartSheetListPage />},
- { path: "smartsheet/:id/edit", element: <SmartSheetEditorPage />},
- { path: "smartsheet/:id/fill", element: <SmartSheetFillPage />},
- { path: "smartsheet/:id", element: <SmartSheetLegacyRedirect />},
```

- [ ] **Step 2: 移除旧 smartsheet 导航条目**

在 `adminNavRegistry.ts` 中移除：

```diff
- {
-   id: "smartsheet",
-   path: "/admin/smartsheet",
-   label: "智能表格",
-   icon: Table2,
-   homeTone: "from-indigo-400 to-violet-500",
-   fallbackMinRole: "STAFF",
-   sidebarVisible: (ctx) => show(ctx, "/admin/smartsheet", "STAFF"),
- },
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/router/index.tsx frontend/src/features/admin/adminNavRegistry.ts
git commit -m "feat(report-form): remove old smartsheet routes + nav entry"
```

---

### Phase 0 完成检查

- [ ] 访问 `/admin/report-form` 显示空列表页
- [ ] 访问 `/admin/report-fill` 显示空填报中心
- [ ] 侧栏显示"填报报表管理"（ADMIN）+ "填报中心"（STAFF）
- [ ] 旧 `/admin/smartsheet` 路由不再可达
- [ ] 4 张 `report_form_*` 表在数据库中存在

**Phase 0 完成后更新 MANIFEST：**

编辑 `docs/superpowers/handoff/MANIFEST.json`，将 active 任务改为：

```json
{
  "task_id": "report-form-20260613",
  "title": "填报报表新模块",
  "workflow": "new-feature",
  "phase": "Phase 1 — Excel 导入 + 设计器",
  "phase_index": "1/6",
  "created": "2026-06-13T12:00:00+08:00",
  "file": "active/report-form-20260613.md"
}
```

---

## Phase 1 — Excel 导入 + 设计器

### Task 1.1: Apache POI 导入解析

**Files:**
- Create: `src/main/java/com/example/demo/modules/reportform/service/ReportFormImportService.java`
- Modify: `src/main/java/com/example/demo/modules/reportform/controller/ReportFormController.java`
- Create: `src/main/java/com/example/demo/modules/reportform/dto/ReportFormImportResult.java`

**端:** 🟢 BE

- [ ] **Step 1: 创建 ImportService**

```java
// service/ReportFormImportService.java
package com.example.demo.modules.reportform.service;

import com.example.demo.modules.reportform.dto.ReportFormImportResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;

@Service
public class ReportFormImportService {

    private final ObjectMapper objectMapper = new ObjectMapper();

    public ReportFormImportResult importFromExcel(MultipartFile file, String name) throws Exception {
        try (Workbook workbook = new XSSFWorkbook(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0); // 第一张 sheet
            if (sheet.getLastRowNum() < 0) {
                throw new IllegalArgumentException("Excel 无有效数据");
            }

            // 收集所有合并区域
            Map<String, CellRangeAddress> mergeMap = new HashMap<>();
            for (int i = 0; i < sheet.getNumMergedRegions(); i++) {
                CellRangeAddress region = sheet.getMergedRegion(i);
                mergeMap.put(region.getFirstRow() + "," + region.getFirstColumn(), region);
            }

            ArrayNode cells = objectMapper.createArrayNode();
            ObjectNode fields = objectMapper.createObjectNode();
            int cellId = 0;

            for (int r = 0; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                if (row == null) continue;
                int maxCol = row.getLastCellNum() < 0 ? 0 : row.getLastCellNum();

                for (int c = 0; c < maxCol; c++) {
                    String key = r + "," + c;

                    // 跳过合并区域中非主格的格子
                    boolean isMergedChild = false;
                    for (Map.Entry<String, CellRangeAddress> entry : mergeMap.entrySet()) {
                        CellRangeAddress region = entry.getValue();
                        if (!entry.getKey().equals(key)
                            && r >= region.getFirstRow() && r <= region.getLastRow()
                            && c >= region.getFirstColumn() && c <= region.getLastColumn()) {
                            isMergedChild = true;
                            break;
                        }
                    }
                    if (isMergedChild) continue;

                    Cell cell = row.getCell(c);
                    String text = getCellText(cell);

                    // 生成唯一 fieldKey
                    String fieldKey = "f_" + cellId;

                    ObjectNode cellNode = objectMapper.createObjectNode();
                    cellNode.put("id", "c" + cellId);
                    cellNode.put("row", r);
                    cellNode.put("col", c);

                    // 处理合并单元格
                    CellRangeAddress merge = mergeMap.get(key);
                    if (merge != null) {
                        cellNode.put("colSpan", merge.getLastColumn() - merge.getFirstColumn() + 1);
                        cellNode.put("rowSpan", merge.getLastRow() - merge.getFirstRow() + 1);
                    } else {
                        cellNode.put("colSpan", 1);
                        cellNode.put("rowSpan", 1);
                    }

                    cellNode.put("kind", "static");
                    cellNode.put("staticText", text);
                    cellNode.put("fieldKey", fieldKey);

                    ObjectNode styleNode = objectMapper.createObjectNode();
                    styleNode.put("align", "center"); // 默认居中
                    if (cell != null && cell.getCellStyle() != null) {
                        CellStyle cs = cell.getCellStyle();
                        Font font = workbook.getFontAt(cs.getFontIndex());
                        if (font.getBold()) styleNode.put("bold", true);
                        if (font.getFontHeightInPoints() > 0) {
                            styleNode.put("fontSize", font.getFontHeightInPoints());
                        }
                    }
                    cellNode.set("style", styleNode);

                    cells.add(cellNode);

                    // 每个格子预生成 field 定义（导入后全部 static，用户手动切换）
                    ObjectNode fieldNode = objectMapper.createObjectNode();
                    fieldNode.put("type", "TEXT");
                    fieldNode.put("label", text.isEmpty() ? "字段" + cellId : text);
                    fieldNode.put("editableInFill", true);
                    fieldNode.putArray("editableByRoles");
                    fields.set(fieldKey, fieldNode);

                    cellId++;
                }
            }

            ObjectNode layout = objectMapper.createObjectNode();
            layout.set("cells", cells);
            layout.set("fields", fields);
            layout.putArray("mergeGroups");

            ReportFormImportResult result = new ReportFormImportResult();
            result.setLayoutJson(layout.toString());
            result.setCellCount(cellId);
            result.setName(name);
            return result;
        }
    }

    private String getCellText(Cell cell) {
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(cell)) {
                    yield cell.getLocalDateTimeCellValue().toLocalDate().toString();
                }
                double v = cell.getNumericCellValue();
                yield v == Math.floor(v) && !Double.isInfinite(v)
                    ? String.valueOf((long) v) : String.valueOf(v);
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> {
                try { yield cell.getStringCellValue(); }
                catch (Exception e) { yield String.valueOf(cell.getNumericCellValue()); }
            }
            default -> "";
        };
    }
}
```

- [ ] **Step 2: 创建 ImportResult DTO**

```java
// dto/ReportFormImportResult.java
package com.example.demo.modules.reportform.dto;

import lombok.Data;

@Data
public class ReportFormImportResult {
    private String name;
    private String layoutJson;
    private int cellCount;
}
```

- [ ] **Step 3: 在 Controller 添加导入端点**

```java
// 在 ReportFormController.java 中添加

private final ReportFormImportService importService;

// 构造函数更新:
public ReportFormController(ReportFormService reportFormService,
                            ReportFormImportService importService) {
    this.reportFormService = reportFormService;
    this.importService = importService;
}

@PostMapping("/forms/from-excel")
public Result<?> createFromExcel(@RequestParam("file") MultipartFile file) {
    try {
        String name = Objects.requireNonNullElse(file.getOriginalFilename(), "未命名报表")
            .replaceAll("\\.(xlsx|xls)$", "");
        var result = importService.importFromExcel(file, name);
        // 创建 draft 记录
        var form = reportFormService.createFromImport(result);
        return Result.success(form);
    } catch (Exception e) {
        return Result.error(500, "Excel 导入失败: " + e.getMessage());
    }
}
```

- [ ] **Step 4: 在 ReportFormService 添加 createFromImport 方法**

```java
// 在 ReportFormService.java 中添加

public ReportFormDefinition createFromImport(ReportFormImportResult result) {
    ReportFormDefinition def = new ReportFormDefinition();
    def.setName(result.getName());
    def.setStatus("draft");
    def.setLayoutJson(result.getLayoutJson());
    def.setThemeJson(getDefaultTheme());
    def.setFillPolicyJson("{\"mode\":\"shared\",\"submitLabel\":\"提交\",\"allowEditAfterSubmit\":true}");
    def.setPermissionJson("{\"visibleRoles\":[],\"visibleUserIds\":[],\"fieldRoleBindings\":{},\"allowUnboundView\":true}");
    def.setScheduleJson("{\"period\":\"manual\"}");
    def.setCreatedBy(authContextService.getCurrentUsername());
    def.setUpdatedBy(authContextService.getCurrentUsername());
    definitionMapper.insert(def);
    return def;
}

private String getDefaultTheme() {
    return """
    {
      "headerBg": "var(--app-color-surface-container)",
      "headerColor": "var(--app-color-text-primary)",
      "headerFontSize": 13,
      "headerBold": true,
      "headerAlign": "center",
      "zebraStripe": true,
      "oddRowBg": "var(--app-color-surface-page)",
      "evenRowBg": "var(--app-color-surface-container)",
      "borderWidth": 1,
      "borderColor": "var(--app-color-border)",
      "borderRadius": 8,
      "cellPadding": 8,
      "defaultFontSize": 13,
      "defaultAlign": "center",
      "columnWidths": {},
      "rowHeights": {}
    }
    """;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/example/demo/modules/reportform/
git commit -m "feat(report-form): add Excel import — POI merged cell parsing → layout_json"
```

---

### Task 1.2: FormGridEditor — HTML Table 渲染 + 选格

**Files:**
- Create: `frontend/src/features/report-form/components/FormGridEditor.tsx`
- Create: `frontend/src/features/report-form/hooks/useFormGridEditor.ts`

**端:** 🔵 FE

- [ ] **Step 1: 创建 useFormGridEditor hook**

```typescript
// hooks/useFormGridEditor.ts
import { useState, useCallback, useRef } from 'react';
import type { LayoutJson, GridCell, CellStyle } from '../types';

export function useFormGridEditor(initialLayout: LayoutJson) {
  const [layout, setLayout] = useState<LayoutJson>(initialLayout);
  const [selectedCellIds, setSelectedCellIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const undoStack = useRef<LayoutJson[]>([]);
  const redoStack = useRef<LayoutJson[]>([]);

  const pushUndo = useCallback(() => {
    undoStack.current.push(structuredClone(layout));
    redoStack.current = [];
  }, [layout]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (prev) {
      redoStack.current.push(structuredClone(layout));
      setLayout(prev);
    }
  }, [layout]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (next) {
      undoStack.current.push(structuredClone(layout));
      setLayout(next);
    }
  }, [layout]);

  const selectCell = useCallback((cellId: string, multi: boolean) => {
    setSelectedCellIds(prev => {
      const next = new Set(multi ? prev : []);
      if (prev.has(cellId) && multi) next.delete(cellId);
      else next.add(cellId);
      return next;
    });
  }, []);

  const selectRange = useCallback((cellIds: string[]) => {
    setSelectedCellIds(new Set(cellIds));
  }, []);

  const updateCell = useCallback((cellId: string, patch: Partial<GridCell>) => {
    pushUndo();
    setLayout(prev => ({
      ...prev,
      cells: prev.cells.map(c =>
        c.id === cellId ? { ...c, ...patch } : c
      ),
    }));
  }, [pushUndo]);

  const updateCellStyle = useCallback((cellId: string, stylePatch: Partial<CellStyle>) => {
    pushUndo();
    setLayout(prev => ({
      ...prev,
      cells: prev.cells.map(c =>
        c.id === cellId ? { ...c, style: { ...c.style, ...stylePatch } } : c
      ),
    }));
  }, [pushUndo]);

  const toggleCellKind = useCallback((cellId: string) => {
    pushUndo();
    setLayout(prev => ({
      ...prev,
      cells: prev.cells.map(c => {
        if (c.id !== cellId) return c;
        const newKind = c.kind === 'static' ? 'field' : 'static';
        return {
          ...c,
          kind: newKind,
          staticText: newKind === 'static' ? (c.staticText || '') : undefined,
          fieldKey: newKind === 'field' ? (c.fieldKey || `f_${cellId}`) : undefined,
        };
      }),
    }));
  }, [pushUndo]);

  const updateFieldDefinition = useCallback((fieldKey: string, patch: Record<string, unknown>) => {
    pushUndo();
    setLayout(prev => ({
      ...prev,
      fields: {
        ...prev.fields,
        [fieldKey]: { ...prev.fields[fieldKey], ...patch },
      },
    }));
  }, [pushUndo]);

  const replaceLayout = useCallback((newLayout: LayoutJson) => {
    pushUndo();
    setLayout(newLayout);
  }, [pushUndo]);

  return {
    layout, setLayout: replaceLayout,
    selectedCellIds, selectCell, selectRange, isDragging, setIsDragging,
    updateCell, updateCellStyle, toggleCellKind, updateFieldDefinition,
    undo, redo, undoStack, redoStack,
  };
}
```

- [ ] **Step 2: 创建 FormGridEditor 组件**

```typescript
// components/FormGridEditor.tsx
import { useCallback } from 'react';
import type { LayoutJson } from '../types';
import { useFormGridEditor } from '../hooks/useFormGridEditor';

interface Props {
  layout: LayoutJson;
  onChange: (layout: LayoutJson) => void;
}

export default function FormGridEditor({ layout, onChange }: Props) {
  const {
    layout: currentLayout, selectedCellIds, selectCell, setIsDragging,
  } = useFormGridEditor(layout);

  // 🔑 将 cells 按行列组织为渲染网格
  const cellMap = new Map<string, typeof currentLayout.cells[0]>();
  for (const cell of currentLayout.cells) {
    cellMap.set(`${cell.row},${cell.col}`, cell);
  }

  const maxRow = Math.max(...currentLayout.cells.map(c => c.row + c.rowSpan), 1);
  const maxCol = Math.max(...currentLayout.cells.map(c => c.col + c.colSpan), 1);

  const rendered = new Set<string>();

  const handleMouseDown = useCallback((cellId: string, e: React.MouseEvent) => {
    selectCell(cellId, e.shiftKey);
    if (!e.shiftKey) setIsDragging(true);
  }, [selectCell, setIsDragging]);

  const handleMouseEnter = useCallback((cellId: string, e: React.MouseEvent) => {
    if (e.buttons === 1) {
      selectCell(cellId, true);
    }
  }, [selectCell]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, [setIsDragging]);

  return (
    <div
      className="overflow-auto border border-[var(--app-color-border)] rounded-[var(--app-radius-container)]"
      onMouseUp={handleMouseUp}
    >
      <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
        <tbody>
          {Array.from({ length: maxRow }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: maxCol }, (_, c) => {
                const key = `${r},${c}`;
                if (rendered.has(key)) return null;
                const cell = cellMap.get(key);
                if (!cell) {
                  // 空占位格
                  return (
                    <td key={key} className="border border-[var(--app-color-border)] min-w-[80px] h-[32px]" />
                  );
                }
                // 标记渲染区域
                for (let dr = 0; dr < cell.rowSpan; dr++) {
                  for (let dc = 0; dc < cell.colSpan; dc++) {
                    rendered.add(`${r + dr},${c + dc}`);
                  }
                }
                const isSelected = selectedCellIds.has(cell.id);
                return (
                  <td
                    key={cell.id}
                    colSpan={cell.colSpan}
                    rowSpan={cell.rowSpan}
                    className={`border border-[var(--app-color-border)] p-[var(--app-space-container-padding)] cursor-pointer transition-colors min-w-[80px] ${
                      isSelected
                        ? 'bg-[var(--app-color-accent-soft)] outline outline-2 outline-[var(--app-color-accent)] outline-offset-[-2px]'
                        : 'hover:bg-[var(--app-color-surface-hover)]'
                    }`}
                    style={{
                      textAlign: cell.style.align,
                      fontWeight: cell.style.bold ? 'bold' : 'normal',
                      fontSize: cell.style.fontSize ? `${cell.style.fontSize}px` : undefined,
                      backgroundColor: isSelected ? undefined : (cell.style.bg || 'transparent'),
                    }}
                    onMouseDown={(e) => handleMouseDown(cell.id, e)}
                    onMouseEnter={(e) => handleMouseEnter(cell.id, e)}
                  >
                    {cell.kind === 'static'
                      ? (cell.staticText || ' ')
                      : (
                        <span className="text-[var(--app-color-accent)] font-medium">
                          {currentLayout.fields[cell.fieldKey!]?.label || cell.fieldKey}
                        </span>
                      )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/report-form/
git commit -m "feat(report-form): add FormGridEditor — HTML table rendering + cell selection"
```

---

### Task 1.3: 设计器右键菜单

**Files:**
- Create: `frontend/src/features/report-form/components/GridContextMenu.tsx`

**端:** 🔵 FE

- [ ] **Step 1: 创建 ContextMenu 组件**

```typescript
// components/GridContextMenu.tsx
import { useEffect, useRef } from 'react';
import { Plus, Trash2, Combine, Ungroup } from 'lucide-react';

interface Props {
  x: number; y: number;
  selectedCellIds: string[];
  onClose: () => void;
  onInsertRow: (position: 'above' | 'below') => void;
  onInsertCol: (position: 'left' | 'right') => void;
  onDeleteRow: () => void;
  onDeleteCol: () => void;
  onMergeCells: () => void;
  onSplitCell: () => void;
  canMerge: boolean; // 多选时
  canSplit: boolean; // 选中合并格时
}

export default function GridContextMenu({
  x, y, selectedCellIds, onClose,
  onInsertRow, onInsertCol, onDeleteRow, onDeleteCol,
  onMergeCells, onSplitCell, canMerge, canSplit,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [onClose]);

  const menuItem = (label: string, icon: React.ReactNode, onClick: () => void, danger = false) => (
    <button
      onClick={() => { onClick(); onClose(); }}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors text-left
        ${danger ? 'text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger-soft)]'
                 : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'}`}
    >
      {icon} {label}
    </button>
  );

  const divider = <div className="h-px bg-[var(--app-color-border)] my-1" />;

  return (
    <div
      ref={ref}
      className="fixed w-[200px] rounded-[var(--app-radius-container)] border border-[var(--app-color-border)]
                 bg-[var(--app-color-surface-elevated)] shadow-lg py-1.5 z-[var(--z-dropdown)]"
      style={{ left: x, top: y }}
    >
      {menuItem('上方插入行', <Plus className="w-3.5 h-3.5" />, () => onInsertRow('above'))}
      {menuItem('下方插入行', <Plus className="w-3.5 h-3.5" />, () => onInsertRow('below'))}
      {menuItem('左侧插入列', <Plus className="w-3.5 h-3.5" />, () => onInsertCol('left'))}
      {menuItem('右侧插入列', <Plus className="w-3.5 h-3.5" />, () => onInsertCol('right'))}
      {divider}
      {canMerge && menuItem('合并选中', <Combine className="w-3.5 h-3.5" />, onMergeCells)}
      {canSplit && menuItem('拆分单元格', <Ungroup className="w-3.5 h-3.5" />, onSplitCell)}
      {divider}
      {menuItem('删除行', <Trash2 className="w-3.5 h-3.5" />, onDeleteRow, true)}
      {menuItem('删除列', <Trash2 className="w-3.5 h-3.5" />, onDeleteCol, true)}
    </div>
  );
}
```

- [ ] **Step 2: 集成到 FormGridEditor**

在 `FormGridEditor.tsx` 中添加 contextMenu 状态和 onContextMenu 处理：

```typescript
// 在 FormGridEditor 组件内添加:
const [ctxMenu, setCtxMenu] = useState<{x:number;y:number}|null>(null);

const handleContextMenu = useCallback((e: React.MouseEvent) => {
  e.preventDefault();
  setCtxMenu({ x: e.clientX, y: e.clientY });
}, []);

// 在 <td> 上添加: onContextMenu={handleContextMenu}

// 在 return 末尾:
{ctxMenu && (
  <GridContextMenu
    x={ctxMenu.x} y={ctxMenu.y}
    selectedCellIds={[...selectedCellIds]}
    onClose={() => setCtxMenu(null)}
    onInsertRow={(pos) => { /* 实现插入行逻辑 */ }}
    onInsertCol={(pos) => { /* 实现插入列逻辑 */ }}
    onDeleteRow={() => { /* 实现删除行逻辑 */ }}
    onDeleteCol={() => { /* 实现删除列逻辑 */ }}
    onMergeCells={() => { /* 合并选中格子 */ }}
    onSplitCell={() => { /* 拆分格子 */ }}
    canMerge={selectedCellIds.size >= 2}
    canSplit={selectedCellIds.size === 1 && /* 选中格子是合并格 */}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/report-form/
git commit -m "feat(report-form): add GridContextMenu — insert/delete/merge/split rows and cols"
```

---

### Task 1.4: FieldInspector 属性面板

**Files:**
- Create: `frontend/src/features/report-form/components/FieldInspector.tsx`

**端:** 🔵 FE

- [ ] **Step 1: 创建 FieldInspector**

```typescript
// components/FieldInspector.tsx
import type { GridCell, LayoutJson, FieldType, FieldDefinition, CellStyle } from '../types';

interface Props {
  selectedCell: GridCell | null;
  layout: LayoutJson;
  onUpdateCell: (cellId: string, patch: Partial<GridCell>) => void;
  onUpdateStyle: (cellId: string, patch: Partial<CellStyle>) => void;
  onToggleKind: (cellId: string) => void;
  onUpdateField: (fieldKey: string, patch: Partial<FieldDefinition>) => void;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'TEXT', label: '文本' },
  { value: 'NUMBER', label: '数字' },
  { value: 'BOOLEAN', label: '勾选' },
  { value: 'SELECT', label: '单选下拉' },
  { value: 'MULTI_SELECT', label: '多选下拉' },
  { value: 'DATETIME', label: '日期时间' },
  { value: 'IMAGE', label: '图片' },
  { value: 'FILE', label: '文件' },
  { value: 'USER', label: '人员' },
];

const ALIGN_OPTIONS: { value: string; label: string }[] = [
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右对齐' },
];

export default function FieldInspector({
  selectedCell, layout, onUpdateCell, onUpdateStyle, onToggleKind, onUpdateField,
}: Props) {
  if (!selectedCell) {
    return (
      <div className="p-4 text-sm text-[var(--app-color-text-tertiary)]">
        点击格子查看属性
      </div>
    );
  }

  const field = selectedCell.fieldKey ? layout.fields[selectedCell.fieldKey] : null;
  const isStatic = selectedCell.kind === 'static';

  const inputClass = "w-full rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]";
  const labelClass = "text-[11px] font-medium text-[var(--app-color-text-secondary)] mb-0.5 block";

  return (
    <div className="p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-120px)]">
      <h3 className="text-xs font-semibold text-[var(--app-color-text-primary)] uppercase tracking-wider">
        格子属性 · {selectedCell.id}
      </h3>

      {/* 类型切换 */}
      <div>
        <label className={labelClass}>类型</label>
        <div className="flex gap-1">
          <button
            onClick={() => onToggleKind(selectedCell.id)}
            className={`flex-1 px-2 py-1 rounded-[6px] text-[11px] font-medium transition-colors ${
              isStatic ? 'bg-[var(--app-color-accent)] text-white' : 'border border-[var(--app-color-border)]'
            }`}
          >
            静态文本
          </button>
          <button
            onClick={() => onToggleKind(selectedCell.id)}
            className={`flex-1 px-2 py-1 rounded-[6px] text-[11px] font-medium transition-colors ${
              !isStatic ? 'bg-[var(--app-color-accent)] text-white' : 'border border-[var(--app-color-border)]'
            }`}
          >
            填报字段
          </button>
        </div>
      </div>

      {isStatic ? (
        <>
          {/* 静态格：文案 */}
          <div>
            <label className={labelClass}>文案内容</label>
            <textarea
              value={selectedCell.staticText || ''}
              onChange={e => onUpdateCell(selectedCell.id, { staticText: e.target.value })}
              className={`${inputClass} h-20 resize-none`}
              placeholder="输入文本内容..."
            />
          </div>
        </>
      ) : field ? (
        <>
          {/* 字段格 */}
          <div>
            <label className={labelClass}>字段 Key</label>
            <input
              value={selectedCell.fieldKey || ''}
              onChange={e => {
                const oldKey = selectedCell.fieldKey!;
                const newKey = e.target.value;
                onUpdateCell(selectedCell.id, { fieldKey: newKey });
                if (oldKey && newKey && oldKey !== newKey) {
                  // 重命名 fieldKey — 需要重建 fields 映射
                  onUpdateField(oldKey, {}); // 触发外部重新映射
                }
              }}
              className={inputClass}
              placeholder="f_xxx"
            />
          </div>
          <div>
            <label className={labelClass}>字段类型</label>
            <select
              value={field.type}
              onChange={e => onUpdateField(selectedCell.fieldKey!, { type: e.target.value as FieldType })}
              className={inputClass}
            >
              {FIELD_TYPES.map(ft => (
                <option key={ft.value} value={ft.value}>{ft.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>字段标签</label>
            <input
              value={field.label || ''}
              onChange={e => onUpdateField(selectedCell.fieldKey!, { label: e.target.value })}
              className={inputClass}
              placeholder="字段显示名称"
            />
          </div>
          {(field.type === 'SELECT' || field.type === 'MULTI_SELECT') && (
            <div>
              <label className={labelClass}>选项（每行一个）</label>
              <textarea
                value={(field.options || []).map(o => o.label).join('\n')}
                onChange={e => {
                  const opts = e.target.value.split('\n').filter(Boolean).map((label, i) => ({
                    label: label.trim(), value: label.trim(),
                  }));
                  onUpdateField(selectedCell.fieldKey!, { options: opts });
                }}
                className={`${inputClass} h-24 resize-none`}
                placeholder="选项A&#10;选项B&#10;选项C"
              />
            </div>
          )}
          {(field.type === 'NUMBER') && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>最小值</label>
                <input type="number" value={field.min ?? ''} onChange={e =>
                  onUpdateField(selectedCell.fieldKey!, { min: e.target.value ? Number(e.target.value) : undefined })
                } className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>最大值</label>
                <input type="number" value={field.max ?? ''} onChange={e =>
                  onUpdateField(selectedCell.fieldKey!, { max: e.target.value ? Number(e.target.value) : undefined })
                } className={inputClass} />
              </div>
            </div>
          )}
          {(field.type === 'TEXT') && (
            <div>
              <label className={labelClass}>最大长度</label>
              <input type="number" value={field.maxLength ?? ''} onChange={e =>
                onUpdateField(selectedCell.fieldKey!, { maxLength: e.target.value ? Number(e.target.value) : undefined })
              } className={inputClass} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox" checked={field.required ?? false}
              onChange={e => onUpdateField(selectedCell.fieldKey!, { required: e.target.checked })}
              className="w-3.5 h-3.5 accent-[var(--app-color-accent)]"
            />
            <label className="text-[11px] text-[var(--app-color-text-secondary)]">必填</label>
          </div>
        </>
      ) : null}

      {/* 通用样式 */}
      <div>
        <label className={labelClass}>对齐</label>
        <div className="flex gap-1">
          {ALIGN_OPTIONS.map(a => (
            <button
              key={a.value}
              onClick={() => onUpdateStyle(selectedCell.id, { align: a.value as CellStyle['align'] })}
              className={`flex-1 px-2 py-1 rounded-[6px] text-[10px] font-medium transition-colors ${
                selectedCell.style.align === a.value
                  ? 'bg-[var(--app-color-accent)] text-white'
                  : 'border border-[var(--app-color-border)]'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className={labelClass}>背景色</label>
        <input
          type="color"
          value={selectedCell.style.bg || '#ffffff'}
          onChange={e => onUpdateStyle(selectedCell.id, { bg: e.target.value })}
          className="w-full h-8 rounded-[6px] cursor-pointer"
        />
      </div>
      <div>
        <label className={labelClass}>合并</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] text-[var(--app-color-text-tertiary)]">colSpan</span>
            <input type="number" min={1} value={selectedCell.colSpan}
              onChange={e => onUpdateCell(selectedCell.id, { colSpan: Math.max(1, Number(e.target.value)) })}
              className={inputClass} />
          </div>
          <div>
            <span className="text-[10px] text-[var(--app-color-text-tertiary)]">rowSpan</span>
            <input type="number" min={1} value={selectedCell.rowSpan}
              onChange={e => onUpdateCell(selectedCell.id, { rowSpan: Math.max(1, Number(e.target.value)) })}
              className={inputClass} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/report-form/
git commit -m "feat(report-form): add FieldInspector — property panel for static/field cells"
```

---

### Task 1.5: 格子切换 + 文案编辑（已在 1.4 完成，无需额外任务）

Task 1.4 的 FieldInspector 已包含 static↔field 切换和文案编辑功能。

- [x] ✅ 已完成（内嵌于 Task 1.4）

---

### Task 1.6: 保存草稿 API + FE 对接

**Files:**
- Modify: `src/main/java/com/example/demo/modules/reportform/controller/ReportFormController.java`
- Modify: `src/main/java/com/example/demo/modules/reportform/service/ReportFormService.java`
- Modify: `frontend/src/features/report-form/api/reportForm.api.ts`
- Modify: `frontend/src/features/report-form/pages/ReportFormDesignPage.tsx`

**端:** 🔗 共享（FE+BE 并行）

- [ ] **Step 1: 后端 — PUT /forms/{id}**

```java
// 在 ReportFormController.java 中添加
@PutMapping("/forms/{id}")
public Result<?> update(@PathVariable Long id, @RequestBody ReportFormUpdateRequest req) {
    reportFormService.update(id, req);
    return Result.success(null);
}
```

```java
// 在 ReportFormService.java 中添加
public void update(Long id, ReportFormUpdateRequest req) {
    ReportFormDefinition def = definitionMapper.selectById(id);
    if (def == null) throw new TwinBusinessException(ErrorCodeConstants.REPORT_FORM_NOT_FOUND);
    if (!"draft".equals(def.getStatus())) {
        // 发布后也允许编辑，但更新 updated_by
    }
    def.setName(req.getName());
    def.setDescription(req.getDescription());
    def.setLayoutJson(req.getLayoutJson());
    def.setThemeJson(req.getThemeJson());
    def.setFillPolicyJson(req.getFillPolicyJson());
    def.setPermissionJson(req.getPermissionJson());
    def.setScheduleJson(req.getScheduleJson());
    def.setUpdatedBy(authContextService.getCurrentUsername());
    definitionMapper.update(def);
}
```

- [ ] **Step 2: 前端 — 对接保存**

```typescript
// 在 reportForm.api.ts 中添加
export function updateForm(id: number, data: Partial<ReportFormDefinition>): Promise<void> {
  return http.put(`${BASE}/forms/${id}`, data);
}
```

- [ ] **Step 3: 设计器页面集成**

在 `ReportFormDesignPage.tsx` 中添加保存逻辑：

```typescript
// 工具栏
<div className="flex items-center gap-3 mb-4">
  <ExcelImportButton onImport={(layout) => editor.replaceLayout(layout)} />
  <button onClick={handleSave} className="...">
    保存
  </button>
  <button onClick={handleUndo} className="...">撤销</button>
  <button onClick={handleRedo} className="...">重做</button>
</div>
// 左右分栏
<div className="flex gap-4">
  <div className="flex-[7]">
    <FormGridEditor layout={form.layoutJson} onChange={handleLayoutChange} />
  </div>
  <div className="flex-[3]">
    <FieldInspector
      selectedCell={selectedCell}
      layout={form.layoutJson}
      onUpdateCell={...} onUpdateStyle={...} onToggleKind={...} onUpdateField={...}
    />
  </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/main/java/com/example/demo/modules/reportform/ frontend/src/features/report-form/
git commit -m "feat(report-form): add save draft API + FE integration"
```

---

### Phase 1 完成检查

- [ ] 从 Excel 创建 → 进入设计器 → 看到解析后的网格
- [ ] 单击格子 → 属性面板显示
- [ ] 拖选多个格子 → 选中高亮
- [ ] 右键 → 菜单出现 → 插行/插列成功
- [ ] 切换 static↔field → 属性面板内容变化
- [ ] 改字段类型 → 面板显示对应配置项
- [ ] 点保存 → 数据持久化

**Phase 1 完成后更新 MANIFEST phase_index: 2/6**

---

## Phase 2 — 主题 + 选项集 + 发布

### Task 2.1: 选项集 CRUD + 管理页

（完整代码略，结构与 Phase 1 类似）

- [ ] Task 2.1.1: 后端 — 选项集 CRUD API (POST/GET/PUT/DELETE `/option-sets`)
- [ ] Task 2.1.2: 前端 — OptionSetManager 弹窗组件
- [ ] Task 2.1.3: 集成到设计器属性面板（SELECT/MULTI_SELECT 可引用选项集）

### Task 2.2: ThemePanel

- [ ] Task 2.2.1: 创建 ThemePanel 组件（7 项配置：表头色/斑马纹/边框/字体/列宽/行高/圆角）
- [ ] Task 2.2.2: 应用到 FormGridEditor（实时预览）

### Task 2.3: PermissionPanel

- [ ] Task 2.3.1: 创建 PermissionPanel（可见角色多选 + 字段角色绑定表 + allowUnboundView）
- [ ] Task 2.3.2: 集成到设计器

### Task 2.4: PublishWizard

- [ ] Task 2.4.1: 快速发布模式（模式选择 + 可见角色 → 一键发布）
- [ ] Task 2.4.2: 分步向导（Step1名称 → Step2模式 → Step3权限+周期+窗口 → Step4确认）
- [ ] Task 2.4.3: publish/unpublish API

### Task 2.5: 发布后允许编辑

- [ ] Task 2.5.1: 后端 — PUT 不再限制 status，修改后自动兼容已有数据
- [ ] Task 2.5.2: 版本快照追加逻辑

---

## Phase 3 — 填报中心 + 留痕

### Task 3.1: ReportFillHubPage

- [ ] Task 3.1.1: 按报表聚合列表（卡片/折叠）
- [ ] Task 3.1.2: 公开报表 → 展开查看提交记录

### Task 3.2: ReportFillPage + FormGridRenderer

- [ ] Task 3.2.1: FormGridRenderer 组件（static 只读 + field 控件映射）
- [ ] Task 3.2.2: 9 种字段类型控件实现
- [ ] Task 3.2.3: 角色过滤（editableByRoles 校验 + allowUnboundView）

### Task 3.3: Fetch-or-create + auto-save + 同步

- [ ] Task 3.3.1: `useReportFill` hook（fetch-or-create → debounce 600ms save → 5s sync）
- [ ] Task 3.3.2: 就地合并策略（不整表 reload）

### Task 3.4: submission API

- [ ] Task 3.4.1: GET/PUT my-submission
- [ ] Task 3.4.2: POST submit（required 校验）
- [ ] Task 3.4.3: 版本乐观锁后端实现

### Task 3.5: SubmissionManagePage

- [ ] Task 3.5.1: 表格模式（表头=字段名+填写人+状态+时间）
- [ ] Task 3.5.2: 逐份模式（左侧用户列表 + 右侧 FormGridRenderer）

### Task 3.6: 时间窗口 + 周期调度

- [ ] Task 3.6.1: 后端定时任务（每天 00:00 检查需要生成的周期实例）
- [ ] Task 3.6.2: 时间窗口校验 middleware

---

## Phase 4 — 导出 + 打印

### Task 4.1: Excel 导出

- [ ] Task 4.1.1: 单条导出（静态格 + 填报值合成 .xlsx）
- [ ] Task 4.1.2: 批量导出（按日期/人筛选 → 多行合并到一个 sheet）

### Task 4.2: PDF 导出

- [ ] Task 4.2.1: 后端 PDF 生成（Apache PDFBox 或 Flying Saucer）
- [ ] Task 4.2.2: 前端浏览器打印（`window.print()` + 打印样式）

### Task 4.3-4.5: Word 模板

- [ ] Task 4.3.1: Word 导入解析书签（Apache POI XWPF）
- [ ] Task 4.3.2: 书签→fieldKey 映射 UI
- [ ] Task 4.3.3: Word 模板注入导出（书签替换 → 生成 .docx）
- [ ] Task 4.3.4: 多打印模板管理

### Task 4.6: 远程打印接口

- [ ] Task 4.6.1: IPP/CUPS 连接端点预留

---

## Phase 5 — 模板 + FILE/IMAGE

### Task 5.1: 版本快照

- [ ] Task 5.1.1: 版本列表 API（读取 version_snapshots_json）
- [ ] Task 5.1.2: 前端版本历史展示

### Task 5.2: 模板系统

- [ ] Task 5.2.1: 另存为模板 API
- [ ] Task 5.2.2: 共享模板（is_shared=1）
- [ ] Task 5.2.3: 从模板创建 API + FE

### Task 5.3-5.5: FILE/IMAGE/USER

- [ ] Task 5.3.1: FILE 字段联动 `/admin/file-templates` 上传
- [ ] Task 5.3.2: PDF 在线预览（iframe embed）
- [ ] Task 5.3.3: IMAGE 字段 URL+上传+缩略图
- [ ] Task 5.3.4: USER 选择器（搜索现有用户）

---

## Phase 6 — 归档 + 删除旧 SmartSheet

### Task 6.1: 归档

- [ ] Task 6.1.1: 归档/取消归档 API
- [ ] Task 6.1.2: 列表筛选（draft/published/archived tabs）

### Task 6.2-6.4: 删除旧 SmartSheet

- [ ] Task 6.2.1: 删除 `frontend/src/features/smartsheet/`
- [ ] Task 6.2.2: 删除 `frontend/src/api/domains/smartsheet.api.ts`
- [ ] Task 6.3.1: 删除 `modules/smartsheet/`
- [ ] Task 6.3.2: 删除 `resources/mapper/smartsheet/`
- [ ] Task 6.4.1: 删除 `adminNavRegistry` 中残留引用
- [ ] Task 6.4.2: 删除 `PagePermissionSchemaMigrator` 中 smartsheet 种子
- [ ] Task 6.4.3: 删除 `inferHomeSectionTitleForUnknownPath` 中 smartsheet 分支
- [ ] Task 6.4.4: 删除 `smartsheet_*` 表（确认无依赖后 DROP）

---

## 进程总览

| Phase | 任务数 | 状态 |
|-------|--------|------|
| Phase 0 | 7 | ⬜ |
| Phase 1 | 6 | ⬜ |
| Phase 2 | 6 | ⬜ |
| Phase 3 | 6 | ⬜ |
| Phase 4 | 6 | ⬜ |
| Phase 5 | 5 | ⬜ |
| Phase 6 | 4 | ⬜ |
| **合计** | **34** | |

---

## 跨对话手交规则

每完成一个 Phase：

1. 更新 `docs/superpowers/handoff/active/report-form-20260613.md`
2. 更新 `docs/superpowers/handoff/MANIFEST.json` 中 `phase_index`
3. 提交 `git commit -m "handoff: report-form Phase N/N complete"`
4. 新对话说"接手" → AI 读取 handoff → 从下一 Phase 继续
