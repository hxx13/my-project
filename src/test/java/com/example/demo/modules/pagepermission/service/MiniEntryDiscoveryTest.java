package com.example.demo.modules.pagepermission.service;

import com.example.demo.modules.pagepermission.entity.PagePermissionItem;
import com.example.demo.modules.pagepermission.mapper.PagePermissionMapper;
import com.example.demo.modules.pagepermission.support.AdminNavManifestLoader;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * 小程序入口清单的发现闸。
 *
 * <p>2026-10-09 实测：球球答「学生审核」时回「没找到这个入口」，而这一格就摆在「我的」页上。
 * 根因是发现逻辑拿的是**旧版写法**（{@code <van-cell title="名字">}），菜单页早已改成插槽标题，
 * 那个正则在真文件里一条都匹配不上 —— 于是菜单改版之后新增的入口全没进权限表。
 *
 * <p>这里不去桩文件，就**真扫仓库里的菜单文件**（这条线的输入就是那两个文件，桩掉就等于什么都没验）：
 * 名字从 wxml 取、路径与门槛从 js 取，少一环这条链就又断了。
 */
class MiniEntryDiscoveryTest {

    @Test
    @DisplayName("菜单上的入口都进得来：学生审核 / 培训管理 / 校园卡管理 / 门禁记录库 / 违规管理")
    void discoversMenuEntriesWithHumanNames() {
        List<PagePermissionItem> entries = scanMiniEntries();

        assertEquals("/pages/studentReviewHub/index", pathOf(entries, "学生审核"),
                "「学生审核」就摆在「我的」页上，扫不出来就会答「没找到这个入口」");
        assertEquals("/pages/trainingAdmin/index", pathOf(entries, "培训管理"));
        assertEquals("/pages/accessRecordLibrary/index", pathOf(entries, "门禁记录库"));
        assertEquals("/pages/violationAdmin/index", pathOf(entries, "违规管理"));
        // 老名字跟着改版一起作废：还留着它，用户按现在的叫法反而找不到
        assertFalse(labels(entries).contains("大华发卡"), "菜单上已经没有这个名字了：" + labels(entries));
    }

    @Test
    @DisplayName("格子门槛用菜单页自己声明的那个（canShowMiniEntry 的兜底角色），不靠路径前缀猜")
    void entryRoleComesFromTheMenuItself() {
        List<PagePermissionItem> entries = scanMiniEntries();

        assertEquals("STAFF", roleOf(entries, "学生审核"));
        assertEquals("ADMIN", roleOf(entries, "校园卡管理"), "函数体里没有 hasMinRole，只有这一处兜底写着 ADMIN");
        assertEquals("SUPER_ADMIN", roleOf(entries, "门禁应用"));
        assertEquals("SUPER_ADMIN", roleOf(entries, "人员授权"));
        // 这几个的声明**跨行写**（还带尾逗号）—— 漏了就等于没读到，格子会掉回「谁都能看」
        assertEquals("PLATFORM_OWNER", roleOf(entries, "刷卡规则"));
        assertEquals("ADMIN", roleOf(entries, "门禁记录库"));
        assertEquals("ADMIN", roleOf(entries, "违规管理"));
    }

    @Test
    @DisplayName("路径一律记主包形式 —— 页面搬去分包时这条清单一动不动")
    void pathsStayInMainPackageForm() {
        for (PagePermissionItem row : scanMiniEntries()) {
            String path = row.getPathOrRoute();
            assertTrue(path.startsWith("/pages/"), "分包前缀不该进权限表（导航时再由小程序展开）：" + path);
            assertFalse(path.contains("/package-"), "分包路径会让 node_key 跟着页面搬家漂移：" + path);
        }
    }

    @Test
    @DisplayName("底部 tab 用界面上那个名字（首页/房间/温湿度/笼架），不再是「Tab:路径」这种用户念不出的机器名")
    void tabNamesComeFromTheTabBar() {
        List<PagePermissionItem> entries = scanMiniEntries();

        assertEquals("/pages/index/index", pathOf(entries, "首页"));
        assertEquals("/pages/room/index", pathOf(entries, "房间"));
        assertEquals("/pages/mine/index", pathOf(entries, "我的"));
        assertEquals("/pages/studentCageShelf/index", pathOf(entries, "笼架"),
                "学生那一套 tab 是另一个分支，别只读了教职工那半");
        // 门槛要跟着这一格自己声明的那档：写错这格，学生那边会凭空多出一个温湿度 tab
        assertEquals("ADMIN", roleOf(entries, "温湿度"));
        assertEquals("STUDENT", roleOf(entries, "房间"));
    }

    @Test
    @DisplayName("房间页侧栏/顶栏的入口也进得来，门槛读这一格自己的开关；重复的同名入口只登记一次")
    void roomFooterEntries() {
        List<PagePermissionItem> entries = scanMiniEntries();

        assertEquals("/pages/roomAudit/index", pathOf(entries, "审核入口"));
        assertEquals("/pages/roomAccessRecords/index", pathOf(entries, "历史"));
        assertEquals("SENIOR", roleOf(entries, "审核入口"), "这一格的开关是 showAuditEntry（SENIOR 起）");
        assertEquals("STAFF", roleOf(entries, "历史"), "这两格的开关是 showStaffEntries（STAFF 起）");
        assertEquals("STAFF", roleOf(entries, "管理"));
        assertEquals(1, count(entries, "学生审核"),
                "同名的两条会让导航反过来问「你指哪一个」——比没有这条还烦人");
        assertEquals(1, count(entries, "校园卡管理"));
    }

    // ── 脚手架 ──

    private static long count(List<PagePermissionItem> rows, String label) {
        return rows.stream().filter(r -> label.equals(r.getDisplayName())).count();
    }

    /** 真扫一遍（cwd 即仓库根），收回这次发现的全部 MINI 入口。 */
    private static List<PagePermissionItem> scanMiniEntries() {
        PagePermissionMapper mapper = mock(PagePermissionMapper.class);
        PagePermissionService service = new PagePermissionService(mapper, new ObjectMapper(),
                new AdminNavManifestLoader(new ObjectMapper()), mock(JdbcTemplate.class));
        service.scanAll();

        ArgumentCaptor<PagePermissionItem> captured = ArgumentCaptor.forClass(PagePermissionItem.class);
        verify(mapper, atLeastOnce()).upsertFromScan(captured.capture());
        return captured.getAllValues().stream()
                .filter(r -> "MINI".equals(r.getPlatform()) && "ENTRY".equals(r.getNodeType()))
                .toList();
    }

    private static List<String> labels(List<PagePermissionItem> rows) {
        return rows.stream().map(PagePermissionItem::getDisplayName).toList();
    }

    private static PagePermissionItem find(List<PagePermissionItem> rows, String label) {
        Optional<PagePermissionItem> hit = rows.stream()
                .filter(r -> label.equals(r.getDisplayName())).findFirst();
        assertTrue(hit.isPresent(), "发现出来的入口里没有「" + label + "」：" + labels(rows));
        return hit.get();
    }

    private static String pathOf(List<PagePermissionItem> rows, String label) {
        return find(rows, label).getPathOrRoute();
    }

    private static String roleOf(List<PagePermissionItem> rows, String label) {
        String role = find(rows, label).getMinRole();
        assertNotNull(role, "入口没有门槛角色，导航时就没法判该不该给这个人：" + label);
        return role;
    }
}
