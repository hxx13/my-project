package com.example.demo.modules.aro.support;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.jsoup.select.Elements;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 将 ARO 官方 CMS（尤其 Google Docs / QOWT 导出）HTML 转为微信小程序 rich-text 可渲染的子集。
 */
public final class AroNewsHtmlSanitizer {

    private AroNewsHtmlSanitizer() {
    }

    public static boolean needsRichTextSanitize(String html) {
        if (html == null || html.isBlank()) {
            return false;
        }
        String s = html;
        return s.contains("qowt-")
                || s.contains("style-scope")
                || s.contains("is=\"qowt")
                || s.contains("is='qowt")
                || s.contains("<qowt");
    }

    public static String forMiniProgramRichText(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        String html = raw.trim();
        if (!needsRichTextSanitize(html)) {
            return html;
        }

        Document doc = Jsoup.parseBodyFragment(html);
        Element body = doc.body();

        List<Element> leafParas = collectLeafParagraphs(body);
        if (leafParas.isEmpty()) {
            String plain = body.text().trim();
            if (!plain.isEmpty()) {
                return "<p>" + escapeMinimal(plain) + "</p>";
            }
            return "";
        }

        Set<String> seen = new LinkedHashSet<>();
        StringBuilder sb = new StringBuilder();
        for (Element para : leafParas) {
            String rendered = renderParagraph(para);
            if (rendered.isEmpty()) {
                continue;
            }
            String key = para.text().replaceAll("\\s+", " ").trim();
            if (!key.isEmpty() && !seen.add(key)) {
                continue;
            }
            if (key.isEmpty() && rendered.contains("<br")) {
                if (!seen.add("__br__" + sb.length())) {
                    continue;
                }
            }
            sb.append(rendered);
        }
        return sb.toString();
    }

    /**
     * 只取最内层段落块，避免 qowt-section / p / qowt-word-para 嵌套时重复三遍。
     * Jsoup select() 会返回元素自身，因此需要排除自身匹配。
     */
    static List<Element> collectLeafParagraphs(Element root) {
        List<Element> blocks = new ArrayList<>();

        Elements candidates = root.select("p, qowt-word-para");
        for (Element el : candidates) {
            Elements nested = el.select("p, qowt-word-para");
            nested.remove(el); // select() includes the element itself
            if (!nested.isEmpty()) {
                continue;
            }
            blocks.add(el);
        }

        if (!blocks.isEmpty()) {
            return blocks;
        }

        for (Element el : root.select("[is]")) {
            String is = el.attr("is").toLowerCase();
            if (!is.contains("para")) {
                continue;
            }
            Elements nested = el.select("p, qowt-word-para, [is]");
            nested.remove(el); // select() includes the element itself
            if (!nested.isEmpty()) {
                continue;
            }
            blocks.add(el);
        }

        return blocks;
    }

    static String renderParagraph(Element para) {
        String inner = renderInlineChildren(para).trim();
        if (inner.isEmpty()) {
            return "";
        }
        if (isBoldParagraph(para)) {
            if (inner.startsWith("<strong>") && inner.endsWith("</strong>")) {
                return "<p>" + inner + "</p>";
            }
            return "<p><strong>" + inner + "</strong></p>";
        }
        return "<p>" + inner + "</p>";
    }

    private static String renderInlineChildren(Element parent) {
        StringBuilder sb = new StringBuilder();
        for (Node node : parent.childNodes()) {
            sb.append(renderNode(node));
        }
        return sb.toString();
    }

    private static String renderNode(Node node) {
        if (node instanceof TextNode tn) {
            return escapeMinimal(tn.getWholeText());
        }
        if (!(node instanceof Element el)) {
            return "";
        }
        String tag = el.tagName().toLowerCase();
        if ("br".equals(tag)) {
            return "<br/>";
        }
        String inner = renderInlineChildren(el).trim();
        if (inner.isEmpty()) {
            return "";
        }
        if (isBoldElement(el)) {
            if (inner.startsWith("<strong>") && inner.endsWith("</strong>")) {
                return inner;
            }
            return "<strong>" + inner + "</strong>";
        }
        return inner;
    }

    private static boolean isBoldParagraph(Element para) {
        return hasBoldStlClass(para.className());
    }

    private static boolean isBoldElement(Element el) {
        String tag = el.tagName().toLowerCase();
        if ("b".equals(tag) || "strong".equals(tag)) {
            return true;
        }
        return hasBoldStlClass(el.className());
    }

    /** qowt-stl-2/3/4：标题、章节号、小标题 */
    private static boolean hasBoldStlClass(String className) {
        if (className == null || className.isBlank()) {
            return false;
        }
        return className.contains("qowt-stl-2")
                || className.contains("qowt-stl-3")
                || className.contains("qowt-stl-4");
    }

    private static String escapeMinimal(String text) {
        return text
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }
}
