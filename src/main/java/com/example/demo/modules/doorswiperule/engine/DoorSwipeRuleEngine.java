package com.example.demo.modules.doorswiperule.engine;

import com.example.demo.modules.dahua.service.DahuaOpenApiService;
import com.example.demo.modules.doorswiperule.entity.DoorSwipeRuleConfig;
import com.example.demo.modules.doorswiperule.entity.DoorSwipeRuleRecord;
import com.example.demo.modules.doorswiperule.mapper.DoorSwipeRuleChannelScopeMapper;
import com.example.demo.modules.doorswiperule.mapper.DoorSwipeRuleConfigMapper;
import com.example.demo.modules.doorswiperule.mapper.DoorSwipeRuleRecordMapper;
import com.example.demo.modules.twin.common.service.TwinAutomationLogService;
import com.example.demo.modules.twin.dahua.entity.DahuaSwingRecord;
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
 * 门禁「成功刷卡」规则引擎（{@link DoorTempUnlockEngine} 的成功版镜像）。
 *
 * <ul>
 *   <li>openType=51（成功刷卡）且通道在受控通道 scope 内才消费</li>
 *   <li>独立记录库 {@code door_swipe_rule_record} 只落受控通道（INSERT IGNORE 去重）</li>
 *   <li>命中 enabled 规则（通道 + 人员范围）→ 按 ruleId:channelCode:personIdentifier 窗口计数（锚定 swingTime）</li>
 *   <li>达阈值且冷却未到 → 记录 beforeMode → STAY_OPEN，到期恢复 beforeMode（未知回退 NORMAL）</li>
 * </ul>
 */
@Service
public class DoorSwipeRuleEngine {

    private static final Logger log = LoggerFactory.getLogger(DoorSwipeRuleEngine.class);

    public static final String TYPE_DOOR_SWIPE_RULE = "DOOR_SWIPE_RULE";
    public static final String EVENT_TRIGGERED = "SWIPE_RULE_TRIGGERED";
    public static final String EVENT_RESTORED = "SWIPE_RULE_RESTORED";
    public static final String EVENT_SKIPPED = "SWIPE_RULE_SKIPPED";
    public static final String EVENT_COOLDOWN = "SWIPE_RULE_COOLDOWN";
    public static final String TRIGGER_SYSTEM = "SYSTEM";
    public static final String CREATED_BY = "door-swipe-rule";

    private final DoorSwipeRuleConfigMapper configMapper;
    private final DoorSwipeRuleChannelScopeMapper channelScopeMapper;
    private final DoorSwipeRuleRecordMapper recordMapper;
    private final DahuaOpenApiService dahuaOpenApiService;
    private final TwinAutomationLogService automationLogService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 固定窗口：key = "ruleId:channelCode:personIdentifier" */
    private static class FixedWindow {
        final long windowStart;
        int count;
        final AtomicBoolean fired = new AtomicBoolean(false);

        FixedWindow(long windowStart, int count) {
            this.windowStart = windowStart;
            this.count = count;
        }
    }

    /** 待恢复：channelCode -> 到期时间 + 触发前 workMode */
    private static class PendingRestore {
        final long deadlineMs;
        final String beforeMode;

        PendingRestore(long deadlineMs, String beforeMode) {
            this.deadlineMs = deadlineMs;
            this.beforeMode = beforeMode;
        }
    }

    private final Map<String, FixedWindow> windowStateMap = new ConcurrentHashMap<>();
    private final Map<String, Long> cooldownMap = new ConcurrentHashMap<>();
    private final Map<String, PendingRestore> pendingRestoreMap = new ConcurrentHashMap<>();
    private final Map<String, Long> processedRecords = new ConcurrentHashMap<>();

    private volatile List<DoorSwipeRuleConfig> activeRules = List.of();
    private volatile Set<String> enabledChannels = Set.of();
    private volatile long lastReloadTime = 0;
    private volatile long lastCleanupTime = System.currentTimeMillis();
    private static final long RELOAD_INTERVAL_MS = 30_000;

    public DoorSwipeRuleEngine(DoorSwipeRuleConfigMapper configMapper,
                               DoorSwipeRuleChannelScopeMapper channelScopeMapper,
                               DoorSwipeRuleRecordMapper recordMapper,
                               DahuaOpenApiService dahuaOpenApiService,
                               TwinAutomationLogService automationLogService) {
        this.configMapper = configMapper;
        this.channelScopeMapper = channelScopeMapper;
        this.recordMapper = recordMapper;
        this.dahuaOpenApiService = dahuaOpenApiService;
        this.automationLogService = automationLogService;
    }

    @PostConstruct
    public void reload() {
        reloadRules();
        reloadChannels();
        lastReloadTime = System.currentTimeMillis();
    }

    public void reloadRules() {
        try {
            activeRules = configMapper.findByEnabledTrue();
        } catch (Exception e) {
            log.warn("[door-swipe-rule] 载入规则失败(表可能尚未就绪): {}", e.getMessage());
            // keep previous rules — do NOT reset to empty
        }
    }

    public void reloadChannels() {
        try {
            enabledChannels = new HashSet<>(channelScopeMapper.enabledChannelCodes());
        } catch (Exception e) {
            log.warn("[door-swipe-rule] 载入受控通道失败: {}", e.getMessage());
        }
    }

    // =========================================================================
    // Public API
    // =========================================================================

    public void onSwingRecord(DahuaSwingRecord r) {
        if (r == null) return;

        long nowMs = System.currentTimeMillis();
        if (nowMs - lastReloadTime > RELOAD_INTERVAL_MS) {
            reloadRules();
            reloadChannels();
            lastReloadTime = nowMs;
        }

        // 仅消费成功刷卡（openType=51），其它直接忽略
        Integer openType = r.getOpenType();
        if (openType == null || openType != 51) {
            log.debug("[door-swipe-rule] 非成功刷卡(openType!=51)跳过 recordId={} openType={}", r.getRecordId(), openType);
            return;
        }

        String channelCode = r.getChannelCode();
        if (channelCode == null || channelCode.isBlank()) {
            return;
        }

        // 通道须在受控通道 scope 内（总闸），否则记录不入库、规则不触发
        if (!enabledChannels.contains(channelCode.trim())) {
            log.info("[door-swipe-rule] 通道未在受控通道内，跳过 recordId={} channelCode={}", r.getRecordId(), channelCode);
            return;
        }

        // 独立记录库：INSERT IGNORE，仅受控通道
        try {
            DoorSwipeRuleRecord rec = new DoorSwipeRuleRecord();
            rec.setRecordId(r.getRecordId());
            rec.setCardNumber(r.getCardNumber());
            rec.setChannelCode(r.getChannelCode());
            rec.setChannelName(r.getChannelName());
            rec.setOpenType(r.getOpenType());
            rec.setPersonCode(r.getPersonCode());
            rec.setPersonId(r.getPersonId());
            rec.setPersonName(r.getPersonName());
            rec.setDepartmentId(r.getDepartmentId());
            rec.setSwingTime(r.getSwingTime());
            rec.setCreateTime(r.getCreateTime());
            rec.setOpenResult(r.getOpenResult());
            rec.setEnterOrExit(r.getEnterOrExit());
            rec.setRawJson(r.getRawJson());
            recordMapper.insertIgnore(rec);
            log.info("[door-swipe-rule] 记录入库 recordId={} channelCode={} person={} openType={}",
                    r.getRecordId(), r.getChannelCode(), r.getPersonName(), r.getOpenType());
        } catch (Exception e) {
            log.warn("[door-swipe-rule] 记录库写入失败: {}", e.getMessage());
        }

        // 内存去重：同一条 webhook 记录只进一次规则判定
        String recordId = r.getRecordId();
        if (recordId != null && !recordId.isBlank()) {
            Long lastSeen = processedRecords.putIfAbsent(recordId, nowMs);
            if (lastSeen != null) return;
        }

        // 定期清理
        if (nowMs - lastCleanupTime > 300_000) {
            processedRecords.values().removeIf(t -> nowMs - t > 600_000);
            cleanupMemoryMaps(nowMs);
            lastCleanupTime = nowMs;
        }

        String personIdentifier = resolvePersonIdentifier(r);
        if (personIdentifier == null || personIdentifier.isBlank()) {
            return;
        }

        // 窗口锚定刷卡真实时间 swingTime（已减9分钟对齐 UTC+8）
        long eventTimeMs = parseSwingTimeMs(r.getSwingTime(), nowMs);

        for (DoorSwipeRuleConfig rule : activeRules) {
            if (!Boolean.TRUE.equals(rule.getEnabled())) continue;
            if (!matchesChannel(rule, channelCode)) continue;
            if (!matchesScope(rule, r)) continue;

            Integer windowSec = rule.getThresholdWindowSec();
            Integer thresholdCount = rule.getThresholdCount();
            if (windowSec == null || thresholdCount == null || thresholdCount <= 0) continue;

            long windowMs = windowSec * 1000L;
            String stateKey = rule.getId() + ":" + channelCode + ":" + personIdentifier;

            FixedWindow w = windowStateMap.compute(stateKey, (k, prev) -> {
                if (prev == null || eventTimeMs > prev.windowStart + windowMs) {
                    return new FixedWindow(eventTimeMs, 1);
                }
                prev.count++;
                return prev;
            });
            int currentCount = w.count;

            if (currentCount >= thresholdCount) {
                Integer cooldownSec = rule.getCooldownSec();
                if (cooldownSec != null && cooldownSec > 0) {
                    Long lastUnlock = cooldownMap.get(stateKey);
                    if (lastUnlock != null && (nowMs - lastUnlock) < cooldownSec * 1000L) {
                        log.info("[door-swipe-rule] 冷却中 key={} 跳过", stateKey);
                        writeAutomationLog(EVENT_COOLDOWN, rule, channelCode, r.getChannelName(),
                                personIdentifier, false,
                                "通道[" + channelCode + "]" + nz(r.getChannelName())
                                + " 人员[" + personIdentifier + "] 冷却中，跳过常开");
                        continue;
                    }
                }

                if (!w.fired.compareAndSet(false, true)) {
                    continue;
                }

                String currentWorkMode = queryCurrentWorkMode(channelCode);
                if ("STAY_CLOSE".equals(currentWorkMode)) {
                    writeAutomationLog(EVENT_SKIPPED, rule, channelCode, r.getChannelName(),
                            personIdentifier, true,
                            "通道[" + channelCode + "]" + nz(r.getChannelName())
                            + " 当前常闭模式，跳过常开。人员[" + personIdentifier + "]"
                            + " 成功" + currentCount + "次/" + windowSec + "秒");
                    continue;
                }
                if ("STAY_OPEN".equals(currentWorkMode) || pendingRestoreMap.containsKey(channelCode)) {
                    log.info("[door-swipe-rule] 通道{}已常开，重复命中跳过", channelCode);
                    continue;
                }

                try {
                    cooldownMap.put(stateKey, nowMs);

                    Integer staySec = rule.getStayOpenDurationSec();
                    if (staySec == null || staySec <= 0) staySec = 120;

                    Map<String, Object> resp = dahuaOpenApiService.controlDoor("STAY_OPEN", List.of(channelCode));
                    boolean success = dahuaOpenApiService.isSuccess(resp);

                    if (success) {
                        String beforeMode = "UNKNOWN".equals(currentWorkMode) ? "NORMAL" : currentWorkMode;
                        long deadline = nowMs + staySec * 1000L;
                        pendingRestoreMap.merge(channelCode, new PendingRestore(deadline, beforeMode),
                                (old, neu) -> old.deadlineMs >= neu.deadlineMs ? old : neu);
                    }

                    writeAutomationLog(EVENT_TRIGGERED, rule, channelCode, r.getChannelName(),
                            personIdentifier, success,
                            "通道[" + channelCode + "]" + nz(r.getChannelName())
                            + " 刷卡成功" + currentCount + "次/" + windowSec + "秒"
                            + "，常开" + staySec + "秒"
                            + "，人员[" + personIdentifier + "]"
                            + (success ? "" : " 执行失败"));
                } catch (Exception e) {
                    log.error("[door-swipe-rule] 执行 STAY_OPEN 失败 channel={}: {}", channelCode, e.getMessage());
                    writeAutomationLog(EVENT_TRIGGERED, rule, channelCode, r.getChannelName(),
                            personIdentifier, false,
                            "通道[" + channelCode + "]" + nz(r.getChannelName())
                            + " 执行常开失败：" + e.getMessage()
                            + "，人员[" + personIdentifier + "]");
                }
            }
        }
    }

    // =========================================================================
    // Scheduled restore — 到期恢复触发前状态（未知回退 NORMAL）
    // =========================================================================

    @Scheduled(fixedDelay = 2_000)
    public void restoreExpiredDoors() {
        if (pendingRestoreMap.isEmpty()) return;

        long nowMs = System.currentTimeMillis();
        List<Map.Entry<String, PendingRestore>> toRestore = new ArrayList<>();
        for (Map.Entry<String, PendingRestore> entry : pendingRestoreMap.entrySet()) {
            if (nowMs >= entry.getValue().deadlineMs) {
                toRestore.add(entry);
            }
        }

        for (Map.Entry<String, PendingRestore> entry : toRestore) {
            String channelCode = entry.getKey();
            PendingRestore pending = entry.getValue();
            if (!pendingRestoreMap.remove(channelCode, pending)) {
                continue; // deadline 已被更新，跳过本轮
            }
            String beforeMode = pending.beforeMode == null || pending.beforeMode.isBlank()
                    ? "NORMAL" : pending.beforeMode;
            try {
                Map<String, Object> resp = dahuaOpenApiService.controlDoor(beforeMode, List.of(channelCode));
                boolean success = dahuaOpenApiService.isSuccess(resp);

                writeAutomationLog(EVENT_RESTORED, null, channelCode, null,
                        null, success,
                        "通道[" + channelCode + "] 恢复触发前状态 " + beforeMode
                        + (success ? "" : " 执行失败"));

                log.info("[door-swipe-rule] 恢复 channel={} mode={} success={}", channelCode, beforeMode, success);
            } catch (Exception e) {
                log.error("[door-swipe-rule] 恢复 {} 失败 channel={}: {}", beforeMode, channelCode, e.getMessage());
                writeAutomationLog(EVENT_RESTORED, null, channelCode, null,
                        null, false,
                        "通道[" + channelCode + "] 恢复 " + beforeMode + " 失败：" + e.getMessage());
            }
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private String resolvePersonIdentifier(DahuaSwingRecord r) {
        String id = r.getPersonCode();
        if (id != null && !id.isBlank()) return id;
        id = r.getPersonName();
        if (id != null && !id.isBlank()) return id;
        return r.getCardNumber();
    }

    private boolean matchesChannel(DoorSwipeRuleConfig rule, String channelCode) {
        String channelsJson = rule.getChannelCodes();
        if (channelsJson == null || channelsJson.isBlank()) return false;
        try {
            List<String> allowed = objectMapper.readValue(channelsJson, new TypeReference<List<String>>() {});
            if (allowed == null || allowed.isEmpty()) return false;
            return allowed.contains(channelCode.trim());
        } catch (Exception e) {
            log.debug("[door-swipe-rule] 通道列表解析失败 ruleId={}", rule.getId(), e);
            return false;
        }
    }

    /** 人员范围匹配：ALL 恒真；PERSON/DEPARTMENT/CARD 分别按 personCode/departmentId/cardNumber 命中 */
    private boolean matchesScope(DoorSwipeRuleConfig rule, DahuaSwingRecord r) {
        String scopeType = rule.getScopeType() == null ? "ALL" : rule.getScopeType().trim().toUpperCase(Locale.ROOT);
        if (scopeType.isBlank() || "ALL".equals(scopeType)) {
            return true;
        }
        List<String> values = parseStringList(rule.getScopeValues());
        if (values.isEmpty()) return false;
        return switch (scopeType) {
            case "PERSON" -> values.contains(nz(r.getPersonCode()).trim());
            case "DEPARTMENT" -> values.contains(nz(r.getDepartmentId()).trim());
            case "CARD" -> values.contains(nz(r.getCardNumber()).trim());
            default -> false;
        };
    }

    private List<String> parseStringList(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<String> list = objectMapper.readValue(json, new TypeReference<List<String>>() {});
            return list == null ? List.of() : list;
        } catch (Exception e) {
            return List.of();
        }
    }

    /** swingTime 已由 DahuaService.adjustSwingTime9Min 对齐真实时间，时区 Asia/Shanghai(UTC+8) */
    private static long parseSwingTimeMs(String swingTime, long fallbackMs) {
        if (swingTime == null || swingTime.isBlank()) return fallbackMs;
        try {
            LocalDateTime dt = LocalDateTime.parse(swingTime, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            return dt.toInstant(ZoneOffset.ofHours(8)).toEpochMilli();
        } catch (Exception e) {
            return fallbackMs;
        }
    }

    private String queryCurrentWorkMode(String channelCode) {
        try {
            Map<String, Object> resp = dahuaOpenApiService.queryDoorStatus(channelCode, null, null);
            if (!dahuaOpenApiService.isSuccess(resp)) {
                return "UNKNOWN";
            }
            List<Map<String, Object>> rows = DahuaOpenApiService.asListOfMap(resp.get("data"));
            if (rows.isEmpty()) return "UNKNOWN";
            Object wm = rows.get(0).get("workMode");
            if (wm == null) return "UNKNOWN";
            int mode = DahuaOpenApiService.parseInt(wm, -1);
            return switch (mode) {
                case 2 -> "STAY_OPEN";
                case 1 -> "STAY_CLOSE";
                case 0 -> "NORMAL";
                default -> "UNKNOWN";
            };
        } catch (Exception e) {
            log.warn("[door-swipe-rule] 查询通道状态失败 channel={}: {}", channelCode, e.getMessage());
            return "UNKNOWN";
        }
    }

    private void cleanupMemoryMaps(long nowMs) {
        windowStateMap.entrySet().removeIf(e -> {
            FixedWindow w = e.getValue();
            return w != null && nowMs - w.windowStart > 600_000;
        });
        cooldownMap.entrySet().removeIf(e -> nowMs - e.getValue() > 1_800_000);
        log.debug("[door-swipe-rule] 内存清理: windows={}, cooldowns={}",
                windowStateMap.size(), cooldownMap.size());
    }

    private void writeAutomationLog(String eventKey, DoorSwipeRuleConfig rule,
                                    String channelCode, String channelName,
                                    String personIdentifier, boolean success, String detail) {
        try {
            String triggerReason = rule != null ? rule.getName() : "restore-task";
            automationLogService.write(
                    TYPE_DOOR_SWIPE_RULE,
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
            log.warn("[door-swipe-rule] 写操作记录失败: {}", e.getMessage());
        }
    }

    private static String nz(String s) {
        return s == null || s.isBlank() ? "" : s;
    }
}
