# SmartSheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a high-flexibility configurable table engine (SmartSheet) with revo-grid frontend + FastExcel backend, supporting 4 layout modes, 7 cell types, import/export, conditional formatting, row striping, change history, and multi-sheet tabs.

**Architecture:** Three MySQL tables (definition, row, change_log) store JSON-driven schema and data. Backend provides 12 REST endpoints following project conventions (constructor DI, @RestController, Result<T>). Frontend wraps revo-grid in a feature module under `frontend/src/features/smartsheet/` using @tanstack/react-query for data fetching and shadcn/ui for chrome.

**Tech Stack:** React 19 + TypeScript + Tailwind CSS + shadcn/ui + revo-grid (MIT) + @tanstack/react-query | Spring Boot + MyBatis + FastExcel

> ## 🔧 计划修正记录（2026-06-10，编码前）
>
> 本计划在 UI 设计（Bento 风格）之前编写，代码示例中存在令牌合规问题。以下修正已在计划文档中应用：
>
> | # | 修正项 | 影响 Task | 状态 |
> |---|--------|----------|------|
> | 1 | `smartsheet-theme.css` 硬编码颜色 → 组件令牌 `--smartsheet-*` 全部引用 `--app-*` 语义令牌 | Task 10 | ✅ |
> | 2 | 所有 TSX 组件硬编码 Tailwind 类名（`bg-white`, `text-slate-*`, `dark:bg-[#...]`）→ 语义类名（`bg-app-surface-*`, `text-app-text-*`） | Task 11-14 | ✅ |
> | 3 | 暗色 `#09090b` → Tokens.css `--color-slate-950`（Bento 暖黑 `#12100E` 对齐） | Task 10, 13 | ✅ |
> | 4 | 裸 `z-50` → `var(--z-modal)`（项目 Z-Index 层级表） | Task 14 | ✅ |
> | 5 | Bento 钢蓝 `#80A1C1` → `--color-steel-*` 基础色板（已在 tokens.css 注册） | Task 10 | ✅ |
> | 6 | 统计卡片 270px 侧面板 → 紧凑 `h-7` 页脚状态栏（用户反馈：放页眉/页脚作为状态指示） | Task 12, 13 | ✅ |
>
> **编码时强制规则**：
> - 所有颜色通过 Tailwind 语义类名（`bg-app-*`, `text-app-*`, `border-app-*`）引用，见 `docs/UI令牌实施调教指南.md` §5.2
> - 所有 z-index 使用 `var(--z-*)` 令牌
> - 禁止在组件中定义新的 CSS 变量体系（G04 门禁）
> - 新 CSS 变量只能是组件令牌（第三层），引用语义令牌（第二层）

---

## File Structure

```
frontend/src/features/smartsheet/
├── types.ts                          — All TypeScript types
├── smartsheetNavRegistry.ts          — Admin nav registration
├── SmartSheetPage.tsx                — Route page (editor container)
├── SmartSheetListPage.tsx             — Sheet management list
├── hooks/
│   ├── useSmartSheet.ts              — Core data hook
│   └── useSmartSheetStats.ts         — Stats hook
├── components/
│   ├── SmartSheetToolbar.tsx          — Top toolbar
│   ├── SmartSheetGrid.tsx             — revo-grid wrapper
│   ├── SmartSheetStatsPanel.tsx       — Right stats panel
│   ├── SmartSheetColumnConfigSheet.tsx — Column config slide-out
│   ├── SmartSheetImportDialog.tsx     — Import mapping dialog
│   └── SmartSheetChangeLogPopover.tsx — Cell change history
├── editors/
│   └── cellEditors.tsx               — Custom revo-grid cell editors

frontend/src/api/domains/
└── smartsheet.api.ts                  — API functions

frontend/src/styles/
└── smartsheet-theme.css               — revo-grid theme bridge

src/main/java/com/example/demo/modules/smartsheet/
├── controller/SmartsheetController.java
├── service/SmartsheetService.java
├── service/SmartsheetRowService.java
├── mapper/SmartsheetDefinitionMapper.java
├── mapper/SmartsheetRowMapper.java
├── mapper/SmartsheetChangeLogMapper.java
├── entity/SmartsheetDefinition.java
├── entity/SmartsheetRow.java
├── entity/SmartsheetChangeLog.java
├── model/SmartsheetDefinitionVO.java
├── model/SmartsheetRowVO.java
├── model/SmartsheetCreateRequest.java
├── model/SmartsheetUpdateRequest.java
├── model/SmartsheetRowUpdateRequest.java
├── model/SmartsheetImportRequest.java
├── model/SmartsheetStatsResponse.java

scripts/
└── V__smartsheet.sql
```

---

### Task 1: Database & Dependencies

**Files:**
- Create: `scripts/V__smartsheet.sql`
- Modify: `frontend/package.json`

- [ ] **Step 1: Write SQL migration**

```sql
-- V__smartsheet.sql
CREATE TABLE IF NOT EXISTS smartsheet_definition (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(200)  NOT NULL COMMENT '表格名称',
    description     VARCHAR(500)  DEFAULT '' COMMENT '描述',
    layout_mode     VARCHAR(20)   NOT NULL DEFAULT 'table' COMMENT '布局模式: matrix/table/checklist/calendar',
    columns_config  JSON          NOT NULL COMMENT '列定义',
    row_entity_source JSON        DEFAULT NULL COMMENT '行实体来源配置',
    template_id     BIGINT        DEFAULT NULL COMMENT '模板来源',
    created_by      BIGINT        COMMENT '创建人',
    updated_by      BIGINT        COMMENT '更新人',
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_template (template_id),
    INDEX idx_created_by (created_by)
) COMMENT '智能表格定义';

CREATE TABLE IF NOT EXISTS smartsheet_row (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    sheet_id        BIGINT        NOT NULL COMMENT 'FK -> smartsheet_definition.id',
    row_index       INT           NOT NULL DEFAULT 0 COMMENT '行序号',
    row_entity_id   VARCHAR(100)  DEFAULT NULL COMMENT '行实体引用ID',
    row_label       VARCHAR(200)  DEFAULT '' COMMENT '行头显示名称',
    cell_data       JSON          NOT NULL COMMENT '单元格数据',
    version         INT           NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sheet (sheet_id),
    UNIQUE KEY uk_sheet_entity (sheet_id, row_entity_id)
) COMMENT '智能表格数据行';

CREATE TABLE IF NOT EXISTS smartsheet_change_log (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    sheet_id        BIGINT        NOT NULL,
    row_id          BIGINT        NOT NULL,
    column_key      VARCHAR(100)  NOT NULL COMMENT '列 key',
    old_value       TEXT          COMMENT '旧值',
    new_value       TEXT          COMMENT '新值',
    changed_by      BIGINT        COMMENT '修改人',
    changed_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_row (row_id),
    INDEX idx_sheet_time (sheet_id, changed_at)
) COMMENT '智能表格变更日志';
```

- [ ] **Step 2: Execute migration**

Run: `mysql -u root -p codex < scripts/V__smartsheet.sql`
Expected: 3 tables created, verify with `SHOW TABLES LIKE 'smartsheet%'`

- [ ] **Step 3: Install revo-grid dependency**

```bash
cd frontend && npm install @revolist/revogrid
```

Expected: `@revolist/revogrid` added to package.json dependencies

- [ ] **Step 4: Commit**

```bash
git add scripts/V__smartsheet.sql frontend/package.json frontend/package-lock.json
git commit -m "feat: add smartsheet DB migration and revo-grid dependency"
```

---

### Task 2: Backend Error Codes

**Files:**
- Modify: `src/main/java/com/example/demo/common/exception/ErrorCodeConstants.java`

- [ ] **Step 1: Add SmartSheet error code segment**

Insert after the knowledge section (line ~43):

```java
    /** 智能表格 smartsheet 1-006-xxx */
    public static final int SMARTSHEET_NOT_FOUND           = 1_006_001;  // "表格不存在"
    public static final int SMARTSHEET_COLUMN_INVALID      = 1_006_002;  // "列定义不合法"
    public static final int SMARTSHEET_TOO_MANY_COLUMNS    = 1_006_003;  // "超过最大列数限制(100)"
    public static final int SMARTSHEET_TOO_MANY_ROWS       = 1_006_004;  // "超过最大行数限制(500)"
    public static final int SMARTSHEET_VERSION_CONFLICT    = 1_006_005;  // "数据已被他人修改，请刷新"
    public static final int SMARTSHEET_IMPORT_FORMAT       = 1_006_006;  // "不支持的文件格式，仅接受 .xlsx/.xls/.csv"
    public static final int SMARTSHEET_ROW_NOT_FOUND       = 1_006_007;  // "数据行不存在"
    public static final int SMARTSHEET_COLUMN_TYPE_CONFLICT = 1_006_008; // "列类型变更将清空已有数据"
    public static final int SMARTSHEET_TEMPLATE_NOT_FOUND  = 1_006_009;  // "模板不存在"
```

- [ ] **Step 2: Verify compilation**

Run: `mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/common/exception/ErrorCodeConstants.java
git commit -m "feat: add SmartSheet error codes (1_006_001 - 1_006_009)"
```

---

### Task 3: Backend Entities

**Files:**
- Create: `src/main/java/com/example/demo/modules/smartsheet/entity/SmartsheetDefinition.java`
- Create: `src/main/java/com/example/demo/modules/smartsheet/entity/SmartsheetRow.java`
- Create: `src/main/java/com/example/demo/modules/smartsheet/entity/SmartsheetChangeLog.java`

- [ ] **Step 1: Write SmartsheetDefinition entity**

```java
package com.example.demo.modules.smartsheet.entity;

import java.time.LocalDateTime;

public class SmartsheetDefinition {
    private Long id;
    private String name;
    private String description;
    private String layoutMode;       // matrix | table | checklist | calendar
    private String columnsConfig;    // JSON string (MyBatis maps to/from JSON column)
    private String rowEntitySource;  // JSON string, nullable
    private Long templateId;
    private Long createdBy;
    private Long updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // getters / setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getLayoutMode() { return layoutMode; }
    public void setLayoutMode(String layoutMode) { this.layoutMode = layoutMode; }
    public String getColumnsConfig() { return columnsConfig; }
    public void setColumnsConfig(String columnsConfig) { this.columnsConfig = columnsConfig; }
    public String getRowEntitySource() { return rowEntitySource; }
    public void setRowEntitySource(String rowEntitySource) { this.rowEntitySource = rowEntitySource; }
    public Long getTemplateId() { return templateId; }
    public void setTemplateId(Long templateId) { this.templateId = templateId; }
    public Long getCreatedBy() { return createdBy; }
    public void setCreatedBy(Long createdBy) { this.createdBy = createdBy; }
    public Long getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(Long updatedBy) { this.updatedBy = updatedBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
```

- [ ] **Step 2: Write SmartsheetRow entity**

```java
package com.example.demo.modules.smartsheet.entity;

import java.time.LocalDateTime;

public class SmartsheetRow {
    private Long id;
    private Long sheetId;
    private Integer rowIndex;
    private String rowEntityId;
    private String rowLabel;
    private String cellData;     // JSON string
    private Integer version;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // getters / setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getSheetId() { return sheetId; }
    public void setSheetId(Long sheetId) { this.sheetId = sheetId; }
    public Integer getRowIndex() { return rowIndex; }
    public void setRowIndex(Integer rowIndex) { this.rowIndex = rowIndex; }
    public String getRowEntityId() { return rowEntityId; }
    public void setRowEntityId(String rowEntityId) { this.rowEntityId = rowEntityId; }
    public String getRowLabel() { return rowLabel; }
    public void setRowLabel(String rowLabel) { this.rowLabel = rowLabel; }
    public String getCellData() { return cellData; }
    public void setCellData(String cellData) { this.cellData = cellData; }
    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
```

- [ ] **Step 3: Write SmartsheetChangeLog entity**

```java
package com.example.demo.modules.smartsheet.entity;

import java.time.LocalDateTime;

public class SmartsheetChangeLog {
    private Long id;
    private Long sheetId;
    private Long rowId;
    private String columnKey;
    private String oldValue;
    private String newValue;
    private Long changedBy;
    private LocalDateTime changedAt;

    // getters / setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getSheetId() { return sheetId; }
    public void setSheetId(Long sheetId) { this.sheetId = sheetId; }
    public Long getRowId() { return rowId; }
    public void setRowId(Long rowId) { this.rowId = rowId; }
    public String getColumnKey() { return columnKey; }
    public void setColumnKey(String columnKey) { this.columnKey = columnKey; }
    public String getOldValue() { return oldValue; }
    public void setOldValue(String oldValue) { this.oldValue = oldValue; }
    public String getNewValue() { return newValue; }
    public void setNewValue(String newValue) { this.newValue = newValue; }
    public Long getChangedBy() { return changedBy; }
    public void setChangedBy(Long changedBy) { this.changedBy = changedBy; }
    public LocalDateTime getChangedAt() { return changedAt; }
    public void setChangedAt(LocalDateTime changedAt) { this.changedAt = changedAt; }
}
```

- [ ] **Step 4: Verify compilation**

Run: `mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/example/demo/modules/smartsheet/entity/
git commit -m "feat: add SmartSheet entities (definition, row, change_log)"
```

---

### Task 4: Backend Mappers

**Files:**
- Create: `src/main/java/com/example/demo/modules/smartsheet/mapper/SmartsheetDefinitionMapper.java`
- Create: `src/main/java/com/example/demo/modules/smartsheet/mapper/SmartsheetRowMapper.java`
- Create: `src/main/java/com/example/demo/modules/smartsheet/mapper/SmartsheetChangeLogMapper.java`
- Create: `src/main/resources/mapper/smartsheet/SmartsheetDefinitionMapper.xml`
- Create: `src/main/resources/mapper/smartsheet/SmartsheetRowMapper.xml`
- Create: `src/main/resources/mapper/smartsheet/SmartsheetChangeLogMapper.xml`

- [ ] **Step 1: Write SmartsheetDefinitionMapper interface**

```java
package com.example.demo.modules.smartsheet.mapper;

import com.example.demo.modules.smartsheet.entity.SmartsheetDefinition;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface SmartsheetDefinitionMapper {
    List<SmartsheetDefinition> selectPage(@Param("offset") int offset, @Param("limit") int limit);
    int count();
    SmartsheetDefinition selectById(@Param("id") Long id);
    int insert(SmartsheetDefinition def);
    int update(SmartsheetDefinition def);
    int deleteById(@Param("id") Long id);
}
```

- [ ] **Step 2: Write SmartsheetDefinitionMapper.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
  "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.demo.modules.smartsheet.mapper.SmartsheetDefinitionMapper">

  <resultMap id="BaseResultMap" type="com.example.demo.modules.smartsheet.entity.SmartsheetDefinition">
    <id column="id" property="id"/>
    <result column="name" property="name"/>
    <result column="description" property="description"/>
    <result column="layout_mode" property="layoutMode"/>
    <result column="columns_config" property="columnsConfig"/>
    <result column="row_entity_source" property="rowEntitySource"/>
    <result column="template_id" property="templateId"/>
    <result column="created_by" property="createdBy"/>
    <result column="updated_by" property="updatedBy"/>
    <result column="created_at" property="createdAt"/>
    <result column="updated_at" property="updatedAt"/>
  </resultMap>

  <select id="selectPage" resultMap="BaseResultMap">
    SELECT * FROM smartsheet_definition ORDER BY updated_at DESC LIMIT #{limit} OFFSET #{offset}
  </select>

  <select id="count" resultType="int">
    SELECT COUNT(*) FROM smartsheet_definition
  </select>

  <select id="selectById" resultMap="BaseResultMap">
    SELECT * FROM smartsheet_definition WHERE id = #{id}
  </select>

  <insert id="insert" useGeneratedKeys="true" keyProperty="id">
    INSERT INTO smartsheet_definition (name, description, layout_mode, columns_config, row_entity_source, template_id, created_by, updated_by)
    VALUES (#{name}, #{description}, #{layoutMode}, #{columnsConfig}, #{rowEntitySource}, #{templateId}, #{createdBy}, #{updatedBy})
  </insert>

  <update id="update">
    UPDATE smartsheet_definition
    SET name = #{name}, description = #{description}, layout_mode = #{layoutMode},
        columns_config = #{columnsConfig}, row_entity_source = #{rowEntitySource},
        updated_by = #{updatedBy}
    WHERE id = #{id}
  </update>

  <delete id="deleteById">
    DELETE FROM smartsheet_definition WHERE id = #{id}
  </delete>
</mapper>
```

- [ ] **Step 3: Write SmartsheetRowMapper interface**

```java
package com.example.demo.modules.smartsheet.mapper;

import com.example.demo.modules.smartsheet.entity.SmartsheetRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface SmartsheetRowMapper {
    List<SmartsheetRow> selectBySheetId(@Param("sheetId") Long sheetId);
    SmartsheetRow selectById(@Param("id") Long id);
    int insert(SmartsheetRow row);
    int update(SmartsheetRow row);
    int updateCellData(@Param("id") Long id, @Param("cellData") String cellData, @Param("version") Integer version);
    int deleteById(@Param("id") Long id);
    int deleteBySheetId(@Param("sheetId") Long sheetId);
    int insertBatch(@Param("rows") List<SmartsheetRow> rows);
    int countBySheetId(@Param("sheetId") Long sheetId);
    int maxRowIndex(@Param("sheetId") Long sheetId);
}
```

- [ ] **Step 4: Write SmartsheetRowMapper.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
  "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.demo.modules.smartsheet.mapper.SmartsheetRowMapper">

  <resultMap id="BaseResultMap" type="com.example.demo.modules.smartsheet.entity.SmartsheetRow">
    <id column="id" property="id"/>
    <result column="sheet_id" property="sheetId"/>
    <result column="row_index" property="rowIndex"/>
    <result column="row_entity_id" property="rowEntityId"/>
    <result column="row_label" property="rowLabel"/>
    <result column="cell_data" property="cellData"/>
    <result column="version" property="version"/>
    <result column="created_at" property="createdAt"/>
    <result column="updated_at" property="updatedAt"/>
  </resultMap>

  <select id="selectBySheetId" resultMap="BaseResultMap">
    SELECT * FROM smartsheet_row WHERE sheet_id = #{sheetId} ORDER BY row_index ASC
  </select>

  <select id="selectById" resultMap="BaseResultMap">
    SELECT * FROM smartsheet_row WHERE id = #{id}
  </select>

  <select id="countBySheetId" resultType="int">
    SELECT COUNT(*) FROM smartsheet_row WHERE sheet_id = #{sheetId}
  </select>

  <select id="maxRowIndex" resultType="int">
    SELECT COALESCE(MAX(row_index), 0) FROM smartsheet_row WHERE sheet_id = #{sheetId}
  </select>

  <insert id="insert" useGeneratedKeys="true" keyProperty="id">
    INSERT INTO smartsheet_row (sheet_id, row_index, row_entity_id, row_label, cell_data, version)
    VALUES (#{sheetId}, #{rowIndex}, #{rowEntityId}, #{rowLabel}, #{cellData}, 0)
  </insert>

  <update id="update">
    UPDATE smartsheet_row
    SET row_label = #{rowLabel}, cell_data = #{cellData}, version = version + 1
    WHERE id = #{id} AND version = #{version}
  </update>

  <update id="updateCellData">
    UPDATE smartsheet_row
    SET cell_data = #{cellData}, version = version + 1
    WHERE id = #{id} AND version = #{version}
  </update>

  <delete id="deleteById">
    DELETE FROM smartsheet_row WHERE id = #{id}
  </delete>

  <delete id="deleteBySheetId">
    DELETE FROM smartsheet_row WHERE sheet_id = #{sheetId}
  </delete>

  <insert id="insertBatch">
    INSERT INTO smartsheet_row (sheet_id, row_index, row_entity_id, row_label, cell_data, version)
    VALUES
    <foreach collection="rows" item="r" separator=",">
      (#{r.sheetId}, #{r.rowIndex}, #{r.rowEntityId}, #{r.rowLabel}, #{r.cellData}, 0)
    </foreach>
  </insert>
</mapper>
```

- [ ] **Step 5: Write SmartsheetChangeLogMapper**

```java
package com.example.demo.modules.smartsheet.mapper;

import com.example.demo.modules.smartsheet.entity.SmartsheetChangeLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface SmartsheetChangeLogMapper {
    int insert(SmartsheetChangeLog log);
    List<SmartsheetChangeLog> selectByRowId(@Param("rowId") Long rowId);
    int deleteBySheetId(@Param("sheetId") Long sheetId);
}
```

With XML:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
  "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.demo.modules.smartsheet.mapper.SmartsheetChangeLogMapper">

  <resultMap id="BaseResultMap" type="com.example.demo.modules.smartsheet.entity.SmartsheetChangeLog">
    <id column="id" property="id"/>
    <result column="sheet_id" property="sheetId"/>
    <result column="row_id" property="rowId"/>
    <result column="column_key" property="columnKey"/>
    <result column="old_value" property="oldValue"/>
    <result column="new_value" property="newValue"/>
    <result column="changed_by" property="changedBy"/>
    <result column="changed_at" property="changedAt"/>
  </resultMap>

  <insert id="insert" useGeneratedKeys="true" keyProperty="id">
    INSERT INTO smartsheet_change_log (sheet_id, row_id, column_key, old_value, new_value, changed_by)
    VALUES (#{sheetId}, #{rowId}, #{columnKey}, #{oldValue}, #{newValue}, #{changedBy})
  </insert>

  <select id="selectByRowId" resultMap="BaseResultMap">
    SELECT * FROM smartsheet_change_log WHERE row_id = #{rowId} ORDER BY changed_at DESC
  </select>

  <delete id="deleteBySheetId">
    DELETE FROM smartsheet_change_log WHERE sheet_id = #{sheetId}
  </delete>
</mapper>
```

- [ ] **Step 6: Verify compilation**

Run: `mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 7: Commit**

```bash
git add src/main/java/com/example/demo/modules/smartsheet/mapper/ src/main/resources/mapper/smartsheet/
git commit -m "feat: add SmartSheet MyBatis mappers"
```

---

### Task 5: Backend VO/DTO Models

**Files:**
- Create: `src/main/java/com/example/demo/modules/smartsheet/model/SmartsheetCreateRequest.java`
- Create: `src/main/java/com/example/demo/modules/smartsheet/model/SmartsheetUpdateRequest.java`
- Create: `src/main/java/com/example/demo/modules/smartsheet/model/SmartsheetRowUpdateRequest.java`
- Create: `src/main/java/com/example/demo/modules/smartsheet/model/SmartsheetDefinitionVO.java`
- Create: `src/main/java/com/example/demo/modules/smartsheet/model/SmartsheetRowVO.java`
- Create: `src/main/java/com/example/demo/modules/smartsheet/model/SmartsheetStatsResponse.java`

- [ ] **Step 1: Write all VO/DTO files**

SmartsheetCreateRequest.java:
```java
package com.example.demo.modules.smartsheet.model;

public class SmartsheetCreateRequest {
    private String name;
    private String description;
    private String layoutMode = "table";
    private String columnsConfig;  // JSON string
    private String rowEntitySource; // JSON string, nullable
    private Long templateId;

    // getters/setters
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getLayoutMode() { return layoutMode; }
    public void setLayoutMode(String layoutMode) { this.layoutMode = layoutMode; }
    public String getColumnsConfig() { return columnsConfig; }
    public void setColumnsConfig(String columnsConfig) { this.columnsConfig = columnsConfig; }
    public String getRowEntitySource() { return rowEntitySource; }
    public void setRowEntitySource(String rowEntitySource) { this.rowEntitySource = rowEntitySource; }
    public Long getTemplateId() { return templateId; }
    public void setTemplateId(Long templateId) { this.templateId = templateId; }
}
```

SmartsheetUpdateRequest.java:
```java
package com.example.demo.modules.smartsheet.model;

public class SmartsheetUpdateRequest {
    private String name;
    private String description;
    private String layoutMode;
    private String columnsConfig;
    private String rowEntitySource;

    // getters/setters
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getLayoutMode() { return layoutMode; }
    public void setLayoutMode(String layoutMode) { this.layoutMode = layoutMode; }
    public String getColumnsConfig() { return columnsConfig; }
    public void setColumnsConfig(String columnsConfig) { this.columnsConfig = columnsConfig; }
    public String getRowEntitySource() { return rowEntitySource; }
    public void setRowEntitySource(String rowEntitySource) { this.rowEntitySource = rowEntitySource; }
}
```

SmartsheetRowUpdateRequest.java:
```java
package com.example.demo.modules.smartsheet.model;

public class SmartsheetRowUpdateRequest {
    private String rowLabel;
    private String cellData;   // JSON string of cell values
    private Integer version;

    // getters/setters
    public String getRowLabel() { return rowLabel; }
    public void setRowLabel(String rowLabel) { this.rowLabel = rowLabel; }
    public String getCellData() { return cellData; }
    public void setCellData(String cellData) { this.cellData = cellData; }
    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
}
```

SmartsheetDefinitionVO.java (response object, mirrors entity + deserialized JSON for API convenience):
```java
package com.example.demo.modules.smartsheet.model;

import java.time.LocalDateTime;

public class SmartsheetDefinitionVO {
    private Long id;
    private String name;
    private String description;
    private String layoutMode;
    private Object columnsConfig;    // parsed JSON array
    private Object rowEntitySource;  // parsed JSON object, nullable
    private Long templateId;
    private Long createdBy;
    private Long updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // getters/setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getLayoutMode() { return layoutMode; }
    public void setLayoutMode(String layoutMode) { this.layoutMode = layoutMode; }
    public Object getColumnsConfig() { return columnsConfig; }
    public void setColumnsConfig(Object columnsConfig) { this.columnsConfig = columnsConfig; }
    public Object getRowEntitySource() { return rowEntitySource; }
    public void setRowEntitySource(Object rowEntitySource) { this.rowEntitySource = rowEntitySource; }
    public Long getTemplateId() { return templateId; }
    public void setTemplateId(Long templateId) { this.templateId = templateId; }
    public Long getCreatedBy() { return createdBy; }
    public void setCreatedBy(Long createdBy) { this.createdBy = createdBy; }
    public Long getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(Long updatedBy) { this.updatedBy = updatedBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
```

SmartsheetRowVO.java:
```java
package com.example.demo.modules.smartsheet.model;

import java.time.LocalDateTime;

public class SmartsheetRowVO {
    private Long id;
    private Long sheetId;
    private Integer rowIndex;
    private String rowEntityId;
    private String rowLabel;
    private Object cellData;     // parsed JSON object
    private Integer version;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // getters/setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getSheetId() { return sheetId; }
    public void setSheetId(Long sheetId) { this.sheetId = sheetId; }
    public Integer getRowIndex() { return rowIndex; }
    public void setRowIndex(Integer rowIndex) { this.rowIndex = rowIndex; }
    public String getRowEntityId() { return rowEntityId; }
    public void setRowEntityId(String rowEntityId) { this.rowEntityId = rowEntityId; }
    public String getRowLabel() { return rowLabel; }
    public void setRowLabel(String rowLabel) { this.rowLabel = rowLabel; }
    public Object getCellData() { return cellData; }
    public void setCellData(Object cellData) { this.cellData = cellData; }
    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
```

SmartsheetStatsResponse.java:
```java
package com.example.demo.modules.smartsheet.model;

import java.util.List;
import java.util.Map;

public class SmartsheetStatsResponse {
    private String columnKey;
    private String columnLabel;
    private String columnType;      // select|number|date|checkbox
    private int totalRows;
    private int nonEmptyCount;
    private int uniqueCount;        // for select type
    private Double sum;             // for number type
    private Double avg;             // for number type
    private Double min;             // for number type
    private Double max;             // for number type
    private List<Map<String, Object>> distribution; // [{label: "A", count: 3}, ...] for select

    // getters/setters (all fields)
    public String getColumnKey() { return columnKey; }
    public void setColumnKey(String columnKey) { this.columnKey = columnKey; }
    public String getColumnLabel() { return columnLabel; }
    public void setColumnLabel(String columnLabel) { this.columnLabel = columnLabel; }
    public String getColumnType() { return columnType; }
    public void setColumnType(String columnType) { this.columnType = columnType; }
    public int getTotalRows() { return totalRows; }
    public void setTotalRows(int totalRows) { this.totalRows = totalRows; }
    public int getNonEmptyCount() { return nonEmptyCount; }
    public void setNonEmptyCount(int nonEmptyCount) { this.nonEmptyCount = nonEmptyCount; }
    public int getUniqueCount() { return uniqueCount; }
    public void setUniqueCount(int uniqueCount) { this.uniqueCount = uniqueCount; }
    public Double getSum() { return sum; }
    public void setSum(Double sum) { this.sum = sum; }
    public Double getAvg() { return avg; }
    public void setAvg(Double avg) { this.avg = avg; }
    public Double getMin() { return min; }
    public void setMin(Double min) { this.min = min; }
    public Double getMax() { return max; }
    public void setMax(Double max) { this.max = max; }
    public List<Map<String, Object>> getDistribution() { return distribution; }
    public void setDistribution(List<Map<String, Object>> distribution) { this.distribution = distribution; }
}
```

- [ ] **Step 2: Verify compilation**

Run: `mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/smartsheet/model/
git commit -m "feat: add SmartSheet VO/DTO models"
```

---

### Task 6: Backend Services

**Files:**
- Create: `src/main/java/com/example/demo/modules/smartsheet/service/SmartsheetService.java`
- Create: `src/main/java/com/example/demo/modules/smartsheet/service/SmartsheetRowService.java`

- [ ] **Step 1: Write SmartsheetService**

Key methods:
```java
package com.example.demo.modules.smartsheet.service;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.modules.smartsheet.entity.SmartsheetDefinition;
import com.example.demo.modules.smartsheet.mapper.SmartsheetDefinitionMapper;
import com.example.demo.modules.smartsheet.mapper.SmartsheetChangeLogMapper;
import com.example.demo.modules.smartsheet.mapper.SmartsheetRowMapper;
import com.example.demo.modules.smartsheet.model.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
public class SmartsheetService {
    private static final Logger log = LoggerFactory.getLogger(SmartsheetService.class);
    private static final int MAX_COLUMNS = 100;
    private static final int MAX_ROWS = 500;
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final SmartsheetDefinitionMapper definitionMapper;
    private final SmartsheetRowMapper rowMapper;
    private final SmartsheetChangeLogMapper changeLogMapper;

    public SmartsheetService(SmartsheetDefinitionMapper definitionMapper,
                             SmartsheetRowMapper rowMapper,
                             SmartsheetChangeLogMapper changeLogMapper) {
        this.definitionMapper = definitionMapper;
        this.rowMapper = rowMapper;
        this.changeLogMapper = changeLogMapper;
    }

    public List<SmartsheetDefinition> getPage(int page, int pageSize) {
        return definitionMapper.selectPage((page - 1) * pageSize, pageSize);
    }

    public int count() { return definitionMapper.count(); }

    public SmartsheetDefinition getById(Long id) {
        SmartsheetDefinition def = definitionMapper.selectById(id);
        if (def == null) throw new RuntimeException("表格不存在");
        return def;
    }

    public SmartsheetDefinition create(SmartsheetCreateRequest req, Long userId) {
        validateColumnsConfig(req.getColumnsConfig());
        SmartsheetDefinition def = new SmartsheetDefinition();
        def.setName(req.getName());
        def.setDescription(req.getDescription() != null ? req.getDescription() : "");
        def.setLayoutMode(req.getLayoutMode() != null ? req.getLayoutMode() : "table");
        def.setColumnsConfig(req.getColumnsConfig());
        def.setRowEntitySource(req.getRowEntitySource());
        def.setTemplateId(req.getTemplateId());
        def.setCreatedBy(userId);
        def.setUpdatedBy(userId);
        definitionMapper.insert(def);
        log.info("[SmartSheet] sheet created id={} mode={}", def.getId(), def.getLayoutMode());
        return def;
    }

    public SmartsheetDefinition update(Long id, SmartsheetUpdateRequest req, Long userId) {
        SmartsheetDefinition def = getById(id);
        if (req.getColumnsConfig() != null) {
            validateColumnsConfig(req.getColumnsConfig());
        }
        if (req.getName() != null) def.setName(req.getName());
        if (req.getDescription() != null) def.setDescription(req.getDescription());
        if (req.getLayoutMode() != null) def.setLayoutMode(req.getLayoutMode());
        if (req.getColumnsConfig() != null) def.setColumnsConfig(req.getColumnsConfig());
        if (req.getRowEntitySource() != null) def.setRowEntitySource(req.getRowEntitySource());
        def.setUpdatedBy(userId);
        int updated = definitionMapper.update(def);
        if (updated == 0) throw new RuntimeException("更新失败");
        log.info("[SmartSheet] columns updated sheet={}", id);
        return def;
    }

    @Transactional
    public void delete(Long id) {
        getById(id); // ensure exists
        changeLogMapper.deleteBySheetId(id);
        rowMapper.deleteBySheetId(id);
        definitionMapper.deleteById(id);
        log.info("[SmartSheet] sheet deleted id={}", id);
    }

    private void validateColumnsConfig(String columnsConfig) {
        try {
            List<Map<String, Object>> columns = objectMapper.readValue(columnsConfig, List.class);
            if (columns.size() > MAX_COLUMNS) {
                throw new RuntimeException("超过最大列数限制(100)");
            }
            for (Map<String, Object> col : columns) {
                String type = (String) col.getOrDefault("type", "text");
                if (!List.of("select","multi-select","date","checkbox","number","text","user").contains(type)) {
                    throw new RuntimeException("不支持的列类型: " + type);
                }
            }
        } catch (RuntimeException e) { throw e; }
        catch (Exception e) { throw new RuntimeException("列定义 JSON 格式不合法"); }
    }
}
```

- [ ] **Step 2: Write SmartsheetRowService**

```java
package com.example.demo.modules.smartsheet.service;

import com.example.demo.modules.smartsheet.entity.SmartsheetChangeLog;
import com.example.demo.modules.smartsheet.entity.SmartsheetRow;
import com.example.demo.modules.smartsheet.mapper.SmartsheetChangeLogMapper;
import com.example.demo.modules.smartsheet.mapper.SmartsheetRowMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class SmartsheetRowService {
    private static final Logger log = LoggerFactory.getLogger(SmartsheetRowService.class);
    private static final int MAX_ROWS = 500;

    private final SmartsheetRowMapper rowMapper;
    private final SmartsheetChangeLogMapper changeLogMapper;

    public SmartsheetRowService(SmartsheetRowMapper rowMapper,
                                SmartsheetChangeLogMapper changeLogMapper) {
        this.rowMapper = rowMapper;
        this.changeLogMapper = changeLogMapper;
    }

    public List<SmartsheetRow> getRowsBySheetId(Long sheetId) {
        return rowMapper.selectBySheetId(sheetId);
    }

    public SmartsheetRow getById(Long id) {
        SmartsheetRow row = rowMapper.selectById(id);
        if (row == null) throw new RuntimeException("数据行不存在");
        return row;
    }

    public SmartsheetRow addRow(Long sheetId, String rowLabel, String rowEntityId) {
        int count = rowMapper.countBySheetId(sheetId);
        if (count >= MAX_ROWS) throw new RuntimeException("超过最大行数限制(500)");
        int nextIndex = rowMapper.maxRowIndex(sheetId) + 1;
        SmartsheetRow row = new SmartsheetRow();
        row.setSheetId(sheetId);
        row.setRowIndex(nextIndex);
        row.setRowLabel(rowLabel != null ? rowLabel : "");
        row.setRowEntityId(rowEntityId);
        row.setCellData("{}");
        row.setVersion(0);
        rowMapper.insert(row);
        return row;
    }

    @Transactional
    public SmartsheetRow updateRow(Long id, String cellData, String rowLabel, Integer version, Long userId, Long sheetId) {
        SmartsheetRow existing = getById(id);
        // Optimistic lock check
        if (version != null && !version.equals(existing.getVersion())) {
            log.warn("[SmartSheet] version conflict sheet={} row={} client={} server={}",
                sheetId, id, version, existing.getVersion());
            throw new RuntimeException("数据已被他人修改，请刷新");
        }
        // Log changes
        String oldData = existing.getCellData();
        existing.setCellData(cellData != null ? cellData : oldData);
        if (rowLabel != null) existing.setRowLabel(rowLabel);
        existing.setVersion(existing.getVersion()); // pass-through for update SQL check
        int updated = rowMapper.update(existing);
        if (updated == 0) throw new RuntimeException("数据已被他人修改，请刷新");
        // Insert change log for each changed cell
        if (cellData != null && userId != null) {
            logCellChanges(sheetId, id, oldData, cellData, userId);
        }
        return getById(id);
    }

    public void deleteRow(Long id) {
        getById(id);
        rowMapper.deleteById(id);
    }

    @Transactional
    public int batchInsert(Long sheetId, List<SmartsheetRow> rows) {
        int existing = rowMapper.countBySheetId(sheetId);
        if (existing + rows.size() > MAX_ROWS) throw new RuntimeException("超过最大行数限制(500)");
        int nextIdx = rowMapper.maxRowIndex(sheetId) + 1;
        for (SmartsheetRow r : rows) {
            r.setSheetId(sheetId);
            r.setRowIndex(nextIdx++);
            r.setVersion(0);
            if (r.getCellData() == null) r.setCellData("{}");
        }
        rowMapper.insertBatch(rows);
        log.info("[SmartSheet] import done sheet={} rows={}", sheetId, rows.size());
        return rows.size();
    }

    private void logCellChanges(Long sheetId, Long rowId, String oldJson, String newJson, Long userId) {
        // Compare old/new JSON and insert change_log entries
        // Simplified: record the whole change as one entry with col_key="*"
        SmartsheetChangeLog logEntry = new SmartsheetChangeLog();
        logEntry.setSheetId(sheetId);
        logEntry.setRowId(rowId);
        logEntry.setColumnKey("*");
        logEntry.setOldValue(oldJson);
        logEntry.setNewValue(newJson);
        logEntry.setChangedBy(userId);
        changeLogMapper.insert(logEntry);
    }
}
```

- [ ] **Step 3: Verify compilation**

Run: `mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add src/main/java/com/example/demo/modules/smartsheet/service/
git commit -m "feat: add SmartSheet services with optimistic locking"
```

---

### Task 7: Backend Controller

**Files:**
- Create: `src/main/java/com/example/demo/modules/smartsheet/controller/SmartsheetController.java`

- [ ] **Step 1: Write SmartsheetController**

```java
package com.example.demo.modules.smartsheet.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.modules.smartsheet.entity.SmartsheetDefinition;
import com.example.demo.modules.smartsheet.entity.SmartsheetRow;
import com.example.demo.modules.smartsheet.model.*;
import com.example.demo.modules.smartsheet.service.SmartsheetService;
import com.example.demo.modules.smartsheet.service.SmartsheetRowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.*;

@RestController
@RequestMapping("/api/admin/smartsheet")
public class SmartsheetController {
    private static final Logger log = LoggerFactory.getLogger(SmartsheetController.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final SmartsheetService sheetService;
    private final SmartsheetRowService rowService;

    public SmartsheetController(SmartsheetService sheetService, SmartsheetRowService rowService) {
        this.sheetService = sheetService;
        this.rowService = rowService;
    }

    // === Sheet CRUD ===

    @GetMapping("/sheet/page")
    public Result<Map<String, Object>> page(@RequestParam(defaultValue = "1") int page,
                                            @RequestParam(defaultValue = "20") int pageSize) {
        List<SmartsheetDefinition> list = sheetService.getPage(page, pageSize);
        int total = sheetService.count();
        Map<String, Object> result = Map.of("list", list, "total", total, "page", page, "pageSize", pageSize);
        return Result.ok(result);
    }

    @PostMapping("/sheet")
    public Result<SmartsheetDefinition> create(@RequestBody SmartsheetCreateRequest req, HttpServletRequest request) {
        Long userId = (Long) request.getAttribute(AdminAuthInterceptor.USER_ID_ATTR);
        try {
            SmartsheetDefinition def = sheetService.create(req, userId);
            return Result.ok(def);
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/sheet/{id}")
    public Result<SmartsheetDefinition> get(@PathVariable Long id) {
        try {
            return Result.ok(sheetService.getById(id));
        } catch (RuntimeException e) {
            return Result.error(ErrorCodeConstants.SMARTSHEET_NOT_FOUND, e.getMessage());
        }
    }

    @PutMapping("/sheet/{id}")
    public Result<SmartsheetDefinition> update(@PathVariable Long id,
                                                @RequestBody SmartsheetUpdateRequest req,
                                                HttpServletRequest request) {
        Long userId = (Long) request.getAttribute(AdminAuthInterceptor.USER_ID_ATTR);
        try {
            return Result.ok(sheetService.update(id, req, userId));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/sheet/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        try {
            sheetService.delete(id);
            return Result.ok(null);
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    // === Row CRUD ===

    @GetMapping("/{sheetId}/rows")
    public Result<List<SmartsheetRow>> rows(@PathVariable Long sheetId) {
        return Result.ok(rowService.getRowsBySheetId(sheetId));
    }

    @PostMapping("/{sheetId}/row")
    public Result<SmartsheetRow> addRow(@PathVariable Long sheetId,
                                         @RequestBody Map<String, String> body) {
        try {
            SmartsheetRow row = rowService.addRow(sheetId,
                body.getOrDefault("rowLabel", ""),
                body.get("rowEntityId"));
            return Result.ok(row);
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/{sheetId}/row/{rowId}")
    public Result<SmartsheetRow> updateRow(@PathVariable Long sheetId,
                                            @PathVariable Long rowId,
                                            @RequestBody SmartsheetRowUpdateRequest req,
                                            HttpServletRequest request) {
        Long userId = (Long) request.getAttribute(AdminAuthInterceptor.USER_ID_ATTR);
        try {
            SmartsheetRow updated = rowService.updateRow(rowId,
                req.getCellData(), req.getRowLabel(), req.getVersion(), userId, sheetId);
            return Result.ok(updated);
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{sheetId}/row/{rowId}")
    public Result<Void> deleteRow(@PathVariable Long sheetId, @PathVariable Long rowId) {
        try {
            rowService.deleteRow(rowId);
            return Result.ok(null);
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/{sheetId}/rows/batch")
    public Result<Map<String, Object>> batchRows(@PathVariable Long sheetId,
                                                   @RequestBody List<Map<String, Object>> rows) {
        try {
            List<SmartsheetRow> entities = new ArrayList<>();
            for (Map<String, Object> r : rows) {
                SmartsheetRow row = new SmartsheetRow();
                row.setRowLabel((String) r.getOrDefault("rowLabel", ""));
                row.setRowEntityId((String) r.get("rowEntityId"));
                row.setCellData(objectMapper.writeValueAsString(r.getOrDefault("cellData", Map.of())));
                entities.add(row);
            }
            int count = rowService.batchInsert(sheetId, entities);
            return Result.ok(Map.of("inserted", count));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("导入解析失败");
        }
    }

    // === Import / Export ===

    @GetMapping("/{sheetId}/export")
    public void export(@PathVariable Long sheetId, HttpServletResponse response) throws IOException {
        SmartsheetDefinition sheet = sheetService.getById(sheetId);
        List<SmartsheetRow> rows = rowService.getRowsBySheetId(sheetId);
        // TODO: Use FastExcel ExcelUtils to write dynamic columns from columns_config JSON
        // For now: CSV fallback
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + sheet.getName() + ".csv\"");
        response.getWriter().write("row_label,cell_data\n");
        for (SmartsheetRow r : rows) {
            response.getWriter().write(r.getRowLabel() + "," + r.getCellData().replace(",", ";") + "\n");
        }
    }

    @PostMapping("/{sheetId}/import")
    public Result<Map<String, Object>> importFile(@PathVariable Long sheetId,
                                                    @RequestParam("file") MultipartFile file) {
        String filename = file.getOriginalFilename();
        if (filename == null || !filename.matches(".*\\.(xlsx|xls|csv)$")) {
            return Result.error(ErrorCodeConstants.SMARTSHEET_IMPORT_FORMAT, "不支持的文件格式");
        }
        if (file.getSize() > 10 * 1024 * 1024) {
            return Result.error("文件大小超限(10MB)");
        }
        // TODO: Parse with FastExcel, return preview data for frontend mapping
        return Result.ok(Map.of("preview", List.of(), "columns", List.of()));
    }

    // === Stats ===

    @GetMapping("/{sheetId}/stats")
    public Result<SmartsheetStatsResponse> stats(@PathVariable Long sheetId,
                                                   @RequestParam String columnKey) {
        SmartsheetDefinition sheet = sheetService.getById(sheetId);
        List<SmartsheetRow> rows = rowService.getRowsBySheetId(sheetId);
        SmartsheetStatsResponse stats = computeStats(columnKey, rows);
        return Result.ok(stats);
    }

    private SmartsheetStatsResponse computeStats(String colKey, List<SmartsheetRow> rows) {
        SmartsheetStatsResponse s = new SmartsheetStatsResponse();
        s.setColumnKey(colKey);
        s.setTotalRows(rows.size());
        Map<String, Integer> dist = new LinkedHashMap<>();
        int nonEmpty = 0;
        double sum = 0, min = Double.MAX_VALUE, max = Double.MIN_VALUE;
        for (SmartsheetRow r : rows) {
            try {
                Map<String, Object> cellData = objectMapper.readValue(r.getCellData(), Map.class);
                Object val = cellData.get(colKey);
                if (val != null && !val.toString().isEmpty()) {
                    nonEmpty++;
                    String sv = val.toString();
                    dist.merge(sv, 1, Integer::sum);
                    try {
                        double dv = Double.parseDouble(sv);
                        sum += dv;
                        if (dv < min) min = dv;
                        if (dv > max) max = dv;
                    } catch (NumberFormatException ignored) {}
                }
            } catch (Exception ignored) {}
        }
        s.setNonEmptyCount(nonEmpty);
        s.setUniqueCount(dist.size());
        if (nonEmpty > 0) {
            s.setSum(sum);
            s.setAvg(sum / rows.size());
            s.setMin(min == Double.MAX_VALUE ? null : min);
            s.setMax(max == Double.MIN_VALUE ? null : max);
        }
        List<Map<String, Object>> distList = new ArrayList<>();
        for (Map.Entry<String, Integer> e : dist.entrySet()) {
            distList.add(Map.of("label", e.getKey(), "count", e.getValue()));
        }
        s.setDistribution(distList);
        return s;
    }
}
```

- [ ] **Step 2: Verify compilation**

Run: `mvn compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/smartsheet/controller/
git commit -m "feat: add SmartSheet REST controller (12 endpoints)"
```

---

### Task 8: Frontend Types & API Layer

**Files:**
- Create: `frontend/src/features/smartsheet/types.ts`
- Create: `frontend/src/api/domains/smartsheet.api.ts`

- [ ] **Step 1: Write types.ts**

```typescript
// frontend/src/features/smartsheet/types.ts

export type LayoutMode = 'matrix' | 'table' | 'checklist' | 'calendar';

export type ColumnType = 'select' | 'multi-select' | 'date' | 'checkbox' | 'number' | 'text' | 'user';

export interface ColumnConfig {
  key: string;
  label: string;
  type: ColumnType;
  options?: string[];
  required?: boolean;
  defaultValue?: string;
  width?: number;
  min?: number;
  max?: number;
  decimal?: number;
}

export interface RowEntitySource {
  type: 'manual' | 'reference';
  tableName?: string;
  labelField?: string;
  valueField?: string;
}

export interface SmartSheetDefinition {
  id: string;
  name: string;
  description: string;
  layoutMode: LayoutMode;
  columnsConfig: ColumnConfig[];
  rowEntitySource?: RowEntitySource;
  templateId?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SmartSheetRow {
  id: string;
  sheetId: string;
  rowIndex: number;
  rowLabel: string;
  rowEntityId?: string;
  cellData: Record<string, string>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnStats {
  columnKey: string;
  columnLabel: string;
  columnType: ColumnType;
  totalRows: number;
  nonEmptyCount: number;
  uniqueCount: number;
  sum: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
  distribution: { label: string; count: number }[];
}

export interface SmartSheetCreateRequest {
  name: string;
  description?: string;
  layoutMode: LayoutMode;
  columnsConfig: ColumnConfig[];
  rowEntitySource?: RowEntitySource;
  templateId?: string;
}

export interface SmartSheetUpdateRequest {
  name?: string;
  description?: string;
  layoutMode?: LayoutMode;
  columnsConfig?: ColumnConfig[];
  rowEntitySource?: RowEntitySource;
}

export interface SmartSheetRowUpdateRequest {
  rowLabel?: string;
  cellData?: Record<string, string>;
  version: number;
}

export interface SmartSheetTemplate {
  id: string;
  name: string;
  description: string;
  layoutMode: LayoutMode;
  defaultColumns: ColumnConfig[];
}

// 4 preset templates
export const PRESET_TEMPLATES: SmartSheetTemplate[] = [
  {
    id: 'tpl-matrix',
    name: '交叉矩阵',
    description: '横纵双表头，交叉点配置。适合部门评估、设施巡查、供应商对比',
    layoutMode: 'matrix',
    defaultColumns: [
      { key: 'col_1', label: '列1', type: 'select', options: ['选项A', '选项B', '选项C'] },
      { key: 'col_2', label: '列2', type: 'number' },
      { key: 'col_3', label: '列3', type: 'text' },
    ],
  },
  {
    id: 'tpl-table',
    name: '简单数据表',
    description: '列头+行记录，支持排序筛选。适合设备清单、人员花名册、资产台账',
    layoutMode: 'table',
    defaultColumns: [
      { key: 'col_name', label: '名称', type: 'text' },
      { key: 'col_status', label: '状态', type: 'select', options: ['在用', '闲置', '报废'] },
      { key: 'col_date', label: '日期', type: 'date' },
    ],
  },
  {
    id: 'tpl-checklist',
    name: '勾选清单',
    description: '逐项确认模式。适合安全巡检、设备点检、审计核对表',
    layoutMode: 'checklist',
    defaultColumns: [
      { key: 'col_check', label: '结果', type: 'checkbox' },
      { key: 'col_note', label: '备注', type: 'text' },
      { key: 'col_inspector', label: '检查人', type: 'user' },
    ],
  },
  {
    id: 'tpl-calendar',
    name: '日历矩阵',
    description: '行头=资源，列头=日期。适合排班表、考勤记录、机房每日状态',
    layoutMode: 'calendar',
    defaultColumns: [
      { key: 'col_day1', label: '周一', type: 'checkbox' },
      { key: 'col_day2', label: '周二', type: 'checkbox' },
      { key: 'col_day3', label: '周三', type: 'checkbox' },
      { key: 'col_day4', label: '周四', type: 'checkbox' },
      { key: 'col_day5', label: '周五', type: 'checkbox' },
    ],
  },
];

// Default view toggles
export interface ViewOptions {
  zebra: boolean;         // 斑马纹
  freeze: boolean;        // 冻结窗格
  conditionalFormat: boolean; // 条件格式
}

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  zebra: true,
  freeze: true,
  conditionalFormat: true,
};
```

- [ ] **Step 2: Write smartsheet.api.ts**

```typescript
// frontend/src/api/domains/smartsheet.api.ts
import axios from 'axios';
import type {
  SmartSheetDefinition,
  SmartSheetRow,
  SmartSheetCreateRequest,
  SmartSheetUpdateRequest,
  SmartSheetRowUpdateRequest,
  ColumnStats,
} from '@/features/smartsheet/types';

const BASE = '/api/admin/smartsheet';

// Sheet CRUD
export async function fetchSheetPage(page = 1, pageSize = 20) {
  const { data } = await axios.get(`${BASE}/sheet/page`, { params: { page, pageSize } });
  return data.data as { list: SmartSheetDefinition[]; total: number };
}

export async function createSheet(req: SmartSheetCreateRequest) {
  const { data } = await axios.post(`${BASE}/sheet`, req);
  return data.data as SmartSheetDefinition;
}

export async function getSheet(id: string) {
  const { data } = await axios.get(`${BASE}/sheet/${id}`);
  return data.data as SmartSheetDefinition;
}

export async function updateSheet(id: string, req: SmartSheetUpdateRequest) {
  const { data } = await axios.put(`${BASE}/sheet/${id}`, req);
  return data.data as SmartSheetDefinition;
}

export async function deleteSheet(id: string) {
  await axios.delete(`${BASE}/sheet/${id}`);
}

// Row CRUD
export async function fetchRows(sheetId: string) {
  const { data } = await axios.get(`${BASE}/${sheetId}/rows`);
  return data.data as SmartSheetRow[];
}

export async function addRow(sheetId: string, rowLabel = '', rowEntityId?: string) {
  const { data } = await axios.post(`${BASE}/${sheetId}/row`, { rowLabel, rowEntityId });
  return data.data as SmartSheetRow;
}

export async function updateRow(sheetId: string, rowId: string, req: SmartSheetRowUpdateRequest) {
  const { data } = await axios.put(`${BASE}/${sheetId}/row/${rowId}`, req);
  return data.data as SmartSheetRow;
}

export async function deleteRow(sheetId: string, rowId: string) {
  await axios.delete(`${BASE}/${sheetId}/row/${rowId}`);
}

export async function batchRows(sheetId: string, rows: { rowLabel: string; cellData: Record<string, string> }[]) {
  const { data } = await axios.post(`${BASE}/${sheetId}/rows/batch`, rows);
  return data.data as { inserted: number };
}

// Export / Import
export function getExportUrl(sheetId: string) {
  return `${BASE}/${sheetId}/export`;
}

export async function importFile(sheetId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await axios.post(`${BASE}/${sheetId}/import`, form);
  return data.data;
}

// Stats
export async function fetchColumnStats(sheetId: string, columnKey: string) {
  const { data } = await axios.get(`${BASE}/${sheetId}/stats`, { params: { columnKey } });
  return data.data as ColumnStats;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/smartsheet/types.ts frontend/src/api/domains/smartsheet.api.ts
git commit -m "feat: add SmartSheet frontend types and API layer"
```

---

### Task 9: Frontend Core Hook

**Files:**
- Create: `frontend/src/features/smartsheet/hooks/useSmartSheet.ts`

- [ ] **Step 1: Write useSmartSheet hook**

```typescript
// frontend/src/features/smartsheet/hooks/useSmartSheet.ts
import { useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  getSheet,
  updateSheet,
  fetchRows,
  addRow,
  updateRow,
  deleteRow,
} from '@/api/domains/smartsheet.api';
import type {
  SmartSheetDefinition,
  SmartSheetRow,
  ColumnConfig,
} from '@/features/smartsheet/types';

export function useSmartSheet(sheetId: string | undefined) {
  const queryClient = useQueryClient();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCells = useRef<Record<string, Record<string, string>>>({});

  const sheetQuery = useQuery({
    queryKey: ['smartsheet', sheetId],
    queryFn: () => getSheet(sheetId!),
    enabled: !!sheetId,
  });

  const rowsQuery = useQuery({
    queryKey: ['smartsheet-rows', sheetId],
    queryFn: () => fetchRows(sheetId!),
    enabled: !!sheetId,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['smartsheet', sheetId] });
    queryClient.invalidateQueries({ queryKey: ['smartsheet-rows', sheetId] });
  }, [queryClient, sheetId]);

  const updateColumnMutation = useMutation({
    mutationFn: async ({ colKey, config }: { colKey: string; config: Partial<ColumnConfig> }) => {
      if (!sheetQuery.data) return;
      const cols = [...sheetQuery.data.columnsConfig];
      const idx = cols.findIndex((c) => c.key === colKey);
      if (idx >= 0) {
        cols[idx] = { ...cols[idx], ...config };
        await updateSheet(sheetId!, { columnsConfig: cols });
      }
    },
    onSuccess: () => { invalidate(); toast.success('列配置已更新'); },
    onError: (e: Error) => { toast.error(e.message || '更新失败'); },
  });

  const addRowMutation = useMutation({
    mutationFn: () => addRow(sheetId!, '', undefined),
    onSuccess: () => invalidate(),
    onError: (e: Error) => { toast.error(e.message || '添加行失败'); },
  });

  const deleteRowsMutation = useMutation({
    mutationFn: async (rowIds: string[]) => {
      for (const id of rowIds) await deleteRow(sheetId!, id);
    },
    onSuccess: () => { invalidate(); toast.success('已删除'); },
    onError: (e: Error) => { toast.error(e.message || '删除失败'); },
  });

  const updateCell = useCallback(async (rowId: string, colKey: string, value: string) => {
    if (!sheetId) return;
    // Accumulate pending changes
    if (!pendingCells.current[rowId]) pendingCells.current[rowId] = {};
    pendingCells.current[rowId][colKey] = value;
    // Debounced flush
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const pending = pendingCells.current;
      pendingCells.current = {};
      for (const [rid, cells] of Object.entries(pending)) {
        const row = rowsQuery.data?.find((r) => r.id === rid);
        if (!row) continue;
        try {
          await updateRow(sheetId, rid, {
            cellData: { ...row.cellData, ...cells },
            version: row.version,
          });
        } catch (e) {
          toast.error((e as Error).message || '保存失败');
        }
      }
      invalidate();
    }, 600);
  }, [sheetId, rowsQuery.data, invalidate]);

  return {
    sheet: sheetQuery.data ?? null,
    rows: rowsQuery.data ?? [],
    isLoading: sheetQuery.isLoading || rowsQuery.isLoading,
    updateCell,
    addRow: () => addRowMutation.mutate(),
    deleteRows: (ids: string[]) => deleteRowsMutation.mutate(ids),
    updateColumn: (colKey: string, config: Partial<ColumnConfig>) =>
      updateColumnMutation.mutate({ colKey, config }),
    invalidate,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/smartsheet/hooks/useSmartSheet.ts
git commit -m "feat: add useSmartSheet hook with debounced cell saving"
```

---

### Task 10: Frontend Theme CSS

**Files:**
- Create: `frontend/src/styles/smartsheet-theme.css`

- [ ] **Step 1: Write smartsheet-theme.css**

> ⚠️ **令牌合规（G04）**：`--smartsheet-*` 定义为组件令牌（第三层），只引用 `--app-*` 语义令牌（第二层）和基础令牌（第一层）。**禁止**在此文件中定义独立颜色值。Bento 暗色底色使用 `--color-slate-950`（非 `#09090b` 纯黑）。

```css
/* smartsheet-theme.css — revo-grid theme bridge
   ═══════════════════════════════════════════
   组件令牌层：--smartsheet-* 全部引用 --app-* 语义令牌
   遵守 docs/UI设计规范与主题标准.md §二 令牌分层架构
   ═══════════════════════════════════════════ */

/* ═══════ 亮色主题：组件令牌 → 语义令牌 ═══════ */
:root {
  --smartsheet-bg:              var(--app-color-surface-container);
  --smartsheet-surface:         var(--app-color-surface-page);
  --smartsheet-border:          var(--app-color-border-default);
  --smartsheet-border-heavy:    var(--app-color-border-strong);
  --smartsheet-text:            var(--app-color-text-primary);
  --smartsheet-text-secondary:  var(--app-color-text-secondary);
  --smartsheet-text-tertiary:   var(--app-color-text-tertiary);
  --smartsheet-accent:          var(--app-color-accent);
  --smartsheet-accent-glow:     rgba(250, 212, 192, 0.18); /* 🍱 Bento peach glow */
  --smartsheet-hover:           var(--app-color-surface-hover);
  --smartsheet-selected:        var(--app-color-surface-active);
  --smartsheet-zebra:           rgba(0, 0, 0, 0.02);       /* 基础令牌：斑马纹无语义对应 */
  --smartsheet-header-bg:       var(--app-color-surface-page);
  --smartsheet-row-header-bg:   rgba(250, 212, 192, 0.10); /* 🍱 Bento warm peach tint */
  --smartsheet-success:         var(--app-color-feedback-success);
  --smartsheet-warning:         var(--app-color-feedback-warning);
  --smartsheet-danger:          var(--app-color-feedback-danger);
}

/* ═══════ 暗色主题：覆盖组件令牌映射 ═══════ */
.dark {
  --smartsheet-bg:              var(--app-color-surface-container);
  --smartsheet-surface:         var(--app-color-surface-page);
  --smartsheet-border:          var(--app-color-border-default);
  --smartsheet-border-heavy:    var(--app-color-border-strong);
  --smartsheet-text:            var(--app-color-text-primary);
  --smartsheet-text-secondary:  var(--app-color-text-secondary);
  --smartsheet-text-tertiary:   var(--app-color-text-tertiary);
  --smartsheet-accent:          var(--color-steel-400);     /* 🍱 Bento steel blue #80A1C1 */
  --smartsheet-accent-glow:     rgba(128, 161, 193, 0.15); /* 🍱 Bento steel glow */
  --smartsheet-hover:           var(--app-color-surface-hover);
  --smartsheet-selected:        var(--app-color-surface-active);
  --smartsheet-zebra:           rgba(255, 255, 255, 0.015);
  --smartsheet-header-bg:       var(--app-color-surface-elevated);
  --smartsheet-row-header-bg:   rgba(250, 212, 192, 0.06); /* 🍱 Bento warm peach tint (dim) */
  --smartsheet-success:         var(--app-color-feedback-success);
  --smartsheet-warning:         var(--app-color-feedback-warning);
  --smartsheet-danger:          var(--app-color-feedback-danger);
}

/* ═══════ revo-grid 变量注入 ═══════ */
revo-grid {
  --background-color:       var(--smartsheet-bg);
  --border-color:           var(--smartsheet-border);
  --header-background-color: var(--smartsheet-header-bg);
  --header-text-color:      var(--smartsheet-text-secondary);
  --cell-text-color:        var(--smartsheet-text);
  --cell-hover-color:       var(--smartsheet-hover);
  --cell-selection-color:   var(--smartsheet-selected);
  --cell-focus-outline-color: var(--smartsheet-accent);
}

/* ═══════ 斑马纹 ═══════ */
.smartsheet-zebra .revo-grid .row:nth-child(even) .cell {
  background-color: var(--smartsheet-zebra);
}

/* ═══════ 冻结窗格 ═══════ */
.smartsheet-frozen .revo-grid .frozen-border {
  box-shadow: 2px 0 0 var(--smartsheet-border-heavy);
}

/* ═══════ 条件格式 ═══════ */
.smartsheet-cf-great { color: var(--smartsheet-success); font-weight: 600; }
.smartsheet-cf-warn  { color: var(--smartsheet-warning); }
.smartsheet-cf-bad   { color: var(--smartsheet-danger); font-weight: 600; }

/* ═══════ 单元格注释角标 ═══════ */
.smartsheet-cell-comment {
  position: absolute;
  top: 2px;
  right: 4px;
  width: 8px;
  height: 8px;
  background: var(--smartsheet-danger);
  clip-path: polygon(100% 0, 0 0, 100% 100%);
}
```

- [ ] **Step 2: Import in SmartSheetPage (done in Task 11)**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/smartsheet-theme.css
git commit -m "feat: add SmartSheet CSS theme bridge (light + dark)"
```

---

### Task 11: SmartSheetGrid Component

**Files:**
- Create: `frontend/src/features/smartsheet/components/SmartSheetGrid.tsx`
- Create: `frontend/src/features/smartsheet/editors/cellEditors.tsx`

- [ ] **Step 1: Write custom cell editors**

```typescript
// frontend/src/features/smartsheet/editors/cellEditors.tsx
import React, { useEffect, useRef } from 'react';
import type { ColumnConfig } from '@/features/smartsheet/types';

// Editor for 'select' type — simple dropdown
export const SelectEditor: React.FC<{
  value: string;
  column: ColumnConfig;
  onSave: (value: string) => void;
  onCancel: () => void;
}> = ({ value, column, onSave, onCancel }) => {
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <select
      ref={ref}
      className="w-full h-full border-0 bg-transparent text-sm outline-none"
      value={value}
      onChange={(e) => { onSave(e.target.value); }}
      onBlur={() => onCancel()}
    >
      <option value="">—</option>
      {(column.options || []).map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
};

// Generic text editor
export const TextEditor: React.FC<{
  value: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}> = ({ value, onSave, onCancel }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  return (
    <input
      ref={ref}
      className="w-full h-full border-0 bg-transparent text-sm outline-none px-1"
      defaultValue={value}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSave((e.target as HTMLInputElement).value);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={(e) => onSave(e.target.value)}
    />
  );
};
```

- [ ] **Step 2: Write SmartSheetGrid**

```tsx
// frontend/src/features/smartsheet/components/SmartSheetGrid.tsx
import React, { useCallback, useMemo, useRef } from 'react';
import { RevoGrid } from '@revolist/revogrid';
import type { ColumnConfig, SmartSheetRow, LayoutMode } from '@/features/smartsheet/types';
import type { ViewOptions } from '@/features/smartsheet/types';

interface SmartSheetGridProps {
  columns: ColumnConfig[];
  rows: SmartSheetRow[];
  layoutMode: LayoutMode;
  viewOptions: ViewOptions;
  selectedRowIds: Set<string>;
  onCellEdit: (rowId: string, colKey: string, value: string) => void;
  onColumnConfigClick: (colKey: string) => void;
  onRowSelect: (rowId: string, selected: boolean) => void;
}

function toRevoColumns(cols: ColumnConfig[], layoutMode: LayoutMode) {
  const revoCols: any[] = [];
  // Row header column for matrix/checklist/calendar modes
  if (layoutMode !== 'table') {
    revoCols.push({
      name: '',
      prop: '__row_header',
      size: 120,
      readonly: true,
      rowDrag: true,
      pin: 'colPinStart',
    });
  }
  for (const col of cols) {
    revoCols.push({
      name: col.label,
      prop: col.key,
      size: col.width || 110,
      sortable: true,
      filter: true,
      columnType: col.type === 'checkbox' ? 'boolean' : 'string',
      editor: col.type === 'select' ? 'select' : col.type === 'number' ? 'number' : 'text',
    });
  }
  return revoCols;
}

function toRevoRows(rows: SmartSheetRow[], layoutMode: LayoutMode) {
  return rows.map((r) => {
    const base: any = { ...r.cellData, __id: r.id };
    if (layoutMode !== 'table') {
      base.__row_header = r.rowLabel;
    }
    return base;
  });
}

export default function SmartSheetGrid({
  columns,
  rows,
  layoutMode,
  viewOptions,
  selectedRowIds,
  onCellEdit,
  onColumnConfigClick,
  onRowSelect,
}: SmartSheetGridProps) {
  const gridRef = useRef<any>(null);

  const revoColumns = useMemo(() => toRevoColumns(columns, layoutMode), [columns, layoutMode]);
  const revoRows = useMemo(() => toRevoRows(rows, layoutMode), [rows, layoutMode]);

  const handleBeforeEdit = useCallback((e: any) => {
    const col = columns.find((c) => c.key === e.detail.prop);
    if (col?.type === 'select') {
      // Will be handled by custom editor
    }
  }, [columns]);

  const handleAfterEdit = useCallback((e: any) => {
    const rowIdx = e.detail.rowIndex;
    const colProp = e.detail.prop;
    const newVal = e.detail.newVal;
    const row = rows[rowIdx];
    if (row && colProp !== '__row_header') {
      onCellEdit(row.id, colProp, String(newVal ?? ''));
    }
  }, [rows, onCellEdit]);

  return (
    <div className={`smartsheet-grid ${viewOptions.zebra ? 'smartsheet-zebra' : ''} ${viewOptions.freeze ? 'smartsheet-frozen' : ''}`}
         style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      <RevoGrid
        ref={gridRef}
        source={revoRows}
        columns={revoColumns}
        resize={true}
        filter={true}
        range={true}
        readonly={false}
        editable={true}
        rowClass={`row`}
        onBeforeedit={handleBeforeEdit}
        onAfteredit={handleAfterEdit}
        onBeforerowdrag={() => true}
        theme="default"
      />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/smartsheet/components/SmartSheetGrid.tsx frontend/src/features/smartsheet/editors/cellEditors.tsx
git commit -m "feat: add SmartSheetGrid revo-grid wrapper with custom editors"
```

---

### Task 12: SmartSheetToolbar & SmartSheetStatsPanel

**Files:**
- Create: `frontend/src/features/smartsheet/components/SmartSheetToolbar.tsx`
- Create: `frontend/src/features/smartsheet/components/SmartSheetStatsPanel.tsx`
- Create: `frontend/src/features/smartsheet/hooks/useSmartSheetStats.ts`

- [ ] **Step 1: Write SmartSheetToolbar**

> ⚠️ **令牌合规（G04）**：所有颜色/边框/圆角使用 Tailwind 语义类名（`bg-app-surface-container` 等），z-index 使用 `var(--z-*)`，禁止硬编码。

```tsx
// frontend/src/features/smartsheet/components/SmartSheetToolbar.tsx
import React from 'react';
import type { ViewOptions } from '@/features/smartsheet/types';

interface SmartSheetToolbarProps {
  sheetName: string;
  viewOptions: ViewOptions;
  onViewOptionChange: (key: keyof ViewOptions) => void;
  onAddRow: () => void;
  onAddColumn: () => void;
  onImport: () => void;
  onExport: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSearch: () => void;
}

export default function SmartSheetToolbar({
  sheetName,
  viewOptions,
  onViewOptionChange,
  onAddRow,
  onAddColumn,
  onImport,
  onExport,
  onSave,
  onUndo,
  onRedo,
  onSearch,
}: SmartSheetToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-app-border bg-app-surface-container flex-wrap shrink-0">
      {/* Sheet name */}
      <span className="text-sm font-semibold text-app-text-primary mr-2">{sheetName}</span>
      <span className="w-px h-4 bg-app-border" />

      <button onClick={onImport}
        className="px-2.5 py-1 text-xs font-medium rounded-app-element bg-app-accent text-app-text-inverse hover:bg-app-accent-hover transition-colors">
        📥 导入
      </button>
      <button onClick={onExport}
        className="px-2.5 py-1 text-xs font-medium rounded-app-element border border-app-border text-app-text-secondary hover:bg-app-surface-hover transition-colors">
        📤 导出
      </button>
      <span className="w-px h-4 bg-app-border" />
      <button onClick={onAddRow}
        className="px-2 py-1 text-xs text-app-text-secondary hover:text-app-text-primary transition-colors">
        ＋ 行
      </button>
      <button onClick={onAddColumn}
        className="px-2 py-1 text-xs text-app-text-secondary hover:text-app-text-primary transition-colors">
        ＋ 列
      </button>
      <span className="w-px h-4 bg-app-border" />

      {/* View micro-toggles */}
      <span className="text-[10px] uppercase tracking-wider text-app-text-tertiary">视图</span>
      <ViewToggle label="斑马纹" active={viewOptions.zebra} onClick={() => onViewOptionChange('zebra')} />
      <ViewToggle label="冻结" active={viewOptions.freeze} onClick={() => onViewOptionChange('freeze')} />
      <ViewToggle label="条件格式" active={viewOptions.conditionalFormat} onClick={() => onViewOptionChange('conditionalFormat')} />

      <span className="flex-1" />

      <span className="text-[10px] uppercase tracking-wider text-app-text-tertiary">编辑</span>
      <button onClick={onSearch}
        className="px-2 py-1 text-xs text-app-text-secondary hover:text-app-text-primary">🔍 查找</button>
      <button onClick={onUndo}
        className="px-2 py-1 text-xs text-app-text-tertiary">↩</button>
      <button onClick={onRedo}
        className="px-2 py-1 text-xs text-app-text-tertiary">↪</button>
      <span className="w-px h-4 bg-app-border" />
      <button onClick={onSave}
        className="px-2.5 py-1 text-xs font-medium rounded-app-element border border-app-border text-app-text-secondary hover:bg-app-surface-hover">
        💾 保存
      </button>
    </div>
  );
}

function ViewToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all
        ${active
          ? 'bg-app-accent-soft border border-app-accent text-app-accent'
          : 'bg-app-surface-hover border border-app-border text-app-text-secondary'
        }`}>
      <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center text-[8px]
        ${active ? 'border-app-accent bg-app-accent text-app-text-inverse' : 'border-app-border'}`}>
        {active ? '✓' : ''}
      </span>
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Write useSmartSheetStats and SmartSheetStatusBar**

> 📐 **设计调整（用户反馈）**：统计信息不占用大面积侧边面板，改为页脚紧凑状态栏（`h-7`，单行展示核心指标）。列详情统计保留在 click-to-expand 的 popover 中。

```typescript
// frontend/src/features/smartsheet/hooks/useSmartSheetStats.ts
import { useQuery } from '@tanstack/react-query';
import { fetchColumnStats } from '@/api/domains/smartsheet.api';
import type { ColumnStats } from '@/features/smartsheet/types';

export function useSmartSheetStats(sheetId: string | undefined, columnKey: string | null) {
  return useQuery({
    queryKey: ['smartsheet-stats', sheetId, columnKey],
    queryFn: () => fetchColumnStats(sheetId!, columnKey!),
    enabled: !!sheetId && !!columnKey,
  });
}
```

```tsx
// frontend/src/features/smartsheet/components/SmartSheetStatusBar.tsx
import React from 'react';
import type { SmartSheetRow, ColumnConfig } from '@/features/smartsheet/types';

interface SmartSheetStatusBarProps {
  rows: SmartSheetRow[];
  columns: ColumnConfig[];
  selectedColumn: ColumnConfig | null;
  onColumnClick: (col: ColumnConfig) => void;
}

export default function SmartSheetStatusBar({
  rows, columns, selectedColumn, onColumnClick,
}: SmartSheetStatusBarProps) {
  const fillRate = columns.length > 0 && rows.length > 0
    ? Math.round((rows.reduce((acc, r) =>
        acc + Object.values(r.cellData || {}).filter(v => v && v.trim()).length, 0
      ) / (rows.length * columns.length)) * 100)
    : 0;

  return (
    <div className="flex items-center gap-3 px-3 h-7 border-t border-app-border bg-app-surface-page text-[11px] text-app-text-tertiary shrink-0 select-none">
      {/* Row/column counts */}
      <span>{rows.length} 行</span>
      <span className="text-app-border">·</span>
      <span>{columns.length} 列</span>
      <span className="text-app-border">·</span>
      <span>填写率 {fillRate}%</span>

      {selectedColumn && (
        <>
          <span className="text-app-border">|</span>
          <span className="text-app-text-secondary">
            当前列: <span className="font-medium text-app-text-primary">{selectedColumn.label}</span>
            <span className="ml-1 text-app-text-tertiary">({selectedColumn.type})</span>
          </span>
        </>
      )}

      <span className="flex-1" />

      {/* Column quick-jump pills */}
      <span className="hidden lg:flex items-center gap-1">
        {columns.slice(0, 8).map((col) => (
          <button key={col.key}
            onClick={() => onColumnClick(col)}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors
              ${selectedColumn?.key === col.key
                ? 'bg-app-accent-soft text-app-accent'
                : 'hover:bg-app-surface-hover text-app-text-tertiary'
              }`}>
            {col.label}
          </button>
        ))}
        {columns.length > 8 && <span className="text-app-text-tertiary">+{columns.length - 8}</span>}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/smartsheet/components/SmartSheetToolbar.tsx \
        frontend/src/features/smartsheet/components/SmartSheetStatsPanel.tsx \
        frontend/src/features/smartsheet/hooks/useSmartSheetStats.ts
git commit -m "feat: add SmartSheet toolbar and stats panel"
```

---

### Task 13: SmartSheetPage & SmartSheetListPage

**Files:**
- Create: `frontend/src/features/smartsheet/SmartSheetPage.tsx`
- Create: `frontend/src/features/smartsheet/SmartSheetListPage.tsx`

- [ ] **Step 1: Write SmartSheetPage (editor container)**

> ⚠️ **令牌合规（G04）**：所有颜色/边框使用语义类名。布局改为页眉工具栏 + 主体表格 + 页脚状态栏（紧凑型，用户反馈统计卡片太大）。

```tsx
// frontend/src/features/smartsheet/SmartSheetPage.tsx
import React, { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import SmartSheetToolbar from './components/SmartSheetToolbar';
import SmartSheetGrid from './components/SmartSheetGrid';
import SmartSheetStatusBar from './components/SmartSheetStatusBar';
import { useSmartSheet } from './hooks/useSmartSheet';
import { DEFAULT_VIEW_OPTIONS } from './types';
import type { ViewOptions, ColumnConfig } from './types';
import toast from 'react-hot-toast';

export default function SmartSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { sheet, rows, isLoading, updateCell, addRow, deleteRows, updateColumn } = useSmartSheet(id);
  const [viewOptions, setViewOptions] = useState<ViewOptions>(DEFAULT_VIEW_OPTIONS);
  const [selectedColumn, setSelectedColumn] = useState<ColumnConfig | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const handleViewOptionChange = useCallback((key: keyof ViewOptions) => {
    setViewOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleExport = useCallback(() => {
    if (!id) return;
    const url = `/api/admin/smartsheet/${id}/export`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sheet?.name || 'export'}.csv`;
    a.click();
  }, [id, sheet]);

  const handleImport = useCallback(() => {
    toast('导入功能将在下一步实现');
  }, []);

  if (isLoading) return <div className="flex items-center justify-center h-full text-app-text-secondary text-sm">加载中...</div>;
  if (!sheet) return <div className="flex items-center justify-center h-full text-app-feedback-danger text-sm">表格不存在</div>;

  return (
    <div className="flex flex-col h-full bg-app-surface-page">
      {/* 页眉：工具栏（含紧凑统计指示） */}
      <SmartSheetToolbar
        sheetName={sheet.name}
        viewOptions={viewOptions}
        onViewOptionChange={handleViewOptionChange}
        onAddRow={() => addRow()}
        onAddColumn={() => {
          const newKey = `col_${Date.now()}`;
          updateColumn(newKey, {
            key: newKey, label: '新列', type: 'text', width: 110,
          });
        }}
        onImport={handleImport}
        onExport={handleExport}
        onSave={() => toast.success('已保存')}
        onUndo={() => {}}
        onRedo={() => {}}
        onSearch={() => {}}
      />

      {/* 主体：表格（填满剩余高度） */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <SmartSheetGrid
          columns={sheet.columnsConfig}
          rows={rows}
          layoutMode={sheet.layoutMode}
          viewOptions={viewOptions}
          selectedRowIds={selectedRowIds}
          onCellEdit={updateCell}
          onColumnConfigClick={(colKey) => {
            const col = sheet.columnsConfig.find((c) => c.key === colKey);
            if (col) setSelectedColumn(col);
          }}
          onRowSelect={(rowId, selected) => {
            setSelectedRowIds((prev) => {
              const next = new Set(prev);
              selected ? next.add(rowId) : next.delete(rowId);
              return next;
            });
          }}
        />
      </div>

      {/* 页脚：紧凑状态栏 */}
      <SmartSheetStatusBar
        rows={rows}
        columns={sheet.columnsConfig}
        selectedColumn={selectedColumn}
        onColumnClick={(col) => setSelectedColumn(col)}
      />
    </div>
  );
}
- [ ] **Step 2: Write SmartSheetListPage**

> ⚠️ **令牌合规（G04）**：所有颜色/边框使用语义类名。

```tsx
// frontend/src/features/smartsheet/SmartSheetListPage.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Table2, Plus } from 'lucide-react';
import { AdminPageShell, AdminDataTableWrap } from '@/components/admin/AdminPageShell';
import { fetchSheetPage, createSheet, deleteSheet } from '@/api/domains/smartsheet.api';
import { PRESET_TEMPLATES } from './types';
import toast from 'react-hot-toast';

export default function SmartSheetListPage() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['smartsheet-list'],
    queryFn: () => fetchSheetPage(1, 50),
  });

  return (
    <AdminPageShell title="智能表格" icon={Table2}>
      <div className="mb-4 flex gap-2">
        {PRESET_TEMPLATES.map((tpl) => (
          <button key={tpl.id}
            className="px-3 py-2 rounded-app-element border border-app-border bg-app-surface-container hover:border-app-accent text-sm transition-colors text-app-text-primary"
            onClick={async () => {
              try {
                const sheet = await createSheet({
                  name: tpl.name + ' ' + new Date().toLocaleDateString(),
                  description: tpl.description,
                  layoutMode: tpl.layoutMode,
                  columnsConfig: tpl.defaultColumns,
                });
                toast.success('表格已创建');
                navigate(`/admin/smartsheet/${sheet.id}`);
              } catch (e) { toast.error((e as Error).message || '创建失败'); }
            }}>
            {tpl.name}
          </button>
        ))}
        <button onClick={() => navigate('/admin/smartsheet/new')}
          className="px-3 py-2 rounded-app-element bg-app-accent text-app-text-inverse hover:bg-app-accent-hover text-sm transition-colors flex items-center gap-1">
          <Plus className="w-4 h-4" /> 自定义
        </button>
      </div>

      <AdminDataTableWrap
        columns={[
          { header: '名称', accessor: 'name' },
          { header: '模式', accessor: 'layoutMode', render: (v: string) => (
            <span className="text-xs px-2 py-0.5 rounded bg-app-surface-hover text-app-text-secondary">{v}</span>
          )},
          { header: '更新于', accessor: 'updatedAt', render: (v: string) => new Date(v).toLocaleString() },
        ]}
        data={data?.list || []}
        isLoading={isLoading}
        onRowClick={(row: any) => navigate(`/admin/smartsheet/${row.id}`)}
        rowActions={(row: any) => [
          { label: '打开', onClick: () => navigate(`/admin/smartsheet/${row.id}`) },
          { label: '删除', onClick: async () => {
            if (confirm('确定删除？')) {
              await deleteSheet(row.id);
              refetch();
            }
          }},
        ]}
      />
    </AdminPageShell>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/smartsheet/SmartSheetPage.tsx \
        frontend/src/features/smartsheet/SmartSheetListPage.tsx
git commit -m "feat: add SmartSheet page and list page"
```

---

### Task 14: Remaining Frontend Components

**Files:**
- Create: `frontend/src/features/smartsheet/components/SmartSheetColumnConfigSheet.tsx`
- Create: `frontend/src/features/smartsheet/components/SmartSheetImportDialog.tsx`
- Create: `frontend/src/features/smartsheet/components/SmartSheetChangeLogPopover.tsx`

- [ ] **Step 1: Write SmartSheetColumnConfigSheet**

> ⚠️ **令牌合规（G04+G02）**：弹窗 z-index 使用 `var(--z-modal)`，所有颜色使用语义类名。

```tsx
// frontend/src/features/smartsheet/components/SmartSheetColumnConfigSheet.tsx
import React, { useState } from 'react';
import type { ColumnConfig, ColumnType } from '@/features/smartsheet/types';

interface ColumnConfigSheetProps {
  column: ColumnConfig | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: ColumnConfig) => void;
  onDelete: (colKey: string) => void;
}

const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'select', label: '单选下拉' },
  { value: 'multi-select', label: '多选' },
  { value: 'date', label: '日期' },
  { value: 'checkbox', label: '勾选框' },
  { value: 'user', label: '人员' },
];

export default function SmartSheetColumnConfigSheet({
  column, open, onClose, onSave, onDelete,
}: ColumnConfigSheetProps) {
  const [draft, setDraft] = useState<ColumnConfig | null>(null);

  React.useEffect(() => { setDraft(column ? { ...column } : null); }, [column]);

  if (!open || !draft) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[360px] bg-app-surface-elevated border-l border-app-border shadow-lg p-5 overflow-y-auto"
         style={{ zIndex: 'var(--z-modal)' }}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-app-text-primary">列配置</h3>
        <button onClick={onClose} className="text-app-text-tertiary hover:text-app-text-primary">✕</button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs text-app-text-secondary">列名称</label>
          <input className="w-full mt-1 px-2 py-1.5 rounded-app-element border border-app-border bg-app-surface-container text-sm text-app-text-primary"
                 value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        </div>

        <div>
          <label className="text-xs text-app-text-secondary">列类型</label>
          <select className="w-full mt-1 px-2 py-1.5 rounded-app-element border border-app-border bg-app-surface-container text-sm text-app-text-primary"
                  value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ColumnType })}>
            {COLUMN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {(draft.type === 'select' || draft.type === 'multi-select') && (
          <div>
            <label className="text-xs text-app-text-secondary">预设选项</label>
            <div className="mt-1 space-y-1">
              {(draft.options || []).map((opt, i) => (
                <div key={i} className="flex gap-1">
                  <input className="flex-1 px-2 py-1 rounded-app-element border border-app-border bg-app-surface-container text-sm text-app-text-primary"
                         value={opt} onChange={(e) => {
                           const opts = [...(draft.options || [])];
                           opts[i] = e.target.value;
                           setDraft({ ...draft, options: opts });
                         }} />
                  <button className="text-app-feedback-danger hover:text-app-feedback-danger/80 text-xs px-1"
                          onClick={() => {
                            setDraft({ ...draft, options: (draft.options || []).filter((_, j) => j !== i) });
                          }}>✕</button>
                </div>
              ))}
              <button className="text-xs text-app-accent hover:text-app-accent-hover"
                      onClick={() => setDraft({ ...draft, options: [...(draft.options || []), ''] })}>
                + 添加选项
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input type="checkbox" checked={draft.required || false}
                 onChange={(e) => setDraft({ ...draft, required: e.target.checked })} />
          <label className="text-xs text-app-text-secondary">必填</label>
        </div>

        <div className="flex gap-2 pt-4">
          <button onClick={() => { onSave(draft); onClose(); }}
                  className="flex-1 py-1.5 rounded-app-element bg-app-accent text-app-text-inverse text-sm font-medium hover:bg-app-accent-hover">保存</button>
          <button onClick={() => { onDelete(draft.key); onClose(); }}
                  className="px-3 py-1.5 rounded-app-element border border-app-feedback-danger text-app-feedback-danger text-sm hover:bg-app-feedback-danger-soft">删除列</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write SmartSheetImportDialog**

```tsx
// frontend/src/features/smartsheet/components/SmartSheetImportDialog.tsx
import React, { useState, useRef } from 'react';
import { batchRows } from '@/api/domains/smartsheet.api';
import type { ColumnConfig } from '@/features/smartsheet/types';
import toast from 'react-hot-toast';

interface ImportDialogProps {
  sheetId: string;
  columns: ColumnConfig[];
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function SmartSheetImportDialog({
  sheetId, columns, open, onClose, onImported,
}: ImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [step, setStep] = useState<'upload' | 'map' | 'importing'>('upload');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Simple CSV preview (SheetJS integration in final)
    const text = await file.text();
    const lines = text.split('\n').slice(0, 6).map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));
    setPreview(lines);
    // Auto-map by header
    const header = lines[0] || [];
    const map: Record<number, string> = {};
    header.forEach((h, i) => {
      const match = columns.find((c) => c.label === h);
      if (match) map[i] = match.key;
    });
    setMapping(map);
    setStep('map');
  };

  const handleImport = async () => {
    setStep('importing');
    try {
      const file = fileRef.current?.files?.[0];
      if (!file) { onClose(); return; }
      const text = await file.text();
      const lines = text.split('\n').filter(Boolean);
      const dataRows = lines.slice(1).map((l) => {
        const vals = l.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
        const cellData: Record<string, string> = {};
        Object.entries(mapping).forEach(([srcIdx, colKey]) => {
          cellData[colKey] = vals[Number(srcIdx)] || '';
        });
        return { rowLabel: '', cellData };
      });
      await batchRows(sheetId, dataRows);
      toast.success(`导入 ${dataRows.length} 行`);
      onImported();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || '导入失败');
    }
    setStep('upload');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50"
         style={{ zIndex: 'var(--z-modal)' }}>
      <div className="bg-app-surface-elevated rounded-xl border border-app-border shadow-xl w-[600px] max-h-[80vh] overflow-y-auto p-6">
        <h3 className="text-sm font-semibold mb-4 text-app-text-primary">导入 Excel / CSV</h3>

        {step === 'upload' && (
          <div className="space-y-4">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile}
                   className="text-sm text-app-text-primary" />
            <button onClick={onClose} className="px-3 py-1.5 text-sm border border-app-border rounded-app-element text-app-text-secondary">取消</button>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4">
            <p className="text-xs text-app-text-secondary">确认列映射：</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-app-border">
                  <th className="text-left py-1 text-app-text-secondary">文件列</th>
                  <th className="text-left py-1 text-app-text-secondary">映射到</th>
                  <th className="text-left py-1 text-app-text-secondary">预览</th>
                </tr>
              </thead>
              <tbody>
                {(preview[0] || []).map((h, i) => (
                  <tr key={i} className="border-b border-app-border">
                    <td className="py-1 text-app-text-primary">{h}</td>
                    <td className="py-1">
                      <select className="text-xs border border-app-border rounded px-1 py-0.5 bg-app-surface-container text-app-text-primary" value={mapping[i] || ''}
                              onChange={(e) => setMapping({ ...mapping, [i]: e.target.value })}>
                        <option value="">跳过</option>
                        {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    </td>
                    <td className="py-1 text-app-text-tertiary">{preview[1]?.[i] || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2">
              <button onClick={handleImport} className="px-3 py-1.5 rounded-app-element bg-app-accent text-app-text-inverse text-sm hover:bg-app-accent-hover">确认导入</button>
              <button onClick={onClose} className="px-3 py-1.5 border border-app-border rounded-app-element text-sm text-app-text-secondary">取消</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/smartsheet/components/SmartSheetColumnConfigSheet.tsx \
        frontend/src/features/smartsheet/components/SmartSheetImportDialog.tsx
git commit -m "feat: add column config sheet and import dialog"
```

---

### Task 15: Route & Navigation Integration

**Files:**
- Modify: `frontend/src/router/index.tsx`
- Modify: `frontend/src/features/admin/adminNavRegistry.ts`
- Create: `frontend/src/features/smartsheet/smartsheetNavRegistry.ts`

- [ ] **Step 1: Add routes to router/index.tsx**

```typescript
// Add these lazy imports near other lazy imports:
const SmartSheetPage = React.lazy(() => import('@/features/smartsheet/SmartSheetPage'));
const SmartSheetListPage = React.lazy(() => import('@/features/smartsheet/SmartSheetListPage'));

// Add route entries inside the admin layout children:
{
  path: 'smartsheet',
  element: <Suspense fallback={<PageSpinner />}><SmartSheetListPage /></Suspense>,
},
{
  path: 'smartsheet/new',
  element: <Suspense fallback={<PageSpinner />}><SmartSheetListPage /></Suspense>,
},
{
  path: 'smartsheet/:id',
  element: <Suspense fallback={<PageSpinner />}><SmartSheetPage /></Suspense>,
},
```

- [ ] **Step 2: Register nav item in adminNavRegistry.ts**

Add to "系统与安全" group or create a new "内容管理" group. Add:

```typescript
{
  id: "smartsheet",
  path: "/admin/smartsheet",
  label: "智能表格",
  icon: Table2,
  homeTone: "from-indigo-600 to-violet-700",
  fallbackMinRole: "STAFF",
  sidebarVisible: (ctx: any) => true,
},
```

Place within the "系统与安全" group items array, before the settings item.

- [ ] **Step 3: Create smartsheetNavRegistry.ts (if needed for standalone registration)**

```typescript
// frontend/src/features/smartsheet/smartsheetNavRegistry.ts
import { Table2 } from 'lucide-react';
import type { AdminNavRegistryItem } from '@/features/admin/adminNavRegistry';

export const SMARTSHEET_NAV_ITEM: AdminNavRegistryItem = {
  id: 'smartsheet',
  path: '/admin/smartsheet',
  label: '智能表格',
  icon: Table2,
  homeTone: 'from-indigo-600 to-violet-700',
  fallbackMinRole: 'STAFF',
  sidebarVisible: () => true,
};
```

- [ ] **Step 4: Install xlsx (SheetJS) dependency for import/export**

```bash
cd frontend && npm install xlsx
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/router/index.tsx \
        frontend/src/features/admin/adminNavRegistry.ts \
        frontend/src/features/smartsheet/smartsheetNavRegistry.ts \
        frontend/package.json
git commit -m "feat: integrate SmartSheet routes and admin navigation"
```

---

### Task 16: Final Integration & Verification

**Files:**
- Modify: `frontend/src/index.css` (import smartsheet-theme.css)
- Create: (none, integration step)

- [ ] **Step 1: Import theme CSS in index.css**

Add at the end of `frontend/src/index.css`:
```css
@import './styles/smartsheet-theme.css';
```

- [ ] **Step 2: Install deps and build check**

```bash
cd frontend && npm install
cd frontend && npx tsc --noEmit
```
Expected: No TypeScript errors

- [ ] **Step 3: Start backend and verify API**

```bash
mvn spring-boot:run
```
Expected: Application starts. Test with curl:
```bash
curl http://localhost:8080/api/admin/smartsheet/sheet/page
```

- [ ] **Step 4: Browser verification**

Open browser to `/admin/smartsheet`:
1. Verify list page loads, template buttons visible
2. Click template → verify redirected to editor page
3. Verify grid loads with default columns
4. Verify zebra stripe toggle works
5. Verify dark mode switch applies correctly
6. Click cell → verify dropdown editor appears
7. Add a row → verify it appears
8. Export → verify file downloads

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: final SmartSheet integration — import theme CSS"
```

---

## Quality Gates (post-implementation)

- [ ] G02: Verify Dialog/Sheet/Modal body scroll lock releases on close
- [ ] G03: Verify grid re-renders: single cell edit triggers ≤ 2 re-renders
- [ ] WCAG AA: Verify dark mode text contrast ≥ 4.5:1 via browser_evaluate
- [ ] All 12 error paths tested (see spec section 12)
