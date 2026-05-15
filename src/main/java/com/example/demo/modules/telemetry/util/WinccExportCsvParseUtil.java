package com.example.demo.modules.telemetry.util;

import com.example.demo.modules.telemetry.dto.watchlist.TelemetryWatchlistTagWriteDto;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
/**
 * 解析 WinCC 变量表导出 CSV：按表头识别「名称、结构类型、数据类型」，可选「注释」作为默认展示映射。
 */
public final class WinccExportCsvParseUtil {

    private WinccExportCsvParseUtil() {
    }

    public static List<TelemetryWatchlistTagWriteDto> parse(String csvText) {
        List<TelemetryWatchlistTagWriteDto> out = new ArrayList<>();
        if (csvText == null || csvText.isBlank()) {
            return out;
        }
        String[] lines = csvText.split("\\R");
        int idxName = -1;
        int idxStruct = -1;
        int idxDataType = -1;
        int idxComment = -1;
        int dataStart = 0;
        boolean headerFound = false;
        for (int li = 0; li < lines.length; li++) {
            String line = lines[li] == null ? "" : lines[li].trim();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            String[] cells = splitCsvLine(line);
            if (looksLikeHeaderRow(cells)) {
                for (int i = 0; i < cells.length; i++) {
                    String h = headerCell(cells[i]);
                    if ("名称".equals(h)) {
                        idxName = i;
                    } else if ("结构类型".equals(h)) {
                        idxStruct = i;
                    } else if ("数据类型".equals(h)) {
                        idxDataType = i;
                    } else if ("注释".equals(h)) {
                        idxComment = i;
                    }
                }
                dataStart = li + 1;
                headerFound = true;
                break;
            }
        }
        if (!headerFound) {
            idxName = 0;
            idxDataType = 3;
            idxStruct = 4;
            idxComment = 1;
            dataStart = 0;
        }
        int order = 0;
        for (int li = dataStart; li < lines.length; li++) {
            String line = lines[li] == null ? "" : lines[li].trim();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            String[] cells = splitCsvLine(line);
            String name = cellAt(cells, idxName);
            if (!StringUtils.hasText(name) || isHeaderLikeName(name)) {
                continue;
            }
            String structure = emptyToNull(cellAt(cells, idxStruct));
            String dataType = emptyToNull(cellAt(cells, idxDataType));
            String comment = idxComment >= 0 ? emptyToNull(cellAt(cells, idxComment)) : null;

            TelemetryWatchlistTagWriteDto w = new TelemetryWatchlistTagWriteDto();
            w.setWinccVariableName(name);
            w.setStructureType(structure);
            w.setDataType(dataType);
            w.setDisplayLabel(comment);
            w.setEnabled(true);
            w.setSortOrder(order++);
            out.add(w);
        }
        return out;
    }

    private static boolean looksLikeHeaderRow(String[] cells) {
        for (String c : cells) {
            if ("名称".equals(headerCell(c))) {
                return true;
            }
        }
        return false;
    }

    private static String headerCell(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.trim().replace("\"", "");
    }

    private static boolean isHeaderLikeName(String name) {
        String n = name.trim();
        return "名称".equals(n) || "tagname".equalsIgnoreCase(n) || "variable".equalsIgnoreCase(n);
    }

    private static String[] splitCsvLine(String line) {
        return line.split(",", -1);
    }

    private static String cellAt(String[] cells, int i) {
        if (i < 0 || cells == null || i >= cells.length) {
            return "";
        }
        return cells[i] == null ? "" : cells[i].trim().replace("\"", "");
    }

    private static String emptyToNull(String s) {
        if (!StringUtils.hasText(s)) {
            return null;
        }
        return s.trim();
    }
}
