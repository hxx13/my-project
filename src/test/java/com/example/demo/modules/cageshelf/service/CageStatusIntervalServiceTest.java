package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageFormAuditLog;
import com.example.demo.modules.cageshelf.mapper.CageFormAuditLogMapper;
import com.example.demo.modules.cageshelf.service.CageStatusIntervalService.StatusInterval;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * 把 cage_form_audit_log 的逐字段变更折叠成「状态区间」的核心回归。
 *
 * 最容易搞错的两点都锁在这里：
 * ① 同秒内多次变更 created_at 相同，只有自增 id 能定序 —— 必须按 id 而非 created_at 排；
 * ② 起算点不可观测（第一条就是「关」/ 第一条「开」但 before 空）→ estimated=true，用 since 兜底。
 */
@ExtendWith(MockitoExtension.class)
class CageStatusIntervalServiceTest {

    private static final long CAGE_1 = 1L;
    private static final long CAGE_2 = 2L;
    private static final LocalDateTime SINCE = LocalDateTime.of(2026, 1, 1, 0, 0);

    @Mock private CageFormAuditLogMapper mapper;

    private CageStatusIntervalService service;

    @BeforeEach
    void setUp() {
        service = new CageStatusIntervalService(mapper);
    }

    private static LocalDateTime at(int minute) {
        return LocalDateTime.of(2026, 1, 1, 10, minute);
    }

    private CageFormAuditLog row(long id, long cageId, String fieldCode,
                                 String before, String after, LocalDateTime at, String operator) {
        CageFormAuditLog r = new CageFormAuditLog();
        r.setId(id);
        r.setCategory("data");
        r.setTargetType("animal_cage");
        r.setTargetId(cageId);
        r.setFieldCode(fieldCode);
        r.setBeforeValue(before);
        r.setAfterValue(after);
        r.setCreatedAt(at);
        r.setOperatorId(operator);
        return r;
    }

    private CageFormAuditLog row(long id, String fieldCode,
                                 String before, String after, LocalDateTime at, String operator) {
        return row(id, CAGE_1, fieldCode, before, after, at, operator);
    }

    // ── 定序 ──

    /**
     * 两行 created_at 完全相同、且传入顺序与 id 相反：只有按 id 排才能得到「开→关」的正确区间。
     * 若误按 created_at 排（稳定排序保持传入序），会先把「关」当第一条观测，产出 estimated=true 的错误区间。
     */
    @Test
    void sameSecondChangesAreOrderedById() {
        LocalDateTime t = at(0);
        List<CageFormAuditLog> rows = List.of(
                row(2L, "needs_division", "1", "0", t, "o2"),
                row(1L, "needs_division", "0", "1", t, "o1"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", t, t, "o1", "o2", false)),
                service.foldRows(rows, SINCE, null));
    }

    // ── 反复开关 ──

    @Test
    void repeatedToggleProducesTwoClosedOneOpen() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "0", "1", at(0), "o1"),
                row(2L, "needs_division", "1", "0", at(1), "o2"),
                row(3L, "needs_division", "0", "1", at(2), "o3"),
                row(4L, "needs_division", "1", "0", at(3), "o4"),
                row(5L, "needs_division", "0", "1", at(4), "o5"));

        assertEquals(List.of(
                        new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", at(0), at(1), "o1", "o2", false),
                        new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", at(2), at(3), "o3", "o4", false),
                        new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", at(4), null, "o5", null, false)),
                service.foldRows(rows, SINCE, null));
    }

    // ── 起算点不可观测 ──

    @Test
    void firstObservationIsCloseMeansEstimatedTrue() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "1", "0", at(0), "o1"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", SINCE, at(0), null, "o1", true)),
                service.foldRows(rows, SINCE, null));
    }

    /** 第一条就是关、before=null（从未设过值就被显式置关）→ 从未观测到「开」，不产出区间。 */
    @Test
    void firstCloseWithNullBeforeProducesNoInterval() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", null, "0", at(0), "o1"));

        assertEquals(List.of(), service.foldRows(rows, SINCE, null));
    }

    /** 第一条就是关、before=""（空串，无法识别）→ 没有「开」，不产出区间。 */
    @Test
    void firstCloseWithEmptyBeforeProducesNoInterval() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "", "0", at(0), "o1"));

        assertEquals(List.of(), service.foldRows(rows, SINCE, null));
    }

    /** 第一条就是关、before 明确是关（0/false）→ 没有「开」，不产出区间。 */
    @Test
    void firstCloseWithExplicitClosedBeforeProducesNoInterval() {
        assertEquals(List.of(), service.foldRows(
                List.of(row(1L, "needs_division", "0", "0", at(0), "o1")), SINCE, null));
        assertEquals(List.of(), service.foldRows(
                List.of(row(1L, "needs_division", "false", "0", at(0), "o1")), SINCE, null));
    }

    @Test
    void firstOpenWithNullBeforeMeansEstimatedTrue() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", null, "1", at(0), "o1"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", SINCE, null, "o1", null, true)),
                service.foldRows(rows, SINCE, null));
    }

    /** 空串不算「明确是关」，同样走 estimated=true（与 null 同判）。 */
    @Test
    void firstOpenWithEmptyBeforeMeansEstimatedTrue() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "", "1", at(0), "o1"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", SINCE, null, "o1", null, true)),
                service.foldRows(rows, SINCE, null));
    }

    @Test
    void firstOpenWithExplicitClosedBeforeMeansEstimatedFalse() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "0", "1", at(0), "o1"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", at(0), null, "o1", null, false)),
                service.foldRows(rows, SINCE, null));
    }

    // ── 未闭合 ──

    @Test
    void unclosedIntervalHasNullRemovedAt() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_cohabitation", "false", "true", at(0), "o1"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "COHABITATION", "DEFAULT", at(0), null, "o1", null, false)),
                service.foldRows(rows, SINCE, null));
    }

    // ── 非状态字段被忽略 ──

    @Test
    void ignoresNonStatusFields() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "experimenter_name", "甲", "乙", at(0), "o1"),
                row(2L, "aup_number", "A", "B", at(1), "o2"),
                row(3L, "needs_division", "0", "1", at(2), "o3"),
                row(4L, "needs_division", "1", "0", at(3), "o4"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", at(2), at(3), "o3", "o4", false)),
                service.foldRows(rows, SINCE, null));
    }

    /** category 不是 data、target_type 不是 animal_cage 的行也一并忽略。 */
    @Test
    void ignoresNonDataAndNonCageRows() {
        CageFormAuditLog dict = row(1L, "needs_division", "0", "1", at(0), "o1");
        dict.setCategory("dict");
        CageFormAuditLog otherTarget = row(2L, "needs_division", "0", "1", at(1), "o2");
        otherTarget.setTargetType("claim");

        assertEquals(List.of(), service.foldRows(List.of(dict, otherTarget), SINCE, null));
    }

    // ── 值的多种写法 ──

    @Test
    void recognizesMultipleBooleanWritings() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "0", "TRUE", at(0), "o1"),
                row(2L, "needs_division", "true", "false", at(1), "o2"),
                row(3L, "needs_division", "FALSE", "1", at(2), "o3"),
                row(4L, "needs_division", "1", "0", at(3), "o4"));

        assertEquals(List.of(
                        new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", at(0), at(1), "o1", "o2", false),
                        new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", at(2), at(3), "o3", "o4", false)),
                service.foldRows(rows, SINCE, null));
    }

    // ── 重复开 / 重复关 ──

    @Test
    void duplicateOpenAndCloseDoNotProduceExtraIntervals() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "0", "1", at(0), "o1"),   // 开
                row(2L, "needs_division", "1", "1", at(1), "o2"),   // 重复开
                row(3L, "needs_division", "1", "0", at(2), "o3"),   // 关
                row(4L, "needs_division", "0", "0", at(3), "o4"));  // 重复关

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", at(0), at(2), "o1", "o3", false)),
                service.foldRows(rows, SINCE, null));
    }

    // ── 不同 (笼位, 状态) 不串味 ──

    @Test
    void differentCagesAndStatusesDoNotCross() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, CAGE_1, "needs_division", "0", "1", at(0), "o1"),
                row(2L, CAGE_2, "needs_division", "0", "1", at(1), "o2"),
                row(3L, CAGE_1, "needs_division", "1", "0", at(2), "o3"),
                row(4L, CAGE_1, "needs_special_feeding", "0", "1", at(3), "o4"));

        assertEquals(List.of(
                        new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", at(0), at(2), "o1", "o3", false),
                        new StatusInterval(CAGE_1, "SPECIAL_FEEDING", "DEFAULT", at(3), null, "o4", null, false),
                        new StatusInterval(CAGE_2, "NEED_DIVIDE", "DEFAULT", at(1), null, "o2", null, false)),
                service.foldRows(rows, SINCE, null));
    }

    // ── 查库委托 ──

    @Test
    void loadRowsThenFoldDelegatesToMapper() {
        CageFormAuditLog r = row(1L, "needs_division", "0", "1", at(0), "o1");
        when(mapper.listStatusFieldRows(anyList(), eq(CageStatusIntervalService.DETAIL_STATUS_PREFIX), eq(SINCE)))
                .thenReturn(List.of(r));

        List<StatusInterval> out = service.foldRows(service.loadStatusFieldRows(SINCE), SINCE, null);

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", at(0), null, "o1", null, false)), out);
    }

    // ── 反向计时起点（start_value=0：出现 0 开始记录，0→1 结束）──

    /** 把这些 (笼位,状态,默认通知对象) 的计时起点配成「出现 0 开始」。 */
    private static Map<Long, Map<String, Boolean>> startAtZero(long cageId, String status) {
        return Map.of(cageId, Map.of(CageStatusIntervalService.ruleKey(status, "DEFAULT"), false));
    }

    @Test
    void zeroStartOpensOnFalseAndClosesOnTrue() {
        LocalDateTime t0 = at(0);
        LocalDateTime t1 = at(5);
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "1", "0", t0, "o1"),
                row(2L, "needs_division", "0", "1", t1, "o2"));

        List<StatusInterval> out = service.foldRows(rows, SINCE, startAtZero(CAGE_1, "NEED_DIVIDE"));

        // 两个边都翻过来了：起点是「0 出现」的那一刻，终点是「0→1」的那一刻。
        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", t0, t1, "o1", "o2", false)), out);
    }

    @Test
    void zeroStartDuplicateStartValueIsIgnored() {
        LocalDateTime t0 = at(0);
        LocalDateTime t2 = at(9);
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "1", "0", t0, "o1"),
                row(2L, "needs_division", "0", "0", at(5), "o2"),   // 重复出现起点值 → 不重置计时
                row(3L, "needs_division", "0", "1", t2, "o3"));     // 0→1 → 闭合

        List<StatusInterval> out = service.foldRows(rows, SINCE, startAtZero(CAGE_1, "NEED_DIVIDE"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", t0, t2, "o1", "o3", false)), out);
    }

    @Test
    void zeroStartFirstObservationWithUnknownBeforeIsEstimated() {
        // 首见就落在起点值、before 不可识别 → 起算点不可观测，用 since 兜底并标 estimated。
        List<CageFormAuditLog> rows = List.of(row(1L, "needs_division", null, "0", at(3), "o1"));

        List<StatusInterval> out = service.foldRows(rows, SINCE, startAtZero(CAGE_1, "NEED_DIVIDE"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", SINCE, null, "o1", null, true)), out);
    }

    @Test
    void zeroStartFirstObservationCloseWithBeforeStartMeansEstimatedClosed() {
        // 首见就是反向值、且 before 明确是起点值 → 观测窗口之前就已在计时，合成一条已闭合的 estimated 区间。
        List<CageFormAuditLog> rows = List.of(row(1L, "needs_division", "0", "1", at(4), "o1"));

        List<StatusInterval> out = service.foldRows(rows, SINCE, startAtZero(CAGE_1, "NEED_DIVIDE"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", SINCE, at(4), null, "o1", true)), out);
    }

    @Test
    void zeroStartFirstObservationCloseWithNullBeforeProducesNoInterval() {
        // before=null 的「反向值」行只表示「从未是起点值」，不表示之前在计时 → 不能凭空造区间。
        List<CageFormAuditLog> rows = List.of(row(1L, "needs_division", null, "1", at(4), "o1"));

        assertEquals(List.of(), service.foldRows(rows, SINCE, startAtZero(CAGE_1, "NEED_DIVIDE")));
    }

    @Test
    void directionIsPerCageAndStatusNotGlobal() {
        LocalDateTime t0 = at(0);
        // 同一个笼位：NEED_DIVIDE 配成反向（出现 0 开始），SPECIAL_FEEDING 仍用默认（出现 1 开始）。
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "1", "0", t0, "o1"),
                row(2L, "needs_special_feeding", "0", "1", t0, "o1"));
        Map<Long, Map<String, Boolean>> dirs = Map.of(CAGE_1,
                Map.of(CageStatusIntervalService.ruleKey("NEED_DIVIDE", "DEFAULT"), false));

        List<StatusInterval> out = service.foldRows(rows, SINCE, dirs);

        assertEquals(2, out.size());
        // NEED_DIVIDE：按反向，t0 起一条开区间
        assertEquals(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT", t0, null, "o1", null, false), out.get(0));
        // SPECIAL_FEEDING：缺方向项 → 回落默认「出现 1 开始」，同样在 t0 开
        assertEquals(new StatusInterval(CAGE_1, "SPECIAL_FEEDING", "DEFAULT", t0, null, "o1", null, false), out.get(1));
    }

    // ── 通知对象维度（健康异常两个对象、方向相反）──

    /** 对象域是**静态**的：只有健康异常有两个对象，其余（含明细）都是默认对象。 */
    @Test
    void notifyTargetsAreStaticPerStatus() {
        assertEquals(List.of("VET", "OCCUPANT"), CageStatusIntervalService.notifyTargetsOf("HEALTH_ABNORMAL"));
        assertEquals(List.of("DEFAULT"), CageStatusIntervalService.notifyTargetsOf("SPECIAL_FEEDING"));
        assertEquals(List.of("DEFAULT"), CageStatusIntervalService.notifyTargetsOf("SF_NEED_FEED"));
        assertEquals(List.of("DEFAULT"), CageStatusIntervalService.notifyTargetsOf("没见过的码"),
                "未知状态回默认对象，绝不凭空多折一条");
        assertTrue(CageStatusIntervalService.isDefaultTarget(null));
        assertTrue(CageStatusIntervalService.isDefaultTarget(" DEFAULT "));
        assertFalse(CageStatusIntervalService.isDefaultTarget("VET"));
    }

    /**
     * 核心回归（用户 2026-09-17 口径）：同一份审计行，按两个通知对象各折一条区间 ——
     * 兽医是「出现 1 开始」（标上就通知），笼位所有者是「出现 0 开始」（长期没标才提醒），
     * 于是**同一条 0→1 的行**在兽医那边是开区间、在所有者那边是一条已闭合的推算区间。
     */
    @Test
    void healthAbnormalFoldsOncePerNotifyTarget() {
        LocalDateTime t0 = at(0);
        List<CageFormAuditLog> rows = List.of(row(1L, "has_health_abnormality", "0", "1", t0, "o1"));

        Map<Long, Map<String, Boolean>> dirs = Map.of(CAGE_1, Map.of(
                CageStatusIntervalService.ruleKey("HEALTH_ABNORMAL", "VET"), true,
                CageStatusIntervalService.ruleKey("HEALTH_ABNORMAL", "OCCUPANT"), false));

        List<StatusInterval> out = service.foldRows(rows, SINCE, dirs);

        assertEquals(2, out.size(), "同一状态两个对象各折一条区间");
        assertEquals(new StatusInterval(CAGE_1, "HEALTH_ABNORMAL", "OCCUPANT", SINCE, t0, null, "o1", true),
                out.get(0), "所有者：出现 0 开始 → 观测窗口前就在「未标记」态，合成一条已闭合区间");
        assertEquals(new StatusInterval(CAGE_1, "HEALTH_ABNORMAL", "VET", t0, null, "o1", null, false),
                out.get(1), "兽医：出现 1 开始 → t0 开区间");
    }

    /** 两个对象方向相同（都被配成出现 1 开始）时，各折一条相同形状的区间，互不干扰。 */
    @Test
    void bothTargetsWithSameDirectionFoldIndependently() {
        LocalDateTime t0 = at(0);
        LocalDateTime t1 = at(3);
        List<CageFormAuditLog> rows = List.of(
                row(1L, "has_health_abnormality", "0", "1", t0, "o1"),
                row(2L, "has_health_abnormality", "1", "0", t1, "o2"));

        Map<Long, Map<String, Boolean>> dirs = Map.of(CAGE_1, Map.of(
                CageStatusIntervalService.ruleKey("HEALTH_ABNORMAL", "VET"), true,
                CageStatusIntervalService.ruleKey("HEALTH_ABNORMAL", "OCCUPANT"), true));

        List<StatusInterval> out = service.foldRows(rows, SINCE, dirs);

        assertEquals(2, out.size());
        assertEquals(new StatusInterval(CAGE_1, "HEALTH_ABNORMAL", "OCCUPANT", t0, t1, "o1", "o2", false), out.get(0));
        assertEquals(new StatusInterval(CAGE_1, "HEALTH_ABNORMAL", "VET", t0, t1, "o1", "o2", false), out.get(1));
    }

    @Test
    void detailFieldCodesFoldAsTheirOwnStatus() {        // 特殊饲养明细的审计行用「SF_ + item_code」当 field_code（见 CageInfoValueService.setSpecialDetails）：
        // 折叠必须把它当成一个**独立状态码**，而不是「认不出来的字段」丢掉 —— 丢掉了明细就没有超时告警。
        List<CageFormAuditLog> rows = List.of(
                row(1L, CAGE_1, "SF_FEED", "0", "1", at(0), "o1"),
                row(2L, CAGE_1, "SF_FEED", "1", "0", at(2), "o2"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "SF_FEED", "DEFAULT", at(0), at(2), "o1", "o2", false)),
                service.foldRows(rows, SINCE, null));
    }

    @Test
    void detailStatusCodeIsPassedThroughUnchanged() {
        assertEquals("SF_FEED", CageStatusIntervalService.statusCodeOf("SF_FEED"));
        assertEquals("NEED_DIVIDE", CageStatusIntervalService.statusCodeOf("needs_division"));
        assertEquals(null, CageStatusIntervalService.statusCodeOf("experimenter_name"));
    }

    // ── ARO 同步写进来的行不算「进入状态」──

    /**
     * 同步全量回写会给整库笼位补写状态值（实测 25,916 行 `null→false`）。
     * 把这些当成「进入状态」的起点、再配上「出现 0 算开始」的配置，就是一次全库通知风暴
     * （2026-09-18 实测：4978 条兽医消息 + 12623 条告警，五分钟内）。
     * 用户口径：告警只认**本地真实、带时间戳**的变动。
     */
    @Test
    void syncedOpenRowDoesNotStartInterval() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "has_health_abnormality", "false", "true", at(0), "SYNC"));

        assertEquals(List.of(), service.foldRows(rows, SINCE, null), "同步写的「起点值」不能开区间");
    }

    /** 但同步把状态改成**关**，仍然要能把区间合上 —— 否则告警永远清不掉。 */
    @Test
    void syncedCloseRowStillClosesInterval() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "0", "1", at(0), "张三"),      // 人工标记 → 开
                row(2L, "needs_division", "1", "0", at(3), "SYNC"));     // 同步回写关掉 → 合

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT",
                        at(0), at(3), "张三", "SYNC", false)),
                service.foldRows(rows, SINCE, null));
    }

    // ── 归档/退出：值被整行删掉（after=NULL）──

    /**
     * 归档（转移/分笼后的源笼位）与退出都是把值**整行删掉**，审计里是 before=旧值、after=NULL。
     * 那表示「状态关了」，必须闭合区间。
     *
     * <p>2026-09-18 用户报「转移后格子左上角的告警灯还停在原来那格」——早先这里看到 after 为空
     * 就 `continue`（当成「无法识别」），于是区间永远合不上、ACTIVE 告警永不解除。
     */
    @Test
    void deletedValueAfterNullClosesOpenInterval() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "0", "1", at(0), "o1"),
                row(2L, "needs_division", "1", null, at(5), "o2"));   // 归档删值

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT",
                        at(0), at(5), "o1", "o2", false)),
                service.foldRows(rows, SINCE, null));
    }

    /**
     * 开区间在观测窗口之前、窗口内只见删值行 → 仍要合成一条已闭合区间（起算点不可观测，estimated=true），
     * 否则库里那条 ACTIVE 告警永远不会被清掉。
     */
    @Test
    void deletedValueWithEarlierOpenOutsideWindowStillYieldsClosedInterval() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "has_health_abnormality", "1", null, at(5), "o2"));

        // 健康异常配了两个通知对象（兽医 / 占用者）→ 各折一条，字段排序后是 OCCUPANT 在前
        assertEquals(List.of(
                        new StatusInterval(CAGE_1, "HEALTH_ABNORMAL", "OCCUPANT", SINCE, at(5), null, "o2", true),
                        new StatusInterval(CAGE_1, "HEALTH_ABNORMAL", "VET", SINCE, at(5), null, "o2", true)),
                service.foldRows(rows, SINCE, null));
    }

    /** 删值行的 before 也读不出布尔（前后都空）→ 无从判断状态，仍然保守跳过。 */
    @Test
    void deletedValueWithUnreadableBeforeIsStillSkipped() {
        List<CageFormAuditLog> rows = List.of(row(1L, "needs_division", null, null, at(5), "o2"));
        assertEquals(List.of(), service.foldRows(rows, SINCE, null));
    }

    /** 显式写 false（不是删值）走的是原有闭合路径，行为不受本次改动影响。 */
    @Test
    void explicitFalseStillClosesAsBefore() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "0", "1", at(0), "o1"),
                row(2L, "needs_division", "1", "0", at(5), "o2"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", "DEFAULT",
                        at(0), at(5), "o1", "o2", false)),
                service.foldRows(rows, SINCE, null));
    }
}
