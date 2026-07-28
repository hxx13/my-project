package com.example.demo.modules.pagepermission.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.pagepermission.dto.BatchUpdatePagePermissionRequest;
import com.example.demo.modules.pagepermission.dto.UpdatePagePermissionRequest;
import com.example.demo.modules.pagepermission.entity.PagePermissionItem;
import com.example.demo.modules.pagepermission.mapper.PagePermissionMapper;
import com.example.demo.modules.pagepermission.support.AdminNavManifestLoader;
import com.example.demo.modules.pagepermission.support.AdminNavManifestLoader.ManifestEntry;
import com.example.demo.modules.pagepermission.support.AdminNavManifestLoader.ManifestPage;
import com.example.demo.modules.pagepermission.support.AdminNavManifestLoader.ManifestSnapshot;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class PagePermissionService {
    private static final Pattern ROUTE_PATH = Pattern.compile("path:\\s*\"([^\"]+)\"");
    private static final Pattern NAV_TO = Pattern.compile("to=\"([^\"]+)\"");
    /** 与 {@code adminNavRegistry.ts} 中「id, path, label」顺序一致，供侧栏入口与展示名自动发现 */
    private static final Pattern WEB_REGISTRY_ITEM =
            Pattern.compile("\\{\\s*id:\\s*\"[^\"]+\"\\s*,\\s*path:\\s*\"(/admin[^\"]+)\"\\s*,\\s*\\R\\s*label:\\s*\"([^\"]+)\"");
    private static final Pattern MINI_FUNCTION_BLOCK = Pattern.compile("([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\},");
    private static final Pattern MINI_NAV_URL = Pattern.compile("url:\\s*'([^']+)'");
    private static final Pattern MINI_ROLE = Pattern.compile("hasMinRole\\([^,]+,\\s*'([A-Z_]+)'\\)");
    private static final Pattern MINI_WXML_CELL = Pattern.compile("<van-cell[^>]*title=\"([^\"]+)\"[^>]*bind:click=\"([^\"]+)\"");
    private static final Pattern MINI_WXML_QUICK = Pattern.compile("class=\"quick-item\"\\s+bindtap=\"([^\"]+)\"");

    private final PagePermissionMapper mapper;
    private final ObjectMapper objectMapper;
    private final AdminNavManifestLoader adminNavManifestLoader;
    private final JdbcTemplate jdbcTemplate;

    public PagePermissionService(PagePermissionMapper mapper,
                                 ObjectMapper objectMapper,
                                 AdminNavManifestLoader adminNavManifestLoader,
                                 JdbcTemplate jdbcTemplate) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
        this.adminNavManifestLoader = adminNavManifestLoader;
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * 服务启动时重置全部权限默认值 + 扫描双端，确保代码中的 fallbackMinRole
     * 与数据库 page_permission_item 完全一致，无需手工操作。
     */
    @PostConstruct
    public void autoScanOnStartup() {
        try {
            // 先重置所有平台：清掉 manual_override，min_role = default_min_role
            mapper.resetDefaultByPlatform("WEB");
            mapper.resetDefaultByPlatform("MINI");
            // 再用当前代码重新扫描，写入最新的 default_min_role 和 min_role
            scanAll();
        } catch (Exception ignored) {
            // DB 未就绪时静默跳过
        }
    }

    public List<PagePermissionItem> listByPlatform(String platform) {
        String normalized = normalizePlatform(platform);
        if (normalized == null) return List.of();
        scanPlatform(normalized);
        return mapper.listByPlatform(normalized);
    }

    public List<Map<String, Object>> listTreeByPlatform(String platform) {
        List<PagePermissionItem> rows = listByPlatform(platform);
        Map<String, List<PagePermissionItem>> byParent = rows.stream()
                .collect(Collectors.groupingBy(x -> StringUtils.hasText(x.getParentNodeKey()) ? x.getParentNodeKey() : "__ROOT__"));
        return buildTree("__ROOT__", byParent);
    }

    @Transactional
    public Map<String, Object> scanAll() {
        adminNavManifestLoader.invalidateCache();
        invalidatePublicCache();
        int web = scanPlatform("WEB");
        int mini = scanPlatform("MINI");
        return Map.of("web", web, "mini", mini);
    }

    @Transactional
    public boolean updateOne(String nodeKey, UpdatePagePermissionRequest req) {
        if (!StringUtils.hasText(nodeKey) || req == null) return false;
        String minRole = normalizeRole(req.getMinRole());
        if (minRole == null) return false;
        int enabled = req.getEnabled() == null ? 1 : (req.getEnabled() == 1 ? 1 : 0);
        PagePermissionItem current = mapper.findByNodeKey(nodeKey.trim());
        if (current == null) return false;
        if (!validateParentRoleConstraint(current.getParentNodeKey(), minRole)) return false;
        return mapper.updateManual(nodeKey.trim(), minRole, enabled) > 0;
    }

    @Transactional
    public int batchUpdate(BatchUpdatePagePermissionRequest req) {
        if (req == null || req.getItems() == null || req.getItems().isEmpty()) return 0;
        int changed = 0;
        for (BatchUpdatePagePermissionRequest.Item item : req.getItems()) {
            if (item == null) continue;
            UpdatePagePermissionRequest one = new UpdatePagePermissionRequest();
            one.setEnabled(item.getEnabled());
            one.setMinRole(item.getMinRole());
            if (updateOne(item.getNodeKey(), one)) changed += 1;
        }
        return changed;
    }

    @Transactional
    public int resetDefaults(String platform) {
        String normalized = normalizePlatform(platform);
        if (normalized == null) return 0;
        return mapper.resetDefaultByPlatform(normalized);
    }

    /** 公开端点缓存：纯 DB 读取，不触发文件扫描 */
    private volatile List<Map<String, Object>> cachedPublicWeb;
    private volatile long cachedPublicWebAt;
    private static final long PUBLIC_CACHE_MS = 120_000; // 2 分钟

    public List<Map<String, Object>> listPublicForPlatform(String platform) {
        String normalized = normalizePlatform(platform);
        if (normalized == null) return List.of();
        if ("WEB".equals(normalized)) {
            long now = System.currentTimeMillis();
            if (cachedPublicWeb != null && (now - cachedPublicWebAt) < PUBLIC_CACHE_MS) {
                return cachedPublicWeb;
            }
            List<Map<String, Object>> rows = mapper.listByPlatform(normalized).stream()
                    .map(this::toPublicView).toList();
            cachedPublicWeb = rows;
            cachedPublicWebAt = now;
            return rows;
        }
        // MINI 端量少，直接查
        return mapper.listByPlatform(normalized).stream().map(this::toPublicView).toList();
    }

    /** 管理端手动重新扫描时同步刷新缓存 */
    public void invalidatePublicCache() {
        cachedPublicWeb = null;
    }

    /**
     * 按路径解析权限节点（优先 WEB 侧栏 ENTRY），供超级管理员侧栏右键快捷改权。
     */
    public Map<String, Object> lookupByPlatformAndPath(String platform, String rawPath) {
        String normalized = normalizePlatform(platform);
        if (normalized == null) return null;
        String path = "WEB".equals(normalized) ? normalizeWebPath(rawPath) : normalizeMiniPath(rawPath);
        if (!StringUtils.hasText(path)) return null;
        List<PagePermissionItem> rows = mapper.listByPlatformAndPath(normalized, path);
        if (rows == null || rows.isEmpty()) return null;
        PagePermissionItem best = pickBestPermissionRow(rows, normalized);
        return toAdminLookupView(best);
    }

    private int scanPlatform(String platform) {
        String normalized = normalizePlatform(platform);
        if (normalized == null) return 0;
        List<NodeSeed> discovered = "WEB".equals(normalized) ? discoverWeb() : discoverMini();
        LocalDateTime now = LocalDateTime.now();
        int affected = 0;
        for (NodeSeed seed : discovered) {
            PagePermissionItem row = new PagePermissionItem();
            row.setPlatform(seed.platform);
            row.setNodeKey(seed.nodeKey);
            row.setNodeType(seed.nodeType);
            row.setDisplayName(seed.displayName);
            row.setPathOrRoute(seed.pathOrRoute);
            row.setEntrySource(seed.entrySource);
            row.setMinRole(seed.minRole);
            row.setDefaultMinRole(seed.minRole);
            row.setEnabled(1);
            row.setParentNodeKey(seed.parentNodeKey);
            row.setChainKey(seed.chainKey);
            row.setLastDiscoveredAt(now);
            affected += mapper.upsertFromScan(row);
        }
        List<String> aliveKeys = discovered.stream().map(x -> x.nodeKey).distinct().toList();
        mapper.touchMissingAsUndiscovered(normalized, aliveKeys, now);
        return affected;
    }

    private List<NodeSeed> discoverWeb() {
        Optional<ManifestSnapshot> manifestOpt = adminNavManifestLoader.load();
        if (manifestOpt.isPresent()) {
            return discoverWebFromManifest(manifestOpt.get());
        }
        return discoverWebLegacy();
    }

    private List<NodeSeed> discoverWebFromManifest(ManifestSnapshot manifest) {
        List<NodeSeed> out = new ArrayList<>();
        Set<String> pagePaths = new LinkedHashSet<>();
        Set<String> entryPaths = new LinkedHashSet<>();

        for (ManifestPage page : manifest.pages()) {
            String path = normalizeWebPath(page.path());
            if (!StringUtils.hasText(path)) continue;
            pagePaths.add(path);
            String role = resolveWebMinRole(path, page.fallbackMinRole());
            String label = StringUtils.hasText(page.label()) ? page.label().trim() : path;
            out.add(NodeSeed.webPage(webPageKey(path), path, label, role));
        }

        for (ManifestEntry entry : manifest.sidebarEntries()) {
            String path = normalizeWebPath(entry.path());
            if (!StringUtils.hasText(path)) continue;
            entryPaths.add(path);
            if (!pagePaths.contains(path)) {
                pagePaths.add(path);
                String pageRole = resolveWebMinRole(path, entry.fallbackMinRole());
                String pageLabel = StringUtils.hasText(entry.label()) ? entry.label().trim() : path;
                out.add(NodeSeed.webPage(webPageKey(path), path, pageLabel, pageRole));
            }
            String role = resolveWebMinRole(path, entry.fallbackMinRole());
            String label = StringUtils.hasText(entry.label()) ? entry.label().trim() : path;
            String source = StringUtils.hasText(entry.entrySource()) ? entry.entrySource().trim() : "sidebar";
            out.add(NodeSeed.webEntry(source, path, label, role, webPageKey(path)));
        }

        for (DbNavItem dbItem : loadAdminNavConfigItems()) {
            String path = normalizeWebPath(dbItem.path());
            if (!StringUtils.hasText(path)) continue;
            ManifestPage mp = manifest.pageByPath().get(path);
            ManifestEntry me = manifest.sidebarByPath().get(path);
            String fallback = me != null ? me.fallbackMinRole() : (mp != null ? mp.fallbackMinRole() : null);
            if (!pagePaths.contains(path)) {
                pagePaths.add(path);
                String role = resolveWebMinRole(path, fallback);
                String label = StringUtils.hasText(dbItem.label()) ? dbItem.label().trim() : path;
                out.add(NodeSeed.webPage(webPageKey(path), path, label, role));
            }
            if (entryPaths.contains(path)) continue;
            entryPaths.add(path);
            String role = resolveWebMinRole(path, fallback);
            String label = StringUtils.hasText(dbItem.label()) ? dbItem.label().trim() : path;
            out.add(NodeSeed.webEntry("sidebar", path, label, role, webPageKey(path)));
        }

        mergeLegacyWebEntryPaths(out, pagePaths, entryPaths, manifest.pageByPath(), manifest.sidebarByPath());
        return dedup(out);
    }

    private void mergeLegacyWebEntryPaths(List<NodeSeed> out,
                                          Set<String> pagePaths,
                                          Set<String> entryPaths,
                                          Map<String, ManifestPage> pageByPath,
                                          Map<String, ManifestEntry> sidebarByPath) {
        Path root = Path.of("").toAbsolutePath().normalize();
        String layout = readText(root.resolve("frontend/src/layouts/AdminLayout.tsx"));
        String debugNav = readText(root.resolve("frontend/src/features/dev-tools/DebugNav.tsx"));

        Set<String> extraEntryPaths = new LinkedHashSet<>();
        Matcher navMatcher = NAV_TO.matcher(layout);
        while (navMatcher.find()) {
            String path = normalizeWebPath(navMatcher.group(1));
            if (StringUtils.hasText(path)) extraEntryPaths.add(path);
        }
        Matcher debugMatcher = Pattern.compile("path:\\s*'([^']+)'").matcher(debugNav);
        while (debugMatcher.find()) {
            String path = normalizeWebPath(debugMatcher.group(1));
            if (StringUtils.hasText(path)) extraEntryPaths.add(path);
        }

        for (String path : extraEntryPaths) {
            ManifestPage mp = pageByPath.get(path);
            ManifestEntry me = sidebarByPath.get(path);
            String fallback = me != null ? me.fallbackMinRole() : (mp != null ? mp.fallbackMinRole() : null);
            if (!pagePaths.contains(path)) {
                pagePaths.add(path);
                String role = resolveWebMinRole(path, fallback);
                String label = mp != null && StringUtils.hasText(mp.label()) ? mp.label().trim() : path;
                out.add(NodeSeed.webPage(webPageKey(path), path, label, role));
            }
            if (entryPaths.contains(path)) continue;
            entryPaths.add(path);
            String role = resolveWebMinRole(path, fallback);
            String label = me != null && StringUtils.hasText(me.label()) ? me.label().trim() : path;
            out.add(NodeSeed.webEntry("sidebar", path, label, role, webPageKey(path)));
        }
    }

    private List<DbNavItem> loadAdminNavConfigItems() {
        try {
            return jdbcTemplate.query(
                    "SELECT title, item_path FROM admin_nav_config WHERE type = 'ITEM' AND item_path IS NOT NULL AND TRIM(item_path) <> ''",
                    (rs, rowNum) -> new DbNavItem(rs.getString("title"), rs.getString("item_path")));
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private String resolveWebMinRole(String path, String fallbackMinRole) {
        String normalized = normalizeRole(fallbackMinRole);
        if (normalized != null) return normalized;
        return inferWebMinRole(path);
    }

    /** manifest 不可用时的旧版文件扫描（开发兜底） */
    private List<NodeSeed> discoverWebLegacy() {
        List<NodeSeed> out = new ArrayList<>();
        Path root = Path.of("").toAbsolutePath().normalize();
        String router = readText(root.resolve("frontend/src/router/index.tsx"));
        String layout = readText(root.resolve("frontend/src/layouts/AdminLayout.tsx"));
        String debugNav = readText(root.resolve("frontend/src/features/dev-tools/DebugNav.tsx"));
        String adminNavRegistry = readText(root.resolve("frontend/src/features/admin/adminNavRegistry.ts"));
        Map<String, String> registryPathToLabel = discoverWebRegistryPathToLabel(adminNavRegistry);

        Set<String> paths = discoverAdminRoutePaths(router);
        for (String path : paths) {
            String role = inferWebMinRole(path);
            String pageKey = webPageKey(path);
            String pageTitle = registryPathToLabel.getOrDefault(path, path);
            out.add(NodeSeed.webPage(pageKey, path, pageTitle, role));
        }

        Set<String> entryPaths = new LinkedHashSet<>();
        Matcher navMatcher = NAV_TO.matcher(layout);
        while (navMatcher.find()) {
            String path = normalizeWebPath(navMatcher.group(1));
            if (StringUtils.hasText(path)) entryPaths.add(path);
        }
        Matcher debugMatcher = Pattern.compile("path:\\s*'([^']+)'").matcher(debugNav);
        while (debugMatcher.find()) {
            String path = normalizeWebPath(debugMatcher.group(1));
            if (StringUtils.hasText(path)) entryPaths.add(path);
        }
        entryPaths.addAll(registryPathToLabel.keySet());
        for (String path : entryPaths) {
            String role = inferWebMinRole(path);
            String pageKey = webPageKey(path);
            String entryTitle = registryPathToLabel.getOrDefault(path, path);
            out.add(NodeSeed.webPage(pageKey, path, entryTitle, role));
            out.add(NodeSeed.webEntry("sidebar", path, entryTitle, role, webPageKey(path)));
        }
        return dedup(out);
    }

    private Set<String> discoverAdminRoutePaths(String router) {
        Set<String> paths = new LinkedHashSet<>();
        paths.add("/admin");
        int adminIdx = router.indexOf("path: \"/admin\"");
        if (adminIdx < 0) return paths;
        String slice = router.substring(adminIdx);
        Matcher m = ROUTE_PATH.matcher(slice);
        while (m.find()) {
            String raw = m.group(1).trim();
            if (!StringUtils.hasText(raw) || "/admin".equals(raw)) continue;
            if (raw.startsWith("/admin")) {
                String normalized = normalizeWebPath(raw);
                if (StringUtils.hasText(normalized)) paths.add(normalized);
            } else if (!raw.startsWith("/")) {
                String normalized = normalizeWebPath("/admin/" + raw);
                if (StringUtils.hasText(normalized)) paths.add(normalized);
            }
        }
        return paths;
    }

    private Map<String, String> discoverWebRegistryPathToLabel(String adminNavRegistryTs) {
        Map<String, String> map = new LinkedHashMap<>();
        if (!StringUtils.hasText(adminNavRegistryTs)) return map;
        Matcher m = WEB_REGISTRY_ITEM.matcher(adminNavRegistryTs);
        while (m.find()) {
            String path = normalizeWebPath(m.group(1));
            if (!StringUtils.hasText(path)) continue;
            map.put(path, m.group(2).trim());
        }
        return map;
    }

    private PagePermissionItem pickBestPermissionRow(List<PagePermissionItem> rows, String platform) {
        if ("WEB".equals(platform)) {
            for (PagePermissionItem r : rows) {
                if ("ENTRY".equalsIgnoreCase(r.getNodeType()) && "sidebar".equals(r.getEntrySource())) {
                    return r;
                }
            }
        }
        for (PagePermissionItem r : rows) {
            if ("ENTRY".equalsIgnoreCase(r.getNodeType())) {
                return r;
            }
        }
        for (PagePermissionItem r : rows) {
            if ("PAGE".equalsIgnoreCase(r.getNodeType())) {
                return r;
            }
        }
        return rows.get(0);
    }

    private Map<String, Object> toAdminLookupView(PagePermissionItem row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("nodeKey", row.getNodeKey());
        out.put("platform", row.getPlatform());
        out.put("nodeType", row.getNodeType());
        out.put("displayName", row.getDisplayName());
        out.put("pathOrRoute", row.getPathOrRoute());
        out.put("entrySource", row.getEntrySource());
        out.put("minRole", row.getMinRole());
        out.put("defaultMinRole", row.getDefaultMinRole());
        out.put("enabled", row.getEnabled());
        out.put("manualOverride", row.getManualOverride());
        return out;
    }

    private List<NodeSeed> discoverMini() {
        List<NodeSeed> out = new ArrayList<>();
        Path root = Path.of("").toAbsolutePath().normalize();
        String appJson = readText(root.resolve("aroapp/miniprogram/app.json"));
        String mineJs = readText(root.resolve("aroapp/miniprogram/pages/mine/index.js"));
        String mineWxml = readText(root.resolve("aroapp/miniprogram/pages/mine/index.wxml"));
        String homeJs = readText(root.resolve("aroapp/miniprogram/pages/index/index.js"));
        String homeWxml = readText(root.resolve("aroapp/miniprogram/pages/index/index.wxml"));
        String tabbar = readText(root.resolve("aroapp/miniprogram/utils/tabBarHelper.js"));

        try {
            JsonNode rootNode = objectMapper.readTree(appJson);
            JsonNode pages = rootNode.path("pages");
            if (pages.isArray()) {
                for (JsonNode page : pages) {
                    String p = normalizeMiniPath(page.asText(""));
                    if (!StringUtils.hasText(p)) continue;
                    String role = inferMiniMinRole(p);
                    out.add(NodeSeed.miniPage(miniPageKey(p), p, p, role));
                }
            }
        } catch (Exception ignored) {
            // fallback when app.json has comments/invalid json
        }

        Map<String, FunctionRoute> mineRoutes = parseMiniFunctionRoutes(mineJs);
        Map<String, FunctionRoute> homeRoutes = parseMiniFunctionRoutes(homeJs);
        addMiniEntriesFromWxml(out, mineWxml, mineRoutes, "mine");
        addMiniQuickEntriesFromWxml(out, homeWxml, homeRoutes, "home");

        Matcher tab = Pattern.compile("path:\\s*'([^']+)'").matcher(tabbar);
        while (tab.find()) {
            String p = normalizeMiniPath(tab.group(1));
            if (!StringUtils.hasText(p)) continue;
            String role = inferMiniMinRole(p);
            out.add(NodeSeed.miniEntry("tabbar", p, "Tab:" + p, role, miniPageKey(p)));
        }
        return dedup(out);
    }

    private void addMiniEntriesFromWxml(List<NodeSeed> out, String wxml, Map<String, FunctionRoute> routes, String source) {
        Matcher matcher = MINI_WXML_CELL.matcher(wxml);
        while (matcher.find()) {
            String title = matcher.group(1);
            String fn = matcher.group(2);
            FunctionRoute route = routes.get(fn);
            if (route == null || !StringUtils.hasText(route.path)) continue;
            out.add(NodeSeed.miniEntry(source, route.path, title, route.minRole, miniPageKey(route.path)));
        }
    }

    private void addMiniQuickEntriesFromWxml(List<NodeSeed> out, String wxml, Map<String, FunctionRoute> routes, String source) {
        Matcher matcher = MINI_WXML_QUICK.matcher(wxml);
        while (matcher.find()) {
            String fn = matcher.group(1);
            FunctionRoute route = routes.get(fn);
            if (route == null || !StringUtils.hasText(route.path)) continue;
            out.add(NodeSeed.miniEntry(source, route.path, "Quick:" + route.path, route.minRole, miniPageKey(route.path)));
        }
    }

    private Map<String, FunctionRoute> parseMiniFunctionRoutes(String jsCode) {
        Map<String, FunctionRoute> out = new HashMap<>();
        Matcher fnMatcher = MINI_FUNCTION_BLOCK.matcher(jsCode);
        while (fnMatcher.find()) {
            String name = fnMatcher.group(1);
            String body = fnMatcher.group(2);
            Matcher pathM = MINI_NAV_URL.matcher(body);
            if (!pathM.find()) continue;
            String path = normalizeMiniPath(pathM.group(1));
            if (!StringUtils.hasText(path)) continue;
            Matcher roleM = MINI_ROLE.matcher(body);
            String role = roleM.find() ? normalizeRole(roleM.group(1)) : inferMiniMinRole(path);
            out.put(name, new FunctionRoute(path, role == null ? "MEMBER" : role));
        }
        return out;
    }

    private List<Map<String, Object>> buildTree(String parent, Map<String, List<PagePermissionItem>> byParent) {
        List<PagePermissionItem> current = byParent.getOrDefault(parent, List.of());
        List<Map<String, Object>> out = new ArrayList<>();
        for (PagePermissionItem row : current) {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("nodeKey", row.getNodeKey());
            node.put("platform", row.getPlatform());
            node.put("nodeType", row.getNodeType());
            node.put("displayName", row.getDisplayName());
            node.put("pathOrRoute", row.getPathOrRoute());
            node.put("entrySource", row.getEntrySource());
            node.put("minRole", row.getMinRole());
            node.put("defaultMinRole", row.getDefaultMinRole());
            node.put("enabled", row.getEnabled());
            node.put("parentNodeKey", row.getParentNodeKey());
            node.put("chainKey", row.getChainKey());
            node.put("autoDiscovered", row.getAutoDiscovered());
            node.put("manualOverride", row.getManualOverride());
            String groupTitle = resolveGroupTitle(row);
            if (StringUtils.hasText(groupTitle)) {
                node.put("groupTitle", groupTitle);
            }
            node.put("children", buildTree(row.getNodeKey(), byParent));
            out.add(node);
        }
        return out;
    }

    private String resolveGroupTitle(PagePermissionItem row) {
        if (row == null || !"WEB".equalsIgnoreCase(row.getPlatform())) return null;
        Optional<ManifestSnapshot> manifestOpt = adminNavManifestLoader.load();
        if (manifestOpt.isEmpty()) return null;
        ManifestSnapshot manifest = manifestOpt.get();
        String path = normalizeWebPath(row.getPathOrRoute());
        if (!StringUtils.hasText(path)) return null;
        if ("ENTRY".equalsIgnoreCase(row.getNodeType())) {
            ManifestEntry entry = manifest.sidebarByPath().get(path);
            if (entry != null && StringUtils.hasText(entry.groupTitle())) {
                return entry.groupTitle();
            }
        }
        ManifestPage page = manifest.pageByPath().get(path);
        if (page != null && StringUtils.hasText(page.groupTitle())) {
            return page.groupTitle();
        }
        return null;
    }

    private Map<String, Object> toPublicView(PagePermissionItem row) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("nodeKey", row.getNodeKey());
        out.put("platform", row.getPlatform());
        out.put("nodeType", row.getNodeType());
        out.put("pathOrRoute", row.getPathOrRoute());
        out.put("entrySource", row.getEntrySource());
        out.put("minRole", row.getMinRole());
        out.put("enabled", row.getEnabled());
        out.put("chainKey", row.getChainKey());
        out.put("parentNodeKey", row.getParentNodeKey());
        return out;
    }

    private boolean validateParentRoleConstraint(String parentNodeKey, String minRole) {
        if (!StringUtils.hasText(parentNodeKey)) return true;
        PagePermissionItem parent = mapper.findByNodeKey(parentNodeKey);
        if (parent == null) return true;
        return roleLevel(minRole) >= roleLevel(parent.getMinRole());
    }

    private int roleLevel(String role) {
        String normalized = normalizeRole(role);
        if (normalized == null) return RoleEnum.MEMBER.getLevel();
        return switch (normalized) {
            case "STAFF" -> RoleEnum.STAFF.getLevel();
            case "SENIOR" -> RoleEnum.SENIOR.getLevel();
            case "ADMIN" -> RoleEnum.ADMIN.getLevel();
            case "SUPER_ADMIN" -> RoleEnum.SUPER_ADMIN.getLevel();
            case "PLATFORM_OWNER" -> RoleEnum.PLATFORM_OWNER.getLevel();
            default -> RoleEnum.MEMBER.getLevel();
        };
    }

    private String normalizeRole(String role) {
        if (!StringUtils.hasText(role)) return "MEMBER";
        String up = role.trim().toUpperCase(Locale.ROOT);
        if (Set.of("MEMBER", "STAFF", "SENIOR", "ADMIN", "SUPER_ADMIN", "PLATFORM_OWNER").contains(up)) return up;
        return null;
    }

    private String normalizePlatform(String platform) {
        if (!StringUtils.hasText(platform)) return null;
        String up = platform.trim().toUpperCase(Locale.ROOT);
        return Set.of("WEB", "MINI").contains(up) ? up : null;
    }

    private String normalizeWebPath(String raw) {
        if (!StringUtils.hasText(raw)) return null;
        String v = raw.trim();
        if ("*".equals(v) || "index".equals(v)) return null;
        if (!v.startsWith("/")) v = "/" + v;
        return v.replaceAll("/+", "/");
    }

    private String normalizeMiniPath(String raw) {
        if (!StringUtils.hasText(raw)) return null;
        String v = raw.trim();
        if (!v.startsWith("/")) v = "/" + v;
        return v.replaceAll("/+", "/");
    }

    private String inferWebMinRole(String path) {
        if (!StringUtils.hasText(path)) return "MEMBER";
        // ── SUPER_ADMIN ──
        if (path.startsWith("/admin/personnel")
                || path.startsWith("/admin/settings")
                || path.startsWith("/admin/external-comm-config")
                || path.startsWith("/admin/api-docs")
                || path.startsWith("/admin/page-permissions")
                || path.startsWith("/admin/logging-console")
                || path.startsWith("/admin/nav-manager")
                || path.startsWith("/admin/push-dashboard")
                || path.startsWith("/admin/push-config")
                || path.startsWith("/admin/door-control")
                || path.startsWith("/admin/face-debug")
                || path.startsWith("/admin/telemetry-watchlists")
                || path.startsWith("/admin/telemetry-archive")) {
            return "SUPER_ADMIN";
        }
        if (path.startsWith("/admin/supplies/manage") || path.startsWith("/admin/supplies/process")) {
            return "SUPER_ADMIN";
        }
        if (path.startsWith("/admin/repair-process") || path.startsWith("/admin/purchase-process")) {
            return "SUPER_ADMIN";
        }
        // ── ADMIN ──
        if (path.startsWith("/admin/supplies/audit-export")) {
            return "STAFF"; // supplies/audit-export stays STAFF per registry
        }
        if (path.startsWith("/admin/supplies")) {
            return "ADMIN";
        }
        if (path.startsWith("/admin/content-hub")) {
            return "ADMIN";
        }
        if (path.startsWith("/admin/student-violations")
                || path.startsWith("/admin/monitor")
                || path.startsWith("/admin/registration-invites")
                || path.startsWith("/admin/report-form")
                || path.startsWith("/admin/analytics")) {
            return "ADMIN";
        }
        if (path.startsWith("/admin/door-group-storage")
                || path.startsWith("/admin/device-channels")
                || path.startsWith("/admin/aro-rooms")
                || path.startsWith("/admin/access-rules")
                || path.startsWith("/admin/department-storage")
                || path.startsWith("/admin/dahua-issue")
                || path.startsWith("/admin/dahua-swing-tasks")
                || path.startsWith("/admin/dahua-swing-rules")
                || path.startsWith("/admin/dahua-swing-records")
                || path.startsWith("/admin/access-audit-source")
                || path.startsWith("/admin/access-fusion")
                || path.startsWith("/admin/access-clean-rule-profiles")
                || path.startsWith("/admin/telemetry-insights")
                || path.startsWith("/admin/telemetry-insights-config")
                || path.startsWith("/animal-room-telemetry")
                || path.startsWith("/animal-room-cockpit")
                || path.startsWith("/digital-twin-screen")
                || path.startsWith("/digital-twin-3d")
                || path.startsWith("/admin/material/review")
                || path.startsWith("/admin/material/manage")
                || path.startsWith("/admin/material/audit-export")
                || path.startsWith("/admin/conversation-archive")
                || path.startsWith("/admin/file-templates")
                || path.startsWith("/admin/exp-stats")) {
            return "ADMIN";
        }
        // ── STAFF (generic admin catch-all) ──
        if (path.startsWith("/admin")) return "STAFF";
        return "MEMBER";
    }

    private String inferMiniMinRole(String path) {
        if (!StringUtils.hasText(path)) return "MEMBER";
        if (path.startsWith("/pages/adminPersonnel")) return "SUPER_ADMIN";
        if (path.startsWith("/pages/suppliesAdmin")) return "SUPER_ADMIN";
        if (path.startsWith("/pages/repairProcess")
                || path.startsWith("/pages/purchaseProcess")
                || path.startsWith("/pages/suppliesProcess")) {
            return "SUPER_ADMIN";
        }
        if (path.startsWith("/pages/suppliesMine")) return "STAFF";
        if (path.startsWith("/pages/suppliesClaimExport")) return "STAFF";
        if (path.startsWith("/pages/materialAdmin")) return "STAFF";
        if (path.startsWith("/pages/studentMaterial")) return "MEMBER";
        if (path.startsWith("/pages/supplies")) return "ADMIN";
        if (path.startsWith("/pages/announcementAdmin")) return "ADMIN";
        if (path.startsWith("/pages/releaseNotesAdmin")) return "PLATFORM_OWNER";
        if (path.startsWith("/pages/settingsRoomWatch")) return "MEMBER";
        if (path.startsWith("/pages/fileTemplates")) return "STAFF";
        if (path.startsWith("/pages/facilityMaintenance")) return "STAFF";
        if (path.startsWith("/pages/repairRequest")
                || path.startsWith("/pages/purchaseRequest")
                || path.startsWith("/pages/assetRecord")
                || path.startsWith("/pages/assetTransferRecord")) {
            return "STAFF";
        }
        return "MEMBER";
    }

    private String webPageKey(String path) {
        return "WEB:PAGE:" + path;
    }

    private String miniPageKey(String path) {
        return "MINI:PAGE:" + path;
    }

    private String readText(Path path) {
        try {
            if (Files.exists(path)) return Files.readString(path);
        } catch (IOException ignored) {
            // ignore and return empty
        }
        return "";
    }

    private List<NodeSeed> dedup(List<NodeSeed> input) {
        LinkedHashMap<String, NodeSeed> map = new LinkedHashMap<>();
        for (NodeSeed seed : input) {
            map.put(seed.nodeKey, seed);
        }
        return new ArrayList<>(map.values());
    }

    private record FunctionRoute(String path, String minRole) {}

    private record DbNavItem(String label, String path) {}

    private record NodeSeed(String platform,
                            String nodeKey,
                            String nodeType,
                            String displayName,
                            String pathOrRoute,
                            String entrySource,
                            String minRole,
                            String parentNodeKey,
                            String chainKey) {
        static NodeSeed webPage(String nodeKey, String path, String displayName, String minRole) {
            return new NodeSeed("WEB", nodeKey, "PAGE", displayName, path, "route", minRole, null, "WEB:CHAIN:" + path);
        }

        static NodeSeed webEntry(String source, String path, String displayName, String minRole, String parentPageKey) {
            return new NodeSeed("WEB", "WEB:ENTRY:" + source + ":" + path, "ENTRY", displayName, path, source, minRole, parentPageKey, "WEB:CHAIN:" + path);
        }

        static NodeSeed miniPage(String nodeKey, String path, String displayName, String minRole) {
            return new NodeSeed("MINI", nodeKey, "PAGE", displayName, path, "page", minRole, null, "MINI:CHAIN:" + path);
        }

        static NodeSeed miniEntry(String source, String path, String displayName, String minRole, String parentPageKey) {
            return new NodeSeed("MINI", "MINI:ENTRY:" + source + ":" + path, "ENTRY", displayName, path, source, minRole, parentPageKey, "MINI:CHAIN:" + path);
        }
    }
}

