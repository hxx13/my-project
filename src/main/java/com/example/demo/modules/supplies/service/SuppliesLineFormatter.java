package com.example.demo.modules.supplies.service;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 物资明细表行渲染（单条推送）。纯函数、只拼字符串、无依赖。
 *
 * <p>Markdown 渠道（SERVER_CHAN / WXPUSHER）用 GFM 管道行；EMAIL 渠道用 {@code <tr>} 行，
 * 因为 {@code EmailPushChannel} 不做 Markdown→HTML 转换（仅 {@code \n→<br>}），管道表在邮件里
 * 会变成一串裸竖线。表头由各自渠道模板自带，这里只产出行体。
 */
public final class SuppliesLineFormatter {

    private SuppliesLineFormatter() {}

    /** 一行明细：物资名 + 数量（可为 null） */
    public record ItemLine(String name, Integer qty) {}

    /** GFM 管道行，行间以 {@code \n} 相连（无尾部换行），模板补表头与空行。 */
    public static String renderRowsMd(List<ItemLine> lines) {
        return lines.stream()
                .map(l -> "| " + esc(l.name) + " | " + qty(l.qty) + " |")
                .collect(Collectors.joining("\n"));
    }

    /** HTML {@code <tr>} 行（不含 {@code <table>} 包裹），EMAIL 模板里已写表头。 */
    public static String renderRowsHtml(List<ItemLine> lines) {
        return lines.stream()
                .map(l -> "<tr><td style='border:1px solid #e2e8f0;padding:4px 8px'>" + esc(l.name)
                        + "</td><td style='border:1px solid #e2e8f0;padding:4px 8px;text-align:right'>" + qty(l.qty)
                        + "</td></tr>")
                .collect(Collectors.joining());
    }

    private static String qty(Integer q) {
        return q == null ? "" : String.valueOf(q);
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
