# Smartsheet V2 — VTable 替换 + 后端重构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端用 VTable 替换手搓表格组件，后端清理重构支持单元格级更新、真正导入导出、模板系统。

**Architecture:** VTable Canvas 渲染替代 @tanstack/react-table DOM 渲染，Spring Boot 后端保持 MyBatis + JSON 列存储，新增单元格级 PATCH API、列类型枚举、策略校验、POI 导入导出。

**Tech Stack:** @visactor/vtable + @visactor/react-vtable + @visactor/vtable-export + @visactor/vtable-search (FE) · Apache POI 5.4.1 + MyBatis + Jackson (BE)

**Design Doc:** [2026-06-13-smartsheet-v2-vtable-design.md](../specs/2026-06-13-smartsheet-v2-vtable-design.md)

---

## Phase 1: 基础设施

### Task 1.1: 数据库迁移

**Files:**
- Create: `src/main/resources/db/migration/V{timestamp}__smartsheet_v2_enhance.sql`

- [ ] **Step 1: 创建迁移 SQL 文件**

```sql
-- V20260613__smartsheet_v2_enhance.sql

ALTER TABLE smartsheet_definition
  ADD COLUMN IF NOT EXISTS row_limit INT DEFAULT 50000 COMMENT '行数上限',
  ADD COLUMN IF NOT EXISTS theme_config JSON COMMENT 'VTable 主题配置',
  ADD COLUMN IF NOT EXISTS is_template TINYINT DEFAULT 0 COMMENT '是否模板';

CREATE INDEX IF NOT EXISTS idx_sheet_row_index ON smartsheet_row(sheet_id, row_index);

ALTER TABLE smartsheet_change_log
  ADD COLUMN IF NOT EXISTS row_index INT COMMENT '行位置快照';
```

- [ ] **Step 2: 注册迁移到 bootstrap**

读取 `src/main/java/com/example/demo/common/bootstrap/EmbeddedTwinSystemCoreDdlBootstrap.java`，在现有 smartsheet bootstrap 之后添加新迁移文件的执行。

- [ ] **Step 3: 执行迁移**

```bash
cd d:/codex/verson.1.2/20260416
# 如果项目运行中，通过 MySQL 客户端执行迁移 SQL
# 否则：启动项目让 EmbeddedTwinSystemCoreDdlBootstrap 自动执行
```

- [ ] **Step 4: Commit**

```bash
git add src/main/resources/db/migration/V20260613__smartsheet_v2_enhance.sql
git commit -m "feat: smartsheet v2 DB migration — row_limit, theme_config, is_template, index"
```

### Task 1.2: 安装 VTable 前端依赖

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: 安装 VTable 包**

```bash
cd d:/codex/verson.1.2/20260416/frontend
npm install @visactor/vtable @visactor/react-vtable @visactor/vtable-export @visactor/vtable-search
```

- [ ] **Step 2: 验证安装**

```bash
node -e "require('@visactor/vtable'); console.log('VTable OK')"
node -e "require('@visactor/react-vtable'); console.log('React-VTable OK')"
```

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add @visactor/vtable deps for smartsheet v2"
```

---

## Phase 2: 后端重构（可并行于 Phase 3 前端）

### Task 2.1: 创建列类型枚举和错误码枚举

**Files:**
- Create: `src/main/java/com/example/demo/modules/smartsheet/enums/ColumnType.java`
- Create: `src/main/java/com/example/demo/modules/smartsheet/enums/SmartsheetErrorCode.java`

- [ ] **Step 1: 创建 ColumnType 枚举**

```java
package com.example.demo.modules.smartsheet.enums;

import java.util.Set;

public enum ColumnType {
    TEXT("text"),
    NUMBER("number"),
    SELECT("select"),
    MULTI_SELECT("multi-select"),
    DATE("date"),
    CHECKBOX("checkbox"),
    USER("user"),
    PROGRESSBAR("progressbar"),
    RADIO("radio");

    private final String value;

    ColumnType(String value) { this.value = value; }

    public String getValue() { return value; }

    public static ColumnType fromValue(String value) {
        for (ColumnType ct : values()) {
            if (ct.value.equals(value)) return ct;
        }
        throw new IllegalArgumentException("不支持的列类型: " + value);
    }

    public static Set<String> validValues() {
        return Set.of("select", "multi-select", "date", "checkbox", "number", "text",
                      "user", "progressbar", "radio");
    }
}
```

- [ ] **Step 2: 创建 SmartsheetErrorCode 枚举**

```java
package com.example.demo.modules.smartsheet.enums;

public enum SmartsheetErrorCode {
    SMARTSHEET_NOT_FOUND(1_006_001, "表格不存在"),
    SMARTSHEET_COLUMN_INVALID(1_006_002, "列定义不合法"),
    SMARTSHEET_TOO_MANY_COLUMNS(1_006_003, "超过最大列数限制(100)"),
    SMARTSHEET_TOO_MANY_ROWS(1_006_004, "超过最大行数限制"),
    SMARTSHEET_VERSION_CONFLICT(1_006_005, "数据已被他人修改，请刷新"),
    SMARTSHEET_IMPORT_FORMAT(1_006_006, "不支持的文件格式，仅接受 .xlsx/.xls/.csv"),
    SMARTSHEET_ROW_NOT_FOUND(1_006_007, "数据行不存在"),
    SMARTSHEET_COLUMN_TYPE_CONFLICT(1_006_008, "列类型变更将清空已有数据"),
    SMARTSHEET_TEMPLATE_NOT_FOUND(1_006_009, "模板不存在"),
    SMARTSHEET_COLUMN_NOT_FOUND(1_006_010, "列不存在"),
    SMARTSHEET_PERMISSION_DENIED(1_006_011, "无权限操作此表格"),
    SMARTSHEET_IMPORT_PARSE_ERROR(1_006_012, "导入文件解析失败");

    private final int code;
    private final String message;

    SmartsheetErrorCode(int code, String message) {
        this.code = code;
        this.message = message;
    }

    public int getCode() { return code; }
    public String getMessage() { return message; }
}
```

- [ ] **Step 3: 在 ErrorCodeConstants 中标记废弃**

在 `src/main/java/com/example/demo/common/exception/ErrorCodeConstants.java:45-54` 的 smartsheet 分段添加 `@Deprecated` 注释，指引使用 `SmartsheetErrorCode` 枚举：

```java
/** 智能表格 smartsheet 1-006-xxx
 *  @deprecated 使用 {@link com.example.demo.modules.smartsheet.enums.SmartsheetErrorCode} */
@Deprecated
public static final int SMARTSHEET_NOT_FOUND = 1_006_001;
// ... 其余同理
```

- [ ] **Step 4: Commit**

```bash
git add src/main/java/com/example/demo/modules/smartsheet/enums/
git add src/main/java/com/example/demo/common/exception/ErrorCodeConstants.java
git commit -m "feat: add ColumnType enum + SmartsheetErrorCode enum for smartsheet v2"
```

### Task 2.2: 精简 DTO

**Files:**
- Modify: `src/main/java/com/example/demo/modules/smartsheet/dto/SmartsheetCreateRequest.java`
- Modify: `src/main/java/com/example/demo/modules/smartsheet/dto/SmartsheetUpdateRequest.java`
- Create: `src/main/java/com/example/demo/modules/smartsheet/dto/SmartsheetCellUpdateRequest.java`
- Create: `src/main/java/com/example/demo/modules/smartsheet/dto/SmartsheetImportResult.java`
- Delete: `src/main/java/com/example/demo/modules/smartsheet/dto/SmartsheetStatsResponse.java` (合并到 VO)

- [ ] **Step 1: 合并 CreateRequest + UpdateRequest**

修改 `SmartsheetCreateRequest.java`，重命名为通用 Request：

```java
package com.example.demo.modules.smartsheet.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class SmartsheetSheetRequest {
    private String name;
    private String description;
    private String layoutMode;       // matrix | table | checklist | calendar
    private List<Map<String, Object>> columnsConfig;
    private Map<String, Object> rowEntitySource;
    private String templateId;
    private Integer rowLimit;
    private Map<String, Object> themeConfig;
    private Boolean isTemplate;
}
```

- [ ] **Step 2: 删除 SmartsheetUpdateRequest.java**

```bash
rm src/main/java/com/example/demo/modules/smartsheet/dto/SmartsheetUpdateRequest.java
```

- [ ] **Step 3: 创建 SmartsheetCellUpdateRequest.java**

```java
package com.example.demo.modules.smartsheet.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class SmartsheetCellUpdateRequest {
    @NotBlank(message = "列名不能为空")
    private String columnKey;

    @NotNull(message = "值不能为空")
    private Object value;

    @NotNull(message = "版本号不能为空")
    private Integer expectedVersion;
}
```

- [ ] **Step 4: 创建 SmartsheetImportResult.java**

```java
package com.example.demo.modules.smartsheet.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

@Data
public class SmartsheetImportResult {
    private int totalRows;
    private int importedRows;
    private int skippedRows;
    private List<String> errors;
    private List<Map<String, Object>> preview;  // first 10 rows
}
```

- [ ] **Step 5: 更新 SmartsheetDefinitionVO.java**

合并 Stats 字段到 VO：

```java
package com.example.demo.modules.smartsheet.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
public class SmartsheetDefinitionVO {
    private Long id;
    private String name;
    private String description;
    private String layoutMode;
    private List<Map<String, Object>> columnsConfig;
    private Map<String, Object> rowEntitySource;
    private Long templateId;
    private Integer isPinned;
    private Integer rowLimit;
    private Map<String, Object> themeConfig;
    private Boolean isTemplate;
    private Long createdBy;
    private Long updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // Stats fields (merged from SmartsheetStatsResponse)
    private int rowCount;
    private Map<String, SmartsheetStatsResponse> columnStats;

    // Nested stats class
    @Data
    public static class SmartsheetStatsResponse {
        private String columnKey;
        private String columnLabel;
        private int totalRows;
        private int nonEmptyCount;
        private int uniqueCount;
        private Double sum;
        private Double avg;
        private Double min;
        private Double max;
        private List<Map<String, Object>> distribution;
    }
}
```

- [ ] **Step 6: Commit**

```bash
git rm src/main/java/com/example/demo/modules/smartsheet/dto/SmartsheetUpdateRequest.java
git add src/main/java/com/example/demo/modules/smartsheet/dto/
git commit -m "refactor: smartsheet DTOs — merge Create+Update, add CellUpdate, merge Stats into VO"
```

### Task 2.3: 更新 Entity 加新字段

**Files:**
- Modify: `src/main/java/com/example/demo/modules/smartsheet/entity/SmartsheetDefinition.java`
- Modify: `src/main/java/com/example/demo/modules/smartsheet/entity/SmartsheetChangeLog.java`

- [ ] **Step 1: SmartsheetDefinition 加字段**

在 `SmartsheetDefinition.java` 现有字段后添加：

```java
// 在 public class SmartsheetDefinition 的现有字段后追加：
private Integer rowLimit;       // 行数上限，默认 50000
private String themeConfig;     // VTable 主题配置 JSON
private Integer isTemplate;     // 0=普通表格 1=模板
```

- [ ] **Step 2: SmartsheetChangeLog 优化**

将 `columnKey` 的注释从 `*` 改为具体列名：

```java
// 修改现有字段注释
private String columnKey;   // 变更的列名（单元格级日志），不再用 '*'
// 新增字段：
private Integer rowIndex;   // 行位置快照
```

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/example/demo/modules/smartsheet/entity/
git commit -m "feat: add rowLimit/themeConfig/isTemplate to SmartsheetDefinition, refine ChangeLog"
```

### Task 2.4: 更新 Mapper 接口

**Files:**
- Modify: `src/main/java/com/example/demo/modules/smartsheet/mapper/SmartsheetDefinitionMapper.java`
- Modify: `src/main/java/com/example/demo/modules/smartsheet/mapper/SmartsheetRowMapper.java`
- Modify: `src/main/java/com/example/demo/modules/smartsheet/mapper/SmartsheetChangeLogMapper.java`

- [ ] **Step 1: SmartsheetDefinitionMapper — 更新 INSERT/UPDATE 包含新字段**

```java
// 修改 insert 方法：
@Insert("INSERT INTO smartsheet_definition (name, description, layout_mode, columns_config, " +
        "row_entity_source, template_id, row_limit, theme_config, is_template, " +
        "created_by, updated_by, created_at, updated_at) " +
        "VALUES (#{name}, #{description}, #{layoutMode}, #{columnsConfig}, #{rowEntitySource}, " +
        "#{templateId}, #{rowLimit}, #{themeConfig}, #{isTemplate}, " +
        "#{createdBy}, #{updatedBy}, NOW(), NOW())")
@Options(useGeneratedKeys = true, keyProperty = "id")
int insert(SmartsheetDefinition def);

// 修改 update 方法：
@Update("UPDATE smartsheet_definition SET name = #{name}, description = #{description}, " +
        "layout_mode = #{layoutMode}, columns_config = #{columnsConfig}, " +
        "row_entity_source = #{rowEntitySource}, row_limit = #{rowLimit}, " +
        "theme_config = #{themeConfig}, is_template = #{isTemplate}, " +
        "updated_by = #{updatedBy}, updated_at = NOW() WHERE id = #{id}")
int update(SmartsheetDefinition def);
```

- [ ] **Step 2: SmartsheetDefinitionMapper — 加模板查询方法**

```java
// 在接口末尾添加：
@Select("SELECT * FROM smartsheet_definition WHERE is_template = 1 ORDER BY updated_at DESC")
List<SmartsheetDefinition> selectTemplates();

@Update("UPDATE smartsheet_definition SET is_template = #{isTemplate} WHERE id = #{id}")
int updateTemplateFlag(@Param("id") Long id, @Param("isTemplate") int isTemplate);
```

- [ ] **Step 3: SmartsheetRowMapper — 更新 updateCellData 已存在，添加分页查询**

`updateCellData` 方法在 `SmartsheetRowMapper.java:25-27` 已存在，保持不变。添加分页查询：

```java
// 在接口末尾添加：
@Select("SELECT * FROM smartsheet_row WHERE sheet_id = #{sheetId} ORDER BY row_index ASC " +
        "LIMIT #{limit} OFFSET #{offset}")
List<SmartsheetRow> selectBySheetIdPaged(@Param("sheetId") Long sheetId,
                                          @Param("offset") int offset,
                                          @Param("limit") int limit);
```

- [ ] **Step 4: SmartsheetChangeLogMapper — 加列级日志方法**

```java
// 在接口末尾添加：
@Insert("INSERT INTO smartsheet_change_log (sheet_id, row_id, column_key, old_value, new_value, " +
        "changed_by, row_index, changed_at) " +
        "VALUES (#{sheetId}, #{rowId}, #{columnKey}, #{oldValue}, #{newValue}, " +
        "#{changedBy}, #{rowIndex}, NOW())")
int insertCellLog(SmartsheetChangeLog log);
```

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/example/demo/modules/smartsheet/mapper/
git commit -m "feat: update smartsheet mappers — new fields, template query, paged rows, cell log"
```

### Task 2.5: 创建 ColumnValidator 策略校验

**Files:**
- Create: `src/main/java/com/example/demo/modules/smartsheet/validator/ColumnValidator.java`

- [ ] **Step 1: 创建 ColumnValidator**

```java
package com.example.demo.modules.smartsheet.validator;

import com.example.demo.modules.smartsheet.enums.ColumnType;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;

public class ColumnValidator {
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private static final int MAX_COLUMNS = 100;

    public static void validate(String columnsConfigJson) {
        List<Map<String, Object>> columns;
        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> parsed = objectMapper.readValue(columnsConfigJson, List.class);
            columns = parsed;
        } catch (Exception e) {
            throw new IllegalArgumentException("列定义 JSON 格式不合法");
        }
        if (columns.size() > MAX_COLUMNS) {
            throw new IllegalArgumentException("超过最大列数限制(" + MAX_COLUMNS + ")");
        }
        Set<String> keys = new HashSet<>();
        for (Map<String, Object> col : columns) {
            String key = (String) col.get("key");
            if (key == null || key.isBlank()) throw new IllegalArgumentException("列 key 不能为空");
            if (!keys.add(key)) throw new IllegalArgumentException("列 key 重复: " + key);
            String type = (String) col.getOrDefault("type", "text");
            if (!ColumnType.validValues().contains(type)) {
                throw new IllegalArgumentException("不支持的列类型: " + type);
            }
            // Validate type-specific fields
            if (("select".equals(type) || "multi-select".equals(type) || "radio".equals(type))
                && col.get("options") == null) {
                throw new IllegalArgumentException("列 '" + key + "' 为选择类型，必须提供 options");
            }
        }
    }

    /** Validate a single cell value against its column type */
    public static boolean isValidCellValue(ColumnType type, Object value) {
        if (value == null) return true; // null = empty cell
        return switch (type) {
            case NUMBER -> value instanceof Number || (value instanceof String s && s.matches("-?\\d+(\\.\\d+)?"));
            case CHECKBOX -> value instanceof Boolean || "true".equals(value) || "false".equals(value);
            case DATE -> true; // Accept string dates
            default -> true;   // text, select, multi-select, user, progressbar, radio
        };
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/modules/smartsheet/validator/
git commit -m "feat: add ColumnValidator with type-specific validation rules"
```

### Task 2.6: 重构 SmartsheetRowService（单元格级更新）

**Files:**
- Modify: `src/main/java/com/example/demo/modules/smartsheet/service/SmartsheetRowService.java`

- [ ] **Step 1: 添加 updateCell 方法**

在 `SmartsheetRowService.java` 中添加单元格级更新方法（在 `updateRow` 方法之后）：

```java
/**
 * Update a single cell value with optimistic locking.
 * Only modifies the target key in cellData JSON — no conflict with other columns.
 */
@Transactional
public SmartsheetRow updateCell(Long rowId, String columnKey, Object value, Integer expectedVersion,
                                 Long userId, Long sheetId) {
    SmartsheetRow existing = getById(rowId);
    if (expectedVersion != null && !expectedVersion.equals(existing.getVersion())) {
        throw new RuntimeException("数据已被他人修改，请刷新");
    }

    // Parse current cellData
    Map<String, Object> cellData;
    try {
        @SuppressWarnings("unchecked")
        Map<String, Object> parsed = objectMapper.readValue(existing.getCellData(), Map.class);
        cellData = parsed;
    } catch (Exception e) {
        cellData = new java.util.LinkedHashMap<>();
    }

    Object oldValue = cellData.get(columnKey);
    cellData.put(columnKey, value);
    String newCellDataJson = objectMapper.writeValueAsString(cellData);

    int updated = rowMapper.updateCellData(rowId, newCellDataJson, existing.getVersion());
    if (updated == 0) throw new RuntimeException("数据已被他人修改，请刷新");

    // Column-level change log
    if (userId != null) {
        SmartsheetChangeLog log = new SmartsheetChangeLog();
        log.setSheetId(sheetId);
        log.setRowId(rowId);
        log.setColumnKey(columnKey);
        log.setOldValue(oldValue != null ? oldValue.toString() : null);
        log.setNewValue(value != null ? value.toString() : null);
        log.setRowIndex(existing.getRowIndex());
        log.setChangedBy(userId);
        changeLogMapper.insertCellLog(log);
    }

    return rowMapper.selectById(rowId);
}
```

需要添加的 import：

```java
import com.fasterxml.jackson.core.JsonProcessingException;
import java.util.LinkedHashMap;
import java.util.Map;
```

- [ ] **Step 2: 放宽行数限制**

将 `MAX_ROWS` 从 500 改为 50000：

```java
// 修改 SmartsheetRowService.java:19
private static final int MAX_ROWS = 50000;
```

同时修改 `addRow` 和 `batchInsert` 中引用的 `MAX_ROWS`。

- [ ] **Step 3: 修改 updateRow 支持从 SmartsheetDefinition 读取 rowLimit**

在 `addRow` 方法中，读取 sheet 定义的 row_limit：

```java
// addRow 方法中，修改 count 校验逻辑：
// 改为从 SmartsheetDefinitionMapper 查询 row_limit（默认 50000）
```

- [ ] **Step 4: Commit**

```bash
git add src/main/java/com/example/demo/modules/smartsheet/service/SmartsheetRowService.java
git commit -m "feat: add cell-level update with optimistic lock + column-grained change log"
```

### Task 2.7: 创建 SmartsheetImportService（真正的流式导入）

**Files:**
- Create: `src/main/java/com/example/demo/modules/smartsheet/service/SmartsheetImportService.java`

- [ ] **Step 1: 创建 ImportService**

```java
package com.example.demo.modules.smartsheet.service;

import com.example.demo.modules.smartsheet.dto.SmartsheetImportResult;
import com.example.demo.modules.smartsheet.entity.SmartsheetRow;
import com.example.demo.modules.smartsheet.mapper.SmartsheetRowMapper;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
public class SmartsheetImportService {
    private static final Logger log = LoggerFactory.getLogger(SmartsheetImportService.class);
    private static final int BATCH_SIZE = 100;
    private static final int MAX_PREVIEW = 10;

    private final SmartsheetRowMapper rowMapper;

    public SmartsheetImportService(SmartsheetRowMapper rowMapper) {
        this.rowMapper = rowMapper;
    }

    public SmartsheetImportResult importFile(Long sheetId, MultipartFile file, List<String> columnKeys) {
        String filename = file.getOriginalFilename();
        if (filename == null) throw new IllegalArgumentException("文件名不能为空");

        List<Map<String, String>> rawRows;
        if (filename.endsWith(".csv")) {
            rawRows = parseCsv(file);
        } else {
            rawRows = parseExcel(file);
        }

        int existing = rowMapper.countBySheetId(sheetId);
        int nextIdx = rowMapper.maxRowIndex(sheetId) + 1;
        int imported = 0;
        List<String> errors = new ArrayList<>();
        List<Map<String, Object>> preview = new ArrayList<>();

        List<SmartsheetRow> batch = new ArrayList<>();
        for (int i = 0; i < rawRows.size(); i++) {
            Map<String, String> raw = rawRows.get(i);
            Map<String, Object> cellData = new LinkedHashMap<>();
            for (String key : columnKeys) {
                cellData.put(key, raw.getOrDefault(key, ""));
            }
            SmartsheetRow row = new SmartsheetRow();
            row.setSheetId(sheetId);
            row.setRowIndex(nextIdx + imported);
            row.setRowLabel("");
            row.setCellData(toJson(cellData));
            row.setVersion(0);
            batch.add(row);

            if (i < MAX_PREVIEW) preview.add(new LinkedHashMap<>(cellData));

            if (batch.size() >= BATCH_SIZE) {
                rowMapper.insertBatch(batch);
                imported += batch.size();
                batch.clear();
            }
        }
        if (!batch.isEmpty()) {
            rowMapper.insertBatch(batch);
            imported += batch.size();
        }

        SmartsheetImportResult result = new SmartsheetImportResult();
        result.setTotalRows(rawRows.size());
        result.setImportedRows(imported);
        result.setSkippedRows(rawRows.size() - imported);
        result.setErrors(errors);
        result.setPreview(preview);
        log.info("[SmartSheet] import done sheet={} total={} imported={}", sheetId, rawRows.size(), imported);
        return result;
    }

    private List<Map<String, String>> parseCsv(MultipartFile file) {
        List<Map<String, String>> rows = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            // Skip BOM if present
            reader.mark(1);
            int bom = reader.read();
            if (bom != 0xFEFF) reader.reset();

            String headerLine = reader.readLine();
            if (headerLine == null) return rows;
            String[] headers = parseCsvLine(headerLine);

            String line;
            while ((line = reader.readLine()) != null) {
                String[] values = parseCsvLine(line);
                Map<String, String> row = new LinkedHashMap<>();
                for (int i = 0; i < headers.length; i++) {
                    row.put(headers[i], i < values.length ? values[i] : "");
                }
                rows.add(row);
            }
        } catch (IOException e) {
            throw new RuntimeException("CSV 解析失败: " + e.getMessage());
        }
        return rows;
    }

    private String[] parseCsvLine(String line) {
        List<String> fields = new ArrayList<>();
        boolean inQuotes = false;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
                        sb.append('"'); i++;
                    } else {
                        inQuotes = false;
                    }
                } else { sb.append(c); }
            } else {
                if (c == '"') { inQuotes = true; }
                else if (c == ',') { fields.add(sb.toString().trim()); sb.setLength(0); }
                else { sb.append(c); }
            }
        }
        fields.add(sb.toString().trim());
        return fields.toArray(new String[0]);
    }

    private List<Map<String, String>> parseExcel(MultipartFile file) {
        List<Map<String, String>> rows = new ArrayList<>();
        try (InputStream is = file.getInputStream();
             Workbook workbook = file.getOriginalFilename().endsWith(".xlsx")
                 ? new XSSFWorkbook(is) : new HSSFWorkbook(is)) {
            Sheet sheet = workbook.getSheetAt(0);
            // Read header row
            Row headerRow = sheet.getRow(0);
            if (headerRow == null) return rows;
            String[] headers = new String[headerRow.getLastCellNum()];
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.getCell(i);
                headers[i] = cell != null ? getCellStringValue(cell) : "col_" + i;
            }
            // Read data rows
            for (int r = 1; r <= sheet.getLastRowNum(); r++) {
                Row dataRow = sheet.getRow(r);
                if (dataRow == null) continue;
                Map<String, String> row = new LinkedHashMap<>();
                boolean allEmpty = true;
                for (int i = 0; i < headers.length; i++) {
                    Cell cell = dataRow.getCell(i);
                    String val = cell != null ? getCellStringValue(cell) : "";
                    row.put(headers[i], val);
                    if (!val.isEmpty()) allEmpty = false;
                }
                if (!allEmpty) rows.add(row);
            }
        } catch (IOException e) {
            throw new RuntimeException("Excel 解析失败: " + e.getMessage());
        }
        return rows;
    }

    private String getCellStringValue(Cell cell) {
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(cell)) {
                    yield cell.getLocalDateTimeCellValue().toString();
                }
                double val = cell.getNumericCellValue();
                yield val == Math.floor(val) && !Double.isInfinite(val)
                    ? String.valueOf((long) val) : String.valueOf(val);
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> {
                try { yield cell.getStringCellValue(); }
                catch (Exception e) { yield String.valueOf(cell.getNumericCellValue()); }
            }
            default -> "";
        };
    }

    private String toJson(Object obj) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(obj);
        } catch (Exception e) {
            return "{}";
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/modules/smartsheet/service/SmartsheetImportService.java
git commit -m "feat: real XLSX/CSV streaming import with Apache POI"
```

### Task 2.8: 创建 SmartsheetExportService（多格式导出）

**Files:**
- Create: `src/main/java/com/example/demo/modules/smartsheet/service/SmartsheetExportService.java`

- [ ] **Step 1: 创建 ExportService**

```java
package com.example.demo.modules.smartsheet.service;

import com.example.demo.modules.smartsheet.entity.SmartsheetDefinition;
import com.example.demo.modules.smartsheet.entity.SmartsheetRow;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.PrintWriter;
import java.util.*;

@Service
public class SmartsheetExportService {
    private static final ObjectMapper objectMapper = new ObjectMapper();

    /** CSV export with UTF-8 BOM */
    public void exportCsv(SmartsheetDefinition sheet, List<SmartsheetRow> rows,
                          HttpServletResponse response) throws IOException {
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition",
            "attachment; filename=\"" + sheet.getName() + ".csv\"");

        response.getOutputStream().write(0xEF);
        response.getOutputStream().write(0xBB);
        response.getOutputStream().write(0xBF);

        PrintWriter writer = response.getWriter();
        List<Map<String, Object>> columns = parseColumns(sheet.getColumnsConfig());
        List<String> colKeys = new ArrayList<>();

        for (Map<String, Object> col : columns) {
            String key = (String) col.get("key");
            String label = (String) col.getOrDefault("label", key);
            if (key != null) { colKeys.add(key); writer.write(escapeCsv(label)); writer.write(","); }
        }
        if (!colKeys.isEmpty()) writer.write("\n");

        for (SmartsheetRow r : rows) {
            Map<String, Object> cellData = parseCellData(r.getCellData());
            for (int i = 0; i < colKeys.size(); i++) {
                if (i > 0) writer.write(",");
                Object val = cellData.get(colKeys.get(i));
                writer.write(escapeCsv(cellValueToString(val)));
            }
            writer.write("\n");
        }
        writer.flush();
    }

    /** XLSX export with basic styling */
    public void exportXlsx(SmartsheetDefinition sheet, List<SmartsheetRow> rows,
                           HttpServletResponse response) throws IOException {
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition",
            "attachment; filename=\"" + sheet.getName() + ".xlsx\"");

        List<Map<String, Object>> columns = parseColumns(sheet.getColumnsConfig());
        try (Workbook workbook = new XSSFWorkbook()) {
            Sheet sh = workbook.createSheet(sheet.getName());

            // Header style
            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            // Header row
            Row headerRow = sh.createRow(0);
            for (int i = 0; i < columns.size(); i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue((String) columns.get(i).getOrDefault("label", "col_" + i));
                cell.setCellStyle(headerStyle);
            }

            // Data rows
            for (int r = 0; r < rows.size(); r++) {
                Row dataRow = sh.createRow(r + 1);
                Map<String, Object> cellData = parseCellData(rows.get(r).getCellData());
                for (int i = 0; i < columns.size(); i++) {
                    Cell cell = dataRow.createCell(i);
                    String key = (String) columns.get(i).get("key");
                    Object val = cellData.get(key);
                    cell.setCellValue(cellValueToString(val));
                }
            }

            // Auto-size columns
            for (int i = 0; i < columns.size(); i++) {
                sh.autoSizeColumn(i);
            }

            workbook.write(response.getOutputStream());
            response.getOutputStream().flush();
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseColumns(String json) {
        try { return objectMapper.readValue(json, List.class); }
        catch (Exception e) { return List.of(); }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseCellData(String json) {
        try { return objectMapper.readValue(json, Map.class); }
        catch (Exception e) { return Map.of(); }
    }

    private String cellValueToString(Object val) {
        if (val == null) return "";
        if (val instanceof Map) {
            Object v = ((Map<?, ?>) val).get("v");
            return v != null ? v.toString() : "";
        }
        return val.toString();
    }

    private String escapeCsv(String value) {
        if (value == null) return "";
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/example/demo/modules/smartsheet/service/SmartsheetExportService.java
git commit -m "feat: multi-format export service — CSV + XLSX with POI styling"
```

### Task 2.9: 重构 SmartsheetController

**Files:**
- Modify: `src/main/java/com/example/demo/modules/smartsheet/controller/SmartsheetController.java`

- [ ] **Step 1: 注入新 Service，添加新的端点**

改造 Controller，主要变更：
1. 注入 `SmartsheetImportService` 和 `SmartsheetExportService`
2. 替换 import 端点为空壳 → 调用 ImportService
3. 添加 `/export/csv` + `/export/xlsx` 端点
4. 添加 `PATCH /row/{rowId}/cell` 端点
5. 添加 Template 端点
6. 在行列表端点加分页参数

关键代码变更（在 Controller 中添加）：

```java
// 新增字段注入
private final SmartsheetImportService importService;
private final SmartsheetExportService exportService;

public SmartsheetController(SmartsheetService sheetService, SmartsheetRowService rowService,
                             SmartsheetImportService importService, SmartsheetExportService exportService) {
    this.sheetService = sheetService;
    this.rowService = rowService;
    this.importService = importService;
    this.exportService = exportService;
}

// ═══════ Cell-level update (NEW) ═══════

@PatchMapping("/{sheetId}/row/{rowId}/cell")
public Result<SmartsheetRow> updateCell(@PathVariable Long sheetId,
                                         @PathVariable Long rowId,
                                         @RequestBody SmartsheetCellUpdateRequest req,
                                         HttpServletRequest request) {
    Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
    if (denied != null) return Result.error(denied.getMessage());
    Long userId = getCurrentUserId(request);
    try {
        SmartsheetRow updated = rowService.updateCell(
            rowId, req.getColumnKey(), req.getValue(), req.getExpectedVersion(), userId, sheetId);
        return Result.success(updated);
    } catch (RuntimeException e) {
        return Result.error(e.getMessage());
    }
}

// ═══════ Import / Export (REWRITE) ═══════

@PostMapping("/{sheetId}/import")
public Result<SmartsheetImportResult> importFile(@PathVariable Long sheetId,
                                                   @RequestParam("file") MultipartFile file,
                                                   HttpServletRequest request) {
    Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
    if (denied != null) return Result.error(denied.getMessage());
    String filename = file.getOriginalFilename();
    if (filename == null || !filename.matches(".*\\.(xlsx|xls|csv)$")) {
        return Result.error("不支持的文件格式，仅接受 .xlsx/.xls/.csv");
    }
    if (file.getSize() > 10 * 1024 * 1024) {
        return Result.error("文件大小超限(10MB)");
    }
    SmartsheetDefinition sheet = sheetService.getById(sheetId);
    List<String> colKeys = parseColumnKeys(sheet.getColumnsConfig());
    SmartsheetImportResult result = importService.importFile(sheetId, file, colKeys);
    return Result.success(result);
}

@GetMapping("/{sheetId}/export/csv")
public void exportCsv(@PathVariable Long sheetId, HttpServletResponse response,
                       HttpServletRequest request) throws IOException {
    Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
    if (denied != null) { response.sendError(403); return; }
    SmartsheetDefinition sheet = sheetService.getById(sheetId);
    List<SmartsheetRow> rows = rowService.getRowsBySheetId(sheetId);
    exportService.exportCsv(sheet, rows, response);
}

@GetMapping("/{sheetId}/export/xlsx")
public void exportXlsx(@PathVariable Long sheetId, HttpServletResponse response,
                        HttpServletRequest request) throws IOException {
    Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
    if (denied != null) { response.sendError(403); return; }
    SmartsheetDefinition sheet = sheetService.getById(sheetId);
    List<SmartsheetRow> rows = rowService.getRowsBySheetId(sheetId);
    exportService.exportXlsx(sheet, rows, response);
}

// ═══════ Template (NEW) ═══════

@GetMapping("/templates")
public Result<List<SmartsheetDefinition>> templates(HttpServletRequest request) {
    Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
    if (denied != null) return Result.error(denied.getMessage());
    return Result.success(sheetService.getTemplates());
}

@PostMapping("/template")
public Result<Void> saveAsTemplate(@RequestBody Map<String, Long> body, HttpServletRequest request) {
    Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
    if (denied != null) return Result.error(denied.getMessage());
    sheetService.setTemplateFlag(body.get("sheetId"), true);
    return Result.success(null);
}

@PostMapping("/sheet/from-template/{templateId}")
public Result<SmartsheetDefinition> createFromTemplate(@PathVariable Long templateId,
                                                         @RequestBody Map<String, String> body,
                                                         HttpServletRequest request) {
    Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
    if (denied != null) return Result.error(denied.getMessage());
    Long userId = getCurrentUserId(request);
    String name = body.getOrDefault("name", "从模板创建");
    return Result.success(sheetService.createFromTemplate(templateId, name, userId));
}

// Helper
@SuppressWarnings("unchecked")
private List<String> parseColumnKeys(String columnsConfig) {
    try {
        List<Map<String, Object>> cols = objectMapper.readValue(columnsConfig, List.class);
        return cols.stream().map(c -> (String) c.get("key")).filter(Objects::nonNull).toList();
    } catch (Exception e) { return List.of(); }
}
```

- [ ] **Step 2: 在 SmartsheetService 添加模板相关方法**

在 `SmartsheetService.java` 末尾添加：

```java
public List<SmartsheetDefinition> getTemplates() {
    return definitionMapper.selectTemplates();
}

public void setTemplateFlag(Long id, boolean isTemplate) {
    getById(id);
    definitionMapper.updateTemplateFlag(id, isTemplate ? 1 : 0);
}

@Transactional
public SmartsheetDefinition createFromTemplate(Long templateId, String name, Long userId) {
    SmartsheetDefinition template = getById(templateId);
    SmartsheetDefinition def = new SmartsheetDefinition();
    def.setName(name);
    def.setDescription(template.getDescription());
    def.setLayoutMode(template.getLayoutMode());
    def.setColumnsConfig(template.getColumnsConfig());
    def.setRowEntitySource(template.getRowEntitySource());
    def.setRowLimit(template.getRowLimit());
    def.setThemeConfig(template.getThemeConfig());
    def.setCreatedBy(userId);
    def.setUpdatedBy(userId);
    definitionMapper.insert(def);
    return def;
}
```

- [ ] **Step 3: 清理旧的 import/export 控制台代码**

删除 Controller 中原有的 `export`（`@GetMapping("/{sheetId}/export")`）方法中写入 CSV 的逻辑（已由 ExportService 替代），改为重定向到 `/export/csv`：

```java
@GetMapping("/{sheetId}/export")
public void export(@PathVariable Long sheetId, HttpServletResponse response,
                   HttpServletRequest request) throws IOException {
    // Redirect to CSV export (backward compatible)
    exportCsv(sheetId, response, request);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/main/java/com/example/demo/modules/smartsheet/controller/SmartsheetController.java
git add src/main/java/com/example/demo/modules/smartsheet/service/SmartsheetService.java
git commit -m "refactor: SmartsheetController — cell PATCH, real import, multi-format export, templates"
```

---

## Phase 3: 前端 VTable 集成（可并行于 Phase 2）

### Task 3.1: 更新 TypeScript 类型定义

**Files:**
- Modify: `frontend/src/features/smartsheet/types.ts`

- [ ] **Step 1: 精简 types.ts**

用以下内容替换 `frontend/src/features/smartsheet/types.ts`：

```typescript
// frontend/src/features/smartsheet/types.ts — V2 精简版

export type LayoutMode = 'matrix' | 'table' | 'checklist' | 'calendar';

export type ColumnType = 'text' | 'number' | 'select' | 'multi-select'
  | 'date' | 'checkbox' | 'user' | 'progressbar' | 'radio';

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

export interface SmartSheetDefinition {
  id: string;
  name: string;
  description: string;
  layoutMode: LayoutMode;
  columnsConfig: ColumnConfig[];
  rowEntitySource?: { type: 'manual' | 'reference'; tableName?: string; labelField?: string; valueField?: string };
  templateId?: string;
  isPinned?: number;
  isTemplate?: number;
  rowLimit?: number;
  themeConfig?: Record<string, string>;
  rowCount?: number;
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
  cellData: Record<string, string>;  // V2 simplified: flat string map
  version: number;
  createdAt: string;
  updatedAt: string;
}

// API request types
export interface SmartsheetSheetRequest {
  name: string;
  description?: string;
  layoutMode: LayoutMode;
  columnsConfig: ColumnConfig[];
  rowEntitySource?: object;
  templateId?: string;
  rowLimit?: number;
  themeConfig?: Record<string, string>;
  isTemplate?: boolean;
}

export interface SmartsheetCellUpdateRequest {
  columnKey: string;
  value: unknown;
  expectedVersion: number;
}

export interface SmartsheetImportResult {
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errors: string[];
  preview: Record<string, string>[];
}

export interface SmartSheetTemplate {
  id: string;
  name: string;
  description: string;
  layoutMode: LayoutMode;
  defaultColumns: ColumnConfig[];
}

// Preset templates (unchanged from V1)
export const PRESET_TEMPLATES: SmartSheetTemplate[] = [
  {
    id: 'tpl-matrix', name: '交叉矩阵',
    description: '横纵双表头，交叉点配置。适合部门评估、设施巡查、供应商对比',
    layoutMode: 'matrix',
    defaultColumns: [
      { key: 'col_1', label: '列1', type: 'select', options: ['选项A', '选项B', '选项C'] },
      { key: 'col_2', label: '列2', type: 'number' },
      { key: 'col_3', label: '列3', type: 'text' },
    ],
  },
  {
    id: 'tpl-table', name: '简单数据表',
    description: '列头+行记录，支持排序筛选。适合设备清单、人员花名册、资产台账',
    layoutMode: 'table',
    defaultColumns: [
      { key: 'col_name', label: '名称', type: 'text' },
      { key: 'col_status', label: '状态', type: 'select', options: ['在用', '闲置', '报废'] },
      { key: 'col_date', label: '日期', type: 'date' },
    ],
  },
  {
    id: 'tpl-checklist', name: '勾选清单',
    description: '逐项确认模式。适合安全巡检、设备点检、审计核对表',
    layoutMode: 'checklist',
    defaultColumns: [
      { key: 'col_check', label: '结果', type: 'checkbox' },
      { key: 'col_note', label: '备注', type: 'text' },
      { key: 'col_inspector', label: '检查人', type: 'user' },
    ],
  },
  {
    id: 'tpl-calendar', name: '日历矩阵',
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
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/smartsheet/types.ts
git commit -m "refactor: simplify smartsheet types for VTable v2"
```

### Task 3.2: 创建 VTable 列定义生成器

**Files:**
- Create: `frontend/src/features/smartsheet/vtable-config/columns.ts`

- [ ] **Step 1: 创建 columns.ts — 后端 ColumnConfig → VTable columns 映射**

```typescript
// frontend/src/features/smartsheet/vtable-config/columns.ts
import type { ColumnConfig } from '../types';

/**
 * Convert backend ColumnConfig[] to VTable ListTable columns option.
 * Maps ColumnType → VTable cellType and editor config.
 */
export function buildVTableColumns(cols: ColumnConfig[]): Record<string, unknown>[] {
  return cols.map((col) => {
    const base: Record<string, unknown> = {
      field: col.key,
      caption: col.label,
      width: col.width ?? 120,
    };

    // Map column type to VTable cellType + editor
    switch (col.type) {
      case 'checkbox':
        base.cellType = 'checkbox';
        base.editor = 'checkbox';
        break;
      case 'radio':
        // VTable radio: render as custom with options
        base.cellType = 'radio';
        base.fieldFormat = {
          type: 'radio',
          options: col.options?.map((o) => ({ label: o, value: o })) ?? [],
        };
        break;
      case 'select':
        base.editor = 'select';
        base.fieldFormat = {
          type: 'select',
          options: col.options?.map((o) => ({ label: o, value: o })) ?? [],
        };
        break;
      case 'multi-select':
        base.editor = 'select';
        base.fieldFormat = {
          type: 'multi-select',
          options: col.options?.map((o) => ({ label: o, value: o })) ?? [],
        };
        break;
      case 'date':
        base.editor = 'date';
        base.fieldFormat = { type: 'date' };
        break;
      case 'number':
        base.fieldFormat = { type: 'number' };
        if (col.min !== undefined || col.max !== undefined) {
          base.fieldFormat = {
            ...base.fieldFormat as object,
            min: col.min,
            max: col.max,
          };
        }
        break;
      case 'progressbar':
        base.cellType = 'progressbar';
        base.fieldFormat = { type: 'progressbar', min: 0, max: 100 };
        break;
      case 'text':
      case 'user':
      default:
        // text/user use default text cellType + text editor
        break;
    }

    return base;
  });
}

/**
 * Convert backend rows (SmartSheetRow[]) to VTable records array.
 * Flattens cellData + metadata into flat objects.
 */
export function buildVTableRecords(
  rows: { id: string; rowIndex: number; rowLabel: string; cellData: Record<string, string>; version: number }[]
): Record<string, unknown>[] {
  return rows.map((row) => ({
    __id: row.id,
    __version: row.version,
    __rowLabel: row.rowLabel,
    __rowIndex: row.rowIndex,
    ...row.cellData,
  }));
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/smartsheet/vtable-config/
git commit -m "feat: VTable column config builder — ColumnType to VTable cellType mapping"
```

### Task 3.3: 创建 VTable 主题配置

**Files:**
- Create: `frontend/src/features/smartsheet/vtable-config/theme.ts`

- [ ] **Step 1: 创建 theme.ts — 映射 --app-* 设计令牌到 VTable 主题**

```typescript
// frontend/src/features/smartsheet/vtable-config/theme.ts
import type { Themes } from '@visactor/vtable';

/**
 * Build VTable theme that maps --app-color-* CSS custom properties
 * to VTable's internal theme system, ensuring alignment with Bento design system.
 *
 * Reference: docs/UI设计规范与主题标准.md
 */
export function buildVTableTheme(): Themes.ThemeProperty {
  const style = getComputedStyle(document.documentElement);

  const colorPage = style.getPropertyValue('--app-color-surface-page').trim() || '#fafafa';
  const colorContainer = style.getPropertyValue('--app-color-surface-container').trim() || '#ffffff';
  const colorBorder = style.getPropertyValue('--app-color-border-default').trim() || '#e5e7eb';
  const colorText = style.getPropertyValue('--app-color-text-primary').trim() || '#111827';
  const colorTextSecondary = style.getPropertyValue('--app-color-text-secondary').trim() || '#6b7280';
  const colorPrimary = style.getPropertyValue('--app-color-primary').trim() || '#3b82f6';
  const colorPrimaryLight = style.getPropertyValue('--app-color-primary-light').trim() || '#dbeafe';

  return {
    defaultStyle: {
      bgColor: colorContainer,
      borderColor: colorBorder,
      fontFamily: 'inherit',
      fontSize: 13,
      color: colorText,
      textStick: false,
    },
    headerStyle: {
      bgColor: colorPage,
      borderColor: colorBorder,
      fontFamily: 'inherit',
      fontSize: 13,
      fontWeight: '600',
      color: colorText,
    },
    bodyStyle: {
      bgColor: colorContainer,
      borderColor: colorBorder,
      fontFamily: 'inherit',
      fontSize: 13,
      color: colorText,
    },
    frameStyle: {
      borderColor: colorBorder,
      cornerRadius: 10,
    },
    underlayBackgroundColor: colorPage,
    selectionStyle: {
      cellBgColor: colorPrimaryLight,
      cellBorderColor: colorPrimary,
    },
  };
}

/**
 * Get the VTable theme name to register.
 * Returns 'bento' — matches design system.
 */
export function getThemeName(): string {
  return 'bento';
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/smartsheet/vtable-config/theme.ts
git commit -m "feat: VTable theme config — map --app-color-* tokens to VTable theme"
```

### Task 3.4: 更新 API 层

**Files:**
- Modify: `frontend/src/api/domains/smartsheet.api.ts`

- [ ] **Step 1: 添加新的 API 调用**

在 `frontend/src/api/domains/smartsheet.api.ts` 末尾添加（保留现有函数，新增以下）：

```typescript
// ═══════ Cell update (NEW) ═══════
export async function updateCell(sheetId: string, rowId: string, req: {
  columnKey: string;
  value: unknown;
  expectedVersion: number;
}) {
  const { data } = await adminHttp.patch(`${BASE}/${sheetId}/row/${rowId}/cell`, req);
  return normalizeRow(data.data);
}

// ═══════ Export (UPDATED) ═══════
export function getCsvExportUrl(sheetId: string) {
  return `/api/admin/smartsheet/${sheetId}/export/csv`;
}

export function getXlsxExportUrl(sheetId: string) {
  return `/api/admin/smartsheet/${sheetId}/export/xlsx`;
}

// ═══════ Import (UPDATED) ═══════
export async function importFile(sheetId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await adminHttp.post(`${BASE}/${sheetId}/import`, form);
  return data.data as { totalRows: number; importedRows: number; skippedRows: number; errors: string[]; preview: Record<string, string>[] };
}

// ═══════ Templates (NEW) ═══════
export async function fetchTemplates() {
  const { data } = await adminHttp.get(`${BASE}/templates`);
  return (data.data as any[]).map(normalizeSheet);
}

export async function saveAsTemplate(sheetId: string) {
  await adminHttp.post(`${BASE}/template`, { sheetId: Number(sheetId) });
}

export async function createFromTemplate(templateId: string, name: string) {
  const { data } = await adminHttp.post(`${BASE}/sheet/from-template/${templateId}`, { name });
  return normalizeSheet(data.data);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/domains/smartsheet.api.ts
git commit -m "feat: update smartsheet API — cell PATCH, xlsx export, template endpoints"
```

### Task 3.5: 重写数据 hooks

**Files:**
- Create: `frontend/src/features/smartsheet/hooks/useSmartSheetData.ts`
- Create: `frontend/src/features/smartsheet/hooks/useSmartSheetMutation.ts`

- [ ] **Step 1: 创建 useSmartSheetData.ts**

```typescript
// frontend/src/features/smartsheet/hooks/useSmartSheetData.ts
import { useQuery } from '@tanstack/react-query';
import { getSheet, fetchRows } from '@/api/domains/smartsheet.api';
import { buildVTableColumns, buildVTableRecords } from '../vtable-config/columns';

export function useSmartSheetData(sheetId: string | undefined) {
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

  const columns = sheetQuery.data
    ? buildVTableColumns(sheetQuery.data.columnsConfig)
    : [];

  const records = rowsQuery.data
    ? buildVTableRecords(rowsQuery.data)
    : [];

  return {
    sheet: sheetQuery.data ?? null,
    rows: rowsQuery.data ?? [],
    columns,
    records,
    isLoading: sheetQuery.isLoading || rowsQuery.isLoading,
    refetch: () => {
      sheetQuery.refetch();
      rowsQuery.refetch();
    },
  };
}
```

- [ ] **Step 2: 创建 useSmartSheetMutation.ts**

```typescript
// frontend/src/features/smartsheet/hooks/useSmartSheetMutation.ts
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { updateCell, addRow, deleteRow, updateSheet } from '@/api/domains/smartsheet.api';
import type { ColumnConfig } from '../types';

export function useSmartSheetMutation(sheetId: string | undefined) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    if (!sheetId) return;
    queryClient.invalidateQueries({ queryKey: ['smartsheet', sheetId] });
    queryClient.invalidateQueries({ queryKey: ['smartsheet-rows', sheetId] });
  }, [queryClient, sheetId]);

  /** Handle VTable onChangeCellValue — single cell PATCH */
  const handleCellChange = useCallback(async (
    rowId: string,
    columnKey: string,
    value: unknown,
    version: number,
  ) => {
    if (!sheetId) return;
    try {
      await updateCell(sheetId, rowId, { columnKey, value, expectedVersion: version });
    } catch (e) {
      toast.error((e as Error).message || '保存失败');
      invalidate(); // Refresh to restore correct state
    }
  }, [sheetId, invalidate]);

  /** Add a new row */
  const handleAddRow = useCallback(async () => {
    if (!sheetId) return;
    try {
      await addRow(sheetId);
      invalidate();
      toast.success('已添加新行');
    } catch (e) {
      toast.error((e as Error).message || '添加行失败');
    }
  }, [sheetId, invalidate]);

  /** Delete rows */
  const handleDeleteRows = useCallback(async (rowIds: string[]) => {
    if (!sheetId) return;
    try {
      for (const id of rowIds) await deleteRow(sheetId, id);
      invalidate();
      toast.success('已删除');
    } catch (e) {
      toast.error((e as Error).message || '删除失败');
    }
  }, [sheetId, invalidate]);

  /** Add/update column */
  const handleColumnChange = useCallback(async (
    colKey: string,
    config: Partial<ColumnConfig>,
    existingColumns: ColumnConfig[],
  ) => {
    if (!sheetId) return;
    const idx = existingColumns.findIndex((c) => c.key === colKey);
    let newCols: ColumnConfig[];
    if (idx >= 0) {
      newCols = [...existingColumns];
      newCols[idx] = { ...newCols[idx], ...config };
    } else {
      newCols = [...existingColumns, { key: colKey, label: '新列', type: 'text', width: 110, ...config }];
    }
    await updateSheet(sheetId, { columnsConfig: newCols });
    invalidate();
  }, [sheetId, invalidate]);

  return {
    handleCellChange,
    handleAddRow,
    handleDeleteRows,
    handleColumnChange,
    invalidate,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/smartsheet/hooks/useSmartSheetData.ts
git add frontend/src/features/smartsheet/hooks/useSmartSheetMutation.ts
git commit -m "feat: new smartsheet hooks — data bridge + cell mutation for VTable"
```

### Task 3.6: 创建 VTable 编辑回调适配器

**Files:**
- Create: `frontend/src/features/smartsheet/vtable-config/editors.ts`

- [ ] **Step 1: 创建 editors.ts — 自定义编辑器（如需要）**

```typescript
// frontend/src/features/smartsheet/vtable-config/editors.ts

/**
 * VTable cell edit event handler.
 *
 * VTable's onChangeCellValue provides:
 *   col, row, value, oldValue, tableInstance
 *
 * We translate this to the rowId+columnKey the backend expects.
 */
export interface CellEditContext {
  records: Record<string, unknown>[];
  onCellChange: (rowId: string, columnKey: string, value: unknown, version: number) => Promise<void>;
}

export function createCellEditHandler(ctx: CellEditContext) {
  return async (args: {
    col: number;
    row: number;
    value: unknown;
    oldValue: unknown;
    tableInstance: unknown;
  }) => {
    const record = ctx.records[args.row];
    if (!record) return;

    const rowId = record.__id as string;
    const version = (record.__version as number) ?? 0;

    // Get column key from the table instance
    const table = args.tableInstance as { columns?: { field?: string }[] };
    const colDef = table.columns?.[args.col];
    const columnKey = colDef?.field ?? `col_${args.col}`;

    if (columnKey.startsWith('__')) return; // Skip metadata fields

    await ctx.onCellChange(rowId, columnKey, args.value, version);
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/smartsheet/vtable-config/editors.ts
git commit -m "feat: VTable cell edit adapter — onChangeCellValue → API PATCH"
```

### Task 3.7: 重写 SmartSheetPage（核心 VTable 容器）

**Files:**
- Modify: `frontend/src/features/smartsheet/SmartSheetPage.tsx`

- [ ] **Step 1: 用 VTable 重写 SmartSheetPage**

用以下内容替换 `SmartSheetPage.tsx`（注意：先备份原文件，内部组件引用需逐步替换）：

```typescript
// SmartSheetPage — VTable 版本（Bento 卡片布局）
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ListTable } from '@visactor/react-vtable';
import { SearchComponent } from '@visactor/vtable-search';
import { downloadCsv, downloadExcel } from '@visactor/vtable-export';
import type { ListTable as ListTableInstance } from '@visactor/vtable';
import { useSmartSheetData } from './hooks/useSmartSheetData';
import { useSmartSheetMutation } from './hooks/useSmartSheetMutation';
import { buildVTableTheme, getThemeName } from './vtable-config/theme';
import { createCellEditHandler } from './vtable-config/editors';
import ImportDialog from './components/ImportDialog';
import toast from 'react-hot-toast';
import { ArrowDownToLine, FileUp, Plus, Save, Search, Table2 } from 'lucide-react';

export default function SmartSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { sheet, columns, records, isLoading, refetch } = useSmartSheetData(id);
  const { handleCellChange, handleAddRow, handleDeleteRows } = useSmartSheetMutation(id);
  const [showImport, setShowImport] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const tableRef = useRef<ListTableInstance>(null);

  // VTable options
  const option = useMemo(() => ({
    columns,
    records,
    hover: { highlightMode: 'row' as const },
    select: { mode: 'row' as const },
    menu: {
      contextMenuItems: ['copy', 'paste', 'deleteRow', 'insertRow'],
    },
    editCellTrigger: 'click' as const,
    keyboardOptions: {
      moveEditCellOnArrowKeys: false,
      editCellOnEnter: true,
    },
    autoFill: true,
    // Theme will be registered separately
  }), [columns, records]);

  // Cell edit handler
  const onCellChange = useMemo(
    () => createCellEditHandler({ records, onCellChange: handleCellChange }),
    [records, handleCellChange],
  );

  // Theme registration
  const theme = useMemo(() => buildVTableTheme(), []);

  // Export
  const handleExportCsv = useCallback(() => {
    if (tableRef.current) downloadCsv(tableRef.current, `${sheet?.name ?? 'export'}.csv`);
  }, [sheet]);

  const handleExportXlsx = useCallback(() => {
    if (sheet?.id) {
      const a = document.createElement('a');
      a.href = `/api/admin/smartsheet/${sheet.id}/export/xlsx`;
      a.download = `${sheet.name ?? 'export'}.xlsx`;
      a.click();
    }
  }, [sheet]);

  // Delete selected rows
  const handleDeleteSelected = useCallback(() => {
    const table = tableRef.current;
    if (!table) return;
    const selected = table.getSelectedCellInfos?.();
    if (!selected?.length) { toast('请先选择行'); return; }
    const rowIds = [...new Set(selected.map((s: { row: number }) => records[s.row]?.__id).filter(Boolean))] as string[];
    if (rowIds.length) handleDeleteRows(rowIds);
  }, [records, handleDeleteRows]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-full text-[var(--app-color-text-secondary)] text-sm">
      加载中...
    </div>
  );

  return (
    <div className="flex flex-col h-full gap-3 p-4 bg-[var(--app-color-surface-page)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-[var(--app-radius-container)]
        bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)]
        shadow-[var(--app-shadow-card)]">
        <Table2 className="w-5 h-5 text-[var(--app-color-primary)]" />
        <span className="font-semibold text-[var(--app-color-text-primary)] text-sm">
          {sheet?.name ?? '加载中...'}
        </span>
        <div className="flex-1" />
        <button
          onClick={handleAddRow}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            bg-[var(--app-color-primary)] text-white hover:opacity-90 transition-opacity flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> 添加行
        </button>
        <button
          onClick={handleDeleteSelected}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            bg-[var(--app-color-feedback-danger)] text-white hover:opacity-90 transition-opacity"
        >
          删除选中
        </button>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className={`px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium border
            transition-colors flex items-center gap-1
            ${showSearch
              ? 'bg-[var(--app-color-primary)] text-white border-transparent'
              : 'border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-container-hover)]'
            }`}
        >
          <Search className="w-3.5 h-3.5" /> 搜索
        </button>
        <button
          onClick={() => setShowImport(true)}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]
            hover:bg-[var(--app-color-surface-container-hover)] transition-colors flex items-center gap-1"
        >
          <FileUp className="w-3.5 h-3.5" /> 导入
        </button>
        <button
          onClick={handleExportCsv}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]
            hover:bg-[var(--app-color-surface-container-hover)] transition-colors flex items-center gap-1"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" /> CSV
        </button>
        <button
          onClick={handleExportXlsx}
          className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium
            border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]
            hover:bg-[var(--app-color-surface-container-hover)] transition-colors flex items-center gap-1"
        >
          <Save className="w-3.5 h-3.5" /> Excel
        </button>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 rounded-[var(--app-radius-container)]
          bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)]">
          <SearchComponent tableInstance={tableRef.current!} />
        </div>
      )}

      {/* VTable grid */}
      <div className="flex-1 min-h-0 rounded-[var(--app-radius-container)]
        border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]
        shadow-[var(--app-shadow-card)] overflow-hidden">
        <ListTable
          ref={tableRef}
          option={option}
          theme={theme}
          themeName={getThemeName()}
          onChangeCellValue={onCellChange}
          height="100%"
        />
      </div>

      {/* Import dialog */}
      {showImport && (
        <ImportDialog
          sheetId={id!}
          columns={sheet?.columnsConfig ?? []}
          open={showImport}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); refetch(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/features/smartsheet/SmartSheetPage.tsx
git commit -m "refactor: rewrite SmartSheetPage with VTable ListTable + toolbar + search"
```

### Task 3.8: 清理删除旧组件文件

**Files:**
- Delete: 以下文件从项目中移除

- [ ] **Step 1: 删除被 VTable 替代的组件**

```bash
cd d:/codex/verson.1.2/20260416/frontend/src/features/smartsheet

# 这些组件已被 VTable 内置功能替代
git rm components/SmartSheetGrid.tsx
git rm components/SmartSheetContextMenu.tsx
git rm components/SmartSheetStatusBar.tsx
git rm components/FindReplaceDialog.tsx
git rm components/ConditionalFormatPanel.tsx
git rm components/SmartSheetImportDialog.tsx
git rm components/SmartSheetStatsCards.tsx

# 这些 hooks 已被新 hooks 替代
git rm hooks/useCellFormat.ts
git rm hooks/useSmartSheetStats.ts

# 旧的 useSmartSheet hook（保留到确认新 hook 可用后再删）
# git rm hooks/useSmartSheet.ts
```

- [ ] **Step 2: 改造保留的组件适配新的 API**

`SmartSheetToolbar.tsx` → 替换为行内工具栏（已在 SmartSheetPage 中实现）
`ImportDialog.tsx` → 适配新的 import API 返回格式
`FormatBar.tsx` → 保留但简化（VTable 内置格式化，FormatBar 作为辅助）
`ColorPicker.tsx` → 保留不变
`SmartSheetTabsRow.tsx` → 保留（后续多 sheet 功能）

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: remove old smartsheet components replaced by VTable"
```

### Task 3.9: 更新路由注册（如有需要）

**Files:**
- Verify: `frontend/src/router/index.tsx` — smartsheet 路由不变
- Verify: `frontend/src/features/admin/adminNavRegistry.ts` — 导航菜单项不变

- [ ] **Step 1: 确认路由正常**

```bash
# 确认路由注册不变
grep -n "smartsheet" frontend/src/router/index.tsx
# 预期输出: /admin/smartsheet 和 /admin/smartsheet/:id 路由仍在
```

- [ ] **Step 2: Commit（如有修改）**

---

## Phase 4: 验证与收尾

### Task 4.1: TypeScript 编译检查

- [ ] **Step 1: 运行 TypeScript 检查**

```bash
cd d:/codex/verson.1.2/20260416/frontend
npx tsc --noEmit
```

修复所有编译错误。

- [ ] **Step 2: Commit**

```bash
git commit -m "fix: resolve TypeScript errors from smartsheet v2 migration"
```

### Task 4.2: 后端编译检查

- [ ] **Step 1: 运行 Maven 编译**

```bash
cd d:/codex/verson.1.2/20260416
mvn compile -q
```

修复所有编译错误。

- [ ] **Step 2: Commit**

```bash
git commit -m "fix: resolve Java compilation errors from smartsheet v2 refactor"
```

### Task 4.3: 集成验证

- [ ] **Step 1: 启动后端**

```bash
cd d:/codex/verson.1.2/20260416
mvn spring-boot:run
```

验证 API 响应：
```bash
curl http://localhost:8080/api/admin/smartsheet/sheet/page
```

- [ ] **Step 2: 启动前端**

```bash
cd d:/codex/verson.1.2/20260416/frontend
npm run dev
```

访问 `http://localhost:5173/#/admin/smartsheet`，验证：
- VTable 渲染正常
- 单元格编辑 → PATCH API 调用成功
- Checkbox/Select 等列类型渲染正确
- CSV/XLSX 导出下载正常
- 文件导入功能正常
- 搜索功能正常

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: smartsheet v2 integration verified"
```

---

## 任务依赖图

```
Phase 1 (基础设施)
  1.1 DB 迁移 ─────────────────────────────────────┐
  1.2 VTable 依赖安装 ──────────────────────────────┤
                                                     │
Phase 2 (后端)                   Phase 3 (前端)     │
  2.1 枚举类 ───┐                   3.1 类型定义 ───┤
  2.2 DTO ──────┤                   3.2 列配置 ─────┤
  2.3 Entity ───┤                   3.3 主题配置 ───┤
  2.4 Mapper ───┤                   3.4 API 层 ─────┤
  2.5 Validator─┤                   3.5 Hooks ──────┤
  2.6 RowSvc ───┤                   3.6 编辑器适配 ─┤
  2.7 Import ───┤                   3.7 Page 重写 ──┤
  2.8 Export ───┤                   3.8 清理旧文件 ─┤
  2.9 Controller┤                   3.9 路由验证 ───┤
                │                                    │
                └────── Phase 4 (验证) ──────────────┘
                          4.1 TS 编译
                          4.2 Java 编译
                          4.3 集成验证
```

Phase 2 和 Phase 3 可在两个独立 agent 中并行执行。
