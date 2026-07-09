package com.example.demo.modules.twin.dashboard.service;

import com.alibaba.fastjson2.JSON;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.cageshelf.entity.CageEventLog;
import com.example.demo.modules.cageshelf.mapper.CageEventLogMapper;
import com.example.demo.modules.twin.common.event.CageScanCompletedEvent;
import com.example.demo.modules.twin.common.service.TwinAutomationLogService;
import com.example.demo.modules.twin.dashboard.entity.TwinCageStatusViolation;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.entity.TwinViolationRule;
import com.example.demo.modules.twin.dashboard.mapper.TwinCageStatusViolationMapper;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * 笼架特殊状态违规判定引擎。
 * 监听 CageScanCompletedEvent 处理 AUTO_SYNC_LINKED 模式，
 * 通过独立 Job 处理 PURE_DAYS 模式。
 */
@Service
public class CageStatusViolationCheckService {
    private static final Logger log = LoggerFactory.getLogger(CageStatusViolationCheckService.class);
    private static final String SOURCE_CAGE_STATUS = "CAGE_STATUS";
    private static final String JUDGE_AUTO_SYNC = "AUTO_SYNC_LINKED";
    private static final String JUDGE_PURE_DAYS = "PURE_DAYS";
    private static final String JUDGE_PURE_MANUAL = "PURE_MANUAL";

    private final TwinViolationRuleService ruleService;
    private final TwinStudentViolationService violationService;
    private final TwinStudentViolationMapper studentViolationMapper;
    private final TwinCageStatusViolationMapper cageStatusViolationMapper;
    private final CageEventLogMapper eventLogMapper;
    private final TwinAutomationLogService automationLogService;
    private final AroService aroService;

    public CageStatusViolationCheckService(
            TwinViolationRuleService ruleService,
            TwinStudentViolationService violationService,
            TwinStudentViolationMapper studentViolationMapper,
            TwinCageStatusViolationMapper cageStatusViolationMapper,
            CageEventLogMapper eventLogMapper,
            TwinAutomationLogService automationLogService,
            AroService aroService) {
        this.ruleService = ruleService;
        this.violationService = violationService;
        this.studentViolationMapper = studentViolationMapper;
        this.cageStatusViolationMapper = cageStatusViolationMapper;
        this.eventLogMapper = eventLogMapper;
        this.automationLogService = automationLogService;
        this.aroService = aroService;
    }

    /** 监听笼架同步完成事件，处理 AUTO_SYNC_LINKED 和 PURE_DAYS 模式 */
    @EventListener
    public void onScanCompleted(CageScanCompletedEvent event) {
        String scanBatchId = event.getScanBatchId();
        String triggeredBy = event.getTriggeredBy();
        boolean isAuto = "system-scheduler".equals(triggeredBy);
        log.info("[cage-v-check] 收到同步完成事件 batch={} triggeredBy={}", scanBatchId, triggeredBy);

        List<TwinViolationRule> rules = ruleService.listAll().stream()
                .filter(r -> r.getEnabled() != null && r.getEnabled() == 1)
                .filter(r -> SOURCE_CAGE_STATUS.equals(r.getSourceTag()))
                .toList();

        for (TwinViolationRule rule : rules) {
            try {
                String mode = rule.getCageJudgeMode() != null ? rule.getCageJudgeMode() : JUDGE_AUTO_SYNC;
                if (JUDGE_PURE_MANUAL.equals(mode)) continue;
                if (JUDGE_AUTO_SYNC.equals(mode)) {
                    boolean manualOk = rule.getCageManualTrigger() != null && rule.getCageManualTrigger() == 1;
                    if (!isAuto && !manualOk) continue;
                }
                processRule(rule, scanBatchId);
            } catch (Exception e) {
                log.warn("[cage-v-check] 规则判定失败 ruleId={} err={}", rule.getId(), e.getMessage());
            }
        }
    }

    /** 纯天数模式定时执行入口 */
    public Map<String, Object> executePureDaysCheck(String triggeredBy) {
        log.info("[cage-v-check] PURE_DAYS 定时判定开始 triggeredBy={}", triggeredBy);

        List<TwinViolationRule> rules = ruleService.listAll().stream()
                .filter(r -> r.getEnabled() != null && r.getEnabled() == 1)
                .filter(r -> SOURCE_CAGE_STATUS.equals(r.getSourceTag()))
                .filter(r -> JUDGE_PURE_DAYS.equals(r.getCageJudgeMode()))
                .toList();

        int totalTriggered = 0;
        for (TwinViolationRule rule : rules) {
            try {
                int count = processRule(rule, null);
                totalTriggered += count;
            } catch (Exception e) {
                log.warn("[cage-v-check] PURE_DAYS 判定失败 ruleId={} err={}", rule.getId(), e.getMessage());
            }
        }
        return Map.of("rulesChecked", rules.size(), "totalTriggered", totalTriggered);
    }

    /** 对单条规则执行判定，返回触发的笼位数 */
    public int processRule(TwinViolationRule rule, String scanBatchId) {
        List<String> statusCodes = parseStringList(rule.getCageStatusCodes());
        if (statusCodes.isEmpty()) return 0;
        int delayDays = rule.getCageDelayDays() != null ? rule.getCageDelayDays() : 7;

        // 获取近期 STATUS_ADDED 事件（距今 >= delayDays）
        List<CageEventLog> addedEvents = eventLogMapper.selectRecentStatusAdded(
                statusCodes, delayDays, scanBatchId);

        // 解析区域和白名单过滤条件
        List<String> campuses = parseJsonField(rule.getCageAreaFilter(), "campuses");
        List<String> rooms = parseJsonField(rule.getCageAreaFilter(), "rooms");
        List<String> groupWhitelist = parseStringList(rule.getCageGroupWhitelist());

        int triggered = 0;
        for (CageEventLog evt : addedEvents) {
            // 区域过滤
            if (!campuses.isEmpty() && !campuses.contains(evt.getCurrCampusName())) continue;
            if (!rooms.isEmpty() && !rooms.contains(evt.getCurrRoomName())) continue;
            // 课题组白名单（匹配 projectPiName）
            if (!groupWhitelist.isEmpty() && !groupWhitelist.contains(evt.getProjectPiName())) continue;

            // 去重：已有 ACTIVE 父记录则跳过
            int[] posXY = parsePosition(evt.getCurrPosition());
            long shelveId = parseLongSafe(evt.getCurrShelveId());
            TwinCageStatusViolation existing = cageStatusViolationMapper.selectActiveByRuleAndCage(
                    rule.getId(),
                    extractStatusCode(evt),
                    shelveId,
                    posXY[0],
                    posXY[1]);
            if (existing != null) continue;

            // 检查当前快照中状态是否仍存在
            if (!isStatusStillPresent(evt)) continue;

            // 创建父记录 + 展开课题组 + 创建违规
            createViolationRecord(rule, evt);
            triggered++;
        }
        return triggered;
    }

    /** 检查当前快照中该笼位的状态是否仍存在：该笼位+状态码的最后一条 STATUS_ADDED 之后没有 STATUS_REMOVED */
    private boolean isStatusStillPresent(CageEventLog evt) {
        if (evt.getChangedAt() == null) return true;
        String statusCode = extractStatusCode(evt);
        long shelveId = parseLongSafe(evt.getCurrShelveId());
        int[] posXY = parsePosition(evt.getCurrPosition());
        try {
            int count = eventLogMapper.countStatusRemovedAfter(
                    statusCode,
                    evt.getCurrShelveId(),
                    evt.getCurrPosition(),
                    evt.getChangedAt());
            return count == 0;
        } catch (Exception e) {
            log.warn("[cage-v-check] isStatusStillPresent 查询失败 code={} shelve={} pos={}: {}",
                    statusCode, shelveId, evt.getCurrPosition(), e.getMessage());
            return true; // 查询失败时保守处理，避免漏判
        }
    }

    /** 创建父记录 + 展开课题组 + 批量创建个人违规 */
    private void createViolationRecord(TwinViolationRule rule, CageEventLog evt) {
        TwinCageStatusViolation parent = new TwinCageStatusViolation();
        parent.setRuleId(rule.getId());
        parent.setScanBatchId(evt.getScanBatchId());
        parent.setStatusCode(extractStatusCode(evt));
        parent.setCageShelveId(parseLongSafe(evt.getCurrShelveId()));
        int[] posXY = parsePosition(evt.getCurrPosition());
        parent.setPositionX(posXY[0]);
        parent.setPositionY(posXY[1]);
        parent.setPositionLabel(evt.getCurrPosition());
        parent.setCageBoxQrCode(evt.getCageBoxQrCode());
        parent.setProjectPiName(evt.getProjectPiName());
        parent.setProjectGroupName(evt.getProjectPiName());
        parent.setDepartmentName(evt.getDepartmentName());
        parent.setRoomName(evt.getCurrRoomName());
        parent.setCampusName(evt.getCurrCampusName());
        parent.setTriggeredAt(LocalDateTime.now());
        parent.setStatus("ACTIVE");
        cageStatusViolationMapper.insert(parent);

        // 展开课题组成员
        String triggerAction = rule.getCageTriggerAction() != null ? rule.getCageTriggerAction() : "BOTH";
        boolean doViolation = "VIOLATION_ONLY".equals(triggerAction) || "BOTH".equals(triggerAction);
        boolean doNotice = "NOTICE_ONLY".equals(triggerAction) || "BOTH".equals(triggerAction);

        if ((doViolation || doNotice) && evt.getProjectPiName() != null) {
            // NOTICE_ONLY：仅通知不违规 → forbidEnter=0、无交互式确认、showNoticeEveryScan=1
            boolean effectiveForbidEnter = doViolation && (rule.getForbidEnter() != null && rule.getForbidEnter() == 1);
            String effectiveInteractiveChallenge = doViolation ? rule.getInteractiveChallenge() : null;
            Boolean effectiveInteractiveUnlock = doViolation
                    ? (rule.getInteractiveUnlockOnVerify() != null && rule.getInteractiveUnlockOnVerify() == 1)
                    : null;
            int effectiveShowEveryScan = doNotice ? 1
                    : (rule.getShowNoticeEveryScan() != null && rule.getShowNoticeEveryScan() == 1 ? 1 : 0);

            List<String> memberIds = resolveGroupMemberIds(evt.getProjectPiName());
            for (String userId : memberIds) {
                try {
                    TwinStudentViolation violation = violationService.create(
                            userId,
                            renderTemplate(rule.getViolationTextTpl(), evt, userId),
                            parseStringList(rule.getCageImageUrls()),
                            effectiveForbidEnter,
                            null,
                            effectiveShowEveryScan == 1,
                            rule.getExpireAfterDays(),
                            "system",
                            SOURCE_CAGE_STATUS,
                            effectiveInteractiveChallenge,
                            effectiveInteractiveUnlock,
                            rule.getId(),
                            parent.getId()
                    );
                } catch (Exception e) {
                    log.warn("[cage-v-check] 创建个人违规失败 userId={} err={}", userId, e.getMessage());
                }
            }
            // 记录执行日志
            String parentIdStr = parent.getId() != null ? String.valueOf(parent.getId()) : "?";
            automationLogService.write("CAGE_STATUS_VIOLATION",
                    parentIdStr,
                    "auto-detect",
                    triggerAction,
                    null,
                    parentIdStr,
                    true,
                    String.format("规则=%s 笼位=%s 课题组=%s 成员数=%d",
                            rule.getRuleName(), evt.getCurrPosition(),
                            evt.getProjectPiName(), memberIds.size()),
                    "system");
        }
    }

    // ── helpers ──

    private List<String> resolveGroupMemberIds(String projectGroupName) {
        try {
            return aroService.findUserIdsByProjectGroup(projectGroupName);
        } catch (Exception e) {
            log.warn("[cage-v-check] 查询课题组成员失败 group={} err={}", projectGroupName, e.getMessage());
            return Collections.emptyList();
        }
    }

    private String renderTemplate(String tpl, CageEventLog evt, String userId) {
        if (tpl == null) return "";
        return tpl
                .replace("${name}", userId)
                .replace("${status}", extractStatusCode(evt))
                .replace("${cage}", evt.getCurrPosition() != null ? evt.getCurrPosition() : "?")
                .replace("${date}", java.time.LocalDate.now().toString());
    }

    /** 从 currPosition 解析 X/Y 坐标；格式如 "A-3" */
    private int[] parsePosition(String pos) {
        if (pos == null || pos.isEmpty()) return new int[]{0, 0};
        String[] parts = pos.split("-");
        if (parts.length != 2) return new int[]{0, 0};
        int x = parts[0].length() == 1 ? (parts[0].charAt(0) - 'A' + 1) : 0;
        int y;
        try {
            y = Integer.parseInt(parts[1]);
        } catch (NumberFormatException e) {
            y = 0;
        }
        return new int[]{x, y};
    }

    private long parseLongSafe(String s) {
        if (s == null || s.isBlank()) return 0L;
        try {
            return Long.parseLong(s.trim());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    /** 从 detail_summary 中提取状态码："新增 «CODE» @ ..." 或 "解除 «CODE» @ ..." → "CODE" */
    private String extractStatusCode(CageEventLog evt) {
        String summary = evt.getDetailSummary();
        if (summary == null || summary.isBlank()) return "UNKNOWN";
        int start = summary.indexOf('«'); // «
        int end = summary.indexOf('»');   // »
        if (start >= 0 && end > start) {
            return summary.substring(start + 1, end);
        }
        return summary; // fallback
    }

    private List<String> parseStringList(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            return JSON.parseArray(json, String.class);
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    @SuppressWarnings("unchecked")
    private List<String> parseJsonField(String json, String field) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            Map<String, Object> map = JSON.parseObject(json, Map.class);
            Object val = map.get(field);
            if (val instanceof List<?> list) {
                return list.stream().map(Object::toString).toList();
            }
        } catch (Exception e) {
            /* ignore */
        }
        return Collections.emptyList();
    }
}
