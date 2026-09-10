package com.example.demo.common.excel;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 逐层小计规划：把已按 lv1→lv2→lv3 排序的明细展开为「明细 + 逐层小计 + 总计」序列。
 * 空组不出小计（避免表头处凭空多出空行）。三处导出（物资审计、物品流水、动物订购审核）共用。
 */
public final class SubtotalPlanBuilder {

    private SubtotalPlanBuilder() {
    }

    /**
     * 小计事件：level 0=总计 1=一级 2=二级 3=三级；rowIndex 仅明细行有效（≥0）。
     * 三层键 lv1 / lv2 / lv3 由调用方按业务含义填充。
     */
    public record SubtotalEvent(int level, int rowIndex, String lv1, String lv2, String lv3,
                                long net, long inbound, long outbound) {
        public boolean isDetail() {
            return rowIndex >= 0;
        }
    }

    /** 明细事件（rowIndex 指向已排序明细的下标）。 */
    public static SubtotalEvent detail(int rowIndex, String lv1, String lv2, String lv3,
                                       long net, long inbound, long outbound) {
        return new SubtotalEvent(-1, rowIndex, lv1, lv2, lv3, net, inbound, outbound);
    }

    /** 全保留、不排除板块（等价 {@link #build(List, SubtotalConfig)} 传 {@link SubtotalConfig#all()}）。 */
    public static List<SubtotalEvent> build(List<SubtotalEvent> details) {
        return build(details, SubtotalConfig.all());
    }

    /** 按配置过滤产出的事件；null 配置视为 all()。 */
    public static List<SubtotalEvent> build(List<SubtotalEvent> details, SubtotalConfig config) {
        SubtotalConfig cfg = config == null ? SubtotalConfig.all() : config;
        List<SubtotalEvent> out = new ArrayList<>();
        if (details == null || details.isEmpty()) {
            return out;
        }
        Acc[] acc = {new Acc(), new Acc(), new Acc(), new Acc()};
        for (SubtotalEvent d : details) {
            if (!Objects.equals(d.lv1(), acc[1].key)) {
                flush(out, acc, 3, cfg);
                flush(out, acc, 2, cfg);
                flush(out, acc, 1, cfg);
                acc[1].key = d.lv1();
                acc[2].key = d.lv2();
                acc[3].key = d.lv3();
            } else if (!Objects.equals(d.lv2(), acc[2].key)) {
                flush(out, acc, 3, cfg);
                flush(out, acc, 2, cfg);
                acc[2].key = d.lv2();
                acc[3].key = d.lv3();
            } else if (!Objects.equals(d.lv3(), acc[3].key)) {
                flush(out, acc, 3, cfg);
                acc[3].key = d.lv3();
            }
            out.add(d);
            // 累计求和始终全量累加（不参与过滤），否则关掉某一级会让总计算错。
            for (int lv = 1; lv <= 3; lv++) {
                acc[lv].net += d.net();
                acc[lv].inbound += d.inbound();
                acc[lv].outbound += d.outbound();
                acc[lv].count++;
            }
        }
        flush(out, acc, 3, cfg);
        flush(out, acc, 2, cfg);
        flush(out, acc, 1, cfg);

        long net = 0, inbound = 0, outbound = 0;
        for (SubtotalEvent d : details) {
            net += d.net();
            inbound += d.inbound();
            outbound += d.outbound();
        }
        if (cfg.keepLevel(0)) {
            out.add(new SubtotalEvent(0, -1, "", "", "", net, inbound, outbound));
        }
        return out;
    }

    /** 固定层级名（下标即 level）与中文标签。 */
    private static final List<String> LEVEL_NAMES = List.of("total", "lv1", "lv2", "lv3");
    private static final Map<Integer, String> LEVEL_LABELS = Map.of(
            0, "总计", 1, "课题组小计", 2, "申领人小计", 3, "物品小计");

    /**
     * 汇总计划结构：实际出现过的层级、各板块明细与各级小计条数。
     * 计数口径与 {@link #build(List, SubtotalConfig)} 产出一一对应，故摘要行数 == 导出行数。
     */
    public static SubtotalSummary summarize(List<SubtotalEvent> plan) {
        List<SubtotalEvent> events = plan == null ? List.of() : plan;

        boolean[] present = new boolean[4];
        for (SubtotalEvent e : events) {
            if (!e.isDetail() && e.level() >= 0 && e.level() <= 3) {
                present[e.level()] = true;
            }
        }
        List<String> levels = new ArrayList<>();
        Map<String, String> labels = new LinkedHashMap<>();
        for (int lv = 0; lv <= 3; lv++) {
            if (present[lv]) {
                levels.add(LEVEL_NAMES.get(lv));
                labels.put(LEVEL_NAMES.get(lv), LEVEL_LABELS.get(lv));
            }
        }

        // 板块按 lv1 首次出现顺序（跳过 total，其 lv1 为空）
        Map<String, int[]> detailCounts = new LinkedHashMap<>();
        Map<String, Map<String, Integer>> blockSubtotals = new LinkedHashMap<>();
        Map<String, Integer> allSubtotals = new LinkedHashMap<>();
        int detailRows = 0;
        for (SubtotalEvent e : events) {
            if (e.isDetail()) {
                String key = safe(e.lv1());
                detailCounts.computeIfAbsent(key, k -> new int[1]);
                blockSubtotals.computeIfAbsent(key, k -> new LinkedHashMap<>());
                detailCounts.get(key)[0]++;
                detailRows++;
                continue;
            }
            String name = LEVEL_NAMES.get(e.level());
            allSubtotals.merge(name, 1, Integer::sum);
            if (e.level() != 0) {   // total 不属于任何板块
                String key = safe(e.lv1());
                detailCounts.computeIfAbsent(key, k -> new int[1]);
                blockSubtotals.computeIfAbsent(key, k -> new LinkedHashMap<>());
                blockSubtotals.get(key).merge(name, 1, Integer::sum);
            }
        }

        List<SubtotalSummary.Block> blocks = new ArrayList<>();
        for (Map.Entry<String, int[]> en : detailCounts.entrySet()) {
            blocks.add(new SubtotalSummary.Block(en.getKey(), en.getKey(),
                    en.getValue()[0], blockSubtotals.get(en.getKey())));
        }
        return new SubtotalSummary(levels, labels, blocks,
                new SubtotalSummary.Totals(detailRows, blocks.size(), allSubtotals));
    }

    /** 小计行标签：三级/二级/一级取对应键名 + 小计，0 级为总计。 */
    public static String label(SubtotalEvent e) {
        return switch (e.level()) {
            case 3 -> safe(e.lv3()) + " 小计";
            case 2 -> safe(e.lv2()) + " 小计";
            case 1 -> safe(e.lv1()) + " 小计";
            default -> "总计";
        };
    }

    /**
     * 结算并（视配置）产出某一级小计，随后无条件清零。
     * 是否产出仅由配置决定；清零一定执行，故过滤不影响后续累计。
     * 板块排除只作用于一级小计：明细与二/三级小计照旧产出。
     */
    private static void flush(List<SubtotalEvent> out, Acc[] acc, int level, SubtotalConfig config) {
        if (acc[level].count > 0
                && config.keepLevel(level)
                && (level != 1 || config.keepBlock(acc[1].key))) {
            out.add(new SubtotalEvent(level, -1, acc[1].key, acc[2].key, acc[3].key,
                    acc[level].net, acc[level].inbound, acc[level].outbound));
        }
        acc[level].net = 0;
        acc[level].inbound = 0;
        acc[level].outbound = 0;
        acc[level].count = 0;
    }

    private static String safe(String v) {
        return v != null ? v : "";
    }

    private static final class Acc {
        String key;
        long net, inbound, outbound;
        int count;
    }
}
