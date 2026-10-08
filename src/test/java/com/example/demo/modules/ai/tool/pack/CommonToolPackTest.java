package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.common.service.TwinPersonnelArchiveQueryService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 公共查询包的闸。
 *
 * <p>钉住两件容易悄悄坏掉的事：
 * ① **字段不泄漏** —— 底层是 {@code SELECT *}（aro_personnel 有 27 列），工具必须收敛成固定的小字段集，
 *    多带出去的每一列都是既费 token 又可能不该给的内容；
 * ② **能力口径** —— 三个工具要求的角色不同，放宽任何一个都是越权。
 */
class CommonToolPackTest {

    private TwinDashboardMapper dashboardMapper;
    private TwinPersonnelArchiveQueryService archiveQueryService;
    private AroService aroService;
    private CommonToolPack pack;
    private final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void setUp() {
        dashboardMapper = mock(TwinDashboardMapper.class);
        archiveQueryService = mock(TwinPersonnelArchiveQueryService.class);
        aroService = mock(AroService.class);
        pack = new CommonToolPack(dashboardMapper, archiveQueryService, aroService);
    }

    private static User user(RoleEnum role) {
        User u = new User();
        u.setId("1711920831304585218");
        u.setUsername("probe");
        u.setRole(role);
        return u;
    }

    private AiToolContext ctx(RoleEnum role) {
        return new AiToolContext(user(role), 1L, 2L);
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(t -> t.name().equals(name)).findFirst().orElseThrow();
    }

    private JsonNode args(String json) throws Exception {
        return om.readTree(json);
    }

    private static Map<String, Object> wideRow() {
        Map<String, Object> row = new HashMap<>();
        row.put("user_id", "STAFF_001");
        row.put("name", "张三");
        row.put("job_number", "2024001");
        row.put("department_name", "实验动物中心");
        row.put("project_group_name", "A组, B组");
        // 下面这些是真实表里存在、但**不该**流向模型的列
        row.put("id_card", "330100199001011234");
        row.put("phone", "13800001234");
        row.put("password", "x");
        row.put("total_exp", 999);
        return row;
    }

    @Test
    @DisplayName("搜索结果只含约定字段，宽行里的其它列一律不外泄")
    void normalizesAndDoesNotLeakExtraColumns() throws Exception {
        when(dashboardMapper.searchPersonnelPaged(anyString(), anyInt(), anyInt()))
                .thenReturn(List.of(wideRow()));

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) tool("searchPerson")
                .executor().execute(ctx(RoleEnum.ADMIN), args("{\"keyword\":\"张三\"}"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> candidates = (List<Map<String, Object>>) out.get("candidates");
        assertEquals(1, candidates.size());

        Map<String, Object> c = candidates.get(0);
        assertEquals(5, c.size(), "候选字段数变了？多一个就多一份泄漏面");
        assertTrue(c.containsKey("userId") && c.containsKey("name") && c.containsKey("jobNumber")
                && c.containsKey("department") && c.containsKey("projectGroup"));
        assertFalse(c.containsKey("id_card"), "身份证列泄漏");
        assertFalse(c.containsKey("phone"), "手机号列泄漏");
        assertFalse(c.containsKey("password"), "口令列泄漏");
        assertFalse(c.containsKey("total_exp"), "无关列泄漏");
        assertEquals("A组, B组", c.get("projectGroup"));
    }

    @Test
    @DisplayName("命中多条时给出明确提示，不替用户做选择")
    void flagsAmbiguityInsteadOfPicking() throws Exception {
        when(dashboardMapper.searchPersonnelPaged(anyString(), anyInt(), anyInt()))
                .thenReturn(List.of(wideRow(), wideRow()));

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) tool("searchPerson")
                .executor().execute(ctx(RoleEnum.ADMIN), args("{\"keyword\":\"张三\"}"));

        assertEquals(2, out.get("total"));
        assertNotNull(out.get("note"), "多条命中必须提示让用户确认");
        assertTrue(String.valueOf(out.get("note")).contains("确认"));
    }

    @Test
    @DisplayName("本地档案未命中时回源 ARO，并标注来源")
    void fallsBackToRemoteAndMarksSource() throws Exception {
        when(dashboardMapper.searchPersonnelPaged(anyString(), anyInt(), anyInt())).thenReturn(List.of());
        when(aroService.searchPersonnelLite(anyString(), anyInt())).thenReturn(List.of(wideRow()));

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) tool("searchPerson")
                .executor().execute(ctx(RoleEnum.ADMIN), args("{\"keyword\":\"张三\"}"));

        assertEquals(1, out.get("total"));
        assertTrue(String.valueOf(out.get("source")).contains("ARO"));
    }

    @Test
    @DisplayName("关键词为空直接返回空结果，不去打库")
    void blankKeywordShortCircuits() throws Exception {
        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) tool("searchPerson")
                .executor().execute(ctx(RoleEnum.ADMIN), args("{\"keyword\":\"   \"}"));

        assertEquals(0, out.get("total"));
        assertNotNull(out.get("note"));
    }

    @Test
    @DisplayName("能力口径：学生只能查人；查组与列组员要 STAFF")
    void capabilityThresholdsMatchDataReachability() {
        Map<String, java.util.function.Predicate<User>> caps = pack.capabilities();

        assertTrue(caps.get(CommonToolPack.CAP_PERSON_SEARCH).test(user(RoleEnum.MEMBER)),
                "人员搜索本就仅需登录，学生应可用");
        assertFalse(caps.get(CommonToolPack.CAP_GROUP_SEARCH).test(user(RoleEnum.MEMBER)));
        assertTrue(caps.get(CommonToolPack.CAP_GROUP_SEARCH).test(user(RoleEnum.STAFF)));
        // 组员列表与其它两个同口径。曾要求 ADMIN，实机测出「被拒绝后改调 searchPerson、
        // 用组名一搜照样拿到整组成员」——同数据两条路径，严的那条是摆设。
        assertTrue(caps.get(CommonToolPack.CAP_GROUP_MEMBERS).test(user(RoleEnum.STAFF)),
                "组员列表不该比能查到同样数据的人员搜索更严");
        assertFalse(caps.get(CommonToolPack.CAP_GROUP_MEMBERS).test(user(RoleEnum.MEMBER)));
    }

    @Test
    @DisplayName("包自描述完整：三个工具，能力码与工具一一对应")
    void packMetaIsComplete() {
        assertEquals("common", pack.packKey());
        assertEquals(3, pack.tools().size());
        for (AiTool t : pack.tools()) {
            assertNotNull(pack.capabilities().get(t.capability()),
                    "工具 " + t.name() + " 声明的能力码没有对应判定 —— 会被 fail-closed 闸门全拒");
        }
    }
}
