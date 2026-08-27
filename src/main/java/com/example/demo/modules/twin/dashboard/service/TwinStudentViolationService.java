package com.example.demo.modules.twin.dashboard.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.notification.entity.StudentNotification;
import com.example.demo.modules.notification.push.dispatch.PushService;
import com.example.demo.modules.notification.mapper.StudentNotificationMapper;
import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.component.SocketRoomAssigner;
import com.example.demo.modules.student.service.MobileUserSocketPushService;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.dashboard.dto.DashboardViolationBoardItemDTO;
import com.example.demo.modules.twin.dashboard.dto.ScanStudentViolationNoticeDTO;
import com.example.demo.modules.twin.dashboard.entity.TwinCageStatusViolation;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.entity.TwinViolationRule;
import com.example.demo.modules.twin.dashboard.mapper.TwinCageStatusViolationMapper;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import com.example.demo.modules.twin.dashboard.support.InteractiveChallengeVerifier;
import com.example.demo.modules.twin.dashboard.support.ViolationMirrorNotificationSupport;
import com.example.demo.modules.twin.dashboard.support.ViolationTextTemplateRenderer;
import com.example.demo.modules.twin.obligation.content.ContentJsonSupport;
import com.example.demo.modules.twin.obligation.entity.TwinObligation;
import com.example.demo.modules.twin.obligation.service.ObligationService;
import com.example.demo.modules.twin.obligation.support.ObligationSupport;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class TwinStudentViolationService {
    private static final Logger log = LoggerFactory.getLogger(TwinStudentViolationService.class);
    private static final String STATUS_ACTIVE = "ACTIVE";
    private static final String SOURCE_AUTO_STRANDED = "AUTO_STRANDED";
    /** MySQL GET_LOCK 锁名最长 64 字符 */
    private static final int AUTO_STRANDED_LOCK_TIMEOUT_SEC = 10;

    private static final java.util.Map<String, String> CAGE_STATUS_LABEL = java.util.Map.of(
        "COHABITATION", "合笼/繁殖",
        "SPECIAL_FEEDING", "特殊饲养",
        "NEED_DIVIDE", "请分笼/密度超标",
        "HEALTH_ABNORMAL", "动物健康异常",
        "ANIMAL_TRANSFER", "动物转移"
    );

    /** 解析笼位处理提示的标题：优先用父记录 statusCode 中文标签 */
    private String resolveCageNoticeTitle(TwinStudentViolation row) {
        if (row.getCageViolationId() != null && cageStatusViolationMapper != null) {
            try {
                TwinCageStatusViolation parent = cageStatusViolationMapper.selectById(row.getCageViolationId());
                if (parent != null && parent.getStatusCode() != null) {
                    String label = CAGE_STATUS_LABEL.get(parent.getStatusCode());
                    if (label != null) return label;
                    return parent.getStatusCode();
                }
            } catch (Exception ignored) { }
        }
        return "笼位处理提示";
    }

    private final TwinStudentViolationMapper violationMapper;
    private final ObjectMapper objectMapper;
    private final UserDisplayNameService userDisplayNameService;
    private final TwinDashboardMapper dashboardMapper;
    private final TwinViolationRuleService ruleService;
    private final MobileUserSocketPushService mobileUserSocketPushService;
    private final StudentNotificationMapper studentNotificationMapper;
    private final TwinCageStatusViolationMapper cageStatusViolationMapper;
    private final SocketIOServer socketServer;
    private final PushService pushService;
    private final ObligationService obligationService;

    /** 检测到表不存在后短路，避免每次扫码/列表都打库抛错（执行 DDL 后需重启应用或等后续扩展热恢复） */
    private final AtomicBoolean violationTableAbsent = new AtomicBoolean(false);

    public TwinStudentViolationService(TwinStudentViolationMapper violationMapper,
                                       ObjectMapper objectMapper,
                                       UserDisplayNameService userDisplayNameService,
                                       TwinDashboardMapper dashboardMapper,
                                       TwinViolationRuleService ruleService,
                                       MobileUserSocketPushService mobileUserSocketPushService,
                                       StudentNotificationMapper studentNotificationMapper,
                                       TwinCageStatusViolationMapper cageStatusViolationMapper,
                                       @org.springframework.beans.factory.annotation.Autowired(required = false) SocketIOServer socketServer,
                                       PushService pushService,
                                       @org.springframework.beans.factory.annotation.Autowired(required = false) ObligationService obligationService) {
        this.violationMapper = violationMapper;
        this.objectMapper = objectMapper;
        this.userDisplayNameService = userDisplayNameService;
        this.dashboardMapper = dashboardMapper;
        this.ruleService = ruleService;
        this.mobileUserSocketPushService = mobileUserSocketPushService;
        this.studentNotificationMapper = studentNotificationMapper;
        this.cageStatusViolationMapper = cageStatusViolationMapper;
        this.socketServer = socketServer;
        this.pushService = pushService;
        this.obligationService = obligationService;
    }

    private static boolean isTwinStudentViolationTableMissing(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            String m = t.getMessage();
            if (m != null && m.contains("twin_student_violation") && m.contains("doesn't exist")) {
                return true;
            }
        }
        return false;
    }

    private void markTableAbsentOnce() {
        if (violationTableAbsent.compareAndSet(false, true)) {
            log.warn(
                    "[student-violation] 库表 twin_student_violation 不存在，已跳过违规相关读写。"
                            + " 请确认 app.schema.auto-ensure-embedded-core-ddl=true（默认）且数据源有建表权限，或手工执行 scripts/student_violation.ddl.sql。"
            );
        }
    }

    /** 启动阶段执行 embedded DDL 成功后调用，恢复此前因缺表而短路的读写 */
    public void markSchemaReady() {
        violationTableAbsent.set(false);
    }
    /** 将到期记录标记为 EXPIRED，避免误判为仍生效；并撤回对应镜像通知 */
    public void touchExpireStale() {
        if (violationTableAbsent.get()) {
            return;
        }
        try {
            List<Long> dueIds = Collections.emptyList();
            try {
                dueIds = violationMapper.selectIdsDueToExpire();
            } catch (Exception e) {
                if (isTwinStudentViolationTableMissing(e)) {
                    markTableAbsentOnce();
                    return;
                }
                log.warn("[student-violation] 查询待过期 id 失败: {}", e.getMessage());
            }
            int n = violationMapper.expireActivePastDue();
            if (n > 0) {
                withdrawMirrorNotifications(dueIds);
                for (Long vid : dueIds) {
                    if (vid == null) continue;
                    markObligationExpired(vid);
                    try {
                        TwinStudentViolation expired = violationMapper.selectById(vid);
                        if (expired != null) {
                            maybeClearOrphanCageParent(expired.getCageViolationId());
                        }
                    } catch (Exception ignored) {
                        // 父记录清理失败不影响过期主路径
                    }
                }
                log.info("[student-violation] 自动过期 {} 条违规记录", n);
            }
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return;
            }
            log.warn("[student-violation] 过期扫描失败: {}", e.getMessage());
        }
    }

    public TwinStudentViolation findActiveRow(String targetUserId) {
        if (!StringUtils.hasText(targetUserId)) {
            return null;
        }
        if (violationTableAbsent.get()) {
            return null;
        }
        touchExpireStale();
        if (violationTableAbsent.get()) {
            return null;
        }
        try {
            return violationMapper.selectActiveByTargetUserId(targetUserId.trim());
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return null;
            }
            log.warn("[student-violation] 查询失败 userId={} err={}", targetUserId, e.getMessage());
            return null;
        }
    }

    public ScanStudentViolationNoticeDTO buildNotice(String targetUserId) {
        TwinStudentViolation row = findActiveRow(targetUserId);
        if (row == null) {
            return null;
        }
        ScanStudentViolationNoticeDTO dto = new ScanStudentViolationNoticeDTO();
        dto.setId(row.getId());
        dto.setViolationText(applyTemplateVariables(row.getViolationText(), row.getTargetUserId()));
        dto.setImageUrls(parseImageUrls(row.getImageUrls()));
        dto.setShowNoticeEveryScan(row.getShowNoticeEveryScan() != null && row.getShowNoticeEveryScan() == 1);
        boolean locked = computeEnterLocked(row);
        dto.setEnterLocked(locked);
        dto.setRemainingEnterAllowance(computeRemaining(row));
        dto.setInteractiveChallenge(row.getInteractiveChallenge());
        dto.setInteractiveChallengeVerified(row.getInteractiveChallengeVerifiedAt() != null);
        dto.setExpireAt(row.getExpireAt());
        dto.setPastExpireAwaitingInteractive(isPastExpireAwaitingInteractive(row));
        // 笼位联动标记：前端据此渲染独立灵动岛
        boolean isCage = "CAGE_STATUS".equals(row.getSource());
        if (isCage) {
            String cageTitle = resolveCageNoticeTitle(row);
            dto.setRuleName("[CAGE]" + cageTitle);
        }
        // 规则解禁状态
        if (row.getRuleId() != null && ruleService != null) {
            TwinViolationRule rule = ruleService.getById(row.getRuleId());
            if (rule != null) {
                if (!isCage) {
                    dto.setRuleName(rule.getRuleName());
                }
                dto.setUnblockMethod(rule.getUnblockMethod());
                TwinViolationRuleService.UnblockDecision decision =
                        ruleService.evaluateForExisting(targetUserId, row.getRuleId());
                dto.setCritical(decision.isCritical());
                dto.setCanSelfUnblock(ruleService.canSelfUnblock(row.getId(), targetUserId, row.getRuleId()));
                if (decision.isCritical() && rule.getCriticalNoticeText() != null && !rule.getCriticalNoticeText().isBlank()) {
                    dto.setCriticalNoticeText(applyTemplateVariables(rule.getCriticalNoticeText(), targetUserId));
                }
            }
        }
        return dto;
    }

    public boolean isEnterBlocked(String targetUserId) {
        TwinStudentViolation row = findActiveRow(targetUserId);
        return row != null && computeEnterLocked(row);
    }

    /** 管理端列表：当前是否禁止扫码进入（含交互确认、次数上限，与扫码端 enterLocked 一致） */
    public boolean isEnterLocked(TwinStudentViolation row) {
        return computeEnterLocked(row);
    }

    /**
     * 扫码端完成交互拼图：写入验证时间；若 interactive_unlock_on_verify=1 则同步解除禁入（幂等）。
     */
    @Transactional(rollbackFor = Exception.class)
    public TwinStudentViolation acknowledgeInteractiveChallenge(long violationId, String targetUserId, String answer) {
        if (violationTableAbsent.get()) {
            throw new IllegalStateException("库表 twin_student_violation 未创建");
        }
        if (!StringUtils.hasText(targetUserId)) {
            throw new IllegalArgumentException("缺少 userId");
        }
        TwinStudentViolation row = getById(violationId);
        if (row == null || !STATUS_ACTIVE.equals(row.getStatus())) {
            throw new IllegalArgumentException("违规记录不存在或已失效");
        }
        if (!targetUserId.trim().equals(row.getTargetUserId())) {
            throw new IllegalArgumentException("无权确认该违规");
        }
        if (!StringUtils.hasText(row.getInteractiveChallenge())) {
            throw new IllegalArgumentException("该违规无需交互确认");
        }
        // 服务端校验答案。已验证过的记录走幂等返回路径，不重复校验。
        if (row.getInteractiveChallengeVerifiedAt() == null
                && !InteractiveChallengeVerifier.matches(row.getInteractiveChallenge(), answer)) {
            log.warn("[student-violation] 交互确认答案不匹配 violationId={} userId={}", violationId, targetUserId);
            throw new IllegalArgumentException("确认短语不正确");
        }
        // 自助解禁规则才受窗口次数上限约束；记录级交互短语（含 MANUAL 默认规则）仍允许拼图确认
        if (row.getRuleId() != null && ruleService != null) {
            TwinViolationRule rule = ruleService.getById(row.getRuleId());
            if (rule != null && "自助解禁".equals(rule.getUnblockMethod())
                    && !ruleService.canSelfUnblock(violationId, targetUserId.trim(), row.getRuleId())) {
                throw new IllegalArgumentException("已达解禁上限");
            }
        }
        if (row.getInteractiveChallengeVerifiedAt() != null) {
            completeObligationDisposition(row.getId(), targetUserId.trim(), answer);
            return finalizeAfterInteractiveAck(row);
        }
        try {
            int unlockFlag = isInteractiveUnlockOnVerify(row) ? 1 : 0;
            int n = violationMapper.acknowledgeInteractiveById(violationId, unlockFlag);
            if (n <= 0) {
                TwinStudentViolation latest = getById(violationId);
                if (latest != null && latest.getInteractiveChallengeVerifiedAt() != null) {
                    return finalizeAfterInteractiveAck(latest);
                }
                throw new IllegalStateException("交互确认失败，请重试");
            }
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                throw new IllegalStateException("库表 twin_student_violation 未创建");
            }
            throw new RuntimeException(e);
        }
        TwinStudentViolation after = getById(violationId);
        if (after != null && after.getInteractiveChallengeVerifiedAt() != null) {
            completeObligationDisposition(after.getId(), targetUserId.trim(), answer);
        }
        return finalizeAfterInteractiveAck(after);
    }

    private TwinStudentViolation finalizeAfterInteractiveAck(TwinStudentViolation row) {
        if (row == null || row.getId() == null) {
            return row;
        }
        if (!STATUS_ACTIVE.equals(row.getStatus())) {
            return row;
        }
        if (row.getExpireAt() != null && row.getExpireAt().isBefore(LocalDateTime.now())) {
            try {
                int n = violationMapper.expireByIdIfPastDue(row.getId());
                if (n > 0) {
                    withdrawMirrorNotification(row.getId());
                    markObligationExpired(row.getId());
                }
            } catch (Exception e) {
                if (isTwinStudentViolationTableMissing(e)) {
                    markTableAbsentOnce();
                } else {
                    log.warn("[student-violation] 交互确认后过期失败 id={} err={}", row.getId(), e.getMessage());
                }
            }
            TwinStudentViolation latest = getById(row.getId());
            return latest != null ? latest : row;
        }
        return row;
    }

    private static boolean isPastExpireAwaitingInteractive(TwinStudentViolation row) {
        if (row == null || row.getExpireAt() == null) {
            return false;
        }
        if (!row.getExpireAt().isBefore(LocalDateTime.now())) {
            return false;
        }
        return StringUtils.hasText(row.getInteractiveChallenge())
                && row.getInteractiveChallengeVerifiedAt() == null;
    }

    public void recordSuccessfulEnter(String targetUserId) {
        TwinStudentViolation row = findActiveRow(targetUserId);
        if (row == null || row.getId() == null) {
            return;
        }
        try {
            violationMapper.incrementEnterSuccess(row.getId());
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return;
            }
            log.warn("[student-violation] increment enter 失败 id={} err={}", row.getId(), e.getMessage());
        }
    }

    /**
     * 主页大屏「违规惩戒公示」：ACTIVE + 未过期，每人最新一条；
     * 笼架联动违规按课题组聚合为一条，其余按个人展示。
     */
    public List<DashboardViolationBoardItemDTO> listDashboardBoard(int limit, int summaryMaxLen) {
        if (violationTableAbsent.get()) {
            return Collections.emptyList();
        }
        touchExpireStale();
        if (violationTableAbsent.get()) {
            return Collections.emptyList();
        }
        int lim = Math.min(Math.max(limit, 1), 500);
        int maxLen = Math.min(Math.max(summaryMaxLen, 10), 200);
        List<TwinStudentViolation> rows;
        try {
            rows = violationMapper.selectActiveForDashboardBoard(lim);
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return Collections.emptyList();
            }
            log.warn("[student-violation] 大屏公示查询失败: {}", e.getMessage());
            return Collections.emptyList();
        }
        if (rows == null || rows.isEmpty()) {
            return Collections.emptyList();
        }

        // 分离笼架联动违规和个人违规
        List<TwinStudentViolation> cageRows = new ArrayList<>();
        List<TwinStudentViolation> personalRows = new ArrayList<>();
        for (TwinStudentViolation row : rows) {
            if (row.getCageViolationId() != null) {
                cageRows.add(row);
            } else {
                personalRows.add(row);
            }
        }

        List<DashboardViolationBoardItemDTO> out = new ArrayList<>();

        // 笼架联动：按课题组聚合，每组一条
        if (!cageRows.isEmpty() && cageStatusViolationMapper != null) {
            Map<String, List<TwinStudentViolation>> byGroup = new LinkedHashMap<>();
            Map<String, String> groupStatusCode = new LinkedHashMap<>();
            LocalDateTime latestCageTime = null;
            for (TwinStudentViolation row : cageRows) {
                try {
                    TwinCageStatusViolation parent = cageStatusViolationMapper.selectById(row.getCageViolationId());
                    String groupName = (parent != null && parent.getProjectGroupName() != null)
                            ? parent.getProjectGroupName().trim() : "未命名课题组";
                    byGroup.computeIfAbsent(groupName, k -> new ArrayList<>()).add(row);
                    if (parent != null && parent.getStatusCode() != null) {
                        groupStatusCode.putIfAbsent(groupName, parent.getStatusCode());
                    }
                    if (parent != null && parent.getTriggeredAt() != null) {
                        if (latestCageTime == null || parent.getTriggeredAt().isAfter(latestCageTime)) {
                            latestCageTime = parent.getTriggeredAt();
                        }
                    }
                } catch (Exception e) {
                    log.debug("[student-violation] 查父记录失败 cageViolationId={}", row.getCageViolationId());
                }
            }
            for (Map.Entry<String, List<TwinStudentViolation>> entry : byGroup.entrySet()) {
                List<TwinStudentViolation> members = entry.getValue();
                // 单人锁定：按个人违规样式展示（姓名 + 实际违规文案）
                if (members.size() == 1) {
                    TwinStudentViolation single = members.get(0);
                    DashboardViolationBoardItemDTO dto = new DashboardViolationBoardItemDTO();
                    dto.setId(single.getId());
                    String name = userDisplayNameService.resolveDisplayName(single.getTargetUserId());
                    dto.setDisplayName(StringUtils.hasText(name) ? name : single.getTargetUserId());
                    // 单人笼架违规：文案前拼上 [状态标签]
                    String sc = groupStatusCode.getOrDefault(entry.getKey(), "");
                    String prefix = StringUtils.hasText(sc) ? "[" + statusLabel(sc) + "] " : "";
                    dto.setSummary(prefix + buildSummary(applyTemplateVariables(single.getViolationText(), single.getTargetUserId()), maxLen));
                    List<String> imgs = parseImageUrls(single.getImageUrls());
                    dto.setCoverImageUrl(imgs.isEmpty() ? null : imgs.get(0));
                    dto.setCreatedAt(single.getCreatedAt());
                    out.add(dto);
                } else {
                    DashboardViolationBoardItemDTO dto = new DashboardViolationBoardItemDTO();
                    dto.setId(members.get(0).getId());
                    dto.setGroupName(entry.getKey());
                    dto.setDisplayName(entry.getKey());
                    String sc = groupStatusCode.getOrDefault(entry.getKey(), "");
                    String prefix = StringUtils.hasText(sc) ? "[" + statusLabel(sc) + "] " : "";
                    dto.setSummary(prefix + "共涉及 " + members.size() + " 名成员");
                    dto.setCoverImageUrl(null);
                    dto.setCreatedAt(latestCageTime);
                    out.add(dto);
                }
            }
        }

        // 个人违规：每人一条
        for (TwinStudentViolation row : personalRows) {
            DashboardViolationBoardItemDTO dto = new DashboardViolationBoardItemDTO();
            dto.setId(row.getId());
            String name = userDisplayNameService.resolveDisplayName(row.getTargetUserId());
            dto.setDisplayName(StringUtils.hasText(name) ? name : row.getTargetUserId());
            dto.setSummary(buildSummary(applyTemplateVariables(row.getViolationText(), row.getTargetUserId()), maxLen));
            List<String> imgs = parseImageUrls(row.getImageUrls());
            dto.setCoverImageUrl(imgs.isEmpty() ? null : imgs.get(0));
            dto.setCreatedAt(row.getCreatedAt());
            out.add(dto);
        }
        return out;
    }

    /**
     * 违规文案模板变量：库内保留 ${name}/${dept}/${date}，展示/扫码时再按当事人替换。
     */
    String applyTemplateVariables(String rawText, String targetUserId) {
        if (!StringUtils.hasText(rawText) || !rawText.contains("${")) {
            return rawText != null ? rawText : "";
        }
        String tid = StringUtils.hasText(targetUserId) ? targetUserId.trim() : "";
        String name = StringUtils.hasText(tid) ? userDisplayNameService.resolveDisplayName(tid) : "";
        if (!StringUtils.hasText(name) && StringUtils.hasText(tid)) {
            name = tid;
        }
        String dept = resolveDepartmentName(tid);
        return ViolationTextTemplateRenderer.render(rawText, name, dept, ViolationTextTemplateRenderer.today());
    }

    /** 笼位状态码 → 中文标签 */
    private static String statusLabel(String statusCode) {
        if (statusCode == null) return "";
        return switch (statusCode) {
            case "COHABITATION" -> "合笼/繁殖";
            case "SPECIAL_FEEDING" -> "特殊饲养";
            case "NEED_DIVIDE" -> "请分笼/密度超标";
            case "HEALTH_ABNORMAL" -> "动物健康异常";
            case "ANIMAL_TRANSFER" -> "动物转移";
            default -> statusCode;
        };
    }

    private String resolveDepartmentName(String userId) {
        if (!StringUtils.hasText(userId)) {
            return "";
        }
        try {
            List<Map<String, Object>> hits = dashboardMapper.searchPersonnel(userId.trim(), 1);
            if (hits != null && !hits.isEmpty()) {
                return Objects.toString(hits.get(0).get("department_name"), "");
            }
        } catch (Exception e) {
            log.debug("[student-violation] 解析部门失败 userId={} err={}", userId, e.getMessage());
        }
        return "";
    }

    /**
     * 手机 H5 违规记录列表项：正文与扫码弹窗 {@link #buildNotice} 同源（模板变量 + critical 替换）。
     */
    public Map<String, Object> toMobileListItem(TwinStudentViolation row) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", String.valueOf(row.getId()));
        item.put("time", row.getCreatedAt() != null ? row.getCreatedAt().toString() : "");
        item.put("type", "CAGE_STATUS".equals(row.getSource()) ? "笼位处理提示" : "违规通告");
        item.put("contentHtml", resolveDisplayBodyForMobile(row));
        item.put("roomName", "");
        item.put("doorName", "");
        item.put("status", mapMobileStatus(row.getStatus()));
        item.put("processedBy", row.getClearedByUserId() != null ? row.getClearedByUserId() : "");
        item.put("processedTime", row.getClearedAt() != null ? row.getClearedAt().toString() : "");
        return item;
    }

    /** 与扫码弹窗正文一致：模板变量 + 达到上限时的 critical 替换文案 */
    private String resolveDisplayBodyForMobile(TwinStudentViolation row) {
        if (row == null) {
            return "";
        }
        String body = applyTemplateVariables(row.getViolationText(), row.getTargetUserId());
        if (STATUS_ACTIVE.equals(row.getStatus()) && row.getRuleId() != null && ruleService != null) {
            TwinViolationRule rule = ruleService.getById(row.getRuleId());
            if (rule != null) {
                TwinViolationRuleService.UnblockDecision decision =
                        ruleService.evaluateForExisting(row.getTargetUserId(), row.getRuleId());
                if (decision.isCritical() && StringUtils.hasText(rule.getCriticalNoticeText())) {
                    body = applyTemplateVariables(rule.getCriticalNoticeText(), row.getTargetUserId());
                }
            }
        }
        return body != null ? body : "";
    }

    private static String mapMobileStatus(String status) {
        if (!StringUtils.hasText(status)) {
            return "pending";
        }
        return switch (status.trim().toUpperCase()) {
            case "ACTIVE" -> "pending";
            case "CLEARED", "PROCESSED", "EXPIRED", "SUPERSEDED" -> "processed";
            default -> "pending";
        };
    }

    private static String buildSummary(String rawText, int maxLen) {
        if (!StringUtils.hasText(rawText)) {
            return "";
        }
        // 先剥离 HTML 标签再截断，避免 <p>/<img> 等标签吃掉字符配额
        String plain = rawText.replaceAll("<[^>]+>", " ");
        // 折叠换行/制表符为单空格，避免大屏单行高度被破坏
        String folded = plain.replaceAll("[\\r\\n\\t]+", " ").replaceAll(" {2,}", " ").trim();
        if (folded.length() <= maxLen) {
            return folded;
        }
        return folded.substring(0, maxLen) + "…";
    }

    public List<TwinStudentViolation> listRecent(String targetUserId, int limit) {
        if (violationTableAbsent.get()) {
            return Collections.emptyList();
        }
        touchExpireStale();
        if (violationTableAbsent.get()) {
            return Collections.emptyList();
        }
        int lim = Math.min(Math.max(limit, 1), 500);
        try {
            return violationMapper.selectRecent(
                    StringUtils.hasText(targetUserId) ? targetUserId.trim() : null,
                    lim
            );
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return Collections.emptyList();
            }
            throw e;
        }
    }

    /**
     * 滞留自动违规：在 per-user MySQL 命名锁内去重并创建，避免定时任务/手动测试并发重复插入。
     *
     * @return 新建记录；若已有生效中的 AUTO_STRANDED 或未能获取锁则返回 null
     */
    @Transactional(rollbackFor = Exception.class)
    public TwinStudentViolation createAutoStrandedIfAbsent(
            String targetUserId,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId,
            String interactiveChallenge,
            Boolean interactiveUnlockOnVerify,
            Long ruleId
    ) {
        if (!StringUtils.hasText(targetUserId)) {
            throw new IllegalArgumentException("缺少 targetUserId");
        }
        if (violationTableAbsent.get()) {
            throw new IllegalStateException("库表 twin_student_violation 未创建：请开启 app.schema.auto-ensure-embedded-core-ddl（默认 true）并赋予数据源建表权限，或手工执行 scripts/student_violation.ddl.sql 后重启。");
        }
        String tid = targetUserId.trim();
        String lockName = autoStrandedLockName(tid);
        Integer locked = violationMapper.tryAcquireLock(lockName, AUTO_STRANDED_LOCK_TIMEOUT_SEC);
        if (locked == null || locked != 1) {
            log.warn("[student-violation] AUTO_STRANDED 去重锁未获取 userId={} lock={}", tid, lockName);
            return null;
        }
        try {
            touchExpireStale();
            if (violationTableAbsent.get()) {
                throw new IllegalStateException("库表 twin_student_violation 未创建：请开启 app.schema.auto-ensure-embedded-core-ddl（默认 true）并赋予数据源建表权限，或手工执行 scripts/student_violation.ddl.sql 后重启。");
            }
            if (hasActiveAutoViolation(tid)) {
                return null;
            }
            return create(
                    tid,
                    violationText,
                    imageUrls,
                    forbidEnter,
                    maxEnterSuccess,
                    showNoticeEveryScan,
                    expireAfterDays,
                    createdByUserId,
                    SOURCE_AUTO_STRANDED,
                    interactiveChallenge,
                    interactiveUnlockOnVerify,
                    ruleId,
                    null);
        } finally {
            try {
                violationMapper.releaseLock(lockName);
            } catch (Exception e) {
                log.warn("[student-violation] AUTO_STRANDED 释放锁失败 userId={} err={}", tid, e.getMessage());
            }
        }
    }

    private static String autoStrandedLockName(String targetUserId) {
        String suffix = targetUserId.trim();
        String prefix = "twin:v:auto:";
        if (prefix.length() + suffix.length() <= 64) {
            return prefix + suffix;
        }
        return prefix + Math.abs(suffix.hashCode());
    }

    /** 检查用户是否已有 ACTIVE 的自动滞留违规（用于去重，避免定时任务每次节拍重复创建） */
    public boolean hasActiveAutoViolation(String targetUserId) {
        if (!StringUtils.hasText(targetUserId)) {
            return false;
        }
        if (violationTableAbsent.get()) {
            return false;
        }
        try {
            return violationMapper.countActiveAutoStrandedByUserId(targetUserId.trim()) > 0;
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return false;
            }
            log.warn("[student-violation] hasActiveAutoViolation failed userId={} err={}", targetUserId, e.getMessage());
            return false;
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public TwinStudentViolation create(
            String targetUserId,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId
    ) {
        return create(targetUserId, violationText, imageUrls, forbidEnter, maxEnterSuccess,
                showNoticeEveryScan, expireAfterDays, createdByUserId, "MANUAL", null, null, null, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public TwinStudentViolation create(
            String targetUserId,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId,
            String source,
            String interactiveChallenge
    ) {
        return create(
                targetUserId,
                violationText,
                imageUrls,
                forbidEnter,
                maxEnterSuccess,
                showNoticeEveryScan,
                expireAfterDays,
                createdByUserId,
                source,
                interactiveChallenge,
                null, null, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public TwinStudentViolation create(
            String targetUserId,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId,
            String source,
            String interactiveChallenge,
            Boolean interactiveUnlockOnVerify
    ) {
        return create(targetUserId, violationText, imageUrls, forbidEnter, maxEnterSuccess,
                showNoticeEveryScan, expireAfterDays, createdByUserId, source,
                interactiveChallenge, interactiveUnlockOnVerify, null, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public TwinStudentViolation create(
            String targetUserId,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId,
            String source,
            String interactiveChallenge,
            Boolean interactiveUnlockOnVerify,
            Long ruleId,
            Long cageViolationId
    ) {
        if (!StringUtils.hasText(targetUserId)) {
            throw new IllegalArgumentException("缺少 targetUserId");
        }
        if (violationTableAbsent.get()) {
            throw new IllegalStateException("库表 twin_student_violation 未创建：请开启 app.schema.auto-ensure-embedded-core-ddl（默认 true）并赋予数据源建表权限，或手工执行 scripts/student_violation.ddl.sql 后重启。");
        }
        String tid = targetUserId.trim();
        touchExpireStale();
        if (violationTableAbsent.get()) {
            throw new IllegalStateException("库表 twin_student_violation 未创建：请开启 app.schema.auto-ensure-embedded-core-ddl（默认 true）并赋予数据源建表权限，或手工执行 scripts/student_violation.ddl.sql 后重启。");
        }

        // ──── 规则判定：达上限时可强制禁入；手动创建时交互式短语亦须同步禁入 ────
        boolean effectiveForbidEnter = resolveManualForbidEnter(forbidEnter, interactiveChallenge);
        if (ruleId != null && ruleService != null) {
            TwinViolationRuleService.UnblockDecision decision = ruleService.evaluate(tid, ruleId);
            effectiveForbidEnter = effectiveForbidEnter || decision.isForbidEnter();
        }

        // 每条提交独立 INSERT 新 id；不再把同人既有 ACTIVE 标为 SUPERSEDED（避免覆盖历史违规）。
        // 扫码展示仍取最新 ACTIVE（ORDER BY id DESC LIMIT 1）；管理端列表可并列显示多条 ACTIVE。

        TwinStudentViolation row = new TwinStudentViolation();
        row.setTargetUserId(tid);
        ContentJsonSupport.Resolved content = ContentJsonSupport.resolve(objectMapper, null, violationText, true);
        row.setViolationText(content.contentHtml());
        row.setContentJson(content.contentJson());
        row.setImageUrls(serializeImageUrls(imageUrls));
        row.setInteractiveChallenge(normalizeInteractiveChallenge(interactiveChallenge));
        int unlockOnVerify = resolveInteractiveUnlockOnVerify(row.getInteractiveChallenge(), interactiveUnlockOnVerify);
        row.setInteractiveUnlockOnVerify(unlockOnVerify);
        row.setForbidEnter(effectiveForbidEnter ? 1 : 0);
        row.setMaxEnterSuccess(maxEnterSuccess);
        row.setEnterSuccessCount(0);
        row.setShowNoticeEveryScan(showNoticeEveryScan ? 1 : 0);
        // 到期时间与「验证后解禁」可并存：到期后仅「已验证」者自动消弹窗（过期扫描撤回通知），
        // 未验证者超期仍保持 ACTIVE 并继续展示（见 expireActivePastDue / selectActiveByTargetUserId）
        if (expireAfterDays != null && expireAfterDays > 0) {
            row.setExpireAt(LocalDateTime.now().plusDays(expireAfterDays));
        } else {
            row.setExpireAt(null);
        }
        row.setStatus(STATUS_ACTIVE);
        row.setCreatedByUserId(createdByUserId);
        row.setSource(source != null && !source.isBlank() ? source.trim() : "MANUAL");
        row.setRuleId(ruleId);
        row.setCageViolationId(cageViolationId);
        try {
            violationMapper.insert(row);
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                throw new IllegalStateException("库表 twin_student_violation 未创建：请开启 app.schema.auto-ensure-embedded-core-ddl（默认 true）并赋予数据源建表权限，或手工执行 scripts/student_violation.ddl.sql 后重启。");
            }
            throw e;
        }
        // 先同步 Obligation，再写镜像通知 / 推送（sourceUrl、obligationId 依赖待办 id）
        syncObligationFromCreated(row);
        persistStudentNotification(row);
        pushViolationCreatedNotification(row);
        // 笼位联动 → 广播到管理端灵动岛
        if ("CAGE_STATUS".equals(row.getSource())) {
            broadcastCageNoticeAlert(row);
        }
        try { String srcLabel = "CAGE_STATUS".equals(row.getSource()) ? "笼位状态异常" : row.getSource() != null ? row.getSource() : "管理员记录"; String enterLabel = row.getForbidEnter() != null && row.getForbidEnter() == 1 ? "已限制进入" : "未限制"; pushService.send("VIOLATION_CREATED", Map.of("title", "CAGE_STATUS".equals(row.getSource()) ? resolveCageNoticeTitle(row) : "违规提醒", "source", srcLabel, "summary", row.getViolationText() != null ? row.getViolationText().replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").trim() : "", "enterLocked", enterLabel), Set.of(row.getTargetUserId())); } catch (Exception e) { log.warn("[Push] VIOLATION_CREATED failed: {}", e.getMessage()); }
        return row;
    }

    /** 违规创建后实时推送 WebSocket 通知到目标用户的 H5 手机端消息栏目 */
    private void pushViolationCreatedNotification(TwinStudentViolation row) {
        if (mobileUserSocketPushService == null || row == null || !StringUtils.hasText(row.getTargetUserId())) {
            return;
        }
        try {
            Map<String, Object> alertItem = new LinkedHashMap<>();
            alertItem.put("kind", "violation");
            alertItem.put("id", row.getId());
            alertItem.put("title", "CAGE_STATUS".equals(row.getSource()) ? resolveCageNoticeTitle(row) : "违规提醒");
            alertItem.put("source", row.getSource());

            // 完整内容：模板变量替换 + 达到上限时的 critical 替换文案
            String body = applyTemplateVariables(row.getViolationText(), row.getTargetUserId());
            if (row.getRuleId() != null && ruleService != null) {
                TwinViolationRule rule = ruleService.getById(row.getRuleId());
                if (rule != null) {
                    TwinViolationRuleService.UnblockDecision decision =
                            ruleService.evaluateForExisting(row.getTargetUserId(), row.getRuleId());
                    if (decision.isCritical() && StringUtils.hasText(rule.getCriticalNoticeText())) {
                        body = applyTemplateVariables(rule.getCriticalNoticeText(), row.getTargetUserId());
                    }
                }
            }
            alertItem.put("contentHtml", body != null ? body : "");
            alertItem.put("contentJson", row.getContentJson());

            alertItem.put("enterLocked", computeEnterLocked(row));
            alertItem.put("interactiveRequired",
                    StringUtils.hasText(row.getInteractiveChallenge())
                            && row.getInteractiveChallengeVerifiedAt() == null);
            if (StringUtils.hasText(row.getInteractiveChallenge())) {
                alertItem.put("interactiveChallenge", row.getInteractiveChallenge());
                alertItem.put("interactiveChallengeVerified", row.getInteractiveChallengeVerifiedAt() != null);
            }
            if (row.getRuleId() != null && ruleService != null) {
                TwinViolationRule rule = ruleService.getById(row.getRuleId());
                if (rule != null) {
                    alertItem.put("unblockMethod",
                            StringUtils.hasText(rule.getUnblockMethod()) ? rule.getUnblockMethod().trim() : "");
                    alertItem.put("canSelfUnblock",
                            ruleService.canSelfUnblock(row.getId(), row.getTargetUserId().trim(), row.getRuleId()));
                }
            }
            alertItem.put("createdAt", row.getCreatedAt() != null ? row.getCreatedAt().toString() : null);
            attachObligationDeepLink(alertItem, row.getId());
            mobileUserSocketPushService.pushAlertItem(row.getTargetUserId().trim(), alertItem);
        } catch (Exception e) {
            log.warn("[student-violation] 推送 H5 通知失败 userId={} id={}: {}",
                    row.getTargetUserId(), row.getId(), e.getMessage());
        }
    }

    /** 笼位联动违规创建后广播到管理端灵动岛 */
    private void broadcastCageNoticeAlert(TwinStudentViolation row) {
        if (socketServer == null) return;
        try {
            Map<String, Object> alert = new LinkedHashMap<>();
            alert.put("alertId", "cage_" + row.getId());
            alert.put("violationId", row.getId());
            alert.put("targetUserId", row.getTargetUserId());
            alert.put("title", resolveCageNoticeTitle(row));
            String plainBody = row.getViolationText() != null
                    ? row.getViolationText().replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").trim()
                    : "";
            alert.put("body", plainBody.length() > 80 ? plainBody.substring(0, 80) + "…" : plainBody);
            alert.put("createdAt", row.getCreatedAt() != null ? row.getCreatedAt().toString() : "");
            socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent("CAGE_NOTICE_ALERT", alert);
        } catch (Exception e) {
            log.warn("[cage-notice] 广播灵动岛失败 violationId={}: {}", row.getId(), e.getMessage());
        }
    }

    /** 同步写入 sys_student_notification 表，确保 /student/notifications 消息中心可查询 */
    private void persistStudentNotification(TwinStudentViolation row) {
        if (studentNotificationMapper == null || row == null || !StringUtils.hasText(row.getTargetUserId())) {
            return;
        }
        try {
            StudentNotification sn = new StudentNotification();
            sn.setId("SNF_" + UUID.randomUUID().toString().replace("-", ""));
            sn.setTitle("CAGE_STATUS".equals(row.getSource()) ? resolveCageNoticeTitle(row) : "违规提醒");
            String body = applyTemplateVariables(row.getViolationText(), row.getTargetUserId());
            String plainText = body != null ? body.replaceAll("<[^>]+>", " ") : "";
            String trimmed = plainText.replaceAll("\\s+", " ").trim();
            sn.setSummary(trimmed.length() > 200 ? trimmed.substring(0, 200) + "..." : trimmed);
            sn.setContent(body);
            sn.setType("PLATFORM");
            sn.setBizType(ViolationMirrorNotificationSupport.BIZ_TYPE);
            sn.setBizId(ViolationMirrorNotificationSupport.bizId(row.getId()));
            sn.setRecipientUserId(row.getTargetUserId().trim());
            Long obligationId = resolveObligationId(row.getId());
            if (obligationId != null && obligationId > 0) {
                sn.setSourceUrl(ViolationMirrorNotificationSupport.h5SourceUrl(obligationId));
            }
            sn.setIsRead(0);
            sn.setCreateTime(row.getCreatedAt() != null ? row.getCreatedAt() : LocalDateTime.now());
            studentNotificationMapper.insert(sn);
        } catch (Exception e) {
            log.warn("[student-violation] 写入通知中心失败 userId={} id={}: {}",
                    row.getTargetUserId(), row.getId(), e.getMessage());
        }
    }

    private Long resolveObligationId(Long violationId) {
        if (obligationService == null || violationId == null || violationId <= 0) {
            return null;
        }
        try {
            TwinObligation ob = obligationService.findByViolationId(violationId);
            return ob != null ? ob.getId() : null;
        } catch (Exception e) {
            return null;
        }
    }

    private void attachObligationDeepLink(Map<String, Object> item, Long violationId) {
        if (item == null) {
            return;
        }
        Long obligationId = resolveObligationId(violationId);
        if (obligationId == null || obligationId <= 0) {
            return;
        }
        item.put("obligationId", obligationId);
        item.put("sourceUrl", ViolationMirrorNotificationSupport.h5SourceUrl(obligationId));
        item.put("mpPath", ViolationMirrorNotificationSupport.mpPath(obligationId));
    }

    /** C-T1：终态 / 硬删除时撤回镜像通知（按 bizType+bizId） */
    private void withdrawMirrorNotification(long violationId) {
        if (studentNotificationMapper == null || violationId <= 0) {
            return;
        }
        try {
            int n = studentNotificationMapper.deleteByBiz(
                    ViolationMirrorNotificationSupport.BIZ_TYPE,
                    ViolationMirrorNotificationSupport.bizId(violationId));
            if (n > 0) {
                log.info("[student-violation] 已撤回镜像通知 violationId={} rows={}", violationId, n);
            }
        } catch (Exception e) {
            log.warn("[student-violation] 撤回镜像通知失败 id={}: {}", violationId, e.getMessage());
        }
    }

    private void withdrawMirrorNotifications(List<Long> violationIds) {
        if (violationIds == null || violationIds.isEmpty()) {
            return;
        }
        for (Long id : violationIds) {
            if (id != null) {
                withdrawMirrorNotification(id);
            }
        }
    }

    /** ACTIVE 编辑：同步更新镜像正文，保留未读状态 */
    private void syncMirrorNotificationContent(TwinStudentViolation row) {
        if (studentNotificationMapper == null || row == null || row.getId() == null) {
            return;
        }
        try {
            String title = "CAGE_STATUS".equals(row.getSource()) ? resolveCageNoticeTitle(row) : "违规提醒";
            String body = applyTemplateVariables(row.getViolationText(), row.getTargetUserId());
            String plainText = body != null ? body.replaceAll("<[^>]+>", " ") : "";
            String trimmed = plainText.replaceAll("\\s+", " ").trim();
            String summary = trimmed.length() > 200 ? trimmed.substring(0, 200) + "..." : trimmed;
            studentNotificationMapper.updateContentByBiz(
                    ViolationMirrorNotificationSupport.BIZ_TYPE,
                    ViolationMirrorNotificationSupport.bizId(row.getId()),
                    title,
                    summary,
                    body);
        } catch (Exception e) {
            log.warn("[student-violation] 同步镜像通知正文失败 id={}: {}", row.getId(), e.getMessage());
        }
    }

    /**
     * 批量新建违规：每人独立 INSERT 一条 ACTIVE（不覆盖同人既有 ACTIVE）。
     *
     * @return createdCount、failed（userId + message）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createBatch(
            List<String> targetUserIds,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId
    ) {
        return createBatch(
                targetUserIds,
                violationText,
                imageUrls,
                forbidEnter,
                maxEnterSuccess,
                showNoticeEveryScan,
                expireAfterDays,
                createdByUserId,
                null,
                null,
                null);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createBatch(
            List<String> targetUserIds,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId,
            String interactiveChallenge
    ) {
        return createBatch(
                targetUserIds,
                violationText,
                imageUrls,
                forbidEnter,
                maxEnterSuccess,
                showNoticeEveryScan,
                expireAfterDays,
                createdByUserId,
                interactiveChallenge,
                null,
                null);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createBatch(
            List<String> targetUserIds,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId,
            String interactiveChallenge,
            Boolean interactiveUnlockOnVerify
    ) {
        return createBatch(
                targetUserIds,
                violationText,
                imageUrls,
                forbidEnter,
                maxEnterSuccess,
                showNoticeEveryScan,
                expireAfterDays,
                createdByUserId,
                interactiveChallenge,
                interactiveUnlockOnVerify,
                null);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createBatch(
            List<String> targetUserIds,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            Integer expireAfterDays,
            String createdByUserId,
            String interactiveChallenge,
            Boolean interactiveUnlockOnVerify,
            Long ruleId
    ) {
        if (targetUserIds == null || targetUserIds.isEmpty()) {
            throw new IllegalArgumentException("缺少 targetUserIds");
        }
        Set<String> unique = new LinkedHashSet<>();
        for (String id : targetUserIds) {
            if (StringUtils.hasText(id)) {
                unique.add(id.trim());
            }
        }
        if (unique.isEmpty()) {
            throw new IllegalArgumentException("缺少有效的 targetUserId");
        }
        if (unique.size() > 200) {
            throw new IllegalArgumentException("单次批量最多 200 人");
        }
        List<Map<String, String>> failed = new ArrayList<>();
        int created = 0;
        for (String tid : unique) {
            try {
                create(
                        tid,
                        violationText,
                        imageUrls,
                        forbidEnter,
                        maxEnterSuccess,
                        showNoticeEveryScan,
                        expireAfterDays,
                        createdByUserId,
                        "MANUAL",
                        interactiveChallenge,
                        interactiveUnlockOnVerify,
                        ruleId,
                        null
                );
                created++;
            } catch (Exception e) {
                Map<String, String> f = new HashMap<>();
                f.put("userId", tid);
                String msg = e.getMessage();
                f.put("message", msg != null && !msg.isBlank() ? msg : "创建失败");
                failed.add(f);
            }
        }
        Map<String, Object> out = new HashMap<>();
        out.put("createdCount", created);
        out.put("failed", failed);
        return out;
    }

    public boolean clear(long id, String clearedByUserId) {
        if (violationTableAbsent.get()) {
            return false;
        }
        touchExpireStale();
        if (violationTableAbsent.get()) {
            return false;
        }
        try {
            TwinStudentViolation existing = violationMapper.selectById(id);
            Long cageParentId = existing != null ? existing.getCageViolationId() : null;
            boolean ok = violationMapper.updateClearById(id, clearedByUserId) > 0;
            if (ok) {
                withdrawMirrorNotification(id);
                markObligationRevoked(id);
                maybeClearOrphanCageParent(cageParentId);
            }
            return ok;
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return false;
            }
            throw e;
        }
    }

    /**
     * 标记「已处理」：记录仍保留，但不再是 ACTIVE，扫码弹窗不再展示该条。
     */
    public boolean markProcessed(long id, String operatorUserId) {
        if (violationTableAbsent.get()) {
            return false;
        }
        touchExpireStale();
        if (violationTableAbsent.get()) {
            return false;
        }
        try {
            TwinStudentViolation existing = violationMapper.selectById(id);
            Long cageParentId = existing != null ? existing.getCageViolationId() : null;
            boolean ok = violationMapper.markProcessedById(id, operatorUserId != null ? operatorUserId : "ADMIN") > 0;
            if (ok) {
                withdrawMirrorNotification(id);
                markObligationRevoked(id);
                maybeClearOrphanCageParent(cageParentId);
            }
            return ok;
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return false;
            }
            throw e;
        }
    }

    public TwinStudentViolation getById(long id) {
        if (violationTableAbsent.get()) {
            return null;
        }
        touchExpireStale();
        if (violationTableAbsent.get()) {
            return null;
        }
        try {
            return violationMapper.selectById(id);
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return null;
            }
            throw new RuntimeException(e);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public TwinStudentViolation update(
            long id,
            String violationText,
            List<String> imageUrls,
            boolean forbidEnter,
            Integer maxEnterSuccess,
            boolean showNoticeEveryScan,
            String expireMode,
            Integer expireAfterDays,
            String interactiveChallenge,
            Boolean interactiveUnlockOnVerify
    ) {
        if (violationTableAbsent.get()) {
            throw new IllegalStateException("库表 twin_student_violation 未创建：请开启 app.schema.auto-ensure-embedded-core-ddl（默认 true）并赋予数据源建表权限，或手工执行 scripts/student_violation.ddl.sql 后重启。");
        }
        TwinStudentViolation existing = getById(id);
        if (existing == null) {
            throw new IllegalArgumentException("记录不存在: " + id);
        }
        if (maxEnterSuccess != null && maxEnterSuccess < 0) {
            throw new IllegalArgumentException("进入次数上限不能为负数");
        }
        TwinStudentViolation row = new TwinStudentViolation();
        row.setId(id);
        ContentJsonSupport.Resolved content = ContentJsonSupport.resolve(objectMapper, null, violationText, true);
        row.setViolationText(content.contentHtml());
        row.setContentJson(content.contentJson());
        row.setImageUrls(serializeImageUrls(imageUrls));
        String newChallenge = normalizeInteractiveChallenge(interactiveChallenge);
        String oldChallenge = normalizeInteractiveChallenge(existing.getInteractiveChallenge());
        boolean challengeChanged = !Objects.equals(newChallenge, oldChallenge);
        row.setInteractiveChallenge(newChallenge);
        int unlockOnVerify = resolveInteractiveUnlockOnVerify(newChallenge, interactiveUnlockOnVerify);
        row.setInteractiveUnlockOnVerify(unlockOnVerify);
        boolean effectiveForbidEnter = resolveManualForbidEnter(forbidEnter, interactiveChallenge);
        if (challengeChanged) {
            row.setInteractiveChallengeVerifiedAt(null);
            row.setForbidEnter(effectiveForbidEnter ? 1 : 0);
        } else if (existing.getInteractiveChallengeVerifiedAt() != null) {
            row.setInteractiveChallengeVerifiedAt(existing.getInteractiveChallengeVerifiedAt());
            row.setForbidEnter(effectiveForbidEnter ? 1 : 0);
        } else {
            row.setForbidEnter(effectiveForbidEnter ? 1 : 0);
        }
        row.setMaxEnterSuccess(maxEnterSuccess);
        row.setShowNoticeEveryScan(showNoticeEveryScan ? 1 : 0);
        String mode = expireMode != null ? expireMode.trim().toUpperCase() : "KEEP";
        // 到期时间与「验证后解禁」可并存：仅编辑显式 CLEAR 才清空（到期后已验证者自动消弹窗）
        if ("CLEAR".equals(mode)) {
            row.setExpireAt(null);
        } else if ("RELATIVE".equals(mode) && expireAfterDays != null && expireAfterDays > 0) {
            row.setExpireAt(LocalDateTime.now().plusDays(expireAfterDays));
        } else {
            row.setExpireAt(existing.getExpireAt());
        }
        try {
            int n = violationMapper.updateEditableById(row);
            if (n <= 0) {
                throw new IllegalStateException("更新失败，记录可能已被删除");
            }
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                throw new IllegalStateException("库表 twin_student_violation 未创建：请开启 app.schema.auto-ensure-embedded-core-ddl（默认 true）并赋予数据源建表权限，或手工执行 scripts/student_violation.ddl.sql 后重启。");
            }
            throw new RuntimeException(e);
        }
        TwinStudentViolation updated = getById(id);
        if (updated != null && STATUS_ACTIVE.equals(updated.getStatus())) {
            syncMirrorNotificationContent(updated);
            syncObligationFromCreated(updated);
        }
        return updated;
    }

    public boolean delete(long id) {
        if (violationTableAbsent.get()) {
            return false;
        }
        touchExpireStale();
        if (violationTableAbsent.get()) {
            return false;
        }
        try {
            TwinStudentViolation existing = violationMapper.selectById(id);
            Long cageParentId = existing != null ? existing.getCageViolationId() : null;
            boolean ok = violationMapper.deleteById(id) > 0;
            if (ok) {
                withdrawMirrorNotification(id);
                markObligationRevoked(id);
                maybeClearOrphanCageParent(cageParentId);
            }
            return ok;
        } catch (Exception e) {
            if (isTwinStudentViolationTableMissing(e)) {
                markTableAbsentOnce();
                return false;
            }
            throw new RuntimeException(e);
        }
    }

    /**
     * T1-2：删光子记录后，若父记录仍为 ACTIVE 且已无 ACTIVE 子记录，则清为 CLEARED，
     * 避免去重命中导致该笼位永不重新判定。
     */
    private void maybeClearOrphanCageParent(Long cageParentId) {
        if (cageParentId == null || cageStatusViolationMapper == null) {
            return;
        }
        try {
            TwinCageStatusViolation parent = cageStatusViolationMapper.selectById(cageParentId);
            if (parent == null || !"ACTIVE".equals(parent.getStatus())) {
                return;
            }
            List<TwinStudentViolation> children = violationMapper.selectByCageViolationId(cageParentId);
            boolean anyActive = children != null && children.stream()
                    .anyMatch(c -> c != null && STATUS_ACTIVE.equals(c.getStatus()));
            if (!anyActive) {
                cageStatusViolationMapper.updateStatus(cageParentId, "CLEARED");
                log.info("[student-violation] 笼架父记录无 ACTIVE 子记录，已 CLEARED parentId={}", cageParentId);
            }
        } catch (Exception e) {
            log.warn("[student-violation] 清理空笼架父记录失败 parentId={}: {}", cageParentId, e.getMessage());
        }
    }

    private void syncObligationFromCreated(TwinStudentViolation row) {
        if (obligationService == null || row == null) {
            return;
        }
        obligationService.syncFromViolationCreated(row);
    }

    private void completeObligationDisposition(long violationId, String subjectUserId, String answer) {
        if (obligationService == null) {
            return;
        }
        obligationService.completeViolationDisposition(
                violationId, subjectUserId, ObligationSupport.CHANNEL_SCAN, answer);
    }

    private void markObligationExpired(long violationId) {
        if (obligationService == null) {
            return;
        }
        obligationService.markViolationExpired(violationId);
    }

    private void markObligationRevoked(long violationId) {
        if (obligationService == null) {
            return;
        }
        obligationService.markViolationRevoked(violationId);
    }

    private List<String> parseImageUrls(String json) {
        if (!StringUtils.hasText(json)) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {
            });
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    private String serializeImageUrls(List<String> urls) {
        if (urls == null || urls.isEmpty()) {
            return "[]";
        }
        try {
            return objectMapper.writeValueAsString(urls);
        } catch (Exception e) {
            return "[]";
        }
    }

    private static boolean computeEnterLocked(TwinStudentViolation row) {
        if (row == null || !STATUS_ACTIVE.equals(row.getStatus())) {
            return false;
        }
        Integer max = row.getMaxEnterSuccess();
        int used = row.getEnterSuccessCount() == null ? 0 : row.getEnterSuccessCount();
        if (max != null && used >= max) {
            return true;
        }
        if (StringUtils.hasText(row.getInteractiveChallenge())
                && row.getInteractiveChallengeVerifiedAt() == null) {
            return true;
        }
        if (row.getForbidEnter() != null && row.getForbidEnter() == 1) {
            return true;
        }
        return false;
    }

    private static String normalizeInteractiveChallenge(String interactiveChallenge) {
        if (!StringUtils.hasText(interactiveChallenge)) {
            return null;
        }
        String trimmed = interactiveChallenge.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** 手动新建/编辑：填写交互式短语时须同步立即禁入；可仅开禁入、不开交互 */
    private static boolean resolveManualForbidEnter(boolean forbidEnter, String interactiveChallenge) {
        return forbidEnter || StringUtils.hasText(normalizeInteractiveChallenge(interactiveChallenge));
    }

    private static int resolveInteractiveUnlockOnVerify(String interactiveChallenge, Boolean unlockOnVerify) {
        if (!StringUtils.hasText(interactiveChallenge)) {
            return 0;
        }
        return Boolean.FALSE.equals(unlockOnVerify) ? 0 : 1;
    }

    private static boolean isInteractiveUnlockOnVerify(TwinStudentViolation row) {
        if (row == null || !StringUtils.hasText(row.getInteractiveChallenge())) {
            return false;
        }
        return row.getInteractiveUnlockOnVerify() == null || row.getInteractiveUnlockOnVerify() == 1;
    }

    private static Integer computeRemaining(TwinStudentViolation row) {
        Integer max = row.getMaxEnterSuccess();
        if (max == null) {
            return null;
        }
        int used = row.getEnterSuccessCount() == null ? 0 : row.getEnterSuccessCount();
        return Math.max(0, max - used);
    }
}
