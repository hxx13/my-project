package com.example.demo.modules.cageshelf.scheduler;

import com.example.demo.modules.cageshelf.scheduler.CageStatusAlertScheduler.ExistingAlert;
import com.example.demo.modules.cageshelf.scheduler.CageStatusAlertScheduler.Intent;
import com.example.demo.modules.cageshelf.scheduler.CageStatusAlertScheduler.Intent.Kind;
import com.example.demo.modules.cageshelf.service.CageAlertRuleService.EffectiveAlertRule;
import com.example.demo.modules.cageshelf.service.CageStatusIntervalService.StatusInterval;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static com.example.demo.modules.cageshelf.scheduler.CageStatusAlertScheduler.activeKeyOf;
import static com.example.demo.modules.cageshelf.scheduler.CageStatusAlertScheduler.decide;
import static com.example.demo.modules.cageshelf.scheduler.CageStatusAlertScheduler.isNonViolationStatus;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 告警引擎决策纯函数的核心回归：给定区间 + 规则 + 库里现有行 + now → 该做什么。
 *
 * 最容易上线翻车的三处都锁在这里：
 * ① estimated 区间**不能拿 addedAt 算时长**（fold(null) 会给一个无意义哨兵），必须先落 PENDING 基线再升级；
 * ② 阈值 0 也遵守「没持续到就不触发」——只在 closed 里出现过、从没 open 过的区间不建行；
 * ③ 幂等靠「同 (cage,status) 最多一条非 CLEARED 行」——已 ACTIVE 的不重复触发、已 CLEARED 的不重复清除。
 */
class CageStatusAlertSchedulerTest {

    private static final long CAGE = 1L;
    private static final String DIVIDE = "NEED_DIVIDE";

    private static LocalDateTime at(int hour, int minute) {
        return LocalDateTime.of(2026, 9, 1, hour, minute);
    }

    private static StatusInterval open(long cage, String status, LocalDateTime addedAt, boolean estimated) {
        return new StatusInterval(cage, status, addedAt, null, null, null, estimated);
    }

    private static StatusInterval closed(long cage, String status, LocalDateTime addedAt,
                                         LocalDateTime removedAt, boolean estimated) {
        return new StatusInterval(cage, status, addedAt, removedAt, null, null, estimated);
    }

    private static EffectiveAlertRule rule(String status, boolean enabled, int threshold, String action) {
        boolean h = "HIGHLIGHT".equals(action) || "BOTH".equals(action);
        boolean v = "VIOLATION".equals(action) || "BOTH".equals(action);
        return new EffectiveAlertRule(status, enabled, threshold, h, v, true);
    }

    private static Map<Long, List<EffectiveAlertRule>> rulesFor(long cage, EffectiveAlertRule r) {
        return Map.of(cage, List.of(r));
    }

    private static ExistingAlert existing(long id, String state, LocalDateTime startedAt) {
        return new ExistingAlert(id, state, startedAt);
    }

    // ── 非 estimated ──

    @Test
    void nonEstimatedOverThresholdFiresActive() {
        LocalDateTime now = at(10, 0);
        LocalDateTime addedAt = now.minusDays(8);

        List<Intent> intents = decide(
                List.of(open(CAGE, DIVIDE, addedAt, false)), List.of(),
                rulesFor(CAGE, rule(DIVIDE, true, 7, "HIGHLIGHT")), Map.of(), now);

        assertEquals(1, intents.size());
        Intent in = intents.get(0);
        assertEquals(Kind.CREATE_ACTIVE, in.kind());
        assertEquals(CAGE, in.animalCageId());
        assertEquals(DIVIDE, in.statusCode());
        assertEquals(addedAt, in.startedAt(), "起算点用可观测的 addedAt");
        assertEquals(now, in.firedAt());
        assertEquals(7, in.thresholdDays(), "阈值快照下来");
        assertEquals("HIGHLIGHT", in.action());
        assertFalse(in.estimated());
    }

    @Test
    void nonEstimatedUnderThresholdDoesNothing() {
        LocalDateTime now = at(10, 0);

        List<Intent> intents = decide(
                List.of(open(CAGE, DIVIDE, now.minusDays(6), false)), List.of(),
                rulesFor(CAGE, rule(DIVIDE, true, 7, "HIGHLIGHT")), Map.of(), now);

        assertTrue(intents.isEmpty(), "没到阈值不落行");
    }

    @Test
    void zeroThresholdFiresImmediately() {
        LocalDateTime now = at(10, 0);

        List<Intent> intents = decide(
                List.of(open(CAGE, DIVIDE, now.minusSeconds(1), false)), List.of(),
                rulesFor(CAGE, rule(DIVIDE, true, 0, "HIGHLIGHT")), Map.of(), now);

        assertEquals(1, intents.size());
        assertEquals(Kind.CREATE_ACTIVE, intents.get(0).kind(), "阈值 0 = 状态一出现即触发");
    }

    @Test
    void nonEstimatedAlreadyActiveStaysIdempotent() {
        LocalDateTime now = at(10, 0);
        LocalDateTime addedAt = now.minusDays(8);

        List<Intent> intents = decide(
                List.of(open(CAGE, DIVIDE, addedAt, false)), List.of(),
                rulesFor(CAGE, rule(DIVIDE, true, 7, "HIGHLIGHT")),
                Map.of(activeKeyOf(CAGE, DIVIDE), existing(9, "ACTIVE", addedAt)), now);

        assertTrue(intents.isEmpty(), "已 ACTIVE 不重复触发");
    }

    @Test
    void raisedThresholdAboveElapsedClearsExistingActive() {
        LocalDateTime now = at(10, 0);
        LocalDateTime addedAt = now.minusDays(8);   // 已持续 8 天

        // 阈值从 7 调到 999：存量 ACTIVE 已不成立，必须撤销。
        // 不撤的话「配置 999」对已触发的告警完全无效 —— 弹窗里仍旧挂着建行时快照的阈值 7 天。
        List<Intent> intents = decide(
                List.of(open(CAGE, DIVIDE, addedAt, false)), List.of(),
                rulesFor(CAGE, rule(DIVIDE, true, 999, "HIGHLIGHT")),
                Map.of(activeKeyOf(CAGE, DIVIDE), existing(9, "ACTIVE", addedAt)), now);

        assertEquals(1, intents.size());
        Intent in = intents.get(0);
        assertEquals(Kind.CLEAR, in.kind(), "阈值调高到持续时间之上 → 存量 ACTIVE 撤销");
        assertEquals(9L, in.targetId());
        assertEquals(now, in.clearedAt(), "区间仍开着，解除时刻用 now");
    }

    @Test
    void staleStartedAtIsReplacedByTheCurrentInterval() {
        LocalDateTime now = at(10, 0);
        LocalDateTime oldStart = now.minusDays(20);   // 存量行里记的、**旧区间**的起算点
        LocalDateTime newStart = now.minusDays(9);    // 标记 → 取消 → 再标记后，当前这条区间的起算点

        // 展示用的是行里的 started_at，跨重开区间会偏大。期望同一轮里撤销旧行 + 按当前区间重建。
        List<Intent> intents = decide(
                List.of(open(CAGE, DIVIDE, newStart, false)), List.of(),
                rulesFor(CAGE, rule(DIVIDE, true, 7, "HIGHLIGHT")),
                Map.of(activeKeyOf(CAGE, DIVIDE), existing(9L, "ACTIVE", oldStart)), now);

        assertEquals(2, intents.size());
        assertEquals(Kind.CLEAR, intents.get(0).kind(), "先撤销旧行");
        assertEquals(9L, intents.get(0).targetId());
        assertEquals(Kind.CREATE_ACTIVE, intents.get(1).kind(), "再按当前区间重建");
        assertEquals(newStart, intents.get(1).startedAt(), "重建后的起算点 = 当前区间");
    }

    @Test
    void staleStartedAtBelowThresholdOnlyClears() {
        LocalDateTime now = at(10, 0);
        LocalDateTime newStart = now.minusDays(2);    // 重开后的新区间还没到阈值

        List<Intent> intents = decide(
                List.of(open(CAGE, DIVIDE, newStart, false)), List.of(),
                rulesFor(CAGE, rule(DIVIDE, true, 7, "HIGHLIGHT")),
                Map.of(activeKeyOf(CAGE, DIVIDE), existing(9L, "ACTIVE", now.minusDays(20))), now);

        assertEquals(1, intents.size());
        assertEquals(Kind.CLEAR, intents.get(0).kind(), "不够阈值就只撤销，不重建");
    }

    // ── estimated ──

    @Test
    void estimatedFirstSeenCreatesPendingBaselineNotFire() {
        LocalDateTime now = at(10, 0);
        // fold(null) 对不可观测起算点会给一个远古哨兵值；拿它算会立刻误报，所以只能建基线。
        LocalDateTime sentinel = now.minusYears(10);

        List<Intent> intents = decide(
                List.of(open(CAGE, DIVIDE, sentinel, true)), List.of(),
                rulesFor(CAGE, rule(DIVIDE, true, 7, "HIGHLIGHT")), Map.of(), now);

        assertEquals(1, intents.size());
        Intent in = intents.get(0);
        assertEquals(Kind.CREATE_PENDING, in.kind(), "首次见到只建 PENDING 基线，绝不触发");
        assertEquals(now, in.startedAt(), "基线 = 引擎首次见到它的时刻");
        assertTrue(in.estimated());
    }

    @Test
    void estimatedPendingOverThresholdPromotes() {
        LocalDateTime now = at(10, 0);
        LocalDateTime baseline = now.minusDays(8);

        List<Intent> intents = decide(
                List.of(open(CAGE, DIVIDE, now.minusYears(10), true)), List.of(),
                rulesFor(CAGE, rule(DIVIDE, true, 7, "HIGHLIGHT")),
                Map.of(activeKeyOf(CAGE, DIVIDE), existing(42, "PENDING", baseline)), now);

        assertEquals(1, intents.size());
        Intent in = intents.get(0);
        assertEquals(Kind.PROMOTE_TO_ACTIVE, in.kind());
        assertEquals(42L, in.targetId());
        assertEquals(now, in.firedAt(), "升级时写 fired_at = now");
        assertEquals(7, in.thresholdDays());
    }

    @Test
    void estimatedPendingUnderThresholdDoesNothing() {
        LocalDateTime now = at(10, 0);

        List<Intent> intents = decide(
                List.of(open(CAGE, DIVIDE, now.minusYears(10), true)), List.of(),
                rulesFor(CAGE, rule(DIVIDE, true, 7, "HIGHLIGHT")),
                Map.of(activeKeyOf(CAGE, DIVIDE), existing(42, "PENDING", now.minusDays(6))), now);

        assertTrue(intents.isEmpty(), "基线起算未到阈值不动作");
    }

    // ── 规则关闭 ──

    @Test
    void disabledRuleClearsExistingActive() {
        LocalDateTime now = at(10, 0);
        LocalDateTime addedAt = now.minusDays(10);

        List<Intent> intents = decide(
                List.of(open(CAGE, DIVIDE, addedAt, false)), List.of(),
                rulesFor(CAGE, rule(DIVIDE, false, 7, "HIGHLIGHT")),
                Map.of(activeKeyOf(CAGE, DIVIDE), existing(7, "ACTIVE", addedAt)), now);

        assertEquals(1, intents.size());
        Intent in = intents.get(0);
        assertEquals(Kind.CLEAR, in.kind(), "组长关掉告警，存量 ACTIVE 应当消失");
        assertEquals(7L, in.targetId());
        assertEquals(now, in.clearedAt(), "规则关闭的区间仍开着，用 now 作解除时刻");
    }

    @Test
    void disabledRuleWithNoExistingDoesNothing() {
        LocalDateTime now = at(10, 0);

        List<Intent> intents = decide(
                List.of(open(CAGE, DIVIDE, now.minusDays(10), false)), List.of(),
                rulesFor(CAGE, rule(DIVIDE, false, 7, "HIGHLIGHT")), Map.of(), now);

        assertTrue(intents.isEmpty(), "关闭且本来就没行 → 不动作");
    }

    // ── 闭合 ──

    @Test
    void closedIntervalClearsExistingUsingRemovedAt() {
        LocalDateTime now = at(10, 0);
        LocalDateTime removedAt = at(9, 30);

        List<Intent> intents = decide(List.of(),
                List.of(closed(CAGE, DIVIDE, at(1, 0), removedAt, false)),
                Map.of(),
                Map.of(activeKeyOf(CAGE, DIVIDE), existing(5, "ACTIVE", at(1, 0))), now);

        assertEquals(1, intents.size());
        Intent in = intents.get(0);
        assertEquals(Kind.CLEAR, in.kind());
        assertEquals(5L, in.targetId());
        assertEquals(removedAt, in.clearedAt(), "清除时刻用区间的 removedAt");
    }

    @Test
    void closedIntervalWithoutExistingDoesNothing() {
        LocalDateTime now = at(10, 0);

        List<Intent> intents = decide(List.of(),
                List.of(closed(CAGE, DIVIDE, at(1, 0), at(9, 0), false)),
                Map.of(), Map.of(), now);

        assertTrue(intents.isEmpty(), "闭合但本来就没行 → 别建空清除");
    }

    @Test
    void zeroThresholdIntervalThatClosedBetweenPollsDoesNotFire() {
        LocalDateTime now = at(10, 0);
        // 在两次轮询之间开又关：只出现在 closed、从没出现在 open → 没有存量行 → 不触发。
        // 阈值 0 也必须遵守这条「没持续到就不触发」，否则会为已经好了的状态补发告警。
        List<Intent> intents = decide(List.of(),
                List.of(closed(CAGE, DIVIDE, at(9, 59), at(9, 59).plusSeconds(30), false)),
                Map.of(), Map.of(), now);

        assertTrue(intents.isEmpty());
    }

    @Test
    void historicallyClosedIntervalMustNotClearTheCurrentlyOpenOne() {
        LocalDateTime now = at(10, 0);

        /*
          标记 → 取消 → 再标记：折叠出「一条历史闭合 + 一条还开着」，两条的 key 都是 cage:status
          （active_key 本来就只到 cage:status，一个笼位一个状态只有一行）。
          历史那条闭合区间绝不能把当前开着这条名下的行清掉 ——
          清了下一轮 existing 就是 null，又 CREATE_ACTIVE，于是「清→建→清」每轮循环，
          每轮发一条违规 + 一条通知。真实事故：特殊饲养标记→取消→再标记之后，
          每 5 分钟一条违规，一个笼位连发 14 条，cleared_at 全是那条历史区间的闭合时刻。

          当前开着那条**故意取已满阈值的 9 天**（> 阈值 7）：否则它会先被「持续时间不足阈值 → 撤销存量」
          那条规则清掉，本用例就测不到「历史闭合区间」这条路径了。
        */
        LocalDateTime openAt = now.minusDays(9);
        List<Intent> intents = decide(
                List.of(open(CAGE, DIVIDE, openAt, false)),
                List.of(closed(CAGE, DIVIDE, now.minusDays(12), now.minusDays(11), false)),
                rulesFor(CAGE, rule(DIVIDE, true, 7, "HIGHLIGHT")),
                Map.of(activeKeyOf(CAGE, DIVIDE), existing(9L, "ACTIVE", openAt)),
                now);

        assertTrue(intents.isEmpty(), "现在还开着 → 历史闭合区间不该产生清除意图");
    }

    /**
     * 特殊饲养 / 合笼（含特殊饲养明细）**不是违规行为**：引擎到阈值只能发通知，不能建违规记录
     * （用户 2026-09-14 口径）。这条谓词是 {@code maybeEscalate} 分岔的唯一判据，钉在这里。
     */
    @Test
    void specialFeedingCohabitationAndDetailsAreNotViolations() {
        assertTrue(isNonViolationStatus("SPECIAL_FEEDING"));
        assertTrue(isNonViolationStatus("COHABITATION"));
        assertTrue(isNonViolationStatus("SF_NEED_FEED"), "明细跟着特殊饲养走同一口径");

        assertFalse(isNonViolationStatus("NEED_DIVIDE"));
        assertFalse(isNonViolationStatus("HEALTH_ABNORMAL"));
        assertFalse(isNonViolationStatus("ANIMAL_TRANSFER"));
        assertFalse(isNonViolationStatus(null));
    }
}
