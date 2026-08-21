package com.example.demo.modules.twin.obligation.content;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * 期 6 · TipTap/ProseMirror JSON → HTML 派生（服务端缓存列）。
 * 覆盖文档/段落/标题/粗斜体/列表等常用节点；未知节点降级为纯文本子树。
 */
public final class TipTapJsonHtmlDeriver {

    private TipTapJsonHtmlDeriver() {
    }

    public static String derive(ObjectMapper om, String contentJson) {
        if (contentJson == null || contentJson.isBlank() || om == null) {
            return "";
        }
        try {
            JsonNode root = om.readTree(contentJson);
            JsonNode content = root.has("content") ? root.get("content") : root;
            StringBuilder sb = new StringBuilder();
            renderNodes(content, sb);
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private static void renderNodes(JsonNode nodes, StringBuilder sb) {
        if (nodes == null || !nodes.isArray()) {
            return;
        }
        for (JsonNode n : nodes) {
            renderNode(n, sb);
        }
    }

    private static void renderNode(JsonNode n, StringBuilder sb) {
        if (n == null || !n.isObject()) {
            return;
        }
        String type = n.path("type").asText("");
        switch (type) {
            case "doc" -> renderNodes(n.get("content"), sb);
            case "paragraph" -> {
                sb.append("<p>");
                renderInline(n.get("content"), sb);
                sb.append("</p>");
            }
            case "heading" -> {
                int level = Math.min(6, Math.max(1, n.path("attrs").path("level").asInt(1)));
                sb.append("<h").append(level).append('>');
                renderInline(n.get("content"), sb);
                sb.append("</h").append(level).append('>');
            }
            case "bulletList" -> {
                sb.append("<ul>");
                renderNodes(n.get("content"), sb);
                sb.append("</ul>");
            }
            case "orderedList" -> {
                sb.append("<ol>");
                renderNodes(n.get("content"), sb);
                sb.append("</ol>");
            }
            case "listItem" -> {
                sb.append("<li>");
                renderNodes(n.get("content"), sb);
                sb.append("</li>");
            }
            case "blockquote" -> {
                sb.append("<blockquote>");
                renderNodes(n.get("content"), sb);
                sb.append("</blockquote>");
            }
            case "hardBreak" -> sb.append("<br/>");
            case "horizontalRule" -> sb.append("<hr/>");
            case "image" -> {
                String src = escapeAttr(n.path("attrs").path("src").asText(""));
                if (!src.isEmpty()) {
                    sb.append("<img src=\"").append(src).append("\" alt=\"\"/>");
                }
            }
            case "text" -> renderText(n, sb);
            default -> {
                if (n.has("content")) {
                    renderNodes(n.get("content"), sb);
                } else if ("text".equals(type) || n.has("text")) {
                    renderText(n, sb);
                }
            }
        }
    }

    private static void renderInline(JsonNode nodes, StringBuilder sb) {
        if (nodes == null || !nodes.isArray()) {
            return;
        }
        for (JsonNode n : nodes) {
            String type = n.path("type").asText("");
            if ("text".equals(type)) {
                renderText(n, sb);
            } else if ("hardBreak".equals(type)) {
                sb.append("<br/>");
            } else if (n.has("content")) {
                renderInline(n.get("content"), sb);
            }
        }
    }

    private static void renderText(JsonNode n, StringBuilder sb) {
        String text = escapeHtml(n.path("text").asText(""));
        JsonNode marks = n.get("marks");
        if (marks != null && marks.isArray()) {
            for (JsonNode m : marks) {
                String mt = m.path("type").asText("");
                text = switch (mt) {
                    case "bold", "strong" -> "<strong>" + text + "</strong>";
                    case "italic", "em" -> "<em>" + text + "</em>";
                    case "code" -> "<code>" + text + "</code>";
                    case "underline" -> "<u>" + text + "</u>";
                    default -> text;
                };
            }
        }
        sb.append(text);
    }

    private static String escapeHtml(String s) {
        if (s == null || s.isEmpty()) {
            return "";
        }
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private static String escapeAttr(String s) {
        return escapeHtml(s);
    }
}
