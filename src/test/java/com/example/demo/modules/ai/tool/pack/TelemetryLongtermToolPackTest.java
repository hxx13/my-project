package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermVariableDto;
import com.example.demo.modules.telemetry.service.TelemetryLongtermArchiveService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 变量长期归档包的闸。
 *
 * <p>四件会**答错或动到数据**的事：
 * ① 能力闸与页面同档（ADMIN 起）—— 更松就把管理员页面数据放给普通教职工；
 * ② 学生视角拿不到（views 默认 STAFF）—— ADMIN 角色挂学生账号也进不来；
 * ③ 写操作漏确认是本域最危险的回归 —— 增删变量/调顺序都会动长期留存的口径；
 * ④ 调顺序少给一个变量必须**不提交**，不能默默丢变量。
 */
class TelemetryLongtermToolPackTest {

    private TelemetryLongtermArchiveService service;
    private TelemetryLongtermToolPack pack;
    private final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() {
        service = mock(TelemetryLongtermArchiveService.class);
        pack = new TelemetryLongtermToolPack(service);
    }

    private static User user(RoleEnum role) {
        User u = new User();
        u.setId("u-1");
        u.setRole(role);
        return u;
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(x -> x.name().equals(name)).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> run(String tool, String json) throws Exception {
        AiTool t = tool(tool);
        JsonNode args = om.readTree(json);
        return (Map<String, Object>) t.executor()
                .execute(new AiToolContext(user(RoleEnum.ADMIN), 1L, 2L, null), args);
    }

    @Test
    @DisplayName("能力闸与页面同档：读/写都要 ADMIN 起，ADMIN 与 SUPER_ADMIN 过、STAFF 与 MEMBER 不过")
    void capabilityMatchesAdminGate() {
        Map<String, Predicate<User>> caps = pack.capabilities();
        for (String key : List.of(TelemetryLongtermToolPack.CAP_LONGTERM_READ,
                TelemetryLongtermToolPack.CAP_LONGTERM_WRITE)) {
            Predicate<User> cap = caps.get(key);
            assertTrue(cap.test(user(RoleEnum.ADMIN)), key + " 应放行 ADMIN");
            assertTrue(cap.test(user(RoleEnum.SUPER_ADMIN)), key + " 应放行 SUPER_ADMIN");
            assertFalse(cap.test(user(RoleEnum.STAFF)), key + " 不应放行 STAFF（页面是 ADMIN 起）");
            assertFalse(cap.test(user(RoleEnum.MEMBER)), key + " 不应放行 MEMBER");
        }
        for (AiTool t : pack.tools()) {
            assertTrue(caps.containsKey(t.capability()), "工具 " + t.name() + " 的能力码没有判定");
        }
    }

    @Test
    @DisplayName("视角闸：默认只服务教职工，学生视角拿不到（不因角色等级而例外）")
    void packsAreStaffOnlyByDefault() {
        Set<AiView> views = pack.views();
        assertTrue(views.contains(AiView.STAFF), "默认 STAFF 视角");
        assertFalse(views.contains(AiView.STUDENT), "学生账号本来就过不了 ADMIN 能力闸，不该声明学生视角");
    }

    @Test
    @DisplayName("所有写工具都必须过确认（读工具除外）—— 漏确认是本域最危险的回归")
    void allWriteToolsRequireConfirm() {
        Set<String> readTools = Set.of(
                "listLongtermCandidateBundles", "listLongtermCandidates", "listLongtermVariables",
                "listLongtermExportDays", "queryLongtermSamples", "getLongtermPlan");
        for (AiTool t : pack.tools()) {
            if (readTools.contains(t.name())) {
                continue;
            }
            assertTrue(t.requiresConfirm(), t.name() + " 是写操作，必须过确认");
        }
    }

    @Test
    @DisplayName("调顺序少给一个变量 → 不提交，报错让模型重新列全，别默默丢变量")
    void setOrderRequiresFullCoverage() throws Exception {
        when(service.listVariables()).thenReturn(List.of(variable("A"), variable("B")));

        Map<String, Object> out = run("setLongtermVariableOrder", "{\"variableNames\":[\"A\"]}");

        assertTrue(Boolean.FALSE.equals(out.get("ok")), "少给了变量 B，应报错而不是提交");
        assertTrue(String.valueOf(out.get("reason")).contains("B"), "报错里要点名少了哪个");
        verify(service, never()).saveVariables(any());
    }

    @Test
    @DisplayName("调顺序夹带没选中的名字 → 报错，不提交")
    void setOrderRejectsUnknownNames() throws Exception {
        when(service.listVariables()).thenReturn(List.of(variable("A")));

        Map<String, Object> out = run("setLongtermVariableOrder", "{\"variableNames\":[\"A\",\"C\"]}");

        assertTrue(Boolean.FALSE.equals(out.get("ok")), "夹带了没选中的 C，应报错");
        verify(service, never()).saveVariables(any());
    }

    private static TelemetryLongtermVariableDto variable(String name) {
        TelemetryLongtermVariableDto v = new TelemetryLongtermVariableDto();
        v.setWinccVariableName(name);
        v.setEnabled(true);
        return v;
    }
}
