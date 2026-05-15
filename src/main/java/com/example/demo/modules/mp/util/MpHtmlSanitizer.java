package com.example.demo.modules.mp.util;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.safety.Safelist;

/**
 * 公告/版本等富文本入库前消毒，配合前端 DOMPurify；禁止 script 等危险标签。
 */
public final class MpHtmlSanitizer {

    private MpHtmlSanitizer() {
    }

    public static String sanitizeBodyHtml(String html) {
        if (html == null) {
            return "";
        }
        Document.OutputSettings settings = new Document.OutputSettings().prettyPrint(false);
        return Jsoup.clean(html, "", Safelist.relaxed(), settings);
    }
}
