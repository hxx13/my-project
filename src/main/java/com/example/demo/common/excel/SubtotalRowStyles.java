package com.example.demo.common.excel;

import com.example.demo.common.excel.SubtotalPlanBuilder.SubtotalEvent;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.BorderStyle;
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
 * 小计导出配色：一个「块」（一级分组=课题组/供应商，物资审计按人）占一个色系，块内按层级分深浅
 * ——明细最浅，小计按级别递进（三级最浅 → 一级最深）并加粗；相邻块换色系，总计单独一色。
 * 三处导出（物资审计·物品流水、动物订购审核、采购汇总）共用。
 */
public final class SubtotalRowStyles {

    /**
     * 一个「块」（默认一级分组，物资审计按人）占一个色系，色系内再按**层级**分深浅：
     * 下标 0=明细（最浅）、1=一级小计、2=二级小计、3=三级小计；
     * 层级越靠外（1 级/课题组）越深，所以同一个人内部「物品小计 → 申领人小计 → 课题组小计」深浅递进，能一眼分清。
     * 相邻块换色系，块与块之间也分得开。
     */
    private static final byte[][][] BLOCK_FILLS = {
            { // 蓝系
                    {(byte) 0xFF, (byte) 0xDD, (byte) 0xE9, (byte) 0xF7},   // 明细
                    {(byte) 0xFF, (byte) 0x86, (byte) 0xAE, (byte) 0xDF},   // 一级小计（最浅的"深配色"）
                    {(byte) 0xFF, (byte) 0xA6, (byte) 0xC4, (byte) 0xEA},   // 二级小计
                    {(byte) 0xFF, (byte) 0xC3, (byte) 0xD8, (byte) 0xF2},   // 三级小计（最浅的小计档）
            },
            { // 绿系
                    {(byte) 0xFF, (byte) 0xDE, (byte) 0xEF, (byte) 0xDE},
                    {(byte) 0xFF, (byte) 0x8B, (byte) 0xC5, (byte) 0x8B},
                    {(byte) 0xFF, (byte) 0xA9, (byte) 0xD6, (byte) 0xA9},
                    {(byte) 0xFF, (byte) 0xC6, (byte) 0xE4, (byte) 0xC6},
            },
    };
    private static final byte[] TOTAL_FILL = {(byte) 0xFF, (byte) 0xD9, (byte) 0xD9, (byte) 0xD9};

    /** [色系][层级 0..3] 的样式；层级 ≥1 加粗 */
    private final CellStyle[][] blockStyles;
    private final CellStyle total;

    private SubtotalRowStyles(Workbook wb) {
        Font plain = wb.createFont();
        Font bold = wb.createFont();
        bold.setBold(true);
        blockStyles = new CellStyle[BLOCK_FILLS.length][];
        for (int hue = 0; hue < BLOCK_FILLS.length; hue++) {
            byte[][] shades = BLOCK_FILLS[hue];
            blockStyles[hue] = new CellStyle[shades.length];
            for (int lv = 0; lv < shades.length; lv++) {
                blockStyles[hue][lv] = style(wb, shades[lv], lv == 0 ? plain : bold);
            }
        }
        total = style(wb, TOTAL_FILL, bold);
    }

    /** 每张表建一次（勿在循环内调用）。仅适用于 XSSF 工作簿。 */
    public static SubtotalRowStyles create(Workbook wb) {
        return new SubtotalRowStyles(wb);
    }

    /**
     * 指定色系与层级（0=明细，1/2/3=对应级小计）的样式。
     * 层级越靠外越深且加粗，所以同一个人内部按小计级别深浅递进。
     */
    public CellStyle block(int index, int level) {
        int hue = Math.floorMod(index, BLOCK_FILLS.length);
        CellStyle[] shades = blockStyles[hue];
        int lv = level < 0 ? 0 : Math.min(level, shades.length - 1);
        return shades[lv];
    }

    /** 兼容旧口径：bold 视为二级小计的深浅档。 */
    public CellStyle block(int index, boolean bold) {
        return block(index, bold ? 2 : 0);
    }

    public CellStyle total() {
        return total;
    }

    /**
     * 生成与 plan 下标一一对应的行样式：明细行取所属板块底色，小计行同色加粗，总计单独一色。
     * 板块按 {@code colorLevel} 变化切分，相邻板块底色交替。
     *
     * @param colorLevel 用哪一层作为"一块"来交替配色：1=一级（如课题组）、2=二级（如申领人）。
     *                   物资审计要"一个人一块颜色"就传 2；只按大板块配色传 1。
     */
    public List<CellStyle> planStyles(List<SubtotalEvent> plan, int colorLevel) {
        int level = colorLevel <= 0 ? 1 : colorLevel;
        List<CellStyle> out = new ArrayList<>(plan.size());
        String currentBlock = null;
        int blockIndex = -1;
        for (SubtotalEvent e : plan) {
            if (e.level() == 0) {
                out.add(total);
                continue;
            }
            String key = switch (level) {
                case 3 -> e.lv3();
                case 2 -> e.lv2();
                default -> e.lv1();
            };
            if (!Objects.equals(key, currentBlock)) {
                currentBlock = key;
                blockIndex++;
            }
            // 明细用最浅档；小计按自己的级别取深浅（1 级最深 → 3 级最浅）
            out.add(block(blockIndex, e.isDetail() ? 0 : e.level()));
        }
        return out;
    }

    /** 默认按一级分组（板块）交替配色。 */
    public List<CellStyle> planStyles(List<SubtotalEvent> plan) {
        return planStyles(plan, 1);
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
        // 细边框：整表有格子（用户明确要求——没有边框时打印/截图看不出行列边界）
        s.setBorderTop(BorderStyle.THIN);
        s.setBorderBottom(BorderStyle.THIN);
        s.setBorderLeft(BorderStyle.THIN);
        s.setBorderRight(BorderStyle.THIN);
        XSSFColor line = new XSSFColor(new byte[]{(byte) 0xFF, (byte) 0xBF, (byte) 0xBF, (byte) 0xBF}, null);
        s.setTopBorderColor(line);
        s.setBottomBorderColor(line);
        s.setLeftBorderColor(line);
        s.setRightBorderColor(line);
        return s;
    }

    /** 表头样式：与数据同样的细边框 + 加粗；底色沿用第一档板块浅色，和色带接得上。 */
    public static CellStyle header(Workbook wb) {
        Font bold = wb.createFont();
        bold.setBold(true);
        return style(wb, BLOCK_FILLS[0][0], bold);
    }
}
