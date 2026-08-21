package com.example.demo.modules.twin.obligation.content;

import com.example.demo.modules.mp.util.MpHtmlSanitizer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.util.StringUtils;

/**
 * 期 6 · 写入时：优先 JSON 真源派生 HTML；仅有 HTML 时可选反解析为 JSON。
 */
public final class ContentJsonSupport {

    private ContentJsonSupport() {
    }

    public record Resolved(String contentJson, String contentHtml) {
    }

    /**
     * @param contentJson 前端 TipTap JSON（可空）
     * @param contentHtml 前端/存量 HTML（可空）
     * @param backfillJsonFromHtml 无 JSON 时是否用 HTML 反解析补真源
     */
    public static Resolved resolve(ObjectMapper om, String contentJson, String contentHtml, boolean backfillJsonFromHtml) {
        String json = StringUtils.hasText(contentJson) ? contentJson.trim() : null;
        String htmlIn = contentHtml != null ? contentHtml : "";

        if (json != null) {
            String derived = TipTapJsonHtmlDeriver.derive(om, json);
            if (StringUtils.hasText(derived)) {
                return new Resolved(json, MpHtmlSanitizer.sanitizeBodyHtml(derived));
            }
            // JSON 无法派生时降级用传入 HTML
            return new Resolved(json, MpHtmlSanitizer.sanitizeBodyHtml(htmlIn));
        }

        String safeHtml = MpHtmlSanitizer.sanitizeBodyHtml(htmlIn);
        if (backfillJsonFromHtml && StringUtils.hasText(safeHtml)) {
            String converted = HtmlToTipTapJson.convert(om, safeHtml);
            if (converted != null) {
                return new Resolved(converted, safeHtml);
            }
        }
        return new Resolved(null, safeHtml);
    }
}
