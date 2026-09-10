package com.example.demo.modules.cageshelf.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 笼位字段字典表迁移 — 建 cage_info_field 表并从 aro_field_mapping.json 播种 30 个 canonical 字段。
 * 幂等：CREATE TABLE IF NOT EXISTS + INSERT ... ON DUPLICATE KEY UPDATE（键为 canonical）。
 * 排在 {@link CageShelfSchemaMigrator}（@Order(130)）之后执行。
 */
@Component
@Order(132)
public class CageInfoSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CageInfoSchemaMigrator.class);
    private static final String TABLE = "cage_info_field";
    private static final String MAPPING_RESOURCE = "aro_field_mapping.json";

    /** canonical → 默认文件夹（与前端历史 CATEGORY_MAP 对齐，仅用于回填） */
    private static final Map<String, String> DEFAULT_FIELD_FOLDERS = buildDefaultFolderMap();

    /** canonical → 中文显示名（任务指定的精确文案） */
    private static final Map<String, String> LABELS = buildLabelMap();

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public CageInfoSchemaMigrator(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            createTableIfNeeded();
            ensurePublishedColumn();
            ensureEditableColumn();
            ensureFolderColumn();
            createCodelistTablesIfNeeded();
            createAuditTablesIfNeeded();
            seedFromMapping();
            seedLocalFields();
            ensureAnimalFieldsEditable();
            ensureExtraFieldsEditable();
            patchStrainCombo();
            retireStateFields();
        } catch (Exception e) {
            log.error("[cage-info-schema] 迁移失败: {}", e.getMessage(), e);
        }
    }

    private void createTableIfNeeded() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_info_field (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    canonical VARCHAR(64) NOT NULL COMMENT '本地规范字段名',
                    label VARCHAR(128) NOT NULL COMMENT '中文显示名',
                    data_type VARCHAR(16) NOT NULL COMMENT 'number/text/boolean',
                    dict_key VARCHAR(64) NULL COMMENT '码表键',
                    folder VARCHAR(64) NULL COMMENT '文件夹分类（NULL=未分类）',
                    role VARCHAR(16) NOT NULL DEFAULT 'VALUE' COMMENT '字段角色',
                    editable TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许人工修改（与 role 解耦）',
                    required VARCHAR(8) NOT NULL DEFAULT 'NO' COMMENT '是否必填 YES/NO',
                    show_when JSON NULL COMMENT '条件显示规则',
                    sync_source VARCHAR(256) NULL COMMENT 'ARO字段路径',
                    config JSON NULL COMMENT '字段配置',
                    sort INT NULL COMMENT '排序值',
                    published TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否发布',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_cage_info_field_canonical (canonical),
                    KEY idx_cage_info_field_sort (sort)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位字段字典表'
                """);
        log.info("[cage-info-schema] {} 表已就绪", TABLE);
    }

    /**
     * 补齐 published 列（兼容旧表）：ALTER 幂等，仅在「新加列」时回填存量行 = 1（种子字段发布）。
     * 后续运行时由 create() 新建的自定义字段默认 published=0，不在此被误发布。
     */
    private void ensurePublishedColumn() {
        boolean added = false;
        try {
            jdbcTemplate.execute("ALTER TABLE cage_info_field ADD COLUMN published TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否发布'");
            added = true;
        } catch (Exception ignored) { /* 列已存在 */ }
        if (added) {
            try {
                jdbcTemplate.update("UPDATE cage_info_field SET published = 1 WHERE published = 0");
            } catch (Exception e) {
                log.warn("[cage-info-schema] 回填 published 失败: {}", e.getMessage());
            }
        }
        log.info("[cage-info-schema] {} published 列就绪", TABLE);
    }

    /**
     * 补齐 editable 列（兼容旧表）：与 role 解耦的「是否允许人工修改」开关。
     * 仅在「新加列」时按 role 回填一次：VALUE → 1，其余（DERIVED/PK/FK）→ 0。
     * 之后由字段管理页自由调整，播种不再覆盖（见 {@link #upsert}）。
     */
    private void ensureEditableColumn() {
        boolean added = false;
        try {
            jdbcTemplate.execute("ALTER TABLE cage_info_field ADD COLUMN editable TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许人工修改（与 role 解耦）' AFTER role");
            added = true;
        } catch (Exception ignored) { /* 列已存在 */ }
        if (added) {
            try {
                jdbcTemplate.update("UPDATE cage_info_field SET editable = CASE WHEN role = 'VALUE' THEN 1 ELSE 0 END");
            } catch (Exception e) {
                log.warn("[cage-info-schema] 回填 editable 失败: {}", e.getMessage());
            }
        }
        log.info("[cage-info-schema] {} editable 列就绪{}", TABLE, added ? "（新加）" : "");
    }

    /**
     * 补齐 folder 列（兼容旧表）：种子字段按 canonical 归入默认分类文件夹。
     */
    private void ensureFolderColumn() {
        boolean added = false;
        try {
            jdbcTemplate.execute(
                "ALTER TABLE cage_info_field ADD COLUMN folder VARCHAR(64) NULL COMMENT '文件夹分类（NULL=未分类）' AFTER dict_key");
            added = true;
        } catch (Exception ignored) { /* 列已存在 */ }
        try {
            jdbcTemplate.execute("CREATE INDEX idx_cage_info_field_folder ON cage_info_field (folder)");
        } catch (Exception ignored) { /* 索引已存在 */ }
        backfillDefaultFolders();
        log.info("[cage-info-schema] {} folder 列就绪{}", TABLE, added ? "（新加）" : "");
    }

    private void backfillDefaultFolders() {
        for (Map.Entry<String, String> e : DEFAULT_FIELD_FOLDERS.entrySet()) {
            try {
                jdbcTemplate.update(
                    "UPDATE cage_info_field SET folder = ? WHERE canonical = ? AND (folder IS NULL OR folder = '')",
                    e.getValue(), e.getKey());
            } catch (Exception ex) {
                log.warn("[cage-info-schema] 回填 folder {} 失败: {}", e.getKey(), ex.getMessage());
            }
        }
    }

    private void createCodelistTablesIfNeeded() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_info_codelist (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    code VARCHAR(64) NOT NULL COMMENT '码表编码（笼位域命名空间）',
                    name VARCHAR(128) NOT NULL COMMENT '码表中文名',
                    folder VARCHAR(64) NULL COMMENT '文件夹分类（NULL=未分类）',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_cage_info_codelist_code (code),
                    KEY idx_cage_info_codelist_folder (folder)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位域码表'
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_info_codelist_item (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    codelist_id BIGINT NOT NULL COMMENT '码表ID → cage_info_codelist.id',
                    item_code VARCHAR(64) NOT NULL COMMENT '内部值（唯一）',
                    item_label VARCHAR(256) NOT NULL COMMENT '展示文本',
                    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_cage_codelist_item (codelist_id, item_code),
                    KEY idx_cage_codelist_item_sort (codelist_id, sort_order),
                    CONSTRAINT fk_cage_codelist_item_codelist
                        FOREIGN KEY (codelist_id) REFERENCES cage_info_codelist (id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位域码表项'
                """);
        log.info("[cage-info-schema] cage_info_codelist / cage_info_codelist_item 表已就绪");
    }

    private void createAuditTablesIfNeeded() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_form_audit_log (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    category VARCHAR(20) NOT NULL COMMENT 'data|dict',
                    change_type VARCHAR(32) NOT NULL COMMENT 'BIND/UNBIND/TRANSFER/UPDATE/CREATE/DELETE/PUBLISH',
                    entity VARCHAR(32) NULL COMMENT 'field/codelist/claim/cage_box/form',
                    entity_id BIGINT NULL,
                    entity_code VARCHAR(128) NULL,
                    entity_name VARCHAR(256) NULL,
                    target_type VARCHAR(32) NULL COMMENT 'animal_cage/claim',
                    target_id BIGINT NULL,
                    target_label VARCHAR(256) NULL,
                    field_code VARCHAR(128) NULL,
                    field_name VARCHAR(256) NULL,
                    before_value TEXT NULL,
                    after_value TEXT NULL,
                    before_json TEXT NULL,
                    after_json TEXT NULL,
                    operator_id VARCHAR(64) NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_cage_form_audit_category (category, created_at),
                    KEY idx_cage_form_audit_entity (entity, entity_id),
                    KEY idx_cage_form_audit_target (target_type, target_id),
                    KEY idx_cage_form_audit_operator (operator_id, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位表单审计日志'
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_form_template_version (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    form_key VARCHAR(64) NOT NULL COMMENT '表单键，如 cage_detail',
                    version_no INT NOT NULL COMMENT '递增版本号',
                    field_count INT NOT NULL DEFAULT 0 COMMENT '已发布字段数',
                    published_by VARCHAR(64) NULL,
                    published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_cage_form_version (form_key, version_no),
                    KEY idx_cage_form_version_latest (form_key, version_no)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位表单发布版本'
                """);
        log.info("[cage-info-schema] cage_form_audit_log / cage_form_template_version 表已就绪");
    }

    private void seedFromMapping() {
        JsonNode root = loadMapping();
        if (root == null) {
            log.warn("[cage-info-schema] 未解析到 {}，跳过字段播种", MAPPING_RESOURCE);
            return;
        }
        JsonNode mappings = root.get("mappings");
        if (mappings == null || !mappings.isArray()) {
            log.warn("[cage-info-schema] {} 缺少 mappings 数组", MAPPING_RESOURCE);
            return;
        }

        int sort = 1;
        int seeded = 0;
        for (JsonNode m : mappings) {
            String canonical = text(m.get("canonical"));
            if (canonical == null || canonical.isEmpty()) {
                continue;
            }
            String syncSource = resolveSyncSource(m.get("sources"));
            String dataType = mapDataType(text(m.get("type")));
            String label = LABELS.getOrDefault(canonical, canonical);
            upsert(canonical, label, dataType, syncSource, sort++, "DERIVED");
            seeded++;
        }
        log.info("[cage-info-schema] cage_info_field 播种完成，共 {} 条 canonical", seeded);
    }

    /** 本地扩展字段（不从 ARO 映射播种，属系统自有存储，role=VALUE 可填写）：实验记录/照片/本地扩展数据。 */
    private void seedLocalFields() {
        upsert("experiment_desc", "实验记录", "TEXT", null, 100, "VALUE");
        upsert("images_json", "照片", "FILE", null, 101, "VALUE");
        upsert("extra_data", "本地扩展数据", "FILE", null, 102, "VALUE");
        // 使用时间(cage_use_time)与需合笼(needs_cohabitation)已改由 aro_field_mapping.json 播种（DERIVED），勿在此重复。
        log.info("[cage-info-schema] 本地扩展字段已播种(experiment_desc/images_json/extra_data)");

        // 【预留】动物信息（动物品系/性别/周龄/雌雄数量/动物来源）应由「动物订购后到达」时用订单数据绑定并纳入笼位管理体系。
        // 目前「订单到达 → 回写笼位」尚未实现；后续接入时从这里直写对应字段，勿再依赖 ARO cageBoxVo 的动物字段。
    }

    /**
     * 动物信息四个字段开放人工编辑（一次性播种，用 config 是否为空当「没播过」的标记）。
     *  - 动物品系：**输入框 + 候选**（题型 combo），存单值字符串到 value_string。
     *    候选来自该笼位所属 AUP 的品系白名单（config.optionsSource=AUP_ANIMAL_STRAIN 现算），
     *    同时允许自由输入白名单外的品系。
     *    历史坑：早先按 choice + choiceType=multiple 播种，但 data_type 一直是 STRING ——
     *    前端按多选提交数组、写侧按 STRING 要求字符串，保存直接报「需要文本类型」。
     *    改成 combo 后：题型要单值、存储列要字符串，两边终于对上了。
     *  - 性别/周龄/动物来源：暂时手填（这些值最终来自动物订购订单，订单系统尚未接入）
     * 播种后 config 非空，管理员在字段管理页的改动不会再被启动覆盖。
     */
    private void ensureAnimalFieldsEditable() {
        Object[][] rows = {
            {"animal_strain_name", "combo", "{\"optionsSource\":\"AUP_ANIMAL_STRAIN\",\"restrictToAup\":true,\"allowManualInput\":true,\"allowAddOption\":true}"},
            {"animal_sex", null, "{}"},
            {"animal_week_age", null, "{}"},
            {"animal_come_from", null, "{}"},
        };
        int n = 0;
        for (Object[] r : rows) {
            try {
                n += jdbcTemplate.update(
                        "UPDATE cage_info_field SET editable = 1, config = ?, field_type = COALESCE(?, field_type) "
                                + "WHERE canonical = ? AND (config IS NULL OR config = '')",
                        r[2], r[1], r[0]);
            } catch (Exception e) {
                log.warn("[cage-info-schema] 动物字段开放编辑失败 {}: {}", r[0], e.getMessage());
            }
        }
        if (n > 0) {
            log.info("[cage-info-schema] 动物信息字段开放人工编辑 {} 个", n);
        }
    }

    /**
     * 存量库补丁：动物品系拉回「输入框 + 候选」，并补齐通配开关（restrictToAup/allowManualInput/allowAddOption）。
     * 命中条件覆盖四种历史态：非 combo、config 丢了 optionsSource、config 还带着 multiple、config 缺 allowAddOption。
     * 条件命中才写 → 稳态 0 行，不覆盖管理员此后对该字段的其他调整。
     */
    private void patchStrainCombo() {
        try {
            int n = jdbcTemplate.update(
                    "UPDATE cage_info_field SET field_type = 'combo', "
                            + "config = '{\"optionsSource\":\"AUP_ANIMAL_STRAIN\",\"restrictToAup\":true,\"allowManualInput\":true,\"allowAddOption\":true}' "
                            + "WHERE canonical = 'animal_strain_name' "
                            + "  AND (field_type IS NULL OR field_type <> 'combo' "
                            + "       OR config IS NULL OR config NOT LIKE '%AUP_ANIMAL_STRAIN%' "
                            + "       OR config LIKE '%\"multiple\"%' "
                            + "       OR config NOT LIKE '%allowAddOption%')");
            if (n > 0) log.info("[cage-info-schema] 动物品系校正为「输入框+候选」{} 行", n);
        } catch (Exception e) {
            log.warn("[cage-info-schema] 动物品系题型补丁失败: {}", e.getMessage());
        }
    }

    /**
     * 另外四个字段开放人工编辑：雄性/雌性数量、特殊饲养名称/描述。
     * 它们的 role 是 DERIVED，插入时按 role 默认 editable=0，界面上就是只读。
     * 用 config 是否为空当「还没播过」的标记（播完写 '{}'）——
     * 只需生效一次，管理员之后在字段管理页把 editable 改回去也不会被每次启动冲掉。
     */
    private void ensureExtraFieldsEditable() {
        String[] canonicals = {
            "animal_male_number", "animal_female_number",
            "special_breeding_name", "special_breeding_desc",
        };
        int n = 0;
        for (String c : canonicals) {
            try {
                n += jdbcTemplate.update(
                        "UPDATE cage_info_field SET editable = 1, config = '{}' "
                                + "WHERE canonical = ? AND (config IS NULL OR config = '')", c);
            } catch (Exception e) {
                log.warn("[cage-info-schema] 开放人工编辑失败 {}: {}", c, e.getMessage());
            }
        }
        if (n > 0) log.info("[cage-info-schema] 追加开放人工编辑字段 {} 个", n);
    }

    /** 退役字段：state/state_label/rent_type 为 ARO 原始残留或不再需要；pi_name 与 project_pi_name 同义，只保留后者（课题组组长）。从字段字典与表单值中删除。 */
    private void retireStateFields() {
        int retired = 0;
        for (String canonical : new String[]{"state", "state_label", "rent_type", "cage_type_code", "cage_name", "cage_box_name", "animal_cage_id", "position_x", "position_y", "cage_box_code", "cohabitation_date", "pi_name"}) {
            // 已退役（上轮删过或 mapping 不再播种）时为空集，静默跳过，不产生噪音。
            List<Long> ids = jdbcTemplate.queryForList(
                    "SELECT id FROM cage_info_field WHERE canonical = ?", Long.class, canonical);
            for (Long fieldId : ids) {
                jdbcTemplate.update("DELETE FROM cage_info_value WHERE field_id = ?", fieldId);
                jdbcTemplate.update("DELETE FROM cage_info_field WHERE id = ?", fieldId);
                retired++;
            }
        }
        if (retired > 0) {
            log.info("[cage-info-schema] 退役字段清理完成，共 {} 个", retired);
        }
    }

    private void upsert(String canonical, String label, String dataType, String syncSource, int sort, String role) {
        // dict_key/show_when/config 暂无种子来源，置 NULL；种子字段一律 published=1。
        // editable 只在首次插入时按 role 给默认值；ON DUPLICATE 不覆盖——它是人工配置项，不能被每次启动的播种冲掉。
        int editable = "VALUE".equals(role) ? 1 : 0;
        jdbcTemplate.update(
            "INSERT INTO cage_info_field " +
            "(canonical, label, data_type, dict_key, role, editable, required, show_when, sync_source, config, sort, published, created_at, updated_at) " +
            "VALUES (?, ?, ?, NULL, ?, ?, 'NO', NULL, ?, NULL, ?, 1, NOW(), NOW()) " +
            "ON DUPLICATE KEY UPDATE " +
            "label = VALUES(label), data_type = VALUES(data_type), role = VALUES(role), " +
            "sync_source = VALUES(sync_source), sort = VALUES(sort), updated_at = NOW()",
            canonical, label, dataType, role, editable, syncSource, sort);
    }

    /** 读取 classpath 上的映射文件；缺失或解析失败返回 null（no-op）。 */
    private JsonNode loadMapping() {
        try {
            ClassPathResource resource = new ClassPathResource(MAPPING_RESOURCE);
            if (!resource.exists()) {
                log.warn("[cage-info-schema] classpath 未找到 {}", MAPPING_RESOURCE);
                return null;
            }
            try (InputStream in = resource.getInputStream()) {
                return objectMapper.readTree(in);
            }
        } catch (Exception e) {
            log.warn("[cage-info-schema] 解析 {} 失败: {}", MAPPING_RESOURCE, e.getMessage());
            return null;
        }
    }

    /**
     * sync_source = sources.list 的首个值；list 缺失时依次回退 back / book。
     * 每个 source 值可能是字符串或字符串数组，统一取首个元素。
     */
    private String resolveSyncSource(JsonNode sources) {
        if (sources == null || !sources.isObject()) {
            return null;
        }
        String[] keys = {"list", "back", "book"};
        for (String key : keys) {
            JsonNode v = sources.get(key);
            if (v == null || v.isNull()) {
                continue;
            }
            if (v.isArray()) {
                if (v.size() > 0 && v.get(0).isTextual()) {
                    return v.get(0).asText();
                }
            } else if (v.isTextual()) {
                return v.asText();
            }
        }
        return null;
    }

    private String mapDataType(String type) {
        if (type == null) {
            return "STRING";
        }
        switch (type) {
            case "long":
            case "int":
                return "INTEGER";
            case "boolean":
                return "BOOLEAN";
            case "stringarray":
                return "ENUM_MULTI";
            case "string":
            default:
                return "STRING";
        }
    }

    private static String text(JsonNode node) {
        return node == null || node.isNull() ? null : node.asText();
    }

    private static Map<String, String> buildLabelMap() {
        Map<String, String> m = new HashMap<>();
        m.put("animal_cage_id", "笼位ID");
        m.put("position_x", "X坐标");
        m.put("position_y", "Y坐标");
        m.put("cage_box_code", "笼盒编号");
        m.put("project_pi_name", "课题组组长");
        m.put("project_name", "项目名称");
        m.put("department_name", "部门");
        m.put("aup_number", "AUP注册号");
        m.put("needs_division", "需分笼");
        m.put("needs_special_feeding", "需特殊饲养");
        m.put("needs_transfer", "动物转移");
        m.put("has_health_abnormality", "健康异常");
        m.put("cage_use_time", "使用时间");
        m.put("special_breeding_name", "特殊饲养名称");
        m.put("special_breeding_desc", "特殊饲养描述");
        m.put("experimenter_name", "实验员");
        m.put("lab_assistant_name", "管家");
        m.put("animal_strain_name", "动物品系");
        m.put("animal_sex", "性别");
        m.put("animal_week_age", "周龄");
        m.put("animal_male_number", "雄性数量");
        m.put("animal_female_number", "雌性数量");
        m.put("animal_come_from", "动物来源");
        m.put("experiment_desc", "实验记录");
        m.put("images_json", "照片");
        m.put("extra_data", "本地扩展数据");
        m.put("needs_cohabitation", "合笼");
        return m;
    }

    private static Map<String, String> buildDefaultFolderMap() {
        Map<String, String> m = new HashMap<>();
        String[][] groups = {
            {"笼位身份", "animal_cage_id", "position_x", "position_y", "cage_type_code", "state", "state_label",
                "rent_type", "cage_name", "cage_box_code", "cage_box_name"},
            {"项目信息", "project_pi_name", "project_name", "department_name", "aup_number",
                "experimenter_name", "lab_assistant_name"},
            {"动物信息", "animal_strain_name", "animal_sex", "animal_week_age", "animal_male_number",
                "animal_female_number", "animal_come_from", "cage_use_time"},
            {"状态标记", "needs_division", "needs_special_feeding", "needs_transfer", "has_health_abnormality",
                "needs_cohabitation", "special_breeding_name", "special_breeding_desc"},
        };
        for (String[] g : groups) {
            String folder = g[0];
            for (int i = 1; i < g.length; i++) {
                m.put(g[i], folder);
            }
        }
        return m;
    }
}
