package com.example.demo.modules.asset.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
@Order(110)
public class AssetSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AssetSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public AssetSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** 关键词 → emoji 规则（顺序敏感，先匹配先赢） */
    record IconRule(String icon, String... keywords) {
        boolean matches(String name) {
            for (String k : keywords) {
                if (name.contains(k)) {
                    return true;
                }
            }
            return false;
        }
    }

    /** 资产图标规则：按名称关键词匹配，顺序敏感 */
    static final List<IconRule> ASSET_ICON_RULES = List.of(
            new IconRule("🪑", "生物安全柜", "超净工作台", "洁净工作台", "净化工作台"),
            new IconRule("💨", "通风柜", "通风系统"),
            new IconRule("❄️", "液氮"),
            new IconRule("🧊", "冰箱", "冷藏", "冷冻", "保存箱", "冰柜", "低温"),
            new IconRule("🌬️", "空调", "风幕", "除湿", "鼓风", "空压", "气泵"),
            new IconRule("🧼", "灭菌", "消毒", "洗笼", "洗衣机", "烘干", "清洗", "洗手池", "水槽", "水池"),
            new IconRule("🔬", "显微镜"),
            new IconRule("🌀", "离心机"),
            new IconRule("🌡️", "培养箱", "恒温", "水浴", "金属浴"),
            new IconRule("📊", "扩增仪", "PCR", "电泳", "酶标", "光度计", "分析仪", "检测仪", "计数器", "酸度计", "PH计", "天平", "称"),
            new IconRule("💻", "计算机", "电脑", "微机", "服务器", "显示器", "大屏", "终端", "平板", "UPS"),
            new IconRule("🖨️", "打印机", "复印机", "传真机", "扫描仪", "投影机", "扫描器"),
            new IconRule("🐭", "笼", "隔离器", "IVC", "代谢笼", "饲养"),
            new IconRule("🛒", "车", "推车", "转运"),
            new IconRule("🩺", "手术", "解剖", "器械", "钳", "剪", "刀", "针", "牵开器", "无影灯"),
            new IconRule("🩺", "麻醉", "呼吸机", "监护", "生理"),
            new IconRule("📷", "成像", "CT", "荧光", "共聚焦", "摄影"),
            new IconRule("🧫", "切片机", "包埋机", "脱水机", "摊片机", "烘片机"),
            new IconRule("🌀", "摇床", "振荡", "混合器", "搅拌", "研磨"),
            new IconRule("🌡️", "监控", "温度"),
            new IconRule("🏷️", "条码", "标号", "门禁", "寄存柜"),
            new IconRule("📝", "白板", "看板"),
            new IconRule("🛗", "电梯"),
            new IconRule("♨️", "锅炉", "蒸汽", "制氧", "氢氧"),
            new IconRule("💡", "灯"),
            new IconRule("🚰", "饮水", "纯水", "软水"),
            new IconRule("🗃️", "货架", "置物架", "沥水架", "干燥架"),
            new IconRule("🗄️", "柜", "更衣柜", "文件柜", "药品柜", "鞋柜", "储物"),
            new IconRule("🪑", "椅", "凳", "沙发"),
            new IconRule("🪑", "桌", "台"));

    /** 地点图标规则：按名称关键词匹配，顺序敏感 */
    static final List<IconRule> LOCATION_ICON_RULES = List.of(
            new IconRule("🚻", "更衣", "洗手", "卫生间"),
            new IconRule("🏢", "办公室", "会议"),
            new IconRule("🧪", "实验室", "实验台", "操作间"),
            new IconRule("🐭", "隔离器", "动物房", "饲养间", "笼架"),
            new IconRule("🚪", "走廊", "楼梯", "电梯"),
            new IconRule("📦", "储藏", "库房", "仓库"),
            new IconRule("🖥️", "监控", "值班"),
            new IconRule("🩺", "手术", "解剖"));

    static final String ASSET_ICON_FALLBACK = "📦";
    static final String LOCATION_ICON_FALLBACK = "📁";

    /** 纯函数：资产名称 → emoji（无匹配走兜底） */
    public static String resolveAssetIcon(String assetName) {
        return matchIcon(ASSET_ICON_RULES, assetName, ASSET_ICON_FALLBACK);
    }

    /** 纯函数：地点名称 → emoji（无匹配走兜底） */
    public static String resolveLocationIcon(String locationName) {
        return matchIcon(LOCATION_ICON_RULES, locationName, LOCATION_ICON_FALLBACK);
    }

    private static String matchIcon(List<IconRule> rules, String name, String fallback) {
        if (name == null) {
            return fallback;
        }
        for (IconRule rule : rules) {
            if (rule.matches(name)) {
                return rule.icon();
            }
        }
        return fallback;
    }

    @Override
    public void run(ApplicationArguments args) {
        // === 关键列定义：优先执行，独立容错，确保基本列始终存在 ===
        // 「校区」列已废弃（改由存放地点树/文件夹表达），不再新建；存量列由 bootstrap-drop-asset-campus.sql 清理
        safeRun("ensure-col-管理部门", () -> ensureAssetColumnDef("col_管理部门", "管理部门"));

        // === 核心表结构 ===
        safeRun("ddl-asset", () -> {
            try {
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS asset_record (
                        id VARCHAR(64) PRIMARY KEY,
                        asset_code VARCHAR(128) NOT NULL COMMENT '资产编码',
                        asset_name VARCHAR(255) NOT NULL COMMENT '资产名称',
                        status VARCHAR(64) DEFAULT 'NORMAL' COMMENT '资产状态',
                        location VARCHAR(255) COMMENT '当前位置',
                        locked TINYINT NOT NULL DEFAULT 0 COMMENT '是否锁定',
                        note VARCHAR(500) COMMENT '标注信息',
                        latest_transfer_request_id VARCHAR(64) COMMENT '最新转移申请ID',
                        create_by VARCHAR(50) COMMENT '创建人ID',
                        update_by VARCHAR(50) COMMENT '更新人ID',
                        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_asset_record_code (asset_code),
                        KEY idx_asset_record_name (asset_name),
                        KEY idx_asset_record_status (status),
                        KEY idx_asset_record_locked (locked)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产主表'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS asset_column_def (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        column_key VARCHAR(64) NOT NULL COMMENT '列键',
                        column_label VARCHAR(128) NOT NULL COMMENT '列名',
                        value_type VARCHAR(32) NOT NULL DEFAULT 'TEXT' COMMENT '值类型',
                        sortable TINYINT NOT NULL DEFAULT 1 COMMENT '是否可排序',
                        searchable TINYINT NOT NULL DEFAULT 1 COMMENT '是否可搜索',
                        sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号',
                        create_by VARCHAR(50) COMMENT '创建人ID',
                        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_asset_column_key (column_key)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产动态列定义'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS asset_record_value (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        asset_id VARCHAR(64) NOT NULL COMMENT '资产ID',
                        column_key VARCHAR(64) NOT NULL COMMENT '列键',
                        column_value TEXT COMMENT '列值',
                        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_asset_value_asset_col (asset_id, column_key),
                        KEY idx_asset_value_col (column_key),
                        KEY idx_asset_value_asset (asset_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产动态列值'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS asset_transfer_request (
                        id VARCHAR(64) PRIMARY KEY,
                        asset_id VARCHAR(64) NOT NULL COMMENT '资产ID',
                        asset_code VARCHAR(128) NOT NULL COMMENT '资产编码',
                        asset_name VARCHAR(255) NOT NULL COMMENT '资产名称',
                        applicant_id VARCHAR(50) NOT NULL COMMENT '申请人ID',
                        applicant_name VARCHAR(100) COMMENT '申请人名称',
                        transfer_time DATETIME NOT NULL COMMENT '申请转移时间',
                        transfer_location VARCHAR(255) NOT NULL COMMENT '申请转移地点',
                        remark VARCHAR(500) COMMENT '申请备注',
                        photo_url TEXT COMMENT '上传照片URL',
                        status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED' COMMENT '申请状态',
                        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_asset_transfer_asset (asset_id),
                        INDEX idx_asset_transfer_applicant (applicant_id),
                        INDEX idx_asset_transfer_create_time (create_time)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产转移申请'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS asset_transfer_log (
                        id VARCHAR(64) PRIMARY KEY,
                        request_id VARCHAR(64) NOT NULL COMMENT '申请ID',
                        asset_id VARCHAR(64) NOT NULL COMMENT '资产ID',
                        action_type VARCHAR(32) NOT NULL COMMENT '动作类型',
                        operator_id VARCHAR(50) COMMENT '操作人ID',
                        remark VARCHAR(500) COMMENT '备注',
                        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_asset_transfer_log_request (request_id),
                        INDEX idx_asset_transfer_log_asset (asset_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产转移流程日志'
                    """);
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS asset_transfer_export_file (
                        id VARCHAR(64) PRIMARY KEY,
                        request_id VARCHAR(64) NOT NULL COMMENT '转移申请ID',
                        file_name VARCHAR(255) NOT NULL COMMENT '导出文件名',
                        storage_key VARCHAR(500) NOT NULL COMMENT '文件存储键/URL',
                        download_token VARCHAR(128) NOT NULL COMMENT '下载令牌',
                        status VARCHAR(32) NOT NULL DEFAULT 'READY' COMMENT '状态:GENERATING/READY/FAILED/EXPIRED',
                        expire_at DATETIME NOT NULL COMMENT '过期时间',
                        summary_text VARCHAR(500) NULL COMMENT '摘要',
                        created_by VARCHAR(50) NULL COMMENT '创建人',
                        created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_asset_transfer_export_request (request_id),
                        INDEX idx_asset_transfer_export_expire (expire_at),
                        UNIQUE KEY uk_asset_transfer_export_token (download_token)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='转移记录PDF导出文件'
                    """);
            ensureColumnExists("asset_record", "deleted",
                    "ALTER TABLE asset_record ADD COLUMN deleted TINYINT NOT NULL DEFAULT 0 COMMENT '是否删除:1是,0否'");
            ensureColumnExists("asset_record", "deleted_time",
                    "ALTER TABLE asset_record ADD COLUMN deleted_time DATETIME NULL COMMENT '删除时间'");
            ensureColumnExists("asset_record", "deleted_by",
                    "ALTER TABLE asset_record ADD COLUMN deleted_by VARCHAR(50) NULL COMMENT '删除人ID'");
            ensureColumnExists("asset_record", "purge_after_time",
                    "ALTER TABLE asset_record ADD COLUMN purge_after_time DATETIME NULL COMMENT '计划彻底清理时间'");
            ensureColumnExists("asset_transfer_request", "photo_urls_before",
                    "ALTER TABLE asset_transfer_request ADD COLUMN photo_urls_before TEXT NULL COMMENT '转移前照片URL JSON数组'");
            ensureColumnExists("asset_transfer_request", "photo_urls_after",
                    "ALTER TABLE asset_transfer_request ADD COLUMN photo_urls_after TEXT NULL COMMENT '转移后照片URL JSON数组'");
            ensureColumnExists("asset_transfer_request", "from_location",
                    "ALTER TABLE asset_transfer_request ADD COLUMN from_location VARCHAR(255) NULL COMMENT '转移前资产所在地(用于管理员删除后回滚)'");
            ensureColumnExists("asset_record", "photo_urls",
                    "ALTER TABLE asset_record ADD COLUMN photo_urls TEXT NULL COMMENT '资产照片URL JSON数组(转移前参考照片)'");
            ensureColumnExists("asset_transfer_request", "from_user_name",
                    "ALTER TABLE asset_transfer_request ADD COLUMN from_user_name VARCHAR(100) NULL COMMENT '转移前使用人姓名(用于对比展示)'");

            // 1a. 资产导入批次表
            jdbcTemplate.execute("""
                    CREATE TABLE IF NOT EXISTS asset_import_batch (
                        id VARCHAR(64) PRIMARY KEY,
                        file_name VARCHAR(255) NOT NULL,
                        imported_by VARCHAR(64),
                        imported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        created_count INT DEFAULT 0,
                        updated_count INT DEFAULT 0,
                        skipped_count INT DEFAULT 0,
                        error_detail TEXT,
                        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产导入批次'
                    """);

            // 1b. created_by_batch_id 列 + 索引
            ensureColumnExists("asset_record", "created_by_batch_id",
                    "ALTER TABLE asset_record ADD COLUMN created_by_batch_id VARCHAR(64) DEFAULT NULL COMMENT '创建该资产的导入批次ID'");
            ensureIndexExists("asset_record", "idx_asset_record_batch",
                    "CREATE INDEX idx_asset_record_batch ON asset_record(created_by_batch_id)");

            // 1c. 存放地点树外键列 + 索引（asset_record 由本类创建，故不能放进更早的 bootstrap SQL）
            ensureColumnExists("asset_record", "location_node_id",
                    "ALTER TABLE asset_record ADD COLUMN location_node_id BIGINT NULL COMMENT '所属存放地点节点ID'");
            ensureIndexExists("asset_record", "idx_asset_record_loc_node",
                    "CREATE INDEX idx_asset_record_loc_node ON asset_record(location_node_id)");

            // 1d. 图标列：asset_record 由本类创建、asset_location 由 bootstrap SQL 创建，两者都放这里补最稳
            ensureColumnExists("asset_record", "icon",
                    "ALTER TABLE asset_record ADD COLUMN icon VARCHAR(16) NULL COMMENT '资产图标 emoji'");
            ensureColumnExists("asset_location", "icon",
                    "ALTER TABLE asset_location ADD COLUMN icon VARCHAR(16) NULL COMMENT '地点图标 emoji'");

            log.info("[asset-schema] 资产相关表已就绪");
        } catch (Exception e) {
            log.error("[asset-schema] 表结构迁移失败: {}", e.getMessage());
        }
        });
        // 以下操作独立容错，顺序：先修错误标签，再合并重复
        safeRun("fix-bad-label", () -> ensureColumnDefFixBadLabel("存放地点2411033", "存放地点"));
        safeRun("cleanup-dup-col", this::ensureColumnDefCleanup);
        // 地点树播种：表为空时用现有 EAV 地点文本建顶层节点并回填外键
        safeRun("seed-asset-locations", this::seedAssetLocations);
        // 图标预置：只填 icon IS NULL 的行，人工设置过的永不覆盖
        safeRun("seed-icons", this::seedIcons);
    }

    /**
     * 按名称关键词预置 emoji 图标。幂等：只更新 icon IS NULL 的行；
     * 每条规则一条 UPDATE（非逐行循环），先匹配的规则先写，后续规则不再覆盖。
     */
    private void seedIcons() {
        int assetUpdated = 0;
        for (IconRule rule : ASSET_ICON_RULES) {
            assetUpdated += updateIconByKeywords("asset_record", "asset_name", rule);
        }
        assetUpdated += updateIconFallback("asset_record", ASSET_ICON_FALLBACK);

        int locationUpdated = 0;
        for (IconRule rule : LOCATION_ICON_RULES) {
            locationUpdated += updateIconByKeywords("asset_location", "name", rule);
        }
        locationUpdated += updateIconFallback("asset_location", LOCATION_ICON_FALLBACK);

        log.info("[asset-schema] 预置图标：资产 {} 行，地点 {} 行", assetUpdated, locationUpdated);
    }

    private int updateIconByKeywords(String table, String nameColumn, IconRule rule) {
        StringBuilder sql = new StringBuilder("UPDATE ").append(table)
                .append(" SET icon = ? WHERE icon IS NULL AND deleted = 0 AND (");
        for (int i = 0; i < rule.keywords().length; i++) {
            if (i > 0) {
                sql.append(" OR ");
            }
            sql.append(nameColumn).append(" LIKE ?");
        }
        sql.append(")");
        Object[] params = new Object[rule.keywords().length + 1];
        params[0] = rule.icon();
        for (int i = 0; i < rule.keywords().length; i++) {
            params[i + 1] = "%" + rule.keywords()[i] + "%";
        }
        return jdbcTemplate.update(sql.toString(), params);
    }

    private int updateIconFallback(String table, String fallback) {
        return jdbcTemplate.update(
                "UPDATE " + table + " SET icon = ? WHERE icon IS NULL AND deleted = 0", fallback);
    }

    /**
     * 用现有「存放地点」文本播种地点树顶层节点，并回填 asset_record.location_node_id。
     * 建节点只在首次（表为空）执行；回填每次都跑，只补 location_node_id IS NULL 的行
     * （导入等路径只写文本、不写指针，靠这里自愈）。
     */
    private void seedAssetLocations() {
        String columnKey = "col_存放地点";
        List<String> keys = jdbcTemplate.queryForList(
                "SELECT column_key FROM asset_column_def WHERE column_label LIKE '存放地点%' ORDER BY sort_order LIMIT 1",
                String.class);
        if (!keys.isEmpty() && keys.get(0) != null && !keys.get(0).isBlank()) {
            columnKey = keys.get(0);
        }
        Integer existing = jdbcTemplate.queryForObject("SELECT COUNT(1) FROM asset_location", Integer.class);
        int inserted = 0;
        if (existing == null || existing == 0) {
            inserted = jdbcTemplate.update(
                    """
                    INSERT INTO asset_location(parent_id, name, sort_order)
                    SELECT NULL, t.v, 0 FROM (
                        SELECT DISTINCT TRIM(v.column_value) AS v
                        FROM asset_record_value v
                        JOIN asset_record a ON a.id = v.asset_id AND a.deleted = 0
                        WHERE v.column_key = ? AND TRIM(v.column_value) <> ''
                    ) t
                    """,
                    columnKey);
        }
        int backfilled = backfillLocationNodes(columnKey);
        log.info("[asset-schema] 播种地点节点 {} 个，回填资产 {} 条", inserted, backfilled);
    }

    /**
     * 文本 → 指针回填，只处理 location_node_id IS NULL 的行（幂等）。
     * 两句 COLLATE 必须写死：asset_location 与 asset_record_value 的排序规则可能不一致
     * （列对列比较会抛 1267「Illegal mix of collations」，整段被 safeRun 跳过）。
     * 统一到 utf8mb4_unicode_ci 而非硬编码建表排序规则，方可同时适配 MySQL 8 / MariaDB。
     */
    private int backfillLocationNodes(String columnKey) {
        return jdbcTemplate.update(
                """
                UPDATE asset_record a
                JOIN asset_record_value v ON v.asset_id = a.id AND v.column_key = ?
                JOIN asset_location l ON l.parent_id IS NULL AND l.deleted = 0
                     AND l.name COLLATE utf8mb4_unicode_ci = TRIM(v.column_value) COLLATE utf8mb4_unicode_ci
                SET a.location_node_id = l.id
                WHERE a.deleted = 0 AND a.location_node_id IS NULL
                """,
                columnKey);
    }

    private void safeRun(String name, Runnable task) {
        try {
            task.run();
        } catch (Exception e) {
            log.warn("[asset-schema] 步骤 [{}] 失败(已跳过): {}", name, e.getMessage());
        }
    }

    private void ensureColumnExists(String tableName, String columnName, String alterSql) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                  AND COLUMN_NAME = ?
                """,
                Integer.class,
                tableName,
                columnName
        );
        if (count != null && count == 0) {
            jdbcTemplate.execute(alterSql);
        }
    }

    private void ensureIndexExists(String tableName, String indexName, String createIndexSql) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1) FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = ?
                  AND INDEX_NAME = ?
                """,
                Integer.class,
                tableName,
                indexName
        );
        if (count != null && count == 0) {
            jdbcTemplate.execute(createIndexSql);
        }
    }

    /** 清理重复列定义：保留 sort_order 最小的那条，其余全部迁移后删除 */
    private void ensureColumnDefCleanup() {
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                    "SELECT column_key FROM asset_column_def WHERE column_label = '存放地点' ORDER BY sort_order ASC, id ASC"
            );
            if (rows == null || rows.size() < 2) {
                return;
            }
            String keyKeep = String.valueOf(rows.get(0).get("column_key"));
            for (int i = 1; i < rows.size(); i++) {
                String keyDelete = String.valueOf(rows.get(i).get("column_key"));
                if (keyKeep.equals(keyDelete)) continue;
                // 迁移数据：覆盖写入，确保正确数据不丢失
                jdbcTemplate.update(
                        "INSERT INTO asset_record_value (asset_id, column_key, column_value) " +
                        "SELECT v.asset_id, ?, v.column_value FROM asset_record_value v " +
                        "WHERE v.column_key = ? " +
                        "ON DUPLICATE KEY UPDATE column_value = VALUES(column_value)",
                        keyKeep, keyDelete
                );
                jdbcTemplate.update("DELETE FROM asset_record_value WHERE column_key = ?", keyDelete);
                jdbcTemplate.update("DELETE FROM asset_column_def WHERE column_key = ?", keyDelete);
                log.info("[asset-schema] 已合并重复列定义: {} → {}, 删除 {}", keyDelete, keyKeep, keyDelete);
            }
        } catch (Exception e) {
            log.warn("[asset-schema] 清理重复列定义失败(可忽略): {}", e.getMessage());
        }
    }

    /** 修复错误表头：将 badLabel 重命名为 correctLabel，若目标已存在则迁移数据后删除 */
    private void ensureColumnDefFixBadLabel(String badLabel, String correctLabel) {
        try {
            String badKey = "col_" + badLabel.trim().toLowerCase(java.util.Locale.ROOT)
                    .replaceAll("[^a-z0-9\\u4e00-\\u9fa5]+", "_")
                    .replaceAll("^_+|_+$", "");
            String goodKey = "col_" + correctLabel.trim().toLowerCase(java.util.Locale.ROOT)
                    .replaceAll("[^a-z0-9\\u4e00-\\u9fa5]+", "_")
                    .replaceAll("^_+|_+$", "");
            if (badKey.equals(goodKey)) return;

            // 查找错误列
            Integer badCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM asset_column_def WHERE column_key = ?", Integer.class, badKey);
            if (badCount == null || badCount == 0) return;

            // 检查正确列是否已存在
            Integer goodCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(1) FROM asset_column_def WHERE column_key = ?", Integer.class, goodKey);

            if (goodCount != null && goodCount > 0) {
                // 目标已存在 → 迁移数据后删除错误列
                jdbcTemplate.update(
                        "INSERT INTO asset_record_value (asset_id, column_key, column_value) " +
                        "SELECT v.asset_id, ?, v.column_value FROM asset_record_value v " +
                        "WHERE v.column_key = ? " +
                        "AND NOT EXISTS (SELECT 1 FROM asset_record_value v2 WHERE v2.asset_id = v.asset_id AND v2.column_key = ?)",
                        goodKey, badKey, goodKey);
                jdbcTemplate.update("DELETE FROM asset_record_value WHERE column_key = ?", badKey);
                jdbcTemplate.update("DELETE FROM asset_column_def WHERE column_key = ?", badKey);
                log.info("[asset-schema] 已合并错误列 {} → {} 并删除 {}", badLabel, correctLabel, badKey);
            } else {
                // 目标不存在 → 直接重命名
                jdbcTemplate.update(
                        "UPDATE asset_column_def SET column_label = ?, column_key = ? WHERE column_key = ?",
                        correctLabel, goodKey, badKey);
                jdbcTemplate.update(
                        "UPDATE asset_record_value SET column_key = ? WHERE column_key = ?",
                        goodKey, badKey);
                log.info("[asset-schema] 已重命名错误列 {} → {}", badLabel, correctLabel);
            }
        } catch (Exception e) {
            log.warn("[asset-schema] 修复错误表头失败(可忽略): {}", e.getMessage());
        }
    }

    /** 确保「校区」动态列存在，供小程序手动标记与筛选 */
    private void ensureAssetColumnDef(String columnKey, String columnLabel) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(1) FROM asset_column_def
                WHERE column_key = ?
                """,
                Integer.class,
                columnKey
        );
        if (count != null && count > 0) {
            return;
        }
        jdbcTemplate.update(
                """
                INSERT INTO asset_column_def(column_key, column_label, value_type, sortable, searchable, sort_order, create_by)
                VALUES (?, ?, 'TEXT', 1, 1, 999, 'system')
                """,
                columnKey,
                columnLabel
        );
    }
}

