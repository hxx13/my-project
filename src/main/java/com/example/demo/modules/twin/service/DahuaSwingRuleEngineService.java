package com.example.demo.modules.twin.service;

import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelCacheMapper;
import com.example.demo.modules.twin.entity.DahuaActivationState;
import com.example.demo.modules.twin.entity.DahuaSwingRecord;
import com.example.demo.modules.twin.mapper.DahuaSwingMapper;
import com.example.demo.modules.twin.support.TwinActivationLinkageLabels;
import com.example.demo.modules.twin.support.TwinSwingLinkageDetailBuilder;
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
 *   <li>{@link TwinCardMappingService#isLinkageRuleExempt(String)} 为 true 时跳过全部联动（不写入状态、不触发自动签退）；豁免标记不由联动消耗。</li>
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

    public DahuaSwingRuleEngineService(
            DahuaSwingMapper dahuaSwingMapper,
            DahuaAutoSignoutService dahuaAutoSignoutService,
            DahuaSwingRuleConfigService dahuaSwingRuleConfigService,
            TwinCardMappingService twinCardMappingService,
            TwinAutomationLogService twinAutomationLogService,
            DahuaDeviceChannelCacheMapper dahuaDeviceChannelCacheMapper
    ) {
        this.dahuaSwingMapper = dahuaSwingMapper;
        this.dahuaAutoSignoutService = dahuaAutoSignoutService;
        this.dahuaSwingRuleConfigService = dahuaSwingRuleConfigService;
        this.twinCardMappingService = twinCardMappingService;
        this.twinAutomationLogService = twinAutomationLogService;
        this.dahuaDeviceChannelCacheMapper = dahuaDeviceChannelCacheMapper;
    }

    /**
     * 扫码进房（ARO 已成功）后调用：若配置了「激活卡片规则」门组，则启动「待激活」超时倒计时。
     * 与 {@link com.example.demo.modules.accessrule.service.AccessRuleDispatchService#tryApplyAccessForScanEnter} 是否实际调用大华 batch 无关；
     * 全局关闭「进入时门禁联动」时仍应起算本倒计时，避免仅靠大华下发开关误伤联动规则。
     * 超时时刻到达时由 {@link #processDueStates} 触发完整自动离开（无额外签退延时，直接按预定时刻执行）。
     */
    public void startPendingActivationAfterAccessRuleGrant(String userId) {
        String uid = str(userId);
        if (uid.isBlank()) {
            return;
        }
        if (twinCardMappingService.isLinkageRuleExempt(uid)) {
            return;
        }
        Map<String, Object> rules = dahuaSwingRuleConfigService.getConfig();
        List<String> toggleChannels = strList(rules.get("toggleChannelCodes"));
        if (toggleChannels.isEmpty()) {
            return;
        }
        int activationExpire = intv(rules.get("activationExpireSeconds"), 120);
        LocalDateTime now = LocalDateTime.now();
        // 新一次权限下发 = 新激活窗口：清空旧联动行，避免多通道残留状态导致重复签退或逻辑分叉
        dahuaSwingMapper.deleteActivationStatesByUserId(uid);
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
    }

    /**
     * 独立于拉取任务的节拍：避免仅依赖 15s 轮询尾部才处理到期签退。
     */
    @Scheduled(fixedDelayString = "${app.dahua-swing.due-process-ms:5000}")
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
        if (Integer.valueOf(1).equals(record.getFreezeExemptFlag())
                || twinCardMappingService.isLinkageRuleExempt(userId)) {
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
                log.info("[swing-rule] skip-duplicate-record linkage userId={} recordId={} channel={}",
                        userId, recordId, channelCode);
                return;
            }
        }

        int activatedCount = dahuaSwingMapper.countActivatedStatesForUser(GLOBAL_RULE_TASK_ID, userId);
        boolean userActivatedElsewhere = activatedCount > 0;

        // 激活后再次刷门签退：必须按 userId 识别「已激活」，不能只看当前 channel 行（否则换一扇门永远不命中）
        if (hitActivatedReswipeExitRule && userActivatedElsewhere) {
            LocalDateTime now = LocalDateTime.now();
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
            return;
        }
        // 仅配置了「激活后签退」门且人员尚未激活：忽略（避免误把该门当作激活门去累加 counter）
        if (hitActivatedReswipeExitRule) {
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

        // 刷门即签退（含与激活门重合的门）：先清「待激活」占位，再删掉该用户其它通道上的联动行，只保留当前门上的延时签退任务，避免多定时器并存
        if (hitExitRule) {
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
            return;
        }

        if (!hitToggleRule) {
            return;
        }
        // 仅命中激活卡片规则：取消「待激活」倒计时；后续激活逻辑作用在当前通道行上
        dahuaSwingMapper.deleteActivationStateByUserTaskAndChannel(
                GLOBAL_RULE_TASK_ID, userId, PENDING_ACTIVATION_CHANNEL);

        int counter = state.getCounter() == null ? 0 : state.getCounter();
        counter++;
        state.setCounter(counter);
        state.setLastSwipeAt(fmt(now));
        state.setLastRecordId(record.getRecordId());
        state.setState("ACTIVATED");
        state.setActivatedAt(fmt(now));
        state.setDebounceUntil(fmt(now.plusSeconds(debounceSeconds)));
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
    }

    /**
     * 到期任务：须完整自动离开（见类注释）。同一 userId 只处理一次，并清空其所有联动行，防止重复探测。
     */
    public synchronized void processDueStates() {
        List<DahuaActivationState> dueStates = dahuaSwingMapper.listDueActivationStates(fmt(LocalDateTime.now()));
        Set<String> processedUsers = new HashSet<>();
        for (DahuaActivationState state : dueStates) {
            String userId = str(state.getUserId());
            if (userId.isBlank() || !processedUsers.add(userId)) {
                continue;
            }
            if (twinCardMappingService.isLinkageRuleExempt(userId)) {
                log.info("[swing-rule] due-skip-exempt userId={} state={} channel={} scheduledExitAt={}",
                        userId, state.getState(), state.getChannelCode(), state.getScheduledExitAt());
                dahuaSwingMapper.deleteActivationStatesByUserId(userId);
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
            // 无论成功失败都清理：失败由后续刷卡重新走激活；禁止残留 scheduled 行导致重复签退
            dahuaSwingMapper.deleteActivationStatesByUserId(userId);
        }
    }

    public int clearActivationStatesForUser(String userId) {
        String uid = str(userId);
        if (uid.isBlank()) {
            return 0;
        }
        return dahuaSwingMapper.deleteActivationStatesByUserId(uid);
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
