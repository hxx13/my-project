package com.example.demo.common.excel;

import java.util.ArrayList;
import java.util.List;
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

    public static List<SubtotalEvent> build(List<SubtotalEvent> details) {
        List<SubtotalEvent> out = new ArrayList<>();
        if (details == null || details.isEmpty()) {
            return out;
        }
        Acc[] acc = {new Acc(), new Acc(), new Acc(), new Acc()};
        for (SubtotalEvent d : details) {
            if (!Objects.equals(d.lv1(), acc[1].key)) {
                flush(out, acc, 3);
                flush(out, acc, 2);
                flush(out, acc, 1);
                acc[1].key = d.lv1();
                acc[2].key = d.lv2();
                acc[3].key = d.lv3();
            } else if (!Objects.equals(d.lv2(), acc[2].key)) {
                flush(out, acc, 3);
                flush(out, acc, 2);
                acc[2].key = d.lv2();
                acc[3].key = d.lv3();
            } else if (!Objects.equals(d.lv3(), acc[3].key)) {
                flush(out, acc, 3);
                acc[3].key = d.lv3();
            }
            out.add(d);
            for (int lv = 1; lv <= 3; lv++) {
                acc[lv].net += d.net();
                acc[lv].inbound += d.inbound();
                acc[lv].outbound += d.outbound();
                acc[lv].count++;
            }
        }
        flush(out, acc, 3);
        flush(out, acc, 2);
        flush(out, acc, 1);

        long net = 0, inbound = 0, outbound = 0;
        for (SubtotalEvent d : details) {
            net += d.net();
            inbound += d.inbound();
            outbound += d.outbound();
        }
        out.add(new SubtotalEvent(0, -1, "", "", "", net, inbound, outbound));
        return out;
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

    private static void flush(List<SubtotalEvent> out, Acc[] acc, int level) {
        if (acc[level].count > 0) {
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
