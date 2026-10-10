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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(PagePermissionService.class);

    /** 小程序入口清单的源码位置（相对仓库根）—— 见 {@link #findMiniRoot()} 为什么不能只认工作目录。 */
    private static final Path MINI_APP_JSON = Path.of("aroapp", "miniprogram", "app.json");

    private static final Pattern ROUTE_PATH = Pattern.compile("path:\\s*\"([^\"]+)\"");
    private static final Pattern NAV_TO = Pattern.compile("to=\"([^\"]+)\"");
    /** 与 {@code adminNavRegistry.ts} 中「id, path, label」顺序一致，供侧栏入口与展示名自动发现 */
    private static final Pattern WEB_REGISTRY_ITEM =
            Pattern.compile("\\{\\s*id:\\s*\"[^\"]+\"\\s*,\\s*path:\\s*\"(/admin[^\"]+)\"\\s*,\\s*\\R\\s*label:\\s*\"([^\"]+)\"");
    private static final Pattern MINI_FUNCTION_BLOCK = Pattern.compile("([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\},");
    private static final Pattern MINI_NAV_URL = Pattern.compile("url:\\s*'([^']+)'");
    private static final Pattern MINI_ROLE = Pattern.compile("hasMinRole\\([^,]+,\\s*'([A-Z_]+)'\\)");
    /**
     * 菜单页在算「这一格给不给看」时自己写在调用上的兜底角色：
     * {@code canShowMiniEntry('mine', '<路径>', role, '<兜底角色>')}。这就是那一格**声明的门槛**，
     * 比按路径前缀猜准 —— 有些格子（校园卡管理 / 门禁应用 / 三个门禁页）只走这个兜底，函数体里
     * 一句 hasMinRole 都没有，光看函数体会把它们全判成「谁都能看」。
     */
    private static final Pattern MINI_ENTRY_ROLE =
            Pattern.compile("canShowMiniEntry\\(\\s*'([a-z]+)'\\s*,\\s*'([^']+)'\\s*,\\s*[^,]+,\\s*'([A-Z_]+)'\\s*,?\\s*\\)");
    /**
     * 小程序入口单元：整块抓，名字与动作分开取。
     *
     * <p>原先是「一个正则同时要 {@code title="名字"} 和 {@code bind:click="动作"}」，而菜单页
     * 早就改成**插槽标题**（{@code <view slot="title"><text class="mine-cell-title-text">学生审核</text>}）——
     * 那个正则在真文件里一条都匹配不上，于是「学生审核」这类入口从来没进过权限表
     * （2026-10-09 实测：球球答「没找到这个入口」）。名字改用「属性或插槽文本」两路取。
     */
    private static final Pattern MINI_WXML_CELL = Pattern.compile("<van-cell\\s([^>]*)>([\\s\\S]*?)</van-cell>");
    private static final Pattern MINI_CELL_CLICK = Pattern.compile("bind:click=\"([^\"]+)\"");
    private static final Pattern MINI_CELL_TITLE_ATTR = Pattern.compile("title=\"([^\"]+)\"");
    private static final Pattern MINI_CELL_TITLE_SLOT = Pattern.compile("<text class=\"[^\"]*title-text[^\"]*\">([^<]+)</text>");
    private static final Pattern MINI_WXML_QUICK = Pattern.compile("class=\"quick-item\"\\s+bindtap=\"([^\"]+)\"");

    /**
     * 小程序侧的字面量小对象（底部 tab 就是这种）：整块取出来当作一条记录读。
     * 这三条分别取块里的 path / text / minRole —— 名字与门槛都在同一个块里，不用跨行猜窗口。
     */
    private static final Pattern MINI_OBJECT = Pattern.compile("\\{([^{}]*)\\}");
    private static final Pattern MINI_TS_PATH = Pattern.compile("path:\\s*'([^']*)'");
    private static final Pattern MINI_TS_TEXT = Pattern.compile("text:\\s*'([^']*)'");
    private static final Pattern MINI_TS_ROLE = Pattern.compile("minRole:\\s*'([A-Z_]+)'");

    /** 房间页侧栏那种「可点的一整块 + 块里第一个文本就是名字」的入口。 */
    private static final Pattern MINI_WXML_FOOTER = Pattern.compile("<view\\s([^>]*bindtap=\"[^\"]+\"[^>]*)>([\\s\\S]*?)</view>");
    private static final Pattern MINI_WXML_TEXT = Pattern.compile("<text[^>]*>([^<]+)</text>");
    private static final Pattern MINI_TAP = Pattern.compile("bindtap=\"([^\"]+)\"");
    /** 整块只用一个开关控制的那种：{@code wx:if="{{ showStaffEntries }}"}。复杂的条件表达式不认（宁可不猜）。 */
    private static final Pattern MINI_WXML_IF_FLAG =
            Pattern.compile("wx:if=\"\\{\\{\\s*([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\}\\}\"");
    /** 页面里「这个开关要什么角色」的声明：{@code showStaffEntries: hasMinRole(role, 'STAFF'),}。 */
    private static final Pattern MINI_FLAG_ROLE =
            Pattern.compile("([a-zA-Z_][a-zA-Z0-9_]*)\\s*:\\s*hasMinRole\\([^,]+,\\s*'([A-Z_]+)'\\)");

    /**
     * 小程序分包前缀。页面权限表里一律记**主包形式**（{@code /pages/x/y}），与小程序运行时的口径一致
     * （见 {@code miniprogram/utils/pagePermission.js} 的 {@code normalizePath}）：导航时它再把主包路径
     * 展开成分包候选，页面将来搬家这里也不用改，node_key 更不会跟着漂。
     */
    private static final List<String> MINI_SUBPKG_PREFIXES = List.of(
            "/package-feature/pages/",
            "/package-supplies/pages/",
            "/package-door/pages/",
            "/package-student/pages/",
            "/package-ops/pages/");

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
        Path root = findMiniRoot();
        List<NodeSeed> out = discoverMiniFrom(root);
        if (out.isEmpty()) {
            // **扫描失败必须出声**。原先这里一句日志都没有：生产上工作目录不对时整批小程序入口
            // 一条都扫不到，而表现只是「帮我打开学生审核」被答成「没找到这个入口」——
            // 从现象看不出是「这页不存在」还是「压根没扫到」。2026-10-10 踩到。
            log.warn("[page-permission] 小程序入口一条都没扫到（工作目录 {}，JAR 位置也试过了）——"
                            + "找不到 {}，需要仓库根出现在工作目录或 JAR 的上级目录里",
                    Path.of("").toAbsolutePath(), MINI_APP_JSON);
        } else {
            log.info("[page-permission] 小程序入口扫到 {} 条（源码根 {}）", out.size(), root);
        }
        return out;
    }

    /**
     * 找小程序源码树的根。
     *
     * <p><b>为什么不能只认工作目录</b>：入口清单是从 {@code aroapp/miniprogram/**} 里**读源码**扫出来的，
     * 而 {@code aroapp/} 不进 JAR（已确认 target/classes 下没有、pom 也没拷）。所以用
     * {@code java -jar /某处/twin.jar} 起、工作目录不是仓库根时，整批小程序入口就一条都扫不到。
     *
     * <p>按「工作目录 → 逐级上溯 → JAR 所在目录同样上溯」依次找，
     * 取第一个含 {@code aroapp/miniprogram/app.json} 的目录。都找不到就退回工作目录（照旧扫不到）。
     */
    static Path findMiniRoot() {
        Path cwd = Path.of("").toAbsolutePath().normalize();
        List<Path> starts = new ArrayList<>();
        starts.add(cwd);
        try {
            Path jar = Path.of(PagePermissionService.class.getProtectionDomain()
                    .getCodeSource().getLocation().toURI()).toAbsolutePath().normalize();
            starts.add(Files.isDirectory(jar) ? jar : jar.getParent());
        } catch (Exception ignored) {
            // 拿不到 JAR 位置（比如跑在测试里）就只按工作目录找
        }
        for (Path start : starts) {
            for (Path p = start; p != null; p = p.getParent()) {
                if (Files.exists(p.resolve(MINI_APP_JSON))) {
                    return p;
                }
            }
        }
        return cwd;
    }

    /** 从指定的源码根扫小程序入口（包级可见：单测拿临时目录喂它，钉住「根不对就啥也扫不到」这个事实）。 */
    List<NodeSeed> discoverMiniFrom(Path root) {
        List<NodeSeed> out = new ArrayList<>();
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
        Map<String, String> entryRoles = parseMiniEntryRoles(mineJs);
        addMiniEntriesFromWxml(out, mineWxml, mineRoutes, entryRoles, "mine");
        addMiniQuickEntriesFromWxml(out, homeWxml, homeRoutes, "home");
        out.addAll(parseMiniTabEntries(tabbar));

        String roomJs = readText(root.resolve("aroapp/miniprogram/pages/room/index.js"));
        String roomWxml = readText(root.resolve("aroapp/miniprogram/pages/room/index.wxml"));
        addMiniFooterEntries(out, roomWxml, roomJs, parseMiniFunctionRoutes(roomJs));
        return dedup(out);
    }

    /**
     * 底部 tab 的名字。
     *
     * <p>原来扫到 {@code path: '…'} 就造一条名字为 {@code Tab:/pages/x/y} 的入口 —— 那不是人话，
     * 用户念不出来，导航那一侧也把它当噪声丢掉，等于**首页 / 房间 / 温湿度 / 我的 全都叫不上名字**
     * （2026-10-09：问「温湿度」答没找到，而它就摆在最显眼的位置）。
     *
     * <p>tab 是个只有字面量的小对象，名字（`text`）和门槛（`minRole`）就在同一块里，整块读即可。
     * 门槛取这一格自己声明的那档，与小程序渲染 tabBar 时的兜底值**同一来源**，所以写进表里不改变
     * 任何人的 tab 可见性。
     */
    private List<NodeSeed> parseMiniTabEntries(String tabbarJs) {
        List<NodeSeed> out = new ArrayList<>();
        Matcher object = MINI_OBJECT.matcher(tabbarJs);
        while (object.find()) {
            String body = object.group(1);
            String path = pick(MINI_TS_PATH, body);
            String text = pick(MINI_TS_TEXT, body);
            // 球球自己占的那一格没有页面（点开是对话抽屉），别当成能跳的页面
            if (!StringUtils.hasText(path) || !StringUtils.hasText(text)) continue;
            String normalized = normalizeMiniPath(path);
            String role = pick(MINI_TS_ROLE, body);
            out.add(NodeSeed.miniEntry("tabbar", normalized, text,
                    role == null ? inferMiniMinRole(normalized) : role, miniPageKey(normalized)));
        }
        return out;
    }

    /**
     * 房间页侧栏/顶栏那几个入口（历史 / 管理 / 校园卡管理 / 审核入口 / 学生审核）。
     *
     * <p>它们不在菜单页里，但用户就是会直接喊名字。已经被别的页面登记过的（校园卡管理、学生审核）
     * **不再重复登记** —— 同名的两条会让导航反过来问「你指哪一个」，比没有还烦人。
     *
     * <p>门槛读这一格自己的开关（{@code wx:if="{{ showStaffEntries }}"}} → 页面里 {@code showStaffEntries: hasMinRole(role,'STAFF')}）。
     * 不读的话这几格会一律按路径猜成「谁都能看」，学生问一句就被告知一个他根本进不去的入口。
     */
    private void addMiniFooterEntries(List<NodeSeed> out, String wxml, String jsCode, Map<String, FunctionRoute> routes) {
        Set<String> known = new LinkedHashSet<>();
        for (NodeSeed seed : out) {
            known.add(seed.pathOrRoute());
        }
        Map<String, String> flagRoles = new LinkedHashMap<>();
        Matcher flag = MINI_FLAG_ROLE.matcher(jsCode);
        while (flag.find()) {
            String role = normalizeRole(flag.group(2));
            if (role != null) flagRoles.putIfAbsent(flag.group(1), role);
        }
        Matcher block = MINI_WXML_FOOTER.matcher(wxml);
        while (block.find()) {
            String attrs = block.group(1);
            String fn = pick(MINI_TAP, attrs);
            String flagName = pick(MINI_WXML_IF_FLAG, attrs);
            Matcher title = MINI_WXML_TEXT.matcher(block.group(2));
            if (!StringUtils.hasText(fn) || !title.find()) continue;
            FunctionRoute route = routes.get(fn);
            if (route == null || !route.path.startsWith("/pages/") || !known.add(route.path)) continue;
            String role = flagName == null ? null : flagRoles.get(flagName);
            out.add(NodeSeed.miniEntry("room", route.path, title.group(1).trim(),
                    role == null ? inferMiniMinRole(route.path) : role, miniPageKey(route.path)));
        }
    }

    private static String pick(Pattern pattern, String body) {
        Matcher matcher = pattern.matcher(body);
        return matcher.find() ? matcher.group(1).trim() : null;
    }

    private void addMiniEntriesFromWxml(List<NodeSeed> out, String wxml, Map<String, FunctionRoute> routes,
                                        Map<String, String> entryRoles, String source) {
        Matcher matcher = MINI_WXML_CELL.matcher(wxml);
        while (matcher.find()) {
            Matcher click = MINI_CELL_CLICK.matcher(matcher.group(1));
            if (!click.find()) continue;
            String title = miniCellTitle(matcher.group(1), matcher.group(2));
            if (!StringUtils.hasText(title)) continue;
            FunctionRoute route = routes.get(click.group(1));
            // 只收页面：有些格子（切换学生视角、生成推荐码）只发接口，body 里第一个 url 是 /api/...
            if (route == null || !route.path.startsWith("/pages/")) continue;
            String declared = entryRoles.get(source + "|" + route.path);
            out.add(NodeSeed.miniEntry(source, route.path, title, declared == null ? route.minRole : declared,
                    miniPageKey(route.path)));
        }
    }

    /** 菜单页声明的「格子 → 门槛角色」（键带 source，免得不小心把别处的同名路径算进来）。 */
    private Map<String, String> parseMiniEntryRoles(String jsCode) {
        Map<String, String> out = new HashMap<>();
        Matcher matcher = MINI_ENTRY_ROLE.matcher(jsCode);
        while (matcher.find()) {
            String path = normalizeMiniPath(matcher.group(2));
            String role = normalizeRole(matcher.group(3));
            if (StringUtils.hasText(path) && role != null) {
                out.put(matcher.group(1) + "|" + path, role);
            }
        }
        return out;
    }

    /** 格子名：老写法是 {@code title="名字"}，现在多半是插槽里的 {@code mine-cell-title-text}。 */
    private static String miniCellTitle(String attrs, String body) {
        Matcher attr = MINI_CELL_TITLE_ATTR.matcher(attrs);
        if (attr.find()) return attr.group(1).trim();
        Matcher slot = MINI_CELL_TITLE_SLOT.matcher(body);
        return slot.find() ? slot.group(1).trim() : null;
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
        v = v.replaceAll("/+", "/");
        // 分包页面收回主包形式：页面权限表与小程序运行时（pagePermission.js#normalizePath）同一口径
        for (String prefix : MINI_SUBPKG_PREFIXES) {
            if (v.startsWith(prefix)) return "/pages/" + v.substring(prefix.length());
        }
        return v;
    }

    private String inferWebMinRole(String path) {
        if (!StringUtils.hasText(path)) return "MEMBER";
        // ── PLATFORM_OWNER ──
        if (path.startsWith("/admin/door-swipe-rules")) {
            return "PLATFORM_OWNER";
        }
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
        // ── 打印 ──
        // 顺序要紧：/admin/print-stations 是 /admin/print-station 的前缀超集，
        // 长的那条必须先判，否则「工位配置」会被前缀误吞成 STAFF。
        if (path.startsWith("/admin/print-stations")) {
            return "SUPER_ADMIN"; // 配置工位（绑哪个账号、哪台机器）
        }
        if (path.startsWith("/admin/print-station")) {
            return "STAFF";       // 发打印、工位机收任务（队列已改为弹窗，无独立页面）
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
        if (path.startsWith("/admin/agv-tracker")
                || path.startsWith("/admin/student-violations")
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
                || path.startsWith("/animal-room-telemetry")
                || path.startsWith("/animal-room-cockpit")
                || path.startsWith("/digital-twin-screen")
                || path.startsWith("/digital-twin-3d")
                || path.startsWith("/admin/material/review")
                || path.startsWith("/admin/material/manage")
                || path.startsWith("/admin/material/audit-export")
                || path.startsWith("/admin/conversation-archive")
                || path.startsWith("/admin/file-templates")
                || path.startsWith("/admin/animal-order")
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
        if (path.startsWith("/pages/suppliesProcess")) {
            return "SUPER_ADMIN";
        }        if (path.startsWith("/pages/suppliesMine")) return "STAFF";
        if (path.startsWith("/pages/suppliesClaimExport")) return "STAFF";
        if (path.startsWith("/pages/materialAdmin")) return "STAFF";
        // 「物资领用审计」= 网页版 /admin/material/audit-export 的小程序版，权限与网页版同口径：ADMIN
        if (path.startsWith("/pages/materialAudit")) return "ADMIN";
        if (path.startsWith("/pages/studentMaterial")) return "MEMBER";
        // 走到这一支的是「领用物资」本体与领用审计（Admin/Mine/Process 上面已各自 return）——
        // STAFF 就要能进物资页下单，所以给 STAFF（2026-09-17 用户口径）
        if (path.startsWith("/pages/supplies")) return "STAFF";
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

    record NodeSeed(String platform,
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

