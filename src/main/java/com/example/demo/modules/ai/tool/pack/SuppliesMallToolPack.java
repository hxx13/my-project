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
import com.example.demo.modules.supplies.dto.SupplyItemView;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
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
 * <p>提交领用单是**真的开一张待处理工单**，所以侧效等级 C：服务端挂起等用户点确认。
 */
@Component
public class SuppliesMallToolPack implements AiToolPack {

    public static final String CAP_SUPPLIES_CLAIM = "ai.supplies.claim";

    /** 列表一次最多返回多少条 */
    private static final int MAX_LIST = 50;
    /** 一张领用单最多几行 */
    private static final int MAX_CLAIM_LINES = 10;
    /** 候选超过这个数就不给可点选项（一屏放不下） */
    private static final int CHOICE_MAX = 6;

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
        // L2 路由词：这些话/页面提到本域时带上本包（见 AiPackRouter）。
        return Set.of("商城", "选购", "加购", "购物车", "领用", "库存", "物资");
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
                - **带规格的物资（specRequired=1）不在这边办**：规格要几项组合，页面上才有那套控件。
                  遇到这类物品要如实说「这件得去页面上选规格」，不要替他编一个规格。
                - 提交领用单用 submitSupplyClaim —— 那是**真的开一张待处理工单**，服务端会挂起等用户
                  在界面上点确认，所以正文里**不要**说「已经提交了」。
                - 物品名先用 listSupplyItems 查准（重名会交回候选让你问用户），不要凭印象写 id。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        // 与 SuppliesController 同口径：**复用能力策略**，不自己按角色重写一遍
        // （业务标签/能力矩阵本来就该只有一个判据，两处各写一套必然分叉）
        return Map.of(
                CAP_SUPPLIES_CLAIM,
                user -> capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM) == null);
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listCategories(), listItems(), viewCart(), setCartQuantity(),
                submitClaim(), listMyClaims());
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
                    "limit": { "type": "integer", "description": "最多返回几条，默认 20，上限 50" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listSupplyItems",
                "查商城在架的物资：名称、副标题、库存与是否要选规格。**回答「有没有某样东西/还剩多少」用它**。",
                schema, CAP_SUPPLIES_CLAIM, SideEffect.READ,
                (ctx, args) -> {
                    int limit = clamp(args.path("limit").asInt(20), 1, MAX_LIST);
                    Long categoryId = args.path("categoryId").isNumber() ? args.path("categoryId").asLong() : null;
                    String kw = text(args, "keyword");
                    List<SupplyItemView> rows = suppliesService.listItemsForStaff(ctx.actor().getId(), categoryId);
                    List<Map<String, Object>> items = new ArrayList<>();
                    if (rows != null) {
                        for (SupplyItemView item : rows) {
                            if (item == null || items.size() >= limit) {
                                continue;
                            }
                            if (!kw.isEmpty() && !containsIgnoreCase(item.getName(), kw)
                                    && !containsIgnoreCase(item.getSubtitle(), kw)) {
                                continue;
                            }
                            items.add(describeItem(item));
                        }
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", items.size());
                    out.put("items", items);
                    if (items.isEmpty()) {
                        out.put("note", "没查到匹配的物资，换个关键词或去掉分类再试");
                    } else if (items.size() <= CHOICE_MAX) {
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

    // ── 选购 ──

    private AiTool setCartQuantity() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "item": { "type": "string", "description": "物资名（先用 listSupplyItems 查准）或物资 id" },
                    "qty": { "type": "integer", "description": "要放进购物车的数量；传 0 表示从购物车移出" }
                  },
                  "required": ["item", "qty"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "setCartQuantity",
                "把某件物资加入领用购物车，或改它的数量（传 0 移出）。购物车存在服务端，改完小程序那边也是同一份。",
                schema, CAP_SUPPLIES_CLAIM, SideEffect.IDEMPOTENT_WRITE,
                (ctx, args) -> {
                    String want = text(args, "item");
                    if (want.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说要放哪件物资");
                    }
                    int qty = args.path("qty").asInt(0);
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
                      "description": "要领用的物资，每项 {item, qty, remark?}；item 是物资名或 id",
                      "items": {
                        "type": "object",
                        "properties": {
                          "item": { "type": "string" },
                          "qty": { "type": "integer" },
                          "remark": { "type": "string" }
                        },
                        "required": ["item", "qty"]
                      }
                    }
                  },
                  "required": ["items"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "submitSupplyClaim",
                "提交物资领用单（真的开一张待处理工单）。"
                        + "这是写操作，服务端会挂起等用户点确认，正文里不要说「已经提交」。"
                        + "带规格的物资不在这里办（请用户到页面选规格）。",
                schema, CAP_SUPPLIES_CLAIM, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    JsonNode arr = args.path("items");
                    if (!arr.isArray() || arr.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说要领什么");
                    }
                    if (arr.size() > MAX_CLAIM_LINES) {
                        return Map.of("ok", false,
                                "reason", "一张单最多 " + MAX_CLAIM_LINES + " 行，请拆开或让用户确认");
                    }
                    CreateSupplyClaimRequest req = new CreateSupplyClaimRequest();
                    List<CreateSupplyClaimRequest.Line> lines = new ArrayList<>();
                    List<String> names = new ArrayList<>();
                    for (JsonNode n : arr) {
                        String want = n.path("item").asText("").trim();
                        int qty = n.path("qty").asInt(0);
                        if (want.isEmpty() || qty <= 0) {
                            return Map.of("ok", false, "reason", "每一项都要有物资和正数数量：" + n);
                        }
                        ItemLookup lookup = resolveItem(ctx.actor(), want);
                        if (lookup.error != null) {
                            return lookup.error;
                        }
                        if (isSpecRequired(lookup.item)) {
                            return Map.of("ok", false, "reason",
                                    "「" + str(lookup.item.getName()) + "」要先选规格，请到商城页面上领用");
                        }
                        CreateSupplyClaimRequest.Line line = new CreateSupplyClaimRequest.Line();
                        line.setItemId(lookup.item.getId());
                        line.setQty(qty);
                        if (n.path("remark").isTextual()) {
                            line.setRemark(n.path("remark").asText(""));
                        }
                        lines.add(line);
                        names.add(str(lookup.item.getName()) + " ×" + qty);
                    }
                    req.setLines(lines);

                    Result<SupplyClaimOrderView> res = suppliesService.createClaim(ctx.actor(), req);
                    if (res == null || !Boolean.TRUE.equals(res.getSuccess())) {
                        return Map.of("ok", false,
                                "reason", "提交失败：" + (res == null ? "未知" : res.getMessage()));
                    }
                    SupplyClaimOrderView order = res.getData();
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("claimId", order == null ? null : order.getId());
                    out.put("status", order == null ? null : order.getStatus());
                    out.put("lines", names);
                    return out;
                });
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
