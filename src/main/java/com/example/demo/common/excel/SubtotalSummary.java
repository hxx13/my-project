package com.example.demo.common.excel;

import java.util.List;
import java.util.Map;

/**
 * 导出计划的结构摘要（供导出前预览）：发生了哪些小计层级、每个板块的明细与各级小计条数。
 * 计数口径与 {@link SubtotalPlanBuilder} 产出的计划严格一致，故摘要数字 == 导出实际行数。
 *
 * @param levels      计划中实际出现过的层级名，固定顺序 total, lv1, lv2, lv3
 * @param levelLabels 上述层级名 → 中文标签
 * @param blocks      板块（按 lv1 首次出现顺序）
 * @param totals      全局合计
 */
public record SubtotalSummary(
        List<String> levels,
        Map<String, String> levelLabels,
        List<Block> blocks,
        Totals totals) {

    /**
     * 单个板块的小计条数。
     *
     * @param key            板块 key（即 lv1 名）
     * @param label          展示标签（同 key）
     * @param detailCount    该板块明细行数
     * @param subtotalCounts 该板块各级小计条数（层级名 → 条数，仅含出现过的层级）
     */
    public record Block(String key, String label, int detailCount, Map<String, Integer> subtotalCounts) {
    }

    /**
     * @param detailRows 明细行总数
     * @param blocks     板块数
     * @param subtotals  各级小计条数（层级名 → 条数）
     */
    public record Totals(int detailRows, int blocks, Map<String, Integer> subtotals) {
    }
}
