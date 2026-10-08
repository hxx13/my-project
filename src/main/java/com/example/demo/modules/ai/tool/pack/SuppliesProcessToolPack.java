package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.supplies.dto.FulfillSupplyClaimRequest;
import com.example.demo.modules.supplies.dto.SupplyClaimLineView;
import com.example.demo.modules.supplies.dto.SupplyClaimOrderView;
import com.example.demo.modules.supplies.service.SuppliesService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.function.Predicate;

/**
 * 物资**处理**（商城页顶部的「物资处理」页）的工具包。
 *
 * <p>和 {@link SuppliesMallToolPack} 是**两端**：那边管"提交领用单"（申请人），这边管"把单子办掉"（处理端）。
 * 单据是商城的**领用单**（{@code SC_…}），不是物资需求单（{@code MR_…}）—— 后者由审核流程处理，
 * 两套体系的名字很像，别弄混（真机就混过一次）。
 *
 * <p>处理端的主要动作是**出库**：按行给出实际出库数量（可以少于申请量，也可以拒发某行）。
 * 这是真的扣库存、写流水，所以侧效等级 C：服务端挂起等用户点确认。
 */
@Component
public class SuppliesProcessToolPack implements AiToolPack {

    public static final String CAP_SUPPLIES_PROCESS = "ai.supplies.process";

    /** 待处理列表一次最多带几张单 */
    private static final int MAX_ORDERS = 20;
    /** 一张单最多带几行明细（明细太长模型也读不动） */
    private static final int MAX_LINES_PER_ORDER = 20;
    /** 候选超过这个数就不给可点选项 */
    private static final int CHOICE_MAX = 6;
    /** 摘要里最多列几项物品，多了折成「等 N 项」（芯片宽度有限） */
    private static final int MAX_SUMMARY_ITEMS = 6;

    private final SuppliesService suppliesService;
    private final CapabilityPolicyService capabilityPolicyService;

    public SuppliesProcessToolPack(SuppliesService suppliesService,
                                   CapabilityPolicyService capabilityPolicyService) {
        this.suppliesService = suppliesService;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    @Override
    public String packKey() {
        return "suppliesProcess";
    }

    @Override
    public String displayName() {
        return "物资处理";
    }

    @Override
    public Set<String> routeHints() {
        // L2 路由词：这些话/页面提到本域时带上本包（见 AiPackRouter）。
        return Set.of("领用单", "出库", "待处理", "发货");
    }

    @Override
    public String defaultPrompt() {
        return """
                物资**处理**的口径（商城页顶部的物资处理页）：
                - 待处理的领用单 → listPendingSupplyClaims；已经处理完的 → listRecentSupplyClaims。
                  注意：这是**商城的领用单（单号 SC_…）**，和「物资需求单（MR_…）」是两套东西，
                  后者用审核流程（listPendingReviews），别串。
                - 处理一张单 = **出库**（fulfillSupplyClaim）：按行给出实际出库数量。
                  可以少于申请量（库存不够/只发一部分），也可以某行不发（grant=false）。
                  用户说"全发"就按每行的待出数量出。
                - 出库会真的扣库存、写流水，服务端会挂起等用户在界面上点确认 —— 正文里别说"已经出库了"。
                - 单号与明细行 id 只能从上面两个列表里拿，不要凭印象编。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        // 与 SuppliesController / SuppliesAdminController 同口径：复用能力策略
        return Map.of(
                CAP_SUPPLIES_PROCESS,
                user -> capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM) == null);
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listPending(), listRecent(), fulfill());
    }

    // ── 查询 ──

    private AiTool listPending() {
        String schema = """
                { "type": "object", "properties": {}, "additionalProperties": false }""";
        return new AiTool(
                "listPendingSupplyClaims",
                "列出**待处理**的物资领用单（商城领用单 SC_…），带明细行与行号 —— 出库要用行号。",
                schema, CAP_SUPPLIES_PROCESS, SideEffect.READ,
                (ctx, args) -> {
                    List<SupplyClaimOrderView> rows = suppliesService.listPendingTasks(ctx.actor());
                    List<Map<String, Object>> orders = new ArrayList<>();
                    if (rows != null) {
                        for (SupplyClaimOrderView o : rows) {
                            if (o == null || orders.size() >= MAX_ORDERS) {
                                continue;
                            }
                            orders.add(describeOrder(o, true));
                        }
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", orders.size());
                    out.put("claims", orders);
                    if (orders.isEmpty()) {
                        out.put("note", "当前没有待处理的领用单");
                    } else if (orders.size() <= CHOICE_MAX) {
                        List<Map<String, Object>> choices = new ArrayList<>();
                        for (Map<String, Object> o : orders) {
                            Map<String, Object> c = new LinkedHashMap<>();
                            c.put("label", String.valueOf(o.get("summary")));
                            c.put("value", String.valueOf(o.get("claimId")));
                            choices.add(c);
                        }
                        out.put("choices", choices);
                        out.put("choicesTitle", "挑一张要处理的单");
                    }
                    return out;
                });
    }

    private AiTool listRecent() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string", "description": "只看某个状态（上游状态码），不传就是全部" },
                    "limit": { "type": "integer", "description": "最多返回几张，默认 10，上限 40" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listRecentSupplyClaims",
                "列出**最近处理过**的领用单（已出库/已撤回等）。用户问「那单办了吗」时用它核对。",
                schema, CAP_SUPPLIES_PROCESS, SideEffect.READ,
                (ctx, args) -> {
                    int limit = Math.min(Math.max(args.path("limit").asInt(10), 1), 40);
                    String status = args.path("status").asText("").trim();
                    List<SupplyClaimOrderView> rows = suppliesService.listRecentClosedClaims(
                            ctx.actor(), limit, status.isEmpty() ? null : status);
                    List<Map<String, Object>> orders = new ArrayList<>();
                    if (rows != null) {
                        for (SupplyClaimOrderView o : rows) {
                            if (o != null) {
                                orders.add(describeOrder(o, true));
                            }
                        }
                    }
                    return Map.of("total", orders.size(), "claims", orders);
                });
    }

    // ── 处理 ──

    private AiTool fulfill() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "claimId": { "type": "string", "description": "领用单号（来自 listPendingSupplyClaims）" },
                    "lines": {
                      "type": "array",
                      "description": "按行出库。省略 = 每行都按待出数量全额出库",
                      "items": {
                        "type": "object",
                        "properties": {
                          "lineId": { "type": "integer", "description": "明细行号（来自列表里的 lines[].lineId）" },
                          "fulfillQty": { "type": "integer", "description": "这一行实际出多少；0 或不填 grant=false 表示不发这行" },
                          "grant": { "type": "boolean", "description": "true 出库 / false 不发这一行" },
                          "remark": { "type": "string", "description": "备注，例如为什么少发" }
                        },
                        "required": ["lineId"]
                      }
                    },
                    "claimFloor": { "type": "string", "description": "领用楼层（可选，页面上那个字段）" }
                  },
                  "required": ["claimId"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "fulfillSupplyClaim",
                "把一张物资领用单出库（按行给出实际出库数量，可少发或某行不发）。"
                        + "会真的扣库存并写流水，服务端会挂起等用户点确认，正文里不要说「已经出库」。",
                schema, CAP_SUPPLIES_PROCESS, SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    String claimId = args.path("claimId").asText("").trim();
                    if (claimId.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说要处理哪张单");
                    }
                    // 单必须先在待处理列表里查到 —— 编出来的单号不往下走
                    SupplyClaimOrderView order = findPending(ctx.actor(), claimId);
                    if (order == null) {
                        return Map.of("ok", false,
                                "reason", "待处理里没有这张单（单号 " + claimId + "）。先用 listPendingSupplyClaims 拿准确单号");
                    }

                    FulfillSupplyClaimRequest req = new FulfillSupplyClaimRequest();
                    JsonNode linesNode = args.path("lines");
                    List<FulfillSupplyClaimRequest.Line> lines = new ArrayList<>();
                    if (linesNode.isArray() && !linesNode.isEmpty()) {
                        for (JsonNode n : linesNode) {
                            if (!n.path("lineId").isNumber()) {
                                return Map.of("ok", false, "reason", "每行都要带 lineId（来自列表里的 lines[].lineId）");
                            }
                            FulfillSupplyClaimRequest.Line line = new FulfillSupplyClaimRequest.Line();
                            line.setLineId(n.path("lineId").asLong());
                            boolean grant = !n.has("grant") || n.path("grant").asBoolean(true);
                            line.setGrant(grant);
                            if (n.path("fulfillQty").isNumber()) {
                                line.setFulfillQty(n.path("fulfillQty").asInt());
                            }
                            if (n.path("remark").isTextual()) {
                                line.setRemark(n.path("remark").asText(""));
                            }
                            lines.add(line);
                        }
                    } else {
                        // 没说就全发：按每行"还没出的数量"出库
                        List<SupplyClaimLineView> detail = order.getLines();
                        if (detail == null || detail.isEmpty()) {
                            return Map.of("ok", false, "reason", "这张单没有明细行，无法出库");
                        }
                        for (SupplyClaimLineView l : detail) {
                            if (l == null) {
                                continue;
                            }
                            int already = l.getFulfilledQty() == null ? 0 : l.getFulfilledQty();
                            int want = (l.getQty() == null ? 0 : l.getQty()) - already;
                            FulfillSupplyClaimRequest.Line line = new FulfillSupplyClaimRequest.Line();
                            line.setLineId(l.getId());
                            line.setGrant(true);
                            line.setFulfillQty(Math.max(want, 0));
                            lines.add(line);
                        }
                    }
                    if (lines.isEmpty()) {
                        return Map.of("ok", false, "reason", "没有要出库的行");
                    }
                    req.setLines(lines);
                    if (args.path("claimFloor").isTextual()) {
                        req.setClaimFloor(args.path("claimFloor").asText(""));
                    }

                    Result<SupplyClaimOrderView> res = suppliesService.fulfill(ctx.actor(), claimId, req);
                    if (res == null || !Boolean.TRUE.equals(res.getSuccess())) {
                        return Map.of("ok", false,
                                "reason", "出库失败：" + (res == null ? "未知" : res.getMessage()));
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("claimId", claimId);
                    out.put("lines", lines.size());
                    out.put("status", res.getData() == null ? null : res.getData().getStatus());
                    return out;
                });
    }

    // ── 内部 ──

    /** 在待处理列表里按单号找 —— 不在待处理里的单一律不处理（编出来的单号也走不到下游） */
    private SupplyClaimOrderView findPending(User actor, String claimId) {
        List<SupplyClaimOrderView> rows = suppliesService.listPendingTasks(actor);
        if (rows == null) {
            return null;
        }
        for (SupplyClaimOrderView o : rows) {
            if (o != null && claimId.equals(String.valueOf(o.getId()))) {
                return o;
            }
        }
        return null;
    }

    private static Map<String, Object> describeOrder(SupplyClaimOrderView o, boolean withLines) {
        Map<String, Object> it = new LinkedHashMap<>();
        it.put("claimId", o.getId());
        it.put("applicant", str(o.getApplicantName()));
        it.put("status", str(o.getStatus()));
        it.put("createdAt", o.getCreatedAt() == null ? null : String.valueOf(o.getCreatedAt()));
        it.put("fulfilledAt", o.getFulfilledAt() == null ? null : String.valueOf(o.getFulfilledAt()));
        List<Map<String, Object>> lines = new ArrayList<>();
        List<String> names = new ArrayList<>();
        if (withLines && o.getLines() != null) {
            for (SupplyClaimLineView l : o.getLines()) {
                if (l == null || lines.size() >= MAX_LINES_PER_ORDER) {
                    continue;
                }
                Map<String, Object> line = new LinkedHashMap<>();
                line.put("lineId", l.getId());
                line.put("item", str(l.getSnapshotName()));
                line.put("qty", l.getQty());
                line.put("fulfilledQty", l.getFulfilledQty());
                if (l.getSpecSnapshot() != null && !l.getSpecSnapshot().isBlank()) {
                    line.put("spec", l.getSpecSnapshot());
                }
                if (l.getRemark() != null && !l.getRemark().isBlank()) {
                    line.put("remark", l.getRemark());
                }
                lines.add(line);
                names.add(str(l.getSnapshotName()) + "×" + (l.getQty() == null ? 0 : l.getQty()));
            }
        }
        it.put("lines", lines);
        // 给人看的一句话摘要（候选芯片上就是它）：**列物品，不摆单号** ——
        // 单号又长又没用（回传给机器的是 choices 的 value，不是这行字），
        // 摆在芯片上只会把「这单里有什么」挤掉 —— 而人要判断该处理哪张，看的就是物品。
        String items;
        if (names.isEmpty()) {
            items = "领用单";
        } else if (names.size() <= MAX_SUMMARY_ITEMS) {
            items = String.join("、", names);
        } else {
            items = String.join("、", names.subList(0, MAX_SUMMARY_ITEMS)) + " 等 " + names.size() + " 项";
        }
        it.put("summary", str(o.getApplicantName()) + " · " + items);
        return it;
    }

    private static String str(Object o) {
        if (o == null) {
            return "";
        }
        String s = String.valueOf(o).trim();
        return "null".equalsIgnoreCase(s) ? "" : s;
    }
}
