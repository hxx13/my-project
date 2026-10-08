package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.mp.util.MpHtmlSanitizer;
import com.example.demo.modules.portal.dto.PortalCategoryView;
import com.example.demo.modules.portal.dto.PortalContentView;
import com.example.demo.modules.portal.dto.PortalContentUpsertRequest;
import com.example.demo.modules.portal.service.PortalContentService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 门户内容包 —— 「内容管理 → 内容」页（{@code /#/content-manager/content}）的工具链。
 *
 * <p>它做的是**写稿并发布**：用户口述一段白话（「下周一起实验室搬到 3 号楼，门禁要重新刷」），
 * 模型把它写成规范的对外文案，再调工具建/改一条门户内容。查列表与分类是它的两条腿 ——
 * 分类 id 必须查出来，不能凭印象编。
 *
 * <p><b>为什么发布要单开一个能力码</b>：这是往**门户公开页**上写东西，跟查数据不是一个量级 ——
 * 发出去就是对外可见的。门禁按页面入口同口径收到 ADMIN 起（页面 {@code PortalContentAdminShell}
 * 与门户头像下拉都是 ADMIN 才看得见），比 HTTP 拦截器那层的 STAFF+ 更严。
 *
 * <p><b>两道必须自己做的防护</b>：
 * <ol>
 *   <li><b>正文入库前消毒</b>：{@code PortalContentService} 是原样存 {@code contentHtml} 的
 *       （前端编辑器在浏览器里消毒，工具绕过它就等于绕过消毒）。这里复用仓库既有的
 *       {@link MpHtmlSanitizer}，与 PageHelp 等其它富文本写入方同一条规则。</li>
 *   <li><b>只写白名单字段</b>：{@code extension_json} 是整块替换的（不是合并），
 *       这边只认 {@code priority} 一个键，改的时候先把原块读出来合并，别把别人的键冲掉。</li>
 * </ol>
 */
@Component
public class PortalContentToolPack implements AiToolPack {

    /** 独立能力码 —— 与「查数据」类的包分开授权。 */
    public static final String CAP_PORTAL_PUBLISH = "ai.portal.content.publish";

    /** 顺序即选项顺序（面板按这个次序排芯片）：公告放最前，最常用。 */
    private static final Map<String, String> TYPE_LABELS = new LinkedHashMap<>();
    private static final Set<String> TYPES = new LinkedHashSet<>();

    static {
        TYPE_LABELS.put("NOTICE", "公告");
        TYPE_LABELS.put("NEWS", "新闻");
        TYPE_LABELS.put("MODEL_RESOURCE", "模型资源");
        TYPE_LABELS.put("PAGE", "单页");
        TYPES.addAll(TYPE_LABELS.keySet());
    }

    private static final Map<String, String> STATUS_LABELS = new LinkedHashMap<>();

    static {
        STATUS_LABELS.put("PUBLISHED", "已发布");
        STATUS_LABELS.put("DRAFT", "草稿");
        STATUS_LABELS.put("ARCHIVED", "已归档（下线）");
    }

    /** 新建时能选的：还没存在的条目谈不上「撤下」。 */
    private static final Set<String> CREATE_STATUSES = new LinkedHashSet<>(List.of("PUBLISHED", "DRAFT"));

    /**
     * 改已有条目时能选的，多一个 {@code ARCHIVED}（列表筛选也用它 —— 页面上的状态筛选就有「已归档」）。
     *
     * <p>**这就是「撤下/下架」**：公开门户的查询是 {@code WHERE status='PUBLISHED'} 硬过滤的，
     * 改成已归档立刻就看不见了，而且可逆（还能改回 PUBLISHED）。原先我把它挡在门外，
     * 结果用户说「把刚发布的公告撤下」时模型只能答「系统里没有归档」—— 把自己的工具限制
     * 说成了系统事实，是错的。
     */
    private static final Set<String> ALL_STATUSES =
            new LinkedHashSet<>(List.of("PUBLISHED", "DRAFT", "ARCHIVED"));

    private static final Map<String, String> PRIORITY_LABELS = new LinkedHashMap<>();

    static {
        PRIORITY_LABELS.put("important", "重要");
        PRIORITY_LABELS.put("notice", "通知");
        PRIORITY_LABELS.put("routine", "常规");
    }

    private static final Set<String> PRIORITIES = new LinkedHashSet<>(PRIORITY_LABELS.keySet());

    /** 列宽：title varchar(256)、summary varchar(512)。留点余量，超了就明说，别让 DB 去抛。 */
    private static final int MAX_TITLE = 200;
    private static final int MAX_SUMMARY = 500;
    /** 自设上限：公告正文再长就该换载体（附件），不是往这塞几十万字。 */
    private static final int MAX_HTML = 20000;
    private static final int MAX_LIST = 50;

    private final PortalContentService portalContentService;
    private final ObjectMapper objectMapper;

    public PortalContentToolPack(PortalContentService portalContentService, ObjectMapper objectMapper) {
        this.portalContentService = portalContentService;
        this.objectMapper = objectMapper;
    }

    @Override
    public String packKey() {
        return "portalContent";
    }

    @Override
    public String displayName() {
        return "门户内容";
    }

    @Override
    public Set<String> routeHints() {
        // **「通知」必须在内**：用户最自然的说法就是「帮我发个通知」，2026-10-08 真机就因为这个字
        // 不在词表里，本包没被选中，模型手里连发布工具都没有，回了一句「我做不到」。
        // 「通知」在消息通知域也常出现（多带一个包只是多占一个包位，比"发通知找不到工具"轻得多）；
        // 而且现在面板会把**当前页面**一起报给路由（见 contextPage），在内容管理页上不靠词也能选中。
        return Set.of("门户", "资讯", "新闻", "公告", "通知", "稿件", "通知公告",
                "内容管理", "发布", "发文", "挂到门户", "发布到门户",
                // 页面路径归一化后是 contentmanagercontent —— 中文词一个都命中不了，
                // 得靠这个英文段把「人站在内容管理页」这个信号接上
                "content-manager");
    }

    @Override
    public String defaultPrompt() {
        return """
                门户内容的口径：
                - 用户说的是**白话**，你要写成**规范的对外文案**再发：去掉「咱们/搞一下/大概/可能」这类
                  口语和语气词，不用第一人称；标题写成名词短语（「关于实验室搬迁的通知」），
                  正文分点、一点一句；书面但不官腔，别堆四字句。
                - **一个事实都不许自己补**：用户没说的**时间、地点、责任人、联系方式、截止日期**，
                  一个字都不能加。缺了就直说「这条还需要你补 X」并停下 —— 拿常识填出来的日期
                  会真的对外公告出去，那是事故，不是帮忙。
                - 正文用最朴素的 HTML：`<p>` 段落、`<strong>` 强调、`<ul><li>` 分点、`<h3>` 小标题。
                  不要写 `style`、不要表格、不要图片（本包不处理图片）—— 危险标签服务端会消毒掉。
                - **发布是对外公开且不可撤回的**：先把**成稿全文**（标题 + 正文）贴在对话里让用户看着，
                  **然后把内容交给 createPortalContent** —— 不要停在"等你确认"上。
                - **配置不许你用文字问，也不许你自己定**：栏目、分类、优先级、发布方式这四件，
                  由 **createPortalContent 弹出可点选项**让用户点。所以：
                  别写「请问是直接发布还是先存草稿」这种句子 —— 那正是工具的问法。你只管把
                  标题/摘要/正文备好，带上 contentType 就调工具；缺的几项它会问你。
                  用户点完选项，你带齐四个参数再调一次。
                - 分类 id 只能用 listPortalCategories 查出来的，不要凭印象编数字。
                - 状态：**新建**时只有「直接发布」和「先存草稿」两种；**改已有的**还有「已归档（下线）」。
                  用词对齐页面：用户说「下线 / 撤下 / 下架 / 归档 / 别让大家看到」都是**同一件事** ——
                  `status=ARCHIVED`（门户立刻不再显示，可逆）；说「恢复」就改回 `DRAFT`
                  （回草稿，页面上再点发布才重新上线）。
                  **别用 DRAFT 冒充下线**：草稿是「还没发过」的意思，列表里显示成「草稿」、按钮变「发布」，
                  用户会以为没下线成功 —— 真机实测就这么把「把它下线」理解成了存草稿。
                  本包**不提供删除**；要下线就给归档，**不要答「系统里没有这个状态」或「我做不到」**。
                - **别把自己的工具限制说成系统事实**：你的选项少 ≠ 系统里没有那个状态。
                  拿不准就说「我这边的工具只能做到 X」，系统那层留给管理员 ——
                  2026-10-08 就因为状态白名单少放了一个 ARCHIVED，模型回了一句
                  「系统里只有草稿和已发布两种状态」，那是它不知道，不是系统没有。
                - 只有用户已经把话说死（「直接发」/「先存草稿」）时才自己带上 status；
                  **不确定也照样调工具**，让用户点 —— 不要因为"还没问清楚"就不调。
                - 用户没给的信息（电话、邮箱、责任人、截止时间）**不许自己补**，
                  缺了就明说「这条还需要你补 X」；但缺联系方式**不是**不调工具的理由，
                  正文里先留「请联系王老师」这样他就行。
                - 改已有的内容必须先 listPortalContents 拿到 id；只有用户明确说「改成…」才动它。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(CAP_PORTAL_PUBLISH, user -> level(user) >= RoleEnum.ADMIN.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listPortalContents(), getPortalContent(), listPortalCategories(),
                createPortalContent(), updatePortalContent());
    }

    // ── 读：内容列表 ──

    private AiTool listPortalContents() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "type": { "type": "string", "enum": ["NEWS","NOTICE","MODEL_RESOURCE","PAGE"], "description": "内容类型；省略=全部" },
                    "status": { "type": "string", "enum": ["DRAFT","PUBLISHED"], "description": "状态；省略=全部。找草稿用 DRAFT" },
                    "search": { "type": "string", "description": "标题关键词" },
                    "categoryId": { "type": "integer", "description": "分类 id（先 listPortalCategories）" },
                    "limit": { "type": "integer", "description": "返回几条，默认 20，上限 50" },
                    "page": { "type": "integer", "description": "第几页，从 1 起" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listPortalContents",
                "列出门户内容（新闻/公告/模型资源/单页），可按类型、状态、分类、标题关键词筛。"
                        + "**要改哪条内容、要找那条草稿、要确认刚发出去的东西在不在**时用它拿 id 与状态；"
                        + "它不返回正文全文（正文要用 getPortalContent 或直接去页面看）。",
                schema,
                CAP_PORTAL_PUBLISH,
                SideEffect.READ,
                (ctx, args) -> doList(args));
    }

    private Object doList(JsonNode args) {
        String type = text(args, "type").toUpperCase();
        if (!type.isEmpty() && !TYPES.contains(type)) {
            return badEnum("类型", type, TYPE_LABELS);
        }
        String status = text(args, "status").toUpperCase();
        if (!status.isEmpty() && !ALL_STATUSES.contains(status)) {
            return badEnum("状态", status, STATUS_LABELS);
        }
        int limit = clamp(args.path("limit").asInt(20), 1, MAX_LIST);
        int page = Math.max(1, args.path("page").asInt(1));
        Long categoryId = args.path("categoryId").isMissingNode() || args.path("categoryId").isNull()
                ? null : args.path("categoryId").asLong();

        Map<String, Object> res = portalContentService.listAdmin(
                orNull(type), orNull(status), orNull(text(args, "search")), null,
                categoryId, "updated", page, limit);
        List<Map<String, Object>> items = new ArrayList<>();
        Object rows = res == null ? null : res.get("data");
        if (rows instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof PortalContentView v) {
                    items.add(describe(v, false));
                }
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", res == null ? 0 : res.get("total"));
        out.put("contents", items);
        if (items.isEmpty()) {
            out.put("note", "没有符合条件的条目。找草稿记得 status=DRAFT；回收站里的内容不在这里。");
        }
        return out;
    }

    // ── 读：单条详情（含正文） ──

    private AiTool getPortalContent() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "id": { "type": "integer", "description": "内容 id（先用 listPortalContents 查）" }
                  },
                  "required": ["id"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "getPortalContent",
                "读一条门户内容的**正文全文**（含 HTML）。"
                        + "**要改已有内容之前先用它看原文** —— 不看原文就改，等于把用户没提的部分一起冲掉；"
                        + "用户说「把那条公告念一下 / 第三段改改」也用它。",
                schema,
                CAP_PORTAL_PUBLISH,
                SideEffect.READ,
                (ctx, args) -> {
                    long id = args.path("id").asLong(0);
                    if (id <= 0) {
                        return Map.of("ok", false, "reason", "要给 id（用 listPortalContents 查）。");
                    }
                    PortalContentView v = portalContentService.getAdmin(id);
                    if (v == null) {
                        return Map.of("ok", false, "reason", "没有 id=" + id + " 的内容（可能已删除进回收站）。");
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("content", describe(v, true));
                    return out;
                });
    }

    // ── 读：分类字典 ──

    private AiTool listPortalCategories() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "type": { "type": "string", "enum": ["NEWS","NOTICE","MODEL_RESOURCE","PAGE"], "description": "只看能被这种类型用的分类" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listPortalCategories",
                "列出门户内容分类（id、名称、适用范围、已有条数）。**新建内容前必须用它拿分类 id** —— "
                        + "分类 id 是库里的自增主键，凭印象写会挂到别的分类下或者建出一个没人管的条目。",
                schema,
                CAP_PORTAL_PUBLISH,
                SideEffect.READ,
                (ctx, args) -> {
                    String type = text(args, "type").toUpperCase();
                    if (!type.isEmpty() && !TYPES.contains(type)) {
                        return badEnum("类型", type, TYPE_LABELS);
                    }
                    List<Map<String, Object>> items = new ArrayList<>();
                    for (PortalCategoryView c : portalContentService.listAdminCategories()) {
                        if (c == null) continue;
                        String scope = str(c.getScope());
                        if (!type.isEmpty() && !"ALL".equalsIgnoreCase(scope) && !type.equalsIgnoreCase(scope)) {
                            continue; // 类型不匹配的分类不列，免得模型挑了挂不上去的
                        }
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("id", c.getId());
                        m.put("name", str(c.getName()));
                        m.put("scope", "ALL".equalsIgnoreCase(scope) ? "通用" : TYPE_LABELS.getOrDefault(scope, scope));
                        m.put("contentCount", c.getContentCount());
                        items.add(m);
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", items.size());
                    out.put("categories", items);
                    if (items.isEmpty()) {
                        out.put("note", "没有可用分类。分类得先在「内容管理 → 分类」里建。");
                    }
                    return out;
                });
    }

    // ── 写：新建并（可选）发布 ──

    private AiTool createPortalContent() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "contentType": { "type": "string", "enum": ["NEWS","NOTICE","MODEL_RESOURCE","PAGE"], "description": "NEWS 新闻 / NOTICE 公告 / MODEL_RESOURCE 模型资源 / PAGE 单页" },
                    "title": { "type": "string", "description": "标题（名词短语，如「关于实验室搬迁的通知」）" },
                    "contentHtml": { "type": "string", "description": "正文 HTML：只用 p/strong/ul/li/h3，不要 style、表格、图片" },
                    "summary": { "type": "string", "description": "摘要（列表页显示的一句话，建议给）" },
                    "categoryId": { "type": "integer", "description": "分类 id，先 listPortalCategories 查" },
                    "priority": { "type": "string", "enum": ["important","notice","routine"], "description": "重要 / 通知 / 常规；省略=常规" },
                    "status": { "type": "string", "enum": ["DRAFT","PUBLISHED"], "description": "省略=DRAFT。**只有用户说了「发布」才传 PUBLISHED**" }
                  },
                  "required": ["contentType", "title", "contentHtml"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "createPortalContent",
                // 首句**必须是干净的动作**：确认卡显示的就是描述的首句（见 AiTool#confirmPhrase）。
                // 写长了、或者把给模型的指令塞进首句，用户点确认时会看到一段在跟他讲规矩的话。
                "新建一条门户内容。**只有内容是你给的** —— 栏目、分类、优先级、发布方式这四项由它"
                        + "**弹出可点选项让用户自己选**，所以调它不会直接发布，也**不要用文字问这几项**"
                        + "（那是它的问法）。调用前先把成稿全文贴在对话里让用户看着。"
                        + "正文会经服务端消毒，分类必须是真实 id。",
                schema,
                CAP_PORTAL_PUBLISH,
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> doSave(null, args, ctx),
                (ctx, args) -> askPublishOptions(args),
                PortalContentToolPack::saveConfirmDetail);
    }

    /**
     * 发布前的**必答项**：内容由模型写，**配置一律让用户选**。
     *
     * <p>四个维度（栏目 / 分类 / 优先级 / 发布方式）齐了才返回 null，继续走确认挂起；
     * 缺哪个就把**四问一起**抛出去 —— 载体本来就支持排队多问，用户按顺序点完，答案合成一条消息回来，
     * 模型再调一次把四个参数带齐。
     *
     * <p>为什么不让模型拍板：栏目与分类决定这条内容挂在门户哪一栏、给谁看、有多显眼，
     * 那是编辑的决定，不是"把话说顺"的一部分。模型只负责把白话写成正式文案。
     */
    private Object askPublishOptions(JsonNode args) {
        String type = text(args, "contentType").toUpperCase();
        boolean hasCategory = !args.path("categoryId").isMissingNode() && !args.path("categoryId").isNull();
        boolean ready = TYPES.contains(type)
                && hasCategory
                && PRIORITIES.contains(text(args, "priority").toLowerCase())
                && CREATE_STATUSES.contains(text(args, "status").toUpperCase());
        if (ready) {
            return null;
        }
        List<Map<String, Object>> questions = new ArrayList<>();
        questions.add(question("这条发到哪个栏目？", typeOptions()));
        questions.add(question("排在哪个分类下？", categoryOptions(type)));
        questions.add(question("优先级？", priorityOptions()));
        questions.add(question("现在就发，还是先存草稿？", statusOptions()));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("needUserChoice", true);
        out.put("reason", "内容已经写好了，但**发布配置要由用户自己定**。"
                + "把这四问问给用户（面板会渲染成可点选项，点完答案会合成一条消息回来），"
                + "然后**再调一次本工具**，按顺序把参数带上："
                + "第 1 问→contentType，第 2 问→categoryId，第 3 问→priority，第 4 问→status。"
                + "四个答案没拿齐之前，先把内容贴出来让用户看着，不要说「已发布」。");
        out.put("questions", questions);
        return out;
    }

    private static Map<String, Object> question(String title, List<Map<String, Object>> options) {
        Map<String, Object> q = new LinkedHashMap<>();
        q.put("title", title);
        q.put("options", options);
        return q;
    }

    private static Map<String, Object> option(String label, Object value) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("label", label);
        o.put("value", value);
        return o;
    }

    private static List<Map<String, Object>> typeOptions() {
        List<Map<String, Object>> out = new ArrayList<>();
        TYPE_LABELS.forEach((code, label) -> out.add(option(label, code)));
        return out;
    }

    private static List<Map<String, Object>> priorityOptions() {
        List<Map<String, Object>> out = new ArrayList<>();
        PRIORITY_LABELS.forEach((code, label) -> out.add(option(label, code)));
        return out;
    }

    private static List<Map<String, Object>> statusOptions() {
        // 顺序刻意：[0] 是「直接发布」、[1] 是「先存草稿」—— 面板按序渲染，用户照着点
        List<Map<String, Object>> out = new ArrayList<>();
        out.add(option("直接发布到门户（公开可见）", "PUBLISHED"));
        out.add(option("先存草稿，之后再发", "DRAFT"));
        return out;
    }

    /** 分类选项：标签里带上适用范围，用户挑的时候就知道这个分类是给哪种内容用的。 */
    private List<Map<String, Object>> categoryOptions(String type) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (PortalCategoryView c : portalContentService.listAdminCategories()) {
            if (c == null || c.getId() == null) continue;
            String scope = str(c.getScope());
            boolean universal = "ALL".equalsIgnoreCase(scope) || scope.isEmpty();
            // 已经知道栏目时只给放得下的分类；还不知道就全给（标签里写着适用范围）
            if (!type.isEmpty() && !universal && !type.equalsIgnoreCase(scope)) {
                continue;
            }
            String label = str(c.getName());
            if (!universal) {
                label = label + "（" + TYPE_LABELS.getOrDefault(scope, scope) + "）";
            }
            out.add(option(label, c.getId()));
        }
        return out;
    }

    // ── 写：改已有的 ──

    private AiTool updatePortalContent() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "id": { "type": "integer", "description": "要改的内容 id（先用 listPortalContents 查）" },
                    "title": { "type": "string", "description": "新标题；不改就不传" },
                    "contentHtml": { "type": "string", "description": "新正文；不改就不传" },
                    "summary": { "type": "string", "description": "新摘要；不改就不传" },
                    "categoryId": { "type": "integer", "description": "换分类；不改就不传" },
                    "priority": { "type": "string", "enum": ["important","notice","routine"], "description": "改优先级；不改就不传" },
                    "status": { "type": "string", "enum": ["DRAFT","PUBLISHED","ARCHIVED"], "description": "PUBLISHED 发布上线 / ARCHIVED **下线**（从门户撤下，立刻不再显示，之后可恢复）/ DRAFT 收回成草稿（**别拿它做下线** —— 草稿是「还没发过」的意思，页面上显示成草稿而不是已归档）" }
                  },
                  "required": ["id"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "updatePortalContent",
                // 首句必须是干净的动作：确认卡只显示描述的第一句（见 AiTool#confirmPhrase）
                "修改一条已有的门户内容。"
                        + "改错字、补正文、把草稿发布出去、**把已发布的拉下门户**都走它；只传要改的字段。"
                        + "**已经有这条才用它** —— 新写一条用 createPortalContent。"
                        + "**用户说「下线 / 撤下 / 下架 / 归档 / 别让大家看到」→ status 传 `ARCHIVED`**"
                        + "（门户公开页立刻不再显示，之后改回 PUBLISHED 即恢复上线）。"
                        + "**别用 DRAFT 代替下线** —— 草稿是「还没发过」的意思，列表里显示成「草稿」、"
                        + "按钮变成「发布」，跟用户要的「下线」不是一回事（真机就这么错了一次）。"
                        + "**本包不提供删除**，要下线就给归档，别答「做不到」。改状态同样会挂起等确认。",
                schema,
                CAP_PORTAL_PUBLISH,
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> doSave(args.path("id").asLong(0), args, ctx),
                null,
                PortalContentToolPack::saveConfirmDetail);
    }

    /**
     * 新建 / 更新共用一个执行体。
     *
     * <p>共用不是为了省代码，是**两边的校验必须一致** —— 类型/状态/优先级白名单、正文消毒、
     * 列宽上限、分类归属校验，任何一条只做在一边就是漏洞（新建时挡住了 200 字标题，
     * 改的时候能塞进去，等于没挡）。
     */
    private Object doSave(Long id, JsonNode args, AiToolContext ctx) {
        PortalContentView existing = id == null ? null : portalContentService.getAdmin(id);
        if (id != null && existing == null) {
            return Map.of("ok", false, "reason", "没有 id=" + id + " 的内容（可能已删除进回收站）。"
                    + "用 listPortalContents 重新确认一下要改哪条。");
        }

        // 类型：新建必填；更新时沿用原值（不传就保持不动）
        String type = text(args, "contentType").toUpperCase();
        if (type.isEmpty()) {
            type = existing == null ? "" : str(existing.getContentType());
        }
        if (existing == null && type.isEmpty()) {
            return Map.of("ok", false, "reason", "新建要指定 contentType（NEWS / NOTICE / MODEL_RESOURCE / PAGE）");
        }
        if (!type.isEmpty() && !TYPES.contains(type)) {
            return badEnum("类型", type, TYPE_LABELS);
        }

        String status = text(args, "status").toUpperCase();
        // 新建只能「发布 / 存草稿」—— 还没存在的条目谈不上撤下；改已有的多一个「归档（撤下）」
        Set<String> allowedStatuses = existing == null ? CREATE_STATUSES : ALL_STATUSES;
        if (!status.isEmpty() && !allowedStatuses.contains(status)) {
            return badEnum("状态", status, STATUS_LABELS);
        }

        String priority = text(args, "priority").toLowerCase();
        if (!priority.isEmpty() && !PRIORITIES.contains(priority)) {
            return badEnum("优先级", priority, PRIORITY_LABELS);
        }

        String title = text(args, "title");
        if (existing == null && title.isEmpty()) {
            return Map.of("ok", false, "reason", "新建要给 title");
        }
        if (title.length() > MAX_TITLE) {
            return Map.of("ok", false, "reason", "标题 " + title.length() + " 字，超过上限 " + MAX_TITLE + "，请压缩。");
        }

        String summary = text(args, "summary");
        if (summary.length() > MAX_SUMMARY) {
            return Map.of("ok", false, "reason", "摘要 " + summary.length() + " 字，超过上限 " + MAX_SUMMARY + "，请压缩。");
        }

        String html = text(args, "contentHtml");
        if (existing == null && html.isEmpty()) {
            return Map.of("ok", false, "reason", "新建要给 contentHtml（正文）");
        }
        if (html.length() > MAX_HTML) {
            return Map.of("ok", false,
                    "reason", "正文 " + html.length() + " 字，超过上限 " + MAX_HTML + "，请拆分或改走附件。");
        }

        Long categoryId = args.path("categoryId").isMissingNode() || args.path("categoryId").isNull()
                ? null : args.path("categoryId").asLong();
        String categoryName = null;
        if (categoryId != null) {
            PortalCategoryView cat = findCategory(categoryId);
            if (cat == null) {
                return askCategoryAgain(type, "分类 id=" + categoryId + " 在库里不存在（可能已被删）");
            }
            String scope = str(cat.getScope());
            if (!"ALL".equalsIgnoreCase(scope) && !type.isEmpty() && !type.equalsIgnoreCase(scope)) {
                return askCategoryAgain(type, "分类「" + str(cat.getName()) + "」是给"
                        + TYPE_LABELS.getOrDefault(scope, scope) + "用的，放不下"
                        + TYPE_LABELS.getOrDefault(type, type));
            }
            categoryName = str(cat.getName());
        }

        PortalContentUpsertRequest req = new PortalContentUpsertRequest();
        req.setContentType(orNull(type));
        req.setTitle(orNull(title));
        req.setSummary(orNull(summary));
        req.setCategoryId(categoryId);
        req.setStatus(orNull(status));
        if (!html.isEmpty()) {
            // 工具绕过前端编辑器写入 → 消毒这一步必须在这边做，否则等于绕过前端的消毒
            req.setContentHtml(MpHtmlSanitizer.sanitizeBodyHtml(html));
        } else if (existing != null) {
            req.setContentHtml(null); // 「null = 不动」
        }
        String merged = mergeExtensionJson(existing, priority);
        if (merged != null) {
            req.setExtensionJson(merged);
        }

        PortalContentView saved;
        try {
            saved = existing == null
                    ? portalContentService.create(req, ctx.actor() == null ? null : ctx.actor().getId())
                    : portalContentService.update(id, req);
        } catch (Exception e) {
            return Map.of("ok", false, "reason", "写入失败：" + e.getMessage());
        }
        if (saved == null) {
            return Map.of("ok", false, "reason", "写入后读不到这条内容，请到页面上确认。");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("id", saved.getId());
        out.put("created", existing == null);
        out.put("title", str(saved.getTitle()));
        out.put("type", TYPE_LABELS.getOrDefault(str(saved.getContentType()), str(saved.getContentType())));
        out.put("category", categoryName != null ? categoryName : str(saved.getCategoryName()));
        out.put("status", STATUS_LABELS.getOrDefault(str(saved.getStatus()), str(saved.getStatus())));
        if (saved.getPublishedAt() != null) {
            out.put("publishedAt", String.valueOf(saved.getPublishedAt()));
        }
        out.put("note", "已发布的条目在门户首页与「内容管理 → 内容」列表里可见。"
                + "跟用户交代结果时说清标题与是草稿还是已发布，别把草稿说成发出去了。");
        return out;
    }

    /** 确认弹窗那行：用户唯一能核对的依据 —— 哪个类型、发还是存草稿、什么标题、落在哪个分类。 */
    private static String saveConfirmDetail(JsonNode args) {
        if (args == null) {
            return "本次：写入门户内容";
        }
        String title = args.path("title").asText("");
        if (title.isBlank()) {
            title = "（沿用原标题）";
        }
        String head = args.path("id").isMissingNode() || args.path("id").isNull() ? "新建" : "修改 id=" + args.path("id").asLong();
        String type = TYPE_LABELS.getOrDefault(args.path("contentType").asText(""), "");
        // 状态那三个档要分清，不能一律写成「存为草稿」：改为下线却显示草稿，用户点下去才知道不是那回事
        String status = args.path("status").asText("").toUpperCase();
        String statusText;
        if (status.isEmpty()) {
            // 没写状态时两边含义不同：新建会落成草稿（服务端默认），改已有则什么都不动
            statusText = "新建".equals(head) ? "存为**草稿**（新建默认）" : "（状态不变）";
        } else if ("PUBLISHED".equals(status)) {
            statusText = "**发布到门户公开页**";
        } else {
            statusText = "改为「" + STATUS_LABELS.getOrDefault(status, status) + "」";
        }
        return "本次：" + head + " · " + (type.isEmpty() ? "" : type + " · ") + statusText + " · " + title;
    }

    // ── 内部 ──

    private PortalCategoryView findCategory(Long id) {
        for (PortalCategoryView c : portalContentService.listAdminCategories()) {
            if (c != null && id.equals(c.getId())) {
                return c;
            }
        }
        return null;
    }

    /**
     * 分类对不上时**重新问一次分类**，而不是硬拒。
     *
     * <p>用户是点选项选的，对不上多半是栏目与分类的适用范围不搭；把放得下的分类再摆一遍，
     * 他点一下就过去了。硬拒会把整段流程卡死，还得从头再描述一遍要发什么。
     */
    private Object askCategoryAgain(String type, String why) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("needUserChoice", true);
        out.put("reason", why + "。重新问一次分类（面板会渲染成可选项），拿到后再调一次本工具。"
                + "候选是空的话，说明这个栏目下还没建分类，得先去「内容管理 → 分类」。");
        out.put("questions", List.of(question("换个分类？", categoryOptions(type))));
        return out;
    }

    /**
     * extension_json 是**整块替换**的（mapper 里直接 set，不是 merge），所以改优先级必须先把原块读出来。
     * 只认 priority 一个键：别的键是页面写进去的（将来可能有别的用途），不能顺手冲掉。
     */
    private String mergeExtensionJson(PortalContentView existing, String priority) {
        ObjectNode node;
        try {
            node = existing != null && existing.getExtensionJson() != null && !existing.getExtensionJson().isBlank()
                    ? (ObjectNode) objectMapper.readTree(existing.getExtensionJson())
                    : objectMapper.createObjectNode();
        } catch (Exception e) {
            node = objectMapper.createObjectNode(); // 原块不是 JSON 对象（理论上不会）：宁可只写这一个键
        }
        if (node == null) {
            node = objectMapper.createObjectNode();
        }
        if (!priority.isEmpty()) {
            node.put("priority", priority);
        }
        return node.isEmpty() ? null : node.toString();
    }

    private Map<String, Object> describe(PortalContentView v, boolean withBody) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", v.getId());
        m.put("title", str(v.getTitle()));
        m.put("type", TYPE_LABELS.getOrDefault(str(v.getContentType()), str(v.getContentType())));
        m.put("status", STATUS_LABELS.getOrDefault(str(v.getStatus()), str(v.getStatus())));
        m.put("category", str(v.getCategoryName()));
        m.put("priority", PRIORITY_LABELS.getOrDefault(priorityOf(v.getExtensionJson()), priorityOf(v.getExtensionJson())));
        if (v.getPublishedAt() != null) {
            m.put("publishedAt", String.valueOf(v.getPublishedAt()));
        }
        m.put("updatedAt", v.getUpdatedAt() == null ? "" : String.valueOf(v.getUpdatedAt()));
        m.put("createdBy", str(v.getCreatedByName()));
        String summary = str(v.getSummary());
        if (!summary.isEmpty()) {
            m.put("summary", summary);
        }
        if (withBody) {
            m.put("contentHtml", str(v.getContentHtml()));
        }
        return m;
    }

    private String priorityOf(String extensionJson) {
        if (extensionJson == null || extensionJson.isBlank()) {
            return "routine";
        }
        try {
            String p = objectMapper.readTree(extensionJson).path("priority").asText("");
            return PRIORITIES.contains(p) ? p : "routine";
        } catch (Exception e) {
            return "routine";
        }
    }

    private static Map<String, Object> badEnum(String what, String got, Map<String, String> allowed) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "不认识的" + what + "：" + got);
        out.put("allowed", allowed);
        return out;
    }

    private static String text(JsonNode args, String field) {
        return args.path(field).asText("").trim();
    }

    private static String orNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    private static String str(Object o) {
        if (o == null) return "";
        String s = String.valueOf(o).trim();
        return "null".equalsIgnoreCase(s) ? "" : s;
    }

    private static int clamp(int v, int min, int max) {
        return Math.min(Math.max(v, min), max);
    }

    private static int level(User user) {
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        return role.getLevel();
    }
}
