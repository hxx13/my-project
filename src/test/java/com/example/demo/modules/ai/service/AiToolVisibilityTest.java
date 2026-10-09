package com.example.demo.modules.ai.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.capability.DefaultAiCapabilityGate;
import com.example.demo.modules.ai.tool.AiPackRouter;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.ai.tool.ToolRegistry;
import com.example.demo.modules.ai.tool.pack.AttachmentToolPack;
import com.example.demo.modules.ai.tool.pack.CageOpReviewToolPack;
import com.example.demo.modules.ai.tool.pack.CageQueryToolPack;
import com.example.demo.modules.ai.tool.pack.CommonToolPack;
import com.example.demo.modules.ai.tool.pack.MaterialManageToolPack;
import com.example.demo.modules.ai.tool.pack.PersonnelQueryToolPack;
import com.example.demo.modules.ai.tool.pack.PortalContentToolPack;
import com.example.demo.modules.ai.tool.pack.StudentReviewToolPack;
import com.example.demo.modules.ai.tool.pack.TelemetryToolPack;
import com.example.demo.modules.ai.tool.pack.TrainingReviewToolPack;
import com.example.demo.modules.ai.tool.pack.UnfreezeToolPack;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageClaimService;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.training.service.TrainingAdminGate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 发给模型的工具表按身份裁剪 —— 实测有据的那条：无权工具发了就会被调，调了才拒，
 * 用户白等一轮还收到一句「没有权限」，看着像功能坏了。
 *
 * <p>这里钉三件事：用不了的滤掉、顺序原样保留（顺序一变 prompt 缓存前缀就失效）、
 * 以及**没注册的能力码也滤掉**（闸门是 fail-closed）。
 */
class AiToolVisibilityTest {

    private static AiTool tool(String name, String capability) {
        return new AiTool(name, name + " 的说明", "{}", capability, SideEffect.READ, (ctx, args) -> null);
    }

    private static User userOf(RoleEnum role) {
        User u = new User();
        u.setId("u-1");
        u.setRole(role);
        return u;
    }

    private static List<String> names(List<AiTool> tools) {
        List<String> out = new ArrayList<>();
        for (AiTool t : tools) {
            out.add(t.name());
        }
        return out;
    }

    private static DefaultAiCapabilityGate gate() {
        DefaultAiCapabilityGate gate = new DefaultAiCapabilityGate();
        gate.register("cap.any", u -> true);
        gate.register("cap.admin", u -> u.getRole() != null && u.getRole().getLevel() >= RoleEnum.ADMIN.getLevel());
        return gate;
    }

    /** 注册表里的顺序就是发给模型的顺序 —— 必须稳定。 */
    private static final List<AiTool> ALL = List.of(
            tool("listRooms", "cap.any"),
            tool("revokeFreezeExemption", "cap.admin"),
            tool("listPendingReviews", "cap.any"),
            tool("toolWithUnregisteredCap", "cap.not.registered"));

    @Test
    @DisplayName("够不着的工具不发：权限不足的、能力码根本没注册的，都滤掉")
    void hidesUnusableTools() {
        assertEquals(List.of("listRooms", "listPendingReviews"),
                names(AiOrchestrator.usableTools(gate(), userOf(RoleEnum.STAFF), ALL)));
        assertTrue(AiOrchestrator.usableTools(gate(), userOf(RoleEnum.MEMBER), List.of(tool("adminOnly", "cap.admin")))
                .isEmpty(), "一个都用不了时必须发空表，让模型只回文本，而不是发了再拒");
    }

    @Test
    @DisplayName("有权就发，且**顺序与注册表一致** —— 顺序漂了 prompt 缓存前缀全失效")
    void keepsRegistryOrder() {
        List<AiTool> visible = AiOrchestrator.usableTools(gate(), userOf(RoleEnum.ADMIN), ALL);
        assertEquals(List.of("listRooms", "revokeFreezeExemption", "listPendingReviews"), names(visible));
    }

    // ── 对着**真实工具包**验一遍：这正是 2026-10-08 实测那次空转的复发检测 ──

    /**
     * 真实注册表。工具包只取 {@code tools()}/{@code capabilities()}，不碰服务依赖，所以传 null。
     */
    @Test
    @DisplayName("培训审批：**连 ADMIN 都看不到** —— 入口口径是「≥SUPER_ADMIN 或 饲养组长」，ADMIN 不够")
    void trainingToolsNeedSuperAdminOrLeader() {
        ToolRegistry registry = realRegistry();
        DefaultAiCapabilityGate gate = realGate(registry);

        List<String> forAdmin = names(AiOrchestrator.usableTools(gate, userOf(RoleEnum.ADMIN), registry.allTools()));
        assertFalse(forAdmin.contains("auditTrainingEnrollment"),
                "培训管理入口要 SUPER_ADMIN+ 或饲养组长；ADMIN 发出去也只会 403");
        assertFalse(forAdmin.contains("listPendingTrainingEnrollments"));

        List<String> forSuper = names(AiOrchestrator.usableTools(gate, userOf(RoleEnum.SUPER_ADMIN), registry.allTools()));
        assertTrue(forSuper.contains("auditTrainingEnrollment"));
        assertTrue(forSuper.contains("scoreTrainingEnrollment"));
    }

    @Test
    @DisplayName("人员档案：**ADMIN 也看不到**，要 SUPER_ADMIN 起 —— 这批台账与公共查询刻意分开")
    void personnelToolsNeedSuperAdmin() {
        ToolRegistry registry = realRegistry();
        DefaultAiCapabilityGate gate = realGate(registry);

        List<String> forAdmin = names(AiOrchestrator.usableTools(gate, userOf(RoleEnum.ADMIN), registry.allTools()));
        assertFalse(forAdmin.contains("queryPersonnel"),
                "ADMIN 能开那个页面，不等于 AI 能替他翻台账；口径是 SUPER_ADMIN 起");
        assertFalse(forAdmin.contains("getPersonnelDetail"));

        List<String> forSuper = names(AiOrchestrator.usableTools(gate, userOf(RoleEnum.SUPER_ADMIN), registry.allTools()));
        assertTrue(forSuper.contains("queryPersonnel"), "别收得太死：连超级管理员都看不到就等于没做");
        assertTrue(forSuper.contains("getPersonnelDetail"));
    }

    @Test
    @DisplayName("门户内容：STAFF **看不到**发布工具，ADMIN 起才有 —— 发公告是往门户公开页写东西")
    void portalPublishNeedsAdmin() {
        ToolRegistry registry = realRegistry();
        DefaultAiCapabilityGate gate = realGate(registry);

        List<String> forStaff = names(AiOrchestrator.usableTools(gate, userOf(RoleEnum.STAFF), registry.allTools()));
        assertFalse(forStaff.contains("createPortalContent"),
                "HTTP 拦截器只要求 STAFF+，但页面入口是 ADMIN —— 按页面口径收，别让任意员工替门户发公告");
        assertFalse(forStaff.contains("updatePortalContent"));

        List<String> forAdmin = names(AiOrchestrator.usableTools(gate, userOf(RoleEnum.ADMIN), registry.allTools()));
        assertTrue(forAdmin.contains("createPortalContent"));
        assertTrue(forAdmin.contains("listPortalCategories"), "读工具也一起有，否则模型拿不到分类 id");
    }

    @Test
    @DisplayName("真包路由：口语「2楼的湿度情况」要带上环境监测；「我有什么待审核的」要把三个待审域一起带上")
    void realPacksRouteOnNaturalPhrases() {
        ToolRegistry registry = realRegistry();
        AiPackRouter router = new AiPackRouter();

        List<String> humidity = router.route(registry.packs(), null, "查询一下2楼的湿度情况")
                .stream().map(AiToolPack::packKey).toList();
        assertTrue(humidity.contains("telemetry"),
                "「湿度」是用户最自然的说法，必须命中环境监测（光有「温湿度」连写词接不住口语）：" + humidity);

        List<String> pending = router.route(registry.packs(), null, "看看我当前有什么待审核的")
                .stream().map(AiToolPack::packKey).toList();
        assertTrue(pending.contains("review"), "物资申领 / 延迟免冻那一域：" + pending);
        assertTrue(pending.contains("cage_op"),
                "笼位认领/分笼/转移那一域 —— 「待审」原来只写在物资包里，这里就漏了（真机：答出「只有物资的3条」）："
                        + pending);
        assertTrue(pending.contains("training"),
                "培训审批那一域 —— 这个包的 routeHints 原来是空的（连方法都没重写）：" + pending);
    }

    private static ToolRegistry realRegistry() {
        // 认领那两项能力码走 CageClaimService#canApprove（会查身份，不是纯函数），
        // 这里只需验「过滤按能力码走」这条线，所以给它一个按角色判定的替身。
        CageClaimService claimService = mock(CageClaimService.class);
        when(claimService.canApprove(any())).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            return u != null && u.getRole() != null && u.getRole().getLevel() >= RoleEnum.ADMIN.getLevel();
        });
        return new ToolRegistry(List.of(
                new CommonToolPack(null, null, null),
                new UnfreezeToolPack(null, null, null, null, null),
                new CageQueryToolPack(null),
                new CageOpReviewToolPack(claimService, null, null),
                new TrainingReviewToolPack(null, new TrainingAdminGate(mock(PersonIdentityService.class))),
                new AttachmentToolPack(null, null),
                new PersonnelQueryToolPack(null, null, null),
                new PortalContentToolPack(null, new com.fasterxml.jackson.databind.ObjectMapper()),
                new TelemetryToolPack(null, null, null),
                new MaterialManageToolPack(null, new com.fasterxml.jackson.databind.ObjectMapper()),
                new StudentReviewToolPack(null, null)));
    }

    @Test
    @DisplayName("视角闸：**学生视角拿不到物品管理包** —— 这跟角色无关，ADMIN 角色挂学生账号也拿不到")
    void studentViewExcludesMaterialManage() {
        ToolRegistry registry = realRegistry();
        DefaultAiCapabilityGate gate = realGate(registry);
        // 全站包对「学生视角」一律不发教职工包（AiToolPack.views 默认 STAFF，fail-closed）。
        // 判据是 account_source（CageModeVisibilityService#isStudent），不是角色等级 ——
        // 所以这里**故意给 ADMIN 角色**：能过能力闸却过不了视角闸，才证明这道闸真的在生效。
        User admin = userOf(RoleEnum.ADMIN);
        List<AiToolPack> staffPacks = AiOrchestrator.packsForView(gate, AiView.STAFF, admin, registry.packs());
        List<AiToolPack> studentPacks = AiOrchestrator.packsForView(gate, AiView.STUDENT, admin, registry.packs());

        assertTrue(staffPacks.stream().anyMatch(p -> "materialManage".equals(p.packKey())),
                "教职工视角要能拿到物品管理包");
        assertFalse(studentPacks.stream().anyMatch(p -> "materialManage".equals(p.packKey())),
                "学生视角不该拿到任何教职工后台包："
                        + studentPacks.stream().map(AiToolPack::packKey).toList());
    }

    /** 复刻 AiCapabilityBootstrap 的注册动作：能力码 → 判定，全部来自工具包自带。 */
    private static DefaultAiCapabilityGate realGate(ToolRegistry registry) {
        DefaultAiCapabilityGate gate = new DefaultAiCapabilityGate();
        for (AiToolPack pack : registry.packs()) {
            pack.capabilities().forEach(gate::register);
        }
        return gate;
    }

    @Test
    @DisplayName("真实注册表：MEMBER 拿不到课题组搜索/组员工具，STAFF 拿得到 —— 那条空转路径不再存在")
    void realRegistryHidesGroupToolsFromMember() {
        ToolRegistry registry = realRegistry();
        DefaultAiCapabilityGate gate = realGate(registry);

        List<String> forMember = names(AiOrchestrator.usableTools(gate, userOf(RoleEnum.MEMBER), registry.allTools()));
        assertFalse(forMember.contains("searchProjectGroup"),
                "MEMBER 没有课题组搜索权，发出去只会被拒 —— 不该出现在工具表里");
        assertFalse(forMember.contains("listProjectGroupMembers"),
                "同上：这就是实测那次「列一下课题组成员」连发 6 次、3 次被拒的那两个工具");
        assertTrue(forMember.contains("searchPerson"), "找人本身谁都能用，不该被一起裁掉");
        assertFalse(forMember.contains("readSpreadsheetAttachment"),
                "读附件也是教职工起（镜像 isStaffBase），MEMBER 不该看到");
        assertFalse(forMember.contains("approveCageClaim"),
                "笼位认领审批要 ADMIN+ 或组长，MEMBER 不该看到 —— 而且 getPendingList 只按区域过滤，"
                        + "能力码是这条路唯一的审批人资格闸");
        assertTrue(forMember.contains("approveCageDivide"),
                "分笼入口只要登录、对象级判定在服务里，所以它对 MEMBER 也可见（真正的门在后面）");

        List<String> forStaff = names(AiOrchestrator.usableTools(gate, userOf(RoleEnum.STAFF), registry.allTools()));
        assertTrue(forStaff.contains("searchProjectGroup"));
        assertTrue(forStaff.contains("listProjectGroupMembers"));
        assertTrue(forStaff.contains("listPendingReviews"), "学生审核包是 STAFF 起");
        assertFalse(forStaff.contains("grantFreezeExemption"), "免冻是 ADMIN 起，STAFF 不该看到");
        assertFalse(forStaff.contains("approveCageClaim"), "笼位认领审批 STAFF 也不够（要 ADMIN+ 或组长）");
    }
}
