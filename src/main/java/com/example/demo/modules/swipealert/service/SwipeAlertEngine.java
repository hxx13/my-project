package com.example.demo.modules.swipealert.service;

import com.example.demo.modules.swipealert.entity.SwipeAlertRule;
import com.example.demo.modules.swipealert.mapper.SwipeAlertRuleMapper;
import com.example.demo.modules.dahua.dto.DahuaRecordDTO;
import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.component.SocketRoomAssigner;
import com.example.demo.modules.notification.push.dispatch.PushService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Core rule engine for swipe failure alerts.
 *
 * <p>Responsibilities:</p>
 * <ul>
 *   <li>Watches swing records as they are persisted</li>
 *   <li>Matches each failed record against active alert rules</li>
 *   <li>Maintains sliding window counters in memory</li>
 *   <li>Fires WebSocket (Socket.IO) alerts when thresholds are breached</li>
 *   <li>Enforces cooldown between repeated alerts</li>
 * </ul>
 *
 * <h3>Hook points</h3>
 * <p>This engine must be called after each swing record is persisted:</p>
 * <ol>
 *   <li><b>Webhook path:</b> {@code DahuaService.processAndBroadcast()} — call
 *       {@link #onSwingRecord(DahuaRecordDTO)} for each parsed record.</li>
 *   <li><b>Scheduled pull path:</b> {@code DahuaSwingPullService.pullOnce()} — call
 *       {@link #onSwingRecord(DahuaRecordDTO)} after upsert. (A future overload
 *       accepting {@code DahuaSwingRecord} could carry richer data such as
 *       departmentName and personCode.)</li>
 * </ol>
 */
@Service
public class SwipeAlertEngine {

    private static final Logger log = LoggerFactory.getLogger(SwipeAlertEngine.class);

    private final SwipeAlertRuleMapper mapper;
    private final SocketIOServer socketServer;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** Personnel lookup — injected optionally so engine compiles even if module not wired */
    @Autowired(required = false)
    private com.example.demo.modules.twin.common.mapper.TwinDashboardMapper personnelMapper;

    /** Card mapping lookup — 用卡号精确匹配系统用户 ID（dahua_card_mapping 表） */
    @Autowired(required = false)
    private com.example.demo.modules.twin.card.mapper.TwinCardMappingMapper cardMappingMapper;

    /** Activation state lookup — checks if user has been activated for any toggle door */
    @Autowired(required = false)
    private com.example.demo.modules.twin.dahua.mapper.DahuaSwingMapper dahuaSwingMapper;

    // ---- Fixed-window state: anchored to the FIRST failure in each window ----
    private static class FixedWindow {
        final long windowStart; // epoch ms
        int count;
        boolean fired;

        FixedWindow(long windowStart, int count) {
            this.windowStart = windowStart;
            this.count = count;
            this.fired = false;
        }
    }

    /** ruleId -> current fixed window (null = no active window, next failure starts one) */
    private final Map<Long, FixedWindow> windowStateMap = new ConcurrentHashMap<>();

    /** Cooldown: ruleId -> last fire timestamp (epoch ms). Prevents back-to-back alerts. */
    private final Map<Long, Long> lastFireMap = new ConcurrentHashMap<>();

    /** Dedup: recordId -> processTime. Prevents same record triggering alerts on re-pull. */
    private final Map<String, Long> processedRecords = new ConcurrentHashMap<>();
    private volatile long lastCleanupTime = System.currentTimeMillis();

    /** Cached active rules, reloaded via {@link #reloadRules()}. */
    private volatile List<SwipeAlertRule> activeRules = List.of();
    private volatile long lastReloadTime = 0;
    private static final long RELOAD_INTERVAL_MS = 30_000; // 30秒重载一次

    private final PushService pushService;

    public SwipeAlertEngine(SwipeAlertRuleMapper mapper,
                            @Autowired(required = false) SocketIOServer socketServer,
                            PushService pushService) {
        this.mapper = mapper;
        this.socketServer = socketServer;
        this.pushService = pushService;
    }

    @PostConstruct
    public void reloadRules() {
        try {
            activeRules = mapper.findByEnabledTrue();
            log.info("[swipe-alert] rules reloaded, count={}", activeRules.size());
            for (SwipeAlertRule r : activeRules) {
                log.info("[swipe-alert]   rule id={} name={} notifySite={} notifyPush={}",
                        r.getId(), r.getName(), r.getNotifySite(), r.getNotifyPush());
            }
        } catch (Exception e) {
            log.warn("[swipe-alert] unable to load rules (table may not exist yet): {}",
                    e.getMessage());
            activeRules = List.of();
        }
    }

    /**
     * Registers a listener for {@code SWIPE_FAILURE_ALERT_ACK}.
     * When an admin clicks "已读" on the Dynamic Island banner, the frontend
     * emits this event with {@code { alertId, userId }}.  The listener
     * broadcasts {@code SWIPE_FAILURE_ALERT_DISMISS} to every connected
     * client so all admin banners disappear simultaneously.
     */
    @PostConstruct
    public void registerAckListener() {
        if (socketServer != null) {
            socketServer.addEventListener("SWIPE_FAILURE_ALERT_ACK", Map.class,
                    (client, data, ackRequest) -> {
                        String alertId = (String) data.get("alertId");
                        String userId = (String) data.get("userId");
                        // Reset engine cooldown+window so acknowledged batch won't re-trigger
                        Object rawRuleId = data.get("ruleId");
                        if (rawRuleId instanceof Number n) {
                            acknowledgeAlert(alertId, n.longValue());
                        }
                        Map<String, Object> dismiss = new LinkedHashMap<>();
                        dismiss.put("alertId", alertId);
                        dismiss.put("dismissedBy", userId);
                        socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE).sendEvent(
                                "SWIPE_FAILURE_ALERT_DISMISS", dismiss);
                        log.info("[swipe-alert] ack received alertId={} userId={}, broadcast dismiss",
                                alertId, userId);
                    });
            log.info("[swipe-alert] ACK listener registered for SWIPE_FAILURE_ALERT_ACK");
        } else {
            log.warn("[swipe-alert] socketServer not wired — cannot register ACK listener");
        }
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Called after each swing record is persisted.
     * Processes openType 48 (remote open) and 52 (illegal open).
     */
    public void onSwingRecord(DahuaRecordDTO record) {
        if (record == null) return;

        long nowMs = System.currentTimeMillis();
        if (nowMs - lastReloadTime > RELOAD_INTERVAL_MS) {
            reloadRules();
            lastReloadTime = nowMs;
        }

        Integer openType = record.getOpenType();
        if (openType == null || (openType != 48 && openType != 51 && openType != 52)) return;

        log.info("[swipe-alert] received: openType={} person={} channel={}", openType, record.getPersonName(), record.getChannelName());
        String recordId = record.getId();
        if (recordId != null && !recordId.isBlank()) {
            Long lastSeen = processedRecords.putIfAbsent(recordId, System.currentTimeMillis());
            if (lastSeen != null) {
                return; // already processed
            }
        }

        // Periodic cleanup: evict records older than 10 minutes (prevent memory leak)
        long now = System.currentTimeMillis();
        if (now - lastCleanupTime > 300_000) { // every 5 minutes
            processedRecords.values().removeIf(t -> now - t > 600_000);
            lastCleanupTime = now;
        }

        for (SwipeAlertRule rule : activeRules) {
            if (!Boolean.TRUE.equals(rule.getEnabled())) continue;
            if (!matchesRule(rule, record)) continue;

            Integer windowSec = rule.getThresholdWindowSec();
            Integer thresholdCount = rule.getThresholdCount();
            if (windowSec == null || thresholdCount == null || thresholdCount <= 0) {
                log.warn("[swipe-alert] rule id={} has null/zero window or threshold, skipping", rule.getId());
                continue;
            }

            long windowMs = windowSec * 1000L;
            Long ruleId = rule.getId();

            // ---- fixed window: anchored to the FIRST failure in this window ----
            FixedWindow w = windowStateMap.compute(ruleId, (k, prev) -> {
                if (prev == null || now > prev.windowStart + windowMs) {
                    // No active window, or previous window expired → start new one
                    return new FixedWindow(now, 1);
                }
                // Still within the same window → accumulate
                prev.count++;
                return prev;
            });

            // ---- threshold + fire (at most once per window) ----
            if (w.count >= thresholdCount && !w.fired) {
                // Cooldown check (additional safety gap between alerts)
                Integer cooldownSec = rule.getCooldownSec();
                if (cooldownSec != null && cooldownSec > 0) {
                    Long lastFire = lastFireMap.get(ruleId);
                    if (lastFire != null && (now - lastFire) < cooldownSec * 1000L) {
                        continue;
                    }
                }
                w.fired = true;
                lastFireMap.put(ruleId, now);

                Map<String, Object> alert = buildAlert(rule, w.count, record);
                // 站内通知（灵动岛横幅）
                if (Boolean.TRUE.equals(rule.getNotifySite())) {
                    fireSiteAlert(alert);
                } else {
                    log.info("[swipe-alert] notifySite disabled for rule={}, skip site alert", rule.getId());
                }
                // 站外推送（邮件/微信/WxPusher）
                if (Boolean.TRUE.equals(rule.getNotifyPush())) {
                    firePushAlert(rule, w.count, alert);
                } else {
                    log.info("[swipe-alert] notifyPush disabled for rule={}, skip push alert", rule.getId());
                }
            }
        }
    }

    // =========================================================================
    // Rule matching
    // =========================================================================

    private boolean matchesRule(SwipeAlertRule rule, DahuaRecordDTO record) {
        // --- openTypes filter：记录的 openType 必须在规则允许集合内 ---
        String openTypes = rule.getOpenTypes();
        if (openTypes != null && !openTypes.isBlank() && record.getOpenType() != null) {
            Set<String> allowed = new HashSet<>(Arrays.asList(openTypes.split(",")));
            if (!allowed.contains(String.valueOf(record.getOpenType()))) return false;
        }

        // --- channels filter (JSON array of channel codes) ---
        String channelsJson = rule.getChannels();
        if (channelsJson != null && !channelsJson.isBlank() && !"null".equals(channelsJson)) {
            try {
                List<String> allowedChannels = objectMapper.readValue(
                        channelsJson, new TypeReference<List<String>>() {});
                if (allowedChannels != null && !allowedChannels.isEmpty()) {
                    String recordChannel = record.getChannelCode();
                    if (recordChannel == null || !allowedChannels.contains(recordChannel.trim())) {
                        return false;
                    }
                }
            } catch (Exception e) {
                log.debug("[swipe-alert] channels parse error for rule id={}, skipping channel filter",
                        rule.getId(), e);
            }
        }

        // --- departments filter (JSON array of department names) ---
        // NOTE: DahuaRecordDTO (webhook DTO) does not carry departmentName.
        // In the pull path DahuaSwingRecord does after enrichment.
        // For now the departments filter is a no-op on the webhook DTO path;
        // a future overload can accept DahuaSwingRecord for accurate matching.
        String deptsJson = rule.getDepartments();
        if (deptsJson != null && !deptsJson.isBlank() && !"null".equals(deptsJson)) {
            try {
                List<String> allowedDepts = objectMapper.readValue(
                        deptsJson, new TypeReference<List<String>>() {});
                if (allowedDepts != null && !allowedDepts.isEmpty()) {
                    // DahuaRecordDTO has no departmentName — skip filter
                    // (alert will still fire but departments cannot be narrowed here)
                    log.debug("[swipe-alert] rule id={} has departments filter but DTO carries no dept; "
                            + "skipping dept check", rule.getId());
                }
            } catch (Exception e) {
                log.debug("[swipe-alert] departments parse error for rule id={}, skipping dept filter",
                        rule.getId(), e);
            }
        }

        return true;
    }

    // =========================================================================
    // Alert construction
    // =========================================================================

    /** Enrich a record snapshot with personnel data and ARO status */
    private Map<String, Object> enrichRecordSnap(DahuaRecordDTO record) {
        String person = Objects.toString(record.getPersonName(), "");
        String channel = Objects.toString(record.getChannelName(), "");
        String channelCode = Objects.toString(record.getChannelCode(), "");

        Map<String, Object> snap = new LinkedHashMap<>();
        snap.put("personName", person);
        snap.put("channelName", channel);
        snap.put("channelCode", channelCode);
        snap.put("openTypeLabel", switch (record.getOpenType() != null ? record.getOpenType() : 0) {
            case 48 -> "远程开门";
            case 51 -> "合法刷卡";
            case 52 -> "非法刷卡";
            default -> "刷卡";
        });
        snap.put("swingTime", Objects.toString(record.getSwingTime(), ""));
        snap.put("enterOrExit", record.getEnterOrExit());  // 1=进入, 2=离开

        // Hardware-level direction label
        if (record.getEnterOrExit() != null) {
            snap.put("enterOrExitLabel",
                    record.getEnterOrExit() == 1 ? "进入" : "离开");
        } else {
            snap.put("enterOrExitLabel", "");
        }

        // ── 人员身份解析：卡号精确匹配 → 姓名模糊匹配（兜底） ──
        String mobilePhone = "";
        String departmentName = "";
        String personCode = "";
        String userId = "";
        String aroStatus = "UNKNOWN";

        String cardNo = record.getCardNumber();
        // ① 优先用卡号从 dahua_card_mapping 表精确匹配（19位 aroUserId）
        if (cardMappingMapper != null && cardNo != null && !cardNo.isBlank()) {
            try {
                var mapping = cardMappingMapper.findByCardNo(cardNo.trim());
                if (mapping != null && mapping.getAroUserId() != null && !mapping.getAroUserId().isBlank()) {
                    userId = mapping.getAroUserId();
                    departmentName = Objects.toString(mapping.getProjectGroupName(), "");
                    personCode = Objects.toString(mapping.getJobNumber(), "");
                    log.info("[swipe-alert] cardholder found by cardNo={}: userId={} name={} dept={}",
                            cardNo, userId, mapping.getUserName(), departmentName);
                } else {
                    log.info("[swipe-alert] cardNo={} not found in dahua_card_mapping", cardNo);
                }
            } catch (Exception e) {
                log.debug("[swipe-alert] card mapping lookup failed for cardNo={}: {}", cardNo, e.getMessage());
            }
        }

        // ② 兜底：姓名模糊匹配 aro_personnel（卡号为空或卡号未匹配到时使用）
        if (userId.isBlank() && personnelMapper != null && !person.isBlank()) {
            try {
                List<Map<String, Object>> hits = personnelMapper.searchPersonnel(person, 3);
                if (hits != null && !hits.isEmpty()) {
                    Map<String, Object> p = hits.get(0);
                    mobilePhone = Objects.toString(p.get("mobile_phone"), "");
                    departmentName = Objects.toString(p.get("department_name"), "");
                    personCode = Objects.toString(p.get("job_number"), "");
                    userId = Objects.toString(p.get("user_id"), "");
                    log.info("[swipe-alert] cardholder found by name fallback: person={} userId={} dept={}",
                            person, userId, departmentName);
                } else {
                    log.info("[swipe-alert] cardholder NOT found: person='{}' cardNo={}", person,
                            cardNo != null ? cardNo : "N/A");
                }
            } catch (Exception e) {
                log.debug("[swipe-alert] personnel lookup failed for '{}': {}",
                        person, e.getMessage());
            }
        } else if (userId.isBlank() && !person.isBlank()) {
            log.info("[swipe-alert] personnelMapper not wired — cardholder name lookup skipped for '{}'", person);
        }

        // ③ 屏障内外状态（仅当已解析到 userId 时查询）
        if (!userId.isBlank() && dahuaSwingMapper != null) {
            try {
                Integer enterOrExitRec = record.getEnterOrExit();
                if (enterOrExitRec != null && enterOrExitRec == 2) {
                    aroStatus = "OUTSIDE";
                } else {
                    int activatedCount = dahuaSwingMapper.countActivatedStatesForUser(0L, userId);
                    aroStatus = activatedCount > 0 ? "INSIDE" : "OUTSIDE";
                }
            } catch (Exception e) {
                log.debug("[swipe-alert] activation lookup failed for userId={}: {}", userId, e.getMessage());
            }
        }

        snap.put("mobilePhone", mobilePhone);
        snap.put("departmentName", departmentName);
        snap.put("personCode", personCode);
        snap.put("aroUserId", userId);
        snap.put("aroStatus", aroStatus);

        return snap;
    }

    private void fireSiteAlert(Map<String, Object> alert) {
        if (socketServer != null) {
            try {
                socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE)
                        .sendEvent("SWIPE_FAILURE_ALERT", alert);
                log.info("[swipe-alert] site alert fired alertId={} ruleId={}", alert.get("alertId"), alert.get("ruleId"));
            } catch (Exception e) {
                log.error("[swipe-alert] site broadcast failed", e);
            }
        }
    }

    private void firePushAlert(SwipeAlertRule rule, int count, Map<String, Object> alert) {
        try {
            Map<String, Object> snap = Map.of();
            Object mr = alert.get("matchedRecords");
            if (mr instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> m) {
                @SuppressWarnings("unchecked")
                Map<String, Object> casted = (Map<String, Object>) m;
                snap = casted;
            }
            String dept = Objects.toString(snap.get("departmentName"), "");
            String channel = Objects.toString(snap.get("channelName"), "");
            String person = Objects.toString(snap.get("personName"), "");
            String phone = Objects.toString(snap.get("mobilePhone"), "");
            String openLabel = Objects.toString(snap.get("openTypeLabel"), "非法刷卡开门");
            String swingTime = Objects.toString(snap.get("swingTime"), "");
            String winMin = String.valueOf(rule.getThresholdWindowSec() != null ? rule.getThresholdWindowSec() / 60 : 0);

            Map<String, String> vars = new LinkedHashMap<>();
            vars.put("channelName", channel);
            vars.put("personName", person);
            vars.put("deptName", dept);
            vars.put("phone", phone);
            vars.put("count", String.valueOf(count));
            vars.put("windowMin", winMin);
            vars.put("threshold", String.valueOf(rule.getThresholdCount()));
            vars.put("openTypeLabel", openLabel);
            vars.put("enterOrExitLabel", Objects.toString(snap.get("enterOrExitLabel"), ""));
            vars.put("swingTime", swingTime);

            // 解析规则配置的推送目标用户（列不存在时回退为空，不影响主流程）
            Set<String> targetUserIds = new LinkedHashSet<>();
            try {
                String userIdsJson = mapper.findNotifyUserIdsById(rule.getId());
                if (userIdsJson != null && !userIdsJson.isBlank()) {
                    try {
                        // 格式: ["id1","id2"] 或 [{"id":"x","name":"y"},...]
                        List<Object> raw = objectMapper.readValue(userIdsJson, new TypeReference<List<Object>>() {});
                        for (Object item : raw) {
                            if (item instanceof String s) targetUserIds.add(s);
                            else if (item instanceof Map<?, ?> m && m.get("id") instanceof String s) targetUserIds.add(s);
                        }
                    } catch (Exception e2) { log.debug("[swipe-alert] parse notifyUserIds: {}", e2.getMessage()); }
                }
            } catch (Exception e) {
                log.debug("[swipe-alert] notifyUserIds lookup failed (column not ready): {}", e.getMessage());
            }

            // 连带通知刷卡人本人
            if (Boolean.TRUE.equals(rule.getNotifyCardholder())) {
                String cardholderId = Objects.toString(snap.get("aroUserId"), "");
                log.info("[swipe-alert] notifyCardholder: person={} aroUserId={} snap={}",
                        person, cardholderId, snap.keySet());
                if (!cardholderId.isBlank()) targetUserIds.add(cardholderId);
            }

            if (targetUserIds.isEmpty()) {
                pushService.send("SWIPE_FAILURE_ALERT", vars);
            } else {
                pushService.send("SWIPE_FAILURE_ALERT", vars, targetUserIds);
            }
            log.info("[swipe-alert] push alert fired ruleId={} count={} targets={}", rule.getId(), count, targetUserIds.size());
        } catch (Exception e) {
            log.warn("[swipe-alert] push failed: {}", e.getMessage());
        }
    }

    private Map<String, Object> buildAlert(SwipeAlertRule rule, int count,
                                            DahuaRecordDTO record) {
        String channel = Objects.toString(record.getChannelName(), "");
        String person  = Objects.toString(record.getPersonName(), "");

        // Enrich the record snapshot with personnel + ARO data
        Map<String, Object> recordSnap = enrichRecordSnap(record);
        String dept = Objects.toString(recordSnap.get("departmentName"), "");

        String winMin  = String.valueOf(rule.getThresholdWindowSec() != null
                ? rule.getThresholdWindowSec() / 60 : 0);
        String winSec  = String.valueOf(rule.getThresholdWindowSec() != null
                ? rule.getThresholdWindowSec() : 0);
        String threshold = String.valueOf(rule.getThresholdCount() != null
                ? rule.getThresholdCount() : 0);

        String openTypeLabel = Objects.toString(recordSnap.get("openTypeLabel"), "");
        String enterOrExitLabel = Objects.toString(recordSnap.get("enterOrExitLabel"), "");
        String swingTime = Objects.toString(recordSnap.get("swingTime"), "");

        String title = (rule.getTitleTemplate() != null ? rule.getTitleTemplate() : "")
                .replace("${dept}", dept)
                .replace("${channel}", channel)
                .replace("${count}", String.valueOf(count))
                .replace("${windowMin}", winMin)
                .replace("${windowSec}", winSec)
                .replace("${threshold}", threshold)
                .replace("${persons}", person)
                .replace("${openTypeLabel}", openTypeLabel)
                .replace("${enterOrExitLabel}", enterOrExitLabel)
                .replace("${swingTime}", swingTime);

        String body = (rule.getBodyTemplate() != null ? rule.getBodyTemplate() : "")
                .replace("${dept}", dept)
                .replace("${channel}", channel)
                .replace("${count}", String.valueOf(count))
                .replace("${windowMin}", winMin)
                .replace("${windowSec}", winSec)
                .replace("${threshold}", threshold)
                .replace("${persons}", person)
                .replace("${openTypeLabel}", openTypeLabel)
                .replace("${enterOrExitLabel}", enterOrExitLabel)
                .replace("${swingTime}", swingTime);

        Map<String, Object> alert = new LinkedHashMap<>();
        alert.put("alertId", UUID.randomUUID().toString());
        alert.put("ruleId", rule.getId());
        alert.put("ruleName", rule.getName());
        alert.put("title", title);
        alert.put("body", body);
        alert.put("count", count);
        alert.put("windowSec", rule.getThresholdWindowSec());
        alert.put("bannerDurationSec", rule.getBannerDurationSec());
        alert.put("matchedRecords", Collections.singletonList(recordSnap));

        return alert;
    }

    // =========================================================================
    // ACK — admin acknowledged an alert
    // =========================================================================

    /**
     * Called when an admin clicks "已读" on a swipe-failure alert.
     * Resets the cooldown timer and clears the sliding window for the rule
     * so that only failures occurring AFTER the acknowledgement count toward
     * the next alert.
     */
    public void acknowledgeAlert(String alertId, Long ruleId) {
        if (ruleId == null) return;
        long now = System.currentTimeMillis();
        lastFireMap.put(ruleId, now);              // extend cooldown
        windowStateMap.remove(ruleId);             // discard current window → next failure starts fresh
        log.info("[swipe-alert] ack reset: alertId={} ruleId={} cooldown+window cleared", alertId, ruleId);
    }

    // =========================================================================
    // Broadcast
    // =========================================================================

}
