package com.example.demo.modules.pagepermission.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 小程序入口扫描的**根**这件事。
 *
 * <p>入口清单是**读源码**扫出来的（{@code aroapp/miniprogram/**}），而 {@code aroapp/} 不进 JAR。
 * 所以「进程工作目录不是仓库根」时整批小程序入口一条都扫不到 —— 表现是「帮我打开学生审核」
 * 被答成「没找到这个入口」，从现象看不出是「这页不存在」还是「压根没扫到」。
 * 这里把两种情况都钉住。
 */
class PagePermissionMiniScanTest {

    private PagePermissionService service;

    @BeforeEach
    void setUp() {
        // 扫描只用 objectMapper 和 readText，其余依赖不碰 —— 传 null 即可
        service = new PagePermissionService(null, new ObjectMapper(), null, null);
    }

    @Test
    @DisplayName("从仓库根扫：能扫到「学生审核」，且路径是主包形式（跳转时再按分包前缀展开）")
    void scansMiniEntriesFromRepoRoot() {
        List<PagePermissionService.NodeSeed> seeds = service.discoverMiniFrom(repoRoot());

        Map<String, String> entries = new LinkedHashMap<>();
        for (PagePermissionService.NodeSeed s : seeds) {
            if ("MINI".equals(s.platform()) && "ENTRY".equals(s.nodeType())) {
                entries.putIfAbsent(s.displayName(), s.pathOrRoute());
            }
        }
        assertTrue(entries.containsKey("学生审核"), "扫到的入口：" + entries.keySet());
        assertEquals("/pages/studentReviewHub/index", entries.get("学生审核"),
                "权限表存主包路径，小程序侧再按分包前缀展开");
    }

    @Test
    @DisplayName("源码根不对 → 一条都扫不到（生产上「没找到这个入口」就是这么来的）")
    void wrongRootYieldsNothing(@TempDir Path empty) {
        assertTrue(service.discoverMiniFrom(empty).isEmpty(),
                "根里没有 aroapp/miniprogram 时应当安静地一无所获 —— 所以调用方必须记日志，别让它静默");
    }

    @Test
    @DisplayName("findMiniRoot：工作目录或 JAR 位置上溯能找到仓库根")
    void findMiniRootResolves() {
        Path root = PagePermissionService.findMiniRoot();
        assertTrue(Files.exists(root.resolve("aroapp/miniprogram/app.json")),
                "上溯没找到仓库根，返回的是 " + root);
    }

    private static Path repoRoot() {
        return Path.of("").toAbsolutePath().normalize();
    }
}
