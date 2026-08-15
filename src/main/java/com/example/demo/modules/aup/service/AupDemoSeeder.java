package com.example.demo.modules.aup.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AUP 演示示例种子：内置若干条「模拟真实实验员作答」的计划书，覆盖各审批阶段，
 * 以便后台列表与审批页在无真实数据时也能演示完整业务。
 *
 * <p>演示记录以 {@code aup_record.is_demo = 1} 标记，与真实数据完全隔离；状态流转被
 * {@link AupService#transition} 阻止（演示不可推进到下一步），可通过「恢复示例」把单条
 * 记录重置回内置的种子态。
 *
 * <p>幂等：仅当库中尚无任何演示记录时写入；写入在单事务内完成，失败回滚不残留半成品。
 */
@Service
public class AupDemoSeeder {

    private static final Logger log = LoggerFactory.getLogger(AupDemoSeeder.class);

    private static final String FORM_KEY = "aup";

    private final JdbcTemplate jdbc;
    private final ObjectMapper om;

    public AupDemoSeeder(JdbcTemplate jdbc, ObjectMapper om) {
        this.jdbc = jdbc;
        this.om = om;
    }

    /* =====================================================================
     * 内置演示数据（模拟真实实验员作答）
     * ================================================================== */

    private static class DemoSpec {
        String registerNo;
        String projectName;
        String piName;
        String dept;
        String species;   // B5.species / 动物品种
        String line;      // B6.line / 品系
        int count;        // B6.count / 所需数量
        String stage;
        int roundNo;
        String draftSource;
        String reviewForm; // member/meeting，非专家阶段为 null
        String submittedAt;
        String approvedAt; // 仅 approved
        String createdBy;
        // 流转历史（决定快照与留痕），按时间正序
        List<Event> history;
        // 专家评审（分配 + 投票 + 逐字段意见）
        List<String> experts;
        List<Vote> votes;
        // 格式审查（秘书）逐字段格式批注
        List<Item> secretaryItems;
    }

    private static class Event {
        String action;
        String from;
        String to;
        String actor;
        String role;
        String comment;
        String at;
        Event(String action, String from, String to, String actor, String role, String comment, String at) {
            this.action = action;
            this.from = from;
            this.to = to;
            this.actor = actor;
            this.role = role;
            this.comment = comment;
            this.at = at;
        }
    }

    private static class Vote {
        String reviewer;
        String verdict;
        String comment;
        List<Item> items;
        Vote(String reviewer, String verdict, String comment, Item... items) {
            this.reviewer = reviewer;
            this.verdict = verdict;
            this.comment = comment;
            this.items = items == null || items.length == 0 ? List.of() : Arrays.asList(items);
        }
    }

    private static class Item {
        String fieldKey;
        String sectionKey;
        String fieldLabel;
        String verdict;
        String reason;
        String suggestion;
        Item(String fieldKey, String sectionKey, String fieldLabel, String verdict, String reason, String suggestion) {
            this.fieldKey = fieldKey;
            this.sectionKey = sectionKey;
            this.fieldLabel = fieldLabel;
            this.verdict = verdict;
            this.reason = reason;
            this.suggestion = suggestion;
        }
    }

    private static final List<DemoSpec> SPECS = Arrays.asList(
            new DemoSpec() {{
                registerNo = "A-2026-001";
                projectName = "肿瘤免疫微环境与免疫治疗研究";
                piName = "张教授";
                dept = "基础医学院";
                species = "C57BL/6J 小鼠";
                line = "C57BL/6J";
                count = 120;
                stage = "expertReview";
                roundNo = 1;
                draftSource = "first";
                reviewForm = "member";
                submittedAt = "2026-08-10 09:30:00";
                createdBy = "demo";
                history = Arrays.asList(
                        new Event("submit", "draft", "formatReview", "陈实验员", "lab", "提交计划书，待格式审查", "2026-08-10 09:30:00"),
                        new Event("approve", "formatReview", "expertReview", "李秘书", "secretary", "格式审查通过，已分配 2 名专家", "2026-08-11 10:05:00")
                );
                experts = Arrays.asList("赵专家", "钱专家");
                votes = Arrays.asList(
                        new Vote("赵专家", "modify", "整体方案基本可行，动物数量与疼痛分级需进一步补充",
                                new Item("B1.purpose", "B", "目的", "suggest", null, "建议补充该品系模型在免疫治疗研究中的前期文献依据"),
                                new Item("B3.painDesc", "B", "疼痛程序说明", "suggest", "疼痛分级与目录 D 的对应关系未写清", "补充分级目录 D 的疼痛程度判定"),
                                new Item("B5.species", "B", "动物种类选择", "suggest", null, "可说明为何选择 C57BL/6J 而非其他近交系"),
                                new Item("B6.count", "B", "所需数量", "suggest", "120 只的数量计算依据不足，未按分组与死亡率估算", "按分组与预期死亡率重新估算样本量"),
                                new Item("B8.overview", "B", "实验内容概要", "suggest", null, "补充分组样本量与观察检测节点")
                        )
                );
                secretaryItems = Arrays.asList(
                        new Item("A1.no", "A", "项目编号", "suggest", "项目编号格式与立项批件不一致", "按立项批件统一项目编号格式"),
                        new Item("A4.operators", "A", "操作人员", "suggest", null, "「承担任务」建议注明给药与采样频次"),
                        new Item("B6.count", "B", "所需数量", "suggest", null, "动物数量单位统一为「只」")
                );
            }},
            new DemoSpec() {{
                registerNo = "A-2026-002";
                projectName = "基因编辑小鼠模型构建";
                piName = "李老师";
                dept = "实验动物科学部";
                species = "BALB/c 小鼠";
                line = "BALB/c";
                count = 80;
                stage = "formatReview";
                roundNo = 1;
                draftSource = "first";
                submittedAt = "2026-08-12 14:20:00";
                createdBy = "demo";
                history = Arrays.asList(
                        new Event("submit", "draft", "formatReview", "王实验员", "lab", "提交计划书，待格式审查", "2026-08-12 14:20:00")
                );
                experts = List.of();
                votes = List.of();
                secretaryItems = List.of();
            }},
            new DemoSpec() {{
                registerNo = "A-2026-003";
                projectName = "糖尿病模型药物评价";
                piName = "王主任";
                dept = "药学院";
                species = "SD 大鼠";
                line = "SD";
                count = 200;
                stage = "draft";
                roundNo = 2;
                draftSource = "expertReturn";
                submittedAt = "2026-08-08 10:00:00";
                createdBy = "demo";
                history = Arrays.asList(
                        new Event("submit", "draft", "formatReview", "刘实验员", "lab", "提交计划书，待格式审查", "2026-08-08 10:00:00"),
                        new Event("approve", "formatReview", "expertReview", "李秘书", "secretary", "格式审查通过，已分配 2 名专家", "2026-08-09 09:15:00"),
                        new Event("return", "expertReview", "draft", "赵专家", "expert", "专家评审退回：需补充麻醉与保定方案", "2026-08-10 11:00:00")
                );
                experts = Arrays.asList("赵专家", "孙专家");
                votes = Arrays.asList(
                        new Vote("赵专家", "modify", "糖尿病模型药物评价方案需修改：目的与模型选择关联不足",
                                new Item("B1.purpose", "B", "目的", "suggest", "目的阐述不够聚焦，未说明糖尿病模型与药物评价的关联", "补充模型选择与药物评价目标的对应关系"),
                                new Item("B6.count", "B", "所需数量", "suggest", null, "200 只数量可结合分组进一步优化"),
                                new Item("D2.restraint", "D", "动物保定", "suggest", null, "补充清醒状态保定与麻醉保定的区分"),
                                new Item("B8.timeline", "B", "时间节点", "suggest", null, "细化给药与采样的时间节点")
                        )
                );
                secretaryItems = Arrays.asList(
                        new Item("A2.email", "A", "邮箱地址", "suggest", null, "课题组长邮箱建议使用 @shsmu.edu.cn 机构邮箱"),
                        new Item("A4.operators", "A", "操作人员", "suggest", "操作人员表「人员类别」未按标准名称填写", "按标准人员类别名称重新填写")
                );
            }},
            new DemoSpec() {{
                registerNo = "A-2025-118";
                projectName = "阿尔茨海默病发病机制研究";
                piName = "赵教授";
                dept = "附属瑞金医院";
                species = "C57BL/6J 小鼠";
                line = "C57BL/6J";
                count = 150;
                stage = "approved";
                roundNo = 1;
                draftSource = "first";
                reviewForm = "meeting";
                submittedAt = "2025-11-20 08:45:00";
                approvedAt = "2026-01-15 16:00:00";
                createdBy = "demo";
                history = Arrays.asList(
                        new Event("submit", "draft", "formatReview", "周实验员", "lab", "提交计划书，待格式审查", "2025-11-20 08:45:00"),
                        new Event("approve", "formatReview", "expertReview", "李秘书", "secretary", "格式审查通过，转会议审核", "2025-12-02 14:30:00"),
                        new Event("approve", "expertReview", "approved", "专家委员会", "expert", "全体专家一致同意，发放注册号", "2026-01-15 16:00:00")
                );
                experts = Arrays.asList("赵专家", "钱专家");
                votes = Arrays.asList(
                        new Vote("赵专家", "agree", "符合动物福利要求，同意通过"),
                        new Vote("钱专家", "agree", "方案合理，同意通过")
                );
                secretaryItems = Arrays.asList(
                        new Item("A1.period", "A", "项目起止日期", "suggest", null, "起止日期格式统一为 YYYY-MM-DD")
                );
            }}
    );

    /* =====================================================================
     * 幂等种子入口
     * ================================================================== */

    public void seedIfNeeded() {
        Long[] tpl = resolveTemplate();
        if (tpl == null) {
            log.warn("AUP demo seed skipped: no aup template present");
            return;
        }
        long templateId = tpl[0];
        String templateVersion = tpl[1] == null ? null : String.valueOf(tpl[1]);

        int seeded = 0;
        for (DemoSpec spec : SPECS) {
            Integer c = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM aup_record WHERE register_no = ?", Integer.class, spec.registerNo);
            if (c != null && c > 0) {
                continue;
            }
            insertDemoRecord(spec, templateId, templateVersion);
            seeded++;
        }
        if (seeded > 0) {
            log.info("AUP demo seed ready: +{} records", seeded);
        }
    }

    /**
     * 恢复单条演示记录到内置种子态（保持原 id 不变，重置状态与相关数据）。
     * 由 {@link AupService#restoreDemo} 在事务内调用，本方法自身不单独开事务。
     */
    public void restoreDemo(long aupId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT register_no, is_demo FROM aup_record WHERE id = ?", aupId);
        if (rows.isEmpty()) {
            throw TwinBusinessException.of(404, "计划书不存在");
        }
        Object isDemo = rows.get(0).get("is_demo");
        if (isDemo == null || ((Number) isDemo).intValue() != 1) {
            throw TwinBusinessException.of(400, "非演示示例，无需恢复");
        }
        String registerNo = rows.get(0).get("register_no") == null ? null : String.valueOf(rows.get(0).get("register_no"));
        DemoSpec spec = findSpec(registerNo);
        if (spec == null) {
            throw TwinBusinessException.of(400, "未找到该演示示例的内置定义");
        }
        Long templateId = jdbc.queryForObject(
                "SELECT template_id FROM aup_record WHERE id = ?", Long.class, aupId);

        deleteRelated(aupId);
        resetRecord(aupId, spec);
        insertData(aupId, spec);
        insertHistory(aupId, spec, templateId);
        insertReviews(aupId, spec);
    }

    /* =====================================================================
     * 插入
     * ================================================================== */

    private void insertDemoRecord(DemoSpec spec, long templateId, String templateVersion) {
        jdbc.update(
                "INSERT INTO aup_record (template_id, template_version, version, register_no, "
                        + "current_stage, round_no, draft_source, review_form, expire_at, project_name, pi_name, dept, "
                        + "submitted_at, approved_at, created_by, is_demo, created_at, updated_at) "
                        + "VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())",
                templateId, templateVersion, spec.registerNo,
                spec.stage, spec.roundNo, spec.draftSource, spec.reviewForm, expireAtOf(spec),
                spec.projectName, spec.piName, spec.dept,
                toTs(spec.submittedAt), toTs(spec.approvedAt), spec.createdBy);

        long aupId = jdbc.queryForObject(
                "SELECT id FROM aup_record WHERE register_no = ?", Long.class, spec.registerNo);

        insertData(aupId, spec);
        insertHistory(aupId, spec, templateId);
        insertReviews(aupId, spec);
    }

    private void resetRecord(long aupId, DemoSpec spec) {
        jdbc.update(
                "UPDATE aup_record SET version = 0, current_stage = ?, round_no = ?, draft_source = ?, "
                        + "review_form = ?, expire_at = ?, submitted_at = ?, approved_at = ?, "
                        + "project_name = ?, pi_name = ?, dept = ?, updated_at = NOW() WHERE id = ?",
                spec.stage, spec.roundNo, spec.draftSource, spec.reviewForm, expireAtOf(spec),
                toTs(spec.submittedAt), toTs(spec.approvedAt), spec.projectName, spec.piName, spec.dept, aupId);
    }

    private void insertData(long aupId, DemoSpec spec) {
        jdbc.update("INSERT INTO aup_data (aup_id, data, version, updated_by, created_at, updated_at) "
                        + "VALUES (?, ?, 0, 'demo', NOW(), NOW())",
                aupId, buildFormData(spec));
    }

    private void insertHistory(long aupId, DemoSpec spec, Long templateId) {
        int versionNo = 0;
        for (Event e : spec.history) {
            versionNo++;
            // 快照：每次流转在「to」阶段落一份不可变快照（提交到 approved 也走这里）
            jdbc.update("INSERT INTO aup_snapshot (aup_id, version_no, stage, data, template_id, template_version, created_by, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, NULL, ?, ?)",
                    aupId, versionNo, e.to, buildFormData(spec), templateId, e.actor, toTs(e.at));
            // 留痕
            jdbc.update("INSERT INTO aup_audit_log (aup_id, actor, role, action, from_stage, to_stage, comment, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    aupId, e.actor, e.role, e.action, e.from, e.to, e.comment, toTs(e.at));
        }
    }

    private void insertReviews(long aupId, DemoSpec spec) {
        // 专家分配
        for (String reviewer : spec.experts == null ? List.<String>of() : spec.experts) {
            boolean voted = (spec.votes == null ? List.<Vote>of() : spec.votes).stream().anyMatch(v -> v.reviewer.equals(reviewer));
            jdbc.update("INSERT INTO aup_review_assignment (aup_id, round_no, reviewer_id, status, assigned_by, created_at) "
                            + "VALUES (?, ?, ?, ?, '李秘书', NOW())",
                    aupId, spec.roundNo, reviewer, voted ? "voted" : "pending");
        }
        // 专家投票 + 逐字段内容批注（reviewer_role=expert）
        for (Vote v : spec.votes == null ? List.<Vote>of() : spec.votes) {
            jdbc.update("INSERT INTO aup_review (aup_id, round_no, reviewer, role, verdict, comment) "
                            + "VALUES (?, ?, ?, 'expert', ?, ?)",
                    aupId, spec.roundNo, v.reviewer, v.verdict, v.comment);
            long reviewId = jdbc.queryForObject(
                    "SELECT id FROM aup_review WHERE aup_id = ? AND reviewer = ? AND round_no = ? AND role = 'expert'",
                    Long.class, aupId, v.reviewer, spec.roundNo);
            for (Item it : v.items) {
                insertItem(reviewId, aupId, spec, it, v.reviewer, "expert");
            }
        }
        // 格式审查（秘书）逐字段格式批注（reviewer_role=secretary）
        if (spec.secretaryItems != null && !spec.secretaryItems.isEmpty()) {
            jdbc.update("INSERT INTO aup_review (aup_id, round_no, reviewer, role, verdict, comment) "
                            + "VALUES (?, ?, '李秘书', 'secretary', 'agree', '格式审查批注')",
                    aupId, spec.roundNo);
            long reviewId = jdbc.queryForObject(
                    "SELECT id FROM aup_review WHERE aup_id = ? AND reviewer = '李秘书' AND round_no = ? AND role = 'secretary'",
                    Long.class, aupId, spec.roundNo);
            for (Item it : spec.secretaryItems) {
                insertItem(reviewId, aupId, spec, it, "李秘书", "secretary");
            }
        }
    }

    private void insertItem(long reviewId, long aupId, DemoSpec spec, Item it, String reviewer, String role) {
        jdbc.update("INSERT INTO aup_review_item (review_id, aup_id, round_no, field_key, section_key, field_label, verdict, reason, suggestion, reviewer, reviewer_role, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
                reviewId, aupId, spec.roundNo, it.fieldKey, it.sectionKey, it.fieldLabel,
                it.verdict, it.reason, it.suggestion, reviewer, role);
    }

    private void deleteRelated(long aupId) {
        jdbc.update("DELETE FROM aup_review_item WHERE aup_id = ?", aupId);
        jdbc.update("DELETE FROM aup_review WHERE aup_id = ?", aupId);
        jdbc.update("DELETE FROM aup_review_assignment WHERE aup_id = ?", aupId);
        jdbc.update("DELETE FROM aup_audit_log WHERE aup_id = ?", aupId);
        jdbc.update("DELETE FROM aup_snapshot WHERE aup_id = ?", aupId);
        jdbc.update("DELETE FROM aup_data WHERE aup_id = ?", aupId);
    }

    /* =====================================================================
     * 表单数据（模拟真实实验员作答，字段键对齐 default-aup-template.json）
     * ================================================================== */

    private String buildFormData(DemoSpec spec) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("0.regNo", spec.registerNo);
        d.put("0.oldRegNo", "");
        d.put("0.regNote", "IACUC 指定填写");
        d.put("A1.name", spec.projectName);
        d.put("A1.source", "国家自然科学基金");
        d.put("A1.sourceName", "国家自然科学基金面上项目");
        d.put("A1.period", mapOf("start", "2026-01-01", "end", "2028-12-31"));
        d.put("A1.no", "82070000");
        d.put("A1.pi", spec.piName);
        d.put("A1.contact", spec.piName);
        d.put("A2.unitType", "校内");
        d.put("A2.leader", spec.piName);
        d.put("A2.employeeNo", "T001234");
        d.put("A2.department", spec.dept);
        d.put("A2.group", spec.dept + "课题组");
        d.put("A2.officePhone", "021-63846590");
        d.put("A2.mobile", "13800000000");
        d.put("A2.email", "pi@shsmu.edu.cn");
        d.put("A2.address", "黄浦区重庆南路 280 号");
        d.put("A3.inPerson", "是");
        d.put("A4.operators", List.of(mapOf(
                "col_no", "S001", "col_type", "硕士研究生", "col_name", "张同学",
                "col_email", "student@shsmu.edu.cn", "col_task", "给药与样本采集")));
        d.put("A5.scope", "是");
        d.put("A6.update", "否");
        d.put("A7.export", "否");
        d.put("A7.import", "否");
        d.put("A8.parts", List.of("I", "K"));
        d.put("B1.purpose", "本研究拟通过构建" + spec.line + "模型，观察干预前后免疫微环境的变化，以阐明其作用机制，为后续药物开发提供依据。");
        d.put("B2.benefit", "本研究的先进性在于首次系统刻画该模型免疫微环境的动态演变，对人类相关疾病机制研究具有借鉴意义。");
        d.put("B3.literature", "是");
        d.put("B3.dbName", "PubMed / CNKI");
        d.put("B3.keywords", "animal model; immunotherapy; immune microenvironment");
        d.put("B3.conclusion", "已通过数据库文献检索，确认现有方案为当前可获得的最优动物实验途径。");
        d.put("B3.hasPain", "是");
        d.put("B3.painDesc", "造模及给药过程存在可引起动物疼痛的程序");
        d.put("B4.basis", List.of("研究过程非常复杂，无法在体外单一系统复制"));
        d.put("B5.species", spec.species);
        d.put("B5.basis", List.of("该品系生理特性与解剖结构更适合本项目研究"));
        d.put("B5.basisDesc", "该品系遗传背景清晰、模型成熟，适用于本项目。");
        d.put("B6.species", spec.species);
        d.put("B6.line", spec.line);
        d.put("B6.age", "6-8 周");
        d.put("B6.weight", "20-25 g");
        d.put("B6.count", spec.count);
        d.put("B6.painLevels", List.of("D"));
        d.put("B6.countB", 0);
        d.put("B6.countC", 0);
        d.put("B6.countD", spec.count);
        d.put("B6.countE", 0);
        d.put("B6.domesticProvince", "上海");
        d.put("B6.domesticOrg", "上海灵畅生物科技有限公司");
        d.put("B7.basis", List.of("通过生物统计学方法计算得出"));
        d.put("B7.basisDesc", "根据预实验结果与统计学要求估算各组样本量。");
        d.put("B8.overview", "实验分为对照组与给药组，观察造模、给药、采样的全过程变化。");
        d.put("B8.timeline", "第 1-2 月动物引入与预实验，第 3-8 月正式实验与采样，第 9 月安乐死与数据整理。");
        d.put("B9.nonPharma", "否");
        d.put("C1.space", List.of("动物由医学院实验动物科学部订购，并饲养在部内动物设施"));
        d.put("C2.hasRequest", "否");
        d.put("C3.singleCage", "否");
        d.put("D1.ether", "否");
        d.put("D2.restraint", "否");
        d.put("D3.exempt", "否，实验过程中使用了麻醉剂或止痛药物进行疼痛缓解");
        d.put("E1.operator", List.of("实验动物科学部兽医对动物实施安乐死"));
        d.put("E1.avmaTable", List.of(mapOf("col_species", spec.species, "col_method", "二氧化碳窒息", "col_dose", "100% CO2 逐步置换")));
        d.put("E1.confirm", List.of("双侧胸部剪开", "组织/器官采样"));
        d.put("E2.disposal", List.of("实验结束后遗留动物交由动科部进行安乐死操作"));
        d.put("E3.method", List.of("无生物危害动物尸体交由动科部处置"));
        d.put("E4.cooperate", "否");
        // A8 勾选了 I：补 I 保定/麻醉
        d.put("I1.purposes", List.of("使用动物保定药物对动物进行抽血、注射的保定。"));
        d.put("I1.drugs", List.of(mapOf("name", "异氟烷", "dose", "1.5-2%", "route", "吸入")));
        d.put("I2.painLevel", List.of("目录D：动物所承受的痛苦可以通过麻醉，止痛或镇静药物来减轻或消除（需要填写药物信息）"));
        d.put("I2.preOpDrugs", List.of(mapOf("name", "布托啡诺", "dose", "2 mg/kg", "route", "皮下注射", "period", "术前 30 分钟")));
        d.put("I3.anesthesia", "本实验涉及到存活手术步骤，并使用麻醉药物。");
        d.put("I3.drugs", List.of(mapOf("name", "戊巴比妥钠", "dose", "50 mg/kg", "route", "腹腔注射", "duration", "维持约 1 小时")));
        d.put("F.declarations", List.of(
                "我保证所填写的内容真实有效",
                "所有动物实验操作都将遵守我国实验动物相关法律法规",
                "该研究是一个创新的项目",
                "所有参与动物实验的人员都已经进行了职业风险评估"));
        d.put("F.leaderSignature", "EMAIL_TRUSTED:pi@shsmu.edu.cn");
        d.put("signature", "EMAIL_TRUSTED:pi@shsmu.edu.cn");
        d.put("signSource", "EMAIL_TRUSTED");
        // A8 勾选了 K：补 K 紧急处理
        d.put("K1.leaderName", spec.piName);
        d.put("K1.officePhone", "021-63846590");
        d.put("K1.mobile", "13800000000");
        d.put("K1.operations", "日常饲养、给药与观察");
        d.put("K2.primaryContact", spec.piName);
        d.put("K2.primaryMobile", "13800000000");
        d.put("K3.euthPreference", "由实验动物科学部兽医根据动物身体状况决定");
        d.put("K3.operations", List.of("通知联系人", "动物尸体贴标签放入尸体间冷藏冰箱"));
        return toJson(d);
    }

    /* =====================================================================
     * 工具
     * ================================================================== */

    private DemoSpec findSpec(String registerNo) {
        if (registerNo == null) {
            return null;
        }
        for (DemoSpec s : SPECS) {
            if (registerNo.equals(s.registerNo)) {
                return s;
            }
        }
        return null;
    }

    /** 解析当前可用的模板（优先 PUBLISHED，回退任意版本）。 */
    private Long[] resolveTemplate() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, version FROM form_template WHERE form_key = ? "
                        + "ORDER BY (status = 'PUBLISHED') DESC, version DESC LIMIT 1", FORM_KEY);
        if (rows.isEmpty()) {
            return null;
        }
        Map<String, Object> row = rows.get(0);
        long id = ((Number) row.get("id")).longValue();
        Object v = row.get("version");
        return new Long[]{id, v == null ? null : ((Number) v).longValue()};
    }

    private static Object expireAtOf(DemoSpec spec) {
        if (!"approved".equals(spec.stage)) {
            return null;
        }
        // approved + 3 年
        String y = spec.approvedAt.substring(0, 4);
        return toTs((Integer.parseInt(y) + 3) + spec.approvedAt.substring(4));
    }

    private static Object toTs(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        return s.length() == 10 ? s + " 00:00:00" : s;
    }

    private Map<String, Object> mapOf(String k1, Object v1, String... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put(k1, v1);
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put(kv[i], kv[i + 1]);
        }
        return m;
    }

    private String toJson(Map<String, Object> map) {
        try {
            return om.writeValueAsString(map);
        } catch (Exception e) {
            return "{}";
        }
    }
}
