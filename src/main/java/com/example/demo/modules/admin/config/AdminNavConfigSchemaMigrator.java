package com.example.demo.modules.admin.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(120)
public class AdminNavConfigSchemaMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AdminNavConfigSchemaMigrator.class);
    private final JdbcTemplate jdbcTemplate;

    public AdminNavConfigSchemaMigrator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            createTable();
            seedIfEmpty();
            log.info("[admin-nav-config] 表结构已就绪，种子数据已检查");
        } catch (Exception e) {
            log.error("[admin-nav-config] 迁移失败: {}", e.getMessage());
        }
    }

    private void createTable() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS admin_nav_config (
                    id VARCHAR(64) PRIMARY KEY,
                    parent_id VARCHAR(64) NULL COMMENT '父节点ID，NULL=顶级分组',
                    type VARCHAR(16) NOT NULL COMMENT 'GROUP | SUBGROUP | ITEM',
                    title VARCHAR(128) NOT NULL COMMENT '显示名称',
                    item_path VARCHAR(256) NULL COMMENT 'ITEM类型：路由路径',
                    item_icon VARCHAR(64) NULL COMMENT 'ITEM类型：Lucide图标名',
                    item_badge_key VARCHAR(64) NULL COMMENT 'ITEM类型：PendingBadges字段key',
                    sort_order INT NOT NULL DEFAULT 0,
                    visible TINYINT NOT NULL DEFAULT 1,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_nav_parent (parent_id),
                    KEY idx_nav_sort (sort_order)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台侧边栏导航配置'
                """);
    }

    private void seedIfEmpty() {
        Integer cnt = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM admin_nav_config", Integer.class);
        if (cnt != null && cnt > 0) {
            log.info("[admin-nav-config] 已有 {} 条配置，跳过种子数据", cnt);
            return;
        }
        // 组织与通知
        seedGroup(null, 0, "org-notify", "组织与通知");
        seedItem("org-notify", 0, "item-personnel", "/admin/personnel", "人员授权", "Users", null);
        seedItem("org-notify", 1, "item-content-hub", "/admin/content-hub", "小程序内容中心", "Megaphone", null);
        seedItem("org-notify", 2, "item-student-warnings", "/admin/student-violations", "警告与弹窗公告", "AlertTriangle", null);

        // 系统与安全
        seedGroup(null, 1, "system-security", "系统与安全");
        seedItem("system-security", 0, "item-schedule", "/admin/schedule-manager", "定时管理", "CalendarClock", null);
        seedItem("system-security", 1, "item-settings", "/admin/settings", "系统设置", "Settings", null);
        seedItem("system-security", 2, "item-logging-console", "/admin/logging-console", "日志控制台", "Terminal", null);
        seedItem("system-security", 3, "item-external-comm", "/admin/external-comm-config", "外部通信配置", "Link2", null);
        seedItem("system-security", 4, "item-api-docs", "/admin/api-docs", "接口中心", "BookOpen", null);
        seedItem("system-security", 5, "item-page-perms", "/admin/page-permissions", "页面权限设置", "KeyRound", null);
        seedItem("system-security", 6, "item-login-branding", "/admin/login-branding", "登录页轮播图", "Images", null);
        seedItem("system-security", 7, "item-registration-invites", "/admin/registration-invites", "注册推荐码", "Ticket", null);

        // 门禁、元数据与环境
        seedGroup(null, 2, "access-meta-env", "门禁、元数据与环境");
        seedItem("access-meta-env", 0, "item-dahua-issue", "/admin/dahua-issue", "大华发卡", "CreditCard", null);
        seedItem("access-meta-env", 1, "item-door-control", "/admin/door-control", "门禁控制", "DoorOpen", null);
        seedItem("access-meta-env", 2, "item-access-rules", "/admin/access-rules", "门禁规则配置", "LockKeyhole", null);
        seedItem("access-meta-env", 3, "item-swing-tasks", "/admin/dahua-swing-tasks", "门禁数据工作台", "SlidersHorizontal", null);
        seedItem("access-meta-env", 4, "item-swing-rules", "/admin/dahua-swing-rules", "门禁联动规则", "ShieldAlert", null);
        seedItem("access-meta-env", 5, "item-auto-logs", "/admin/automation-logs", "自动化日志", "FileText", null);
        seedItem("access-meta-env", 6, "item-dept-storage", "/admin/department-storage", "部门落库", "GitBranch", null);
        seedItem("access-meta-env", 7, "item-telemetry-wl", "/admin/telemetry-watchlists", "WinCC 变量导入", "Table2", null);
        seedItem("access-meta-env", 8, "item-telemetry-arch", "/admin/telemetry-archive", "温湿度数据归档", "Archive", null);
        seedItem("access-meta-env", 9, "item-animal-tel", "/animal-room-telemetry", "动物房温湿度监测", "Thermometer", null);
        seedItem("access-meta-env", 10, "item-animal-cockpit", "/animal-room-cockpit", "动物房驾驶舱", "BarChart3", null);
        seedItem("access-meta-env", 11, "item-digital-twin-screen", "/digital-twin-screen", "数字孪生大屏", "Monitor", null);

        // ARO 房间与联动
        seedGroup(null, 3, "aro-room-link", "ARO 房间与联动");
        seedItem("aro-room-link", 0, "item-door-group", "/admin/door-group-storage", "门组落库", "Server", null);
        seedItem("aro-room-link", 1, "item-device-ch", "/admin/device-channels", "通道编码", "BarChart3", null);
        seedItem("aro-room-link", 2, "item-aro-rooms", "/admin/aro-rooms", "ARO房间", "MapPin", null);
        seedItem("aro-room-link", 3, "item-access-audit-source", "/admin/access-audit-source", "门禁审计数据源", "Database", null);
        seedItem("aro-room-link", 4, "item-access-fusion", "/admin/access-fusion", "门禁融合清洗", "GitMerge", null);
        seedItem("aro-room-link", 5, "item-access-clean-rule-profiles", "/admin/access-clean-rule-profiles", "清洗规则管理", "Filter", null);
        seedItem("aro-room-link", 6, "item-dahua-swing-stats-tasks", "/admin/dahua-swing-stats-tasks", "门禁统计日报", "BarChart3", null);

        // 资产与运维
        seedGroup(null, 4, "asset-ops", "资产与运维");
        seedItem("asset-ops", 0, "item-asset-records", "/admin/asset-records", "资产入库记录", "ClipboardCheck", null);
        seedItem("asset-ops", 1, "item-asset-transfer-records", "/admin/asset-transfer-records", "资产转移记录", "ArrowLeftRight", null);
        seedItem("asset-ops", 2, "item-cage-shelves", "/admin/cage-shelves", "笼架管理", "LayoutGrid", null);
        seedItem("asset-ops", 3, "item-facility-maintenance", "/admin/facility-maintenance", "设施维护", "Wrench", null);

        // 报修与物资领用 (with subgroups)
        seedGroup(null, 5, "repair-supplies", "报修与物资领用");
        seedSubgroup("repair-supplies", 0, "sg-repair", "报修管理");
        seedItem("sg-repair", 0, "item-repair-request", "/admin/repair-request", "报修申请", "Ticket", "repairText");
        seedItem("sg-repair", 1, "item-repair-process", "/admin/repair-process", "报修处理", "CircleCheck", "processRepairText");
        seedSubgroup("repair-supplies", 1, "sg-purchase", "采购管理");
        seedItem("sg-purchase", 0, "item-purchase-request", "/admin/purchase-request", "采购申请", "ShoppingCart", "purchaseText");
        seedItem("sg-purchase", 1, "item-purchase-process", "/admin/purchase-process", "采购处理", "CircleCheck", "processPurchaseText");
        seedSubgroup("repair-supplies", 2, "sg-supplies", "物资领用");
        seedItem("sg-supplies", 0, "item-supplies", "/admin/supplies", "物资商城", "Package", "suppliesText");
        seedItem("sg-supplies", 1, "item-supplies-manage", "/admin/supplies/manage", "物资管理", "TableProperties", "processSuppliesText");
        seedItem("sg-supplies", 2, "item-supplies-process", "/admin/supplies/process", "领用处理", "CircleCheck", "processSuppliesText");

        // 数据分析
        seedGroup(null, 6, "analytics", "数据分析");
        seedItem("analytics", 0, "item-analytics", "/admin/analytics", "数据看板", "PieChart", null);
        seedItem("analytics", 1, "item-student-activity", "/admin/student-activity", "学生活动分析", "Activity", null);

        log.info("[admin-nav-config] 种子数据已写入");
    }

    private void seedGroup(String parentId, int sortOrder, String id, String title) {
        jdbcTemplate.update(
                "INSERT IGNORE INTO admin_nav_config (id, parent_id, type, title, sort_order) VALUES (?, ?, 'GROUP', ?, ?)",
                id, parentId, title, sortOrder);
    }

    private void seedSubgroup(String parentId, int sortOrder, String id, String title) {
        jdbcTemplate.update(
                "INSERT IGNORE INTO admin_nav_config (id, parent_id, type, title, sort_order) VALUES (?, ?, 'SUBGROUP', ?, ?)",
                id, parentId, title, sortOrder);
    }

    private void seedItem(String parentId, int sortOrder, String id, String path, String label, String icon, String badgeKey) {
        jdbcTemplate.update(
                "INSERT IGNORE INTO admin_nav_config (id, parent_id, type, title, item_path, item_icon, item_badge_key, sort_order) VALUES (?, ?, 'ITEM', ?, ?, ?, ?, ?)",
                id, parentId, label, path, icon, badgeKey, sortOrder);
    }
}
