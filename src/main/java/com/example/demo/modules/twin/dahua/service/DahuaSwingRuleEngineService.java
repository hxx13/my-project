package com.example.demo.modules.twin.dahua.service;

import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelCacheMapper;
import com.example.demo.modules.notification.push.dispatch.PushService;
import com.example.demo.modules.twin.dahua.entity.DahuaActivationState;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.common.service.TwinAutomationLogService;
import com.example.demo.modules.twin.dahua.entity.DahuaSwingRecord;
import com.example.demo.modules.twin.dahua.mapper.DahuaSwingMapper;
import com.example.demo.modules.twin.dahua.support.DahuaSwingEnterExitSupport;
import com.example.demo.modules.twin.common.support.TwinActivationLinkageLabels;
import com.example.demo.modules.twin.common.support.TwinSwingLinkageDetailBuilder;
import com.example.demo.modules.student.service.MobilePresenceNotifyService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 大华刷卡联动：签退延时、激活卡片、激活后再次刷门签退、扫码后「待激活」超时签退。
 * <p>「激活超时(秒)」仅约束扫码下发后至首次刷激活门之前；刷激活门成功后不再为该规则排程到期自动离开。</p>
 *
 * <p>关键一致性约束（与 TwinScanController 人工离开对齐，避免只清 ARO/只清大华之一）：</p>
 * <ul>
 *   <li>所有「自动离开」最终须走 {@link DahuaAutoSignoutService#autoSignout}：先 ARO 离开；是否再大华 revoke 与冻结由门禁联动规则 {@code autoRiskActionEnabled} 唯一控制。</li>
 *   <li>人工扫码离开(accessType=2) 成功后必须 {@link #clearActivationStatesForUser}，避免定时任务重复签退。</li>
 *   <li>免冻结（{@code freeze_exempt_flag=1}）仅豁免最终「冻结卡片」步骤（见 {@link DahuaAutoSignoutService#runRiskActions}），不跳过待激活计时、刷卡激活与延时签退联动。</li>
 *   <li>同一物理门可同时出现在「激活卡片」与「激活后再刷门签退」：未激活时须先按激活门处理，不得因仅命中后者而丢弃刷卡。</li>
 *   <li>「刷门即签退」须在「激活卡片规则」已成功（userId 存在 ACTIVATED）后才可排延时签退；未激活时若门亦在激活组则走激活逻辑。</li>
 * </ul>
 */
@Service
public class DahuaSwingRuleEngineService {
    private static final Logger log = LoggerFactory.getLogger(DahuaSwingRuleEngineService.class);
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final long GLOBAL_RULE_TASK_ID = 0L;
    /** 占位通道：扫码 batchAuthority 成功后，等待用户刷「激活卡片规则」门组的倒计时行 */
    public static final String PENDING_ACTIVATION_CHANNEL = TwinActivationLinkageLabels.PENDING_ACTIVATION_CHANNEL;

    /** 激活后多少秒内禁止签退（环境变量 app.dahua-swing.min-signoff-after-activation-seconds，默认 0=不限制） */
    @Value("${app.dahua-swing.min-signoff-after-activation-seconds:0}")
    private int minSignoffAfterActivationSeconds;

    private final DahuaSwingMapper dahuaSwingMapper;
    private final DahuaAutoSignoutService dahuaAutoSignoutService;
    private final DahuaSwingRuleConfigService dahuaSwingRuleConfigService;
    private final TwinCardMappingService twinCardMappingService;
    private final TwinAutomationLogService twinAutomationLogService;
    private final DahuaDeviceChannelCacheMapper dahuaDeviceChannelCacheMapper;
    private final MobilePresenceNotifyService mobilePresenceNotifyService;

    private final PushService pushService;

    public DahuaSwingRuleEngineService(
            DahuaSwingMapper dahuaSwingMapper,
            DahuaAutoSignoutService dahuaAutoSignoutService,
            DahuaSwingRuleConfigService dahuaSwingRuleConfigService,
            TwinCardMappingService twinCardMappingService,
            TwinAutomationLogService twinAutomationLogService,
            DahuaDeviceChannelCacheMapper dahuaDeviceChannelCacheMapper,
            MobilePresenceNotifyService mobilePresenceNotifyService,
            PushService pushService
    ) {
        this.dahuaSwingMapper = dahuaSwingMapper;
        this.dahuaAutoSignoutService = dahuaAutoSignoutService;
        this.dahuaSwingRuleConfigService = dahuaSwingRuleConfigService;
        this.twinCardMappingService = twinCardMappingService;
        this.twinAutomationLogService = twinAutomationLogService;
        this.dahuaDeviceChannelCacheMapper = dahuaDeviceChannelCacheMapper;
        this.mobilePresenceNotifyService = mobilePresenceNotifyService;
        this.pushService = pushService;
    }

    private void notifyMobilePresence(String userId, String reason) {
        if (mobilePresenceNotifyService == null || userId == null || userId.isBlank()) {
            return;
        }
        mobilePresenceNotifyService.notifyPresenceChanged(userId, reason);
    }

    private void notifyTimerCleared(String userId, String scope) {
        if (mobilePresenceNotifyService == null || userId == null || userId.isBlank()) {
            return;
        }
        mobilePresenceNotifyService.notifyTimerCleared(userId, scope);
    }

    /**
     * 扫码进房（ARO 已成功）后调用：若配置了「激活卡片规则」门组，则启动「待激活」超时倒计时。
     * <p>前置条件：人员须在孪生「大华发卡」映射表 {@code twin_card_mapping} 中存在且具备
     * 卡号、{@code dahua_seq}、{@code dahua_person_code}（见 {@link TwinCardMappingService#hasDahuaIssuedTwinMapping}）；
     * 纯 ARO 选用、未大华发卡落库者不起算，避免无效计时与误触发自动签退。</p>
     * <p>与 {@link com.example.demo.modules.accessrule.service.AccessRuleDispatchService#tryApplyAccessForScanEnter} 是否实际调用大华 batch 无关；
     * 全局关闭「进入时门禁联动」时仍可对已发卡人员起算本倒计时。</p>
     * 超时时刻到达时由 {@link #processDueStates} 触发完整自动离开（无额外签退延时，直接按预定时刻执行）。
     */
    public void startPendingActivationAfterAccessRuleGrant(String userId) {
        String uid = str(userId);
        if (uid.isBlank()) {
            return;
        }
        if (!twinCardMappingService.hasDahuaIssuedTwinMapping(uid)) {
            log.info("[swing-rule] skip-pending-activation no-dahua-issued-mapping userId={}", uid);
            return;
        }
        Map<String, Object> rules = dahuaSwingRuleConfigService.getConfig();
        List<String> toggleChannels = strList(rules.get("toggleChannelCodes"));
        if (toggleChannels.isEmpty()) {
            return;
        }
        int activationExpire = intv(rules.get("activationExpireSeconds"), 120);
        LocalDateTime now = LocalDateTime.now();
        // 新一次权限下发 = 新激活窗口：软清理旧计时器
        dahuaSwingMapper.deactivateExpiredOrPendingStatesByUserId(uid);
        DahuaActivationState pending = new DahuaActivationState();
        pending.setTaskId(GLOBAL_RULE_TASK_ID);
        pending.setUserId(uid);
        pending.setChannelCode(PENDING_ACTIVATION_CHANNEL);
        pending.setState("PENDING_ACTIVATION");
        pending.setCounter(0);
        pending.setLastSwipeAt(fmt(now));
        pending.setScheduledExitAt(fmt(now.plusSeconds(Math.max(1, activationExpire))));
        pending.setDebounceUntil(null);
        dahuaSwingMapper.upsertActivationState(pending);
        debug(TwinAutomationLogService.SWING_DEBUG_PENDING_CREATED, uid, PENDING_ACTIVATION_CHANNEL,
                "待激活计时器创建：userId=" + uid
                + " | 时间限制=" + activationExpire + "秒"
                + " | 到期时间=" + pending.getScheduledExitAt()
                + " | 当前状态快照：" + buildStateSnapshot(uid));
        log.info("[swing-rule] pending-activation-start userId={} expireSeconds={} scheduleAt={}",
                uid, activationExpire, pending.getScheduledExitAt());
        // 初次「待激活」计时开始：ACCESS_TRACE，便于与激活成功、自动离开区分
        twinAutomationLogService.write(
                TwinAutomationLogService.TYPE_ACCESS_TRACE,
                "LINKAGE_STEP",
                "SYSTEM",
                TwinAutomationLogService.SWING_PENDING_ACTIVATION_TIMER_START,
                uid,
                null,
                true,
                "待激活计时：" + activationExpire + " 秒内须刷激活门；到期「" + pending.getScheduledExitAt() + "」。",
                "dahua-swing-rule"
        );
        notifyMobilePresence(uid, "pending_activation");
    }

    /**
     * 独立于拉取任务的节拍：避免仅依赖 15s 轮询尾部才处理到期签退。
     */
    @Scheduled(fixedDelayString = "${app.dahua-swing.due-process-ms:5000}", scheduler = "twinSwingTaskScheduler")
    public void scheduledProcessDueStates() {
        processDueStates();
    }

    /**
     * 与拉取层「已 mapping 的 record 不再入队」配合；同步避免并发双写同一用户联动行。
     */
    public synchronized void onRecordIngested(DahuaSwingRecord record) {
        Map<String, Object> rules = dahuaSwingRuleConfigService.getConfig();
        // 合法性校验：mappingHit=1 且 openType=51（合法刷卡=开门成功）；非法刷卡（openType=52）不联动
        if (record.getMappingHit() == null || record.getMappingHit() != 1) {
            return;
        }
        if (!Integer.valueOf(51).equals(record.getOpenType())) {
            return;
        }
        String userId = str(record.getMappingUserId());
        if (userId.isBlank()) {
            return;
        }
        String channelCode = str(record.getChannelCode());
        int exitDelay = intv(rules.get("autoExitDelaySeconds"), 10);
        List<String> enterActivationChannels = strList(rules.get("toggleChannelCodes"));
        List<String> agnosticActivationChannels = strList(rules.get("directionAgnosticActivationChannelCodes"));
        List<String> signoffChannels = mergeSignoffChannels(
                strList(rules.get("exitChannelCodes")),
                strList(rules.get("activatedReswipeExitChannelCodes")));

        boolean hitEnterActivation = !enterActivationChannels.isEmpty() && enterActivationChannels.contains(channelCode);
        boolean hitAgnosticActivation = !agnosticActivationChannels.isEmpty() && agnosticActivationChannels.contains(channelCode);
        boolean hitSignoff = !signoffChannels.isEmpty() && signoffChannels.contains(channelCode);
        if (!hitEnterActivation && !hitAgnosticActivation && !hitSignoff) {
            return;
        }

        String recordId = str(record.getRecordId());
        log.debug("[swing-rule] record-received userId={} channel={} recordId={} swingTime={} enter={} agnostic={} signoff={}",
                userId, channelCode, recordId, str(record.getSwingTime()),
                hitEnterActivation, hitAgnosticActivation, hitSignoff);
        if (!recordId.isBlank()) {
            // 原子认领：首次处理标记 processed_at，重复记录（已处理过）返回 0 直接跳过
            int claimed = dahuaSwingMapper.markRecordProcessed(recordId);
            if (claimed == 0) {
                log.debug("[swing-rule] skip-already-processed userId={} recordId={} channel={}",
                        userId, recordId, channelCode);
                return;
            }
        }

        // 方向分流：方向无关激活门不看方向；进入方向激活门看=1；签退门看=2
        Integer dir = DahuaSwingEnterExitSupport.resolve(record);
        boolean asActivation = hitAgnosticActivation
                || (hitEnterActivation && Integer.valueOf(1).equals(dir));
        boolean asSignoff = hitSignoff && Integer.valueOf(2).equals(dir);
        if (asActivation) {
            processActivation(record, userId, channelCode, recordId);
            return;
        }
        if (asSignoff) {
            processSignoff(record, userId, channelCode, recordId, exitDelay);
            return;
        }
        // 方向不匹配或方向缺失（非方向无关门）→ 忽略（已标记 processed_at，不会被重拉）
        log.debug("[swing-rule] ignore-direction-mismatch userId={} channel={} recordId={}",
                userId, channelCode, recordId);
    }

    /** 激活流程：进入方向激活门 / 方向无关激活门命中 */
    private void processActivation(DahuaSwingRecord record, String userId, String channelCode, String recordId) {
        // 签退进行中：禁止再次激活，避免清空 scheduled_exit_at 导致无法自动签退
        if (dahuaSwingMapper.countAutoExitScheduledForUser(GLOBAL_RULE_TASK_ID, userId) > 0) {
            log.debug("[swing-rule] skip-activation-during-exit-scheduled userId={} channel={} recordId={}",
                    userId, channelCode, recordId);
            return;
        }
        boolean alreadyActivated = dahuaSwingMapper.countActivatedStatesForUser(GLOBAL_RULE_TASK_ID, userId) > 0;
        boolean hasPending = dahuaSwingMapper.existsPendingActivationForUser(
                GLOBAL_RULE_TASK_ID, userId, PENDING_ACTIVATION_CHANNEL) > 0;
        // 无待激活计时器且未激活：禁止刷门直接激活（须先扫码进入起算 PENDING_ACTIVATION）
        if (!alreadyActivated && !hasPending) {
            log.debug("[swing-rule] skip-activation-without-pending userId={} channel={} recordId={}",
                    userId, channelCode, recordId);
            return;
        }
        // 时间方向校验：刷卡时间必须晚于待激活计时器创建时间（幽灵激活防护）
        if (!alreadyActivated) {
            DahuaActivationState pendingRow = dahuaSwingMapper.findActivationState(
                    GLOBAL_RULE_TASK_ID, userId, PENDING_ACTIVATION_CHANNEL);
            if (pendingRow != null) {
                LocalDateTime pendingSince = parse(pendingRow.getLastSwipeAt());
                LocalDateTime recordTime = parse(record.getSwingTime());
                if (pendingSince != null && recordTime != null && recordTime.isBefore(pendingSince)) {
                    log.debug("[swing-rule] skip-stale-record-for-pending-activation userId={} channel={} recordTime={} pendingSince={}",
                            userId, channelCode, record.getSwingTime(), pendingRow.getLastSwipeAt());
                    return;
                }
            }
        }
        // 消费待激活计时器
        int pendingRemoved = dahuaSwingMapper.deleteActivationStateByUserTaskAndChannel(
                GLOBAL_RULE_TASK_ID, userId, PENDING_ACTIVATION_CHANNEL);
        if (pendingRemoved > 0) {
            notifyTimerCleared(userId, "pending_activation");
        }
        LocalDateTime now = LocalDateTime.now();
        DahuaActivationState state = dahuaSwingMapper.findActivationState(GLOBAL_RULE_TASK_ID, userId, channelCode);
        if (state == null) {
            state = newStateRow(userId, channelCode);
            state.setCounter(0);
            state.setState("IDLE");
        }
        int counter = state.getCounter() == null ? 0 : state.getCounter();
        counter++;
        state.setCounter(counter);
        state.setLastSwipeAt(fmt(now));
        // 已激活（任意门）→ 跳过，防止换门重复通知
        if (alreadyActivated) {
            dahuaSwingMapper.upsertActivationState(state);
            log.debug("[swing-rule] skip-duplicate-activation userId={} channel={} recordId={}",
                    userId, channelCode, recordId);
            return;
        }
        state.setState("ACTIVATED");
        state.setActivatedAt(fmt(now));
        // 激活成功后不再写 scheduled_exit_at：避免「激活超时」被复用为激活后宽限导致到期自动签退
        state.setScheduledExitAt(null);
        dahuaSwingMapper.upsertActivationState(state);
        debug(TwinAutomationLogService.SWING_DEBUG_STATE_TRANSITION, userId, channelCode,
                "[recordId=" + recordId + "] 状态变更：→ ACTIVATED"
                + " | activated_at=" + fmt(now)
                + " | 原PENDING_ACTIVATION已清除=" + (pendingRemoved > 0 ? "是" : "否")
                + " | 当前状态快照：" + buildStateSnapshot(userId));
        String doorLabel = resolveChannelDisplayName(channelCode);
        String actDetail = TwinSwingLinkageDetailBuilder.activationSuccessDetail(doorLabel, channelCode);
        twinAutomationLogService.write(
                TwinAutomationLogService.TYPE_ACCESS_TRACE,
                "LINKAGE_STEP",
                "SYSTEM",
                TwinAutomationLogService.SWING_ACTIVATION_CARD_SUCCESS,
                userId,
                channelCode,
                true,
                actDetail,
                "dahua-swing-record"
        );
        notifyMobilePresence(userId, "activated");
        try { pushService.send("ACTIVATION_SUCCESS", Map.of("doorLabel", doorLabel, "channelCode", channelCode, "swingTime", fmt(now)), Set.of(userId)); } catch (Exception e) { log.warn("[Push] ACTIVATION_SUCCESS failed: {}", e.getMessage()); }
    }

    /** 签退流程：离开方向签退门命中，且人在场内（存在 ACTIVATED） */
    private void processSignoff(DahuaSwingRecord record, String userId, String channelCode, String recordId, int exitDelay) {
        boolean activated = dahuaSwingMapper.countActivatedStatesForUser(GLOBAL_RULE_TASK_ID, userId) > 0;
        if (!activated) {
            log.debug("[swing-rule] skip-signoff-until-activated userId={} channel={} recordId={}",
                    userId, channelCode, recordId);
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        String maxActivatedAt = dahuaSwingMapper.maxActivatedAtForUser(GLOBAL_RULE_TASK_ID, userId);
        if (maxActivatedAt != null && !maxActivatedAt.isBlank()) {
            LocalDateTime activatedAt = parse(maxActivatedAt);
            // 旧会话残留防护：刷卡时间早于最近一次激活时间 → 上一轮的旧记录，禁止签退。
            // （旧一轮的离开记录可能在 re-enter 后仍被 pull 重拉，靠时间方向拦截）
            if (activatedAt != null && record.getSwingTime() != null) {
                LocalDateTime swingTime = parse(record.getSwingTime());
                if (swingTime != null && swingTime.isBefore(activatedAt)) {
                    log.debug("[swing-rule] skip-signoff-stale-record userId={} channel={} swingTime={} activatedAt={}",
                            userId, channelCode, record.getSwingTime(), maxActivatedAt);
                    return;
                }
            }
            // 激活后 N 秒内禁止签退（防激活后立刻签退；环境变量 app.dahua-swing.min-signoff-after-activation-seconds，默认 0=不限制）
            if (activatedAt != null && minSignoffAfterActivationSeconds > 0
                    && now.isBefore(activatedAt.plusSeconds(minSignoffAfterActivationSeconds))) {
                log.info("[swing-rule] skip-signoff-min-interval userId={} channel={} activatedAt={} minSeconds={}",
                        userId, channelCode, maxActivatedAt, minSignoffAfterActivationSeconds);
                return;
            }
        }
        // 清理残留待激活计时器（防御性）
        dahuaSwingMapper.deleteActivationStateByUserTaskAndChannel(
                GLOBAL_RULE_TASK_ID, userId, PENDING_ACTIVATION_CHANNEL);
        // 软清理：将激活状态标记为 CLEANED（记录去重已由 processed_at 负责）
        dahuaSwingMapper.deactivateActivationStatesByUserId(userId);
        log.debug("[swing-rule] signoff-soft-clear userId={} channel={} recordId={}",
                userId, channelCode, recordId);
        DahuaActivationState exitState = newStateRow(userId, channelCode);
        exitState.setState("AUTO_EXIT_SCHEDULED");
        exitState.setScheduledExitAt(fmt(now.plusSeconds(Math.max(0, exitDelay))));
        exitState.setLastSwipeAt(fmt(now));
        exitState.setCounter(0);
        dahuaSwingMapper.upsertActivationState(exitState);
        debug(TwinAutomationLogService.SWING_DEBUG_TIMER_CREATED, userId, channelCode,
                "[recordId=" + recordId + "] 签退计时器创建：state=AUTO_EXIT_SCHEDULED"
                + " | 延迟=" + exitDelay + "秒"
                + " | 到期时间=" + exitState.getScheduledExitAt()
                + " | 触发规则=signoff（离开方向签退）"
                + " | 当前状态快照：" + buildStateSnapshot(userId));
        String doorLabelEx = resolveChannelDisplayName(channelCode);
        twinAutomationLogService.write(
                TwinAutomationLogService.TYPE_ACCESS_TRACE,
                "LINKAGE_STEP",
                "SYSTEM",
                TwinAutomationLogService.SWING_EXIT_DELAY_TIMER_STARTED,
                userId,
                channelCode,
                true,
                "延时签退：" + exitDelay + " 秒；计划「" + exitState.getScheduledExitAt() + "」；"
                        + (doorLabelEx.isBlank() ? "channel=" + channelCode : doorLabelEx),
                "dahua-swing-record"
        );
        try { pushService.send("SIGNOUT_COUNTDOWN", Map.of("countdownSeconds", String.valueOf(exitDelay), "scheduledExitAt", fmt(now.plusSeconds(exitDelay)), "doorLabel", doorLabelEx, "triggerReason", "EXIT_DELAY"), Set.of(userId)); } catch (Exception e) { log.warn("[Push] SIGNOUT_COUNTDOWN failed: {}", e.getMessage()); }
        notifyMobilePresence(userId, "auto_exit_scheduled");
    }

    /** 签退门 = exitChannelCodes ∪ activatedReswipeExitChannelCodes（去重、保序） */
    private List<String> mergeSignoffChannels(List<String> exitChannels, List<String> activatedReswipeExitChannels) {
        Set<String> merged = new java.util.LinkedHashSet<>();
        if (exitChannels != null) merged.addAll(exitChannels);
        if (activatedReswipeExitChannels != null) merged.addAll(activatedReswipeExitChannels);
        return new ArrayList<>(merged);
    }

    /**
     * 到期任务：须完整自动离开
     * 仅 autoSignout 成功时清空联动行，ARO 失败时保留 scheduled 行供下一 tick 重试。
     */
    private static final String LOCK_DUE_STATES = "dahua_process_due_states";

    /**
     * 到期任务：须完整自动离开。
     * <p>使用 MySQL 命名锁做跨实例互斥，不加 {@code synchronized}——
     * 避免阻塞 {@link #onRecordIngested} 导致刷卡事件排队乱序，引发签退规则被跳过。</p>
     */
    public void processDueStates() {
        int locked = dahuaSwingMapper.tryAcquireLock(LOCK_DUE_STATES, 0);
        if (locked != 1) {
            log.debug("[swing-rule] skip-process-due-states lock-not-acquired locked={}", locked);
            return;
        }
        try {
            processDueStatesInternal();
        } finally {
            dahuaSwingMapper.releaseLock(LOCK_DUE_STATES);
        }
    }

    private void processDueStatesInternal() {
        List<DahuaActivationState> dueStates = dahuaSwingMapper.listDueActivationStates(fmt(LocalDateTime.now()));
        if (dueStates != null && !dueStates.isEmpty()) {
            // 汇总DEBUG：到期扫描结果
            StringBuilder dueSummary = new StringBuilder("到期扫描：当前时间=" + fmt(LocalDateTime.now())
                    + " 到期行数=" + dueStates.size() + " 明细：");
            for (int i = 0; i < Math.min(dueStates.size(), 10); i++) {
                DahuaActivationState ds = dueStates.get(i);
                if (i > 0) dueSummary.append("；");
                dueSummary.append("[").append(ds.getUserId()).append("|").append(ds.getState())
                        .append("|").append(ds.getChannelCode()).append("|到期=").append(ds.getScheduledExitAt()).append("]");
            }
            if (dueStates.size() > 10) dueSummary.append(" …共" + dueStates.size() + "行");
            // 使用第一个到期行的userId和channel作为关联
            String firstUid = dueStates.get(0).getUserId();
            String firstCh = dueStates.get(0).getChannelCode();
            debug(TwinAutomationLogService.SWING_DEBUG_DUE_SCAN_START, firstUid, firstCh, dueSummary.toString());
        }
        Set<String> processedUsers = new HashSet<>();
        for (DahuaActivationState state : dueStates) {
            String userId = str(state.getUserId());
            if (userId.isBlank() || !processedUsers.add(userId)) {
                continue;
            }
            log.info("[swing-rule] due-auto-signout-trigger userId={} state={} channel={} scheduledExitAt={} lastSwipeAt={}",
                    userId,
                    state.getState(),
                    state.getChannelCode(),
                    state.getScheduledExitAt(),
                    state.getLastSwipeAt());
            Map<String, Object> rules = dahuaSwingRuleConfigService.getConfig();
            int activationExpire = intv(rules.get("activationExpireSeconds"), 120);
            int exitDelay = intv(rules.get("autoExitDelaySeconds"), 10);
            String st = str(state.getState());
            String ch = str(state.getChannelCode());
            String sched = str(state.getScheduledExitAt());
            String doorLabel = resolveChannelDisplayName(ch);
            String triggerReason;
            String linkageSnapshot;
            if ("PENDING_ACTIVATION".equalsIgnoreCase(st) && PENDING_ACTIVATION_CHANNEL.equals(ch)) {
                triggerReason = "ACTIVATION_EXPIRE_AUTO_SIGNOUT";
                linkageSnapshot = TwinSwingLinkageDetailBuilder.activationWaitTimerExpired(activationExpire, sched);
            } else if ("AUTO_EXIT_SCHEDULED".equalsIgnoreCase(st)) {
                triggerReason = "SWING_EXIT_DELAY_AUTO_SIGNOUT";
                linkageSnapshot = TwinSwingLinkageDetailBuilder.swingExitDelayTimerFired(doorLabel, ch, exitDelay, sched);
            } else {
                triggerReason = "ACTIVATION_EXPIRE_AUTO_SIGNOUT";
                linkageSnapshot = TwinActivationLinkageLabels.formatLinkageSnapshot(st, ch, sched);
            }
            String dueLogReason = mapDueStateToAccessTraceReason(st, ch);
            twinAutomationLogService.write(
                    TwinAutomationLogService.TYPE_ACCESS_TRACE,
                    "LINKAGE_STEP",
                    "TIMER",
                    dueLogReason,
                    userId,
                    ch,
                    true,
                    linkageSnapshot,
                    "dahua-swing-due"
            );
            boolean ok = dahuaAutoSignoutService.autoSignout(
                    userId,
                    "TIMER",
                    triggerReason,
                    linkageSnapshot
            );
            log.info("[swing-rule] due-auto-signout-result userId={} success={}", userId, ok);
            debug(TwinAutomationLogService.SWING_DEBUG_DUE_ROW, userId, ch,
                    "到期行处理完毕：[userId=" + userId + "] [state=" + st + "] [channel=" + ch + "]"
                    + " [scheduledExitAt=" + sched + "]"
                    + " | autoSignout结果=" + (ok ? "成功" : "失败")
                    + " | triggerReason=" + triggerReason
                    + " | 处理前状态快照：" + buildStateSnapshot(userId));
            if (ok) {
                // autoSignout 内部已通过 clearActivationStatesForUser 全量清理，无需额外逐行删除
                notifyMobilePresence(userId, "auto_signout");
            } else {
                int attempt = state.getCounter() == null ? 0 : state.getCounter();
                attempt++;
                state.setCounter(attempt);
                if (attempt > 5) {
                    log.warn("[swing-rule] due-auto-signout-max-retries userId={} attempts={} state={} channel={} — force-clean to prevent infinite retry",
                            userId, attempt, state.getState(), state.getChannelCode());
                    // autoSignout 失败且超过重试上限，软清理避免残留
                    dahuaSwingMapper.deactivateActivationStatesByUserId(userId);
                    notifyTimerCleared(userId, "auto_signout_failed");
                } else {
                    dahuaSwingMapper.upsertActivationState(state);
                    log.warn("[swing-rule] due-auto-signout-keep-state userId={} state={} channel={} scheduledExitAt={} attempt={}/5",
                            userId, state.getState(), state.getChannelCode(), state.getScheduledExitAt(), attempt);
                }
            }
        }
    }

    /** 给拉取层暴露配置，用于批量扫描时获取规则通道列表 */
    public Map<String, Object> getConfigForDiagnostics() {
        return dahuaSwingRuleConfigService.getConfig();
    }

    /**
     * 清理用户所有激活状态。使用软清理（state=CLEANED）而非物理删除，
     * 防止旧刷卡记录被重新拉取触发误签退。
     */
    public int clearActivationStatesForUser(String userId) {
        String uid = str(userId);
        if (uid.isBlank()) {
            return 0;
        }
        String preSnapshot = buildStateSnapshot(uid);
        int updated = dahuaSwingMapper.deactivateActivationStatesByUserId(uid);
        debug(TwinAutomationLogService.SWING_DEBUG_STATE_CLEARED, uid, null,
                "全量软清理：userId=" + uid
                + " | 影响行数=" + updated
                + " | 清理前状态：" + preSnapshot
                + " | 清理后状态：" + buildStateSnapshot(uid)
                + " | 调用来源：clearActivationStatesForUser");
        if (updated > 0) {
            notifyTimerCleared(uid, "all");
        }
        return updated;
    }

    /** 软清理到期/待激活状态（PENDING + AUTO_EXIT_SCHEDULED） */
    public int clearCompletedStatesForUser(String userId) {
        String uid = str(userId);
        if (uid.isBlank()) {
            return 0;
        }
        int updated = dahuaSwingMapper.deactivateExpiredOrPendingStatesByUserId(uid);
        if (updated > 0) {
            notifyTimerCleared(uid, "completed");
        }
        return updated;
    }

    private static DahuaActivationState newStateRow(String userId, String channelCode) {
        DahuaActivationState state = new DahuaActivationState();
        state.setTaskId(GLOBAL_RULE_TASK_ID);
        state.setUserId(userId);
        state.setChannelCode(channelCode);
        return state;
    }

    private static String str(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private static boolean boolv(Object v, boolean def) {
        if (v == null) {
            return def;
        }
        if (v instanceof Boolean b) {
            return b;
        }
        return "true".equalsIgnoreCase(String.valueOf(v));
    }

    private static int intv(Object v, int def) {
        if (v == null) {
            return def;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        try {
            return Integer.parseInt(String.valueOf(v));
        } catch (Exception ignore) {
            return def;
        }
    }

    @SuppressWarnings("unchecked")
    private static List<String> strList(Object v) {
        List<String> out = new ArrayList<>();
        if (!(v instanceof List<?> list)) {
            return out;
        }
        for (Object item : list) {
            String s = str(item);
            if (!s.isBlank()) {
                out.add(s);
            }
        }
        return out;
    }

    private static LocalDateTime parse(String v) {
        if (v == null || v.isBlank()) {
            return null;
        }
        try {
            return LocalDateTime.parse(v, DT);
        } catch (Exception e) {
            return null;
        }
    }

    private static String fmt(LocalDateTime t) {
        return t == null ? null : t.format(DT);
    }

    /** 到期行 → ACCESS_TRACE 的 trigger_reason，与 {@link TwinAutomationLogService} 常量一致 */
    private static String mapDueStateToAccessTraceReason(String stateRaw, String channelRaw) {
        String st = str(stateRaw);
        String ch = str(channelRaw);
        if ("PENDING_ACTIVATION".equalsIgnoreCase(st) && PENDING_ACTIVATION_CHANNEL.equals(ch)) {
            return TwinAutomationLogService.SWING_AUTO_LEAVE_DUE_PENDING_ACTIVATION;
        }
        if ("AUTO_EXIT_SCHEDULED".equalsIgnoreCase(st)) {
            return TwinAutomationLogService.SWING_AUTO_LEAVE_DUE_EXIT_DELAY;
        }
        return TwinAutomationLogService.SWING_AUTO_LEAVE_DUE_PENDING_ACTIVATION;
    }

    // ============================================================
    // DEBUG 日志工具
    // ============================================================

    /** 写入 ACCESS_DEBUG 类型追踪日志，不阻断主流程 */
    private void debug(String triggerReason, String userId, String channelCode, String detail) {
        try {
            twinAutomationLogService.write(
                    TwinAutomationLogService.TYPE_ACCESS_DEBUG,
                    "LINKAGE_DEBUG",
                    "DEBUG",
                    triggerReason,
                    userId,
                    channelCode,
                    true,
                    detail,
                    "dahua-swing-debug"
            );
        } catch (Exception ignored) {
            // 调试日志不阻断主流程
        }
    }

    /** 构筑用户状态快照：列出所有激活状态行（用于调试日志） */
    private String buildStateSnapshot(String userId) {
        try {
            List<DahuaActivationState> rows = dahuaSwingMapper.listAllActivationStatesByUserId(userId);
            if (rows == null || rows.isEmpty()) {
                return "（无状态行）";
            }
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < rows.size(); i++) {
                DahuaActivationState r = rows.get(i);
                if (i > 0) sb.append("；");
                sb.append(r.getChannelCode()).append("=").append(r.getState());
                if (r.getScheduledExitAt() != null && !r.getScheduledExitAt().isBlank()) {
                    sb.append("(到期=").append(r.getScheduledExitAt()).append(")");
                }
            }
            return sb.toString();
        } catch (Exception e) {
            return "（快照失败）";
        }
    }

    private String resolveChannelDisplayName(String channelCode) {
        String code = str(channelCode);
        if (code.isEmpty() || PENDING_ACTIVATION_CHANNEL.equals(code)) {
            return "";
        }
        try {
            List<Map<String, Object>> rows = dahuaDeviceChannelCacheMapper.selectChannelNamesByCodes(List.of(code));
            String n = TwinSwingLinkageDetailBuilder.pickChannelName(rows, code);
            return n == null ? "" : n;
        } catch (Exception e) {
            return "";
        }
    }
}
