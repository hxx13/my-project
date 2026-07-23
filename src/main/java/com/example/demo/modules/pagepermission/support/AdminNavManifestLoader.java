package com.example.demo.modules.pagepermission.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.InputStream;
import java.util.*;

/**
 * 读取 build 时导出的 {@code page-permission/admin-nav.manifest.json}，
 * 作为 WEB 端页面/侧栏入口权限发现的权威清单（对接 adminNavRegistry + router）。
 */
@Component
public class AdminNavManifestLoader {
    private static final String MANIFEST_PATH = "page-permission/admin-nav.manifest.json";

    private final ObjectMapper objectMapper;
    private volatile ManifestCache cache;

    public AdminNavManifestLoader(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public Optional<ManifestSnapshot> load() {
        ManifestCache c = cache;
        if (c != null) {
            return c.snapshot;
        }
        synchronized (this) {
            if (cache != null) {
                return cache.snapshot;
            }
            cache = readManifest();
            return cache.snapshot;
        }
    }

    /** 重新扫描前刷新缓存（manifest 文件更新后） */
    public void invalidateCache() {
        synchronized (this) {
            cache = null;
        }
    }

    private ManifestCache readManifest() {
        try {
            ClassPathResource resource = new ClassPathResource(MANIFEST_PATH);
            if (!resource.exists()) {
                return new ManifestCache(Optional.empty());
            }
            try (InputStream in = resource.getInputStream()) {
                JsonNode root = objectMapper.readTree(in);
                List<ManifestPage> pages = parsePages(root.path("pages"));
                List<ManifestEntry> sidebarEntries = parseEntries(root.path("sidebarEntries"));
                Map<String, ManifestPage> pageByPath = new LinkedHashMap<>();
                for (ManifestPage p : pages) {
                    pageByPath.put(p.path(), p);
                }
                Map<String, ManifestEntry> sidebarByPath = new LinkedHashMap<>();
                for (ManifestEntry e : sidebarEntries) {
                    sidebarByPath.putIfAbsent(e.path(), e);
                }
                ManifestSnapshot snap = new ManifestSnapshot(pages, sidebarEntries, pageByPath, sidebarByPath);
                return new ManifestCache(Optional.of(snap));
            }
        } catch (Exception ignored) {
            return new ManifestCache(Optional.empty());
        }
    }

    private List<ManifestPage> parsePages(JsonNode arr) {
        if (arr == null || !arr.isArray()) return List.of();
        List<ManifestPage> out = new ArrayList<>();
        for (JsonNode n : arr) {
            String path = normalizeWebPath(n.path("path").asText(""));
            if (!StringUtils.hasText(path)) continue;
            out.add(new ManifestPage(
                    path,
                    textOrNull(n, "label"),
                    textOrNull(n, "fallbackMinRole"),
                    textOrNull(n, "groupTitle"),
                    textOrNull(n, "registryId")
            ));
        }
        return out;
    }

    private List<ManifestEntry> parseEntries(JsonNode arr) {
        if (arr == null || !arr.isArray()) return List.of();
        List<ManifestEntry> out = new ArrayList<>();
        for (JsonNode n : arr) {
            String path = normalizeWebPath(n.path("path").asText(""));
            if (!StringUtils.hasText(path)) continue;
            String source = textOrNull(n, "entrySource");
            if (!StringUtils.hasText(source)) source = "sidebar";
            out.add(new ManifestEntry(
                    path,
                    textOrNull(n, "label"),
                    source,
                    textOrNull(n, "fallbackMinRole"),
                    textOrNull(n, "groupTitle"),
                    textOrNull(n, "registryId")
            ));
        }
        return out;
    }

    private static String textOrNull(JsonNode n, String field) {
        JsonNode v = n.path(field);
        if (v.isMissingNode() || v.isNull()) return null;
        String t = v.asText("").trim();
        return t.isEmpty() ? null : t;
    }

    private static String normalizeWebPath(String raw) {
        if (!StringUtils.hasText(raw)) return null;
        String v = raw.trim();
        if ("*".equals(v) || "index".equals(v)) return null;
        if (!v.startsWith("/")) v = "/" + v;
        return v.replaceAll("/+", "/");
    }

    private record ManifestCache(Optional<ManifestSnapshot> snapshot) {}

    public record ManifestSnapshot(
            List<ManifestPage> pages,
            List<ManifestEntry> sidebarEntries,
            Map<String, ManifestPage> pageByPath,
            Map<String, ManifestEntry> sidebarByPath
    ) {}

    public record ManifestPage(
            String path,
            String label,
            String fallbackMinRole,
            String groupTitle,
            String registryId
    ) {}

    public record ManifestEntry(
            String path,
            String label,
            String entrySource,
            String fallbackMinRole,
            String groupTitle,
            String registryId
    ) {}
}
