package com.example.demo.modules.referencedata.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Component;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 动物订购审核页演示订单种子（幂等）。
 *
 * <p>以 {@code group_id = DEMO-REF-ORDER} + 备注前缀 {@code [DEMO]} 标记，仅当库中尚无该演示组订单时写入。
 * 同时确保最小可订购参考数据与（可选）演示 AUP 编号，供审核页多 AUP 分组展示。
 */
@Component
@Order(125)
public class RefOrderDemoSeedBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(RefOrderDemoSeedBootstrap.class);

    static final String DEMO_GROUP_ID = "DEMO-REF-ORDER";
    private static final String DEMO_PROJECT = "DEMO·肿瘤免疫课题组";
    private static final String DEMO_AUP_1 = "DEMO-AUP-2026-01";
    private static final String DEMO_AUP_2 = "DEMO-AUP-2026-02";
    private static final String DEMO_REF_MARKER = "DEMO_REF_ORDER_SEED";

    private final JdbcTemplate jdbc;

    public RefOrderDemoSeedBootstrap(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            Integer existing = jdbc.queryForObject(
                    "SELECT COUNT(1) FROM ref_order WHERE group_id = ?",
                    Integer.class, DEMO_GROUP_ID);
            if (existing != null && existing > 0) {
                log.info("[ref-order-demo] 已有演示订单，跳过种子");
                return;
            }
            long leafId = ensureDemoLeaf();
            Long aup1 = ensureDemoAup(DEMO_AUP_1, "DEMO·肿瘤免疫微环境研究");
            Long aup2 = ensureDemoAup(DEMO_AUP_2, "DEMO·代谢与肠道菌群研究");

            LocalDateTime now = LocalDateTime.now();
            // 1) 多 AUP 待审订单
            long pendingMulti = insertOrder(
                    "demo-pi-chen", "陈老师(DEMO)", DEMO_PROJECT,
                    aup1, DEMO_AUP_1, "PENDING",
                    "[DEMO] 多 AUP 共享车正式提交，请整单审批",
                    now.minusHours(2));
            insertLine(pendingMulti, leafId, aup1, DEMO_AUP_1, "C57BL/6J", "雌性·8周", 12, "王实验员", "包备注：免疫组");
            insertLine(pendingMulti, leafId, aup2, DEMO_AUP_2, "BALB/c", "雄性·6周", 8, "李实验员", "包备注：代谢组");
            insertLine(pendingMulti, leafId, aup1, DEMO_AUP_1, "C57BL/6J", "雄性·8周", 6, "王实验员", null);
            insertLog(pendingMulti, "SUBMITTED", "demo-pi-chen", "DEMO multi-AUP pending");

            // 2) 单 AUP 待审
            long pendingSingle = insertOrder(
                    "demo-pi-liu", "刘老师(DEMO)", DEMO_PROJECT,
                    aup1, DEMO_AUP_1, "PENDING",
                    "[DEMO] 单 AUP 订购待接收人处理",
                    now.minusHours(5));
            insertLine(pendingSingle, leafId, aup1, DEMO_AUP_1, "NOD-SCID", "雌性·10周", 4, "赵实验员", "急需批次");
            insertLog(pendingSingle, "SUBMITTED", "demo-pi-liu", "DEMO single-AUP pending");

            // 3) 已批准示例
            long approved = insertOrder(
                    "demo-pi-chen", "陈老师(DEMO)", DEMO_PROJECT,
                    aup2, DEMO_AUP_2, "APPROVED",
                    "[DEMO] 已批准订单（便于对照已办结列表）",
                    now.minusDays(1));
            insertLine(approved, leafId, aup2, DEMO_AUP_2, "BALB/c", "雌性·6周", 10, "李实验员", null);
            insertLog(approved, "SUBMITTED", "demo-pi-chen", "DEMO approved seed");
            insertLog(approved, "APPROVED", "demo-receiver", "DEMO auto-approved seed");

            log.info("[ref-order-demo] 演示订单已写入：pending×2 + approved×1（group_id={}）", DEMO_GROUP_ID);
        } catch (Exception e) {
            log.warn("[ref-order-demo] 演示订单种子失败（不影响启动）: {}", e.getMessage());
        }
    }

    /** 确保一条可挂订单行的叶子参考数据（带 DEMO 标记，幂等）。 */
    private long ensureDemoLeaf() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                """
                        SELECT id FROM ref_data
                        WHERE ref_type = 'STRAIN'
                          AND field_data LIKE ?
                        LIMIT 1
                        """,
                "%" + DEMO_REF_MARKER + "%");
        if (!rows.isEmpty()) {
            return ((Number) rows.get(0).get("id")).longValue();
        }

        // 选一个不冲突的 sort_order
        Integer maxSort = jdbc.queryForObject(
                "SELECT COALESCE(MAX(sort_order), 0) FROM ref_data WHERE ref_type = 'STRAIN' AND parent_id IS NULL",
                Integer.class);
        int sortOrder = (maxSort == null ? 0 : maxSort) + 91;

        String fieldData = """
                {"title":"DEMO·C57BL/6J","subtitle":"演示品系","purchasable":true,"demoMarker":"%s"}
                """.formatted(DEMO_REF_MARKER).replace("\n", "").trim();

        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    """
                            INSERT INTO ref_data(ref_type, parent_id, sort_order, status, field_data)
                            VALUES ('STRAIN', NULL, ?, 1, ?)
                            """,
                    Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, sortOrder);
            ps.setString(2, fieldData);
            return ps;
        }, keys);
        Number id = keys.getKey();
        if (id == null) {
            throw new IllegalStateException("failed to insert demo ref_data");
        }
        return id.longValue();
    }

    /** 确保演示 AUP 编号存在（is_demo=1）；无模板时返回 null，行仍可展示 hierarchy 名称。 */
    private Long ensureDemoAup(String registerNo, String projectName) {
        try {
            List<Map<String, Object>> existing = jdbc.queryForList(
                    "SELECT id FROM aup_record WHERE register_no = ? LIMIT 1", registerNo);
            if (!existing.isEmpty()) {
                return ((Number) existing.get(0).get("id")).longValue();
            }
            Long templateId = null;
            try {
                templateId = jdbc.queryForObject(
                        """
                                SELECT id FROM form_template
                                WHERE form_key = 'aup'
                                ORDER BY id DESC LIMIT 1
                                """,
                        Long.class);
            } catch (Exception ignored) {
                // no template
            }
            if (templateId == null) {
                log.info("[ref-order-demo] 无 aup 模板，跳过演示 AUP {}", registerNo);
                return null;
            }
            boolean hasDemoCol = columnExists("aup_record", "is_demo");
            if (hasDemoCol) {
                jdbc.update(
                        """
                                INSERT INTO aup_record(
                                    template_id, template_version, version, register_no,
                                    current_stage, round_no, draft_source, project_name, pi_name, dept,
                                    approved_at, created_by, is_demo, created_at, updated_at)
                                VALUES (?, 'demo', 0, ?, 'approved', 1, 'first', ?, 'DEMO·陈老师', '基础医学院',
                                        NOW(), 'demo', 1, NOW(), NOW())
                                """,
                        templateId, registerNo, projectName);
            } else {
                jdbc.update(
                        """
                                INSERT INTO aup_record(
                                    template_id, template_version, version, register_no,
                                    current_stage, round_no, draft_source, project_name, pi_name, dept,
                                    approved_at, created_by, created_at, updated_at)
                                VALUES (?, 'demo', 0, ?, 'approved', 1, 'first', ?, 'DEMO·陈老师', '基础医学院',
                                        NOW(), 'demo', NOW(), NOW())
                                """,
                        templateId, registerNo, projectName);
            }
            return jdbc.queryForObject(
                    "SELECT id FROM aup_record WHERE register_no = ?", Long.class, registerNo);
        } catch (Exception e) {
            log.warn("[ref-order-demo] 创建演示 AUP {} 失败: {}", registerNo, e.getMessage());
            return null;
        }
    }

    private long insertOrder(
            String submitterId,
            String submitterName,
            String projectGroupName,
            Long aupRecordId,
            String registerNo,
            String status,
            String remark,
            LocalDateTime submittedAt) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    """
                            INSERT INTO ref_order(
                                group_id, submitter_id, submitter_name, project_group_name,
                                aup_record_id, register_no, status, submit_remark, submitted_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                    Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, DEMO_GROUP_ID);
            ps.setString(2, submitterId);
            ps.setString(3, submitterName);
            ps.setString(4, projectGroupName);
            if (aupRecordId == null) ps.setObject(5, null);
            else ps.setLong(5, aupRecordId);
            ps.setString(6, registerNo);
            ps.setString(7, status);
            ps.setString(8, remark);
            ps.setTimestamp(9, Timestamp.valueOf(submittedAt));
            return ps;
        }, keys);
        Number id = keys.getKey();
        if (id == null) {
            throw new IllegalStateException("failed to insert demo order");
        }
        return id.longValue();
    }

    private void insertLine(
            long orderId,
            long refDataId,
            Long aupRecordId,
            String registerNo,
            String strainName,
            String specOption,
            int qty,
            String addedBy,
            String lineRemark) {
        String hierarchy = """
                [{"id":%d,"refType":"STRAIN","displayName":"%s"},{"id":0,"refType":"AUP","displayName":"%s"}]
                """.formatted(refDataId, strainName, registerNo).replace("\n", "").trim();
        String specs = "{\"option\":\"%s\"}".formatted(specOption);
        jdbc.update(
                """
                        INSERT INTO ref_order_line(
                            order_id, ref_data_id, spec_selections, hierarchy_chain,
                            quantity, line_remark, added_by, aup_record_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                orderId, refDataId, specs, hierarchy, qty, lineRemark, addedBy, aupRecordId);
    }

    private void insertLog(long orderId, String action, String operatorId, String detail) {
        jdbc.update(
                """
                        INSERT INTO ref_order_log(order_id, action, operator_id, detail)
                        VALUES (?, ?, ?, ?)
                        """,
                orderId, action, operatorId, detail);
    }

    private boolean columnExists(String table, String column) {
        Integer n = jdbc.queryForObject(
                """
                        SELECT COUNT(1) FROM information_schema.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = ?
                          AND COLUMN_NAME = ?
                        """,
                Integer.class, table, column);
        return n != null && n > 0;
    }
}
