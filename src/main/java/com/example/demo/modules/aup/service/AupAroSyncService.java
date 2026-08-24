package com.example.demo.modules.aup.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.aup.mapper.AupRecordMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * ARO 计划书全量同步：正文 + 状态 + 评审记录 → 本地 AUP 7 表。
 * 新链路，不复用 booking-sync 的 fetchAuditedAupsGlobal / upsertSyncedApproved。
 *
 * <p>落库策略（见设计文档 2026-08-19-AUP-ARO计划书全量同步-设计）：
 * aup_record（register_no 唯一键 upsert + 元数据 + state 映射）、aup_data（整条 AupMainVo JSON）、
 * aup_snapshot（1 条最终版，version_no=1）、aup_review / aup_review_assignment / aup_audit_log（自 motify 列表重建）。
 * 内部 id 用我们自己的 aup_record.id 自增；ARO 的 id 仅留档于 JSON 快照，不做关联键。
 */
@Service
public class AupAroSyncService {

    private static final Logger log = LoggerFactory.getLogger(AupAroSyncService.class);

    /** 同步来源标记（created_by / actor），便于与本地手工数据区分 */
    private static final String SYNC_ACTOR = "aro";

    private final AroService aroService;
    private final JdbcTemplate jdbc;
    private final ObjectMapper om;
    private final AupAnimalAllowlistCompat allowlistCompat;
    private final AupRecordMapper aupRecordMapper;

    public AupAroSyncService(AroService aroService, JdbcTemplate jdbc, ObjectMapper om,
                             AupAnimalAllowlistCompat allowlistCompat, AupRecordMapper aupRecordMapper) {
        this.aroService = aroService;
        this.jdbc = jdbc;
        this.om = om;
        this.allowlistCompat = allowlistCompat;
        this.aupRecordMapper = aupRecordMapper;
    }

    // ======================================================================
    // 入口
    // ======================================================================

    public Map<String, Object> syncFromAro() {
        long[] tpl = resolvePublishedTemplate();
        if (tpl == null) {
            throw TwinBusinessException.of(400, "尚未发布 AUP 表单模板，无法同步");
        }
        List<Map<String, Object>> plans = fetchAllPlans();
        if (plans.isEmpty()) {
            throw TwinBusinessException.of(400, "ARO 未返回任何计划书，请检查账号权限或网络");
        }

        int inserted = 0, updated = 0, reviewCount = 0, failed = 0;
        for (Map<String, Object> plan : plans) {
            String registerNo = str(plan.get("registerNumber"));
            if (registerNo == null || registerNo.isBlank()) {
                failed++;
                continue;
            }
            try {
                // list 接口的嵌套正文（aupB5s/aupB6s/aupA4s/aupE/aupF/aupGh/aupIj/aupKl）是空的，需拉详情拿完整正文
                Map<String, Object> full = aroService.fetchAupDetail(str(plan.get("id")));
                if (full == null || full.isEmpty()) {
                    full = plan;
                }
                Long aupId = upsertRecord(full, tpl);
                if (aupId == null) {
                    failed++;
                    continue;
                }
                boolean isNew = upsertDataAndSnapshot(aupId, full, tpl);
                if (isNew) {
                    inserted++;
                } else {
                    updated++;
                }
                reviewCount += syncReviews(aupId, full);
                throttle(120);
            } catch (Exception e) {
                failed++;
                log.warn("[AUP-ARO] 同步失败 registerNo={} err={}", registerNo, e.getMessage());
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", plans.size());
        out.put("inserted", inserted);
        out.put("updated", updated);
        out.put("reviewCount", reviewCount);
        out.put("failed", failed);
        log.info("[AUP-ARO] 同步完成 total={} inserted={} updated={} reviews={} failed={}",
                plans.size(), inserted, updated, reviewCount, failed);
        return out;
    }

    // ======================================================================
    // 拉取
    // ======================================================================

    /** 分页拉全量计划书（翻到空页/不满页即停）。 */
    private List<Map<String, Object>> fetchAllPlans() {
        List<Map<String, Object>> all = new ArrayList<>();
        int pageNum = 1;
        int pageSize = 100;
        while (true) {
            List<Map<String, Object>> batch = aroService.fetchAupList(pageNum, pageSize);
            if (batch == null || batch.isEmpty()) {
                break;
            }
            all.addAll(batch);
            if (batch.size() < pageSize) {
                break;
            }
            pageNum++;
            throttle(400);
        }
        return all;
    }

    // ======================================================================
    // 主记录 / 正文 / 快照
    // ======================================================================

    /** 按 register_no upsert aup_record，返回本地 aupId（新建或已有）。 */
    private Long upsertRecord(Map<String, Object> plan, long[] tpl) {
        String registerNo = str(plan.get("registerNumber"));
        StageMap sm = mapStage(plan);
        String projectName = str(plan.get("projectName"));
        String piName = str(plan.get("projectPiName"));
        String piUserId = str(plan.get("projectPiId"));
        String dept = str(plan.get("projectPiDepartmentName"));
        String projectSource = str(plan.get("projectSourceName"));
        String projectGroupName = str(plan.get("projectGroupName"));
        String originRegisterNo = str(plan.get("registerNumber2"));
        LocalDateTime approvedAt = toDateTime(plan.get("passDate"));
        LocalDateTime submittedAt = toDateTime(plan.get("firstSubmitDate"));
        LocalDateTime expireAt = "approved".equals(sm.stage) && approvedAt != null ? approvedAt.plusYears(3) : null;
        String status = "approved".equals(sm.stage) ? "active" : null;

        Long existing = queryLong("SELECT id FROM aup_record WHERE register_no = ?", registerNo);
        if (existing != null) {
            jdbc.update(
                    "UPDATE aup_record SET template_id=?, template_version=?, current_stage=?, round_no=?, draft_source=?, "
                            + "origin_register_no=?, expire_at=?, project_name=?, pi_user_id=?, pi_name=?, dept=?, project_source=?, "
                            + "project_group_name=?, status=?, submitted_at=?, approved_at=?, updated_at=NOW() WHERE id=?",
                    tpl[0], String.valueOf((long) tpl[1]), sm.stage, sm.roundNo, sm.draftSource,
                    originRegisterNo, expireAt, projectName, piUserId, piName, dept, projectSource,
                    projectGroupName, status, submittedAt, approvedAt, existing);
            return existing;
        }

        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO aup_record (template_id, template_version, version, register_no, current_stage, round_no, "
                            + "draft_source, origin_register_no, expire_at, project_name, pi_user_id, pi_name, dept, project_source, "
                            + "project_group_name, status, submitted_at, approved_at, created_by, is_demo, created_at, updated_at) "
                            + "VALUES (?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NOW(),NOW())",
                    Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, tpl[0]);
            ps.setString(2, String.valueOf((long) tpl[1]));
            ps.setString(3, registerNo);
            ps.setString(4, sm.stage);
            ps.setInt(5, sm.roundNo);
            ps.setString(6, sm.draftSource);
            ps.setString(7, originRegisterNo);
            ps.setObject(8, expireAt);
            ps.setString(9, projectName);
            ps.setString(10, piUserId);
            ps.setString(11, piName);
            ps.setString(12, dept);
            ps.setString(13, projectSource);
            ps.setString(14, projectGroupName);
            ps.setString(15, status);
            ps.setObject(16, submittedAt);
            ps.setObject(17, approvedAt);
            ps.setString(18, SYNC_ACTOR);
            return ps;
        }, kh);
        Number key = kh.getKey();
        return key == null ? null : key.longValue();
    }

    /** upsert 正文 JSON + 落 1 条最终版快照。返回是否新建记录（此前无 aup_data 即视为新建）。 */
    private boolean upsertDataAndSnapshot(Long aupId, Map<String, Object> plan, long[] tpl) {
        boolean isNew = queryLong("SELECT id FROM aup_data WHERE aup_id = ?", aupId) == null;

        StageMap sm = mapStage(plan);
        String json = toJson(mapAroToLocal(plan));
        int updated = jdbc.update(
                "UPDATE aup_data SET data=?, updated_by=?, updated_at=NOW() WHERE aup_id=?",
                json, SYNC_ACTOR, aupId);
        if (updated == 0) {
            jdbc.update("INSERT INTO aup_data (aup_id, data, version, updated_by, created_at, updated_at) VALUES (?,?,0,?,NOW(),NOW())",
                    aupId, json, SYNC_ACTOR);
        }

        // 已批准计划：按 ARO 粗粒度名称构建兼容白名单，供订购侧校验
        if ("approved".equals(sm.stage)) {
            String allowlist = allowlistCompat.buildFromAroFormJson(json);
            aupRecordMapper.updateRegistryMeta(aupId, allowlist, "active");
        }

        // 1 条最终版快照：删除旧的同步快照后重插 version_no=1，保证反映最新 ARO 形态
        jdbc.update("DELETE FROM aup_snapshot WHERE aup_id = ? AND created_by = ?", aupId, SYNC_ACTOR);
        jdbc.update("INSERT INTO aup_snapshot (aup_id, version_no, stage, draft_source, data, template_id, template_version, created_by, created_at) "
                        + "VALUES (?,1,?,?,?,?,?,?,NOW())",
                aupId, sm.stage, sm.draftSource, json, tpl[0],
                String.valueOf((long) tpl[1]), SYNC_ACTOR);
        return isNew;
    }

    // ======================================================================
    // 评审记录（自 motify 列表重建）
    // ======================================================================

    private int syncReviews(Long aupId, Map<String, Object> plan) {
        String aroAupId = str(plan.get("id"));
        if (aroAupId == null || aroAupId.isBlank()) {
            return 0;
        }
        List<Map<String, Object>> motifies = aroService.fetchAupMotifyList(aroAupId);
        if (motifies.isEmpty()) {
            return 0;
        }

        // 幂等：清空该计划既有同步评审数据后重建（同步是唯一来源，只删同步产生的留痕，保留手工留痕）
        jdbc.update("DELETE FROM aup_review_item WHERE aup_id = ?", aupId);
        jdbc.update("DELETE FROM aup_review WHERE aup_id = ?", aupId);
        jdbc.update("DELETE FROM aup_review_assignment WHERE aup_id = ?", aupId);
        jdbc.update("DELETE FROM aup_audit_log WHERE aup_id = ? AND action IN ('通过', '退修', '不同意', '同步', 'aroReview', 'sync')", aupId);

        Set<String> seen = new HashSet<>();
        int count = 0;
        for (Map<String, Object> m : motifies) {
            String reviewer = str(m.get("checkUserName"));
            if (reviewer == null || reviewer.isBlank()) {
                reviewer = str(m.get("checkUserId"));
            }
            int roundNo = Math.max(1, toInt(m.get("backVersion"), 1));
            String verdict = mapVerdict(m.get("auditState"));
            String role = mapRole(m.get("actorId"));
            String comment = str(m.get("backDescription"));
            String dedupKey = roundNo + "|" + reviewer;
            if (seen.contains(dedupKey)) {
                continue;
            }
            seen.add(dedupKey);

            jdbc.update("INSERT INTO aup_review (aup_id, round_no, reviewer, role, verdict, comment) VALUES (?,?,?,?,?,?)",
                    aupId, roundNo, reviewer, role, verdict, comment);
            jdbc.update("INSERT INTO aup_review_assignment (aup_id, round_no, reviewer_id, status, assigned_by) VALUES (?,?,?,?,?)",
                    aupId, roundNo, reviewer, "voted", SYNC_ACTOR);
            jdbc.update("INSERT INTO aup_audit_log (aup_id, actor, role, action, from_stage, to_stage, comment, created_at) "
                            + "VALUES (?,?,?,?,?,?,?,NOW())",
                    aupId, reviewer, role, reviewAction(verdict), null, null, comment);
            count++;
        }

        // 同步留痕标记
        jdbc.update("INSERT INTO aup_audit_log (aup_id, actor, role, action, from_stage, to_stage, comment, created_at) "
                        + "VALUES (?,?,?,?,?,?,?,NOW())",
                aupId, SYNC_ACTOR, "admin", "同步", null, null, "从 ARO 同步计划书");
        throttle(150);
        return count;
    }

    // ======================================================================
    // 映射 / 解析
    // ======================================================================

    private static class StageMap {
        final String stage;
        final String draftSource;
        final int roundNo;
        StageMap(String stage, String draftSource, int roundNo) {
            this.stage = stage;
            this.draftSource = draftSource;
            this.roundNo = roundNo;
        }
    }

    /** ARO state + stateName → 本地 current_stage / draft_source / round_no。 */
    private StageMap mapStage(Map<String, Object> plan) {
        int state = toInt(plan.get("state"));
        String stateName = str(plan.get("stateName"));
        int roundNo = Math.max(1, toInt(plan.get("backVersion"), 1));
        String stage;
        String draftSource = "first";
        switch (state) {
            case 2:
                stage = "draft";
                draftSource = "piReturn";
                break;
            case 3:
                stage = "piReview";
                break;
            case 6:
                if (stateName != null && stateName.contains("修回")) {
                    stage = "draft";
                    draftSource = "expertReturn";
                    int n = parseRound(stateName);
                    if (n > 0) {
                        roundNo = n;
                    }
                } else {
                    stage = "expertReview";
                }
                break;
            case 7:
                stage = "draft";
                draftSource = "expertReturn";
                break;
            case 8:
                stage = "approved";
                break;
            default:
                stage = "draft";
                break;
        }
        return new StageMap(stage, draftSource, roundNo);
    }

    /** auditState → 本地 verdict：1=通过 agree / 2=退修 modify / 3=不同意 disagree。 */
    private String mapVerdict(Object auditStateObj) {
        switch (toInt(auditStateObj)) {
            case 2:
                return "modify";
            case 3:
                return "disagree";
            default:
                return "agree";
        }
    }

    /** verdict → 留痕动作中文标签（进行记录展示用）。 */
    private String reviewAction(String verdict) {
        if ("modify".equals(verdict)) {
            return "退修";
        }
        if ("disagree".equals(verdict)) {
            return "不同意";
        }
        return "通过";
    }

    /** actorId 9=iacuc秘书，其余按专家处理。 */
    private String mapRole(Object actorIdObj) {
        return toInt(actorIdObj) == 9 ? "secretary" : "expert";
    }

    /** "修回(第1轮)" → 1；解析失败返回 0。 */
    private int parseRound(String stateName) {
        try {
            int i = stateName.indexOf("第");
            int j = stateName.indexOf("轮", i + 1);
            if (i >= 0 && j > i) {
                return Integer.parseInt(stateName.substring(i + 1, j).trim());
            }
        } catch (Exception ignored) {
        }
        return 0;
    }

    // ======================================================================
    // ARO AupMainVo → 本地 field_key 映射（正文可渲染）
    // ======================================================================

    /** 把 ARO 计划书对象映射为本地 form_field.field_key 结构的 JSON（正文渲染用），原始 ARO 结构另存 __aroRaw。 */
    private Map<String, Object> mapAroToLocal(Map<String, Object> a) {
        Map<String, Object> d = new LinkedHashMap<>();
        // 0 注册信息
        put(d, "0.regNo", str(a.get("registerNumber")));
        put(d, "0.oldRegNo", str(a.get("registerNumber2")));

        // A1 项目信息
        put(d, "A1.name", str(a.get("projectName")));
        put(d, "A1.source", str(a.get("projectSourceName")));
        put(d, "A1.period", period(a.get("projectBeginDate"), a.get("projectEndDate")));
        put(d, "A1.no", str(a.get("projectNumber")));
        put(d, "A1.pi", str(a.get("projectPiName")));
        put(d, "A1.contact", str(a.get("projectContactUsername")));

        // A2 负责人
        put(d, "A2.unitType", toInt(a.get("isSchool")) == 2 ? "校外" : (a.get("isSchool") == null ? null : "校内"));
        put(d, "A2.leader", str(a.get("projectPiName")));
        put(d, "A2.employeeNo", str(a.get("projectPiJobNumber")));
        put(d, "A2.department", str(a.get("projectPiDepartmentName")));
        put(d, "A2.group", str(a.get("projectGroupName")));
        put(d, "A2.officePhone", str(a.get("projectPiOfficePhone")));
        put(d, "A2.mobile", str(a.get("projectPiMobilePhone")));
        put(d, "A2.email", str(a.get("projectPiEmail")));
        put(d, "A2.address", str(a.get("projectPiOfficeAddress")));

        // A3
        put(d, "A3.inPerson", ynStr(a.get("experimentSelfYn"), "是", "否"));

        // A4 操作人员
        List<Map<String, Object>> a4 = (List<Map<String, Object>>) (Object) a.get("aupA4s");
        if (a4 != null && !a4.isEmpty()) {
            List<Map<String, Object>> ops = new ArrayList<>();
            for (Map<String, Object> r : a4) {
                Map<String, Object> row = new LinkedHashMap<>();
                put(row, "col_no", str(r.get("userJobNumber")));
                put(row, "col_type", str(r.get("userTypeName")));
                put(row, "col_name", str(r.get("userName")));
                put(row, "col_email", str(r.get("userEmail")));
                put(row, "col_task", str(r.get("experimentTask")));
                ops.add(row);
            }
            d.put("A4.operators", ops);
        }

        // A5 合作单位
        put(d, "A5.scope", toInt(a.get("partnerYn")) == 1 ? "部分校外" : "全部校内");
        put(d, "A5.orgName", str(a.get("organizationName")));
        put(d, "A5.iacucApproved", ynStr(a.get("iacucYn"), "是", "否"));
        put(d, "A5.approvalNo", str(a.get("iacucApproveNumber")));
        put(d, "A5.approvalDate", str(a.get("iacucApproveDate")));
        put(d, "A5.orgLicense", str(a.get("licenceNumber")));

        // A6 更新
        put(d, "A6.update", toInt(a.get("projectUpdateYn")) == 1 ? "更新计划" : "新计划");
        put(d, "A6.oldNo", str(a.get("registerNumber2")));

        // A7 进出口
        put(d, "A7.export", ynStr(a.get("exportInvolvedYn"), "是", "否"));
        put(d, "A7.exportItems", str(a.get("exportInItem")));
        put(d, "A7.import", ynStr(a.get("importInvolvedYn"), "是", "否"));
        put(d, "A7.importItems", str(a.get("importInItem")));

        // A8 补充部分
        List<String> parts = new ArrayList<>();
        addFlag(parts, "G", a.get("otherGYn"));
        addFlag(parts, "H", a.get("otherHYn"));
        addFlag(parts, "I", a.get("otherIYn"));
        addFlag(parts, "J", a.get("otherJYn"));
        addFlag(parts, "K", a.get("otherKYn"));
        addFlag(parts, "L", a.get("otherLYn"));
        if (!parts.isEmpty()) d.put("A8.parts", parts);

        // B1/B2
        put(d, "B1.purpose", str(a.get("purposeDescription")));
        put(d, "B2.benefit", str(a.get("benefitDescription")));

        // B3 文献
        put(d, "B3.literature", ynStr(a.get("literatureYn"), "是", "否"));
        put(d, "B3.dbName", str(a.get("literatureDb")));
        put(d, "B3.keywords", str(a.get("literatureKeyword")));
        put(d, "B3.conclusion", str(a.get("literatureConclusion")));
        put(d, "B3.hasPain", ynStr(a.get("painRelatedYn"), "是", "否"));
        put(d, "B3.painDesc", str(a.get("painRelatedProcedure")));

        // B4 活体依据
        List<String> b4 = new ArrayList<>();
        addLabel(b4, a.get("b41Yn"), "研究过程非常复杂，无法在体外单一系统来复制和研究相关内容。");
        addLabel(b4, a.get("b42Yn"), "如果采用非活体动物进行研究无法获得足够的信息量以达到研究目的。");
        addLabel(b4, a.get("b43Yn"), "其他原因。");
        if (!b4.isEmpty()) d.put("B4.basis", b4);
        put(d, "B4.otherReason", str(a.get("b4Reason")));

        // B5 种类选择
        d.put("B5.blocks", mapB5Blocks(a.get("aupB5s")));

        // B6 数量
        d.put("B6.blocks", mapB6Blocks(a.get("aupB6s")));

        // B7 数量依据
        List<String> b7 = new ArrayList<>();
        addLabel(b7, a.get("b71Yn"), "通过生物统计学方法计算出可以获得显著差异性结果所需的动物数量。");
        addLabel(b7, a.get("b72Yn"), "未通过生物统计学方法，但通过估算获得达到实验目的所需要的最少动物数量。");
        addLabel(b7, a.get("b73Yn"), "所选动物数量是获得足够动物组织等其他样品进行分析的最低数量。");
        addLabel(b7, a.get("b74Yn"), "需要动物对实验操作人员进行培训确保项目的顺利进行。");
        addLabel(b7, a.get("b75Yn"), "其他依据。");
        if (!b7.isEmpty()) d.put("B7.basis", b7);
        put(d, "B7.basisDesc", str(a.get("b7Reason")));

        // B8
        put(d, "B8.overview", str(a.get("b8ExperimentOutline")));
        put(d, "B8.timeline", str(a.get("b8ExperimentTimeNode")));

        // B9
        put(d, "B9.nonPharma", toInt(a.get("b92Yn")) == 1 ? "是" : "否");
        put(d, "B9.details", str(a.get("b9Description")));

        // C1 饲养空间
        List<String> c1 = new ArrayList<>();
        addLabel(c1, a.get("c11Yn"), "动科部设施");
        addLabel(c1, a.get("c12Yn"), "院外其他单位");
        addLabel(c1, a.get("c13Yn"), "课题组管理区域");
        if (!c1.isEmpty()) d.put("C1.space", c1);

        // C2 特殊饲养
        put(d, "C2.hasRequest", ynStr(a.get("c2SpecialFeedingYn"), "是", "否"));
        put(d, "C2.detail", str(a.get("c2SpecialOtherDescript")));

        // C3 单笼
        put(d, "C3.singleCage", ynStr(a.get("c3SingleFeedYn"), "是", "否"));
        put(d, "C3.detail", str(a.get("c3SingleFeedDescription")));

        // D1/D2/D3
        put(d, "D1.ether", ynStr(a.get("d1UseEtherYn"), "是", "否"));
        put(d, "D1.basis", str(a.get("d1UseEtherDescription")));
        put(d, "D2.restraint", ynStr(a.get("d2FixationYn"), "是", "否"));
        put(d, "D2.detail", str(a.get("d2FixationDescript")));
        List<String> d3 = new ArrayList<>();
        addLabel(d3, a.get("d3NoCausePainYn"), "否，实验过程中不存在导致动物疼痛的程序");
        addLabel(d3, a.get("d3UseAnestheticYn"), "否，实验过程中使用了麻醉剂或止痛药物对动物进行疼痛缓解。");
        addLabel(d3, a.get("d3CanNotUseAnestheticYn"), "是，实验中存在导致动物疼痛的过程，但是不可以使用麻醉剂或止痛药物对动物进行疼痛缓解。");
        if (!d3.isEmpty()) d.put("D3.exempt", d3);
        put(d, "D3.detail", str(a.get("d3WhyCanNotUse")));

        // E 安乐死及处置
        mapE(d, a.get("aupE"));

        // F 声明
        mapF(d, a.get("aupF"));

        // G/H 有害物质 + 运输
        mapGh(d, a.get("aupGh"));

        // I/J 保定麻醉 + 基因工程
        mapIj(d, a.get("aupIj"));

        // K/L 紧急处理 + 课题组饲养
        mapKl(d, a.get("aupKl"));

        d.put("__aroRaw", a);
        return d;
    }

    private void mapE(Map<String, Object> d, Object eo) {
        if (!(eo instanceof Map<?, ?> m)) return;
        // E1.operator / confirm
        List<String> op = new ArrayList<>();
        addLabel(op, m.get("e1ExperimenterDoYn"), "实验人员自行对实验动物进行安乐死，请在接受培训后操作。");
        addLabel(op, m.get("e1VeterinaryDoYn"), "实验动物科学部兽医或兽医技术人员对动物实施安乐死。");
        addLabel(op, m.get("e1CanNotEuthanasiaYn"), "由于特殊需求不执行安乐死，请说明依据（限5000字内）");
        if (!op.isEmpty()) d.put("E1.operator", op);
        put(d, "E1.noEuthReason", str(m.get("e1CanNotEuthanasiaReason")));
        List<String> cf = new ArrayList<>();
        addLabel(cf, m.get("e1BilateralThoracotomyYn"), "双侧胸部剪开");
        addLabel(cf, m.get("e1EndsDownYn"), "断头");
        addLabel(cf, m.get("e1OrganSamplingYn"), "组织采样");
        addLabel(cf, m.get("e1OtherYn"), "其他方法");
        if (!cf.isEmpty()) d.put("E1.confirm", cf);
        put(d, "E1.sampleName", str(m.get("e1OrganSamplingName")));
        put(d, "E1.otherConfirm", str(m.get("e1OtherDescript")));
        // E2.disposal
        List<String> e2 = new ArrayList<>();
        addLabel(e2, m.get("e2TransferYn"), "活体的动物将转移到其他“实验动物研究及使用计划”。");
        addLabel(e2, m.get("e2ReturnSupplierYn"), "活体动物将返回动物供应商或进入繁殖保种阶段。");
        addLabel(e2, m.get("e2DeptEuthanasiaYn"), "实验结束后遗留动物将交由医学院实验动物科学部进行安乐死操作。");
        addLabel(e2, m.get("e2E1EuthanasiaYn"), "活体动物采取 E1 中所选择的安乐死方法进行处置。");
        addLabel(e2, m.get("e2OtherProcessYn"), "其他处理渠道，请说明（限5000字内）：");
        if (!e2.isEmpty()) d.put("E2.disposal", e2);
        put(d, "E2.otherDetail", str(m.get("e2OtherProcessDescription")));
        // E3.method
        List<String> e3 = new ArrayList<>();
        addLabel(e3, m.get("e3NoBiologicalHazardYn"), "无生物危害尸体");
        addLabel(e3, m.get("e3NoRadioactivityYn"), "无放射性组织器官");
        addLabel(e3, m.get("e3NoRadioactivity2Yn"), "放射性及生物危害");
        addLabel(e3, m.get("e3OtherDisposalMethodYn"), "其他方法");
        if (!e3.isEmpty()) d.put("E3.method", e3);
        put(d, "E3.otherDetail", str(m.get("e3OtherDisposalDescription")));
        // E4
        put(d, "E4.cooperate", ynStr(m.get("e4CooperativeUseYn"), "是", "否"));
        put(d, "E4.coLeader", str(m.get("cooperativePiName")));
        put(d, "E4.coJobNo", str(m.get("cooperativePiJobNumber")));
        put(d, "E4.coDept", str(m.get("departmentName")));
        put(d, "E4.coOfficePhone", str(m.get("officePhone")));
        put(d, "E4.coMobile", str(m.get("mobilePhone")));
        put(d, "E4.coEmail", str(m.get("email")));
        put(d, "E4.coAddress", str(m.get("officeAddress")));
    }

    private void mapF(Map<String, Object> d, Object fo) {
        if (!(fo instanceof Map<?, ?> f)) return;
        List<String> decl = new ArrayList<>();
        addLabel(decl, f.get("fanimalOperationYn"), "我保证所填写的内容真实有效，没有故意隐瞒可能会对人员、动物造成伤害的风险操作。");
        addLabel(decl, f.get("flawsRegulationsYn"), "所有动物实验操作都将遵守我国实验动物相关法律法规，《实验动物饲养管理和使用指南》(Guide)的规定以及上海交通大学医学院关于实验动物的各项规章制度，以确保动物福利的实施。");
        addLabel(decl, f.get("finnovationProjectYn"), "该研究是一个创新的项目，不是毫无意义的重复或对已报道过研究项目的重复。");
        addLabel(decl, f.get("foccupationalRiskYn"), "所有参与动物实验的人员都已经进行了职业风险和健康状况评估。");
        addLabel(decl, f.get("fresponsibilityYn"), "本人授权该“实验动物研究及使用计划”所列人员实施动物实验，监督所列人员对动物实验的操作，并承担相应责任。");
        addLabel(decl, f.get("fexperimenterYn"), "本“实验动物研究及使用计划”所列人员已经参加上海市实验动物从业人员上岗证培训以及上海交通大学医学院实验动物科学部实验前培训，并取得“上海市实验动物从业人员上岗证”。");
        addLabel(decl, f.get("feuthanasiaYn"), "我保证在“实验动物研究及使用计划”中所涵盖的实验动物在承受疾病、损伤或痛苦时都能够接受兽医人员治疗和照顾，并且在必要的情况下实施安乐死。");
        addLabel(decl, f.get("freportiAcucYn"), "我将及时向 IACUC（IACUC@shsmu.edu.cn）汇报动物实验实施过程中出现的未预料到的结果，这些未预料到的结果一般指实验过程中出现的违反动物福利的内容。");
        addLabel(decl, f.get("fapplicationforChangeYn"), "在动物实验计划发生变化（包括：实验重大设计、人员变化、动物使用数量及实验进行时限等方面）的时候，我将及时向上海交通大学医学院 IACUC 提交变动申请，任何未提交的动物实验变动，将禁止实施操作。");
        addLabel(decl, f.get("funexpectedpainYn"), "对于本“实验动物研究及使用计划”B 目录中涉及到的 D 类和 E 类疼痛级别的动物实验方案，本人确信已查阅相关科学文献及数据，虽然该方法会引起一定的疼痛或紧张，没有发现可以替代的方法。");
        if (!decl.isEmpty()) d.put("F.declarations", decl);
        put(d, "F.coLeaderName", str(f.get("cooperativePiName")));
        put(d, "F.leaderSignature", str(f.get("projectPiAutograph")));
        put(d, "F.coLeaderSignature", str(f.get("cooperativePiAutograph")));
    }

    private void mapGh(Map<String, Object> d, Object go) {
        if (!(go instanceof Map<?, ?> g)) return;
        // G1 有害物质
        List<String> chem = new ArrayList<>();
        addLabel(chem, g.get("g1CarcinogenYn"), "致癌物质/诱变剂");
        addLabel(chem, g.get("g1TissueFixativeYn"), "组织固定液（甲醛/福尔马林）");
        addLabel(chem, g.get("g1ToxicologicalDrugYn"), "毒理学药物");
        addLabel(chem, g.get("g1OtherHarmfulYn"), "其他有害化合物（请列入下表）");
        if (!chem.isEmpty()) d.put("G1.chemicals", chem);
        List<String> radio = new ArrayList<>();
        addLabel(radio, g.get("g1LaserYn"), "激光");
        addLabel(radio, g.get("g1IrradiatorYn"), "辐照机/X射线机");
        addLabel(radio, g.get("g1RadioactivMaterialYn"), "放射性物质");
        if (!radio.isEmpty()) d.put("G1.radioactive", radio);
        List<String> bio = new ArrayList<>();
        addLabel(bio, g.get("g1HumanDerivedCellYn"), "人源/猴源性细胞、组织、体液");
        addLabel(bio, g.get("g1StemCellYn"), "干细胞");
        addLabel(bio, g.get("g1ActiveVirusYn"), "有活性病毒/细菌/朊病毒");
        addLabel(bio, g.get("g1InactiveVirusYn"), "灭活病毒/细菌");
        addLabel(bio, g.get("g1RecombinantDnaYn"), "重组DNA");
        if (!bio.isEmpty()) d.put("G1.biological", bio);
        put(d, "G1.otherChemicals", str(g.get("g1OtherHarmfulDesp")));
        // G2 有害化合物明细
        d.put("G2.details", mapDrugs(g.get("aupG2s"), "hazardousName", "measurementFrequency", "drugDeliveryRoute", "maintainTime"));
        // G3/G4/G5
        put(d, "G3.biospecimenDesc", str(g.get("g3BiologicalProductDespYn")));
        put(d, "G4.safetyOperation", str(g.get("g3HazardousOperationYn")));
        put(d, "G5.disposal", str(g.get("g3HazardousHandlingYn")));
        // H1/H2 运输
        put(d, "H1.transportBy", toInt(g.get("h1CenterOnCampusYn")) == 1 ? "dept" : (toInt(g.get("h1StaffOnCampusYn")) == 1 ? "self" : null));
        put(d, "H1.selfTransportDesc", str(g.get("h1StaffOnCampusDesp")));
        put(d, "H2.transportBy", toInt(g.get("h2CenterinOutYn")) == 1 ? "dept" : (toInt(g.get("h2StaffinOutYn")) == 1 ? "self" : null));
        put(d, "H2.selfTransportDesc", str(g.get("h2StaffinOutDesp")));
    }

    private void mapIj(Map<String, Object> d, Object io) {
        if (!(io instanceof Map<?, ?> ij)) return;
        // I1 保定药物
        List<String> i1p = new ArrayList<>();
        addLabel(i1p, ij.get("i1FixationInjectionYn"), "使用动物保定药物对动物进行抽血、注射的保定。");
        addLabel(i1p, ij.get("i1FixationGrabYn"), "使用动物保定药物对动物进行抓取或运输保定。");
        addLabel(i1p, ij.get("i1FixationTestingYn"), "使用保定药物对动物进行测试项目保定用（例如：身体测量、CT、核磁共振、X光等）。");
        addLabel(i1p, ij.get("i1FixationOtherYn"), "其他使用保定药物目的。");
        if (!i1p.isEmpty()) d.put("I1.purposes", i1p);
        put(d, "I1.otherPurpose", str(ij.get("i1FixationOtherDesp")));
        d.put("I1.drugs", mapDrugs(ij.get("aupI1s"), "fixationDrugName", "measurementFrequency", "drugDeliveryRoute", null));
        // I2 止痛药物
        List<String> i2p = new ArrayList<>();
        addLabel(i2p, ij.get("i2CatalogBYn"), "目录B：动物仅饲养，维持，还未参与任何实验");
        addLabel(i2p, ij.get("i2CatalogCYn"), "目录C：动物仅承受瞬间或轻微的疼痛，无需使用止痛药物。");
        addLabel(i2p, ij.get("i2CatalogDYn"), "目录D：动物所承受的痛苦可以通过麻醉，止痛或镇静药物来减轻或消除（需要填写药物信息）。");
        addLabel(i2p, ij.get("i2CatalogEYn"), "目录E：动物所承受的痛苦不能够使用麻醉，止痛或镇静药物来减轻或消除，药物使用将干扰实验结果。");
        if (!i2p.isEmpty()) d.put("I2.painLevel", i2p);
        d.put("I2.preOpDrugs", mapDrugs(ij.get("aupI21s"), "analgesicName", "measurementFrequency", "drugDeliveryRoute", "drugDeliveryPeriod"));
        d.put("I2.intraOpDrugs", mapDrugs(ij.get("aupI22s"), "analgesicName", "measurementFrequency", "drugDeliveryRoute", "drugDeliveryPeriod"));
        // I3 麻醉
        put(d, "I3.anesthesia", toInt(ij.get("i3AnaesthesiaYn")) == 1 ? "本实验涉及到存活手术步骤，并使用麻醉药物。" : "本实验不涉及到动物麻醉过程");
        d.put("I3.drugs", mapDrugs(ij.get("aupI3s"), "anaesthesiaName", "measurementFrequency", "drugDeliveryRoute", "maintainTime"));
        // J1 基因工程来源
        List<String> j1 = new ArrayList<>();
        addLabel(j1, ij.get("j1FromOtherYn"), "转基因动物来源于其他科研机构。");
        addLabel(j1, ij.get("j1FromCenter"), "交通大学医学院实验动物科学部胚胎工程实验室。");
        addLabel(j1, ij.get("j1FromPiYn"), "转基因动物来源于课题组长保种群体。");
        addLabel(j1, ij.get("j1FromSupplierYn"), "来源于实验动物供应商（例如：Charles River，The Jackson Laboratory等）。");
        if (!j1.isEmpty()) d.put("J1.sources", j1);
        put(d, "J1.supplierName", str(ij.get("j1FromSupplierDesp")));
        // J2 品种及基因型
        d.put("J2.details", mapJ2(ij.get("aupJ2s")));
        // J3 基因型测定
        put(d, "J3.needTest", toInt(ij.get("j3YesGenotypingYn")) == 1 ? "本研究计划中基因工程动物需要进行基因型测定，请选择以下方法。" : "本研究计划中基因工程动物不需要进行基因型测定。");
        List<String> j3 = new ArrayList<>();
        addLabel(j3, ij.get("j3TailedSamplingYn"), "通过断尾采取样品进行基因型分析。");
        addLabel(j3, ij.get("j3OralTestPaperYn"), "口腔拭子DNA提取的方法。");
        addLabel(j3, ij.get("j3CollectBloodYn"), "采集血液样品。");
        addLabel(j3, ij.get("j3OtherYn"), "其他，请描述如下。");
        if (!j3.isEmpty()) d.put("J3.methods", j3);
        put(d, "J3.other", str(ij.get("j3OtherDesp")));
        // J4 表型与福利
        put(d, "J4.phenotypeDesc", str(ij.get("j4PhenotypeDesp")));
        List<String> j4 = new ArrayList<>();
        addLabel(j4, ij.get("j4NoChangeYn"), "没有任何形态学和生理功能的改变。");
        addLabel(j4, ij.get("j4IncreasedMortalityYn"), "动物早期死亡率上升。");
        addLabel(j4, ij.get("j4BodyChangedYn"), "动物机体出现如下变化，请描述。");
        addLabel(j4, ij.get("j4FunctionDefectYn"), "出现生理功能缺陷，请描述。");
        addLabel(j4, ij.get("j4MayBeChangeYn"), "可能会出现改变，但是目前还不知道，请说明。");
        if (!j4.isEmpty()) d.put("J4.changes", j4);
        put(d, "J4.bodyChangeDesc", str(ij.get("j4BodyChangedDesp")));
        put(d, "J4.functionDefectDesc", str(ij.get("j4FunctionDefectDesp")));
        put(d, "J4.observePlan", str(ij.get("j4ObservationPlan")));
        put(d, "J4.specialCare", toInt(ij.get("j4NoSpecialFeedingYn")) == 1 ? "不需要特殊饲养操作。" : (toInt(ij.get("j4NeedObservationYn")) == 1 ? "通过对基因工程动物的观察再决定是否需要特殊饲养操作。" : (toInt(ij.get("j4MustSpecialFeedingYn")) == 1 ? "必须提供特殊饲养操作，请说明如下。" : null)));
        put(d, "J4.specialCareDesc", str(ij.get("j4MustSpecialDesp")));
        // J5 记录
        put(d, "J5.recordPlan", toInt(ij.get("j5NoSpecialObservationYn")) == 1 ? "不需要特殊的健康观察记录，只需要按照实验动物科学部的健康记录操作即可。" : (toInt(ij.get("j5RecordSelfYn")) == 1 ? "由课题组自行记录。" : (toInt(ij.get("j5RecordCenterYn")) == 1 ? "由课题组委托实验动物科学部进行记录，请描述需要记录的项目如下，或附表。" : null)));
        put(d, "J5.recordItems", str(ij.get("j5MustSpecialDesp")));
    }

    private void mapKl(Map<String, Object> d, Object ko) {
        if (!(ko instanceof Map<?, ?> kl)) return;
        // K1 管理信息
        put(d, "K1.leaderName", str(kl.get("projectPiName")));
        put(d, "K1.officePhone", str(kl.get("officePhone")));
        put(d, "K1.mobile", str(kl.get("mobilePhone")));
        put(d, "K1.operations", str(kl.get("k1OperatedAlready")));
        // K2 联系信息
        put(d, "K2.primaryContact", str(kl.get("k2MainContectPerson")));
        put(d, "K2.primaryWorkPhone", str(kl.get("k2MainWorkPhone")));
        put(d, "K2.primaryMobile", str(kl.get("k2MainMobile")));
        put(d, "K2.otherContact", str(kl.get("k2OtherContectPerson")));
        put(d, "K2.otherWorkPhone", str(kl.get("k2OtherWorkPhone")));
        put(d, "K2.otherMobile", str(kl.get("k2OtherMobile")));
        // K3 紧急处理
        put(d, "K3.euthPreference", toInt(kl.get("k3OperateCenterYn")) == 1 ? "兽医决定" : (toInt(kl.get("k3OperateOtherYn")) == 1 ? "考虑因素" : null));
        List<String> k3steps = new ArrayList<>();
        addLabel(k3steps, kl.get("k3ContactYn"), "在对动物安乐死前联系以上所列联系人。");
        addLabel(k3steps, kl.get("k3AccordingPlanYn"), "对动物实施安乐死的时候，按照实验动物研究及使用计划所列的安乐死方法。");
        addLabel(k3steps, kl.get("k3OtherFactorsYn"), "动物实施安乐死的时候如需考虑到其他因素，请说明如下：");
        if (!k3steps.isEmpty()) d.put("K3.preEuthSteps", k3steps);
        put(d, "K3.otherFactorDesc", str(kl.get("k3OtherFactorsDesp")));
        List<String> k3op = new ArrayList<>();
        addLabel(k3op, kl.get("k3AfterDeathContactYn"), "通知联系人");
        addLabel(k3op, kl.get("k3LabelCarcassYn"), "动物尸体需贴标签放入尸体间冷藏冰箱（课题组取走采样）");
        addLabel(k3op, kl.get("k3HarmlessTreatmentYn"), "将动物尸体放入冰箱（由学校统一无害化处理）");
        addLabel(k3op, kl.get("k3AutopsyExaminationYn"), "将尸体送至兽医处解剖做病理学检测");
        if (!k3op.isEmpty()) d.put("K3.operations", k3op);
        put(d, "K3.other", str(kl.get("k3OtherOperate")));
        // L1 饲养区域管理
        put(d, "L1.piName", str(kl.get("projectPiName")));
        put(d, "L1.buildingNo", str(kl.get("l1AreaName")));
        put(d, "L1.roomNo", str(kl.get("l1RoomName")));
        put(d, "L1.absLevel", ynStr(kl.get("l1AbslYn"), "是", "否"));
        put(d, "L1.cycle", toInt(kl.get("l1LongTermFeedingYn")) == 1 ? "实验动物将长期饲养在课题组管理区域（目前学校禁止在实验室长期饲养动物）。" : (toInt(kl.get("l1PeriodicFeedingYn")) == 1 ? "实验动物将周期性饲养在课题组管理区域，并不是长期存在。" : (toInt(kl.get("l1OccasionallyFeedingYn")) == 1 ? "实验动物偶尔饲养在课题组管理区域（4-5天/月），并不长期存在。" : null)));
        put(d, "L1.species", str(kl.get("l1AnimalSpecies")));
        put(d, "L1.cageCount", kl.get("l1NumberOfCages"));
        put(d, "L1.animalCount", kl.get("l1NumberOfAnimal"));
        put(d, "L1.maxDays", kl.get("l1MaxTime"));
        d.put("L1.staff", mapStaff(kl.get("aupL1s")));
        put(d, "L1.disinfectable", toInt(kl.get("l1YesSurfaceDisinfectYn")) == 1 ? "本研究计划中所使用的检测工具可以表面消毒。" : (toInt(kl.get("l1NoSurfaceDisinfectYn")) == 1 ? "本研究计划中所使用的检测工具不可以表面消毒，请解释如下。" : null));
        put(d, "L1.disinfectReason", str(kl.get("l1NoSurfaceDisinfectDesp")));
        // L2 依据
        put(d, "L2.reason", str(kl.get("l2FeedingSelfReason")));
        put(d, "L2.other", str(kl.get("l2OtherDesp")));
        // L3 紧急预案联系人
        d.put("L3.emergencyContacts", mapStaff2(kl.get("aupL3s")));
    }

    /** 通用药物/化合物明细表：四列 → name/dose/route/duration 结构。 */
    private List<Map<String, Object>> mapDrugs(Object v, String nameKey, String doseKey, String routeKey, String durationKey) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!(v instanceof List<?> list)) return out;
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            put(row, "name", str(m.get(nameKey)));
            put(row, "dose", str(m.get(doseKey)));
            put(row, "route", str(m.get(routeKey)));
            if (durationKey != null) put(row, durationKey.equals("maintainTime") ? "duration" : "period", str(m.get(durationKey)));
            out.add(row);
        }
        return out;
    }

    private List<Map<String, Object>> mapJ2(Object v) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!(v instanceof List<?> list)) return out;
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            put(row, "breed", str(m.get("animalVarietyName")));
            put(row, "strain", str(m.get("animalStrainName")));
            List<String> phen = new ArrayList<>();
            addLabel(phen, m.get("j2DrugInducedYn"), "药物诱导");
            addLabel(phen, m.get("j2SiRnaYn"), "siRNA");
            addLabel(phen, m.get("j2EnvironmentInducedYn"), "环境诱导");
            addLabel(phen, m.get("j2VirusInducedYn"), "病毒诱导");
            addLabel(phen, m.get("j2ConstitutiveGeneYn"), "组成性基因（不需诱导）");
            addLabel(phen, m.get("j2OtherYn"), "其他");
            if (!phen.isEmpty()) row.put("phenotypeInduction", phen);
            out.add(row);
        }
        return out;
    }

    private List<Map<String, Object>> mapStaff(Object v) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!(v instanceof List<?> list)) return out;
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            put(row, "category", str(m.get("userTypeName")));
            put(row, "name", str(m.get("name")));
            put(row, "no", str(m.get("jobNumber")));
            put(row, "email", str(m.get("email")));
            out.add(row);
        }
        return out;
    }

    private List<Map<String, Object>> mapStaff2(Object v) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!(v instanceof List<?> list)) return out;
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            put(row, "name", str(m.get("userName")));
            put(row, "phone", str(m.get("userPhone")));
            put(row, "email", str(m.get("email")));
            out.add(row);
        }
        return out;
    }

    private List<Map<String, Object>> mapB5Blocks(Object v) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!(v instanceof List<?> list)) return out;
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) continue;
            Map<String, Object> blk = new LinkedHashMap<>();
            String variety = str(m.get("animalVarietyName"));
            put(blk, "species", variety);
            List<String> basis = new ArrayList<>();
            addLabel(basis, m.get("b51Yn"), "与其他实验动物相比选择此种动物可获得更加准确和更多的数据量。");
            addLabel(basis, m.get("b52Yn"), "此种动物的生理特性及解剖结构更适合本项目研究。");
            addLabel(basis, m.get("b53Yn"), "此种动物是完成该项目研究所能够选择的最低等生物。");
            addLabel(basis, m.get("b54Yn"), "其他原因。");
            if (!basis.isEmpty()) blk.put("basis", basis);
            put(blk, "basisDesc", str(m.get("b5Reason")));
            out.add(blk);
        }
        return out;
    }

    private List<Map<String, Object>> mapB6Blocks(Object v) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (!(v instanceof List<?> list)) return out;
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) continue;
            Map<String, Object> blk = new LinkedHashMap<>();
            String variety = str(m.get("animalVarietyName"));
            String strain = str(m.get("animalStrainName"));
            put(blk, "species", variety);
            // 品系（对应模板 B6.line → refDataSource=ANIMAL_STRAIN）
            put(blk, "line", strain);
            put(blk, "age", str(m.get("animalAge")));
            put(blk, "weight", str(m.get("animalWeight")));
            put(blk, "count", m.get("animalNumber"));
            List<String> levels = new ArrayList<>();
            addLabel(levels, m.get("catalogbYn"), "目录B");
            addLabel(levels, m.get("catalogcYn"), "目录C");
            addLabel(levels, m.get("catalogdYn"), "目录D");
            addLabel(levels, m.get("catalogeYn"), "目录E");
            if (!levels.isEmpty()) blk.put("painLevels", levels);
            put(blk, "countB", m.get("catalogbNumber"));
            put(blk, "countC", m.get("catalogcNumber"));
            put(blk, "countD", m.get("catalogdNumber"));
            put(blk, "countE", m.get("catalogeNumber"));
            put(blk, "domesticProvince", str(m.get("provinceName")));
            put(blk, "domesticOrg", str(m.get("supplierName")));
            out.add(blk);
        }
        return out;
    }

    private void addFlag(List<String> list, String label, Object flag) {
        if (toInt(flag) == 1) list.add(label);
    }

    private void addLabel(List<String> list, Object flag, String label) {
        if (toInt(flag) == 1) list.add(label);
    }

    private void put(Map<String, Object> d, String key, Object val) {
        if (val == null) return;
        if (val instanceof String s && s.isBlank()) return;
        d.put(key, val);
    }

    private String ynStr(Object v, String yes, String no) {
        if (v == null) return null;
        return toInt(v) == 1 ? yes : no;
    }

    private Map<String, Object> period(Object begin, Object end) {
        String b = str(begin);
        String e = str(end);
        if (b == null && e == null) return null;
        Map<String, Object> p = new LinkedHashMap<>();
        if (b != null) p.put("start", b.length() >= 10 ? b.substring(0, 10) : b);
        if (e != null) p.put("end", e.length() >= 10 ? e.substring(0, 10) : e);
        return p.isEmpty() ? null : p;
    }

    private long[] resolvePublishedTemplate() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, version FROM form_template WHERE form_key = 'aup' AND status = 'PUBLISHED' "
                        + "ORDER BY version DESC LIMIT 1");
        if (rows.isEmpty()) {
            return null;
        }
        Map<String, Object> row = rows.get(0);
        long id = ((Number) row.get("id")).longValue();
        int version = row.get("version") == null ? 1 : ((Number) row.get("version")).intValue();
        return new long[]{id, version};
    }

    private String toJson(Map<String, Object> plan) {
        try {
            return om.writeValueAsString(plan);
        } catch (Exception e) {
            return "{}";
        }
    }

    private LocalDateTime toDateTime(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) {
            return null;
        }
        try {
            if (s.length() >= 19) {
                return LocalDateTime.parse(s.substring(0, 19).replace(' ', 'T'));
            }
            if (s.length() >= 10) {
                return LocalDate.parse(s.substring(0, 10)).atStartOfDay();
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private Long queryLong(String sql, Object... args) {
        List<Long> rows = jdbc.queryForList(sql, Long.class, args);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private int toInt(Object v) {
        return toInt(v, 0);
    }

    private int toInt(Object v, int def) {
        if (v == null) {
            return def;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return (int) Double.parseDouble(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private void throttle(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
