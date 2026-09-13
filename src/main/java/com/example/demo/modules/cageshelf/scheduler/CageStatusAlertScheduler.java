package com.example.demo.modules.cageshelf.scheduler;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.component.SocketRoomAssigner;
import com.example.demo.modules.cageshelf.entity.CageStatusAlert;
import com.example.demo.modules.cageshelf.mapper.CageStatusAlertMapper;
import com.example.demo.modules.cageshelf.service.CageAlertRuleService;
import com.example.demo.modules.cageshelf.service.CageAlertRuleService.EffectiveAlertRule;
import com.example.demo.modules.cageshelf.service.CageAlertViolationService;
import com.example.demo.modules.cageshelf.service.CageStatusIntervalService;
import com.example.demo.modules.cageshelf.service.CageStatusIntervalService.StatusInterval;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 笼位特殊状态持续超时告警引擎（T4）。
 *
 * <p>只做「读区间 + 读规则 + 读存量 → 决定意图 → 落库」，不建违规（违规联动是后续任务），
 * 不读快照，与老的快照告警链路零耦合。
 *
 * <p>调度器只负责查数据 → 调纯函数 {@link #decide} → 落库；决策逻辑全在纯函数里，不起 Spring 也能测。
 */
@Component
public class CageStatusAlertScheduler {

    private static final Logger log = LoggerFactory.getLogger(CageStatusAlertScheduler.class);

    /** MySQL GET_LOCK 锁名最长 64 字符。 */
    private static final String LOCK_NAME = "cage-status-alert-scan";
    private static final int LOCK_TIMEOUT_SEC = 10;

    private final CageStatusIntervalService intervalService;
    private final CageAlertRuleService ruleService;
    private final CageStatusAlertMapper mapper;
    private final CageAlertViolationService violationService;
    private final SocketIOServer socketServer;

    public CageStatusAlertScheduler(CageStatusIntervalService intervalService,
                                    CageAlertRuleService ruleService,
                                    CageStatusAlertMapper mapper,
                                    CageAlertViolationService violationService,
                                    @org.springframework.beans.factory.annotation.Autowired(required = false) SocketIOServer socketServer) {
        this.intervalService = intervalService;
        this.ruleService = ruleService;
        this.mapper = mapper;
        this.violationService = violationService;
        this.socketServer = socketServer;
    }

    @Scheduled(fixedDelayString = "${app.cage-status-alert.interval-ms:300000}",
            initialDelayString = "${app.cage-status-alert.initial-delay-ms:60000}",
            scheduler = "cageStatusAlertTaskScheduler")
    public void scan() {
        Integer locked = mapper.tryAcquireLock(LOCK_NAME, LOCK_TIMEOUT_SEC);
        if (locked == null || locked != 1) {
            log.info("[cage-status-alert] 上一轮未跑完或他实例持锁，跳过本轮");
            return;
        }
        try {
            runOnce();
        } catch (Exception e) {
            log.error("[cage-status-alert] 扫描异常: {}", e.getMessage(), e);
        } finally {
            try {
                mapper.releaseLock(LOCK_NAME);
            } catch (Exception e) {
                log.warn("[cage-status-alert] 释放锁失败: {}", e.getMessage());
            }
        }
    }

    private void runOnce() {
        LocalDateTime now = LocalDateTime.now();

        // 为什么 fold(null) 折全部历史而不是折近 N 天：若只折近 N 天，一个「窗口之前就开着、
        // 至今未关」的区间在窗口内一行都没有，会整条漏掉——它超时了却永远不触发。传 null 就没有这个盲区。
        // ponytail: 代价是每轮全量折叠全部审计流，随审计行数线性增长；告警是低频轮询（默认 5 分钟），
        // 审计表有 (category,target_type,field_code,created_at) 索引可走。若审计行数涨到全折叠明显拖慢轮询，
        // 升级路径是增量水位线折叠：引擎自记 last_seen 审计 id 水位，只折新行并增量维护 open 集合，
        // 新开区间的起算点仍回查首条（一次性），不再每轮全扫。
        List<StatusInterval> intervals = intervalService.fold(null);

        List<StatusInterval> open = new ArrayList<>();
        List<StatusInterval> closed = new ArrayList<>();
        for (StatusInterval iv : intervals) {
            if (iv.removedAt() == null) open.add(iv);
            else closed.add(iv);
        }

        Set<Long> cageIds = open.stream().map(StatusInterval::animalCageId).collect(Collectors.toSet());
        Map<Long, List<EffectiveAlertRule>> rules =
                cageIds.isEmpty() ? Map.of() : ruleService.resolveForCages(cageIds);

        Map<String, ExistingAlert> existing = loadExisting();
        List<Intent> intents = decide(open, closed, rules, existing, now);

        int createdActive = 0;
        int createdPending = 0;
        int promoted = 0;
        int cleared = 0;
        for (Intent in : intents) {
            switch (in.kind()) {
                case CREATE_ACTIVE -> {
                    CageStatusAlert row = insertRow(in, CageStatusAlert.STATE_ACTIVE);
                    mapper.insert(row);
                    createdActive++;
                    maybePublishViolation(row.getId() == null ? 0L : row.getId(), in);
                }
                case CREATE_PENDING -> {
                    mapper.insert(insertRow(in, CageStatusAlert.STATE_PENDING));
                    createdPending++;
                }
                case PROMOTE_TO_ACTIVE -> {
                    mapper.promoteToActive(in.targetId(), in.firedAt(), in.thresholdDays(), in.action());
                    promoted++;
                    maybePublishViolation(in.targetId(), in);
                }
                case CLEAR -> {
                    mapper.clear(in.targetId(), in.clearedAt());
                    cleared++;
                }
            }
        }

        log.info("[cage-status-alert] 区间={} 开={} 关={} 触发={} 建基线={} 升级={} 清除={}",
                intervals.size(), open.size(), closed.size(), createdActive, createdPending, promoted, cleared);

        // 只有真的产生/升级/清除了 ACTIVE 告警才推（建基线 PENDING 不出现在读取端点，无需刷）。
        int changed = createdActive + promoted + cleared;
        if (changed > 0) {
            broadcastChange(changed);
        }
    }

    /** 告警真正变化时广播给管理端（console:live），只带变化计数让前端刷，不塞整份列表。 */
    private void broadcastChange(int changed) {
        if (socketServer == null) return;
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("changed", changed);
            socketServer.getRoomOperations(SocketRoomAssigner.ROOM_CONSOLE_LIVE)
                    .sendEvent("CAGE_STATUS_ALERT_CHANGED", payload);
        } catch (Exception e) {
            log.warn("[cage-status-alert] 广播告警变化失败: {}", e.getMessage());
        }
    }

    /**
     * 告警升级成 ACTIVE（或非 estimated 首触）时挂的旁路：动作含 VIOLATION 才发违规。
     * 建违规失败只打 warn，绝不让它影响告警本体（告警已落库，这里不能抛）。
     */
    private void maybePublishViolation(long alertId, Intent in) {
        if (!("VIOLATION".equals(in.action()) || "BOTH".equals(in.action()))) return;
        try {
            violationService.publishIfWanted(alertId, in.animalCageId(), in.statusCode());
        } catch (Exception e) {
            log.warn("[cage-status-alert] 告警 {} 自动发违规失败: {}", alertId, e.getMessage());
        }
    }

    private Map<String, ExistingAlert> loadExisting() {
        Map<String, ExistingAlert> out = new HashMap<>();
        for (CageStatusAlert a : mapper.listNonCleared()) {
            if (a == null || a.getAnimalCageId() == null || a.getStatusCode() == null) continue;
            out.put(activeKeyOf(a.getAnimalCageId(), a.getStatusCode()),
                    new ExistingAlert(a.getId() == null ? 0L : a.getId(), a.getState(), a.getStartedAt()));
        }
        return out;
    }

    private static CageStatusAlert insertRow(Intent in, String state) {
        CageStatusAlert a = new CageStatusAlert();
        a.setAnimalCageId(in.animalCageId());
        a.setStatusCode(in.statusCode());
        a.setStartedAt(in.startedAt());
        a.setFiredAt(in.firedAt());
        a.setThresholdDays(in.thresholdDays());
        a.setAction(in.action());
        a.setState(state);
        a.setEstimated(in.estimated());
        a.setActiveKey(activeKeyOf(in.animalCageId(), in.statusCode()));
        return a;
    }

    /** 笼位:状态 的活跃键，兼作 active_key 列与决策期 key。 */
    public static String activeKeyOf(long cageId, String statusCode) {
        return cageId + ":" + statusCode;
    }

    private static EffectiveAlertRule ruleFor(Map<Long, List<EffectiveAlertRule>> rulesByCage,
                                              long cageId, String statusCode) {
        List<EffectiveAlertRule> list = rulesByCage == null ? null : rulesByCage.get(cageId);
        if (list == null) return null;
        for (EffectiveAlertRule r : list) {
            if (statusCode.equals(r.statusCode())) return r;
        }
        return null;
    }

    /** action 列三值：HIGHLIGHT | VIOLATION | BOTH。规则层动作位都空时兜底 HIGHLIGHT（配置层 action 恒三值之一，几乎不可达）。 */
    private static String actionOf(EffectiveAlertRule rule) {
        if (rule.highlight() && rule.violation()) return "BOTH";
        if (rule.violation()) return "VIOLATION";
        return "HIGHLIGHT";
    }

    /**
     * 决策纯函数：给定开/闭区间、每笼位的生效规则、库里现有非 CLEARED 行、now → 一组「意图」。
     * 返回列表只含需要落库的动作（NOTHING = 不出现），不读库不写库，无副作用。
     *
     * <p><b>estimated 为何用 PENDING 基线：</b>fold(null) 对「上线时已处于该状态、无审计起点」的区间，
     * addedAt 会给一个无意义的哨兵值（LocalDateTime.MIN），拿它算 Duration 会立刻误报成「超了 N 年」。
     * 起算点不可观测，只能从引擎首次见到它的时刻起算：先落一条 PENDING 基线，下轮再按基线时长升级。
     *
     * <p><b>阈值 0 也遵守「没持续到不触发」：</b>区间只在 closed 里出现过（两次轮询之间开又关）、
     * 从没进过 open，就不会有任何存量行，closed 分支自然不建行——不为已恢复的状态补发告警。
     */
    public static List<Intent> decide(List<StatusInterval> open,
                                      List<StatusInterval> closed,
                                      Map<Long, List<EffectiveAlertRule>> rulesByCage,
                                      Map<String, ExistingAlert> existingByKey,
                                      LocalDateTime now) {
        List<Intent> out = new ArrayList<>();

        for (StatusInterval iv : open) {
            String key = activeKeyOf(iv.animalCageId(), iv.statusCode());
            ExistingAlert existing = existingByKey.get(key);
            EffectiveAlertRule rule = ruleFor(rulesByCage, iv.animalCageId(), iv.statusCode());

            if (rule == null || !rule.enabled()) {
                // 组长把告警关掉（或规则缺失 fail-closed）：存量告警应当消失。
                if (existing != null) {
                    out.add(Intent.clear(iv.animalCageId(), iv.statusCode(), existing.id(), now));
                }
                continue;
            }

            if (!iv.estimated()) {
                // 起算点可观测：直接按 addedAt 到 now 的整天数判。
                long days = Duration.between(iv.addedAt(), now).toDays();
                if (days >= rule.thresholdDays() && existing == null) {
                    out.add(Intent.createActive(iv.animalCageId(), iv.statusCode(), iv.addedAt(), now,
                            rule.thresholdDays(), actionOf(rule), false));
                }
                // 未到阈值不落行；已有非 CLEARED 行则幂等不重复触发。
            } else {
                // estimated：起算点不可观测，见类注释。首次见到 → 建基线，绝不触发。
                if (existing == null) {
                    out.add(Intent.createPending(iv.animalCageId(), iv.statusCode(), now,
                            rule.thresholdDays(), actionOf(rule)));
                } else if (CageStatusAlert.STATE_PENDING.equals(existing.state())) {
                    long days = Duration.between(existing.startedAt(), now).toDays();
                    if (days >= rule.thresholdDays()) {
                        out.add(Intent.promote(iv.animalCageId(), iv.statusCode(), existing.id(), now,
                                rule.thresholdDays(), actionOf(rule)));
                    }
                    // 未到阈值不动作。
                }
                // 已是 ACTIVE → 幂等不动作。
            }
        }

        for (StatusInterval iv : closed) {
            String key = activeKeyOf(iv.animalCageId(), iv.statusCode());
            ExistingAlert existing = existingByKey.get(key);
            if (existing != null) {
                out.add(Intent.clear(iv.animalCageId(), iv.statusCode(), existing.id(), iv.removedAt()));
            }
            // 闭合但本来就没行 → 别建空清除。
        }

        return out;
    }

    /** 库里一条非 CLEARED 告警（决策期只要 id / state / startedAt）。 */
    public record ExistingAlert(long id, String state, LocalDateTime startedAt) {
    }

    /**
     * 一次落库意图。字段按 kind 语义使用，不相关的为 null/0：
     * CREATE_ACTIVE 用 startedAt/firedAt/thresholdDays/action/estimated；
     * CREATE_PENDING 用 startedAt(=now)/firedAt(=now)/thresholdDays/action；
     * PROMOTE_TO_ACTIVE 用 targetId/firedAt/thresholdDays/action；
     * CLEAR 用 targetId/clearedAt。
     */
    public record Intent(
            Kind kind,
            long animalCageId,
            String statusCode,
            LocalDateTime startedAt,
            LocalDateTime firedAt,
            LocalDateTime clearedAt,
            int thresholdDays,
            String action,
            boolean estimated,
            long targetId
    ) {
        public enum Kind { CREATE_ACTIVE, CREATE_PENDING, PROMOTE_TO_ACTIVE, CLEAR }

        static Intent createActive(long cage, String status, LocalDateTime startedAt, LocalDateTime firedAt,
                                   int thresholdDays, String action, boolean estimated) {
            return new Intent(Kind.CREATE_ACTIVE, cage, status, startedAt, firedAt, null,
                    thresholdDays, action, estimated, 0);
        }

        static Intent createPending(long cage, String status, LocalDateTime now,
                                    int thresholdDays, String action) {
            return new Intent(Kind.CREATE_PENDING, cage, status, now, now, null, thresholdDays, action, true, 0);
        }

        static Intent promote(long cage, String status, long targetId, LocalDateTime firedAt,
                              int thresholdDays, String action) {
            return new Intent(Kind.PROMOTE_TO_ACTIVE, cage, status, null, firedAt, null,
                    thresholdDays, action, true, targetId);
        }

        static Intent clear(long cage, String status, long targetId, LocalDateTime clearedAt) {
            return new Intent(Kind.CLEAR, cage, status, null, null, clearedAt, 0, null, false, targetId);
        }
    }
}
