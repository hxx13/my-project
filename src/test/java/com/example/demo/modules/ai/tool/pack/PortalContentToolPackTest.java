package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.portal.dto.PortalCategoryView;
import com.example.demo.modules.portal.dto.PortalContentView;
import com.example.demo.modules.portal.dto.PortalContentUpsertRequest;
import com.example.demo.modules.portal.service.PortalContentService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 门户内容包（白话文 → 正式文 → 发布）。
 *
 * <p>钉四件事：① 门禁与页面入口同口径（ADMIN 起）；② **正文入库前必须消毒** ——
 * {@code PortalContentService} 是原样存的，前端编辑器的消毒被工具绕过，所以这里不能只靠前端；
 * ③ {@code extension_json} 是整块替换的，改优先级不能把别的键冲掉；④ 分类/列宽/状态这些校验
 * 必须在**写库之前**拦住，并且新建与修改两边一致。
 */
class PortalContentToolPackTest {

    private final ObjectMapper om = new ObjectMapper();
    private PortalContentService service;
    private PortalContentToolPack pack;

    @BeforeEach
    void setUp() {
        service = mock(PortalContentService.class);
        pack = new PortalContentToolPack(service, om);
    }

    private static AiToolContext ctx() {
        User u = new User();
        u.setId("STAFF_admin");
        u.setRole(RoleEnum.ADMIN);
        return new AiToolContext(u, 1L, 2L);
    }

    private static User userOf(RoleEnum role) {
        User u = new User();
        u.setId("u");
        u.setRole(role);
        return u;
    }

    private AiTool tool(String name) {
        return pack.tools().stream().filter(t -> name.equals(t.name())).findFirst().orElseThrow();
    }

    private Object run(String toolName, String json) throws Exception {
        return tool(toolName).executor().execute(ctx(), om.readTree(json));
    }

    private static PortalCategoryView category(long id, String name, String scope) {
        PortalCategoryView c = new PortalCategoryView();
        c.setId(id);
        c.setName(name);
        c.setScope(scope);
        c.setStatus(1);
        return c;
    }

    private static PortalContentView saved(long id, String status) {
        PortalContentView v = new PortalContentView();
        v.setId(id);
        v.setTitle("关于实验室搬迁的通知");
        v.setContentType("NOTICE");
        v.setStatus(status);
        return v;
    }

    // ── 门禁 ──

    @Test
    @DisplayName("门禁：ADMIN 起（页面入口口径）—— STAFF 能打接口不等于能替他去门户发公告")
    void requiresAdmin() {
        var cap = pack.capabilities().get(PortalContentToolPack.CAP_PORTAL_PUBLISH);
        assertNotNull(cap, "能力码必须自带，否则启动时注册不进去 = 谁都调不了");
        assertTrue(cap.test(userOf(RoleEnum.ADMIN)));
        assertTrue(cap.test(userOf(RoleEnum.SUPER_ADMIN)));
        assertTrue(cap.test(userOf(RoleEnum.PLATFORM_OWNER)));
        assertFalse(cap.test(userOf(RoleEnum.SENIOR)), "HTTP 拦截器是 STAFF+，但页面入口是 ADMIN，按页面口径收");
        assertFalse(cap.test(userOf(RoleEnum.STAFF)));
        assertFalse(cap.test(userOf(RoleEnum.MEMBER)));
    }

    @Test
    @DisplayName("两个写工具都是 C 级要确认；三个读工具不确认")
    void writeToolsNeedConfirm() {
        assertTrue(tool("createPortalContent").requiresConfirm());
        assertTrue(tool("updatePortalContent").requiresConfirm());
        assertEquals(SideEffect.EXTERNAL_WRITE, tool("createPortalContent").sideEffect());
        assertEquals(SideEffect.EXTERNAL_WRITE, tool("updatePortalContent").sideEffect());
        for (String name : List.of("listPortalContents", "getPortalContent", "listPortalCategories")) {
            assertFalse(tool(name).requiresConfirm(), name);
            assertEquals(SideEffect.READ, tool(name).sideEffect(), name);
        }
    }

    // ── 消毒（这条是安全线，不是格式偏好） ──

    @Test
    @DisplayName("正文入库前消毒：script / on* 事件属性必须被去掉，正常标签保留")
    void sanitizesBodyHtml() throws Exception {
        when(service.listAdminCategories()).thenReturn(List.of(category(7L, "实验室动态", "ALL")));
        when(service.create(any(), anyString())).thenReturn(saved(101L, "DRAFT"));

        run("createPortalContent", """
                {"contentType":"NOTICE","title":"关于搬迁的通知","categoryId":7,
                 "contentHtml":"<p>正文</p><script>alert(1)</script><img src=x onerror=alert(1)><strong>加粗</strong>"}""");

        ArgumentCaptor<PortalContentUpsertRequest> got = ArgumentCaptor.forClass(PortalContentUpsertRequest.class);
        verify(service).create(got.capture(), anyString());
        String html = got.getValue().getContentHtml();
        assertTrue(html.contains("<p>正文</p>"), html);
        assertTrue(html.contains("<strong>加粗</strong>"), html);
        assertFalse(html.toLowerCase().contains("<script"), "工具绕过前端编辑器，消毒必须在这边做：" + html);
        assertFalse(html.toLowerCase().contains("onerror"), html);
    }

    // ── extension_json 合并 ──

    @Test
    @DisplayName("改优先级不能冲掉 extension_json 里别的键（mapper 是整块替换，不是 merge）")
    void mergesExtensionJsonInsteadOfClobbering() throws Exception {
        PortalContentView existing = new PortalContentView();
        existing.setId(9L);
        existing.setContentType("NOTICE");
        existing.setExtensionJson("{\"foo\":\"bar\",\"priority\":\"routine\"}");
        when(service.getAdmin(9L)).thenReturn(existing);
        when(service.listAdminCategories()).thenReturn(List.of(category(7L, "实验室动态", "ALL")));
        when(service.update(eq(9L), any())).thenReturn(saved(9L, "PUBLISHED"));

        run("updatePortalContent", "{\"id\":9,\"priority\":\"important\",\"status\":\"PUBLISHED\"}");

        ArgumentCaptor<PortalContentUpsertRequest> got = ArgumentCaptor.forClass(PortalContentUpsertRequest.class);
        verify(service).update(eq(9L), got.capture());
        String json = got.getValue().getExtensionJson();
        assertNotNull(json, "传了 priority 就必须写 extension_json");
        assertTrue(json.contains("\"foo\":\"bar\""), "别的键不能被冲掉：" + json);
        assertTrue(json.contains("\"important\""), json);
    }

    @Test
    @DisplayName("改的时候不传的字段一律不动（null = 保持原样），别把没提的正文清空")
    void updateOnlyTouchesGivenFields() throws Exception {
        PortalContentView existing = new PortalContentView();
        existing.setId(9L);
        existing.setContentType("NOTICE");
        when(service.getAdmin(9L)).thenReturn(existing);
        when(service.update(eq(9L), any())).thenReturn(saved(9L, "PUBLISHED"));

        run("updatePortalContent", "{\"id\":9,\"status\":\"PUBLISHED\"}");

        ArgumentCaptor<PortalContentUpsertRequest> got = ArgumentCaptor.forClass(PortalContentUpsertRequest.class);
        verify(service).update(eq(9L), got.capture());
        assertEquals(null, got.getValue().getContentHtml(), "没传正文就不能写正文");
        assertEquals(null, got.getValue().getTitle());
        assertEquals("PUBLISHED", got.getValue().getStatus());
    }

    // ── 校验：拦住就别写库 ──

    @Test
    @DisplayName("分类 id 不存在 → 重新问一次分类（不是硬拒），一次创建都不发出去")
    void refusesUnknownCategory() throws Exception {
        when(service.listAdminCategories()).thenReturn(List.of(category(7L, "实验室动态", "ALL")));

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) run("createPortalContent",
                "{\"contentType\":\"NOTICE\",\"title\":\"标题\",\"contentHtml\":\"<p>x</p>\",\"categoryId\":999}");

        assertEquals(Boolean.FALSE, out.get("ok"), String.valueOf(out));
        assertTrue(out.get("reason").toString().contains("999"), String.valueOf(out));
        assertFalse(((List<?>) out.get("questions")).isEmpty(), "要把可选分类重新问一遍，让用户点一下就过去");
        verify(service, never()).create(any(), anyString());
    }

    @Test
    @DisplayName("分类适用范围对不上（公告挂到新闻分类下）→ 重新问分类")
    void refusesScopeMismatch() throws Exception {
        when(service.listAdminCategories()).thenReturn(
                List.of(category(7L, "实验室动态", "NEWS"), category(8L, "通用通知", "ALL")));

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) run("createPortalContent",
                "{\"contentType\":\"NOTICE\",\"title\":\"标题\",\"contentHtml\":\"<p>x</p>\",\"categoryId\":7}");

        assertEquals(Boolean.FALSE, out.get("ok"), String.valueOf(out));
        assertTrue(out.get("reason").toString().contains("实验室动态"), String.valueOf(out));
        String questions = om.writeValueAsString(out.get("questions"));
        assertTrue(questions.contains("通用通知"), "重新问的时候只给放得下的分类：" + questions);
        assertFalse(questions.contains("实验室动态"), "对不上的那个不该再出现在候选里：" + questions);
        verify(service, never()).create(any(), anyString());
    }

    // ── 发布前必须问用户：模型只写内容，配置由人来定 ──

    @Test
    @DisplayName("配置没给齐 → 抛四问（栏目/分类/优先级/发布方式），值就是模型要回填的枚举")
    void asksPublishOptionsWhenConfigMissing() throws Exception {
        when(service.listAdminCategories()).thenReturn(List.of(category(7L, "实验室动态", "ALL")));

        Object out = tool("createPortalContent").resolveBeforeConfirmOrNull(ctx(), om.readTree(
                "{\"contentType\":\"NOTICE\",\"title\":\"关于搬迁的通知\",\"contentHtml\":\"<p>x</p>\"}"));

        assertNotNull(out, "配置没给就该先问用户，而不是直接挂起确认");
        @SuppressWarnings("unchecked")
        Map<String, Object> m = (Map<String, Object>) out;
        assertEquals(Boolean.FALSE, m.get("ok"));
        List<?> questions = (List<?>) m.get("questions");
        assertEquals(4, questions.size(), String.valueOf(m));

        String dumped = om.writeValueAsString(questions);
        assertTrue(dumped.contains("栏目"), dumped);
        assertTrue(dumped.contains("分类"), dumped);
        assertTrue(dumped.contains("优先级"), dumped);
        assertTrue(dumped.contains("草稿"), dumped);
        assertTrue(dumped.contains("NOTICE"), "选项值必须是模型能直接回填的枚举：" + dumped);
        assertTrue(dumped.contains("important"), dumped);
        assertTrue(dumped.contains("\"PUBLISHED\""), dumped);
    }

    @Test
    @DisplayName("四问都齐了就不再问，放行到确认挂起（否则用户会被反复骚扰）")
    void goesToConfirmOnceAllOptionsGiven() throws Exception {
        Object ask = tool("createPortalContent").resolveBeforeConfirmOrNull(ctx(), om.readTree("""
                {"contentType":"NOTICE","categoryId":7,"priority":"notice","status":"PUBLISHED",
                 "title":"关于搬迁的通知","contentHtml":"<p>x</p>"}"""));
        assertTrue(ask == null, "四个都齐了还问，说明预解析的判据写错了：" + ask);
    }

    @Test
    @DisplayName("不传 status 时绝不发布（默认草稿）；用户没说发布就别发")
    void defaultsToDraftNeverPublishes() throws Exception {
        when(service.listAdminCategories()).thenReturn(List.of(category(7L, "实验室动态", "ALL")));
        when(service.create(any(), anyString())).thenAnswer(inv -> {
            PortalContentUpsertRequest r = inv.getArgument(0);
            // 真实 service 在 create 里会把 null 补成 DRAFT（列默认值也是 DRAFT）—— 替身要跟着它，
            // 否则「工具不替用户决定发布」这条断言看着过、输出却和真机不一样（这次就是这么翻出来的）
            return saved(102L, r.getStatus() == null ? "DRAFT" : r.getStatus());
        });

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) run("createPortalContent",
                "{\"contentType\":\"NOTICE\",\"title\":\"标题\",\"contentHtml\":\"<p>x</p>\"}");

        ArgumentCaptor<PortalContentUpsertRequest> got = ArgumentCaptor.forClass(PortalContentUpsertRequest.class);
        verify(service).create(got.capture(), anyString());
        assertEquals(null, got.getValue().getStatus(), "工具不替用户决定发布：不传就交给服务端的 DRAFT 默认值");
        assertEquals("草稿", out.get("status"));
    }

    @Test
    @DisplayName("标题/摘要/正文超列宽上限一律拒，别让 DB 抛")
    void refusesOverlongFields() throws Exception {
        String longTitle = "标".repeat(201);
        String longSummary = "摘".repeat(501);
        String longHtml = "<p>" + "正".repeat(20001) + "</p>";

        for (String json : List.of(
                "{\"contentType\":\"NOTICE\",\"title\":\"" + longTitle + "\",\"contentHtml\":\"<p>x</p>\"}",
                "{\"contentType\":\"NOTICE\",\"title\":\"标题\",\"contentHtml\":\"<p>x</p>\",\"summary\":\"" + longSummary + "\"}",
                "{\"contentType\":\"NOTICE\",\"title\":\"标题\",\"contentHtml\":\"" + longHtml + "\"}")) {
            @SuppressWarnings("unchecked")
            Map<String, Object> out = (Map<String, Object>) run("createPortalContent", json);
            assertEquals(Boolean.FALSE, out.get("ok"), String.valueOf(out));
            assertTrue(out.get("reason").toString().contains("上限"), String.valueOf(out));
        }
        verify(service, never()).create(any(), anyString());
    }

    @Test
    @DisplayName("枚举白名单：类型/状态/优先级写错就拒，并回可选值")
    void refusesBadEnums() throws Exception {
        @SuppressWarnings("unchecked")
        Map<String, Object> badType = (Map<String, Object>) run("createPortalContent",
                "{\"contentType\":\"BLOG\",\"title\":\"标题\",\"contentHtml\":\"<p>x</p>\"}");
        assertEquals(Boolean.FALSE, badType.get("ok"));
        assertNotNull(badType.get("allowed"));

        @SuppressWarnings("unchecked")
        Map<String, Object> badStatus = (Map<String, Object>) run("createPortalContent",
                "{\"contentType\":\"NOTICE\",\"title\":\"标题\",\"contentHtml\":\"<p>x</p>\",\"status\":\"DELETED\"}");
        assertEquals(Boolean.FALSE, badStatus.get("ok"), "没有这个状态就该拒：" + badStatus);

        @SuppressWarnings("unchecked")
        Map<String, Object> archivedOnCreate = (Map<String, Object>) run("createPortalContent",
                "{\"contentType\":\"NOTICE\",\"title\":\"标题\",\"contentHtml\":\"<p>x</p>\",\"status\":\"ARCHIVED\"}");
        assertEquals(Boolean.FALSE, archivedOnCreate.get("ok"),
                "新建只能「发布/存草稿」—— 还没存在的条目谈不上撤下：" + archivedOnCreate);
    }

    @Test
    @DisplayName("撤下已发布的内容 = 改成 ARCHIVED（就是页面上的「已归档」），不是删除")
    void archivesInsteadOfDeleting() throws Exception {
        PortalContentView existing = new PortalContentView();
        existing.setId(1020L);
        existing.setContentType("NOTICE");
        existing.setStatus("PUBLISHED");
        when(service.getAdmin(1020L)).thenReturn(existing);
        when(service.update(eq(1020L), any())).thenReturn(saved(1020L, "ARCHIVED"));

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) run("updatePortalContent",
                "{\"id\":1020,\"status\":\"ARCHIVED\"}");

        assertEquals(Boolean.TRUE, out.get("ok"), String.valueOf(out));
        ArgumentCaptor<PortalContentUpsertRequest> got = ArgumentCaptor.forClass(PortalContentUpsertRequest.class);
        verify(service).update(eq(1020L), got.capture());
        assertEquals("ARCHIVED", got.getValue().getStatus());
        assertEquals("已归档（下线）", out.get("status"), "给用户的话要说清这是下线，不是删了");
    }

    @Test
    @DisplayName("列表筛选也认「已归档」（页面上的状态筛选就有它）")
    void listAcceptsArchivedStatus() throws Exception {
        when(service.listAdmin(any(), any(), any(), any(), any(), anyString(), anyInt(), anyInt()))
                .thenReturn(Map.of("data", List.of(), "total", 0));

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) run("listPortalContents", "{\"status\":\"ARCHIVED\"}");

        assertTrue(out.get("contents") != null, String.valueOf(out));
        verify(service).listAdmin(any(), eq("ARCHIVED"), any(), any(), any(), anyString(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("改不存在的 id → 拒绝，不去 update")
    void refusesUnknownId() throws Exception {
        when(service.getAdmin(404L)).thenReturn(null);
        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) run("updatePortalContent", "{\"id\":404,\"title\":\"x\"}");
        assertEquals(Boolean.FALSE, out.get("ok"));
        verify(service, never()).update(any(), any());
    }

    // ── 确认文案 ──

    @Test
    @DisplayName("两个写工具的确认卡首行都得是动作，不许把给模型的说明漏给用户")
    void confirmPhraseIsActionForBothWrites() {
        for (String name : List.of("createPortalContent", "updatePortalContent")) {
            String phrase = tool(name).confirmPhrase();
            assertTrue(phrase.length() < 40, name + " 的确认卡首行太长：" + phrase);
            assertFalse(phrase.contains("别用 DRAFT") || phrase.contains("不要用文字问")
                            || phrase.contains("本包不提供删除"),
                    name + " 把给模型的指令漏进确认卡了：" + phrase);
        }
        assertTrue(tool("createPortalContent").confirmPhrase().contains("新建一条门户内容"));
        assertTrue(tool("updatePortalContent").confirmPhrase().contains("修改一条已有的门户内容"));
    }

    @Test
    @DisplayName("确认卡的状态文案要分清三档 —— 把「下线」写成「存为草稿」用户就点错了")
    void confirmDetailDistinguishesArchivedFromDraft() throws Exception {
        String archived = tool("updatePortalContent").confirmDetailOf(om.readTree("{\"id\":1020,\"status\":\"ARCHIVED\"}"));
        assertTrue(archived.contains("已归档（下线）"), archived);
        assertFalse(archived.contains("草稿"), "下线不能说成草稿：" + archived);

        String draft = tool("updatePortalContent").confirmDetailOf(om.readTree("{\"id\":1020,\"status\":\"DRAFT\"}"));
        assertTrue(draft.contains("草稿"), draft);

        String publish = tool("updatePortalContent").confirmDetailOf(om.readTree("{\"id\":1020,\"status\":\"PUBLISHED\"}"));
        assertTrue(publish.contains("发布到门户公开页"), publish);

        String noStatus = tool("updatePortalContent").confirmDetailOf(om.readTree("{\"id\":1020,\"title\":\"改个名\"}"));
        assertTrue(noStatus.contains("状态不变"), "只改标题时别报一个状态出来：" + noStatus);
    }

    @Test
    @DisplayName("确认卡要写清「发布 vs 草稿」和标题 —— 用户就靠这一行决定点不点")
    void confirmDetailTellsPublishFromDraft() throws Exception {
        String published = tool("createPortalContent").confirmDetailOf(om.readTree(
                "{\"contentType\":\"NOTICE\",\"title\":\"关于搬迁的通知\",\"status\":\"PUBLISHED\"}"));
        assertTrue(published.contains("发布"), published);
        assertTrue(published.contains("关于搬迁的通知"), published);
        assertTrue(published.contains("公告"), published);

        String draft = tool("createPortalContent").confirmDetailOf(om.readTree(
                "{\"contentType\":\"NOTICE\",\"title\":\"关于搬迁的通知\"}"));
        assertTrue(draft.contains("草稿"), draft);
    }
}
