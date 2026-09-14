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

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", t, t, "o1", "o2", false)),
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
                        new StatusInterval(CAGE_1, "NEED_DIVIDE", at(0), at(1), "o1", "o2", false),
                        new StatusInterval(CAGE_1, "NEED_DIVIDE", at(2), at(3), "o3", "o4", false),
                        new StatusInterval(CAGE_1, "NEED_DIVIDE", at(4), null, "o5", null, false)),
                service.foldRows(rows, SINCE, null));
    }

    // ── 起算点不可观测 ──

    @Test
    void firstObservationIsCloseMeansEstimatedTrue() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "1", "0", at(0), "o1"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", SINCE, at(0), null, "o1", true)),
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

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", SINCE, null, "o1", null, true)),
                service.foldRows(rows, SINCE, null));
    }

    /** 空串不算「明确是关」，同样走 estimated=true（与 null 同判）。 */
    @Test
    void firstOpenWithEmptyBeforeMeansEstimatedTrue() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "", "1", at(0), "o1"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", SINCE, null, "o1", null, true)),
                service.foldRows(rows, SINCE, null));
    }

    @Test
    void firstOpenWithExplicitClosedBeforeMeansEstimatedFalse() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_division", "0", "1", at(0), "o1"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", at(0), null, "o1", null, false)),
                service.foldRows(rows, SINCE, null));
    }

    // ── 未闭合 ──

    @Test
    void unclosedIntervalHasNullRemovedAt() {
        List<CageFormAuditLog> rows = List.of(
                row(1L, "needs_cohabitation", "false", "true", at(0), "o1"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "COHABITATION", at(0), null, "o1", null, false)),
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

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", at(2), at(3), "o3", "o4", false)),
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
                        new StatusInterval(CAGE_1, "NEED_DIVIDE", at(0), at(1), "o1", "o2", false),
                        new StatusInterval(CAGE_1, "NEED_DIVIDE", at(2), at(3), "o3", "o4", false)),
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

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", at(0), at(2), "o1", "o3", false)),
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
                        new StatusInterval(CAGE_1, "NEED_DIVIDE", at(0), at(2), "o1", "o3", false),
                        new StatusInterval(CAGE_1, "SPECIAL_FEEDING", at(3), null, "o4", null, false),
                        new StatusInterval(CAGE_2, "NEED_DIVIDE", at(1), null, "o2", null, false)),
                service.foldRows(rows, SINCE, null));
    }

    // ── 查库委托 ──

    @Test
    void loadRowsThenFoldDelegatesToMapper() {
        CageFormAuditLog r = row(1L, "needs_division", "0", "1", at(0), "o1");
        when(mapper.listStatusFieldRows(anyList(), eq(CageStatusIntervalService.DETAIL_STATUS_PREFIX), eq(SINCE)))
                .thenReturn(List.of(r));

        List<StatusInterval> out = service.foldRows(service.loadStatusFieldRows(SINCE), SINCE, null);

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", at(0), null, "o1", null, false)), out);
    }

    // ── 反向计时起点（start_value=0：出现 0 开始记录，0→1 结束）──

    /** 把这些 (笼位,状态) 的计时起点配成「出现 0 开始」。 */
    private static Map<Long, Map<String, Boolean>> startAtZero(long cageId, String status) {
        return Map.of(cageId, Map.of(status, false));
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
        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", t0, t1, "o1", "o2", false)), out);
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

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", t0, t2, "o1", "o3", false)), out);
    }

    @Test
    void zeroStartFirstObservationWithUnknownBeforeIsEstimated() {
        // 首见就落在起点值、before 不可识别 → 起算点不可观测，用 since 兜底并标 estimated。
        List<CageFormAuditLog> rows = List.of(row(1L, "needs_division", null, "0", at(3), "o1"));

        List<StatusInterval> out = service.foldRows(rows, SINCE, startAtZero(CAGE_1, "NEED_DIVIDE"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", SINCE, null, "o1", null, true)), out);
    }

    @Test
    void zeroStartFirstObservationCloseWithBeforeStartMeansEstimatedClosed() {
        // 首见就是反向值、且 before 明确是起点值 → 观测窗口之前就已在计时，合成一条已闭合的 estimated 区间。
        List<CageFormAuditLog> rows = List.of(row(1L, "needs_division", "0", "1", at(4), "o1"));

        List<StatusInterval> out = service.foldRows(rows, SINCE, startAtZero(CAGE_1, "NEED_DIVIDE"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "NEED_DIVIDE", SINCE, at(4), null, "o1", true)), out);
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
        Map<Long, Map<String, Boolean>> dirs = Map.of(CAGE_1, Map.of("NEED_DIVIDE", false));

        List<StatusInterval> out = service.foldRows(rows, SINCE, dirs);

        assertEquals(2, out.size());
        // NEED_DIVIDE：按反向，t0 起一条开区间
        assertEquals(new StatusInterval(CAGE_1, "NEED_DIVIDE", t0, null, "o1", null, false), out.get(0));
        // SPECIAL_FEEDING：缺方向项 → 回落默认「出现 1 开始」，同样在 t0 开
        assertEquals(new StatusInterval(CAGE_1, "SPECIAL_FEEDING", t0, null, "o1", null, false), out.get(1));
    }

    @Test
    void detailFieldCodesFoldAsTheirOwnStatus() {
        // 特殊饲养明细的审计行用「SF_ + item_code」当 field_code（见 CageInfoValueService.setSpecialDetails）：
        // 折叠必须把它当成一个**独立状态码**，而不是「认不出来的字段」丢掉 —— 丢掉了明细就没有超时告警。
        List<CageFormAuditLog> rows = List.of(
                row(1L, CAGE_1, "SF_FEED", "0", "1", at(0), "o1"),
                row(2L, CAGE_1, "SF_FEED", "1", "0", at(2), "o2"));

        assertEquals(List.of(new StatusInterval(CAGE_1, "SF_FEED", at(0), at(2), "o1", "o2", false)),
                service.foldRows(rows, SINCE, null));
    }

    @Test
    void detailStatusCodeIsPassedThroughUnchanged() {
        assertEquals("SF_FEED", CageStatusIntervalService.statusCodeOf("SF_FEED"));
        assertEquals("NEED_DIVIDE", CageStatusIntervalService.statusCodeOf("needs_division"));
        assertEquals(null, CageStatusIntervalService.statusCodeOf("experimenter_name"));
    }
}
