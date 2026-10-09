package com.example.demo.modules.ai.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.capability.AiCapabilityGate;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 视角分包的闸（2026-10-09 新增需求：按视角选包后再注入对话）。
 *
 * <p>钉住两件事：
 * <ol>
 *   <li><b>默认是 STAFF</b> —— 没声明视角的包，学生一律看不见（fail-closed）。反过来
 *       （默认两边都给）就是把教职工能力直接暴露给学生，两种错的代价不对称；</li>
 *   <li><b>视角过了还要过能力</b> —— 视角是「这一端有没有这个能力」，能力是「这个身份能不能用」，
 *       两层都得过。</li>
 * </ol>
 */
class AiViewGateTest {

    /** 放行一切的能力闸门：本类只验视角这一层。 */
    private static final AiCapabilityGate ALLOW = (user, capability) -> null;

    private static AiToolPack pack(String key, AiView... views) {
        return new AiToolPack() {
            @Override
            public String packKey() {
                return key;
            }

            @Override
            public String displayName() {
                return key;
            }

            @Override
            public String defaultPrompt() {
                return "";
            }

            @Override
            public Set<AiView> views() {
                // 空数组 = 不覆写，走接口默认（STAFF）
                return views.length == 0 ? AiToolPack.super.views() : Set.of(views);
            }

            @Override
            public List<AiTool> tools() {
                return List.of(new AiTool("t_" + key, "测试用。", "{}", "cap." + key,
                        SideEffect.READ, (ctx, args) -> "ok"));
            }
        };
    }

    @Test
    @DisplayName("没声明视角的包默认只服务教职工：学生视角拿不到")
    void defaultPackIsStaffOnly() {
        List<AiToolPack> packs = List.of(pack("legacy"));
        List<AiToolPack> forStudent = AiOrchestrator.packsForView(ALLOW, AiView.STUDENT, member(), packs);
        assertTrue(forStudent.isEmpty(), "默认 STAFF 的包不该出现在学生视角：" + forStudent);

        List<AiToolPack> forStaff = AiOrchestrator.packsForView(ALLOW, AiView.STAFF, staff(), packs);
        assertTrue(forStaff.stream().anyMatch(p -> "legacy".equals(p.packKey())));
    }

    @Test
    @DisplayName("声明成学生视角的包不进教职工视角；声明两个视角的包两边都在")
    void explicitViewsRespected() {
        List<AiToolPack> packs = List.of(
                pack("studentOnly", AiView.STUDENT),
                pack("both", AiView.STAFF, AiView.STUDENT));

        List<String> student = keys(AiOrchestrator.packsForView(ALLOW, AiView.STUDENT, member(), packs));
        List<String> staff = keys(AiOrchestrator.packsForView(ALLOW, AiView.STAFF, staff(), packs));

        assertTrue(student.contains("studentOnly") && student.contains("both"), "学生视角：" + student);
        assertTrue(staff.contains("both"), "教职工视角：" + staff);
        assertFalse(staff.contains("studentOnly"), "学生专属包不该进教职工视角：" + staff);
    }

    @Test
    @DisplayName("视角过了还要过能力：能力不过的包照样不发（发了再拒＝让用户白等一轮）")
    void capabilityStillApplies() {
        AiCapabilityGate denyAll = (user, capability) -> "权限不足";
        List<AiToolPack> packs = List.of(pack("both", AiView.STAFF, AiView.STUDENT));
        assertTrue(AiOrchestrator.packsForView(denyAll, AiView.STAFF, staff(), packs).isEmpty(),
                "能力不过就没包可用 —— 这也是「登录了但没有可用能力」时的正确结果");
    }

    private static List<String> keys(List<AiToolPack> packs) {
        return packs.stream().map(AiToolPack::packKey).toList();
    }

    private static User staff() {
        User u = new User();
        u.setId("STAFF_1");
        u.setRole(RoleEnum.STAFF);
        u.setAccountSource("STAFF");
        return u;
    }

    private static User member() {
        User u = new User();
        u.setId("1111111111");
        u.setRole(RoleEnum.MEMBER);
        u.setAccountSource("STUDENT");
        return u;
    }
}
