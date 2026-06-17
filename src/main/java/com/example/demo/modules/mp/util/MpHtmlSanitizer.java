package com.example.demo.modules.mp.util;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.safety.Safelist;

/**
 * 公告/版本等富文本入库前消毒，配合前端 DOMPurify；禁止 script 等危险标签。
 * 保留 TipTap 字色与高亮色块（mark / span style）。
 */
public final class MpHtmlSanitizer {

    /** relaxed + mark + 行内 style（TipTap 字色 / 高亮色块） */
    private static final Safelist RICH_TEXT_BODY = Safelist.relaxed()
            .addTags("mark")
            .addAttributes(":all", "style")
            .addAttributes("mark", "data-color");

    private MpHtmlSanitizer() {
    }

    public static String sanitizeBodyHtml(String html) {
        if (html == null) {
            return "";
        }
        String preserved = preserveEmptyParagraphs(html);
        Document.OutputSettings settings = new Document.OutputSettings().prettyPrint(false);
        return Jsoup.clean(preserved, "", RICH_TEXT_BODY, settings);
    }

    /**
     * Jsoup {@link Safelist#relaxed()} 会丢弃空 {@code <p></p>}，导致 TipTap 空行无法保存。
     * 入库前将空段落转为 {@code &nbsp;} 占位，展示时仍保留段落间距。
     */
    static String preserveEmptyParagraphs(String html) {
        if (html == null || html.isBlank()) {
            return html == null ? "" : html;
        }
        return html.replaceAll(
                "(?i)<p(\\s[^>]*)?>\\s*(<br\\s[^>]*\\/?>|<br\\/?>)?\\s*</p>",
                "<p$1>&nbsp;</p>"
        );
    }
}
