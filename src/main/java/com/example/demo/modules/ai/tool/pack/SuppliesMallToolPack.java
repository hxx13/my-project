package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.supplies.dto.CreateSupplyClaimRequest;
import com.example.demo.modules.supplies.service.SuppliesService;
import com.example.demo.modules.supplies.dto.SupplyCategoryView;
import com.example.demo.modules.supplies.dto.SupplyClaimLineView;
import com.example.demo.modules.supplies.dto.SupplyClaimOrderView;
import com.example.demo.modules.supplies.dto.SupplyApplicantConsumptionView;
import com.example.demo.modules.supplies.dto.SupplyAuditRestoredRow;
import com.example.demo.modules.supplies.dto.SupplyInventoryMovementRowView;
import com.example.demo.modules.supplies.dto.SupplyItemView;
import com.example.demo.modules.supplies.dto.SupplyItemConsumptionView;
import com.example.demo.modules.supplies.dto.SupplyMergeSubmitRequest;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.function.Predicate;

/**
 * 物资选购（{@code /#/console/admin/supplies} 商城页）的工具包。
 *
 * <p>覆盖页面上的**选购**与**查询**两件事：
 * 查分类 / 查物资 / 看购物车 / 我的领用单，以及改购物车数量、提交领用单。
 *
 * <p>三条与页面一致的口径：
 * <ul>
 *   <li><b>购物车在服务端</b>（与小程序同源）：改数量是"读→改→整体存回去"，不是本地暂存；</li>
 *   <li><b>带规格的物资不在 AI 这边办</b>：规格是几项组合，页面才有那套控件 —— 替他编规格
 *       等于下错货，所以遇到 specRequired=1 一律请他到页面上选；</li>
 *   <li><b>库存看 availableQty</b>（可用 = 现有 − 待处理领用单锁定），不是 stockQty。</li>
 * </ul>
 *
 * <p><b>下单两条路线</b>（都归到 submitSupplyClaim 这一个提交点）：
 * ① <b>直接下单</b> —— 传 {@code items}；
 * ② <b>购物车下单</b> —— 不传 {@code items}，提交当前购物车，成功后清空购物车（与页面同口径）。
 * 两条路线在**最终提交时都会先做一次合并检查**：本人已有可并入的待处理单时不直接开单，
 * 而是把「并入哪张单 / 新建」做成可点芯片问用户（见 {@code resolveMergeBeforeConfirm}）。
 *
 * <p>提交领用单是**真的开一张待处理工单**，所以侧效等级 C：服务端挂起等用户点确认。
 */
@Component
public class SuppliesMallToolPack implements AiToolPack {

    public static final String CAP_SUPPLIES_CLAIM = "ai.supplies.claim";

    /**
     * 消耗统计（读库存流水）的能力码。
     *
     * <p>单独立一个而不是复用领用能力：流水是**全局经营数据**，平台里能看它的地方（库存审计页）
     * 一直只对「管理员或领用处理端」开放。能力码跟着**数据**的口径走，不跟着页面走。
     */
    public static final String CAP_SUPPLIES_INVENTORY = "ai.supplies.inventory";

    /** 列表一次最多返回多少条 */
    private static final int MAX_LIST = 50;
    /** 一张领用单最多几行 */
    private static final int MAX_CLAIM_LINES = 10;
    /** 候选超过这个数就不给可点选项（一屏放不下） */
    private static final int CHOICE_MAX = 6;
    /** 按人找领用单时，最多扫多少条「最近的已终结单」。 */
    private static final int CLAIM_SCAN = 200;

    /** 领用单状态 → 给人看的话（与 supplies/MySuppliesRecordsPanel 同一张表）。 */
    private static final Map<String, String> CLAIM_STATUS_ZH = Map.of(
            "PENDING", "待出库", "FULFILLED", "已完成", "WITHDRAWN", "已撤回",
            "CLOSED", "已关闭", "DELETED", "已删除");

    private final SuppliesService suppliesService;
    private final CapabilityPolicyService capabilityPolicyService;

    public SuppliesMallToolPack(SuppliesService suppliesService,
                                CapabilityPolicyService capabilityPolicyService) {
        this.suppliesService = suppliesService;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    @Override
    public String packKey() {
        return "supplies";
    }

    @Override
    public String displayName() {
        return "物资选购";
    }

    @Override
    public Set<String> routeHints() {
        // L2 路由词：这些话/页面提到本域时带上本包。
        // 「下单」是用户对这个域最口语的说法（用户 2026-10-09 明确点过），必须留；
        // 「补货 / 消耗」是问「该进什么货」时的说法。
        return Set.of("商城", "选购", "加购", "购物车", "领用", "库存", "物资", "下单", "补货", "消耗");
    }

    @Override
    public String defaultPrompt() {
        return """
                物资选购的口径（商城页 /console/admin/supplies）：
                - 有什么货、还剩多少 → listSupplyItems；有哪些分类 → listSupplyCategories；
                  我之前申领过什么 → listMySupplyClaims。
                - **库存看 availableQty**（可用 = 现有 − 待处理领用单锁定量），不是 stockQty ——
                  报错数字会让用户以为还能领。
                - 购物车存在**服务端**（与小程序同一份）：加入或改数量用 setCartQuantity（传 0 就是移出），
                  它会读云端购物车改完再存回去。想看购物车里有什么用 viewSupplyCart。
                  **用户没说数量就先问他要几件** —— 别替他填 1（加购也是有数量的动作）；0 是明确的「移出」，
                  不能拿它当「没给数量」。
                - **带规格的物资（specRequired=1）不在这边办**：规格要几项组合，页面上才有那套控件。
                  遇到这类物品要如实说「这件得去页面上选规格」，不要替他编一个规格。
                - 提交领用单用 submitSupplyClaim。下单有**两条路线**：
                  ① 直接下单 —— 传 items（用户直接说「领 A、B」）；
                  ② 购物车下单 —— 先用 setCartQuantity 加购，再说「下单/结算」时
                     **不传 items**，工具会提交整个购物车并清空它。
                - 两条路线在最终提交时都会**先做一次合并检查**：用户若有可并入的待处理单，
                  工具会把「并入哪张单 / 新建」做成**可点芯片**让他选（不是让你在正文里列）。
                  **用户点完芯片后，把选中值原样放进 mergeChoices 再调一次 submitSupplyClaim**，
                  不要自己替他挑。
                - submitSupplyClaim 是**真的开一张待处理工单**，服务端会挂起等用户在界面上点确认，
                  所以正文里**不要**说「已经提交了」。
                - **「哪些快没了 / 存量不足」**：把阈值交给 listSupplyItems 的 availableBelow 去筛
                  （**别自己拿回来的那几十行去比** —— 清单是截断返回的，自己筛会漏掉没回给你的那些）。
                - **「哪些消耗得快 / 哪些该进货」**：用 querySupplyConsumption。
                  它按时间窗口统计每件物资出了多少、日均多少、当前可用量还够撑几天；
                  回答时**要说清统计区间**（如「最近 90 天」），并把「还能撑几天」照实报。
                  用户问「够不够用一周」这类，就用覆盖天数（coverDays）那一路，别自己拿日均去除。
                - **「谁领得多 / 谁最近在领」**：用 listSupplyTopConsumers（按人排行，带单人订单数、件数、
                  最近一次时间）。这是内部使用记录，**照数报、不要加评价**。
                - **「这件东西都谁领过 / 它的库存怎么变成现在这样的」**：用 listSupplyItemFlow ——
                  某一件物资的逐笔收支（谁领走的、谁处理的、什么时候、变动后剩多少），
                  还带一份「历史实发」（早期没记流水的领用，从领用单补的）。**两份别混着报。**
                  这三条读的都是**库存流水**，只有管理员/领用处理端能用 —— 没权限时如实说，别绕。
                - **用户要「下载领用单 / 把某某的领用单给我」**：用 downloadSupplyClaimForm ——
                  它会挂出一份**附件**（面板渲染成下载卡片，挂在你这句回答下面；文件名就是纸面上印的单号，
                  7 天有效，点一下就存成 PDF）。
                  用户报了**单号**就传 order（最准）；只报了**人**就传 person —— **默认只在「已完成」里找**
                  （已撤回/已关闭的下载来没意义；用户要别的状态会自己说，那就传 status）。
                  名下多张会把候选**按时间从新到旧**做成可点选项（选项上不显示单号、状态给中文）。
                  正文里只说「下载已经备好，点下面的附件」，**不要自己写链接、不要念路径**。
                - 物品名要落地：用户报的具体名字**原样**去 listSupplyItems 查，查到就直接用，
                  **别自己换成更宽的词**（用户说「胶棉拖把」，你去查「拖把」会把唯一的一件查成三件、
                  白问一轮）；只有用户自己说得含糊，才把候选交回让他挑。不要凭印象写 id。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        // 与 SuppliesController 同口径：**复用能力策略**，不自己按角色重写一遍
        // （业务标签/能力矩阵本来就该只有一个判据，两处各写一套必然分叉）
        return Map.of(
                CAP_SUPPLIES_CLAIM,
                user -> capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM) == null,
                // 消耗统计读的是**库存流水**（同库存审计页）—— 那边口径是「管理员或领用处理端」，
                // 这里调**同一个方法**，不另写一套（网关设计 §7.1）。
                CAP_SUPPLIES_INVENTORY,
                suppliesService::canAuditInventory);
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listCategories(), listItems(), viewCart(), setCartQuantity(),
                submitClaim(), listMyClaims(), queryConsumption(), topConsumers(), itemFlow(),
                downloadClaimForm());
    }

    // ── 查询 ──

    private AiTool listCategories() {
        String schema = """
                { "type": "object", "properties": {}, "additionalProperties": false }""";
        return new AiTool(
                "listSupplyCategories",
                "列出物资分类（商城页左侧那些分类）。要按分类查货时先用它拿分类名与 id。",
                schema, CAP_SUPPLIES_CLAIM, SideEffect.READ,
                (ctx, args) -> {
                    List<SupplyCategoryView> rows = suppliesService.listCategoriesForStaff();
                    List<Map<String, Object>> items = new ArrayList<>();
                    if (rows != null) {
                        for (SupplyCategoryView c : rows) {
                            if (c == null) {
                                continue;
                            }
                            Map<String, Object> it = new LinkedHashMap<>();
                            it.put("categoryId", c.getId());
                            it.put("name", c.getName());
                            items.add(it);
                        }
                    }
                    return Map.of("total", items.size(), "categories", items);
                });
    }

    private AiTool listItems() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "categoryId": { "type": "integer", "description": "只看某个分类（来自 listSupplyCategories），不传就是全部" },
                    "keyword": { "type": "string", "description": "物资名/副标题的任意片段" },
                    "availableBelow": { "type": "integer", "description": "**可用量低于**这个数的物资（回答「哪些快没了/存量不足」用它；传 1 = 断货的）。筛选由服务端做，别自己拿回来的行去比" },
                    "limit": { "type": "integer", "description": "最多返回几条，默认 20，上限 50" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listSupplyItems",
                "查商城在架的物资：名称、副标题、库存与是否要选规格。**回答「有没有某样东西/还剩多少/哪些快没了」用它**。"
                        + "「低于 N 件」这类筛选**传 availableBelow，别自己筛** —— 清单是截断返回的，自己筛会漏。"
                        + "**用户已经报了具体名字，就用那个名字查** —— 别自己拆成上位词（用户说「胶棉拖把」"
                        + "就别去查「拖把」，那样会把本来唯一的一件变成一问）。只有当用户自己说得含糊"
                        + "（「要点拖把」）时，命中多件才会交回候选让用户挑。",
                schema, CAP_SUPPLIES_CLAIM, SideEffect.READ,
                (ctx, args) -> {
                    int limit = clamp(args.path("limit").asInt(20), 1, MAX_LIST);
                    Long categoryId = args.path("categoryId").isNumber() ? args.path("categoryId").asLong() : null;
                    String kw = text(args, "keyword");
                    Integer availBelow = args.path("availableBelow").isNumber() ? args.path("availableBelow").asInt() : null;
                    List<SupplyItemView> rows = suppliesService.listItemsForStaff(ctx.actor().getId(), categoryId);
                    // 先筛出**全部**命中行，再截断 —— 顺序反了会报「没有低于 X 的」而其实后面有
                    List<Map<String, Object>> matched = new ArrayList<>();
                    if (rows != null) {
                        for (SupplyItemView item : rows) {
                            if (item == null) {
                                continue;
                            }
                            if (!kw.isEmpty() && !containsIgnoreCase(item.getName(), kw)
                                    && !containsIgnoreCase(item.getSubtitle(), kw)) {
                                continue;
                            }
                            Map<String, Object> row = describeItem(item);
                            if (availBelow != null && asInt(row.get("availableQty")) >= availBelow) {
                                continue;
                            }
                            matched.add(row);
                        }
                    }
                    boolean truncated = matched.size() > limit;
                    List<Map<String, Object>> items = truncated
                            ? new ArrayList<>(matched.subList(0, limit)) : matched;
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", items.size());
                    out.put("matchedTotal", matched.size());
                    out.put("items", items);
                    if (matched.isEmpty()) {
                        out.put("note", "没查到匹配的物资，换个关键词或去掉分类再试");
                    } else if (truncated) {
                        out.put("note", "共 " + matched.size() + " 件命中，这里只回了前 " + items.size()
                                + " 件。**要如实说「共 N 件」**，再让用户加分类/关键词收窄");
                    } else if (items.size() > 1 && items.size() <= CHOICE_MAX) {
                        // **只有真有多件时才出「挑一件」**：一条结果也问一次，用户已经指名了，
                        // 那是白加一问 —— 真机上它会把后面的合并提问挤成「第 2/2 问」，白白多一步。
                        List<Map<String, Object>> choices = new ArrayList<>();
                        for (Map<String, Object> it : items) {
                            Map<String, Object> o = new LinkedHashMap<>();
                            o.put("label", String.valueOf(it.get("name")));
                            o.put("value", String.valueOf(it.get("name")));
                            choices.add(o);
                        }
                        out.put("choices", choices);
                        out.put("choicesTitle", "挑一件");
                    }
                    return out;
                });
    }

    private AiTool viewCart() {
        String schema = """
                { "type": "object", "properties": {}, "additionalProperties": false }""";
        return new AiTool(
                "viewSupplyCart",
                "查看当前领用购物车（服务端云端购物车，与小程序同一份）。",
                schema, CAP_SUPPLIES_CLAIM, SideEffect.READ,
                (ctx, args) -> {
                    Map<String, Integer> lines = cartLines(ctx.actor());
                    List<Map<String, Object>> items = new ArrayList<>();
                    for (Map.Entry<String, Integer> e : lines.entrySet()) {
                        Map<String, Object> it = new LinkedHashMap<>();
                        it.put("cartKey", e.getKey());
                        it.put("itemId", itemIdOfKey(e.getKey()));
                        it.put("name", nameOfItem(ctx.actor(), itemIdOfKey(e.getKey())));
                        it.put("qty", e.getValue());
                        it.put("spec", specOfKey(e.getKey()));
                        items.add(it);
                    }
                    return Map.of("total", items.size(), "lines", items);
                });
    }

    private AiTool listMyClaims() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string", "description": "只看某个状态（上游状态码，如 PENDING），不传就是全部" },
                    "limit": { "type": "integer", "description": "最多返回几条，默认 10，上限 50" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listMySupplyClaims",
                "列出**我自己**提交的领用单（状态、时间、明细）。用户问「我申领过什么/到哪一步了」时用它。",
                schema, CAP_SUPPLIES_CLAIM, SideEffect.READ,
                (ctx, args) -> {
                    int limit = clamp(args.path("limit").asInt(10), 1, MAX_LIST);
                    String status = text(args, "status");
                    Map<String, Object> data = suppliesService.listMine(
                            ctx.actor(), status.isEmpty() ? null : status, 1, limit, true);
                    List<Map<String, Object>> orders = new ArrayList<>();
                    Object rowsObj = data == null ? null : data.get("data");
                    if (rowsObj instanceof List<?> rows) {
                        for (Object r : rows) {
                            if (r instanceof SupplyClaimOrderView o) {
                                orders.add(describeClaim(o));
                            }
                        }
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", data == null ? orders.size() : data.get("total"));
                    out.put("claims", orders);
                    return out;
                });
    }

    /**
     * 消耗统计：回答「哪些物资消耗得快 / 哪些该补货 / 某某还够用多久」。
     *
     * <p>数据源是**库存流水**（与库存审计页同一份）。窗口默认 90 天 —— 物资领用是低频动作，
     * 30 天的窗口经常一件都没出过，看不出趋势。
     *
     * <p>能力码 {@code ai.supplies.inventory}：流水是全局经营数据，平台里能看它的地方
     * （库存审计页）一直只对管理员/领用处理端开放，这里用**同一个判据**
     * （{@code SuppliesService#canAuditInventory}），不因为「挂在商城包下」就放宽。
     */
    private AiTool queryConsumption() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "days": { "type": "integer", "description": "统计最近多少天，默认 90，上限 365" },
                    "categoryId": { "type": "integer", "description": "只看某个分类（来自 listSupplyCategories），不传就是全部" },
                    "coverDays": { "type": "integer", "description": "「还能撑几天」的阈值，默认 7：撑不到这么多天就算该补货。用户说「够不够用一周」传 7、「半个月」传 15" },
                    "limit": { "type": "integer", "description": "最多回几件（按出库量降序），默认 15，上限 50" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "querySupplyConsumption",
                "按时间窗口统计物资**消耗**：每件出了多少、日均多少、当前可用量还够撑几天。"
                        + "回答「哪些物资消耗得快」「哪些该进货/该补货」「某某还够用多久」用它。"
                        + "**回答时说清统计区间**（如「最近 90 天」）和判定阈值；数字都在这儿，别自己算。",
                schema, CAP_SUPPLIES_INVENTORY, SideEffect.READ,
                (ctx, args) -> {
                    int days = clamp(args.path("days").asInt(90), 1, 365);
                    int limit = clamp(args.path("limit").asInt(15), 1, 50);
                    int coverDays = clamp(args.path("coverDays").asInt(7), 1, 365);
                    Long categoryId = args.path("categoryId").isNumber() ? args.path("categoryId").asLong() : null;
                    Result<List<SupplyItemConsumptionView>> res = suppliesService.getItemConsumption(categoryId, days, limit);
                    if (res == null || !Boolean.TRUE.equals(res.getSuccess())) {
                        return Map.of("ok", false, "reason", "取消耗统计失败："
                                + (res == null || res.getMessage() == null ? "未知" : res.getMessage()));
                    }
                    List<Map<String, Object>> all = new ArrayList<>();
                    List<Map<String, Object>> needRestock = new ArrayList<>();
                    List<Map<String, Object>> outOfStock = new ArrayList<>();
                    for (SupplyItemConsumptionView r : res.getData() == null
                            ? List.<SupplyItemConsumptionView>of() : res.getData()) {
                        if (r == null) continue;
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("itemId", r.getItemId());
                        row.put("name", str(r.getName()));
                        row.put("categoryName", str(r.getCategoryName()));
                        row.put("outboundQty", r.getOutboundQty());
                        row.put("inboundQty", r.getInboundQty());
                        row.put("availableQty", r.getAvailableQty());
                        row.put("dailyAvg", r.getDailyAvg());
                        row.put("coverDays", r.getCoverDays());
                        all.add(row);
                        if (r.getAvailableQty() != null && r.getAvailableQty() <= 0) {
                            outOfStock.add(row);
                        }
                        if (r.getCoverDays() != null && r.getCoverDays() < coverDays) {
                            needRestock.add(row);
                        }
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("windowDays", days);
                    out.put("coverDaysThreshold", coverDays);
                    out.put("total", all.size());
                    out.put("items", all);
                    out.put("outOfStock", outOfStock);
                    out.put("needRestock", needRestock);
                    out.put("note", "统计区间：最近 " + days + " 天（按出库量降序）。"
                            + "「该补货」的口径是**可用量撑不到 " + coverDays + " 天**（已断货的单列一档）；"
                            + "撑不了几天是按期间日均算的估计，报的时候要说清是估计。"
                            + (all.isEmpty() ? "这期间一件物资都没出过库，没有可比的消耗量 —— **讲清「没数据」，"
                            + "别把「没数据」说成「消耗都正常」**。" : ""));
                    return out;
                });
    }

    /**
     * 「谁领得多 / 谁最近在领」——按领取人汇总某个窗口的领用量。
     *
     * <p>和按物品那条是**两个问题、两种答案**，所以做成两个工具：一个答「什么消耗快」，
     * 一个答「谁领得多」。名字由服务端用同一套名字服务补齐（给用户看的是人名，不是账号 id）。
     */
    private AiTool topConsumers() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "days": { "type": "integer", "description": "统计最近多少天，默认 90，上限 365" },
                    "limit": { "type": "integer", "description": "最多回几个人，默认 10，上限 50" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listSupplyTopConsumers",
                "按**领取人**统计领用量并排行：谁领得最多、各领了几单几件、最近一次是什么时候。"
                        + "回答「谁领得多」「最近谁在领东西」「某某领了多少」用它。"
                        + "**要问「什么物资消耗快 / 该补什么货」是用 querySupplyConsumption，不是这个**。"
                        + "报的时候说清统计区间；这是内部使用记录，**按数据实报、不要加评价**。",
                schema, CAP_SUPPLIES_INVENTORY, SideEffect.READ,
                (ctx, args) -> {
                    int days = clamp(args.path("days").asInt(90), 1, 365);
                    int limit = clamp(args.path("limit").asInt(10), 1, 50);
                    Result<List<SupplyApplicantConsumptionView>> res =
                            suppliesService.getApplicantConsumption(days, limit);
                    if (res == null || !Boolean.TRUE.equals(res.getSuccess())) {
                        return Map.of("ok", false, "reason", "取领取统计失败："
                                + (res == null || res.getMessage() == null ? "未知" : res.getMessage()));
                    }
                    List<Map<String, Object>> rows = new ArrayList<>();
                    for (SupplyApplicantConsumptionView r : res.getData() == null
                            ? List.<SupplyApplicantConsumptionView>of() : res.getData()) {
                        if (r == null) continue;
                        Map<String, Object> row = new LinkedHashMap<>();
                        row.put("applicant", str(r.getApplicantName()));
                        row.put("claimCount", r.getClaimCount());
                        row.put("outboundQty", r.getOutboundQty());
                        row.put("lastAt", str(r.getLastAt()));
                        rows.add(row);
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("windowDays", days);
                    out.put("total", rows.size());
                    out.put("consumers", rows);
                    out.put("note", "统计区间：最近 " + days + " 天（按领走件数降序）。"
                            + (rows.isEmpty() ? "这期间没有任何领用记录 —— 讲清「没有记录」，别编。" : ""));
                    return out;
                });
    }

    /**
     * 某件物资的**出入库流水**：谁在什么时候领走/进了多少 —— 与库存审计页**同一个服务方法**，
     * 所以行数与页面逐条对得上。返回里还带一份「历史实发明细」（早期没记流水的领用，从领用单补出来的）。
     */
    private AiTool itemFlow() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "item": { "type": "string", "description": "哪件物资（名称或 id，来自 listSupplyItems）" },
                    "limit": { "type": "integer", "description": "最多回几条流水，默认 20，上限 50" }
                  },
                  "required": ["item"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listSupplyItemFlow",
                "查**某一件物资的出入库流水**：每次进出多少、谁领走的、谁处理的、什么时候、变动后剩多少。"
                        + "回答「这件东西都谁领过 / 上次进货是什么时候 / 它的库存怎么变成现在这样的」用它；"
                        + "返回里还有一份**历史实发明细**（早期没记流水的那批领用）。"
                        + "**要看全商城的消耗排行用 querySupplyConsumption，不是这个**。",
                schema, CAP_SUPPLIES_INVENTORY, SideEffect.READ,
                (ctx, args) -> {
                    String want = text(args, "item");
                    if (want.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说要查哪件物资。先问用户（可用 listSupplyItems 查）");
                    }
                    ItemLookup il = resolveItem(ctx.actor(), want);
                    if (il.error != null) {
                        return il.error;
                    }
                    int limit = clamp(args.path("limit").asInt(20), 1, 50);
                    Result<Map<String, Object>> res = suppliesService.listAuditInventoryMovements(
                            ctx.actor(), il.item.getId(), 1, limit);
                    if (res == null || !Boolean.TRUE.equals(res.getSuccess())) {
                        return Map.of("ok", false, "reason", "查流水失败："
                                + (res == null || res.getMessage() == null ? "未知" : res.getMessage()));
                    }
                    Map<String, Object> data = res.getData() == null ? Map.of() : res.getData();
                    List<Map<String, Object>> rows = new ArrayList<>();
                    if (data.get("data") instanceof List<?> list) {
                        for (Object o : list) {
                            if (!(o instanceof SupplyInventoryMovementRowView r)) continue;
                            Map<String, Object> row = new LinkedHashMap<>();
                            row.put("time", str(r.getCreatedAt()));
                            row.put("event", movementZh(str(r.getMovementType())));
                            row.put("qty", r.getQty());
                            row.put("stockAfter", r.getStockAfter());
                            row.put("applicant", str(r.getApplicantName()));
                            row.put("operator", str(r.getOperatorName()));
                            row.put("remark", str(r.getRemark()));
                            rows.add(row);
                        }
                    }
                    List<Map<String, Object>> restored = new ArrayList<>();
                    if (data.get("restoredData") instanceof List<?> list) {
                        for (Object o : list) {
                            if (!(o instanceof SupplyAuditRestoredRow rr)) continue;
                            Map<String, Object> row = new LinkedHashMap<>();
                            row.put("time", str(rr.getOutboundTime()));
                            row.put("claimId", str(rr.getClaimId()));
                            row.put("applicant", str(rr.getApplicantName()));
                            row.put("fulfilledBy", str(rr.getFulfilledByName()));
                            row.put("applyQty", rr.getApplyQty());
                            row.put("fulfilledQty", rr.getOutboundQty());
                            row.put("note", "历史实发（早期没记库存流水的那批，从领用单补出来的）");
                            restored.add(row);
                        }
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("itemId", il.item.getId());
                    out.put("name", str(il.item.getName()));
                    out.put("flowTotal", data.get("total"));
                    out.put("flowReturned", rows.size());
                    out.put("flow", rows);
                    out.put("restoredTotal", data.get("restoredTotal"));
                    out.put("restored", restored);
                    out.put("note", "流水只回了前 " + rows.size() + " 条（共 " + data.get("total")
                            + " 条）。**要如实说「共 N 条」**；「历史实发」是另一份数据，别和流水混着报。");
                    return out;
                });
    }

    /** 流水类型说人话（别把英文枚举甩给用户）。 */
    private static String movementZh(String type) {
        return switch (type == null ? "" : type) {
            case "INBOUND" -> "入库";
            case "OUTBOUND" -> "出库（领走）";
            case "ADJUST" -> "库存纠偏";
            default -> type == null ? "" : type;
        };
    }


    /**
     * 领用单 PDF 的**一键下载链接**（教职工领用域）。
     *
     * <p>链接由后端生成/复用一份归档件后给出，**7 天有效、点一下就能存下来**；
     * 面板那边会接管这个链接（取字节再触发下载，而不是在浏览器里开预览）。
     *
     * <p>为什么不是挂确认的写操作：它**不改业务数据**，而且第二次调用会**复用**同一份归档
     * （服务端 selectLatestValid → reused），属幂等写；用户说「下载一下」再夹一道确认很别扭。
     */
    private AiTool downloadClaimForm() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "order": { "type": "string", "description": "领用单号（用户报了单号就用它，最准）" },
                    "person": { "type": "string", "description": "领用人姓名（用户只说人时用它；命中多张会把候选交回让用户点）" },
                    "status": { "type": "string", "description": "按人找时只看某个状态：FULFILLED=已完成（**默认就是它**）/ PENDING=待出库 / WITHDRAWN=已撤回；传「全部」= 不过滤" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "downloadSupplyClaimForm",
                "生成并给出**领用单 PDF 的下载链接**（一次一条，链接 7 天有效、点一下就能存）。"
                        + "用户说「把某某的领用单给我 / 下载一下那张领用单」时用它。"
                        + "**用户报了单号就传 order**；只报了人就用 person，命中多张会把候选做成可点选项。",
                schema, CAP_SUPPLIES_CLAIM, SideEffect.IDEMPOTENT_WRITE,
                (ctx, args) -> {
                    ClaimLookup lk = resolveClaimForDownload(ctx.actor(), args);
                    if (lk.error != null) return lk.error;
                    Result<Map<String, Object>> res = suppliesService.createOrReuseClaimPdfLink(ctx.actor(), lk.claimId);
                    if (res == null || !Boolean.TRUE.equals(res.getSuccess())) {
                        return Map.of("ok", false, "reason", "没能生成下载链接："
                                + (res == null || res.getMessage() == null ? "未知" : res.getMessage()));
                    }
                    Map<String, Object> data = res.getData() == null ? Map.of() : res.getData();
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("claimId", lk.claimId);
                    out.put("fileName", str(data.get("fileName")));
                    // **给相对路径**：面板就是按这个路径接管点击的；不要自己拼域名。
                    out.put("downloadPath", str(data.get("downloadPath")));
                    out.put("expireAt", str(data.get("expireAt")));
                    // **以附件（下载卡片）的形式给**：面板会把这条挂在刚说完的助手消息下面，
                    // 用户点一下就存成 PDF。所以正文里**不要**再写链接、也不要念路径。
                    Map<String, Object> dl = new LinkedHashMap<>();
                    dl.put("kind", "supplyClaim");
                    dl.put("label", str(data.get("fileName")));
                    Map<String, Object> params = new LinkedHashMap<>();
                    params.put("claimId", lk.claimId);
                    params.put("downloadPath", str(data.get("downloadPath")));
                    dl.put("params", params);
                    out.put("download", dl);
                    out.put("note", "**附件已挂好**（面板会渲染成卡片，文件名就是纸面上印的单号），7 天有效。"
                            + "正文里只说「这张领用单的下载已经备好，点下面的附件」即可 —— "
                            + "**不要写链接、不要念路径、也不要说文件在你电脑上**。");
                    return out;
                });
    }

    /** 下载目标：优先单号；只给姓名时在「待处理 + 最近的已终结单」里按领用人找，多命中交回候选。 */
    private ClaimLookup resolveClaimForDownload(User actor, JsonNode args) {
        String order = text(args, "order");
        if (!order.isEmpty()) {
            return new ClaimLookup(order, null);
        }
        String person = text(args, "person");
        if (person.isEmpty()) {
            return new ClaimLookup(null, Map.of("ok", false, "reason",
                    "没说是哪张领用单。问用户要**单号**，或者给**领用人姓名**"));
        }
        String status = text(args, "status");
        List<SupplyClaimOrderView> all = new ArrayList<>();
        if (status.isEmpty()) {
            // **默认只看「已完成」**（2026-10-09 用户口径）：要下载的是那张成型的领用记录，
            // 已撤回/已关闭的下载来没意义。要看别的状态由用户明说，走下面的 status 分支。
            List<SupplyClaimOrderView> done = suppliesService.listRecentClosedClaims(actor, CLAIM_SCAN, "FULFILLED");
            if (done != null) all.addAll(done);
        } else if ("全部".equals(status) || "all".equalsIgnoreCase(status)) {
            List<SupplyClaimOrderView> pending = suppliesService.listPendingTasks(actor);
            if (pending != null) all.addAll(pending);
            List<SupplyClaimOrderView> closed = suppliesService.listRecentClosedClaims(actor, CLAIM_SCAN, null);
            if (closed != null) all.addAll(closed);
        } else {
            List<SupplyClaimOrderView> closed = suppliesService.listRecentClosedClaims(actor, CLAIM_SCAN, status);
            if (closed != null) all.addAll(closed);
        }

        List<SupplyClaimOrderView> hits = new ArrayList<>();
        for (SupplyClaimOrderView o : all) {
            if (o == null) continue;
            String name = str(o.getApplicantName());
            if (person.equalsIgnoreCase(name) || containsIgnoreCase(name, person)) {
                hits.add(o);
            }
        }
        if (hits.isEmpty()) {
            return new ClaimLookup(null, Map.of("ok", false, "reason",
                    "在**你能看到的范围**里没找到「" + person + "」的领用单（我要看的是待处理 + 最近的已终结单）。"
                            + "**如实说没找到**；如果用户记得单号，用单号最准"));
        }
        if (hits.size() == 1) {
            return new ClaimLookup(hits.get(0).getId(), null);
        }
        // **按时间倒序**（用户就是按时间认单子的；单号不给看）
        hits.sort((a, b) -> {
            String ta = a.getCreatedAt() == null ? "" : String.valueOf(a.getCreatedAt());
            String tb = b.getCreatedAt() == null ? "" : String.valueOf(b.getCreatedAt());
            return tb.compareTo(ta);
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "「" + person + "」名下有 " + hits.size() + " 张领用单（下面按时间从新到旧列了几张），"
                + "让用户点一张，**不要自己挑**");
        List<Map<String, Object>> chips = new ArrayList<>();
        for (SupplyClaimOrderView o : hits) {
            if (chips.size() >= CHOICE_MAX) break;
            chips.add(option(claimChipLabel(o), str(o.getId())));
        }
        out.put("choices", chips);
        out.put("choicesTitle", person + " · 下载哪一张领用单？");
        return new ClaimLookup(null, out);
    }

    /**
     * 「月-日 时:分」这种短时间戳。
     *
     * <p>**别用「按长度截」的写法**：{@code LocalDateTime} 转字符串时**秒为 0 会把秒省掉**，
     * 于是同一个字段会时而 16 位、时而 19 位，截出来的东西不稳定（单测逮到过）。
     */
    private static String shortStamp(Object createdAt) {
        if (createdAt == null) {
            return "";
        }
        String s = String.valueOf(createdAt).replace('T', ' ');
        if (s.length() > 16) {
            s = s.substring(0, 16);          // 去掉秒
        }
        return s.length() > 11 ? s.substring(5) : s;   // 去掉年份
    }

    /**
     * 候选/芯片上给人看的一行：**时间 · 中文状态 · 物品摘要**。
     *
     * <p>**不显示单号** —— 用户是按时间认单子的（2026-10-09 明确要求），
     * 一串尾号对他没有信息量；状态也给中文，别把 PENDING/FULFILLED 这种码甩出去。
     */
    private static String claimChipLabel(SupplyClaimOrderView o) {
        String when = shortStamp(o.getCreatedAt());
        List<String> names = new ArrayList<>();
        if (o.getLines() != null) {
            for (SupplyClaimLineView l : o.getLines()) {
                if (l == null) continue;
                names.add(str(l.getSnapshotName()) + " ×" + (l.getQty() == null ? 0 : l.getQty()));
                if (names.size() >= 3) { names.add("…"); break; }
            }
        }
        String status = str(o.getStatus());
        String statusZh = CLAIM_STATUS_ZH.getOrDefault(status, status);
        return when + " · " + statusZh + (names.isEmpty() ? "" : " · " + String.join("、", names));
    }

    /** 下载目标解析结果。 */
    private record ClaimLookup(String claimId, Map<String, Object> error) {
    }

    // ── 选购 ──

    private AiTool setCartQuantity() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "item": { "type": "string", "description": "物资名（先用 listSupplyItems 查准）或物资 id" },
                    "qty": { "type": "integer", "description": "要放进购物车的数量；**用户没说就先问，别自己填 1**。传 0 表示从购物车移出" }
                  },
                  "required": ["item", "qty"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "setCartQuantity",
                "把某件物资加入领用购物车，或改它的数量（传 0 移出）。购物车存在服务端，改完小程序那边也是同一份。"
                        + "**用户没给数量就先问他要几件** —— 不要自己填一个（加购也是有数量的动作）。",
                schema, CAP_SUPPLIES_CLAIM, SideEffect.IDEMPOTENT_WRITE,
                (ctx, args) -> {
                    String want = text(args, "item");
                    if (want.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说要放哪件物资");
                    }
                    // **「没给数量」≠「数量 0」**：0 是明确的「移出」指令，不传是没说完。
                    // 以前 `asInt(0)` 把两者混成一个 0 —— 模型在用户没报数量时漏传 qty，
                    // 就会被当成"移出购物车"静默执行（真机已复现模型自己编 1，更糟）。
                    JsonNode qtyNode = args.path("qty");
                    if (qtyNode.isMissingNode() || qtyNode.isNull()) {
                        return Map.of("ok", false, "reason",
                                "没给数量。**别自己替他定**，先问用户要几件，拿到数量再调一次（传 0 才是移出）");
                    }
                    int qty = qtyNode.asInt(0);
                    ItemLookup lookup = resolveItem(ctx.actor(), want);
                    if (lookup.error != null) {
                        return lookup.error;
                    }
                    SupplyItemView item = lookup.item;
                    if (isSpecRequired(item)) {
                        return Map.of("ok", false, "reason", "这件物资要先选规格（页面上才有那套控件），"
                                + "请到 /console/admin/supplies 页面上加；AI 这边替他编规格会下错货");
                    }

                    Map<String, Integer> lines = new HashMap<>(cartLines(ctx.actor()));
                    String key = String.valueOf(item.getId());
                    if (qty <= 0) {
                        lines.remove(key);
                    } else {
                        lines.put(key, Math.min(qty, 999));
                    }
                    Map<String, Object> body = new HashMap<>();
                    body.put("lines", lines);
                    Result<?> saved = suppliesService.saveShoppingCart(ctx.actor(), body);
                    if (saved == null || !Boolean.TRUE.equals(saved.getSuccess())) {
                        return Map.of("ok", false,
                                "reason", "购物车没存上：" + (saved == null ? "未知" : saved.getMessage()));
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("item", str(item.getName()));
                    out.put("qtyInCart", qty <= 0 ? 0 : Math.min(qty, 999));
                    // 可用量一起回：加购**不拦超量**（真正的强制点在下单时的库存校验），
                    // 但模型得知道剩多少，才不会把「已加购 50」报成一件没问题的事。
                    out.put("availableQty", item.getAvailableQty() != null ? item.getAvailableQty() : item.getStockQty());
                    out.put("note", qty <= 0 ? "已从购物车移出" : "已放进购物车（还没提交申领）");
                    return out;
                });
    }

    private AiTool submitClaim() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "items": {
                      "type": "array",
                      "description": "**直接下单**要发的货，每项 {item, qty, remark?}；item 是物资名或 id。**从购物车下单时整段省略**（省略 = 提交当前购物车）",
                      "items": {
                        "type": "object",
                        "properties": {
                          "item": { "type": "string" },
                          "qty": { "type": "integer" },
                          "remark": { "type": "string" }
                        },
                        "required": ["item", "qty"]
                      }
                    },
                    "mergeChoices": {
                      "type": "array",
                      "items": { "type": "string" },
                      "description": "合并提问里用户点选的值，**原样拷进来**（形如 regular=SC_xxx / indep:7=new）。没问过就不要传"
                    }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "submitSupplyClaim",
                "提交物资领用单（真的开一张待处理工单）。传 items 是直接下单；不传 items 就是提交当前购物车"
                        + "（提交成功后清空购物车）。提交前若本人有可并入的待处理单，会先把「并入哪张 / 新建」"
                        + "问成可点选项，**不要**在正文里自己念候选。"
                        + "这是写操作，服务端会挂起等用户点确认，正文里不要说「已经提交」。"
                        + "带规格的物资不在这里办（请用户到页面选规格）。",
                schema, CAP_SUPPLIES_CLAIM, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> doSubmitClaim(ctx.actor(), args),
                (ctx, args) -> resolveMergeBeforeConfirm(ctx.actor(), args),
                SuppliesMallToolPack::submitConfirmDetail);
    }

    // ── 提交：两条路线（直接下单 / 购物车下单）共用一个提交点，提交前做合并检查 ──

    /** 提交行 + 是否来自购物车（购物车路线成功后要清空）+ 解析失败时的业务拒绝。 */
    private record SubmitLines(List<CreateSupplyClaimRequest.Line> lines, boolean fromCart, Map<String, Object> error) {
        static SubmitLines fail(String reason) {
            return new SubmitLines(List.of(), false, Map.of("ok", false, "reason", reason));
        }
    }

    /**
     * 解析提交行：给了 items 走**直接下单**，没给就走**当前购物车**。
     * 失败（重名/规格/数量非法）把业务拒绝装进 {@code error}，由调用方决定是回给模型还是跳过。
     */
    private SubmitLines resolveSubmitLines(User actor, JsonNode args) {
        JsonNode arr = args.path("items");
        if (!arr.isArray() || arr.isEmpty()) {
            return new SubmitLines(cartClaimLines(actor), true, null);
        }
        if (arr.size() > MAX_CLAIM_LINES) {
            return SubmitLines.fail("一张单最多 " + MAX_CLAIM_LINES + " 行，请拆开或让用户确认");
        }
        List<CreateSupplyClaimRequest.Line> lines = new ArrayList<>();
        for (JsonNode n : arr) {
            String want = n.path("item").asText("").trim();
            int qty = n.path("qty").asInt(0);
            if (want.isEmpty()) {
                return SubmitLines.fail("没说领哪件物资。先问用户要哪一件，再调一次");
            }
            if (qty <= 0) {
                // 数量缺失/不合法时**别自己定一个**（领多领少都是真出库）——把球踢回用户
                return SubmitLines.fail("没给数量（或不是正数）。**别自己替他定**，先问用户要领几件，再调一次");
            }
            ItemLookup lookup = resolveItem(actor, want);
            if (lookup.error != null) {
                return new SubmitLines(List.of(), false, lookup.error);
            }
            if (isSpecRequired(lookup.item)) {
                return SubmitLines.fail("「" + str(lookup.item.getName()) + "」要先选规格，请到商城页面上领用");
            }
            CreateSupplyClaimRequest.Line line = new CreateSupplyClaimRequest.Line();
            line.setItemId(lookup.item.getId());
            line.setQty(qty);
            if (n.path("remark").isTextual()) {
                line.setRemark(n.path("remark").asText(""));
            }
            lines.add(line);
        }
        return new SubmitLines(lines, false, null);
    }

    /** 当前购物车 → 领用行（带规格快照）。规格是用户自己在页面上选好的，原样带上，不替他编。 */
    private List<CreateSupplyClaimRequest.Line> cartClaimLines(User actor) {
        List<CreateSupplyClaimRequest.Line> lines = new ArrayList<>();
        for (Map.Entry<String, Integer> e : cartLines(actor).entrySet()) {
            if (e.getValue() == null || e.getValue() <= 0) {
                continue;
            }
            long iid;
            try {
                iid = Long.parseLong(itemIdOfKey(e.getKey()));
            } catch (NumberFormatException ex) {
                continue;
            }
            if (iid <= 0) {
                continue;
            }
            CreateSupplyClaimRequest.Line line = new CreateSupplyClaimRequest.Line();
            line.setItemId(iid);
            line.setQty(e.getValue());
            String spec = specOfKey(e.getKey());
            if (!spec.isEmpty()) {
                line.setSpecSnapshot(spec);
            }
            lines.add(line);
        }
        return lines;
    }

    private Object doSubmitClaim(User actor, JsonNode args) {
        SubmitLines sl = resolveSubmitLines(actor, args);
        if (sl.error() != null) {
            return sl.error();
        }
        if (sl.lines().isEmpty()) {
            return Map.of("ok", false, "reason", sl.fromCart()
                    ? "购物车是空的，先说要领哪件物资（或先加进购物车）"
                    : "没说要领什么");
        }

        MergeDecision decision = parseMergeChoices(args.path("mergeChoices"));
        Map<String, Object> out = new LinkedHashMap<>();
        if (decision.hasTargets()) {
            SupplyMergeSubmitRequest req = new SupplyMergeSubmitRequest();
            req.setLines(sl.lines());
            req.setRegularTargetOrderId(decision.regularTargetId());
            req.setIndependentTargets(decision.independentTargets().isEmpty() ? null : decision.independentTargets());
            Result<Map<String, Object>> res = suppliesService.mergeSubmit(actor, req);
            if (res == null || !Boolean.TRUE.equals(res.getSuccess())) {
                return submitFailed(res == null ? null : res.getMessage());
            }
            Map<String, Object> data = res.getData() == null ? Map.of() : res.getData();
            List<String> merged = stringList(data.get("mergedOrderIds"));
            List<String> created = stringList(data.get("createdOrderIds"));
            out.put("mergedOrderIds", merged);
            out.put("createdOrderIds", created);
            out.put("note", mergeOutcomeNote(merged.size(), created.size()));
        } else {
            CreateSupplyClaimRequest req = new CreateSupplyClaimRequest();
            req.setLines(sl.lines());
            Result<SupplyClaimOrderView> res = suppliesService.createClaim(actor, req);
            if (res == null || !Boolean.TRUE.equals(res.getSuccess())) {
                return submitFailed(res == null ? null : res.getMessage());
            }
            SupplyClaimOrderView order = res.getData();
            out.put("claimId", order == null ? null : order.getId());
            out.put("status", order == null ? null : order.getStatus());
            out.put("note", "确认已收到并已生效：待处理领用单已开出，处理端会看到。");
            if (order != null && order.getSplitCount() != null && order.getSplitCount() > 1) {
                out.put("splitCount", order.getSplitCount());
                out.put("note", "确认已收到并已生效：因含独立下单物资，已拆成 " + order.getSplitCount()
                        + " 张待处理单（独立物资各自成单）。");
            }
        }
        out.put("ok", true);
        // 购物车路线：提交成功后清空云端购物车（与商城页/小程序同口径，避免重复领用）
        if (sl.fromCart()) {
            Map<String, Object> empty = new HashMap<>();
            empty.put("lines", new HashMap<String, Integer>());
            Result<?> cleared = suppliesService.saveShoppingCart(actor, empty);
            out.put("cartNote", cleared != null && Boolean.TRUE.equals(cleared.getSuccess())
                    ? "购物车已清空"
                    : "订单已提交，但购物车没能自动清空，请到商城页确认一下");
        }
        return out;
    }

    /**
     * 提交前的**合并提问**（挂起前预解析）。
     *
     * <p>两条路线共用：本人已有可并入的待处理单时，把「并入哪张 / 新建」做成可点芯片问用户，
     * 这一轮不挂起；用户点完，模型把值放进 mergeChoices 再调一次，才走确认与执行。
     * 没有可并入的单、或用户已经答过（mergeChoices 非空）→ 返回 null 照常确认。
     *
     * <p>匹配规则与商城页/小程序完全一致（常规物资只并入纯常规单，独立物资只并入它自己的独立单）；
     * 但**这里只负责建议** —— 真正的准入由 {@code SuppliesService.mergeSubmit} 的行锁校验兜底。
     */
    private Object resolveMergeBeforeConfirm(User actor, JsonNode args) {
        JsonNode chosen = args.path("mergeChoices");
        if (chosen.isArray() && !chosen.isEmpty()) {
            return null;
        }
        SubmitLines sl = resolveSubmitLines(actor, args);
        if (sl.error() != null || sl.lines().isEmpty()) {
            return null;
        }
        List<MergeGroup> groups = buildMergeGroups(actor, sl.lines());
        List<Map<String, Object>> questions = new ArrayList<>();
        for (MergeGroup g : groups) {
            if (g.orders().isEmpty()) {
                continue;
            }
            List<Map<String, Object>> options = new ArrayList<>();
            for (SupplyClaimOrderView o : g.orders()) {
                if (options.size() >= CHOICE_MAX) {
                    break;
                }
                options.add(option("并入 " + shortOrder(o), g.key() + "=" + o.getId()));
            }
            options.add(option("不合并，新建订单", g.key() + "=new"));
            Map<String, Object> q = new LinkedHashMap<>();
            q.put("title", (g.itemId() == null ? "常规物资" : "「" + g.label() + "」") + "：并入哪张待处理单？");
            q.put("options", options);
            questions.add(q);
        }
        if (questions.isEmpty()) {
            return null;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "你手上已有可并入的待处理领用单。**问用户**：这次的货要并进那张单，还是新建一张？"
                + "不要自己替他决定，也不要在正文里把单号念一遍 —— 选项已做成可点芯片。");
        out.put("questions", questions);
        out.put("note", "用户点选后，把选中值**原样**放进 submitSupplyClaim 的 mergeChoices"
                + "（形如 \"regular=SC_xxx\"、\"indep:7=new\"）再调一次；items（或省略=购物车）保持不变。");
        return out;
    }

    /** 一个合并分组：{@code key} 是芯片 value 的前缀（regular / indep:&lt;itemId&gt;）。 */
    private record MergeGroup(String key, Long itemId, String label, List<SupplyClaimOrderView> orders) {
    }

    /**
     * 按「本次要下的货」匹配本人可并入的待处理单，规则与商城页/小程序一致：
     * 常规物资只并入纯常规单；独立下单物资 X 只并入「全部行为 X 且 X 独立下单」的单；
     * 含已删除物资行、或常规+独立混合的历史单，一律排除。
     */
    private List<MergeGroup> buildMergeGroups(User actor, List<CreateSupplyClaimRequest.Line> lines) {
        Map<Long, SupplyItemView> itemById = itemsById(actor);
        Set<Long> regularIds = new LinkedHashSet<>();
        List<Long> independentIds = new ArrayList<>();
        for (CreateSupplyClaimRequest.Line l : lines) {
            if (l == null || l.getItemId() == null) {
                continue;
            }
            SupplyItemView it = itemById.get(l.getItemId());
            if (it == null) {
                continue;
            }
            if (it.getIndependentOrder() != null && it.getIndependentOrder() == 1) {
                if (!independentIds.contains(l.getItemId())) {
                    independentIds.add(l.getItemId());
                }
            } else {
                regularIds.add(l.getItemId());
            }
        }
        if (regularIds.isEmpty() && independentIds.isEmpty()) {
            return List.of();
        }
        List<SupplyClaimOrderView> regularOrders = new ArrayList<>();
        Map<Long, List<SupplyClaimOrderView>> independentByItem = new LinkedHashMap<>();
        for (SupplyClaimOrderView o : myPendingOrders(actor)) {
            List<SupplyClaimLineView> rows = o.getLines();
            if (rows == null || rows.isEmpty()) {
                continue;
            }
            Set<Long> ids = new LinkedHashSet<>();
            boolean anyUnknown = false;
            boolean allIndependent = true;
            for (SupplyClaimLineView r : rows) {
                // independentOrder 为 null = 物资已删除，该单不可作合并目标（后端必然拒绝）
                if (r == null || r.getItemId() == null || r.getIndependentOrder() == null) {
                    anyUnknown = true;
                    break;
                }
                ids.add(r.getItemId());
                if (r.getIndependentOrder() != 1) {
                    allIndependent = false;
                }
            }
            if (anyUnknown) {
                continue;
            }
            if (!allIndependent) {
                regularOrders.add(o);
            } else if (ids.size() == 1) {
                independentByItem.computeIfAbsent(ids.iterator().next(), k -> new ArrayList<>()).add(o);
            }
            // 多个独立物资混在一单：历史遗留，排除
        }
        List<MergeGroup> groups = new ArrayList<>();
        if (!regularIds.isEmpty()) {
            groups.add(new MergeGroup("regular", null, "常规物资", regularOrders));
        }
        for (Long iid : independentIds) {
            SupplyItemView it = itemById.get(iid);
            groups.add(new MergeGroup("indep:" + iid, iid,
                    it == null ? ("物资 " + iid) : str(it.getName()),
                    independentByItem.getOrDefault(iid, List.of())));
        }
        return groups;
    }

    private Map<Long, SupplyItemView> itemsById(User actor) {
        Map<Long, SupplyItemView> map = new HashMap<>();
        List<SupplyItemView> all = suppliesService.listItemsForStaff(actor.getId(), null);
        if (all != null) {
            for (SupplyItemView it : all) {
                if (it != null && it.getId() != null) {
                    map.put(it.getId(), it);
                }
            }
        }
        return map;
    }

    private List<SupplyClaimOrderView> myPendingOrders(User actor) {
        Map<String, Object> data = suppliesService.listMine(actor, "PENDING", 1, MAX_LIST, true);
        List<SupplyClaimOrderView> out = new ArrayList<>();
        Object rows = data == null ? null : data.get("data");
        if (rows instanceof List<?> list) {
            for (Object r : list) {
                if (r instanceof SupplyClaimOrderView o) {
                    out.add(o);
                }
            }
        }
        return out;
    }

    /**
     * 合并目标给人看的那一行：**只给时间和内容，不给单号**。
     *
     * <p>单号是 {@code SC_} + 32 位十六进制，用户记不住、也不该让他去对 —— 他挑的是
     * 「08-21 15:57 那张，里面有白色纸盒和胶棉拖把」，不是一串编码。单号只留在芯片的
     * value 里（原样回传给工具），不进给用户看的 label。多张候选时靠时间 + 内容区分。
     */
    private static String shortOrder(SupplyClaimOrderView o) {
        String when = o.getCreatedAt() == null ? "" : String.valueOf(o.getCreatedAt()).replace('T', ' ');
        when = when.length() > 16 ? when.substring(5, 16) : when;
        List<String> names = new ArrayList<>();
        if (o.getLines() != null) {
            for (SupplyClaimLineView l : o.getLines()) {
                if (l != null) {
                    names.add(str(l.getSnapshotName()) + " ×" + (l.getQty() == null ? 0 : l.getQty()));
                }
            }
        }
        String head = when.isEmpty() ? "待处理单" : when + " 那张单";
        return head + (names.isEmpty() ? "" : "（" + String.join("、", names) + "）");
    }

    /** 合并提问的答复：regularTargetId（null=不并入/未定）、independentTargets（itemId→单号）。 */
    private record MergeDecision(String regularTargetId, Map<Long, String> independentTargets) {
        boolean hasTargets() {
            return (regularTargetId != null && !regularTargetId.isBlank()) || !independentTargets.isEmpty();
        }
    }

    /**
     * 解析用户点选的合并芯片。约定 chip value 就是参数本身：
     * {@code regular=<单号>} / {@code regular=new} / {@code indep:<itemId>=<单号>} / {@code indep:<itemId>=new}。
     */
    private static MergeDecision parseMergeChoices(JsonNode arr) {
        String regular = null;
        Map<Long, String> indep = new LinkedHashMap<>();
        if (arr != null && arr.isArray()) {
            for (JsonNode n : arr) {
                String raw = n.asText("").trim();
                int eq = raw.indexOf('=');
                if (eq <= 0) {
                    continue;
                }
                String key = raw.substring(0, eq).trim();
                String val = raw.substring(eq + 1).trim();
                String target = val.isEmpty() || "new".equalsIgnoreCase(val) ? null : val;
                if ("regular".equals(key)) {
                    regular = target;
                } else if (key.startsWith("indep:") && target != null) {
                    try {
                        indep.put(Long.parseLong(key.substring("indep:".length()).trim()), target);
                    } catch (NumberFormatException ignore) {
                        // 脏值忽略，不因为一个坏键把整次提交当空
                    }
                }
            }
        }
        return new MergeDecision(regular, indep);
    }

    /**
     * 确认弹窗里「本次…」那一行：把合并决定翻成人话。
     *
     * <p>**不写单号** —— 用户记不住 {@code SC_} + 32 位十六进制，写上去只是一串噪声；
     * 他要确认的是「这次领的货并进之前那张待处理单 / 新建一张」。选的是哪张，芯片 label 上
     * 已经用「时间 + 内容」说清了（见 {@code shortOrder}）。
     */
    private static String submitConfirmDetail(JsonNode args) {
        List<String> parts = new ArrayList<>();
        JsonNode arr = args.path("mergeChoices");
        if (arr.isArray()) {
            for (JsonNode n : arr) {
                String raw = n.asText("").trim();
                int eq = raw.indexOf('=');
                if (eq <= 0) {
                    continue;
                }
                String key = raw.substring(0, eq).trim();
                String val = raw.substring(eq + 1).trim();
                String what = key.startsWith("indep:") ? "独立下单物资" : "常规物资";
                parts.add(what + (val.isEmpty() || "new".equalsIgnoreCase(val) ? "新建订单" : "并入已有的待处理单"));
            }
        }
        String source = args.path("items").isArray() && !args.path("items").isEmpty()
                ? "直接下单" : "提交当前购物车";
        return parts.isEmpty() ? source + "（不合并，新建订单）" : source + " · " + String.join("；", parts);
    }

    private static Map<String, Object> option(String label, String value) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("label", label);
        o.put("value", value);
        return o;
    }

    private static List<String> stringList(Object raw) {
        List<String> out = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o != null) {
                    out.add(String.valueOf(o));
                }
            }
        }
        return out;
    }

    /**
     * 提交失败的统一话术。**库存类失败不能只丢一句「库存不足」** —— 模型手里没有数字，
     * 就只能照原话回给用户，用户也不知道还能领多少、该改成几件。这里直接告诉它去哪儿取数。
     */
    private static Map<String, Object> submitFailed(String raw) {
        String msg = raw == null || raw.isBlank() ? "未知" : raw;
        String hint = msg.contains("库存")
                ? "。先用 listSupplyItems 查这件物资的可用量，把「还剩多少」说给用户，再问他改成几件"
                : "";
        return Map.of("ok", false, "reason", "提交失败：" + msg + hint);
    }

    private static String mergeOutcomeNote(int merged, int created) {
        String head = "确认已收到并已生效：";
        if (merged > 0 && created > 0) {
            return head + "已并入 " + merged + " 张待处理单、新建 " + created + " 张。";
        }
        if (merged > 0) {
            return head + "已并入 " + merged + " 张待处理单（同物资同规格的行已并到一起）。";
        }
        return head + "已新建 " + created + " 张待处理单。";
    }

    // ── 内部 ──

    private record ItemLookup(SupplyItemView item, Map<String, Object> error) {
    }

    /**
     * 物资名（或 id）→ 在架物资。
     *
     * <p>重名一律**交回候选**让用户挑：领错货是要人工纠正的（货已经出库了）。
     */
    private ItemLookup resolveItem(User actor, String want) {
        List<SupplyItemView> all = suppliesService.listItemsForStaff(actor.getId(), null);
        if (all == null || all.isEmpty()) {
            return new ItemLookup(null, Map.of("ok", false, "reason", "商城现在没有在架物资"));
        }
        List<SupplyItemView> exact = new ArrayList<>();
        List<SupplyItemView> fuzzy = new ArrayList<>();
        for (SupplyItemView item : all) {
            if (item == null) {
                continue;
            }
            String name = str(item.getName());
            if (want.equalsIgnoreCase(name) || want.equals(String.valueOf(item.getId()))) {
                exact.add(item);
            } else if (name.toLowerCase().contains(want.toLowerCase())) {
                fuzzy.add(item);
            }
        }
        List<SupplyItemView> hits = exact.isEmpty() ? fuzzy : exact;
        if (hits.size() == 1) {
            return new ItemLookup(hits.get(0), null);
        }
        if (hits.isEmpty()) {
            return new ItemLookup(null, Map.of("ok", false,
                    "reason", "商城没有叫「" + want + "」的在架物资，先用 listSupplyItems 查准确的名字"));
        }
        List<Map<String, Object>> candidates = new ArrayList<>();
        for (SupplyItemView item : hits) {
            candidates.add(describeItem(item));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "「" + want + "」命中多件，让用户确认是哪一件，不要自己选");
        out.put("candidates", candidates);
        if (candidates.size() <= CHOICE_MAX) {
            List<Map<String, Object>> choices = new ArrayList<>();
            for (Map<String, Object> c : candidates) {
                Map<String, Object> o = new LinkedHashMap<>();
                o.put("label", String.valueOf(c.get("name")));
                o.put("value", String.valueOf(c.get("name")));
                choices.add(o);
            }
            out.put("choices", choices);
            out.put("choicesTitle", "挑一件");
        }
        return new ItemLookup(null, out);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Integer> cartLines(User actor) {
        Result<Map<String, Object>> res = suppliesService.getShoppingCart(actor);
        if (res == null || !Boolean.TRUE.equals(res.getSuccess()) || res.getData() == null) {
            return new HashMap<>();
        }
        Object linesObj = res.getData().get("lines");
        if (linesObj instanceof Map<?, ?> m) {
            Map<String, Integer> out = new HashMap<>();
            for (Map.Entry<?, ?> e : m.entrySet()) {
                try {
                    out.put(String.valueOf(e.getKey()), Integer.parseInt(String.valueOf(e.getValue())));
                } catch (NumberFormatException ignore) {
                    // 脏行忽略，不因为一行坏数据把整个购物车当空
                }
            }
            return out;
        }
        return new HashMap<>();
    }

    private static String itemIdOfKey(String cartKey) {
        if (cartKey == null) {
            return "";
        }
        int sep = cartKey.indexOf("::");
        return (sep >= 0 ? cartKey.substring(0, sep) : cartKey).trim();
    }

    private static String specOfKey(String cartKey) {
        int sep = cartKey == null ? -1 : cartKey.indexOf("::");
        return sep >= 0 ? cartKey.substring(sep + 2) : "";
    }

    private String nameOfItem(User actor, String itemId) {
        if (itemId == null || itemId.isBlank()) {
            return "";
        }
        List<SupplyItemView> all = suppliesService.listItemsForStaff(actor.getId(), null);
        if (all == null) {
            return "";
        }
        for (SupplyItemView item : all) {
            if (item != null && itemId.equals(String.valueOf(item.getId()))) {
                return str(item.getName());
            }
        }
        return "";
    }

    private static boolean isSpecRequired(SupplyItemView item) {
        return item != null && item.getSpecRequired() != null && item.getSpecRequired() == 1;
    }

    private static Map<String, Object> describeItem(SupplyItemView item) {
        Map<String, Object> it = new LinkedHashMap<>();
        it.put("itemId", item.getId());
        it.put("name", str(item.getName()));
        it.put("subtitle", str(item.getSubtitle()));
        it.put("categoryId", item.getCategoryId());
        // 可用库存 = 现有 − 待处理领用单锁定；没算出来才回落现有
        it.put("availableQty", item.getAvailableQty() != null ? item.getAvailableQty() : item.getStockQty());
        it.put("stockQty", item.getStockQty());
        it.put("specRequired", isSpecRequired(item));
        it.put("independentOrder", item.getIndependentOrder() != null && item.getIndependentOrder() == 1);
        it.put("newItem", Boolean.TRUE.equals(item.getIsNewItem()));
        return it;
    }

    private static Map<String, Object> describeClaim(SupplyClaimOrderView order) {
        Map<String, Object> it = new LinkedHashMap<>();
        it.put("claimId", order.getId());
        it.put("status", str(order.getStatus()));
        it.put("createdAt", order.getCreatedAt() == null ? null : String.valueOf(order.getCreatedAt()));
        it.put("fulfilledAt", order.getFulfilledAt() == null ? null : String.valueOf(order.getFulfilledAt()));
        List<Map<String, Object>> lines = new ArrayList<>();
        if (order.getLines() != null) {
            for (SupplyClaimLineView line : order.getLines()) {
                if (line == null) {
                    continue;
                }
                Map<String, Object> l = new LinkedHashMap<>();
                l.put("name", str(line.getSnapshotName()));
                l.put("qty", line.getQty());
                l.put("fulfilledQty", line.getFulfilledQty());
                lines.add(l);
            }
        }
        it.put("lines", lines);
        return it;
    }

    private static boolean containsIgnoreCase(String text, String kw) {
        return text != null && text.toLowerCase().contains(kw.toLowerCase());
    }

    private static int clamp(int value, int min, int max) {
        return Math.min(Math.max(value, min), max);
    }

    /** 结果行里的数字取出来（缺失按 0）。 */
    private static int asInt(Object o) {
        return o instanceof Number n ? n.intValue() : 0;
    }

    private static String text(JsonNode args, String field) {
        return args.path(field).asText("").trim();
    }

    private static String str(Object o) {
        if (o == null) {
            return "";
        }
        String s = String.valueOf(o).trim();
        return "null".equalsIgnoreCase(s) ? "" : s;
    }
}
