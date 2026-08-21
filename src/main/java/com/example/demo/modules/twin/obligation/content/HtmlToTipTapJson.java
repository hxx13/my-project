package com.example.demo.modules.twin.obligation.content;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.jsoup.select.NodeTraversor;
import org.jsoup.select.NodeVisitor;

import java.util.ArrayList;
import java.util.List;

/**
 * 期 6 · 存量 HTML → TipTap/ProseMirror JSON。
 * 解析失败返回 null（调用方保留原 HTML、不阻塞迁移）。
 */
public final class HtmlToTipTapJson {

    private HtmlToTipTapJson() {
    }

    public static String convert(ObjectMapper om, String html) {
        if (om == null || html == null || html.isBlank()) {
            return null;
        }
        try {
            Element body = Jsoup.parseBodyFragment(html).body();
            ObjectNode doc = om.createObjectNode();
            doc.put("type", "doc");
            ArrayNode content = doc.putArray("content");
            List<Element> blocks = topLevelBlocks(body);
            if (blocks.isEmpty()) {
                ObjectNode p = content.addObject();
                p.put("type", "paragraph");
                ArrayNode inline = p.putArray("content");
                appendInlineFrom(om, body, inline);
                if (inline.isEmpty()) {
                    return om.writeValueAsString(doc);
                }
            } else {
                for (Element block : blocks) {
                    appendBlock(om, block, content);
                }
            }
            if (content.isEmpty()) {
                ObjectNode p = content.addObject();
                p.put("type", "paragraph");
            }
            return om.writeValueAsString(doc);
        } catch (Exception e) {
            return null;
        }
    }

    private static List<Element> topLevelBlocks(Element body) {
        List<Element> out = new ArrayList<>();
        for (Element child : body.children()) {
            String tag = child.normalName();
            if ("p".equals(tag) || "h1".equals(tag) || "h2".equals(tag) || "h3".equals(tag)
                    || "h4".equals(tag) || "h5".equals(tag) || "h6".equals(tag)
                    || "ul".equals(tag) || "ol".equals(tag) || "blockquote".equals(tag)
                    || "hr".equals(tag) || "div".equals(tag)) {
                out.add(child);
            }
        }
        return out;
    }

    private static void appendBlock(ObjectMapper om, Element el, ArrayNode content) {
        String tag = el.normalName();
        switch (tag) {
            case "h1", "h2", "h3", "h4", "h5", "h6" -> {
                ObjectNode h = content.addObject();
                h.put("type", "heading");
                ObjectNode attrs = h.putObject("attrs");
                attrs.put("level", Integer.parseInt(tag.substring(1)));
                ArrayNode inline = h.putArray("content");
                appendInlineFrom(om, el, inline);
            }
            case "ul" -> {
                ObjectNode ul = content.addObject();
                ul.put("type", "bulletList");
                ArrayNode items = ul.putArray("content");
                for (Element li : el.select("> li")) {
                    ObjectNode item = items.addObject();
                    item.put("type", "listItem");
                    ArrayNode itemContent = item.putArray("content");
                    ObjectNode p = itemContent.addObject();
                    p.put("type", "paragraph");
                    ArrayNode inline = p.putArray("content");
                    appendInlineFrom(om, li, inline);
                }
            }
            case "ol" -> {
                ObjectNode ol = content.addObject();
                ol.put("type", "orderedList");
                ArrayNode items = ol.putArray("content");
                for (Element li : el.select("> li")) {
                    ObjectNode item = items.addObject();
                    item.put("type", "listItem");
                    ArrayNode itemContent = item.putArray("content");
                    ObjectNode p = itemContent.addObject();
                    p.put("type", "paragraph");
                    ArrayNode inline = p.putArray("content");
                    appendInlineFrom(om, li, inline);
                }
            }
            case "blockquote" -> {
                ObjectNode bq = content.addObject();
                bq.put("type", "blockquote");
                ArrayNode inner = bq.putArray("content");
                ObjectNode p = inner.addObject();
                p.put("type", "paragraph");
                ArrayNode inline = p.putArray("content");
                appendInlineFrom(om, el, inline);
            }
            case "hr" -> content.addObject().put("type", "horizontalRule");
            case "div" -> {
                ObjectNode p = content.addObject();
                p.put("type", "paragraph");
                ArrayNode inline = p.putArray("content");
                appendInlineFrom(om, el, inline);
            }
            default -> {
                ObjectNode p = content.addObject();
                p.put("type", "paragraph");
                ArrayNode inline = p.putArray("content");
                appendInlineFrom(om, el, inline);
            }
        }
    }

    private static void appendInlineFrom(ObjectMapper om, Element root, ArrayNode inline) {
        List<MarkState> marks = new ArrayList<>();
        NodeTraversor.traverse(new NodeVisitor() {
            @Override
            public void head(Node node, int depth) {
                if (node instanceof TextNode tn) {
                    String text = tn.getWholeText();
                    if (text == null || text.isEmpty()) {
                        return;
                    }
                    // 跳过纯空白但保留单空格语义
                    if (text.isBlank() && !" ".equals(text)) {
                        return;
                    }
                    ObjectNode t = inline.addObject();
                    t.put("type", "text");
                    t.put("text", text);
                    if (!marks.isEmpty()) {
                        ArrayNode m = t.putArray("marks");
                        for (MarkState ms : marks) {
                            ObjectNode mark = m.addObject();
                            mark.put("type", ms.type);
                        }
                    }
                } else if (node instanceof Element el) {
                    String tag = el.normalName();
                    if ("br".equals(tag)) {
                        inline.addObject().put("type", "hardBreak");
                        return;
                    }
                    if ("img".equals(tag)) {
                        ObjectNode img = inline.addObject();
                        img.put("type", "image");
                        ObjectNode attrs = img.putObject("attrs");
                        attrs.put("src", el.hasAttr("src") ? el.attr("src") : "");
                        attrs.put("alt", el.hasAttr("alt") ? el.attr("alt") : "");
                        return;
                    }
                    String mark = markType(tag);
                    if (mark != null) {
                        marks.add(new MarkState(mark));
                    }
                }
            }

            @Override
            public void tail(Node node, int depth) {
                if (node instanceof Element el) {
                    String mark = markType(el.normalName());
                    if (mark != null && !marks.isEmpty()) {
                        marks.remove(marks.size() - 1);
                    }
                }
            }
        }, root);
    }

    private static String markType(String tag) {
        return switch (tag) {
            case "strong", "b" -> "bold";
            case "em", "i" -> "italic";
            case "u" -> "underline";
            case "code" -> "code";
            default -> null;
        };
    }

    private record MarkState(String type) {
    }
}
