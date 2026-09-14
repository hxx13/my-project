package com.example.demo.modules.cageshelf.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import com.example.demo.modules.cageshelf.entity.CageStatusAlert;
import com.example.demo.modules.cageshelf.mapper.CageCellDetailMapper;
import com.example.demo.modules.cageshelf.mapper.CageCellIndexMapper;
import com.example.demo.modules.cageshelf.mapper.CageStatusAlertMapper;
import com.example.demo.modules.twin.dashboard.entity.TwinCageStatusViolation;
import com.example.demo.modules.twin.dashboard.entity.TwinViolationRule;
import com.example.demo.modules.twin.dashboard.mapper.TwinCageStatusViolationMapper;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import com.example.demo.modules.twin.dashboard.service.TwinViolationRuleService;
import com.example.demo.modules.twin.dashboard.support.ViolationTextTemplateRenderer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 告警 → 违规的联动（T9a）。
 *
 * <p>只读 twin_violation_rule（找出「enabled、source_tag=CAGE_STATUS、课题组白名单命中」的规则），
 * 复用违规模块的三张表：{@code TwinCageStatusViolationMapper.insert} 建父记录 +
 * {@link AroService#findUserIdsByProjectGroup} 展开课题组成员 +
 * {@link TwinStudentViolationService#create} 逐人建个人违规。**不读不调**老的
 * {@code CageStatusViolationCheckService}——那是另一套链路，这里只是复刻它「父记录 + 展开成员」的形态。
 *
 * <p>两处入口：
 * <ul>
 *   <li>{@link #prefill} —— 违规页「笼架提交」的预填（只读，鉴权在控制器）；</li>
 *   <li>{@link #publishIfWanted} —— 告警引擎把告警升级成 ACTIVE 时挂的旁路（自动发违规）。</li>
 * </ul>
 */
@Service
public class CageAlertViolationService {

    private static final Logger log = LoggerFactory.getLogger(CageAlertViolationService.class);

    private static final String SOURCE_CAGE_STATUS = "CAGE_STATUS";
    private static final String CREATED_BY_SYSTEM = "system";

    private final TwinViolationRuleService ruleService;
    private final TwinCageStatusViolationMapper cageStatusViolationMapper;
    private final TwinStudentViolationService violationService;
    private final AroService aroService;
    private final CageStatusAlertMapper alertMapper;
    private final CageCellIndexMapper cellIndexMapper;
    private final CageCellDetailMapper cellDetailMapper;
    /** 状态码 → 中文名（含特殊饲养明细，名字在码表里）—— 与阈值配置/引擎标签同一出处 */
    private final CageAlertRuleService alertRuleService;

    public CageAlertViolationService(TwinViolationRuleService ruleService,
                                     TwinCageStatusViolationMapper cageStatusViolationMapper,
                                     TwinStudentViolationService violationService,
                                     AroService aroService,
                                     CageStatusAlertMapper alertMapper,
                                     CageCellIndexMapper cellIndexMapper,
                                     CageCellDetailMapper cellDetailMapper,
                                     CageAlertRuleService alertRuleService) {
        this.ruleService = ruleService;
        this.cageStatusViolationMapper = cageStatusViolationMapper;
        this.violationService = violationService;
        this.aroService = aroService;
        this.alertMapper = alertMapper;
        this.cellIndexMapper = cellIndexMapper;
        this.cellDetailMapper = cellDetailMapper;
        this.alertRuleService = alertRuleService;
    }

    // ── 预填 ──

    /**
     * 违规页「笼架提交」预填：给定笼位（+ 可选状态码），回「状态 + 笼位 + PI/实验员 + 渲染好的文案 + 命中规则」。
     *
     * <p>statusCode 缺省时从该笼位的活跃告警反推（同一笼位同一状态最多一条活跃告警）。找不到匹配规则**不报错**：
     * 给保守兜底文案 + ruleMatched=false，前端据此提示。
     */
    public Map<String, Object> prefill(long animalCageId, String statusCode) {
        String code = hasText(statusCode) ? statusCode.trim() : resolveStatusCode(animalCageId);
        if (!hasText(code)) {
            throw new IllegalArgumentException("无法确定该笼位的状态码（未传 statusCode 且无活跃告警）");
        }

        Map<String, Object> index = cellIndexMapper.lookupByAnimalCageId(animalCageId);
        CageCellDetail detail = cellDetailMapper.selectByAnimalCageId(animalCageId);

        String positionLabel = positionLabelOf(index);
        String roomName = str(index == null ? null : index.get("roomName"));
        String projectPiName = detail == null ? null : detail.getProjectPiName();
        String experimenterName = detail == null ? null : detail.getExperimenterName();

        TwinViolationRule rule = findRule(projectPiName);
        String text;
        Long ruleId;
        boolean matched;
        if (rule != null) {
            text = renderCageText(rule.getViolationTextTpl(), code, index);
            ruleId = rule.getId();
            matched = true;
        } else {
            text = fallbackText(code, index);
            ruleId = null;
            matched = false;
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("animalCageId", String.valueOf(animalCageId));
        out.put("statusCode", code);
        out.put("statusLabel", statusLabelOf(code));
        out.put("shelveId", str(index == null ? null : index.get("shelveId")));
        out.put("positionLabel", positionLabel);
        out.put("positionX", index == null ? null : index.get("positionX"));
        out.put("positionY", index == null ? null : index.get("positionY"));
        out.put("roomName", roomName);
        out.put("campusName", str(index == null ? null : index.get("campusName")));
        out.put("projectPiName", projectPiName);
        out.put("experimenterName", experimenterName);
        out.put("violationText", text);
        out.put("ruleId", ruleId);
        out.put("ruleMatched", matched);
        return out;
    }

    // ── 引擎旁路：自动发违规 ──

    /**
     * 告警升级成 ACTIVE 时挂的旁路：命中规则才发违规（父记录 + 展开成员），没规则返回 null。
     *
     * <p>幂等三道，按代价从便宜到贵：
     * ① 该笼位该状态**还挂着未结（ACTIVE）的父违规** → 跳过。这是「同一个未处理的问题只记一次」，
     * 覆盖上游把状态字段反复置开/置关那类重复（每次都是新区间，按起算点拦不住；实测有笼位因此攒了 16 条）；
     * ② 同一段超时（同笼位 + 同状态 + **同起算时刻**）已经挂过违规 → 跳过。覆盖引擎「撤销 → 重建」：
     * 重建的行是**新 id**，按行 id 的守卫拦不住；起算点相同才算同一段，真重开区间该再发一次；
     * ③ {@code cage_status_alert.violation_id IS NULL} 的条件回填：先建父记录、再认领，
     * 认领失败说明他人已回填（极端并发），撤掉刚建的空父记录即不产生第二条违规。
     *
     * @return 新建违规父记录 id；没命中规则 / 无课题组 / 前两道跳过 / 认领失败均返回 null
     */
    public Long publishIfWanted(long alertId, long animalCageId, String statusCode) {
        Map<String, Object> index = cellIndexMapper.lookupByAnimalCageId(animalCageId);
        CageCellDetail detail = cellDetailMapper.selectByAnimalCageId(animalCageId);
        String positionLabel = positionLabelOf(index);
        String projectPiName = detail == null ? null : detail.getProjectPiName();

        TwinViolationRule rule = findRule(projectPiName);
        if (rule == null) {
            return null;
        }
        if (!hasText(projectPiName)) {
            // 没课题组 → 展开不出成员，建了父记录也是空壳，与判定引擎同口径：只有 projectPiName 非空才展开
            return null;
        }
        if (alertMapper.countPriorViolationForInterval(alertId) > 0) {
            log.info("[cage-alert-violation] 告警 {} 所属这段超时已发过违规，跳过重复发布", alertId);
            return null;
        }
        // 同一个未处理的问题只记一次：该笼位该状态还挂着未结的父违规就不再发。
        // 只有笼位能定位（架/坐标齐备）时才判，否则宁可照发也不误杀。
        Long shelveId = index == null ? null : toLong(index.get("shelveId"));
        Integer px = index == null ? null : toInt(index.get("positionX"));
        Integer py = index == null ? null : toInt(index.get("positionY"));
        if (shelveId != null && px != null && py != null
                && cageStatusViolationMapper.selectActiveByRuleAndCage(
                        rule.getId(), statusCode, shelveId, px, py) != null) {
            log.info("[cage-alert-violation] 笼位 {} {} 的 {} 还有未结违规，跳过重复发布",
                    index.get("shelveId"), positionLabel, statusCode);
            return null;
        }

        TwinCageStatusViolation parent = buildParent(rule, statusCode, index, detail, positionLabel);
        cageStatusViolationMapper.insert(parent);

        int claimed = alertMapper.claimViolationId(alertId, parent.getId());
        if (claimed == 0) {
            cageStatusViolationMapper.deleteById(parent.getId());
            log.warn("[cage-alert-violation] 告警 {} 已被并发发布违规，撤掉孤儿父记录 {}", alertId, parent.getId());
            return null;
        }

        expandMembers(rule, statusCode, index, projectPiName, parent);
        return parent.getId();
    }

    // ── 内部 ──

    private String resolveStatusCode(long animalCageId) {
        List<CageStatusAlert> active = alertMapper.listActive(List.of(animalCageId));
        return active.isEmpty() ? null : active.get(0).getStatusCode();
    }

    /** enabled=1 + source_tag=CAGE_STATUS；若配了课题组白名单，则笼位课题组须在名单内（不再按状态码匹配）。 */
    private TwinViolationRule findRule(String projectPiName) {
        for (TwinViolationRule r : ruleService.listAll()) {
            if (r.getEnabled() == null || r.getEnabled() != 1) continue;
            if (!SOURCE_CAGE_STATUS.equals(r.getSourceTag())) continue;
            if (!matchesGroupWhitelist(r.getCageGroupWhitelist(), projectPiName)) continue;
            return r;
        }
        return null;
    }

    private TwinCageStatusViolation buildParent(TwinViolationRule rule, String statusCode,
                                                Map<String, Object> index, CageCellDetail detail,
                                                String positionLabel) {
        TwinCageStatusViolation parent = new TwinCageStatusViolation();
        parent.setRuleId(rule.getId());
        parent.setStatusCode(statusCode);
        parent.setCageShelveId(toLong(index == null ? null : index.get("shelveId")));
        parent.setPositionX(toInt(index == null ? null : index.get("positionX")));
        parent.setPositionY(toInt(index == null ? null : index.get("positionY")));
        parent.setPositionLabel(positionLabel);
        String projectPiName = detail == null ? null : detail.getProjectPiName();
        parent.setProjectPiName(projectPiName);
        parent.setProjectGroupName(projectPiName);
        parent.setDepartmentName(detail == null ? null : detail.getDepartmentName());
        parent.setRoomName(str(index == null ? null : index.get("roomName")));
        parent.setCampusName(str(index == null ? null : index.get("campusName")));
        parent.setTriggeredAt(LocalDateTime.now());
        parent.setStatus("ACTIVE");
        return parent;
    }

    /** 展开课题组成员，逐人建个人违规；触发动作（VIOLATION_ONLY/NOTICE_ONLY/BOTH）决定禁入/通知位。 */
    private void expandMembers(TwinViolationRule rule, String statusCode, Map<String, Object> index,
                               String projectPiName, TwinCageStatusViolation parent) {
        String triggerAction = rule.getCageTriggerAction() != null ? rule.getCageTriggerAction() : "BOTH";
        boolean doViolation = "VIOLATION_ONLY".equals(triggerAction) || "BOTH".equals(triggerAction);
        boolean doNotice = "NOTICE_ONLY".equals(triggerAction) || "BOTH".equals(triggerAction);

        List<String> memberIds = resolveGroupMemberIds(projectPiName);
        if (memberIds.isEmpty()) return;

        // NOTICE_ONLY：仅通知不违规 → 不禁入、无交互确认、showNoticeEveryScan=1
        boolean effectiveForbidEnter = doViolation && rule.getForbidEnter() != null && rule.getForbidEnter() == 1;
        String effectiveInteractiveChallenge = doViolation ? rule.getInteractiveChallenge() : null;
        Boolean effectiveInteractiveUnlock = doViolation
                ? (rule.getInteractiveUnlockOnVerify() != null && rule.getInteractiveUnlockOnVerify() == 1)
                : null;
        int effectiveShowEveryScan = doNotice ? 1
                : (rule.getShowNoticeEveryScan() != null && rule.getShowNoticeEveryScan() == 1 ? 1 : 0);

        // 一次告警事件下发给全组＝一块：共用批次键，记录页按此成块（与滞留检测「一轮一块」同口径）
        String batchId = TwinStudentViolationService.newBatchKey();
        for (String userId : memberIds) {
            try {
                violationService.create(
                        userId,
                        renderCageText(rule.getViolationTextTpl(), statusCode, index),
                        parseStringList(rule.getCageImageUrls()),
                        effectiveForbidEnter,
                        null,
                        effectiveShowEveryScan == 1,
                        rule.getExpireAfterDays(),
                        CREATED_BY_SYSTEM,
                        SOURCE_CAGE_STATUS,
                        effectiveInteractiveChallenge,
                        effectiveInteractiveUnlock,
                        rule.getId(),
                        parent.getId(),
                        null,
                        null,
                        batchId);
            } catch (Exception e) {
                log.warn("[cage-alert-violation] 建个人违规失败 userId={} err={}", userId, e.getMessage());
            }
        }
    }

    private List<String> resolveGroupMemberIds(String projectGroupName) {
        try {
            return aroService.findUserIdsByProjectGroup(projectGroupName);
        } catch (Exception e) {
            log.warn("[cage-alert-violation] 查询课题组成员失败 group={} err={}", projectGroupName, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 渲染违规文案：只喂笼位上下文变量（${status}/${cage}），${name}/${dept}/${date} 是当事人变量，
     * 必须原样留在文案里，等展示/扫码时由 TwinStudentViolationService#applyTemplateVariables 按当事人替换。
     * 渲染器没有「只替换 extras」的入口，把三个标准变量传成它们自己（原样占位）即等价于跳过。
     *
     * <p>${status} 用中文名（{@link CageAlertRuleService#labelOf}：五个固定状态 + 特殊饲养明细查码表），
     * ${cage} 用「架子名 + 映射坐标」（见 {@link #cageDisplay}）。
     */
    private String renderCageText(String tpl, String statusCode, Map<String, Object> index) {
        if (tpl == null) return "";
        return ViolationTextTemplateRenderer.render(
                tpl,
                "${name}", "${dept}", "${date}",
                Map.of("status", statusLabelOf(statusCode),
                        "cage", cageDisplay(index)));
    }

    /** 没命中规则时的保守兜底：状态中文名 + 笼位（架子 + 映射坐标）。 */
    private String fallbackText(String statusCode, Map<String, Object> index) {
        return statusLabelOf(statusCode) + "，笼位 " + cageDisplay(index);
    }

    /** 状态码 → 中文名；未知 / 空回退成状态码本身，绝不 NPE、绝不回 null（调用方要塞进 Map.of）。 */
    private String statusLabelOf(String statusCode) {
        if (statusCode == null) return "";
        String label = alertRuleService.labelOf(statusCode);
        return label == null || label.isBlank() ? statusCode : label;
    }

    /**
     * 文案里的 ${cage}：架子名 + 映射坐标，形如 {@code 201A-1 A-9}；
     * 架子名缺失只给坐标，两者都没有给 "?"。架子名取 index map 的 {@code shelveName}。
     *
     * <p>包可见（非 private）：同包的 {@code CageStatusNotifyService} 拼通知变量时复用同一份口径，
     * 免得「违规文案一套坐标、通知文案另一套」。业务代码勿在别处调用。
     */
    static String cageDisplay(Map<String, Object> index) {
        String pos = mappedPositionLabel(index);
        String shelve = str(index == null ? null : index.get("shelveName"));
        if (!hasText(pos)) return hasText(shelve) ? shelve : "?";
        return hasText(shelve) ? shelve + " " + pos : pos;
    }

    /**
     * cage_group_whitelist 是 JSON 数组（也可能退化成逗号分隔）；空/空串/空数组 = 不限课题组。
     *
     * <p>「空的白名单」含：{@code null}、空白、字符串 {@code "null"}、{@code "[]"}、只含空白项——
     * 前端 {@code serializeCageFields} 会把空数组序列化成 {@code "[]"} 入库，此前该值既非 null 也非 blank，
     * 一路落到逗号兜底后恒返回 false，导致自动发违规整条链静默断掉（无报错、无日志）。
     *
     * <p>包可见（非 private）仅为单测可直接调用，业务代码勿在别处调用。
     */
    static boolean matchesGroupWhitelist(String json, String projectPiName) {
        if (json == null || json.isBlank() || "null".equalsIgnoreCase(json.trim())) return true;

        List<String> list = null;
        try {
            list = JSON.parseArray(json, String.class);
        } catch (Exception ignore) {
            // 非 JSON 数组 → 走逗号分隔兜底
        }

        if (list != null) {
            boolean hasMeaningful = false;
            for (String item : list) {
                if (item == null || item.isBlank()) continue;
                hasMeaningful = true;
                if (item.trim().equals(projectPiName)) return true;
            }
            if (!hasMeaningful) return true; // 空数组 / 只有空白项 → 不限课题组
            // 非空但未命中 → 落到逗号兜底再试一次（保持原行为）
        }

        if (projectPiName == null) return false; // 白名单非空但笼位没课题组

        boolean hasToken = false;
        for (String token : json.split(",")) {
            String t = token.trim();
            if (t.isEmpty()) continue;
            hasToken = true;
            if (projectPiName.equals(t)) return true;
        }
        return !hasToken; // 无任何有效项（如 " , "）→ 不限课题组
    }

    private static List<String> parseStringList(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            return JSON.parseArray(json, String.class);
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    /**
     * 入库用原始位号：{@code (A+x-1)-y}，如 x=1,y=2 → {@code A-2}。<b>保持未映射</b>——
     * 与 {@code twin_cage_status_violation.position_label} 现有口径一致：该列被违规记录编辑页
     * 按原始文本与 special-status 概览的 {@code position} 做等值对齐，也是人工建单路径写入的格式，
     * 故不在此翻转；展示映射走 {@link #mappedPositionLabel}。
     */
    static String positionLabelOf(Map<String, Object> index) {
        if (index == null) return null;
        Integer x = toInt(index.get("positionX"));
        Integer y = toInt(index.get("positionY"));
        if (x == null || y == null) return null;
        char col = (char) ('A' + Math.max(0, x - 1));
        return col + "-" + y;
    }

    /**
     * 映射位号（仅文案展示用）：与前端
     * {@code frontend/src/features/cage-shelf/constants.ts} 的 {@code displayPosition}
     * <b>必须同源</b>——列取字母 {@code A+x-1}，行翻转 {@code 11-y}
     * （货架第 1 行在物理最下面，屏幕上显示时反过来）。x=1,y=2 → {@code A-9}。
     *
     * <p>改动必须双端同步：本仓库有过「前端预览与后端出成品两条渲染路径各写各的、结果对不上」的教训。
     * 硬编码 10 行货架（{@code 11 = 行数 + 1}），与前端一致。
     */
    static String mappedPositionLabel(Map<String, Object> index) {
        if (index == null) return null;
        Integer x = toInt(index.get("positionX"));
        Integer y = toInt(index.get("positionY"));
        if (x == null || y == null) return null;
        char col = (char) ('A' + Math.max(0, x - 1));
        return col + "-" + (11 - y);
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v).trim();
    }

    private static Integer toInt(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.intValue();
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) return null;
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) return null;
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
