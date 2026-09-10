package com.example.demo.common.excel;

import com.example.demo.common.excel.SubtotalPlanBuilder.SubtotalEvent;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFColor;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * 小计导出配色：同一板块（一级分组，如课题组 / 供应商）的明细行与其小计行铺同一底色，整块连成一片；
 * 相邻板块交替两种浅色，总计单独一色。小计行靠加粗和标签列位置区分，不再单独配色。
 * 三处导出（物资审计·物品流水、动物订购审核、采购汇总）共用。
 */
public final class SubtotalRowStyles {

    /** 相邻板块交替使用的底色（浅蓝 / 浅绿），ARGB 含 FF 不透明。 */
    private static final byte[][] BLOCK_FILLS = {
            {(byte) 0xFF, (byte) 0xDD, (byte) 0xE9, (byte) 0xF7},
            {(byte) 0xFF, (byte) 0xDE, (byte) 0xEF, (byte) 0xDE},
    };
    private static final byte[] TOTAL_FILL = {(byte) 0xFF, (byte) 0xD9, (byte) 0xD9, (byte) 0xD9};

    private final CellStyle[] blockPlain;
    private final CellStyle[] blockBold;
    private final CellStyle total;

    private SubtotalRowStyles(Workbook wb) {
        Font plain = wb.createFont();
        Font bold = wb.createFont();
        bold.setBold(true);
        blockPlain = new CellStyle[BLOCK_FILLS.length];
        blockBold = new CellStyle[BLOCK_FILLS.length];
        for (int i = 0; i < BLOCK_FILLS.length; i++) {
            blockPlain[i] = style(wb, BLOCK_FILLS[i], plain);
            blockBold[i] = style(wb, BLOCK_FILLS[i], bold);
        }
        total = style(wb, TOTAL_FILL, bold);
    }

    /** 每张表建一次（勿在循环内调用）。仅适用于 XSSF 工作簿。 */
    public static SubtotalRowStyles create(Workbook wb) {
        return new SubtotalRowStyles(wb);
    }

    /** 板块第 index 行样式；bold=true 用于小计行。 */
    public CellStyle block(int index, boolean bold) {
        int slot = Math.floorMod(index, BLOCK_FILLS.length);
        return bold ? blockBold[slot] : blockPlain[slot];
    }

    public CellStyle total() {
        return total;
    }

    /**
     * 生成与 plan 下标一一对应的行样式：明细行取所属板块底色，小计行同色加粗，总计单独一色。
     * 板块按 lv1 变化切分，相邻板块底色交替。
     */
    public List<CellStyle> planStyles(List<SubtotalEvent> plan) {
        List<CellStyle> out = new ArrayList<>(plan.size());
        String currentBlock = null;
        int blockIndex = -1;
        for (SubtotalEvent e : plan) {
            if (e.level() == 0) {
                out.add(total);
                continue;
            }
            if (!Objects.equals(e.lv1(), currentBlock)) {
                currentBlock = e.lv1();
                blockIndex++;
            }
            out.add(block(blockIndex, !e.isDetail()));
        }
        return out;
    }

    /**
     * 整行铺底（含无内容的列），形成一条横向色带。
     * 只对不存在的单元格调 createCell——已存在的单元格复用并覆盖样式，避免 POI 重建单元格时丢掉值。
     */
    public static void apply(Row row, int lastColInclusive, CellStyle style) {
        if (style == null) {
            return;
        }
        for (int c = 0; c <= lastColInclusive; c++) {
            Cell cell = row.getCell(c);
            if (cell == null) {
                cell = row.createCell(c);
            }
            cell.setCellStyle(style);
        }
    }

    private static CellStyle style(Workbook wb, byte[] rgb, Font font) {
        XSSFCellStyle s = (XSSFCellStyle) wb.createCellStyle();
        s.setFillForegroundColor(new XSSFColor(rgb, null));
        s.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        s.setFont(font);
        return s;
    }
}
