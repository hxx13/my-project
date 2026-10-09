package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.AiView;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.material.dto.InboundMaterialReq;
import com.example.demo.modules.material.dto.MaterialCategoryView;
import com.example.demo.modules.material.dto.MaterialItemUpsertReq;
import com.example.demo.modules.material.dto.MaterialItemView;
import com.example.demo.modules.material.entity.MaterialItem;
import com.example.demo.modules.material.service.MaterialService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 物品**管理**（{@code /#/console/admin/material/manage}「物品管理」）的工具包 —— 物品主数据 + 库存 + 回收站。
 *
 * <h2>归属（三个包别混）</h2>
 * <ul>
 *   <li>{@code review}（学生审核页）—— 管**审批**：申领单的通过 / 驳回、延迟免冻；</li>
 *   <li>{@code materialAudit}（申领审计导出页）—— 管**只读的审计明细与导出**；</li>
 *   <li><b>本包</b> —— 管**物品本身**：分类 / 物品 / 库存 / 回收站。跟页面走，页面做不了的不提供。</li>
 * </ul>
 *
 * <h2>视角与能力（网关注入前的两道筛）</h2>
 * 网关先按 {@link AiView} 筛包、再按能力码筛工具。本包是教职工侧的后台管理页：
 * <ul>
 *   <li>{@link #views()} 显式声明 {@link AiView#STAFF} —— 学生视角**永远拿不到**本包
 *       （判据是 {@code CageModeVisibilityService#isStudent}，与前端 {@code isStudentAccount()} 同源，
 *       **不按角色等级**：学生账号的角色档可能就是 STAFF 级）；</li>
 *   <li>能力码 {@code ai.material.manage} = ADMIN，出处是该页在页面权限表里的 minRole
 *       （与同页族的 {@code MaterialAuditToolPack} 同一写法）。</li>
 * </ul>
 *
 * <h2>故意不提供的能力（不是漏了）</h2>
 * <ul>
 *   <li><b>彻底删除 / 批量彻底删除 / 一键清空回收站</b>：不可逆，而且 {@code purgeItem} 会**级联**
 *       删掉该物品的库存流水、从申领单里摘掉它的行、甚至整张只剩这一行的申领单被硬删。
 *       页面上点它还有弹窗二次确认，对话里只有一道确认 —— 两边风险不对称，所以不接，让用户去页面做。
 *       （现有 21 个包也**没有任何硬删/清空先例**。）</li>
 *   <li><b>规格（specSchema）编辑</b>：规格是「几维 × 每维若干选项」的组合，畸形 schema 会让这件物品
 *       **之后没法下单**。口径与 {@code supplies} 包一致：要设规格到页面上做。</li>
 *   <li><b>封面图上传</b>：不是对话能产出的东西。</li>
 * </ul>
 *
 * <h2>写操作的口径</h2>
 * 全部 C 级（{@link SideEffect#EXTERNAL_WRITE}）：入库/纠偏动库存流水、新建物品会立刻出现在学生端商城，
 * 不是「失败可安全重试」的纯库写 → 服务端挂起等用户点确认，**写后一律回读**再回报。
 * 审核人**只收姓名或候选值、不收 id 数组**：{@code reviewerIds} 是 JSON 数组字符串，
 * 让模型拼它既易错又说不清「改的是哪个人」。
 */
@Component
public class MaterialManageToolPack implements AiToolPack {

    /** 与页面权限表同口径：{@code /admin/material/manage} 是 ADMIN。 */
    public static final String CAP_MATERIAL_MANAGE = "ai.material.manage";

    /** 一次最多回几行（完整清单去页面看，别把整表塞进对话）。 */
    private static final int MAX_ROWS = 40;
    /** 候选最多几个做成可点芯片。 */
    private static final int CHIP_MAX = 5;
    /**
     * 一次批量入库最多几件。
     *
     * <p>网关设计 §11 的「单次操作影响对象数上限」：一次确认写太多行，人看不过来就成了走过场。
     * 10 件够覆盖「到一批货、几个品种各进一点」，再多就让用户分批。
     */
    private static final int MAX_BATCH_ITEMS = 10;

    private static final Set<String> SHELF = Set.of("DRAFT", "PUBLISHED", "ARCHIVED");
    private static final Set<String> STOCK_MODES = Set.of("QUANTIFIED", "FLAG");
    private static final Set<String> WORKFLOWS = Set.of("SIMPLE", "DUAL_REVIEW", "SKIP_REVIEW");

    private final MaterialService materialService;
    private final ObjectMapper objectMapper;

    public MaterialManageToolPack(MaterialService materialService, ObjectMapper objectMapper) {
        this.materialService = materialService;
        this.objectMapper = objectMapper;
    }

    @Override
    public String packKey() {
        return "materialManage";
    }

    @Override
    public String displayName() {
        return "物品管理";
    }

    /** 教职工侧后台页。**显式写出来**（默认也是 STAFF，但这是安全声明，写出来才可审计）。 */
    @Override
    public Set<AiView> views() {
        return Set.of(AiView.STAFF);
    }

    @Override
    public Set<String> routeHints() {
        // 「物品管理 / 上架 / 下架 / 入库 / 库存纠偏 / 回收站 / 分类」是本域的说法。
        // 别用「领用 / 物资 / 库存」这种宽词 —— 那些是 supplies 与 review 两个域的口径。
        return Set.of("物品管理", "商品管理", "上架", "下架", "入库", "库存纠偏", "物品回收站", "materialManage");
    }

    @Override
    public String defaultPrompt() {
        return """
                物品管理（#/console/admin/material/manage）的口径：
                - 本包管**物品本身**：分类、物品（增改删）、库存（入库 / 纠正）、回收站。
                  **申领单的审批不在这边**（那在「学生审核」页，属于另一个域）——用户说「审一下那张申领单」，
                  如实说这边办不了、要去学生审核。
                - **参数不齐先问，一次只问一件**；能做成选项的一律做成**可点芯片**，不要在正文里列候选。
                  分类、审核人、物品命中多条时，工具会把候选交回，你**别自己挑**。
                - 新建物品要先问齐：**分类、名称、审核流程、审核人**。
                  免审（SKIP_REVIEW）不用审核人；其余流程**至少一名审核人**；复核（DUAL_REVIEW）还要复审人。
                  问不齐就**不要提交**（提交必被服务端拒），先把缺的那件问回来。
                - **库存模式**：QUANTIFIED＝按件计数；FLAG＝只管「有/无」，数量只能是 0 或 1。
                - **入库是增量、库存纠偏是绝对值**，别混：用户说「再进 20 件」是入库；
                  说「库存改成 20」（现在是多少不重要）才是纠偏。拿不准就问一句。
                - 入库**一次可以报多件**（上限 10 件，一道确认会把这一批逐件列出来）——
                  用户一口气报几样就**放进同一次调用**，别拆成一件一次（那样要点很多次确认）。
                  纠偏没有批量：每件的「实际有多少」各不相同，一个数套多件没有意义。
                - **「低于 N 件」「快没了」这类筛选要交给工具做**（工具里有按可用量/按现存量低于某值的筛选项），
                  **不要**自己拿回给你的那几十行去比 —— 清单是截断返回的，自己筛会漏掉没回给你的那些。
                - **入库会把草稿状态的物品自动变成已上架**（服务端行为）——结果就照实说。
                - **删物品是软删**（进回收站，可恢复）；**彻底删除与清空回收站本包不提供** ——
                  那是不可逆的，请用户到物品管理页的回收站里做。
                - **规格（尺寸/颜色那种选项）与封面图本包不设**，请用户到页面上配；
                  替他编一个规格只会让这件物品之后没法被申领。
                - 库存、件数一律照工具返回的原样报（含「可用 = 现有 − 已被待处理单锁定」），**不要自己加总**。
                - 每一次写都会让用户在界面上点确认；正文里**不要**说「已经办好了」，等确认之后再据回读结果说。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(CAP_MATERIAL_MANAGE, user -> user.getRole() != null
                && user.getRole().getLevel() >= RoleEnum.ADMIN.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(
                listCategories(), listItems(), listRecycle(), listReviewerCandidates(),
                createCategory(), updateCategory(), deleteCategory(),
                createItem(), updateItem(), deleteItem(),
                inboundItem(), adjustStock(), restoreItem());
    }

    // ── 读 ──

    private AiTool listCategories() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "group": { "type": "string", "description": "只看某个课题组的分类（可选，一般不用传）" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listMaterialCategories",
                "列物品分类（就是物品管理页左栏那些），带启用状态与**每类下有几件物品**。"
                        + "用户说「按分类看」或要新建物品前先确认分类名时用它。",
                schema, CAP_MATERIAL_MANAGE, SideEffect.READ,
                (ctx, args) -> {
                    String group = text(args, "group");
                    List<MaterialCategoryView> cats = orEmpty(materialService.listCategoriesForAdmin(group.isEmpty() ? null : group));
                    Map<Long, Integer> countByCat = new LinkedHashMap<>();
                    for (MaterialItemView it : orEmpty(materialService.listItemsForAdmin(null, group.isEmpty() ? null : group))) {
                        if (it != null && it.getCategoryId() != null) {
                            countByCat.merge(it.getCategoryId(), 1, Integer::sum);
                        }
                    }
                    List<Map<String, Object>> rows = new ArrayList<>();
                    for (MaterialCategoryView c : cats) {
                        if (c == null) continue;
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("categoryId", c.getId());
                        row.put("name", str(c.getName()));
                        row.put("enabled", c.getStatus() == null || c.getStatus() == 1);
                        row.put("sortOrder", c.getSortOrder());
                        row.put("itemCount", countByCat.getOrDefault(c.getId(), 0));
                        rows.add(row);
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("total", rows.size());
                    out.put("categories", rows);
                    return out;
                });
    }

    private AiTool listItems() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "category": { "type": "string", "description": "只看某个分类（名称或 id，来自 listMaterialCategories）" },
                    "group": { "type": "string", "description": "只看某个课题组的物品（课题组全称，可选）" },
                    "keyword": { "type": "string", "description": "物品名/副标题的任意片段" },
                    "shelfStatus": { "type": "string", "enum": ["DRAFT","PUBLISHED","ARCHIVED"], "description": "只看某个上架状态，不传=全部" },
                    "availableBelow": { "type": "integer", "description": "**可用量低于**这个数的物品（要补货看它：传 1 = 断货的）。判断由服务端做，别自己筛" },
                    "stockBelow": { "type": "integer", "description": "**现有量低于**这个数的物品（盘点口径）。同样由服务端做" },
                    "limit": { "type": "integer", "description": "最多返回几条，默认 20，上限 40" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listMaterialItems",
                "查物品清单（物品管理页那张网格）：库存、上架状态、库存模式、审核流程、是否要选规格。"
                        + "**回答「有哪些物品 / 某件还剩多少 / 上架了没 / 哪些快没了」用它**。"
                        + "「低于 N 件」这类筛选**传给 availableBelow / stockBelow，别自己拿回来的行去比** —— "
                        + "清单是截断返回的，自己筛会漏掉没回给你的那些。"
                        + "**可用量看 availableQty**（现有 − 已被待处理申领单锁定），不是 stockQty。",
                schema, CAP_MATERIAL_MANAGE, SideEffect.READ,
                (ctx, args) -> {
                    int limit = clamp(args.path("limit").asInt(20), 1, MAX_ROWS);
                    String group = text(args, "group");
                    String kw = text(args, "keyword");
                    String shelf = text(args, "shelfStatus");
                    Integer availBelow = intOrNull(args, "availableBelow");
                    Integer stockBelow = intOrNull(args, "stockBelow");
                    // 分类筛选是**可选**的：没传就别去解析（否则会被当成「没说哪个分类」而拒掉整次查询）
                    NodeMaybe catId = new NodeMaybe(null);
                    String catWant = text(args, "category");
                    if (!catWant.isEmpty()) {
                        NodeMaybe byId = longArg(args, "category");
                        if (byId.value != null) {
                            catId = byId;
                        } else {
                            CatLookup cl = resolveCategory(catWant);
                            if (cl.error != null) return cl.error;
                            if (cl.category != null) catId = new NodeMaybe(cl.category.getId());
                        }
                    }
                    // 先筛出**全部**命中行，再截断 —— 顺序反了会报「没有低于 X 的」而其实后面有
                    List<Map<String, Object>> matched = new ArrayList<>();
                    for (MaterialItemView it : orEmpty(materialService.listItemsForAdmin(catId.value, group.isEmpty() ? null : group))) {
                        if (it == null) continue;
                        if (!kw.isEmpty() && !contains(it.getName(), kw) && !contains(it.getSubtitle(), kw)) continue;
                        if (!shelf.isEmpty() && !shelf.equalsIgnoreCase(str(it.getShelfStatus()))) continue;
                        Map<String, Object> row = describeItem(it);
                        if (availBelow != null && num(row.get("availableQty")) >= availBelow) continue;
                        if (stockBelow != null && num(row.get("stockQty")) >= stockBelow) continue;
                        matched.add(row);
                    }
                    boolean truncated = matched.size() > limit;
                    List<Map<String, Object>> shown = truncated
                            ? new ArrayList<>(matched.subList(0, limit)) : matched;
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("matchedTotal", matched.size());
                    out.put("returned", shown.size());
                    out.put("items", shown);
                    if (matched.isEmpty()) {
                        out.put("note", "这个条件下没查到物品；换个关键词或放宽条件再试");
                    } else if (truncated) {
                        out.put("note", "共 " + matched.size() + " 件命中，这里只回了前 " + shown.size()
                                + " 件。**要如实说「共 N 件」**，并让用户加分类/关键词收窄，或按阈值再筛一次");
                    }
                    return out;
                });
    }

    private AiTool listRecycle() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "limit": { "type": "integer", "description": "最多返回几条，默认 20，上限 40" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listMaterialItemRecycle",
                "列物品回收站（被删掉、还没彻底删除的物品）。恢复物品前先用它确认是哪一件。",
                schema, CAP_MATERIAL_MANAGE, SideEffect.READ,
                (ctx, args) -> {
                    int limit = clamp(args.path("limit").asInt(20), 1, MAX_ROWS);
                    Result<Map<String, Object>> res = materialService.listItemRecycle(1, Math.max(limit, 1));
                    Map<String, Object> data = res == null || res.getData() == null ? Map.of() : res.getData();
                    Map<Long, String> catNames = new LinkedHashMap<>();
                    for (MaterialCategoryView c : orEmpty(materialService.listCategoriesForAdmin(null))) {
                        if (c != null && c.getId() != null) catNames.put(c.getId(), str(c.getName()));
                    }
                    List<Map<String, Object>> rows = new ArrayList<>();
                    Object raw = data.get("data");
                    if (raw instanceof List<?> list) {
                        for (Object o : list) {
                            if (!(o instanceof MaterialItem it) || rows.size() >= limit) continue;
                            Map<String, Object> row = new LinkedHashMap<>();
                            row.put("itemId", it.getId());
                            row.put("name", str(it.getName()));
                            row.put("category", catNames.getOrDefault(it.getCategoryId(), ""));
                            row.put("stockQty", it.getStockQty());
                            row.put("deletedAt", it.getDeletedTime() == null ? null : String.valueOf(it.getDeletedTime()));
                            rows.add(row);
                        }
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("total", data.get("total"));
                    out.put("items", rows);
                    out.put("note", "回收站里**只能恢复**，不能从这里彻底删除 —— 彻底删除是不可逆的，"
                            + "要做得请用户去物品管理页的回收站操作");
                    return out;
                });
    }

    private AiTool listReviewerCandidates() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "keyword": { "type": "string", "description": "按姓名筛（不确定准确写法时用），不传=全部" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listMaterialReviewerCandidates",
                "列**可选的审核人**（STAFF 及以上已启用账号）。新建/编辑物品要指定审核人时先用它确认人；"
                        + "用户报了名字但不确定写法时也用它。命中多个人会把候选交回让用户点。",
                schema, CAP_MATERIAL_MANAGE, SideEffect.READ,
                (ctx, args) -> {
                    String kw = text(args, "keyword");
                    List<Map<String, Object>> rows = new ArrayList<>();
                    for (Map<String, Object> u : safe(materialService.listEligibleReviewers())) {
                        String name = firstStr(u, "displayName", "displayNickname", "username");
                        if (!kw.isEmpty() && !contains(name, kw)) continue;
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("name", name);
                        row.put("value", str(u.get("id")));
                        rows.add(row);
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("total", rows.size());
                    out.put("reviewers", rows);
                    if (!rows.isEmpty() && rows.size() <= CHIP_MAX) {
                        out.put("choices", choicesOf(rows));
                        out.put("choicesTitle", "选谁当审核人？");
                    } else if (rows.size() > CHIP_MAX) {
                        out.put("note", "人比较多：让用户给个姓名片段再查一次（候选大于 " + CHIP_MAX + " 个就不做芯片了）");
                    }
                    return out;
                });
    }

    // ── 写：分类 ──

    private AiTool createCategory() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "name": { "type": "string", "description": "分类名" },
                    "sortOrder": { "type": "integer", "description": "排序号，越小越靠前，不传=0" }
                  },
                  "required": ["name"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "createMaterialCategory",
                "新建一个物品分类（物品管理页左栏）。新建后物品可以挂到它下面。",
                schema, CAP_MATERIAL_MANAGE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    String name = text(args, "name");
                    if (name.isEmpty()) return Map.of("ok", false, "reason", "没说分类名。先问用户要叫什么");
                    Result<MaterialCategoryView> res = materialService.createCategory(name, args.path("sortOrder").asInt(0));
                    if (bad(res)) return failed(res);
                    MaterialCategoryView c = res.getData();
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("categoryId", c == null ? null : c.getId());
                    out.put("name", c == null ? name : str(c.getName()));
                    out.put("note", "确认已收到并已生效：分类已建好。");
                    return out;
                }, null, a -> "新建分类「" + text(a, "name") + "」");
    }

    private AiTool updateCategory() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "category": { "type": "string", "description": "要改的分类（名称或 id，来自 listMaterialCategories）" },
                    "name": { "type": "string", "description": "改成什么名字（不改就不传）" },
                    "sortOrder": { "type": "integer", "description": "新的排序号（不改就不传）" },
                    "enabled": { "type": "boolean", "description": "启用/停用（不改就不传）" }
                  },
                  "required": ["category"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "updateMaterialCategory",
                "改一个已有分类：改名 / 排序 / 停用启用。"
                        + "**只改用户说到的那几项，没说的一律不动**，所以别把没提的字段一起传。",
                schema, CAP_MATERIAL_MANAGE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    CatLookup cl = resolveCategory(text(args, "category"));
                    if (cl.error != null) return cl.error;
                    String name = args.path("name").isTextual() ? text(args, "name") : null;
                    Integer sort = args.path("sortOrder").isNumber() ? args.path("sortOrder").asInt() : null;
                    Integer status = args.path("enabled").isBoolean() ? (args.path("enabled").asBoolean() ? 1 : 0) : null;
                    if (name == null && sort == null && status == null) {
                        return Map.of("ok", false, "reason", "没说要改什么。先问用户要改名、调顺序，还是停用");
                    }
                    Result<MaterialCategoryView> res = materialService.updateCategory(cl.category.getId(), name, sort, status);
                    if (bad(res)) return failed(res);
                    MaterialCategoryView c = res.getData();
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("categoryId", c == null ? cl.category.getId() : c.getId());
                    out.put("name", c == null ? "" : str(c.getName()));
                    out.put("enabled", c == null || c.getStatus() == null || c.getStatus() == 1);
                    out.put("note", "确认已收到并已生效。");
                    return out;
                }, null, a -> "改分类「" + categoryLabel(a) + "」" + changes(a, "name", "名称", "sortOrder", "排序", "enabled", "启用/停用"));
    }

    private AiTool deleteCategory() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "category": { "type": "string", "description": "要删除的分类（名称或 id）" }
                  },
                  "required": ["category"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "deleteMaterialCategory",
                "删除一个物品分类。**注意：服务端不检查这个分类下还有没有物品** —— "
                        + "删了之后那些物品会指向一个不存在的分类。所以先查一次、把「里面有几件物品」如实告诉用户，"
                        + "让他确认之后再调本工具。",
                schema, CAP_MATERIAL_MANAGE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    CatLookup cl = resolveCategory(text(args, "category"));
                    if (cl.error != null) return cl.error;
                    Result<?> res = materialService.deleteCategory(cl.category.getId());
                    if (bad(res)) return failed(res);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("categoryId", cl.category.getId());
                    out.put("name", str(cl.category.getName()));
                    out.put("note", "确认已收到并已生效：分类已删除。"
                            + (cl.itemCount > 0 ? "**这个分类当时下有 " + cl.itemCount + " 件物品**，"
                            + "它们的分类现在指向一个已删除的分类 —— 跟用户说一声，让他决定要不要把这些物品挪到别的分类。" : ""));
                    return out;
                }, null, a -> "删除分类「" + categoryLabel(a) + "」");
    }

    // ── 写：物品 ──

    private AiTool createItem() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "category": { "type": "string", "description": "归到哪个分类（名称或 id）" },
                    "name": { "type": "string", "description": "物品名" },
                    "subtitle": { "type": "string", "description": "副标题/规格说明文字（可选）" },
                    "stockMode": { "type": "string", "enum": ["QUANTIFIED","FLAG"], "description": "QUANTIFIED=按件计数（默认）；FLAG=只管有/无，数量只能 0 或 1" },
                    "workflow": { "type": "string", "enum": ["SIMPLE","DUAL_REVIEW","SKIP_REVIEW"], "description": "审核流程：SIMPLE 简单 / DUAL_REVIEW 复核（要复审人）/ SKIP_REVIEW 免审（不需要审核人）" },
                    "reviewers": { "type": "array", "items": { "type": "string" }, "description": "审核人（姓名，或 listMaterialReviewerCandidates 给的候选值）。**免审不用传**；其余流程至少一名" },
                    "secondReviewers": { "type": "array", "items": { "type": "string" }, "description": "复审人（复核流程才要，至少一名）" },
                    "shelfStatus": { "type": "string", "enum": ["DRAFT","PUBLISHED","ARCHIVED"], "description": "上架状态，默认 DRAFT 草稿" },
                    "initialQty": { "type": "integer", "description": "初始库存（新建时才有意义），默认 0" },
                    "showStockQty": { "type": "boolean", "description": "是否在学生端显示剩余数量，默认 true" },
                    "independentOrder": { "type": "boolean", "description": "这件物品是否必须单独成单，默认 false" },
                    "notifyAdvanceHours": { "type": "integer", "description": "预约提前通知小时数，0=立即通知，默认 0" }
                  },
                  "required": ["category", "name"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "createMaterialItem",
                "上架一件新物品。**新建要先问齐：分类、名称、审核流程、审核人**（免审流程不用审核人，"
                        + "复核流程还要复审人）——问不齐就别提交，服务端会直接拒。"
                        + "**规格与封面图本包不设**，要的话请用户到页面上配。",
                schema, CAP_MATERIAL_MANAGE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    CatLookup cl = resolveCategory(text(args, "category"));
                    if (cl.error != null) return cl.error;
                    String name = text(args, "name");
                    if (name.isEmpty()) return Map.of("ok", false, "reason", "没说物品名。先问用户要叫什么");

                    MaterialItemUpsertReq req = new MaterialItemUpsertReq();
                    req.setCategoryId(cl.category.getId());
                    req.setName(name);
                    String sub = text(args, "subtitle");
                    if (!sub.isEmpty()) req.setSubtitle(sub);
                    if (invalidEnum(args, "stockMode", STOCK_MODES)) return enumRejected("stockMode", STOCK_MODES);
                    String mode = enumArg(args, "stockMode", STOCK_MODES);
                    if (mode == null) mode = "QUANTIFIED";   // 页面新建时也是默认按件计数
                    req.setStockMode(mode);
                    if (invalidEnum(args, "workflow", WORKFLOWS)) return enumRejected("workflow", WORKFLOWS);
                    String workflow = enumArg(args, "workflow", WORKFLOWS);
                    req.setWorkflowType(workflow == null ? "SIMPLE" : workflow);
                    if (invalidEnum(args, "shelfStatus", SHELF)) return enumRejected("shelfStatus", SHELF);
                    String shelf = enumArg(args, "shelfStatus", SHELF);
                    if (shelf != null) req.setShelfStatus(shelf);

                    RevLookup rev = resolveReviewers(ctx.actor(), args, req.getWorkflowType());
                    if (rev.error != null) return rev.error;
                    req.setReviewerIds(rev.first);
                    req.setSecondReviewerIds(rev.second);

                    int qty = Math.max(0, args.path("initialQty").asInt(0));
                    // FLAG 模式只管有/无 —— 页面上也是这么折算的（>0 记 1）
                    req.setStockQty("FLAG".equals(mode) ? (qty > 0 ? 1 : 0) : qty);
                    if (args.path("showStockQty").isBoolean()) req.setShowStockQty(args.path("showStockQty").asBoolean() ? 1 : 0);
                    if (args.path("independentOrder").isBoolean()) req.setIndependentOrder(args.path("independentOrder").asBoolean() ? 1 : 0);
                    if (args.path("notifyAdvanceHours").isNumber()) req.setNotifyAdvanceHours(args.path("notifyAdvanceHours").asInt());

                    Result<MaterialItemView> res = materialService.createItem(req);
                    if (bad(res)) return failed(res);
                    return createdOut(res.getData(), "物品已新建。");
                }, null, this::createItemDetail);
    }

    private AiTool updateItem() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "item": { "type": "string", "description": "要改哪件物品（名称或 id）" },
                    "category": { "type": "string", "description": "改到哪个分类（不改就不传）" },
                    "name": { "type": "string", "description": "改名（不改就不传）" },
                    "subtitle": { "type": "string", "description": "改副标题（不改就不传）" },
                    "stockMode": { "type": "string", "enum": ["QUANTIFIED","FLAG"], "description": "改库存模式（不改就不传）" },
                    "workflow": { "type": "string", "enum": ["SIMPLE","DUAL_REVIEW","SKIP_REVIEW"], "description": "改审核流程（不改就不传）" },
                    "reviewers": { "type": "array", "items": { "type": "string" }, "description": "改成这些审核人（不改就不传；传空数组=清空审核人，仅免审流程可清）" },
                    "secondReviewers": { "type": "array", "items": { "type": "string" }, "description": "改成这些复审人（不改就不传）" },
                    "shelfStatus": { "type": "string", "enum": ["DRAFT","PUBLISHED","ARCHIVED"], "description": "改上架状态（不改就不传）" },
                    "showStockQty": { "type": "boolean", "description": "改是否显示剩余数量（不改就不传）" },
                    "independentOrder": { "type": "boolean", "description": "改是否必须单独成单（不改就不传）" },
                    "notifyAdvanceHours": { "type": "integer", "description": "改预约提前通知小时数（不改就不传）" }
                  },
                  "required": ["item"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "updateMaterialItem",
                "改一件已有物品（改名 / 换分类 / 上架下架 / 改审核流程与审核人等）。"
                        + "**只改用户说到的那几项，没说的一律不动**。**改库存不在这里** —— "
                        + "那是 inboundMaterialItem（增量）或 adjustMaterialStock（改成绝对值）。"
                        + "**规格与封面图本包不设**。",
                schema, CAP_MATERIAL_MANAGE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    ItemLookup il = resolveItem(text(args, "item"));
                    if (il.error != null) return il.error;

                    MaterialItemUpsertReq req = new MaterialItemUpsertReq();
                    if (args.path("category").isTextual() && !text(args, "category").isEmpty()) {
                        CatLookup cl = resolveCategory(text(args, "category"));
                        if (cl.error != null) return cl.error;
                        req.setCategoryId(cl.category.getId());
                    }
                    setIfText(args, "name", req::setName);
                    setIfText(args, "subtitle", req::setSubtitle);
                    if (invalidEnum(args, "stockMode", STOCK_MODES)) return enumRejected("stockMode", STOCK_MODES);
                    String mode = enumArg(args, "stockMode", STOCK_MODES);
                    if (mode != null) req.setStockMode(mode);
                    if (invalidEnum(args, "workflow", WORKFLOWS)) return enumRejected("workflow", WORKFLOWS);
                    String workflow = enumArg(args, "workflow", WORKFLOWS);
                    if (workflow != null) req.setWorkflowType(workflow);
                    if (invalidEnum(args, "shelfStatus", SHELF)) return enumRejected("shelfStatus", SHELF);
                    String shelf = enumArg(args, "shelfStatus", SHELF);
                    if (shelf != null) req.setShelfStatus(shelf);

                    // 审核人：没提就不传（服务端保留原值）；提了（含空数组）就按流程校验后落值
                    String effectiveWorkflow = workflow != null ? workflow : str(il.item.getWorkflowType());
                    if (args.path("reviewers").isArray() || args.path("secondReviewers").isArray()) {
                        RevLookup rev = resolveReviewers(ctx.actor(), args, effectiveWorkflow);
                        if (rev.error != null) return rev.error;
                        req.setReviewerIds(rev.first);
                        req.setSecondReviewerIds(rev.second);
                    }
                    if (args.path("showStockQty").isBoolean()) req.setShowStockQty(args.path("showStockQty").asBoolean() ? 1 : 0);
                    if (args.path("independentOrder").isBoolean()) req.setIndependentOrder(args.path("independentOrder").asBoolean() ? 1 : 0);
                    if (args.path("notifyAdvanceHours").isNumber()) req.setNotifyAdvanceHours(args.path("notifyAdvanceHours").asInt());

                    Result<MaterialItemView> res = materialService.updateItem(il.item.getId(), req);
                    if (bad(res)) return failed(res);
                    return createdOut(res.getData(), "物品已更新（下面是**回读**到的真实结果）。");
                }, null, this::updateItemDetail);
    }

    private AiTool deleteItem() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "item": { "type": "string", "description": "要删除的物品（名称或 id）" }
                  },
                  "required": ["item"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "deleteMaterialItem",
                "删除一件物品。这是**软删**：进回收站，之后还能恢复。"
                        + "（彻底删除不可逆，本包不提供 —— 那要去物品管理页的回收站做。）",
                schema, CAP_MATERIAL_MANAGE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    ItemLookup il = resolveItem(text(args, "item"));
                    if (il.error != null) return il.error;
                    Result<?> res = materialService.softDeleteItem(ctx.actor(), il.item.getId());
                    if (bad(res)) return failed(res);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("itemId", il.item.getId());
                    out.put("name", str(il.item.getName()));
                    out.put("note", "确认已收到并已生效：「" + str(il.item.getName())
                            + "」已删除并进了回收站，需要的话可以恢复。");
                    return out;
                }, null, a -> "删除物品「" + itemLabel(text(a, "item")) + "」（进回收站，可恢复）");
    }

    // ── 写：库存 ──

    private AiTool inboundItem() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "items": {
                      "type": "array",
                      "description": "要入库的物品，每项 {item, qty}。**用户一次报多件就都放进来**（上限 10 件），别拆成好几次调用",
                      "items": {
                        "type": "object",
                        "properties": {
                          "item": { "type": "string", "description": "物品名或 id" },
                          "qty": { "type": "integer", "description": "这件**再进多少**（增量，正数）" }
                        },
                        "required": ["item", "qty"]
                      }
                    }
                  },
                  "required": ["items"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "inboundMaterialItem",
                "给一件或多件物品**入库（增量）**：在现有数量上再进 N 件。"
                        + "用户说「再进 20 件」「到了一批，A 进 5、B 进 10」时用它；**一次最多 10 件**，"
                        + "一道确认会把这一批逐件列出来。"
                        + "**要把库存改成某个固定数（不管现在是几）用 adjustMaterialStock，不是这个**。"
                        + "另：入库会把**草稿**状态的物品自动变成**已上架**。",
                schema, CAP_MATERIAL_MANAGE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> doInbound(ctx.actor(), args),
                null,
                this::batchInboundDetail);
    }

    /**
     * 批量入库。**先把每一件都解析完再动手写** —— 中途有一件解析不了（重名、查无此物）就整体不办，
     * 免得「前半批进了、后半批没进」这种谁也说不清的状态。
     *
     * <p>真正写的时候仍逐件调服务（每笔一条库存流水），失败的那一件会把**已经写成功的那几件如实报出来**。
     */
    private Object doInbound(User actor, JsonNode args) {
        JsonNode arr = args.path("items");
        if (!arr.isArray() || arr.isEmpty()) {
            return Map.of("ok", false, "reason", "没说要给哪些物品入库、各进多少。先问用户（一件也行）");
        }
        if (arr.size() > MAX_BATCH_ITEMS) {
            return Map.of("ok", false, "reason", "一次最多 " + MAX_BATCH_ITEMS + " 件（这次报了 " + arr.size()
                    + " 件）。请用户分两批，或先挑最要紧的几件");
        }
        List<MaterialItemView> all = orEmpty(materialService.listItemsForAdmin(null, null));
        List<MaterialItemView> targets = new ArrayList<>();
        List<Integer> qtys = new ArrayList<>();
        for (JsonNode n : arr) {
            String want = n.path("item").asText("").trim();
            int qty = n.path("qty").asInt(0);
            if (want.isEmpty()) {
                return Map.of("ok", false, "reason", "有一项没说清是哪件物品。先问用户");
            }
            if (qty <= 0) {
                return Map.of("ok", false, "reason", "「" + want + "」没给数量（或不是正数）。"
                        + "**别自己替他定**，先问用户这件要进多少");
            }
            ItemLookup il = resolveItem(want, all);
            if (il.error != null) {
                return il.error;
            }
            for (MaterialItemView t : targets) {
                if (t.getId().equals(il.item.getId())) {
                    return Map.of("ok", false, "reason", "「" + str(il.item.getName()) + "」在这次里出现了两次。"
                            + "同一件物品只报一个数量（要么合并成一笔），否则最后进了多少谁也说不清");
                }
            }
            targets.add(il.item);
            qtys.add(qty);
        }
        List<String> lines = new ArrayList<>();
        boolean autoPublished = false;
        for (int i = 0; i < targets.size(); i++) {
            MaterialItemView t = targets.get(i);
            InboundMaterialReq req = new InboundMaterialReq();
            req.setItemId(t.getId());
            req.setQty(qtys.get(i));
            Result<?> res = materialService.inbound(actor, req);
            if (bad(res)) {
                String done = lines.isEmpty() ? "这一批一件都没进成。" : "已经进成的是：" + String.join("；", lines) + "。";
                return Map.of("ok", false, "reason", done + "「" + str(t.getName()) + "」这件没成："
                        + (res == null || res.getMessage() == null ? "未知" : res.getMessage()));
            }
            MaterialItemView after = readItem(t.getId());
            lines.add(str(t.getName()) + " +" + qtys.get(i) + " → 现有 "
                    + (after == null ? "?" : String.valueOf(after.getStockQty())));
            if (after != null && "PUBLISHED".equals(after.getShelfStatus())
                    && !"PUBLISHED".equals(str(t.getShelfStatus()))) {
                autoPublished = true;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("lines", lines);
        out.put("note", "确认已收到并已生效（下面是**回读**到的真实库存）：" + String.join("；", lines) + "。"
                + (autoPublished ? "其中原本是草稿的物品，入库后已自动转为**已上架**。" : ""));
        return out;
    }

    /** 确认弹窗：把这一批逐件列出来（哪件、进多少），别让人对着一串参数点确认。 */
    private String batchInboundDetail(JsonNode args) {
        JsonNode arr = args.path("items");
        if (arr == null || !arr.isArray() || arr.isEmpty()) {
            return "入库";
        }
        List<String> parts = new ArrayList<>();
        for (JsonNode n : arr) {
            parts.add(itemLabel(n.path("item").asText("")) + " +" + n.path("qty").asInt(0));
        }
        return "给 " + parts.size() + " 件物品入库：" + String.join("、", parts);
    }

    private AiTool adjustStock() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "item": { "type": "string", "description": "哪件物品（名称或 id）" },
                    "newQty": { "type": "integer", "description": "**把库存改成这个数**（绝对值，不是增量）" }
                  },
                  "required": ["item", "newQty"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "adjustMaterialStock",
                "**库存纠偏**：把某件物品的库存**直接改成**一个数（不管现在是几），用于盘点对不上时纠偏。"
                        + "用户说「库存改成 20」「实际只有 15，改一下」时用它。"
                        + "**要「再进 N 件」用 inboundMaterialItem，不是这个** —— 那是增量。",
                schema, CAP_MATERIAL_MANAGE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    ItemLookup il = resolveItem(text(args, "item"));
                    if (il.error != null) return il.error;
                    if (!args.path("newQty").isNumber()) {
                        return Map.of("ok", false, "reason", "没给目标库存数。先问用户要改成多少");
                    }
                    int newQty = Math.max(0, args.path("newQty").asInt(0));
                    Result<?> res = materialService.adjustStock(ctx.actor(), il.item.getId(), newQty);
                    if (bad(res)) return failed(res);
                    MaterialItemView after = readItem(il.item.getId());
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("itemId", il.item.getId());
                    out.put("name", after == null ? str(il.item.getName()) : str(after.getName()));
                    out.put("stockQty", after == null ? newQty : after.getStockQty());
                    out.put("note", "确认已收到并已生效：库存已改为 "
                            + (after == null ? String.valueOf(newQty) : String.valueOf(after.getStockQty()))
                            + "（回读值）。这次记的是一笔「库存纠偏」流水。");
                    return out;
                }, null, a -> "把「" + itemLabel(text(a, "item")) + "」的库存改成 " + a.path("newQty").asInt(0) + "（绝对值，不是增量）");
    }

    private AiTool restoreItem() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "item": { "type": "string", "description": "要恢复的物品（名称或 id，在回收站里找）" }
                  },
                  "required": ["item"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "restoreMaterialItem",
                "把回收站里的一件物品**恢复**回来。先用 listMaterialItemRecycle 确认是哪一件。",
                schema, CAP_MATERIAL_MANAGE, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    String want = text(args, "item");
                    if (want.isEmpty()) return Map.of("ok", false, "reason", "没说要恢复哪件物品");
                    Long id = longOrNull(want);
                    if (id == null) {
                        List<Map<String, Object>> hits = recycleByName(want);
                        if (hits.isEmpty()) {
                            return Map.of("ok", false, "reason", "回收站里没有叫「" + want + "」的物品，"
                                    + "先用 listMaterialItemRecycle 看一眼");
                        }
                        if (hits.size() > 1) {
                            Map<String, Object> out = new LinkedHashMap<>();
                            out.put("ok", false);
                            out.put("reason", "回收站里有 " + hits.size() + " 件对得上，让用户确认是哪一件，不要自己选");
                            if (hits.size() <= CHIP_MAX) {
                                out.put("choices", choicesOf(hits));
                                out.put("choicesTitle", "恢复哪一件？");
                            }
                            return out;
                        }
                        id = ((Number) hits.get(0).get("itemId")).longValue();
                    }
                    Result<?> res = materialService.restoreItem(id);
                    if (bad(res)) return failed(res);
                    MaterialItemView after = readItem(id);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("itemId", id);
                    out.put("name", after == null ? "" : str(after.getName()));
                    out.put("shelfStatus", after == null ? null : str(after.getShelfStatus()));
                    out.put("note", "确认已收到并已生效：物品已从回收站恢复"
                            + (after != null && !"PUBLISHED".equals(after.getShelfStatus())
                            ? "（注意它现在还是**" + shelfZh(str(after.getShelfStatus())) + "**，学生端看不到）" : "") + "。");
                    return out;
                }, null, a -> "从回收站恢复「" + itemLabel(text(a, "item")) + "」");
    }

    // ── 解析与杂项 ──

    /** 分类解析结果；error 非空表示要给模型的业务拒绝。 */
    private record CatLookup(MaterialCategoryView category, int itemCount, Map<String, Object> error) {
    }

    private CatLookup resolveCategory(String want) {
        if (want == null || want.isBlank()) {
            return new CatLookup(null, 0, Map.of("ok", false, "reason", "没说哪个分类。先问用户（可用 listMaterialCategories 列出来）"));
        }
        List<MaterialCategoryView> all = orEmpty(materialService.listCategoriesForAdmin(null));
        List<MaterialCategoryView> hits = new ArrayList<>();
        for (MaterialCategoryView c : all) {
            if (c == null) continue;
            if (want.equalsIgnoreCase(str(c.getName())) || want.equals(String.valueOf(c.getId()))) {
                hits.add(c);
            }
        }
        if (hits.isEmpty()) {
            for (MaterialCategoryView c : all) {
                if (c != null && contains(c.getName(), want)) hits.add(c);
            }
        }
        if (hits.isEmpty()) {
            return new CatLookup(null, 0, Map.of("ok", false,
                    "reason", "没有叫「" + want + "」的分类，先用 listMaterialCategories 看准确名字"));
        }
        if (hits.size() > 1) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", false);
            out.put("reason", "「" + want + "」命中多个分类，让用户确认是哪一个，不要自己选");
            List<Map<String, Object>> cands = new ArrayList<>();
            for (MaterialCategoryView c : hits) {
                cands.add(Map.of("categoryId", c.getId(), "name", str(c.getName())));
            }
            out.put("candidates", cands);
            if (cands.size() <= CHIP_MAX) {
                List<Map<String, Object>> chips = new ArrayList<>();
                for (MaterialCategoryView c : hits) {
                    chips.add(option(str(c.getName()), str(c.getName())));
                }
                out.put("choices", chips);
                out.put("choicesTitle", "哪个分类？");
            }
            return new CatLookup(null, 0, out);
        }
        MaterialCategoryView c = hits.get(0);
        int count = 0;
        for (MaterialItemView it : orEmpty(materialService.listItemsForAdmin(c.getId(), null))) {
            if (it != null) count++;
        }
        return new CatLookup(c, count, null);
    }

    /** 物品解析结果。 */
    private record ItemLookup(MaterialItemView item, Map<String, Object> error) {
    }

    /**
     * 物品名（或 id）→ 在架物品。
     *
     * <p>重名一律**交回候选**让用户挑：改错/删错物品是要人工收拾的。
     */
    private ItemLookup resolveItem(String want) {
        return resolveItem(want, orEmpty(materialService.listItemsForAdmin(null, null)));
    }

    /** 同上，但允许调用方把物品清单先取一次传进来（批量场景别一件一次全表读）。 */
    private ItemLookup resolveItem(String want, List<MaterialItemView> all) {
        if (want == null || want.isBlank()) {
            return new ItemLookup(null, Map.of("ok", false, "reason", "没说哪件物品。先问用户（可用 listMaterialItems 查）"));
        }
        List<MaterialItemView> exact = new ArrayList<>();
        List<MaterialItemView> fuzzy = new ArrayList<>();
        for (MaterialItemView it : all) {
            if (it == null) continue;
            String name = str(it.getName());
            if (want.equalsIgnoreCase(name) || want.equals(String.valueOf(it.getId()))) {
                exact.add(it);
            } else if (contains(name, want)) {
                fuzzy.add(it);
            }
        }
        List<MaterialItemView> hits = exact.isEmpty() ? fuzzy : exact;
        if (hits.size() == 1) {
            return new ItemLookup(hits.get(0), null);
        }
        if (hits.isEmpty()) {
            return new ItemLookup(null, Map.of("ok", false,
                    "reason", "没有叫「" + want + "」的物品，先用 listMaterialItems 查准确的名字"));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "「" + want + "」命中多件，让用户确认是哪一件，不要自己选");
        List<Map<String, Object>> cands = new ArrayList<>();
        for (MaterialItemView it : hits) {
            cands.add(describeItem(it));
        }
        out.put("candidates", cands);
        if (cands.size() <= CHIP_MAX) {
            List<Map<String, Object>> chips = new ArrayList<>();
            for (MaterialItemView it : hits) {
                chips.add(option(str(it.getName()), str(it.getId())));
            }
            out.put("choices", chips);
            out.put("choicesTitle", "哪一件物品？");
        }
        return new ItemLookup(null, out);
    }

    /** 审核人解析结果（first/second 是 JSON 数组字符串，与页面同格式）。 */
    private record RevLookup(String first, String second, Map<String, Object> error) {
    }

    /**
     * 审核人：**只收姓名或候选值**，落库前统一翻成 JSON 数组字符串（页面就是这么传的）。
     *
     * <p>流程与人数一起校：免审不要审核人；其余流程至少一名；复核流程还要复审人。
     * 不齐就**不提交**，把缺的那件交回让模型问 —— 服务端也会拒，但那一步用户已经等了一轮。
     */
    private RevLookup resolveReviewers(User actor, JsonNode args, String workflow) {
        String wf = workflow == null || workflow.isBlank() ? "SIMPLE" : workflow;
        boolean needFirst = !"SKIP_REVIEW".equals(wf);
        boolean needSecond = "DUAL_REVIEW".equals(wf);

        List<String> firstWants = strList(args.path("reviewers"));
        List<String> secondWants = strList(args.path("secondReviewers"));
        boolean firstGiven = args.path("reviewers").isArray();
        boolean secondGiven = args.path("secondReviewers").isArray();

        if (needFirst && firstWants.isEmpty() && !firstGiven) {
            return new RevLookup(null, null, Map.of("ok", false,
                    "reason", "这个流程（" + workflowZh(wf) + "）**必须有审核人**。先问用户要谁审，"
                            + "不知道有哪些人就用 listMaterialReviewerCandidates"));
        }
        if (needFirst && firstWants.isEmpty()) {
            return new RevLookup(null, null, Map.of("ok", false,
                    "reason", "审核人不能是空的（只有免审流程可以不要审核人）。问用户要谁"));
        }
        if (needSecond && secondWants.isEmpty() && !secondGiven) {
            return new RevLookup(null, null, Map.of("ok", false,
                    "reason", "复核流程还要**复审人**。先问用户要谁复审"));
        }
        if (needSecond && secondWants.isEmpty()) {
            return new RevLookup(null, null, Map.of("ok", false, "reason", "复核流程的复审人不能是空的。问用户要谁"));
        }
        PeopleLookup pl1 = resolvePeople(firstWants);
        if (pl1.error() != null) return new RevLookup(null, null, pl1.error());
        PeopleLookup pl2 = resolvePeople(secondWants);
        if (pl2.error() != null) return new RevLookup(null, null, pl2.error());

        String first = needFirst || firstGiven ? toJsonArray(pl1.ids()) : null;
        String second = needSecond ? toJsonArray(pl2.ids()) : (secondGiven ? "[]" : null);
        return new RevLookup(first, second, null);
    }

    /** 逐个把人名（或候选值）换成 id；命中 0 或多人都把候选交回，不猜。 */
    private record PeopleLookup(List<String> ids, Map<String, Object> error) {
    }

    private PeopleLookup resolvePeople(List<String> wants) {
        if (wants.isEmpty()) {
            return new PeopleLookup(List.of(), null);
        }
        List<Map<String, Object>> eligible = safe(materialService.listEligibleReviewers());
        List<String> ids = new ArrayList<>();
        for (String want : wants) {
            boolean byId = false;
            for (Map<String, Object> u : eligible) {
                if (want.equals(str(u.get("id")))) {
                    byId = true;
                    break;
                }
            }
            if (byId) {
                if (!ids.contains(want)) ids.add(want);
                continue;
            }
            List<Map<String, Object>> exact = new ArrayList<>();
            List<Map<String, Object>> fuzzy = new ArrayList<>();
            for (Map<String, Object> u : eligible) {
                String name = firstStr(u, "displayName", "displayNickname", "username");
                if (want.equalsIgnoreCase(name)) exact.add(u);
                else if (contains(name, want)) fuzzy.add(u);
            }
            List<Map<String, Object>> hits = exact.isEmpty() ? fuzzy : exact;
            if (hits.size() == 1) {
                String id = str(hits.get(0).get("id"));
                if (!id.isEmpty() && !ids.contains(id)) ids.add(id);
                continue;
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", false);
            if (hits.isEmpty()) {
                out.put("reason", "审核人名单里没有「" + want + "」（只收 STAFF 及以上的已启用账号）。"
                        + "用 listMaterialReviewerCandidates 列一下，或换个写法再试");
            } else {
                out.put("reason", "「" + want + "」在审核人名单里命中多人，让用户点一个，不要自己选");
                List<Map<String, Object>> chips = new ArrayList<>();
                for (Map<String, Object> u : hits.size() > CHIP_MAX ? hits.subList(0, CHIP_MAX) : hits) {
                    chips.add(option(firstStr(u, "displayName", "displayNickname", "username"), str(u.get("id"))));
                }
                out.put("choices", chips);
                out.put("choicesTitle", "哪位审核人？");
            }
            return new PeopleLookup(null, out);
        }
        return new PeopleLookup(ids, null);
    }

    private List<Map<String, Object>> recycleByName(String want) {
        List<Map<String, Object>> out = new ArrayList<>();
        Result<Map<String, Object>> res = materialService.listItemRecycle(1, MAX_ROWS);
        Object raw = res == null || res.getData() == null ? null : res.getData().get("data");
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof MaterialItem it && contains(it.getName(), want)) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("itemId", it.getId());
                    Map<String, Object> chip = new LinkedHashMap<>();
                    chip.put("label", str(it.getName()) + "（" + str(it.getDeletedTime()) + " 删除）");
                    chip.put("value", String.valueOf(it.getId()));
                    row.put("name", str(it.getName()));
                    row.put("label", chip.get("label"));
                    row.put("value", chip.get("value"));
                    out.add(row);
                }
            }
        }
        return out;
    }

    private MaterialItemView readItem(Long id) {
        Result<MaterialItemView> res = materialService.getItem(id);
        return res == null || res.getData() == null ? null : res.getData();
    }

    private Map<String, Object> createdOut(MaterialItemView v, String note) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        if (v != null) {
            out.putAll(describeItem(v));
        }
        out.put("note", "确认已收到并已生效：" + note);
        return out;
    }

    private static Map<String, Object> describeItem(MaterialItemView it) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("itemId", it.getId());
        row.put("name", str(it.getName()));
        row.put("subtitle", str(it.getSubtitle()));
        row.put("categoryId", it.getCategoryId());
        row.put("categoryName", str(it.getCategoryName()));
        int stock = it.getStockQty() == null ? 0 : it.getStockQty();
        int locked = it.getLockedQty() == null ? 0 : it.getLockedQty();
        row.put("stockQty", stock);
        row.put("lockedQty", locked);
        // 可用 = 现有 − 已被待处理申领单锁定；只报现有会让用户以为还能领（与 supplies 包同口径）。
        // **锁定量为负是脏数据**（2026-10-09 真机在 material_item 上撞到 4 件）：
        // 那时「现有 − 锁定」会算出比现有还大的数，看着像我这边算错了 —— 所以按现有封顶并显式标出来，
        // 原始 lockedQty 照报不误（存原始，别把异常藏起来）。
        boolean lockedAnomaly = locked < 0;
        row.put("availableQty", lockedAnomaly ? stock : Math.max(0, stock - locked));
        if (lockedAnomaly) {
            row.put("dataWarning", "该物品的锁定量是负数（" + locked + "），属脏数据；"
                    + "可用量已按现有封顶。需要的话提醒用户核一下这件物品的待处理单");
        }
        row.put("shelfStatus", str(it.getShelfStatus()));
        row.put("shelfStatusZh", shelfZh(str(it.getShelfStatus())));
        row.put("stockMode", str(it.getStockMode()));
        row.put("workflowType", str(it.getWorkflowType()));
        row.put("reviewerIds", str(it.getReviewerIds()));
        row.put("secondReviewerIds", str(it.getSecondReviewerIds()));
        row.put("showStockQty", it.getShowStockQty() == null || it.getShowStockQty() == 1);
        row.put("specRequired", it.getSpecRequired() != null && it.getSpecRequired() == 1);
        row.put("independentOrder", it.getIndependentOrder() != null && it.getIndependentOrder() == 1);
        row.put("notifyAdvanceHours", it.getNotifyAdvanceHours());
        return row;
    }

    // ── 小工具 ──

    // ── 确认弹窗的「本次…」：把内部 id / 原始 JSON 翻成人话 ──
    //
    // 模型给的是物品名或 id、审核人是姓名数组 —— 让人对着一串内部编码点「确认执行」，
    // 这道确认就退化成走形式（三签那次踩过：参数里存稳定码，确认是人在看的）。

    /** 物品 id → 名字（解析不到就原样回显，绝不因为解析失败而吞掉这一行）。 */
    private String itemLabel(String want) {
        if (want == null || want.isBlank()) {
            return "?";
        }
        Long id = longOrNull(want);
        if (id != null) {
            MaterialItemView v = readItem(id);
            if (v != null && !str(v.getName()).isEmpty()) {
                return str(v.getName());
            }
        }
        return want;
    }

    private String categoryLabel(JsonNode args) {
        String want = text(args, "category");
        if (want.isBlank()) {
            return "?";
        }
        Long id = longOrNull(want);
        if (id != null) {
            for (MaterialCategoryView c : orEmpty(materialService.listCategoriesForAdmin(null))) {
                if (c != null && id.equals(c.getId())) {
                    return str(c.getName());
                }
            }
        }
        return want;
    }

    /** 「名称 → X；排序 → Y」：只列真的传了的字段。 */
    private static String changes(JsonNode args, String... fieldLabelPairs) {
        List<String> parts = new ArrayList<>();
        for (int i = 0; i + 1 < fieldLabelPairs.length; i += 2) {
            JsonNode n = args.path(fieldLabelPairs[i]);
            if (n.isMissingNode() || n.isNull()) continue;
            String v = n.isBoolean() ? (n.asBoolean() ? "是" : "否") : n.asText("");
            if (v.isBlank()) continue;
            parts.add(fieldLabelPairs[i + 1] + " → " + v);
        }
        return parts.isEmpty() ? "" : "：" + String.join("；", parts);
    }

    private static String fieldZh(String f) {
        return switch (f) {
            case "name" -> "名称";
            case "subtitle" -> "副标题";
            case "category" -> "分类";
            case "stockMode" -> "库存模式";
            case "workflow" -> "审核流程";
            case "shelfStatus" -> "上架状态";
            case "showStockQty" -> "显示剩余数量";
            case "independentOrder" -> "独立成单";
            default -> f;
        };
    }

    /** 新建物品的确认详情。 */
    private String createItemDetail(JsonNode args) {
        List<String> parts = new ArrayList<>();
        parts.add("物品「" + text(args, "name") + "」");
        parts.add("分类「" + categoryLabel(args) + "」");
        String wf = text(args, "workflow");
        parts.add("流程 " + workflowZh(wf.isEmpty() ? "SIMPLE" : wf));
        List<String> rev = strList(args.path("reviewers"));
        if (!rev.isEmpty()) parts.add("审核人 " + String.join("、", rev));
        List<String> rev2 = strList(args.path("secondReviewers"));
        if (!rev2.isEmpty()) parts.add("复审人 " + String.join("、", rev2));
        int qty = args.path("initialQty").asInt(0);
        if (qty > 0) parts.add("初始库存 " + qty);
        return "新建 " + String.join(" · ", parts);
    }

    /** 编辑物品的确认详情：把改了什么列出来。 */
    private String updateItemDetail(JsonNode args) {
        String head = "改物品「" + itemLabel(text(args, "item")) + "」";
        List<String> parts = new ArrayList<>();
        for (String f : List.of("name", "subtitle", "stockMode", "workflow", "shelfStatus")) {
            JsonNode n = args.path(f);
            if (n.isTextual() && !n.asText("").isBlank()) parts.add(fieldZh(f) + " → " + n.asText(""));
        }
        if (args.path("category").isTextual() && !text(args, "category").isBlank()) {
            parts.add("分类 → " + categoryLabel(args));
        }
        if (args.path("reviewers").isArray()) parts.add("审核人 → " + String.join("、", strList(args.path("reviewers"))));
        if (args.path("secondReviewers").isArray()) parts.add("复审人 → " + String.join("、", strList(args.path("secondReviewers"))));
        for (String f : List.of("showStockQty", "independentOrder")) {
            if (args.path(f).isBoolean()) parts.add(fieldZh(f) + " → " + (args.path(f).asBoolean() ? "是" : "否"));
        }
        if (args.path("notifyAdvanceHours").isNumber()) {
            parts.add("预约提前通知 → " + args.path("notifyAdvanceHours").asInt() + " 小时");
        }
        return parts.isEmpty() ? head : head + "：" + String.join("；", parts);
    }

    private static List<Map<String, Object>> choicesOf(List<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Object label = r.get("label") != null ? r.get("label") : r.get("name");
            Object value = r.get("value") != null ? r.get("value") : r.get("itemId");
            if (label != null && value != null) out.add(option(String.valueOf(label), String.valueOf(value)));
        }
        return out;
    }

    private static Map<String, Object> option(String label, String value) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("label", label);
        m.put("value", value);
        return m;
    }

    private static String shelfZh(String s) {
        return switch (s == null ? "" : s) {
            case "DRAFT" -> "草稿";
            case "PUBLISHED" -> "已上架";
            case "ARCHIVED" -> "已归档";
            default -> s == null ? "" : s;
        };
    }

    private static String workflowZh(String s) {
        return switch (s == null ? "" : s) {
            case "SIMPLE" -> "简单流程";
            case "DUAL_REVIEW" -> "复核流程";
            case "SKIP_REVIEW" -> "免审流程";
            default -> s == null ? "" : s;
        };
    }

    /** 选项型参数：给了非法值返回 null（调用方要报错），没给也返回 null 并让调用方取默认。 */
    private static String enumArg(JsonNode args, String field, Set<String> allowed) {
        JsonNode n = args == null ? null : args.path(field);
        if (n == null || !n.isTextual()) return null;
        String v = n.asText("").trim().toUpperCase(java.util.Locale.ROOT);
        return allowed.contains(v) ? v : null;
    }

    /**
     * 传了但是**非法值**。
     *
     * <p>必须与「没传」分开：这些字段大多是可选的（没传就用默认 / 保持原值），
     * 把「没传」也当非法会把正常调用全拒掉（本包第一版就栽在这儿，单测逮到）。
     */
    private static boolean invalidEnum(JsonNode args, String field, Set<String> allowed) {
        JsonNode n = args == null ? null : args.path(field);
        if (n == null || !n.isTextual()) return false;
        return !allowed.contains(n.asText("").trim().toUpperCase(java.util.Locale.ROOT));
    }

    private static Map<String, Object> enumRejected(String field, Set<String> allowed) {
        return Map.of("ok", false, "reason", field + " 只能是 " + String.join(" / ", allowed) + " 之一");
    }

    private static void setIfText(JsonNode args, String field, java.util.function.Consumer<String> setter) {
        JsonNode n = args.path(field);
        if (n.isTextual() && !n.asText("").isBlank()) setter.accept(n.asText("").trim());
    }

    private static List<String> strList(JsonNode arr) {
        List<String> out = new ArrayList<>();
        if (arr != null && arr.isArray()) {
            for (JsonNode n : arr) {
                String v = n.asText("").trim();
                if (!v.isEmpty() && !out.contains(v)) out.add(v);
            }
        }
        return out;
    }

    private String toJsonArray(List<String> ids) {
        try {
            return objectMapper.writeValueAsString(new LinkedHashSet<>(ids));
        } catch (Exception e) {
            // 落库格式必须是数组字符串；拼不出来宁可让上层拒掉，也不要写一个坏值进去
            throw new IllegalStateException("审核人序列化失败", e);
        }
    }

    private static Long longOrNull(String s) {
        try {
            long v = Long.parseLong(s.trim());
            return v > 0 ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private record NodeMaybe(Long value) {
    }

    private static NodeMaybe longArg(JsonNode args, String field) {
        JsonNode n = args == null ? null : args.path(field);
        Long v = n == null ? null : longOrNull(n.asText(""));
        return new NodeMaybe(v);
    }

    /** 可选整数参数（没传/不是数 → null）。 */
    private static Integer intOrNull(JsonNode args, String field) {
        JsonNode n = args == null ? null : args.path(field);
        return n != null && n.isNumber() ? n.asInt() : null;
    }

    /** 结果行里的数字取出来（缺失按 0）。 */
    private static int num(Object o) {
        return o instanceof Number n ? n.intValue() : 0;
    }

    private static boolean bad(Result<?> r) {
        return r == null || !Boolean.TRUE.equals(r.getSuccess());
    }

    private static Map<String, Object> failed(Result<?> r) {
        return Map.of("ok", false, "reason", "没办成：" + (r == null || r.getMessage() == null ? "未知" : r.getMessage()));
    }

    private static String text(JsonNode args, String field) {
        JsonNode n = args == null ? null : args.path(field);
        return n == null || !n.isTextual() ? "" : n.asText("").trim();
    }

    private static String firstStr(Map<String, Object> row, String... keys) {
        for (String k : keys) {
            Object v = row.get(k);
            if (v != null && !String.valueOf(v).isBlank()) return String.valueOf(v).trim();
        }
        return "";
    }

    private static <T> List<T> safe(Result<List<T>> r) {
        return r == null || r.getData() == null ? List.of() : r.getData();
    }

    /** 直接返回 List 的那些服务方法（分类 / 物品列表）用这个兜空。 */
    private static <T> List<T> orEmpty(List<T> l) {
        return l == null ? List.of() : l;
    }

    private static boolean contains(String hay, String needle) {
        return hay != null && needle != null && !needle.isEmpty()
                && hay.toLowerCase(java.util.Locale.ROOT).contains(needle.toLowerCase(java.util.Locale.ROOT));
    }

    private static String str(Object o) {
        if (o == null) return "";
        String s = String.valueOf(o).trim();
        return "null".equalsIgnoreCase(s) ? "" : s;
    }

    private static int clamp(int v, int min, int max) {
        return Math.min(Math.max(v, min), max);
    }
}
