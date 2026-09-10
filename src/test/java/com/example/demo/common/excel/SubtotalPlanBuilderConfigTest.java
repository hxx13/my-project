package com.example.demo.common.excel;

import com.example.demo.common.excel.SubtotalPlanBuilder.SubtotalEvent;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 小计配置过滤：只影响「产出哪些事件」，累计求和一律全量累加，关层级不改总计。
 */
class SubtotalPlanBuilderConfigTest {

    /** A组/张三(2件) + A组/李四(1件) + B组/王五(1件)：全保留时 lv3×4 lv2×3 lv1×2 total×1。 */
    private static List<SubtotalEvent> fixture() {
        return List.of(
                SubtotalPlanBuilder.detail(0, "A组", "张三", "手套", 10, 0, 0),
                SubtotalPlanBuilder.detail(1, "A组", "张三", "口罩", 5, 0, 0),
                SubtotalPlanBuilder.detail(2, "A组", "李四", "口罩", 20, 0, 0),
                SubtotalPlanBuilder.detail(3, "B组", "王五", "手套", 15, 0, 0));
    }

    private static long countLevel(List<SubtotalEvent> plan, int level) {
        return plan.stream().filter(e -> e.level() == level).count();
    }

    private static long sumNet(List<SubtotalEvent> plan, int level) {
        return plan.stream().filter(e -> e.level() == level).mapToLong(SubtotalEvent::net).sum();
    }

    @Test
    void all_keepsEveryLevel() {
        List<SubtotalEvent> plan = SubtotalPlanBuilder.build(fixture(), SubtotalConfig.all());
        assertEquals(4, countLevel(plan, 3));
        assertEquals(3, countLevel(plan, 2));
        assertEquals(2, countLevel(plan, 1));
        assertEquals(1, countLevel(plan, 0));
    }

    @Test
    void lv2Disabled_producesNoLevel2EventsButTotalStillFull() {
        List<SubtotalEvent> plan = SubtotalPlanBuilder.build(fixture(),
                SubtotalConfig.parse("total,lv1,lv3", null));
        assertEquals(0, countLevel(plan, 2), "关掉 lv2 后不应有 level==2 的事件");
        assertEquals(4, countLevel(plan, 3));
        assertEquals(2, countLevel(plan, 1));
        // 关键：累计求和不受过滤影响，总计仍为全量 50
        assertEquals(50L, sumNet(plan, 0));
        assertEquals(35L, plan.stream().filter(e -> e.level() == 1 && "A组".equals(e.lv1()))
                .mapToLong(SubtotalEvent::net).findFirst().orElse(-1));
    }

    @Test
    void excludeBlock_dropsItsLv1Only() {
        List<SubtotalEvent> plan = SubtotalPlanBuilder.build(fixture(),
                SubtotalConfig.parse(null, "A组"));
        assertTrue(plan.stream().noneMatch(e -> e.level() == 1 && "A组".equals(e.lv1())),
                "被排除板块的一级小计应消失");
        assertEquals(1, countLevel(plan, 1));
        assertEquals(4, countLevel(plan, 3), "二/三级小计不受板块排除影响");
        assertEquals(3, countLevel(plan, 2));
        assertEquals(4, plan.stream().filter(SubtotalEvent::isDetail).count(), "明细数不变");
        assertEquals(50L, sumNet(plan, 0), "总计仍含被排除板块");
    }

    @Test
    void blankOrNullLevels_keepAll() {
        assertEquals(4, countLevel(SubtotalPlanBuilder.build(fixture(), SubtotalConfig.parse("", null)), 3));
        assertEquals(4, countLevel(SubtotalPlanBuilder.build(fixture(), SubtotalConfig.parse(null, null)), 3));
        assertEquals(1, countLevel(SubtotalPlanBuilder.build(fixture(), SubtotalConfig.parse("  ", null)), 0));
    }

    @Test
    void noneLevels_keepsNoSubtotalAtAll() {
        List<SubtotalEvent> plan = SubtotalPlanBuilder.build(fixture(), SubtotalConfig.parse("none", null));
        assertFalse(plan.stream().anyMatch(e -> !e.isDetail()), "none 应一个层级都不保留");
        assertEquals(4, plan.stream().filter(SubtotalEvent::isDetail).count());
    }

    @Test
    void unknownLevelsAndBlocks_areIgnoredWithoutError() {
        List<SubtotalEvent> plan = SubtotalPlanBuilder.build(fixture(),
                SubtotalConfig.parse("lv9,bogus", "不存在的板块"));
        assertFalse(plan.stream().anyMatch(e -> !e.isDetail()), "未知层名全部忽略");
        assertEquals(4, plan.stream().filter(SubtotalEvent::isDetail).count());
        // keepBlock 对不存在/未排除的键恒真
        assertTrue(SubtotalConfig.all().keepBlock("任意"));
        assertTrue(SubtotalConfig.all().keepBlock(null));
    }

    // ---------- Task 2：摘要 DTO ----------

    @Test
    void summarize_blocksFollowFirstAppearanceAndCountCorrectly() {
        SubtotalSummary s = SubtotalPlanBuilder.summarize(SubtotalPlanBuilder.build(fixture()));

        assertEquals(List.of("total", "lv1", "lv2", "lv3"), s.levels());
        assertEquals("总计", s.levelLabels().get("total"));
        assertEquals("课题组小计", s.levelLabels().get("lv1"));
        assertEquals("申领人小计", s.levelLabels().get("lv2"));
        assertEquals("物品小计", s.levelLabels().get("lv3"));

        assertEquals(List.of("A组", "B组"), s.blocks().stream().map(SubtotalSummary.Block::key).toList());
        SubtotalSummary.Block a = s.blocks().get(0);
        assertEquals(3, a.detailCount());
        assertEquals(3, a.subtotalCounts().get("lv3"));   // 张三:手套/口罩 + 李四:口罩
        assertEquals(2, a.subtotalCounts().get("lv2"));   // 张三 + 李四
        assertEquals(1, a.subtotalCounts().get("lv1"));
        SubtotalSummary.Block b = s.blocks().get(1);
        assertEquals(1, b.detailCount());
        assertEquals(1, b.subtotalCounts().get("lv3"));

        assertEquals(4, s.totals().detailRows());
        assertEquals(2, s.totals().blocks());
        assertEquals(4, s.totals().subtotals().get("lv3"));
        assertEquals(3, s.totals().subtotals().get("lv2"));
        assertEquals(2, s.totals().subtotals().get("lv1"));
        assertEquals(1, s.totals().subtotals().get("total"));
    }

    @Test
    void summarize_levelsOnlyListsPresentOnes() {
        List<SubtotalEvent> plan = SubtotalPlanBuilder.build(fixture(),
                SubtotalConfig.parse("total,lv1", null));
        SubtotalSummary s = SubtotalPlanBuilder.summarize(plan);
        assertEquals(List.of("total", "lv1"), s.levels(), "未出现的层级不列入");
        assertFalse(s.levelLabels().containsKey("lv2"));
        assertEquals(2, s.totals().subtotals().get("lv1"));
        assertFalse(s.totals().subtotals().containsKey("lv2"));
    }
}
