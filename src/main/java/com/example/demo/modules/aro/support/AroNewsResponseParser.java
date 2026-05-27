package com.example.demo.modules.aro.support;

import com.alibaba.fastjson2.JSON;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 解析 ARO JTU {@code /news} 响应：兼容官方 CMS 编辑后字段名/结构变化（空占位字段、records、嵌套正文等）。
 */
public final class AroNewsResponseParser {

    private static final String[] LIST_KEYS = {"list", "records", "rows", "items", "data"};
    private static final String[] TITLE_KEYS = {"newsName", "title", "name", "newsTitle", "subject"};
    private static final String[] ID_KEYS = {"id", "newsId", "news_id"};
    private static final String[] TIME_KEYS = {"createTime", "create_time", "gmtCreate", "publishTime", "publish_time", "updateTime"};
    private static final String[] CONTENT_KEYS = {
            "newsContent", "news_content", "content", "newsContentHtml", "contentHtml",
            "html", "detail", "body", "newsDetail", "description", "text"
    };

    private AroNewsResponseParser() {
    }

    @SuppressWarnings("unchecked")
    public static List<Map<String, Object>> extractListMaps(Map<String, Object> root) {
        if (root == null || root.isEmpty()) {
            return List.of();
        }
        List<?> rawList = findListInObject(root.get("data"));
        if (rawList == null) {
            rawList = findListInObject(root);
        }
        if (rawList == null) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : rawList) {
            if (o instanceof Map) {
                out.add((Map<String, Object>) o);
            }
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> extractDetailMap(Map<String, Object> root, String fallbackId) {
        if (root == null || root.isEmpty()) {
            return Map.of();
        }
        Object data = root.get("data");
        if (data instanceof Map<?, ?> dataMap) {
            Map<String, Object> m = (Map<String, Object>) dataMap;
            if (looksLikeNewsItem(m)) {
                return m;
            }
            Object nested = m.get("news");
            if (nested instanceof Map<?, ?> nestedMap) {
                return (Map<String, Object>) nestedMap;
            }
        }
        if (looksLikeNewsItem(root)) {
            return root;
        }
        if (fallbackId != null && !fallbackId.isBlank()) {
            return Map.of("id", fallbackId);
        }
        return Map.of();
    }

    public static String pickTitle(Map<String, Object> m) {
        return pickString(m, TITLE_KEYS);
    }

    public static String pickId(Map<String, Object> m, String fallbackId) {
        String id = pickString(m, ID_KEYS);
        if (!id.isEmpty()) {
            return id;
        }
        return fallbackId == null ? "" : fallbackId.trim();
    }

    public static String pickCreateTime(Map<String, Object> m) {
        return pickString(m, TIME_KEYS);
    }

    /**
     * 正文：优先非空 HTML 字符串；富文本 JSON 数组则序列化为 JSON 供小程序 rich-text nodes 解析。
     */
    public static String pickNewsContent(Map<String, Object> m) {
        String raw = pickNewsContentRaw(m);
        return AroNewsHtmlSanitizer.forMiniProgramRichText(raw);
    }

    /** 自 Map 提取正文 HTML（未做 rich-text 清洗）。 */
    public static String pickNewsContentRaw(Map<String, Object> m) {
        for (String key : CONTENT_KEYS) {
            if (m == null || !m.containsKey(key)) {
                continue;
            }
            String extracted = stringifyContent(m.get(key));
            if (!extracted.isEmpty()) {
                return extracted;
            }
        }
        if (m != null) {
            String deep = deepFindHtmlString(m);
            if (!deep.isEmpty()) {
                return deep;
            }
        }
        return "";
    }

    @SuppressWarnings("unchecked")
    private static String deepFindHtmlString(Map<String, Object> m) {
        for (Object value : m.values()) {
            if (value instanceof String s && looksLikeHtml(s)) {
                return s.trim();
            }
            if (value instanceof Map<?, ?> nested) {
                String found = deepFindHtmlString((Map<String, Object>) nested);
                if (!found.isEmpty()) {
                    return found;
                }
            }
        }
        return "";
    }

    private static boolean looksLikeHtml(String s) {
        if (s == null || s.length() < 8) {
            return false;
        }
        String t = s.trim();
        return t.startsWith("<") && (t.contains("</") || t.contains("/>") || t.contains("<p") || t.contains("<div"));
    }

    private static List<?> findListInObject(Object node) {
        if (node instanceof List<?> list) {
            return list;
        }
        if (!(node instanceof Map<?, ?> map)) {
            return null;
        }
        for (String key : LIST_KEYS) {
            Object candidate = map.get(key);
            if (candidate instanceof List<?> list && !list.isEmpty()) {
                return list;
            }
        }
        return null;
    }

    private static boolean looksLikeNewsItem(Map<String, Object> m) {
        if (m == null || m.isEmpty()) {
            return false;
        }
        return !pickString(m, ID_KEYS).isEmpty()
                || !pickString(m, TITLE_KEYS).isEmpty()
                || !pickNewsContent(m).isEmpty();
    }

    private static String pickString(Map<String, Object> m, String... keys) {
        for (String key : keys) {
            if (m == null || !m.containsKey(key)) {
                continue;
            }
            String s = stringifyContent(m.get(key));
            if (!s.isEmpty()) {
                return s;
            }
        }
        return "";
    }

    static String stringifyContent(Object raw) {
        if (raw == null) {
            return "";
        }
        if (raw instanceof String s) {
            return s.trim();
        }
        if (raw instanceof Number || raw instanceof Boolean) {
            return String.valueOf(raw).trim();
        }
        if (raw instanceof Map<?, ?> map) {
            for (String key : new String[]{"html", "content", "text", "value", "body", "newsContent"}) {
                Object inner = map.get(key);
                String nested = stringifyContent(inner);
                if (!nested.isEmpty()) {
                    return nested;
                }
            }
            return "";
        }
        if (raw instanceof List<?> list) {
            if (list.isEmpty()) {
                return "";
            }
            Object first = list.get(0);
            if (first instanceof Map<?, ?> firstMap) {
                Object type = firstMap.get("type") != null ? firstMap.get("type") : firstMap.get("name");
                if (type != null) {
                    return JSON.toJSONString(list);
                }
            }
            return JSON.toJSONString(list);
        }
        String fallback = String.valueOf(raw).trim();
        if (fallback.startsWith("[") || fallback.startsWith("{")) {
            return fallback;
        }
        return "";
    }
}
