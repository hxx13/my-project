package com.example.demo.modules.swipealert.service;

import com.example.demo.modules.swipealert.entity.SwipeAlertRule;
import com.example.demo.modules.swipealert.mapper.SwipeAlertRuleMapper;
import com.example.demo.modules.dahua.dto.DahuaRecordDTO;
import com.corundumstudio.socketio.SocketIOServer;
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

    /** ARO status lookup — optional, may timeout */
    @Autowired(required = false)
    private com.example.demo.modules.aro.service.AroService aroService;

    /** In-memory sliding windows: ruleId -> deque of event timestamps (epoch ms). */
    private final Map<Long, Deque<Long>> windowMap = new ConcurrentHashMap<>();

    /** Cooldown: ruleId -> last fire timestamp (epoch ms). */
    private final Map<Long, Long> lastFireMap = new ConcurrentHashMap<>();

    /** Dedup: recordId -> processTime. Prevents same record triggering alerts on re-pull. */
    private final Map<String, Long> processedRecords = new ConcurrentHashMap<>();
    private volatile long lastCleanupTime = System.currentTimeMillis();

    /** Cached active rules, reloaded via {@link #reloadRules()}. */
    private volatile List<SwipeAlertRule> activeRules = List.of();

    public SwipeAlertEngine(SwipeAlertRuleMapper mapper,
                            @Autowired(required = false) SocketIOServer socketServer) {
        this.mapper = mapper;
        this.socketServer = socketServer;
    }

    @PostConstruct
    public void reloadRules() {
        try {
            activeRules = mapper.findByEnabledTrue();
            log.info("[swipe-alert] rules reloaded, count={}", activeRules.size());
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
                        Map<String, Object> dismiss = new LinkedHashMap<>();
                        dismiss.put("alertId", alertId);
                        dismiss.put("dismissedBy", userId);
                        socketServer.getBroadcastOperations().sendEvent(
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
     * Only processes failures ({@code openResult == 0}) and illegal opens
     * ({@code openType == 52}).
     */
    public void onSwingRecord(DahuaRecordDTO record) {
        if (record == null) return;

        Integer openResult = record.getOpenResult();
        Integer openType = record.getOpenType();

        if (openResult == null && openType == null) return;

        boolean isFailure = openResult != null && openResult == 0;
        boolean isIllegal = openType != null && openType == 52;

        if (!isFailure && !isIllegal) return;

        // Record-level dedup: skip if this exact record was already processed
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
            if (!matchesRule(rule, record, isFailure, isIllegal)) continue;

            Integer windowSec = rule.getThresholdWindowSec();
            Integer thresholdCount = rule.getThresholdCount();
            if (windowSec == null || thresholdCount == null || thresholdCount <= 0) {
                log.warn("[swipe-alert] rule id={} has null/zero window or threshold, skipping", rule.getId());
                continue;
            }

            // ---- sliding window ----
            Deque<Long> timestamps = windowMap.computeIfAbsent(
                    rule.getId(), k -> new ArrayDeque<>());
            long windowStart = now - windowSec * 1000L;
            while (!timestamps.isEmpty() && timestamps.peekFirst() < windowStart) {
                timestamps.pollFirst();
            }
            timestamps.addLast(now);

            // ---- threshold check ----
            if (timestamps.size() < thresholdCount) continue;

            // ---- cooldown check ----
            Integer cooldownSec = rule.getCooldownSec();
            if (cooldownSec != null && cooldownSec > 0) {
                Long lastFire = lastFireMap.get(rule.getId());
                if (lastFire != null && (now - lastFire) < cooldownSec * 1000L) {
                    continue;
                }
            }
            lastFireMap.put(rule.getId(), now);

            // ---- build & fire alert ----
            Map<String, Object> alert = buildAlert(rule, timestamps.size(), record);
            fireAlert(alert);

            // Clear window after firing so old timestamps don't re-trigger after cooldown
            timestamps.clear();
        }
    }

    // =========================================================================
    // Rule matching
    // =========================================================================

    private boolean matchesRule(SwipeAlertRule rule, DahuaRecordDTO record,
                                 boolean isFailure, boolean isIllegal) {
        // --- openTypes filter ---
        String openTypes = rule.getOpenTypes();
        if (openTypes != null && !openTypes.isBlank()) {
            Set<String> allowed = new HashSet<>(Arrays.asList(openTypes.split(",")));
            boolean matched = false;
            if (isIllegal && allowed.contains("52")) matched = true;
            if (isFailure && allowed.contains("0")) matched = true;
            if (!matched) return false;
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
        snap.put("openTypeLabel",
                record.getOpenType() != null && record.getOpenType() == 52
                        ? "非法刷卡开门" : "刷卡失败");
        snap.put("swingTime", Objects.toString(record.getSwingTime(), ""));
        snap.put("enterOrExit", record.getEnterOrExit());  // 1=进入, 2=离开

        // Hardware-level direction label
        if (record.getEnterOrExit() != null) {
            snap.put("enterOrExitLabel",
                    record.getEnterOrExit() == 1 ? "进入" : "离开");
        } else {
            snap.put("enterOrExitLabel", "");
        }

        // Try local personnel lookup by name for phone/department/userId
        String mobilePhone = "";
        String departmentName = "";
        String personCode = "";
        String userId = "";
        String aroStatus = "UNKNOWN";

        if (personnelMapper != null && !person.isBlank()) {
            try {
                List<Map<String, Object>> hits = personnelMapper.searchPersonnel(person, 3);
                if (hits != null && !hits.isEmpty()) {
                    Map<String, Object> p = hits.get(0);
                    mobilePhone = Objects.toString(p.get("mobile_phone"), "");
                    departmentName = Objects.toString(p.get("department_name"), "");
                    personCode = Objects.toString(p.get("job_number"), "");
                    userId = Objects.toString(p.get("user_id"), "");

                    // Query ARO current status
                    if (aroService != null && !userId.isBlank()) {
                        try {
                            List<?> noLeaveRooms = aroService.getNoLeaveRoom(userId);
                            if (noLeaveRooms != null && !noLeaveRooms.isEmpty()) {
                                aroStatus = "INSIDE";
                            } else {
                                aroStatus = "OUTSIDE";
                            }
                        } catch (Exception e) {
                            log.debug("[swipe-alert] ARO status lookup failed for userId={}: {}",
                                    userId, e.getMessage());
                            aroStatus = "UNKNOWN";
                        }
                    }
                }
            } catch (Exception e) {
                log.debug("[swipe-alert] personnel lookup failed for '{}': {}",
                        person, e.getMessage());
            }
        }

        snap.put("mobilePhone", mobilePhone);
        snap.put("departmentName", departmentName);
        snap.put("personCode", personCode);
        snap.put("aroUserId", userId);
        snap.put("aroStatus", aroStatus);

        return snap;
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

        String title = (rule.getTitleTemplate() != null ? rule.getTitleTemplate() : "")
                .replace("${dept}", dept)
                .replace("${channel}", channel)
                .replace("${count}", String.valueOf(count))
                .replace("${windowMin}", winMin)
                .replace("${windowSec}", winSec)
                .replace("${threshold}", threshold)
                .replace("${persons}", person);

        String body = (rule.getBodyTemplate() != null ? rule.getBodyTemplate() : "")
                .replace("${dept}", dept)
                .replace("${channel}", channel)
                .replace("${count}", String.valueOf(count))
                .replace("${windowMin}", winMin)
                .replace("${windowSec}", winSec)
                .replace("${threshold}", threshold)
                .replace("${persons}", person);

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
    // Broadcast
    // =========================================================================

    private void fireAlert(Map<String, Object> alert) {
        if (socketServer != null) {
            try {
                socketServer.getBroadcastOperations().sendEvent("SWIPE_FAILURE_ALERT", alert);
                log.info("[swipe-alert] fired alertId={} ruleId={} ruleName={} count={}",
                        alert.get("alertId"), alert.get("ruleId"),
                        alert.get("ruleName"), alert.get("count"));
            } catch (Exception e) {
                log.error("[swipe-alert] broadcast failed alertId={} ruleId={}",
                        alert.get("alertId"), alert.get("ruleId"), e);
            }
        } else {
            log.warn("[swipe-alert] socketServer not wired — alert dropped alertId={} ruleId={}",
                    alert.get("alertId"), alert.get("ruleId"));
        }
    }
}
