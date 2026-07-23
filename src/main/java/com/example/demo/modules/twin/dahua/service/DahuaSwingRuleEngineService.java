package com.example.demo.modules.twin.dahua.service;

import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelCacheMapper;
import com.example.demo.modules.twin.dahua.entity.DahuaActivationState;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.common.service.TwinAutomationLogService;
import com.example.demo.modules.twin.dahua.entity.DahuaSwingRecord;
import com.example.demo.modules.twin.dahua.mapper.DahuaSwingMapper;
import com.example.demo.modules.twin.common.support.TwinActivationLinkageLabels;
import com.example.demo.modules.twin.common.support.TwinSwingLinkageDetailBuilder;
import com.example.demo.modules.student.service.MobilePresenceNotifyService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private final DahuaSwingMapper dahuaSwingMapper;
    private final DahuaAutoSignoutService dahuaAutoSignoutService;
    private final DahuaSwingRuleConfigService dahuaSwingRuleConfigService;
    private final TwinCardMappingService twinCardMappingService;
    private final TwinAutomationLogService twinAutomationLogService;
    private final DahuaDeviceChannelCacheMapper dahuaDeviceChannelCacheMapper;
    private final MobilePresenceNotifyService mobilePresenceNotifyService;

    public DahuaSwingRuleEngineService(
            DahuaSwingMapper dahuaSwingMapper,
            DahuaAutoSignoutService dahuaAutoSignoutService,
            DahuaSwingRuleConfigService dahuaSwingRuleConfigService,
            TwinCardMappingService twinCardMappingService,
            TwinAutomationLogService twinAutomationLogService,
            DahuaDeviceChannelCacheMapper dahuaDeviceChannelCacheMapper,
            MobilePresenceNotifyService mobilePresenceNotifyService
    ) {
        this.dahuaSwingMapper = dahuaSwingMapper;
        this.dahuaAutoSignoutService = dahuaAutoSignoutService;
        this.dahuaSwingRuleConfigService = dahuaSwingRuleConfigService;
        this.twinCardMappingService = twinCardMappingService;
        this.twinAutomationLogService = twinAutomationLogService;
        this.dahuaDeviceChannelCacheMapper = dahuaDeviceChannelCacheMapper;
        this.mobilePresenceNotifyService = mobilePresenceNotifyService;
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
        // 新一次权限下发 = 新激活窗口：仅清空待激活/已过期计时器，不删除已完成的 ACTIVATED 状态
        // （否则已激活的人会被清空记录 → 再次刷门时误判为"首次激活" → 重复写日志 + 重复授权）
        dahuaSwingMapper.deleteExpiredOrPendingStatesByUserId(uid);
        DahuaActivationState pending = new DahuaActivationState();
        pending.setTaskId(GLOBAL_RULE_TASK_ID);
        pending.setUserId(uid);
        pending.setChannelCode(PENDING_ACTIVATION_CHANNEL);
        pending.setState("PENDING_ACTIVATION");
        pending.setCounter(0);
        pending.setLastSwipeAt(fmt(now));
        pending.setScheduledExitAt(fmt(now.plusSeconds(Math.max(1, activationExpire))));
        pending.setDebounceUntil(null);
        pending.setLastRecordId(null);
        dahuaSwingMapper.upsertActivationState(pending);
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
    @SuppressWarnings("unchecked")
    public synchronized void onRecordIngested(DahuaSwingRecord record) {
        Map<String, Object> rules = dahuaSwingRuleConfigService.getConfig();
        if (record.getMappingHit() == null || record.getMappingHit() != 1) {
            return;
        }
        if (!Integer.valueOf(1).equals(record.getOpenResult())) {
            return;
        }
        int exitDelay = intv(rules.get("autoExitDelaySeconds"), 10);
        int debounceSeconds = intv(rules.get("enterDebounceSeconds"), 30);
        int exitDebounceSeconds = intv(rules.get("exitDebounceSeconds"), Math.max(debounceSeconds, 60));
        List<String> exitChannels = strList(rules.get("exitChannelCodes"));
        List<String> toggleChannels = strList(rules.get("toggleChannelCodes"));
        List<String> activatedReswipeExitChannels = strList(rules.get("activatedReswipeExitChannelCodes"));

        String userId = str(record.getMappingUserId());
        if (userId.isBlank()) {
            return;
        }
        String channelCode = str(record.getChannelCode());
        boolean hitExitRule = !exitChannels.isEmpty() && exitChannels.contains(channelCode);
        boolean hitToggleRule = !toggleChannels.isEmpty() && toggleChannels.contains(channelCode);
        boolean hitActivatedReswipeExitRule =
                !activatedReswipeExitChannels.isEmpty() && activatedReswipeExitChannels.contains(channelCode);
        if (!hitExitRule && !hitToggleRule && !hitActivatedReswipeExitRule) {
            return;
        }

        String recordId = str(record.getRecordId());
        if (!recordId.isBlank()) {
            int dup = dahuaSwingMapper.countActivationByUserAndLastRecordId(
                    GLOBAL_RULE_TASK_ID, userId, recordId);
            if (dup > 0) {
                log.debug("[swing-rule] skip-duplicate-record linkage userId={} recordId={} channel={}",
                        userId, recordId, channelCode);
                return;
            }
        }

        int activatedCount = dahuaSwingMapper.countActivatedStatesForUser(GLOBAL_RULE_TASK_ID, userId);
        boolean userActivatedElsewhere = activatedCount > 0;

        // 激活后再次刷门签退：必须按 userId 识别「已激活」，不能只看当前 channel 行（否则换一扇门永远不命中）
        if (hitActivatedReswipeExitRule && userActivatedElsewhere) {
            LocalDateTime now = LocalDateTime.now();
            // 同一物理门同时配置「激活门」与「激活后再刷签退门」时：激活门防抖窗内不处理签退侧，
            // 避免首刷激活后紧接的重复刷卡先命中签退逻辑、删掉 ACTIVATED 行再误排程延时签退。
            boolean allowActivatedReswipeExit = true;
            if (hitToggleRule) {
                DahuaActivationState toggleRow =
                        dahuaSwingMapper.findActivationState(GLOBAL_RULE_TASK_ID, userId, channelCode);
                if (toggleRow != null && "ACTIVATED".equalsIgnoreCase(str(toggleRow.getState()))) {
                    LocalDateTime toggleDebounceUntil = parse(toggleRow.getDebounceUntil());
                    if (toggleDebounceUntil != null && now.isBefore(toggleDebounceUntil)) {
                        allowActivatedReswipeExit = false;
                        log.info("[swing-rule] skip-reswipe-exit-under-toggle-debounce userId={} channel={} until={}",
                                userId, channelCode, toggleRow.getDebounceUntil());
                    }
                }
            }
            if (allowActivatedReswipeExit) {
                DahuaActivationState existingSameChannel =
                        dahuaSwingMapper.findActivationState(GLOBAL_RULE_TASK_ID, userId, channelCode);
                if (existingSameChannel != null && "AUTO_EXIT_SCHEDULED".equalsIgnoreCase(str(existingSameChannel.getState()))) {
                    LocalDateTime exitDebounceUntil = parse(existingSameChannel.getDebounceUntil());
                    if (exitDebounceUntil != null && now.isBefore(exitDebounceUntil)) {
                        log.info("[swing-rule] skip-activated-reswipe-exit-debounce userId={} channel={} until={}",
                                userId, channelCode, existingSameChannel.getDebounceUntil());
                        return;
                    }
                }
                dahuaSwingMapper.deleteActivationStatesByUserId(userId);
                DahuaActivationState state = newStateRow(userId, channelCode);
                state.setState("AUTO_EXIT_SCHEDULED");
                state.setScheduledExitAt(fmt(now.plusSeconds(Math.max(0, exitDelay))));
                state.setLastSwipeAt(fmt(now));
                state.setLastRecordId(record.getRecordId());
                state.setCounter(0);
                state.setDebounceUntil(fmt(now.plusSeconds(Math.max(1, exitDebounceSeconds))));
                dahuaSwingMapper.upsertActivationState(state);
                String doorLabelAr = resolveChannelDisplayName(channelCode);
                twinAutomationLogService.write(
                        TwinAutomationLogService.TYPE_ACCESS_TRACE,
                        "LINKAGE_STEP",
                        "SYSTEM",
                        TwinAutomationLogService.SWING_ACTIVATED_RESWIPE_EXIT_TIMER_STARTED,
                        userId,
                        channelCode,
                        true,
                        "延时签退：" + exitDelay + " 秒；计划「" + state.getScheduledExitAt() + "」；"
                                + (doorLabelAr.isBlank() ? "channel=" + channelCode : doorLabelAr),
                        "dahua-swing-record"
                );
                notifyMobilePresence(userId, "auto_exit_scheduled");
                return;
            }
        }
        // 仅「激活后再刷门签退」独有
        // 若该通道也在 toggleChannelCodes 中（同一物理门双角色），须继续走下方激活逻辑以清除 __PENDING_ACTIVATION__。
        if (hitActivatedReswipeExitRule && !hitToggleRule) {
            log.info("[swing-rule] skip-reswipe-exit-only-until-activated userId={} channel={}", userId, channelCode);
            return;
        }

        DahuaActivationState state = dahuaSwingMapper.findActivationState(GLOBAL_RULE_TASK_ID, userId, channelCode);
        if (state == null) {
            state = newStateRow(userId, channelCode);
            state.setCounter(0);
            state.setState("IDLE");
        }
        LocalDateTime now = LocalDateTime.now();

        LocalDateTime debounceUntil = parse(state.getDebounceUntil());
        if (debounceUntil != null && now.isBefore(debounceUntil)) {
            return;
        }

        // 刷门即签退：须已「激活卡片」成功；未激活时若同门亦在激活组则交下方激活逻辑，否则忽略
        if (hitExitRule && !userActivatedElsewhere) {
            if (!hitToggleRule) {
                log.info("[swing-rule] skip-exit-until-activated userId={} channel={}", userId, channelCode);
                return;
            }
        } else if (hitExitRule) {
            dahuaSwingMapper.deleteActivationStateByUserTaskAndChannel(
                    GLOBAL_RULE_TASK_ID, userId, PENDING_ACTIVATION_CHANNEL);
            dahuaSwingMapper.deleteActivationStatesByUserId(userId);
            DahuaActivationState exitState = newStateRow(userId, channelCode);
            exitState.setState("AUTO_EXIT_SCHEDULED");
            exitState.setScheduledExitAt(fmt(now.plusSeconds(Math.max(0, exitDelay))));
            exitState.setLastSwipeAt(fmt(now));
            exitState.setLastRecordId(record.getRecordId());
            exitState.setCounter(0);
            exitState.setDebounceUntil(fmt(now.plusSeconds(Math.max(1, exitDebounceSeconds))));
            dahuaSwingMapper.upsertActivationState(exitState);
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
            notifyMobilePresence(userId, "auto_exit_scheduled");
            return;
        }

        if (!hitToggleRule) {
            return;
        }

        boolean alreadyActivated =
                "ACTIVATED".equalsIgnoreCase(str(state.getState()))
                        && state.getActivatedAt() != null
                        && !str(state.getActivatedAt()).isBlank();

        // 延时签退进行中：禁止再次激活，避免清空 scheduled_exit_at 导致无法自动签退
        if (dahuaSwingMapper.countAutoExitScheduledForUser(GLOBAL_RULE_TASK_ID, userId) > 0) {
            log.debug("[swing-rule] skip-activation-during-exit-scheduled userId={} channel={}",
                    userId, channelCode);
            return;
        }
        // 无待激活计时器且从未激活：禁止刷门直接激活（须先扫码进入起算 PENDING_ACTIVATION）
        if (!alreadyActivated
                && userActivatedElsewhere == false
                && dahuaSwingMapper.existsPendingActivationForUser(
                        GLOBAL_RULE_TASK_ID, userId, PENDING_ACTIVATION_CHANNEL) == 0) {
            log.debug("[swing-rule] skip-activation-without-pending-timer userId={} channel={}",
                    userId, channelCode);
            return;
        }

        // 时间方向校验：刷卡时间必须晚于待激活计时器创建时间（last_swipe_at），
        // 防止 deleteActivationStatesByUserId 清空 last_record_id 去重证据后，
        // 旧会话的门禁记录被新计时器重复匹配（幽灵激活）。
        if (!alreadyActivated && userActivatedElsewhere == false) {
            DahuaActivationState pendingRow = dahuaSwingMapper.findActivationState(
                    GLOBAL_RULE_TASK_ID, userId, PENDING_ACTIVATION_CHANNEL);
            if (pendingRow != null) {
                LocalDateTime pendingSince = parse(pendingRow.getLastSwipeAt());
                LocalDateTime recordTime = parse(record.getSwingTime());
                if (pendingSince != null && recordTime != null && recordTime.isBefore(pendingSince)) {
                    log.info("[swing-rule] skip-stale-record-for-pending-activation userId={} channel={} recordTime={} pendingSince={}",
                            userId, channelCode, record.getSwingTime(), pendingRow.getLastSwipeAt());
                    return;
                }
            }
        }

        // 仅命中激活卡片规则：取消「待激活」倒计时；后续激活逻辑作用在当前通道行上
        int pendingRemoved = dahuaSwingMapper.deleteActivationStateByUserTaskAndChannel(
                GLOBAL_RULE_TASK_ID, userId, PENDING_ACTIVATION_CHANNEL);
        if (pendingRemoved > 0) {
            notifyTimerCleared(userId, "pending_activation");
        }
        int counter = state.getCounter() == null ? 0 : state.getCounter();
        counter++;
        state.setCounter(counter);
        state.setLastSwipeAt(fmt(now));
        state.setLastRecordId(record.getRecordId());
        state.setDebounceUntil(fmt(now.plusSeconds(debounceSeconds)));
        if (alreadyActivated) {
            dahuaSwingMapper.upsertActivationState(state);
            log.debug("[swing-rule] skip-duplicate-activation-audit userId={} channel={}", userId, channelCode);
            return;
        }
        state.setState("ACTIVATED");
        state.setActivatedAt(fmt(now));
        // 激活成功后不再写 scheduled_exit_at：避免「激活超时」被复用为激活后宽限导致到期自动签退（listDueActivationStates 仅扫非空 scheduled_exit_at）
        state.setScheduledExitAt(null);
        dahuaSwingMapper.upsertActivationState(state);
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
    }

    /**
     * 到期任务：须完整自动离开
     * 仅 autoSignout 成功时清空联动行，ARO 失败时保留 scheduled 行供下一 tick 重试。
     */
    private static final String LOCK_DUE_STATES = "dahua_process_due_states";

    public synchronized void processDueStates() {
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
        Set<String> processedUsers = new HashSet<>();
        for (DahuaActivationState state : dueStates) {
            String userId = str(state.getUserId());
            if (userId.isBlank() || !processedUsers.add(userId)) {
                continue;
            }
            log.info("[swing-rule] due-auto-signout-trigger userId={} state={} channel={} scheduledExitAt={} lastSwipeAt={} lastRecordId={}",
                    userId,
                    state.getState(),
                    state.getChannelCode(),
                    state.getScheduledExitAt(),
                    state.getLastSwipeAt(),
                    state.getLastRecordId());
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
            } else if ("ACTIVATED".equalsIgnoreCase(st)) {
                triggerReason = "ACTIVATED_SLA_EXPIRE_AUTO_SIGNOUT";
                linkageSnapshot = TwinSwingLinkageDetailBuilder.activatedGraceTimerExpired(activationExpire, sched);
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
            if (ok) {
                dahuaSwingMapper.deleteActivationStatesByUserId(userId);
                notifyMobilePresence(userId, "auto_signout");
            } else {
                int attempt = state.getCounter() == null ? 0 : state.getCounter();
                attempt++;
                state.setCounter(attempt);
                if (attempt > 5) {
                    log.warn("[swing-rule] due-auto-signout-max-retries userId={} attempts={} state={} channel={} — force-clean to prevent infinite retry",
                            userId, attempt, state.getState(), state.getChannelCode());
                    dahuaSwingMapper.deleteActivationStatesByUserId(userId);
                    notifyTimerCleared(userId, "auto_signout_failed");
                } else {
                    dahuaSwingMapper.upsertActivationState(state);
                    log.warn("[swing-rule] due-auto-signout-keep-state userId={} state={} channel={} scheduledExitAt={} attempt={}/5",
                            userId, state.getState(), state.getChannelCode(), state.getScheduledExitAt(), attempt);
                }
            }
        }
    }

    public int clearActivationStatesForUser(String userId) {
        String uid = str(userId);
        if (uid.isBlank()) {
            return 0;
        }
        int deleted = dahuaSwingMapper.deleteActivationStatesByUserId(uid);
        if (deleted > 0) {
            notifyTimerCleared(uid, "all");
        }
        return deleted;
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
        if ("ACTIVATED".equalsIgnoreCase(st)) {
            return TwinAutomationLogService.SWING_AUTO_LEAVE_DUE_ACTIVATED_SLA;
        }
        return TwinAutomationLogService.SWING_AUTO_LEAVE_DUE_PENDING_ACTIVATION;
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
