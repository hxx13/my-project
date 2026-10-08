package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.identity.dto.IdentityTagVO;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.personnel.dto.PersonnelFilter;
import com.example.demo.modules.personnel.entity.Personnel;
import com.example.demo.modules.personnel.service.PersonnelService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 人员档案包。
 *
 * <p>钉四件事：① 门禁**必须 SUPER_ADMIN 起**（用户明确要求与公共查询区分开，不能合并）；
 * ② 名称解析不出来时**不许猜着查**（返回候选让模型去问）；③ 投影里不许出现推送凭据字段；
 * ④ total 与返回条数不等时必须提示「只是当页」—— 「把一页说成全部人数」是这个域最容易犯的错。
 */
class PersonnelQueryToolPackTest {

    private final ObjectMapper om = new ObjectMapper();
    private PersonnelService personnelService;
    private PersonIdentityService personIdentityService;
    private JdbcTemplate jdbcTemplate;
    private PersonnelQueryToolPack pack;

    @BeforeEach
    void setUp() {
        personnelService = mock(PersonnelService.class);
        personIdentityService = mock(PersonIdentityService.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        pack = new PersonnelQueryToolPack(personnelService, personIdentityService, jdbcTemplate);
    }

    private static AiToolContext ctx() {
        User u = new User();
        u.setId("STAFF_root");
        u.setRole(RoleEnum.SUPER_ADMIN);
        return new AiToolContext(u, 1L, 2L);
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(t -> name.equals(t.name())).findFirst().orElseThrow();
    }

    private Object run(String toolName, String json) throws Exception {
        return tool(toolName).executor().execute(ctx(), om.readTree(json));
    }

    /**
     * 统一人员查询的**真实返回类型是实体**（{@code List<Personnel>}），不是 Map。
     *
     * <p>这里刻意用真实体造数据：早前用 {@code Map.of(...)} 当行，把我的「按 Map 取字段」这个错误假设
     * 一起盖住了 —— 测试全绿、真机一调就 {@code Personnel cannot be cast to Map}。
     * 用真类型之后，取值方式一旦退回 Map，这个类立刻红。
     */
    private static Map<String, Object> paged(Personnel... rows) {
        return Map.of("list", new java.util.ArrayList<>(List.of(rows)), "total", rows.length);
    }

    private static Map<String, Object> paged(List<Personnel> rows, int total) {
        return Map.of("list", rows, "total", total);
    }

    private static User userOf(RoleEnum role) {
        User u = new User();
        u.setId("u");
        u.setRole(role);
        return u;
    }

    // ── 门禁 ──

    @Test
    @DisplayName("门禁是 SUPER_ADMIN 起：ADMIN 不够 —— 这批台账不与公共查询合并")
    void requiresSuperAdmin() {
        var cap = pack.capabilities().get(PersonnelQueryToolPack.CAP_PERSONNEL);
        assertNotNull(cap, "能力码必须自带，否则启动时注册不进去 = 谁都调不了");
        assertTrue(cap.test(userOf(RoleEnum.SUPER_ADMIN)));
        assertTrue(cap.test(userOf(RoleEnum.PLATFORM_OWNER)));
        assertFalse(cap.test(userOf(RoleEnum.ADMIN)), "ADMIN 能看接口不等于 AI 能替他翻台账，口径按页面入口");
        assertFalse(cap.test(userOf(RoleEnum.SENIOR)));
        assertFalse(cap.test(userOf(RoleEnum.STAFF)));
        assertFalse(cap.test(userOf(RoleEnum.MEMBER)));
    }

    @Test
    @DisplayName("两个工具都是只读、不挂确认（查台账不该弹确认）")
    void readOnlyNoConfirm() {
        for (AiTool t : pack.tools()) {
            assertEquals(SideEffect.READ, t.sideEffect(), t.name());
            assertFalse(t.requiresConfirm(), t.name());
        }
    }

    // ── 条件映射 ──

    @Test
    @DisplayName("条件落进 PersonnelFilter：中文角色转 code、课题组名与 id 都写、page/pageSize 走分页")
    void mapsFilters() throws Exception {
        when(jdbcTemplate.queryForList(contains("WHERE name = ?"), any(Object[].class)))
                .thenReturn(List.of(Map.of("id", 7L, "name", "免疫课题组")));
        when(personnelService.listUnified(any())).thenReturn(paged(List.<Personnel>of(), 0));

        run("queryPersonnel", """
                {"role":"超级管理员","projectGroup":"免疫课题组","accountType":"nosys",
                 "trashOnly":true,"limit":200,"page":3}""");

        ArgumentCaptor<PersonnelFilter> got = ArgumentCaptor.forClass(PersonnelFilter.class);
        verify(personnelService).listUnified(got.capture());
        PersonnelFilter f = got.getValue();
        assertEquals("SUPER_ADMIN", f.getRole(), "中文写法要归一成 code，否则 p.role 一条都匹配不上");
        assertEquals("免疫课题组", f.getProjectGroupName());
        assertEquals(7L, f.getProjectGroupId(), "名字与 id 都要写：名字管多组串，id 管改名");
        assertEquals("nosys", f.getAccountType());
        assertEquals(Boolean.TRUE, f.getTrashOnly());
        assertEquals(3, f.getPage());
        assertEquals(50, f.getPageSize(), "limit 上限 50，不是模型说了算");
    }

    @Test
    @DisplayName("默认视图：不传 trashOnly 时按未删除查（null 而不是 false，语义不同）")
    void defaultsToAliveOnly() throws Exception {
        when(personnelService.listUnified(any())).thenReturn(paged(List.<Personnel>of(), 0));
        run("queryPersonnel", "{}");
        ArgumentCaptor<PersonnelFilter> got = ArgumentCaptor.forClass(PersonnelFilter.class);
        verify(personnelService).listUnified(got.capture());
        assertNull(got.getValue().getTrashOnly());
        assertEquals(1, got.getValue().getPage());
        assertEquals(20, got.getValue().getPageSize());
    }

    @Test
    @DisplayName("课题组名解析不出来就不许猜着查 —— 返回候选，一次库都不查")
    void refusesUnresolvedGroup() throws Exception {
        when(jdbcTemplate.queryForList(contains("WHERE name = ?"), any(Object[].class))).thenReturn(List.of());
        when(jdbcTemplate.queryForList(contains("LIKE"), any(Object[].class))).thenReturn(List.of(
                Map.of("id", 1L, "name", "免疫课题组"),
                Map.of("id", 2L, "name", "免疫治疗课题组")));

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) run("queryPersonnel", "{\"projectGroup\":\"免疫\"}");

        assertEquals(Boolean.FALSE, out.get("ok"), String.valueOf(out));
        assertTrue(out.get("reason").toString().contains("免疫"), String.valueOf(out));
        assertEquals(2, ((List<?>) out.get("candidates")).size());
        verify(personnelService, never()).listUnified(any());
    }

    // ── 投影 ──

    private static Personnel person(long id, String name) {
        Personnel p = new Personnel();
        p.setId(id);
        p.setName(name);
        return p;
    }

    @Test
    @DisplayName("投影白名单：推送凭据字段一个都不许露（sendKey / openId / wxPusherUid）")
    void projectionHidesCredentials() throws Exception {
        Personnel row = person(12L, "张三");
        row.setJobNumber("S001");
        row.setDepartmentName("实验动物中心");
        row.setProjectGroupName("免疫课题组");
        row.setRole("STAFF");
        row.setStatus(1);
        row.setStaffUsername("zhangsan@");
        row.setIsSchool(1);
        row.setMobilePhone("13800000000");
        row.setContactEmail("z@x.edu.cn");
        row.setAllowedRoomsDisplayZh("101、102");
        row.setSendKey("SCT_SECRET");
        row.setStaffOpenId("oPENID");
        row.setWxPusherUid("UID_SECRET");
        when(personnelService.listUnified(any())).thenReturn(paged(row));
        when(personIdentityService.listByUserIds(any())).thenReturn(Map.of());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) run("queryPersonnel", "{}");
        String dumped = om.writeValueAsString(out);

        assertFalse(dumped.contains("SCT_SECRET"), "sendKey 是推送凭据，不能进模型上下文");
        assertFalse(dumped.contains("oPENID"));
        assertFalse(dumped.contains("UID_SECRET"));

        @SuppressWarnings("unchecked")
        Map<String, Object> p = (Map<String, Object>) ((List<?>) out.get("personnel")).get(0);
        assertEquals("普通员工", p.get("role"), "角色要给中文，模型别去翻译 code");
        assertEquals("教职工账号", p.get("account"));
        assertEquals("启用", p.get("accountStatus"));
        assertEquals("校内", p.get("campus"));
        assertEquals(12L, p.get("id"));
    }

    @Test
    @DisplayName("total 大于当页时必须提示「还有 N 个」—— 别把一页说成全部")
    void warnsWhenTruncated() throws Exception {
        when(personnelService.listUnified(any())).thenReturn(paged(List.of(person(1L, "甲")), 137));
        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) run("queryPersonnel", "{\"limit\":1}");
        assertEquals(137L, out.get("total"));
        assertTrue(out.get("note").toString().contains("137"), String.valueOf(out));
        assertTrue(out.get("note").toString().contains("page=2"), String.valueOf(out));
    }

    // ── 单人详情 ──

    @Test
    @DisplayName("详情按 id 查；正常查不到就再查一次回收站，并标明在回收站里")
    void detailFallsBackToTrash() throws Exception {
        Personnel row = person(99L, "李四");
        row.setAroUserId("ARO_1");
        row.setDeletedAt("2026-10-01 10:00:00");
        // 第一次（未删除）空 → 第二次（含回收站）命中
        when(personnelService.listUnified(any()))
                .thenReturn(paged(List.<Personnel>of(), 0))
                .thenReturn(paged(List.of(row), 1));
        when(personnelService.getRoomAuthorization("99"))
                .thenReturn(Map.of("managed", 0, "roomIds", List.of(), "rooms", List.of()));
        when(personIdentityService.getByUser("99")).thenReturn(List.of());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) run("getPersonnelDetail", "{\"id\":\"99\"}");

        assertEquals(Boolean.TRUE, out.get("ok"), String.valueOf(out));
        assertEquals(Boolean.TRUE, out.get("inTrash"));
        assertTrue(out.containsKey("roomAuthorization"));

        ArgumentCaptor<PersonnelFilter> got = ArgumentCaptor.forClass(PersonnelFilter.class);
        verify(personnelService, org.mockito.Mockito.times(2)).listUnified(got.capture());
        assertEquals(99L, got.getAllValues().get(0).getId());
        assertNull(got.getAllValues().get(0).getTrashOnly(), "第一次先看正常的人");
        assertEquals(Boolean.TRUE, got.getAllValues().get(1).getTrashOnly(), "再翻回收站");
    }

    @Test
    @DisplayName("详情：两边都没有就说没有，并提示 id 可能过期 —— 不要编一个人出来")
    void detailNotFound() throws Exception {
        when(personnelService.listUnified(any())).thenReturn(paged(List.<Personnel>of(), 0));
        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) run("getPersonnelDetail", "{\"id\":\"404\"}");
        assertEquals(Boolean.FALSE, out.get("ok"));
        assertTrue(out.get("reason").toString().contains("404"), String.valueOf(out));
        verify(personnelService, never()).getRoomAuthorization(anyString());
    }

    @Test
    @DisplayName("详情里通知绑定只说通没通，不回 target_value")
    void detailReportsBindingPresenceOnly() throws Exception {
        Personnel row = person(5L, "王五");
        row.setEmail("dossier@x.edu.cn");
        row.setContactEmail("notify@x.edu.cn");
        row.setSendKey("SCT_SECRET");
        row.setWxPusherUid("UID_SECRET");
        when(personnelService.listUnified(any())).thenReturn(paged(row));
        when(personnelService.getRoomAuthorization("5")).thenReturn(Map.of("managed", 0));
        when(personIdentityService.getByUser("5")).thenReturn(List.of(new IdentityTagVO()));

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) run("getPersonnelDetail", "{\"id\":\"5\"}");
        String dumped = om.writeValueAsString(out);

        assertFalse(dumped.contains("SCT_SECRET"));
        assertFalse(dumped.contains("UID_SECRET"));
        // 档案邮箱与通知绑定邮箱不能合成一个字段：真机上混过一次，把绑定邮箱当成了档案邮箱
        assertEquals("dossier@x.edu.cn", out.get("email"));
        assertEquals("notify@x.edu.cn", out.get("notifyEmail"));
        @SuppressWarnings("unchecked")
        Map<String, Object> b = (Map<String, Object>) out.get("notifyBindings");
        assertEquals(Boolean.TRUE, b.get("email"));
        assertEquals(Boolean.TRUE, b.get("serverChan"));
        assertEquals(Boolean.TRUE, b.get("wxPusher"));
    }

    @Test
    @DisplayName("详情也认账号 id：searchPerson 返回的 userId 是账号 id，不该让它为此白烧一轮")
    void detailAcceptsAccountId() throws Exception {
        Personnel row = person(99L, "位亚磊");
        row.setStaffId("STAFF_5dbf");
        when(personnelService.listUnified(any())).thenAnswer(inv -> {
            PersonnelFilter f = inv.getArgument(0);
            return f.getId() != null && f.getId() == 99L ? paged(row) : paged(List.<Personnel>of(), 0);
        });
        // 真机那次：模型拿 searchPerson 的 userId（19 位雪花）直接当人员 id 用 → 查不到
        when(personIdentityService.resolveIdByAccount("1935162605895184385")).thenReturn("99");
        when(personnelService.getRoomAuthorization("99")).thenReturn(Map.of("managed", 0));
        when(personIdentityService.getByUser("99")).thenReturn(List.of());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) run("getPersonnelDetail",
                "{\"id\":\"1935162605895184385\"}");

        assertEquals(Boolean.TRUE, out.get("ok"), String.valueOf(out));
        @SuppressWarnings("unchecked")
        Map<String, Object> profile = (Map<String, Object>) out.get("profile");
        assertEquals(99L, profile.get("id"));
        assertEquals("位亚磊", profile.get("name"));
    }
}
