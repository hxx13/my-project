package com.example.demo.modules.cageshelf.scheduler;

import com.corundumstudio.socketio.SocketIOServer;
import com.example.demo.common.component.SocketRoomAssigner;
import com.example.demo.modules.cageshelf.entity.CageFormAuditLog;
import com.example.demo.modules.cageshelf.entity.CageStatusAlert;
import com.example.demo.modules.cageshelf.mapper.CageStatusAlertMapper;
import com.example.demo.modules.cageshelf.service.CageAlertRuleService;
import com.example.demo.modules.cageshelf.service.CageAlertRuleService.EffectiveAlertRule;
import com.example.demo.modules.cageshelf.service.CageAlertViolationService;
import com.example.demo.modules.cageshelf.service.CageStatusNotifyService;
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
import java.util.HashSet;
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
    private final CageStatusNotifyService notifyService;
    private final SocketIOServer socketServer;
    private final org.springframework.scheduling.TaskScheduler taskScheduler;

    public CageStatusAlertScheduler(CageStatusIntervalService intervalService,
                                    CageAlertRuleService ruleService,
                                    CageStatusAlertMapper mapper,
                                    CageAlertViolationService violationService,
                                    CageStatusNotifyService notifyService,
                                    @org.springframework.beans.factory.annotation.Autowired(required = false) SocketIOServer socketServer,
                                    @org.springframework.beans.factory.annotation.Qualifier("cageStatusAlertTaskScheduler") org.springframework.scheduling.TaskScheduler taskScheduler) {
        this.intervalService = intervalService;
        this.ruleService = ruleService;
        this.mapper = mapper;
        this.violationService = violationService;
        this.notifyService = notifyService;
        this.socketServer = socketServer;
        this.taskScheduler = taskScheduler;
    }

    /**
     * 立刻触发一轮扫描。配置刚改完时用 —— 只靠 5 分钟的 tick，用户盯着屏幕会以为「关了没用」。
     *
     * <p>投到本引擎**自己的线程池**（不在调用线程里跑全量折叠，也不阻塞 HTTP 响应）。
     * 重复触发是安全的：scan() 自带 GET_LOCK，线程池又只有 1 个线程，不会重入也不会并发跑两轮。
     */
    public void scanSoon() {
        try {
            taskScheduler.schedule(this::scan, java.time.Instant.now());
        } catch (Exception e) {
            log.warn("[cage-status-alert] 触发即时扫描失败: {}", e.getMessage());
        }
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

        // 为什么折全部历史而不是折近 N 天：若只折近 N 天，一个「窗口之前就开着、
        // 至今未关」的区间在窗口内一行都没有，会整条漏掉——它超时了却永远不触发。传 null 就没有这个盲区。
        // ponytail: 代价是每轮全量折叠全部审计流，随审计行数线性增长；告警是低频轮询（默认 5 分钟），
        // 审计表有 (category,target_type,field_code,created_at) 索引可走。若审计行数涨到全折叠明显拖慢轮询，
        // 升级路径是增量水位线折叠：引擎自记 last_seen 审计 id 水位，只折新行并增量维护 open 集合，
        // 新开区间的起算点仍回查首条（一次性），不再每轮全扫。
        //
        // 取数顺序（不能颠倒）：折叠要用每个 (笼位,状态) 的计时起点（区域级配置），而笼位集合由审计行给出，
        // 所以必须「先取行 → 解析方向 → 再折叠」。规则对**审计流里出现过的全部笼位**一次解析完，
        // 它是后面 decide 所需集合的超集，于是 decide 直接复用，不再解析第二遍。
        // ponytail: 代价是 resolveForCages 的笼位集合从「有开区间的」变成「审计流出现过的全部」，
        // regionsOfCages 那一次 IN 会变大（仍是 3 条批量查询）。若明显拖慢，按 2000 分批即可
        // （对齐 /cage-status-alert/active 的 MAX_CAGE_IDS 分批）。
        List<CageFormAuditLog> auditRows = intervalService.loadStatusFieldRows(null);
        Set<Long> auditedCages = auditRows.stream()
                .map(CageFormAuditLog::getTargetId)
                .filter(id -> id != null)
                .collect(Collectors.toSet());
        Map<Long, List<EffectiveAlertRule>> rules =
                auditedCages.isEmpty() ? Map.of() : ruleService.resolveForCages(auditedCages);

        List<StatusInterval> intervals =
                intervalService.foldRows(auditRows, null, startValuesOf(rules));

        List<StatusInterval> open = new ArrayList<>();
        List<StatusInterval> closed = new ArrayList<>();
        for (StatusInterval iv : intervals) {
            if (iv.removedAt() == null) open.add(iv);
            else closed.add(iv);
        }

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
                    maybeEscalate(row.getId() == null ? 0L : row.getId(), in);
                }
                case CREATE_PENDING -> {
                    mapper.insert(insertRow(in, CageStatusAlert.STATE_PENDING));
                    createdPending++;
                }
                case PROMOTE_TO_ACTIVE -> {
                    mapper.promoteToActive(in.targetId(), in.firedAt(), in.thresholdDays(), in.action());
                    promoted++;
                    maybeEscalate(in.targetId(), in);
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

    /** 把每笼位五条规则里的计时起点摊成 (笼位 → 状态 → 起点)，供折叠时按 (笼位,状态) 查。 */
    private static Map<Long, Map<String, Boolean>> startValuesOf(Map<Long, List<EffectiveAlertRule>> rules) {
        Map<Long, Map<String, Boolean>> out = new HashMap<>(rules.size());
        for (Map.Entry<Long, List<EffectiveAlertRule>> e : rules.entrySet()) {
            Map<String, Boolean> perCage = new HashMap<>();
            for (EffectiveAlertRule r : e.getValue()) {
                perCage.put(r.statusCode(), r.startValue());
            }
            out.put(e.getKey(), perCage);
        }
        return out;
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
     * 这两个状态**不是违规行为**（用户 2026-09-14 定的口径）：无论阈值里配成什么动作，都不新建违规，
     * 改成走推送中心的统一源发通知（见 {@link CageStatusNotifyService}）。
     *
     * <p>判定放在 {@link #maybeEscalate} —— 引擎里唯一的「升级出口」，一个口子收住所有路径。
     * 特殊饲养明细（{@code SF_} 前缀）跟着特殊饲养走同一口径。
     */
    private static final Set<String> NON_VIOLATION_STATUSES = Set.of("SPECIAL_FEEDING", "COHABITATION");

    /** 该状态是否属于「非违规」（特殊饲养 / 合笼 / 特殊饲养明细）。包可见：单测直接钉这条口径。 */
    static boolean isNonViolationStatus(String statusCode) {
        if (statusCode == null) return false;
        return NON_VIOLATION_STATUSES.contains(statusCode)
                || statusCode.startsWith(CageStatusIntervalService.DETAIL_STATUS_PREFIX);
    }

    /**
     * 告警升级成 ACTIVE（或非 estimated 首触）时挂的旁路：动作含「违规/通知」档才动手。
     *
     * <p>动作语义按状态分岔：一般状态 → 建违规（原有行为不变）；
     * **特殊饲养 / 合笼 / 明细** → 同一时刻只发通知，不建违规。
     * 建违规/发通知失败都只打 warn，绝不让它影响告警本体（告警已落库，这里不能抛）。
     */
    private void maybeEscalate(long alertId, Intent in) {
        if (!("VIOLATION".equals(in.action()) || "BOTH".equals(in.action()))) return;
        if (isNonViolationStatus(in.statusCode())) {
            notifyService.notifyFired(alertId);
            return;
        }
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
                boolean qualifies = days >= rule.thresholdDays();
                if (existing != null && CageStatusAlert.STATE_ACTIVE.equals(existing.state())
                        && !iv.addedAt().equals(existing.startedAt())) {
                    // 存量行的起算点是**旧区间**的（标记 → 取消 → 再标记）：展示的「已持续 N 天」会偏大。
                    // 同一轮里先撤销、再按当前区间重建 —— 不跨轮所以看不到空窗，重建后快照就与当前区间一致了。
                    out.add(Intent.clear(iv.animalCageId(), iv.statusCode(), existing.id(), now));
                    if (qualifies) {
                        out.add(Intent.createActive(iv.animalCageId(), iv.statusCode(), iv.addedAt(), now,
                                rule.thresholdDays(), actionOf(rule), false));
                    }
                } else if (qualifies) {
                    if (existing == null) {
                        out.add(Intent.createActive(iv.animalCageId(), iv.statusCode(), iv.addedAt(), now,
                                rule.thresholdDays(), actionOf(rule), false));
                    }
                    // 已有非 CLEARED 行则幂等不重复触发。
                } else if (existing != null && CageStatusAlert.STATE_ACTIVE.equals(existing.state())) {
                    // 阈值被调高到当前持续时间之上（7 调到 999）：存量告警已不成立，必须撤销。
                    // 不撤的话「改阈值」对已触发的告警完全无效，弹窗还挂着建行时快照的旧阈值。
                    out.add(Intent.clear(iv.animalCageId(), iv.statusCode(), existing.id(), now));
                }
                // 未到阈值且本来就没行 → 不落行。
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

        /*
          同一 (笼位,状态) 可能有多条区间：标记 → 取消 → 再标记，折叠出来就是「一条历史闭合 + 一条开着」。
          active_key 是 cage:status（**每个笼位每个状态只有一行**），所以这里必须按 key 去重：
          一条历史闭合区间绝不能清掉当前开着那条区间名下的告警行 ——
          清了下一轮 existing 就是 null，又会 CREATE_ACTIVE，于是「清→建→清」每轮循环，
          每轮发一条违规 + 一条通知。
          真实踩过：特殊饲养标记→取消→再标记，之后每 5 分钟一条违规，一笼位连发 14 条，
          cleared_at 全是那条历史区间的闭合时刻，就是这么来的。
        */
        Set<String> openKeys = new HashSet<>();
        for (StatusInterval iv : open) {
            openKeys.add(activeKeyOf(iv.animalCageId(), iv.statusCode()));
        }

        for (StatusInterval iv : closed) {
            String key = activeKeyOf(iv.animalCageId(), iv.statusCode());
            if (openKeys.contains(key)) continue; // 现在还开着 → 这条历史区间不负责清它
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
