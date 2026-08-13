package com.example.demo.modules.doortempunlock.engine;

import com.example.demo.modules.dahua.dto.DahuaRecordDTO;
import com.example.demo.modules.dahua.service.DahuaOpenApiService;
import com.example.demo.modules.doortempunlock.entity.DoorTempUnlockRule;
import com.example.demo.modules.doortempunlock.mapper.DoorTempUnlockRuleMapper;
import com.example.demo.modules.twin.common.service.TwinAutomationLogService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Core engine for door temporary unlock.
 *
 * <p>Responsibilities:</p>
 * <ul>
 *   <li>Watches swing records as they are persisted</li>
 *   <li>Matches each failed record against active unlock rules</li>
 *   <li>Maintains sliding window counters per rule:channel:person</li>
 *   <li>Queries door status before acting</li>
 *   <li>Executes STAY_OPEN when threshold breached (only if current workMode is NORMAL)</li>
 *   <li>Schedules restore to NORMAL after configured duration</li>
 *   <li>Enforces per-person-per-channel cooldown</li>
 *   <li>Writes all actions to automation logs</li>
 * </ul>
 */
@Service
public class DoorTempUnlockEngine {

    private static final Logger log = LoggerFactory.getLogger(DoorTempUnlockEngine.class);

    public static final String TYPE_DOOR_TEMP_UNLOCK = "DOOR_TEMP_UNLOCK";
    public static final String EVENT_TRIGGERED = "TEMP_UNLOCK_TRIGGERED";
    public static final String EVENT_RESTORED = "TEMP_UNLOCK_RESTORED";
    public static final String EVENT_SKIPPED = "TEMP_UNLOCK_SKIPPED";
    public static final String EVENT_COOLDOWN = "TEMP_UNLOCK_COOLDOWN";
    public static final String TRIGGER_SYSTEM = "SYSTEM";
    public static final String CREATED_BY = "door-temp-unlock";

    private final DoorTempUnlockRuleMapper mapper;
    private final DahuaOpenApiService dahuaOpenApiService;
    private final TwinAutomationLogService automationLogService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // ---- Fixed-window state: key = "ruleId:channelCode:personIdentifier" ----
    private static class FixedWindow {
        final long windowStart;
        int count;
        final AtomicBoolean fired = new AtomicBoolean(false);

        FixedWindow(long windowStart, int count) {
            this.windowStart = windowStart;
            this.count = count;
        }
    }

    private final Map<String, FixedWindow> windowStateMap = new ConcurrentHashMap<>();
    private final Map<String, Long> cooldownMap = new ConcurrentHashMap<>();

    /** Pending restore: channelCode -> scheduled restore epoch ms */
    private final Map<String, Long> pendingRestoreMap = new ConcurrentHashMap<>();

    /** Dedup: recordId -> processTime */
    private final Map<String, Long> processedRecords = new ConcurrentHashMap<>();
    private volatile long lastCleanupTime = System.currentTimeMillis();
    private volatile long lastMemoryCleanupTime = System.currentTimeMillis();

    /** Cached active rules */
    private volatile List<DoorTempUnlockRule> activeRules = List.of();
    private volatile long lastReloadTime = 0;
    private static final long RELOAD_INTERVAL_MS = 30_000;

    public DoorTempUnlockEngine(DoorTempUnlockRuleMapper mapper,
                                 DahuaOpenApiService dahuaOpenApiService,
                                 TwinAutomationLogService automationLogService) {
        this.mapper = mapper;
        this.dahuaOpenApiService = dahuaOpenApiService;
        this.automationLogService = automationLogService;
    }

    @PostConstruct
    public void reloadRules() {
        try {
            List<DoorTempUnlockRule> rules = mapper.findByEnabledTrue();
            activeRules = rules;
            lastReloadTime = System.currentTimeMillis();
            log.info("[door-temp-unlock] rules reloaded, count={}", rules.size());
        } catch (Exception e) {
            log.warn("[door-temp-unlock] unable to load rules (table may not exist yet): {}", e.getMessage());
            // keep previous rules — do NOT reset to empty
        }
    }

    // =========================================================================
    // Public API
    // =========================================================================

    public void onSwingRecord(DahuaRecordDTO record) {
        if (record == null) return;

        long nowMs = System.currentTimeMillis();
        if (nowMs - lastReloadTime > RELOAD_INTERVAL_MS) {
            reloadRules();
            lastReloadTime = nowMs;
        }

        // Only process illegal-swipe records (openType=52 = 非法刷卡/刷卡失败),
        // matching the existing "刷卡失败报警" semantics. openResult is unreliable
        // here (illegal swipes may still report openResult=1).
        Integer openType = record.getOpenType();
        if (openType == null || openType != 52) {
            if (log.isDebugEnabled()) {
                log.debug("[door-temp-unlock] skip non-illegal record: openType={} channel={} person={}",
                        openType, record.getChannelCode(), record.getPersonName());
            }
            return;
        }

        // Dedup
        String recordId = record.getId();
        if (recordId != null && !recordId.isBlank()) {
            Long lastSeen = processedRecords.putIfAbsent(recordId, System.currentTimeMillis());
            if (lastSeen != null) return;
        }

        // Periodic dedup cleanup (every 5 min)
        long now = System.currentTimeMillis();
        if (now - lastCleanupTime > 300_000) {
            processedRecords.values().removeIf(t -> now - t > 600_000);
            lastCleanupTime = now;
        }

        // Periodic memory cleanup for window & cooldown maps (every 5 min)
        if (now - lastMemoryCleanupTime > 300_000) {
            cleanupMemoryMaps(now);
            lastMemoryCleanupTime = now;
        }

        String channelCode = record.getChannelCode();
        if (channelCode == null || channelCode.isBlank()) {
            log.warn("[door-temp-unlock] illegal record with blank channelCode, skipped: recordId={}", recordId);
            return;
        }

        String personIdentifier = resolvePersonIdentifier(record);
        if (personIdentifier == null || personIdentifier.isBlank()) {
            log.warn("[door-temp-unlock] illegal record with no person identifier, skipped: recordId={} channel={}",
                    recordId, channelCode);
            return;
        }

        log.info("[door-temp-unlock] processing illegal swipe: channel={} person={} openType={}",
                channelCode, personIdentifier, openType);

        // 用刷卡真实时间(swingTime)做窗口判定，而非处理时间(nowMs)。
        // 否则服务器卡顿导致记录滞后批量到达时，会被误判为「短时间集中失败」。
        long eventTimeMs = parseSwingTimeMs(record.getSwingTime(), nowMs);

        for (DoorTempUnlockRule rule : activeRules) {
            if (!Boolean.TRUE.equals(rule.getEnabled())) continue;
            if (!matchesChannel(rule, channelCode)) continue;

            Integer windowSec = rule.getThresholdWindowSec();
            Integer thresholdCount = rule.getThresholdCount();
            if (windowSec == null || thresholdCount == null || thresholdCount <= 0) continue;

            long windowMs = windowSec * 1000L;
            Long ruleId = rule.getId();
            String stateKey = ruleId + ":" + channelCode + ":" + personIdentifier;

            // Atomic window update (count increment + window reset on expiry).
            // 窗口锚定到刷卡真实时间 eventTimeMs，避免滞后批量到达被误判。
            FixedWindow w = windowStateMap.compute(stateKey, (k, prev) -> {
                if (prev == null || eventTimeMs > prev.windowStart + windowMs) {
                    return new FixedWindow(eventTimeMs, 1);
                }
                prev.count++;
                return prev;
            });
            int currentCount = w.count;

            // Threshold reached?
            if (currentCount >= thresholdCount) {
                // Cooldown check BEFORE claiming the window's fire slot, so a
                // cooldown-blocked attempt does not permanently swallow this window.
                Integer cooldownSec = rule.getCooldownSec();
                if (cooldownSec != null && cooldownSec > 0) {
                    Long lastUnlock = cooldownMap.get(stateKey);
                    if (lastUnlock != null && (nowMs - lastUnlock) < cooldownSec * 1000L) {
                        log.info("[door-temp-unlock] cooldown active for key={}, skipped", stateKey);
                        writeAutomationLog(EVENT_COOLDOWN, rule, channelCode, record.getChannelName(),
                                personIdentifier, false,
                                "通道[" + channelCode + "]" + nz(record.getChannelName())
                                + " 人员[" + personIdentifier + "] 冷却中，跳过解锁");
                        continue;
                    }
                }

                // Atomically claim this window's single fire slot
                if (!w.fired.compareAndSet(false, true)) {
                    continue; // another thread already fired for this window
                }

                // Query current door status
                String currentWorkMode = queryCurrentWorkMode(channelCode);
                log.info("[door-temp-unlock] channel={} currentWorkMode={}", channelCode, currentWorkMode);

                if ("STAY_CLOSE".equals(currentWorkMode)) {
                    writeAutomationLog(EVENT_SKIPPED, rule, channelCode, record.getChannelName(),
                            personIdentifier, true,
                            "通道[" + channelCode + "]" + nz(record.getChannelName())
                            + " 当前常闭模式，跳过解锁。人员[" + personIdentifier + "]"
                            + " 失败" + currentCount + "次/" + windowSec + "秒");
                    continue;
                }

                if ("STAY_OPEN".equals(currentWorkMode)) {
                    log.info("[door-temp-unlock] channel={} already STAY_OPEN, skipped", channelCode);
                    continue;
                }

                // 普通模式 → 执行常开
                try {
                    cooldownMap.put(stateKey, nowMs);

                    Integer unlockSec = rule.getUnlockDurationSec();
                    if (unlockSec == null || unlockSec <= 0) unlockSec = 120;

                    Map<String, Object> resp = dahuaOpenApiService.controlDoor("STAY_OPEN", List.of(channelCode));
                    boolean success = dahuaOpenApiService.isSuccess(resp);

                    if (success) {
                        // Use merge with Math.max to avoid shortening an existing longer unlock
                        long newDeadline = nowMs + unlockSec * 1000L;
                        pendingRestoreMap.merge(channelCode, newDeadline, Math::max);
                    }

                    writeAutomationLog(EVENT_TRIGGERED, rule, channelCode, record.getChannelName(),
                            personIdentifier, success,
                            "通道[" + channelCode + "]" + nz(record.getChannelName())
                            + " 刷卡失败" + currentCount + "次/" + windowSec + "秒"
                            + "，解锁" + unlockSec + "秒"
                            + "，人员[" + personIdentifier + "]"
                            + (success ? "" : " 执行失败"));

                } catch (Exception e) {
                    log.error("[door-temp-unlock] execute STAY_OPEN failed for channel={}: {}",
                            channelCode, e.getMessage());
                    writeAutomationLog(EVENT_TRIGGERED, rule, channelCode, record.getChannelName(),
                            personIdentifier, false,
                            "通道[" + channelCode + "]" + nz(record.getChannelName())
                            + " 执行常开失败：" + e.getMessage()
                            + "，人员[" + personIdentifier + "]");
                }
            }
        }
    }

    // =========================================================================
    // Scheduled restore — scans every 2 seconds
    // =========================================================================

    @Scheduled(fixedDelay = 2_000)
    public void restoreExpiredDoors() {
        if (pendingRestoreMap.isEmpty()) return;

        long nowMs = System.currentTimeMillis();
        List<Map.Entry<String, Long>> toRestore = new ArrayList<>();

        for (Map.Entry<String, Long> entry : pendingRestoreMap.entrySet()) {
            if (nowMs >= entry.getValue()) {
                toRestore.add(entry);
            }
        }

        for (Map.Entry<String, Long> entry : toRestore) {
            // Only remove if the deadline hasn't changed (race-safe)
            if (!pendingRestoreMap.remove(entry.getKey(), entry.getValue())) {
                continue; // deadline was updated by onSwingRecord, skip this cycle
            }
            String channelCode = entry.getKey();
            try {
                Map<String, Object> resp = dahuaOpenApiService.controlDoor("NORMAL", List.of(channelCode));
                boolean success = dahuaOpenApiService.isSuccess(resp);

                writeAutomationLog(EVENT_RESTORED, null, channelCode, null,
                        null, success,
                        "通道[" + channelCode + "] 恢复普通模式"
                        + (success ? "" : " 执行失败"));

                log.info("[door-temp-unlock] restore channel={} success={}", channelCode, success);
            } catch (Exception e) {
                log.error("[door-temp-unlock] restore NORMAL failed for channel={}: {}",
                        channelCode, e.getMessage());
                writeAutomationLog(EVENT_RESTORED, null, channelCode, null,
                        null, false,
                        "通道[" + channelCode + "] 恢复普通模式失败：" + e.getMessage());
            }
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private String resolvePersonIdentifier(DahuaRecordDTO record) {
        String id = record.getPersonCode();
        if (id != null && !id.isBlank()) return id;
        id = record.getPersonName();
        if (id != null && !id.isBlank()) return id;
        return record.getCardNumber();
    }

    private boolean matchesChannel(DoorTempUnlockRule rule, String channelCode) {
        String channelsJson = rule.getChannelCodes();
        if (channelsJson == null || channelsJson.isBlank()) return false;
        try {
            List<String> allowedChannels = objectMapper.readValue(
                    channelsJson, new TypeReference<List<String>>() {});
            if (allowedChannels == null || allowedChannels.isEmpty()) return false;
            return allowedChannels.contains(channelCode.trim());
        } catch (Exception e) {
            log.debug("[door-temp-unlock] channels parse error for rule id={}", rule.getId(), e);
            return false;
        }
    }

    /**
     * 解析刷卡真实时间(yyyy-MM-dd HH:mm:ss)为 epoch ms。空值/解析失败时回退到处理时间，
     * 保证滞后记录仍以真实刷卡时刻参与窗口判定。
     */
    private static long parseSwingTimeMs(String swingTime, long fallbackMs) {
        if (swingTime == null || swingTime.isBlank()) return fallbackMs;
        try {
            LocalDateTime dt = LocalDateTime.parse(
                    swingTime, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            // swingTime 已由 DahuaService.adjustSwingTime9Min 对齐真实时间，时区为 Asia/Shanghai(UTC+8)
            return dt.toInstant(ZoneOffset.ofHours(8)).toEpochMilli();
        } catch (Exception e) {
            return fallbackMs;
        }
    }

    private String queryCurrentWorkMode(String channelCode) {
        try {
            Map<String, Object> resp = dahuaOpenApiService.queryDoorStatus(channelCode, null, null);
            if (!dahuaOpenApiService.isSuccess(resp)) {
                log.warn("[door-temp-unlock] queryDoorStatus failed for channel={}, resp={}", channelCode, resp);
                return "UNKNOWN";
            }
            List<Map<String, Object>> rows = DahuaOpenApiService.asListOfMap(resp.get("data"));
            if (rows.isEmpty()) return "UNKNOWN";
            Map<String, Object> first = rows.get(0);
            Object wm = first.get("workMode");
            if (wm == null) return "UNKNOWN";
            int mode = DahuaOpenApiService.parseInt(wm, -1);
            return switch (mode) {
                case 2 -> "STAY_OPEN";
                case 1 -> "STAY_CLOSE";
                case 0 -> "NORMAL";
                default -> "UNKNOWN";
            };
        } catch (Exception e) {
            log.warn("[door-temp-unlock] query status failed for channel={}: {}", channelCode, e.getMessage());
            return "UNKNOWN";
        }
    }

    private void cleanupMemoryMaps(long nowMs) {
        // Remove expired windows (older than 10 min since windowStart)
        windowStateMap.entrySet().removeIf(e -> {
            FixedWindow w = e.getValue();
            return w != null && nowMs - w.windowStart > 600_000;
        });
        // Remove expired cooldowns (older than 30 min)
        cooldownMap.entrySet().removeIf(e -> nowMs - e.getValue() > 1_800_000);
        log.debug("[door-temp-unlock] memory cleanup: windows={}, cooldowns={}",
                windowStateMap.size(), cooldownMap.size());
    }

    private void writeAutomationLog(String eventKey, DoorTempUnlockRule rule,
                                     String channelCode, String channelName,
                                     String personIdentifier, boolean success, String detail) {
        try {
            String triggerReason = rule != null ? rule.getName() : "restore-task";
            automationLogService.write(
                    TYPE_DOOR_TEMP_UNLOCK,
                    eventKey,
                    TRIGGER_SYSTEM,
                    triggerReason,
                    personIdentifier,
                    channelCode,
                    success,
                    detail,
                    CREATED_BY
            );
        } catch (Exception e) {
            log.warn("[door-temp-unlock] write automation log failed: {}", e.getMessage());
        }
    }

    private static String nz(String s) {
        return s == null || s.isBlank() ? "" : s;
    }
}
