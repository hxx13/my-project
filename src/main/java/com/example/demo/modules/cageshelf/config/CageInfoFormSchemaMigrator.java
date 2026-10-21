package com.example.demo.modules.cageshelf.config;

import com.example.demo.modules.cageshelf.service.CageInfoValueService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 笼位表单四页对齐 NHP 的增量建表迁移器。
 *
 * 在 {@link CageInfoSchemaMigrator}（@Order(132)）之后执行，新增：
 *  - 字段字典套 cage_info_field_dictionary（含 structure_json 域/子模块大纲）
 *  - cage_info_field 增列 domain_code / submodule_code / status（字段状态机）
 *  - cage_info_codelist 增列 version / status（码表版本与校对状态）
 *  - 子字典联动表 cage_info_codelist_link
 *  - 表单模板实体 cage_form_template / cage_form_section / cage_form_field / cage_form_composite_atom
 *
 * 全部幂等（CREATE TABLE IF NOT EXISTS + ALTER 吞「列已存在」），建表走代码路径，绝不直连数据库手工执行。
 */
@Component
@Order(133)
public class CageInfoFormSchemaMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CageInfoFormSchemaMigrator.class);
    private static final String DICT_TABLE = "cage_info_field_dictionary";
    private static final String DICT_KEY = "cage";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final CageInfoValueService infoValueService;

    public CageInfoFormSchemaMigrator(JdbcTemplate jdbcTemplate,
                                      ObjectMapper objectMapper,
                                      CageInfoValueService infoValueService) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.infoValueService = infoValueService;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            createDictionaryTable();
            ensureFieldColumns();
            ensureCodelistColumns();
            createLinkTable();
            createTemplateTables();
            createInfoValueTable();
            seedDictionary();
            backfillFieldDomainCodes();
            resyncTemplateSnapshot();
            seedInfoValuesFromDetail();
        } catch (Exception e) {
            log.error("[cage-info-form-schema] 迁移失败: {}", e.getMessage(), e);
        }
    }

    private void createInfoValueTable() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_info_value (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    animal_cage_id BIGINT NOT NULL COMMENT '笼位ID',
                    field_id BIGINT NOT NULL COMMENT '字段ID → cage_info_field.id',
                    value_string VARCHAR(512) NULL,
                    value_text TEXT NULL,
                    value_int BIGINT NULL,
                    value_decimal DECIMAL(18,4) NULL,
                    value_date VARCHAR(32) NULL,
                    value_datetime VARCHAR(32) NULL,
                    value_bool TINYINT(1) NULL,
                    value_json JSON NULL,
                    fill_source VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_cage_info_value (animal_cage_id, field_id),
                    KEY idx_cage_info_value_cage (animal_cage_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位级表单值'
                """);
        log.info("[cage-info-form-schema] cage_info_value 表已就绪");
    }

    /** 启动同步：把已在饲养的笼位（cage_cell_detail 有数据）老数据落到笼位级表单值，幂等。 */
    private void seedInfoValuesFromDetail() {
        try {
            List<Long> cageIds = jdbcTemplate.queryForList(
                "SELECT DISTINCT animal_cage_id FROM cage_cell_detail WHERE animal_cage_id IS NOT NULL", Long.class);
            int n = 0;
            for (Long cageId : cageIds) {
                try {
                    infoValueService.seedFromDetail(cageId);
                    n++;
                } catch (Exception e) {
                    log.warn("[cage-info-form-schema] 同步笼位 {} 详情失败: {}", cageId, e.getMessage());
                }
            }
            log.info("[cage-info-form-schema] 老数据同步完成，共 {} 个笼位", n);
        } catch (Exception e) {
            log.warn("[cage-info-form-schema] 老数据同步跳过: {}", e.getMessage());
        }
    }

    private void createDictionaryTable() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_info_field_dictionary (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    dict_key VARCHAR(64) NOT NULL COMMENT '稳定键（cage）',
                    name VARCHAR(128) NOT NULL COMMENT '显示名',
                    species VARCHAR(64) NULL COMMENT '种属标签',
                    description VARCHAR(512) NULL,
                    structure_json TEXT NULL COMMENT '域/子模块大纲 {domains:[{code,name,sortOrder,submodules:[...]}]}',
                    version INT NOT NULL DEFAULT 1,
                    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
                    active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_cage_info_field_dictionary_key (dict_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位字段字典套'
                """);
        log.info("[cage-info-form-schema] {} 表已就绪", DICT_TABLE);
    }

    private void ensureFieldColumns() {
        try {
            jdbcTemplate.execute(
                "ALTER TABLE cage_info_field ADD COLUMN domain_code VARCHAR(16) NULL COMMENT '域编码 Dn' AFTER folder");
        } catch (Exception ignored) { /* 列已存在 */ }
        try {
            jdbcTemplate.execute(
                "ALTER TABLE cage_info_field ADD COLUMN submodule_code VARCHAR(16) NULL COMMENT '子模块编码 Dn.mm' AFTER domain_code");
        } catch (Exception ignored) { /* 列已存在 */ }
        try {
            jdbcTemplate.execute(
                "ALTER TABLE cage_info_field ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PENDING_REVIEW/FROZEN/RETIRED' AFTER published");
        } catch (Exception ignored) { /* 列已存在 */ }
        try {
            jdbcTemplate.execute(
                "ALTER TABLE cage_info_field ADD COLUMN field_type VARCHAR(32) NULL COMMENT '题型（对齐 NHP typeRegistry，18 种）' AFTER data_type");
        } catch (Exception ignored) { /* 列已存在 */ }
        try {
            jdbcTemplate.execute("CREATE INDEX idx_cage_info_field_domain ON cage_info_field (domain_code)");
        } catch (Exception ignored) { /* 索引已存在 */ }
        migrateDataTypeAndBackfillType();
        log.info("[cage-info-form-schema] cage_info_field 域/状态/题型列已就绪");
    }

    private void migrateDataTypeAndBackfillType() {
        // 旧小写 data_type 迁成 NHP 大写 11 种
        jdbcTemplate.update("UPDATE cage_info_field SET data_type = 'INTEGER' WHERE data_type = 'number'");
        jdbcTemplate.update("UPDATE cage_info_field SET data_type = 'STRING' WHERE data_type = 'text'");
        jdbcTemplate.update("UPDATE cage_info_field SET data_type = 'BOOLEAN' WHERE data_type = 'boolean'");
        // 绑定码表的字段按枚举
        jdbcTemplate.update("UPDATE cage_info_field SET data_type = 'ENUM' WHERE dict_key IS NOT NULL AND dict_key <> '' AND data_type = 'STRING'");
        // 回填默认题型（仅空）
        jdbcTemplate.update("UPDATE cage_info_field SET field_type = 'number' WHERE data_type IN ('INTEGER','DECIMAL') AND (field_type IS NULL OR field_type = '')");
        jdbcTemplate.update("UPDATE cage_info_field SET field_type = 'checkbox' WHERE data_type = 'BOOLEAN' AND (field_type IS NULL OR field_type = '')");
        jdbcTemplate.update("UPDATE cage_info_field SET field_type = 'choice' WHERE data_type = 'ENUM_MULTI' AND (field_type IS NULL OR field_type = '')");
        jdbcTemplate.update("UPDATE cage_info_field SET field_type = 'select' WHERE data_type = 'ENUM' AND (field_type IS NULL OR field_type = '')");
        jdbcTemplate.update("UPDATE cage_info_field SET field_type = 'date' WHERE data_type = 'DATE' AND (field_type IS NULL OR field_type = '')");
        jdbcTemplate.update("UPDATE cage_info_field SET field_type = 'date' WHERE data_type = 'DATETIME' AND (field_type IS NULL OR field_type = '')");
        jdbcTemplate.update("UPDATE cage_info_field SET field_type = 'textarea' WHERE data_type = 'TEXT' AND (field_type IS NULL OR field_type = '')");
        jdbcTemplate.update("UPDATE cage_info_field SET field_type = 'file' WHERE data_type = 'FILE' AND (field_type IS NULL OR field_type = '')");
        jdbcTemplate.update("UPDATE cage_info_field SET field_type = 'text' WHERE (field_type IS NULL OR field_type = '')");
        log.info("[cage-info-form-schema] data_type 迁移 + field_type 回填完成");
    }

    /**
     * 模板快照（cage_form_field）的类型/角色/标签列以字典（cage_info_field）为准回灌，
     * 并清掉字典已退役字段的孤儿快照行（快照是冻结副本，字典删字段不会自动消失）。
     *
     * 字典的 data_type 被 {@link #migrateDataTypeAndBackfillType()} 规范成大写 11 种并回填了 field_type，
     * 但先于该迁移生成的模板快照仍揣着旧值（data_type=小写题型、field_type=NULL），导致：
     *   - 前端 fieldType 为空 → 全字段退化成 text 控件 → INTEGER/BOOLEAN 值被 text 分支的类型守卫抹成空白；
     *   - 后端按字典真类型校验 → 往退化成文本框的数字字段写入即 400，整次 PUT 回滚。
     * 校验侧只认字典，快照与字典不一致按定义就是脏数据，故无条件回灌（含 role/editable：详情弹窗据此决定只读）。
     * 本迁移 @Order(133) 在 {@link CageInfoSchemaMigrator}（@Order(132)，含字段退役）之后执行，
     * 因此退役字段此时已从字典消失，可被孤儿清理捕获。
     */
    private void resyncTemplateSnapshot() {
        int n = jdbcTemplate.update(
            "UPDATE cage_form_field ff JOIN cage_info_field f ON f.id = ff.field_id " +
            "SET ff.data_type = f.data_type, ff.field_type = f.field_type, ff.role = f.role, ff.editable = f.editable, ff.config = f.config, ff.label = f.label " +
            "WHERE NOT (ff.data_type <=> f.data_type) " +
            "   OR NOT (ff.field_type <=> f.field_type) " +
            "   OR NOT (ff.role <=> f.role) " +
            "   OR NOT (ff.editable <=> f.editable) " +
            "   OR NOT (ff.config <=> f.config) " +
            "   OR NOT (ff.label <=> f.label)");
        int orphans = jdbcTemplate.update(
            "DELETE ff FROM cage_form_field ff LEFT JOIN cage_info_field f ON f.id = ff.field_id WHERE f.id IS NULL");
        log.info("[cage-info-form-schema] 模板快照字典列回灌完成，修正 {} 个字段，清理 {} 个孤儿字段", n, orphans);
    }

    private void ensureCodelistColumns() {
        try {
            jdbcTemplate.execute(
                "ALTER TABLE cage_info_codelist ADD COLUMN version INT NOT NULL DEFAULT 1 COMMENT '版本号' AFTER folder");
        } catch (Exception ignored) { /* 列已存在 */ }
        try {
            jdbcTemplate.execute(
                "ALTER TABLE cage_info_codelist ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/ACTIVE/PENDING_REVIEW/FROZEN/ARCHIVED' AFTER version");
        } catch (Exception ignored) { /* 列已存在 */ }
        log.info("[cage-info-form-schema] cage_info_codelist 版本/状态列已就绪");
    }

    private void createLinkTable() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_info_codelist_link (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    item_id BIGINT NOT NULL COMMENT '码表项ID → cage_info_codelist_item.id',
                    child_codelist_id BIGINT NOT NULL COMMENT '子字典ID → cage_info_codelist.id',
                    sort_order INT NOT NULL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_cage_codelist_link_item_child (item_id, child_codelist_id),
                    KEY idx_cage_codelist_link_item (item_id),
                    CONSTRAINT fk_cage_codelist_link_item
                        FOREIGN KEY (item_id) REFERENCES cage_info_codelist_item (id) ON DELETE CASCADE,
                    CONSTRAINT fk_cage_codelist_link_child
                        FOREIGN KEY (child_codelist_id) REFERENCES cage_info_codelist (id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='子字典联动（码表项→子码表）'
                """);
        log.info("[cage-info-form-schema] cage_info_codelist_link 表已就绪");
    }

    private void createTemplateTables() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_form_template (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    form_key VARCHAR(64) NOT NULL COMMENT '模板键（原子=域码，组合=cage_detail）',
                    title VARCHAR(128) NOT NULL,
                    kind VARCHAR(16) NOT NULL DEFAULT 'ATOM' COMMENT 'ATOM|COMPOSITE',
                    dict_key VARCHAR(64) NULL COMMENT '字典套键',
                    host_type VARCHAR(16) NULL COMMENT 'RECIPIENT|DONOR',
                    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT|FROZEN|ARCHIVED',
                    version INT NOT NULL DEFAULT 1,
                    active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uk_cage_form_template_key (form_key),
                    KEY idx_cage_form_template_kind (kind, active)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位表单模板'
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_form_section (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    template_id BIGINT NOT NULL COMMENT 'FK→cage_form_template.id',
                    parent_id BIGINT NULL COMMENT '父章节（NULL=域）',
                    code VARCHAR(32) NOT NULL COMMENT '域 Dn / 子模块 Dn.mm',
                    label VARCHAR(128) NOT NULL,
                    sort_order INT NOT NULL DEFAULT 0,
                    KEY idx_cage_form_section_template (template_id, sort_order),
                    KEY idx_cage_form_section_parent (parent_id),
                    CONSTRAINT fk_cage_form_section_template
                        FOREIGN KEY (template_id) REFERENCES cage_form_template (id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位表单章节（域/子模块）'
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_form_field (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    template_id BIGINT NOT NULL COMMENT 'FK→cage_form_template.id',
                    section_id BIGINT NULL COMMENT 'FK→cage_form_section.id（子模块）',
                    field_id BIGINT NOT NULL COMMENT 'FK→cage_info_field.id',
                    canonical VARCHAR(64) NOT NULL COMMENT '字段规范名快照',
                    label VARCHAR(128) NOT NULL,
                    data_type VARCHAR(16) NOT NULL,
                    field_type VARCHAR(32) NULL COMMENT '题型快照',
                    dict_key VARCHAR(64) NULL,
                    role VARCHAR(16) NULL COMMENT '字段角色快照 PK/FK/VALUE/DERIVED（缺省 VALUE）',
                    editable TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许人工修改快照',
                    config JSON NULL COMMENT '字段配置快照（如 optionsSource 动态选项源）',
                    required VARCHAR(8) NOT NULL DEFAULT 'NO',
                    sort_order INT NOT NULL DEFAULT 0,
                    KEY idx_cage_form_field_template (template_id, sort_order),
                    KEY idx_cage_form_field_section (section_id),
                    KEY idx_cage_form_field_field (field_id),
                    CONSTRAINT fk_cage_form_field_template
                        FOREIGN KEY (template_id) REFERENCES cage_form_template (id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位表单字段（呈现层快照）'
                """);
        try {
            jdbcTemplate.execute(
                "ALTER TABLE cage_form_field ADD COLUMN field_type VARCHAR(32) NULL COMMENT '题型快照' AFTER data_type");
        } catch (Exception ignored) { /* 列已存在 */ }
        try {
            jdbcTemplate.execute(
                "ALTER TABLE cage_form_field ADD COLUMN role VARCHAR(16) NULL COMMENT '字段角色快照 PK/FK/VALUE/DERIVED（缺省 VALUE）' AFTER dict_key");
        } catch (Exception ignored) { /* 列已存在 */ }
        try {
            jdbcTemplate.execute(
                "ALTER TABLE cage_form_field ADD COLUMN editable TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许人工修改快照' AFTER role");
        } catch (Exception ignored) { /* 列已存在 */ }
        try {
            jdbcTemplate.execute(
                "ALTER TABLE cage_form_field ADD COLUMN config JSON NULL COMMENT '字段配置快照（如 optionsSource 动态选项源）' AFTER editable");
        } catch (Exception ignored) { /* 列已存在 */ }
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS cage_form_composite_atom (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    composite_template_id BIGINT NOT NULL COMMENT 'FK→cage_form_template.id（组合）',
                    atom_template_id BIGINT NOT NULL COMMENT 'FK→cage_form_template.id（原子）',
                    atom_code VARCHAR(32) NOT NULL COMMENT '原子码 Dn',
                    sort_order INT NOT NULL DEFAULT 0,
                    UNIQUE KEY uk_cage_form_comp_atom (composite_template_id, atom_code),
                    CONSTRAINT fk_cage_form_comp_composite
                        FOREIGN KEY (composite_template_id) REFERENCES cage_form_template (id) ON DELETE CASCADE,
                    CONSTRAINT fk_cage_form_comp_atom
                        FOREIGN KEY (atom_template_id) REFERENCES cage_form_template (id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='组合模板钉住的原子'
                """);
        log.info("[cage-info-form-schema] cage_form_template / section / field / composite_atom 表已就绪");
    }

    private void seedDictionary() {
        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(1) FROM cage_info_field_dictionary WHERE dict_key = ?", Integer.class, DICT_KEY);
        if (count != null && count > 0) {
            return;
        }
        String structure = defaultStructureJson();
        jdbcTemplate.update(
            "INSERT INTO cage_info_field_dictionary (dict_key, name, species, description, structure_json, version, status, active, created_at, updated_at) "
            + "VALUES (?, ?, NULL, ?, ?, 1, 'ACTIVE', 1, NOW(), NOW())",
            DICT_KEY, "笼位字段字典", "笼架认领/详情表单字段，存于 cage_info_field，与 NHP 字段字典完全隔离。", structure);
        log.info("[cage-info-form-schema] 已播种字典套 {}", DICT_KEY);
    }

    /** 默认四域大纲（对齐种子字段文件夹分类）。 */
    private String defaultStructureJson() {
        String[][] domains = {
            {"D1", "笼位身份"}, {"D2", "项目信息"}, {"D3", "动物信息"}, {"D4", "状态标记"},
        };
        StringBuilder sb = new StringBuilder("{\"domains\":[");
        for (int i = 0; i < domains.length; i++) {
            if (i > 0) sb.append(',');
            sb.append("{\"code\":\"").append(domains[i][0])
              .append("\",\"name\":\"").append(domains[i][1])
              .append("\",\"sortOrder\":").append((i + 1) * 10)
              .append(",\"submodules\":[]}");
        }
        sb.append("]}");
        return sb.toString();
    }

    /** 种子字段按现有 folder 回填 domain_code；未分类归 D5。幂等。 */
    private void backfillFieldDomainCodes() {
        String[][] folderToDomain = {
            {"笼位身份", "D1"}, {"项目信息", "D2"}, {"动物信息", "D3"}, {"状态标记", "D4"},
        };
        for (String[] f : folderToDomain) {
            // 除了「从未归域」（NULL/空），还要修「被误归成 D5」的：
            // 早期 seed 在 folder 回填之后才插入新字段（如使用时间），首次启动 folder 还是空 →
            // 被归入未分类；之后回填只看 NULL，这个错误就永远修不回来。
            jdbcTemplate.update(
                "UPDATE cage_info_field SET domain_code = ? " +
                "WHERE folder = ? AND (domain_code IS NULL OR domain_code = '' OR domain_code = 'D5')",
                f[1], f[0]);
        }
        // 未分类（folder 为空）归 D5，保证有归属；D5 域不进默认大纲，由结构接口合并呈现。
        jdbcTemplate.update(
            "UPDATE cage_info_field SET domain_code = 'D5' WHERE (folder IS NULL OR folder = '') AND domain_code IS NULL");
        // 已发布字段 status 回填 FROZEN（published=1 ⟺ status=FROZEN 不变量），自定义草稿字段维持 DRAFT。
        jdbcTemplate.update(
            "UPDATE cage_info_field SET status = 'FROZEN' WHERE published = 1 AND (status IS NULL OR status = '' OR status = 'DRAFT')");
        // 字段域修好后，把被固化进「未分类」原子模板的字段挪回它所属的域原子。
        // 独立 try：模板快照有问题也不能挡住后面的字典/值同步。
        try {
            rehomeUncategorizedAtomFields();
        } catch (Exception e) {
            log.warn("[cage-info-form-schema] 修正未分类原子模板失败: {}", e.getMessage());
        }
        log.info("[cage-info-form-schema] 字段域编码与状态回填完成");
    }

    /**
     * 把「未分类」原子模板里、字段域已明确的字段挪回对应域的原子模板。
     *
     * <p>原子模板是生成快照，不会跟着 {@code cage_info_field.domain_code} 自动变。历史误归一次之后，
     * 表单页就会一直把「使用时间」这类字段显示在“未分类”下 —— 只修字典不修快照，页面看起来没变化。
     * 只处理 D5 原子里的字段（不动管理员在其它域原子里的编排），目标原子/章节不存在时跳过。
     */
    private void rehomeUncategorizedAtomFields() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT ff.id, ff.field_id, ff.canonical, f.domain_code, f.submodule_code " +
            "FROM cage_form_field ff " +
            "JOIN cage_form_template t ON t.id = ff.template_id AND t.form_key = 'D5' AND t.kind = 'ATOM' " +
            "JOIN cage_info_field f ON f.id = ff.field_id " +
            "WHERE f.domain_code IN ('D1','D2','D3','D4')");
        int moved = 0;
        for (Map<String, Object> r : rows) {
            String domain = String.valueOf(r.get("domain_code")).trim().toUpperCase();
            Long atomId = queryLong("SELECT id FROM cage_form_template WHERE form_key = ? AND kind = 'ATOM'", domain);
            if (atomId == null) continue;
            Long rootSectionId = queryLong(
                "SELECT id FROM cage_form_section WHERE template_id = ? AND parent_id IS NULL AND code = ?",
                atomId, domain);
            if (rootSectionId == null) continue;
            // 有子模块的字段挂到同名子模块章节，否则挂域直属
            String submodule = r.get("submodule_code") == null ? "" : String.valueOf(r.get("submodule_code")).trim();
            Long sectionId = rootSectionId;
            if (!submodule.isEmpty()) {
                Long subSectionId = queryLong(
                    "SELECT id FROM cage_form_section WHERE template_id = ? AND parent_id = ? AND code = ?",
                    atomId, rootSectionId, submodule);
                if (subSectionId != null) sectionId = subSectionId;
            }
            String canonical = String.valueOf(r.get("canonical"));
            Integer exists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM cage_form_field ff JOIN cage_form_template t ON t.id = ff.template_id " +
                "WHERE t.form_key = ? AND ff.canonical = ?",
                Integer.class, domain, canonical);
            if (exists == null || exists == 0) {
                jdbcTemplate.update(
                    "INSERT INTO cage_form_field (template_id, section_id, field_id, canonical, label, data_type, " +
                    "field_type, dict_key, role, editable, config, required, sort_order) " +
                    "SELECT ?, ?, ff.field_id, ff.canonical, ff.label, ff.data_type, ff.field_type, ff.dict_key, " +
                    "       ff.role, ff.editable, ff.config, ff.required, " +
                    "       COALESCE((SELECT MAX(x.sort_order) FROM cage_form_field x WHERE x.section_id = ?), 0) + 10 " +
                    "FROM cage_form_field ff WHERE ff.id = ?",
                    atomId, sectionId, sectionId, r.get("id"));
            }
            jdbcTemplate.update("DELETE FROM cage_form_field WHERE id = ?", r.get("id"));
            moved++;
        }
        if (moved > 0) {
            log.info("[cage-info-form-schema] 已把 {} 个误归「未分类」的字段挪回所属域原子", moved);
        }
    }

    private Long queryLong(String sql, Object... args) {
        try {
            List<Long> ids = jdbcTemplate.queryForList(sql, Long.class, args);
            return ids.isEmpty() ? null : ids.get(0);
        } catch (Exception e) {
            return null;
        }
    }
}
