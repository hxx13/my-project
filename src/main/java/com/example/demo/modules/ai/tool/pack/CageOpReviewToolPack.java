package com.example.demo.modules.ai.tool.pack;

import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.entity.CageOpRequest;
import com.example.demo.modules.cageshelf.service.CageClaimService;
import com.example.demo.modules.cageshelf.service.CageOperationService;
import com.example.demo.modules.cageshelf.service.TransferFormService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.function.Predicate;

/**
 * 笼位操作审核工具包 —— 学生审核页的**认领**、**分笼**两个 tab。
 *
 * <p>两条链是**不同表、不同服务**，不要混：
 * <ul>
 *   <li><b>认领</b> {@code cage_claim} 表 / {@link CageClaimService} / 页面 tab「笼位申请」；</li>
 *   <li><b>分笼</b> {@code cage_op_request} 表 / {@link CageOperationService} / 页面 tab「分笼审核」。</li>
 * </ul>
 * 这也正是页面自己的走法（认领打 {@code /admin/cage-claims/*}、分笼打 {@code /cage-op/*}）。
 * 两个写入口的 id **各自自增、会撞号**，所以任何按 id 定位都必须先确定它是哪条链 ——
 * 本包的办法是：**只在该链自己的待审列表里找**，找不到就说明 id 不属于这条链（或不在你的范围里）。
 *
 * <p><b>权限怎么定的</b>：能力码按**各自入口**的真实口径分档，不取宽的那个：
 * 认领入口 {@code AdminCageClaimController.requireApprover} = 管理员及以上**或组长**，
 * 判定在 {@link CageClaimService#canApprove}（Controller 与这里调同一个方法）；
 * 分笼入口 {@code /cage-op/{id}/approve} 只要求登录，能审哪一张由服务里按「负责区域」逐个判 ——
 * 所以这里的能力码就是「教职工」，对象级判定交给服务。
 *
 * <p><b>副作用 C</b>：通过会真的占笼位 / 执行分笼；一律挂起等用户点确认。
 */
@Component
public class CageOpReviewToolPack implements AiToolPack {

    public static final String CAP_CLAIM_LIST = "ai.cageop.claim.list";
    public static final String CAP_CLAIM_DECIDE = "ai.cageop.claim.decide";
    public static final String CAP_OP_LIST = "ai.cageop.op.list";
    public static final String CAP_OP_DECIDE = "ai.cageop.op.decide";

    /** 待审清单一次最多回这么多行；按人找单据**不受这个上限影响**。 */
    private static final int MAX_ROWS = 50;

    private final CageClaimService claimService;
    private final CageOperationService opService;
    private final TransferFormService transferFormService;

    public CageOpReviewToolPack(CageClaimService claimService, CageOperationService opService,
                                TransferFormService transferFormService) {
        this.claimService = claimService;
        this.opService = opService;
        this.transferFormService = transferFormService;
    }

    @Override
    public String packKey() {
        return "cage_op";
    }

    @Override
    public String displayName() {
        return "笼位操作审核";
    }

    @Override
    public Set<String> routeHints() {
        // L2 路由词：这些话/页面提到本域时带上本包（见 AiPackRouter）。
        // 「待审/待办/审核/审批」是**总括词**，故意与物资、培训两个包**重复** —— 用户说
        // 「我有什么待审核的」时要的是**全平台待办**，那三个域得一起带上（四包上限内正好放得下）。
        // 只让某一个包接住这些词，答出来就永远是「只有那一域」，真机反馈就是「不合/不全」。
        return Set.of("认领", "分笼", "转移", "三签", "签署", "申请占用", "申请释放", "笼位申请",
                "待审", "待办", "审核", "审批");
    }

    @Override
    public String defaultPrompt() {
        return """
                笼位审核（认领 / 分笼）的口径：
                - 「待审」只包含**你负责范围内的**。别人的单子在这里查不到 —— 查不到就说查不到，
                  不要讲「没有待审」。**两种单子的 id 会撞号**，所以别把一张单子的编号往另一类上套。
                - **认领要看状态分清是哪种事**：`pending_approval` 是「申请占用」，`pending_release_approval`
                  是「申请释放」。通过的含义不同（一个占笼位、一个腾笼位），说清是哪一个。
                  申请占用通过后若该笼位需要学生再确认一次，单子会停在「已锁定、待学生确认」——
                  这时**不能说「已经占上了」**，要说清还等学生确认。
                - **分笼**通过即执行（源笼位腾空、目标笼位落位），没有第二次确认。
                - 两条链都**按「人名 + 单号」定位**：用户只报人名时，直接调对应的写工具并传 person
                  （**别传 requestId**）；命中多张时工具会把候选做成可点选选项，用户点一下就是回答 ——
                  不要在正文里手打候选清单，也不许替他挑。
                - 审核是**写操作**，一定会先弹确认让人点。你只负责说清是哪一张单子（谁、哪个房间/笼架、什么时候提的），
                  不要在正文里替用户下结论说「已通过」。
                - **驳回必须带一句原因**（接口要求，缺了会直接报错）。用户没说就先问他要一句。
                - 一次只处理一张单子。
                - **转移（三签）与分笼是两回事，别混**：分笼用 approveCageDivide / rejectCageDivide，
                  转移一律用 signCageTransfer。拿分笼的工具去签转移会被挡住。

                [转移三签] 归属地 / 目的地 / 兽医**三方并联**，一次调用只记**一关**：
                - **签一关不等于整单通过**。三关都同意才执行转移；说结果时必须讲清
                  「已以某身份签署，还差谁」，**不许说「已经通过了」**——旧单签链里「通过」确实是终局，
                  两条链共用这个词，最容易让人误解。
                - `decision` 三态：**同意 / 暂缓 / 不同意**。暂缓**不终局、可改判**（单子仍待签）；
                  不同意是**终局**（兽医一票否决）。暂缓与不同意**必须**带一句原因，先问用户要。
                - **身份不能由你决定**：清单结果里每条转移单都带 `mySignRoles`（你还能签的身份）。
                  只有一个就把 `role` 传上；**有多个而用户没说清是哪一关时，不要传 `role`** ——
                  工具会把身份做成可点选选项，让用户点哪个就是哪个。
                - 用户要**查看/打印转移单**：告诉他去「学生审核 → 转移审核」页面（那里能看单、下载、合并打印）。
                  你这边发不了文件，别承诺能发 PDF。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(
                // 与 AdminCageClaimController#requireApprover 同口径，判定在 CageClaimService#canApprove
                CAP_CLAIM_LIST, claimService::canApprove,
                CAP_CLAIM_DECIDE, claimService::canApprove,
                // 与 /cage-op/** 的 requireLogin 同口径（能审哪一张由服务按负责区域判，属对象级）
                CAP_OP_LIST, user -> true,
                CAP_OP_DECIDE, user -> true);
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listPendingCageClaims(), approveCageClaim(), rejectCageClaim(),
                listPendingCageOps(), approveCageDivide(), rejectCageDivide(), signCageTransfer());
    }

    // ── 认领 ──

    private AiTool listPendingCageClaims() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "roomKeyword": { "type": "string", "description": "可选。按房间/笼架/校区名筛，留空看全部" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listPendingCageClaims",
                "列出你负责范围内的**笼位认领待审**（含「申请占用」与「申请释放」两种）。"
                        + "用户问「有哪些笼位申请要我审」时用它。每行带 requestId，通过/驳回就用它。",
                schema,
                CAP_CLAIM_LIST,
                SideEffect.READ,
                (ctx, args) -> {
                    List<Map<String, Object>> rows = claimPending(ctx.actor());
                    String kw = text(args, "roomKeyword").toLowerCase();
                    List<Map<String, Object>> filtered = new ArrayList<>();
                    for (Map<String, Object> r : rows) {
                        if (kw.isEmpty() || String.valueOf(r.get("summary")).toLowerCase().contains(kw)) {
                            filtered.add(r);
                        }
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", filtered.size());
                    out.put("claims", firstRows(filtered));
                    if (filtered.isEmpty()) {
                        out.put("note", rows.isEmpty()
                                ? "当前没有需要你审的笼位认领单（只含你负责范围内的）。"
                                : "有 " + rows.size() + " 张待审，但没有位置名含「" + kw + "」的。");
                    }
                    return out;
                });
    }

    private AiTool approveCageClaim() {
        return decideClaim("approveCageClaim", true);
    }

    private AiTool rejectCageClaim() {
        return decideClaim("rejectCageClaim", false);
    }

    private AiTool decideClaim(String name, boolean approve) {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "requestId": { "type": "string", "description": "笼位认领单 id。**只在 listPendingCageClaims 的结果里拿到过时才填**" },
                    "person": { "type": "string", "description": "申请人姓名。不知道单号时用这个；命中多张会把候选交回来让用户挑" },
                    "reason": { "type": "string", "description": "驳回原因，一句话。**只驳回时填**；通过不要填" }
                  },
                  "additionalProperties": false
                }""";
        String verb = approve ? "通过" : "驳回";
        return new AiTool(
                name,
                verb + "一张笼位认领单（申请占用或申请释放）。只处理你负责范围内的单子，超出范围的会被业务侧拒掉。"
                        + "调用它会先挂起等用户点确认，所以**不要**在正文里说已经办好了。"
                        + "分笼单不要用它 —— 那是 approveCageDivide / rejectCageDivide。",
                schema,
                CAP_CLAIM_DECIDE,
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    String id = text(args, "requestId");
                    String reason = text(args, "reason");
                    if (id.isEmpty()) {
                        Resolved resolved = resolveIn(ctx.actor(), claimPending(ctx.actor()),
                                text(args, "person"), name, "笼位认领单");
                        if (resolved.error != null) {
                            return resolved.error;
                        }
                        id = resolved.id;
                    }
                    if (!approve && reason.isEmpty()) {
                        return Map.of("ok", false, "requestId", id,
                                "reason", "驳回必须给一句原因（接口要求）。先问用户要一句，再调一次",
                                "note", "没有原因会被服务端直接拒掉，别硬发");
                    }
                    CageClaim updated = claimService.approve(ctx.actor(), Long.valueOf(id), approve ? "approved" : "rejected",
                            approve ? null : reason);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("requestId", id);
                    out.put("status", updated.getClaimStatus());
                    out.put("note", claimOutcome(updated.getClaimStatus(), approve));
                    return out;
                });
    }

    /**
     * 认领审批的结果文案。
     *
     * <p>「通过」**不等于**「已经占上了」：需要学生再确认时单子停在 `locked`，
     * 说成「已占位」就是假成功。释放通过则是另一回事（腾笼位）。
     */
    private static String claimOutcome(String status, boolean approve) {
        if (!approve) {
            return "已驳回；若这是释放申请，笼位回到「已确认」状态";
        }
        if ("locked".equals(status)) {
            return "已通过，笼位已锁定、**等学生本人确认**才算占上 —— 跟用户说清这一步还没完";
        }
        return "已通过并占位";
    }

    // ── 分笼 ──

    private AiTool listPendingCageOps() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "opType": {
                      "type": "string",
                      "enum": ["divide", "transfer", "all"],
                      "description": "divide=分笼，transfer=转移，省略或 all=两类都看"
                    }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listPendingCageOps",
                "列出你负责范围内的**分笼 / 转移待审**。用户问「有哪些分笼或转移要我审」时用它。"
                        + "每行带 requestId 与是分笼还是转移；转移单还会带「你还能签哪些身份」。",
                schema,
                CAP_OP_LIST,
                SideEffect.READ,
                (ctx, args) -> {
                    String t = text(args, "opType");
                    String opType = ("divide".equals(t) || "transfer".equals(t)) ? t : null;
                    List<Map<String, Object>> rows = opPending(ctx.actor(), opType);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", rows.size());
                    out.put("requests", firstRows(rows));
                    if (rows.isEmpty()) {
                        out.put("note", "当前没有需要你审的分笼/转移单（只含你负责范围内的）。");
                    }
                    return out;
                });
    }

    private AiTool approveCageDivide() {
        return decideDivide("approveCageDivide", true);
    }

    private AiTool rejectCageDivide() {
        return decideDivide("rejectCageDivide", false);
    }

    private AiTool decideDivide(String name, boolean approve) {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "requestId": { "type": "string", "description": "分笼单 id。**只在 listPendingCageOps 的结果里拿到过时才填**" },
                    "person": { "type": "string", "description": "申请人姓名。不知道单号时用这个" },
                    "reason": { "type": "string", "description": "驳回原因，一句话。**只驳回时填**" }
                  },
                  "additionalProperties": false
                }""";
        String verb = approve ? "通过" : "驳回";
        return new AiTool(
                name,
                verb + "一张笼位分笼单。通过即执行（源笼位腾空、目标笼位落位），没有第二次确认。"
                        + "调用它会先挂起等用户点确认，所以**不要**在正文里说已经办好了。"
                        + "**它只办分笼** —— 转移单（三方三签）有专门的工具，不要拿这个去签转移。",
                schema,
                CAP_OP_DECIDE,
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    String id = text(args, "requestId");
                    String reason = text(args, "reason");
                    if (id.isEmpty()) {
                        Resolved resolved = resolveIn(ctx.actor(), opPending(ctx.actor(), "divide"),
                                text(args, "person"), name, "分笼单");
                        if (resolved.error != null) {
                            return resolved.error;
                        }
                        id = resolved.id;
                    }
                    if (!approve && reason.isEmpty()) {
                        return Map.of("ok", false, "requestId", id,
                                "reason", "驳回必须给一句原因（接口要求）。先问用户要一句，再调一次");
                    }
                    Map<String, Object> result = opService.review(ctx.actor(), Long.valueOf(id),
                            approve ? "approved" : "rejected", approve ? null : reason, null);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("requestId", id);
                    out.put("status", result.get("status"));
                    out.put("note", approve ? "已通过，分笼已执行" : "已驳回");
                    return out;
                });
    }

    // ── 转移（三方并联三签）──

    /**
     * 转移三签。**与分笼/认领不同**：一次调用只记**一关**，三关都同意才执行。
     *
     * <p>三个关键点都在这个工具里落实：
     * <ol>
     *   <li>{@code role} **不由模型猜**：身份先给就按给的走（服务端还会校验一次），
     *       没给而只有一个可签身份就自动用，有多个则走 {@code resolveBeforeConfirm}
     *       把身份做成可点选选项让用户挑（挂起发生在执行体之前，纯靠执行体问不出来）；</li>
     *   <li>{@code decision} 三态，暂缓/不同意必须带原因；</li>
     *   <li>结果文案**分档**：签完仍待签就说「已签某关、还差谁」，绝不写成「已通过」。</li>
     * </ol>
     */
    private AiTool signCageTransfer() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "requestId": { "type": "string", "description": "转移单 id。**只在清单工具的结果里拿到过时才填**" },
                    "person": { "type": "string", "description": "申请人姓名。不知道单号时用这个；命中多张会把候选交回来让用户挑" },
                    "decision": {
                      "type": "string",
                      "enum": ["approved", "held", "rejected"],
                      "description": "approved=同意签署；held=暂缓（**不终局**，可改判）；rejected=不同意（**终局**，兽医一票否决）"
                    },
                    "reason": { "type": "string", "description": "一句话原因。**暂缓与不同意必填**；同意不要填" },
                    "role": {
                      "type": "string",
                      "enum": ["ORIGIN", "DEST", "VET"],
                      "description": "以哪个身份签署（归属地/目的地/兽医）。**取清单结果里的 mySignRoles**；只有一个就传它，有多个而你拿不准时**不要传**——工具会把身份做成可点选选项让用户挑"
                    }
                  },
                  "required": ["decision"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "signCageTransfer",
                "以某一个身份签署一条笼位转移单（归属地 / 目的地 / 兽医**三方并联**，一次只签一关）。"
                        + "签一关**不等于**整单通过：三关都同意才执行转移。同意 / 暂缓 / 不同意三态，"
                        + "其中**暂缓不终局、可改判**，**不同意是终局**。"
                        + "调用它会先挂起等用户点确认，所以**不要**在正文里说已经办好了。",
                schema,
                CAP_OP_DECIDE,
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> doSignTransfer(ctx.actor(), args),
                (ctx, args) -> resolveSignRoleBeforeConfirm(ctx.actor(), args),
                CageOpReviewToolPack::transferConfirmDetail);
    }

    /**
     * 挂起前的预解析：**只解决「以哪个身份签」这一件事**。
     *
     * <p>返回非空（带 candidates/choices）= 这一轮不挂起，先把身份问清楚；
     * 返回 null = 身份明确，照常走确认。
     */
    private Object resolveSignRoleBeforeConfirm(User actor, JsonNode args) {
        if (!text(args, "role").isEmpty()) {
            return null;
        }
        Target target = resolveTransfer(actor, args);
        if (target.error != null) {
            return target.error;
        }
        List<String> roles = target.roles;
        if (roles.isEmpty()) {
            return Map.of("ok", false,
                    "reason", "你现在没有这条转移单尚未签署的审核身份（可能三关都已签过，或这单不该你签）");
        }
        if (roles.size() == 1) {
            // 只有一个身份：不必问，直接进确认。执行体里会用上它。
            return null;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "你有 " + roles.size() + " 个身份能签这一关（" + join("、", roles.stream().map(CageOpReviewToolPack::roleLabel).toArray())
                + "），**让用户挑一个**，不要自己选");
        out.put("request", target.row);
        out.put("choices", roleChoices(roles));
        out.put("choicesTitle", "以哪个身份签署");
        out.put("note", "用户点选后，把选中的 role（" + String.join(" / ", roles) + "）传给 signCageTransfer 再调一次");
        return out;
    }

    private Map<String, Object> doSignTransfer(User actor, JsonNode args) {
        String decision = text(args, "decision");
        if (!"approved".equals(decision) && !"held".equals(decision) && !"rejected".equals(decision)) {
            return Map.of("ok", false, "reason", "decision 只能是 approved（同意）/ held（暂缓）/ rejected（不同意）");
        }
        String reason = text(args, "reason");
        if (!"approved".equals(decision) && reason.isEmpty()) {
            return Map.of("ok", false,
                    "reason", "暂缓或不同意必须给一句原因（接口要求）。先问用户要一句，再调一次");
        }

        Target target = resolveTransfer(actor, args);
        if (target.error != null) {
            return target.error;
        }
        List<String> roles = target.roles;
        String role = text(args, "role");
        if (role.isEmpty()) {
            if (roles.size() != 1) {
                // 走到这里说明预解析没被用上（钩子异常之类）。宁可不办，也不替用户挑身份。
                return Map.of("ok", false, "requestId", target.id,
                        "reason", "没说以哪个身份签。可签身份：" + join("、", roles.stream().map(CageOpReviewToolPack::roleLabel).toArray())
                                + "。让用户挑一个再调一次");
            }
            role = roles.get(0);
        } else if (!roles.contains(role)) {
            return Map.of("ok", false, "requestId", target.id,
                    "reason", "你不能以「" + roleLabel(role) + "」身份签这一关。可签身份："
                            + join("、", roles.stream().map(CageOpReviewToolPack::roleLabel).toArray()));
        }

        Map<String, Object> result = opService.review(actor, Long.valueOf(target.id), decision,
                "approved".equals(decision) ? null : reason, role);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("requestId", target.id);
        if (target.docNo != null && !target.docNo.isBlank()) {
            out.put("docNo", target.docNo);
        }
        out.put("status", result.get("status"));
        out.put("note", transferOutcome(actor, target.id, decision, role, String.valueOf(result.get("status"))));
        return out;
    }

    /**
     * 签完说什么 —— **分三档，绝不能一律说「已通过」**。
     *
     * <p>旧单签链里「通过」确实是终局（一次通过即执行），而三签里通过**一关**只是三方里的一方同意了。
     * 两条链共用「通过」这个词，是本域最容易让人误解的地方。
     */
    private String transferOutcome(User actor, String id, String decision, String role, String status) {
        // 开头这句是给模型吃的一颗定心丸：它的工具描述里写着「调用它会先挂起等用户点确认，
        // 不要在正文里说已经办好了」，于是**确认之后**它仍在正文补一句「（请在界面上点确认）」
        // —— 用户会以为还要再点一次。结果里明说「确认已收到并已生效」，它就不补了（真机踩过）。
        String mine = "确认已收到并已生效：" + "以「" + roleLabel(role) + "」身份";
        if ("approved".equals(status)) {
            return mine + "签齐了最后一关，**转移已执行**（源笼位已腾空、目标笼位已落位）。"
                    + "转移单已归档，可去「学生审核 → 转移审核」查看或打印。";
        }
        if ("rejected".equals(status)) {
            return mine + "签署**不同意**，本单**终局驳回**（兽医一票否决）。";
        }
        // 仍待签：可能刚签了同意、也可能签的是暂缓（暂缓不终局，签的人还能改判）
        String verdict = "held".equals(decision) ? "签署**暂缓**（不终局，可改判）" : "签署同意";
        String rest = "";
        try {
            for (Map<String, Object> row : opPending(actor, "transfer")) {
                if (id.equals(str(row.get("requestId")))) {
                    Object missing = row.get("missingSignRoles");
                    if (missing instanceof List<?> m && !m.isEmpty()) {
                        rest = "，还差：" + join("、", m.stream().map(r -> roleLabel(str(r))).toArray());
                    }
                    break;
                }
            }
        } catch (RuntimeException ignore) {
            // 补不到「还差谁」就少说一句，不能因此把成功报成失败
        }
        return mine + verdict + "，" + "**本单仍在待签**" + rest + "。整笔转移还没执行。";
    }

    private static List<Map<String, Object>> roleChoices(List<String> roles) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String role : roles) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("label", "以「" + roleLabel(role) + "」身份签署");
            item.put("value", role);
            out.add(item);
        }
        return out;
    }

    /** 确认弹窗里的「本次…」：把稳定码翻成人话（`VET` → 兽医）。这是**给人看**的那一行。 */
    private static String transferConfirmDetail(JsonNode args) {
        String role = args == null ? "" : args.path("role").asText("");
        String decision = args == null ? "" : args.path("decision").asText("");
        String reason = args == null ? "" : args.path("reason").asText("");
        StringBuilder sb = new StringBuilder("本次：");
        sb.append(role.isEmpty() ? "以你的唯一可签身份" : "以「" + roleLabel(role) + "」身份").append("签署");
        sb.append(" · ").append(decisionLabel(decision));
        if (!reason.isEmpty()) {
            sb.append("（原因：").append(reason).append("）");
        }
        return sb.toString();
    }

    private static String roleLabel(String role) {
        return switch (role == null ? "" : role) {
            case "ORIGIN" -> "归属地";
            case "DEST" -> "目的地";
            case "VET" -> "兽医";
            default -> role == null || role.isBlank() ? "未知身份" : role;
        };
    }

    private static String decisionLabel(String decision) {
        return switch (decision == null ? "" : decision) {
            case "approved" -> "同意";
            case "held" -> "暂缓";
            case "rejected" -> "不同意";
            default -> decision == null || decision.isBlank() ? "未指明" : decision;
        };
    }

    // ── 待审投影 ──

    /** 认领待审（服务端已按审核人的负责区域过滤）。 */
    private List<Map<String, Object>> claimPending(User actor) {
        Map<String, Object> page = claimService.getPendingList(actor, null, null, 1, 500);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> list = page.get("list") instanceof List<?> l
                ? (List<Map<String, Object>>) l : List.of();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : list) {
            String status = str(r.get("claimStatus"));
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("requestId", str(r.get("id")));
            row.put("person", str(r.get("claimantName")));
            row.put("personGroup", str(r.get("claimantDept")));
            row.put("kind", "pending_release_approval".equals(status) ? "申请释放" : "申请占用");
            row.put("location", locationOf(r));
            row.put("aupNumber", str(r.get("aupNumber")));
            row.put("createdAt", str(r.get("createdAt")));
            row.put("summary", join(" · ", r.get("claimantName"),
                    "pending_release_approval".equals(status) ? "申请释放" : "申请占用",
                    locationOf(r), r.get("createdAt")));
            out.add(row);
        }
        return out;
    }

    /** 分笼/转移待审（服务端已按负责范围过滤；转移单还带 myRoles）。 */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> opPending(User actor, String opType) {
        List<Map<String, Object>> rows = opService.pending(actor, opType);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("requestId", str(r.get("id")));
            row.put("opType", str(r.get("opType")));
            row.put("person", str(r.get("applicantName")));
            row.put("sourceLocation", locationOf(r));
            row.put("targetLocations", targetLocations(r));
            row.put("threeSign", Boolean.TRUE.equals(r.get("threeSign")));
            Object myRoles = r.get("myRoles");
            if (myRoles instanceof List<?> roles && !roles.isEmpty()) {
                row.put("mySignRoles", roles);
            }
            Object missing = r.get("missingRoles");
            if (missing instanceof List<?> m && !m.isEmpty()) {
                row.put("missingSignRoles", m);
            }
            row.put("reason", str(r.get("reason")));
            row.put("createdAt", str(r.get("createdAt")));
            if ("transfer".equals(str(r.get("opType")))) {
                // 单号是**给人看的名字**（20260920-位亚磊-1），主键仍是 id。
                // 用户要凭它对上页面上的单子和纸质转移单，所以读接口必须带出来。
                String docNo = docNoOf(str(r.get("id")));
                if (!docNo.isBlank()) {
                    row.put("docNo", docNo);
                }
                row.put("note", "转移**三方并联三签**：一次只签一关，三关都同意才执行。用 signCageTransfer 签");
            }
            row.put("summary", join(" · ", r.get("applicantName"),
                    "transfer".equals(str(r.get("opType"))) ? "转移" : "分笼",
                    locationOf(r), r.get("createdAt")));
            out.add(row);
        }
        return out;
    }

    private static String locationOf(Map<String, Object> r) {
        String room = str(r.get("roomName"));
        String shelve = str(r.get("shelveName"));
        String x = str(r.get("positionX"));
        String y = str(r.get("positionY"));
        StringBuilder sb = new StringBuilder(str(r.get("campusName")));
        if (!room.isEmpty()) {
            sb.append(sb.length() > 0 ? " " : "").append(room);
        }
        if (!shelve.isEmpty()) {
            sb.append(sb.length() > 0 ? " " : "").append(shelve);
        }
        if (!x.isEmpty() && !y.isEmpty()) {
            sb.append(sb.length() > 0 ? " " : "").append(x).append('-').append(y);
        }
        return sb.toString();
    }

    /** 目标笼位（分笼 1:多）：审核必须看得出「分到哪去」。 */
    @SuppressWarnings("unchecked")
    private static List<String> targetLocations(Map<String, Object> r) {
        List<String> out = new ArrayList<>();
        for (Object t : (List<Object>) r.getOrDefault("targets", List.of())) {
            if (t instanceof Map<?, ?> m) {
                out.add(locationOf((Map<String, Object>) m));
            }
        }
        return out;
    }

    // ── 定位单据 ──

    private record Resolved(String id, Map<String, Object> error) {
    }

    /** 定位到的转移单：行投影 + 本人可签身份 + 单号。{@code error} 非空时其余无意义。 */
    private record Target(String id, List<String> roles, String docNo,
                          Map<String, Object> row, Map<String, Object> error) {
    }

    /**
     * 按单号/人名在**本人待签的转移单**里定位一张。
     *
     * <p>身份只认服务端下发的 {@code mySignRoles}，**工具不自己算** —— 谁能在哪一关签，
     * 判据在 `signableRoles`（超管 / 覆盖位置 / 名单兽医）里，重算一遍必然分叉。
     */
    private Target resolveTransfer(User actor, JsonNode args) {
        List<Map<String, Object>> rows = opPending(actor, "transfer");
        String id = text(args, "requestId");
        Map<String, Object> hit = null;

        if (!id.isEmpty()) {
            for (Map<String, Object> r : rows) {
                if (id.equals(str(r.get("requestId")))) {
                    hit = r;
                    break;
                }
            }
            if (hit == null) {
                return new Target(null, List.of(), null, null, Map.of("ok", false, "requestId", id,
                        "reason", "待签的转移单里没有这一张（要么不在你负责范围内，要么已经签完/撤了）",
                        "note", "先用清单工具看有哪些待签的转移单"));
            }
        } else {
            String person = text(args, "person");
            if (person.isBlank()) {
                return new Target(null, List.of(), null, null, Map.of("ok", false,
                        "reason", "没说是哪一条转移单。给申请人姓名，或先用清单工具拿到单号"));
            }
            List<Map<String, Object>> hits = new ArrayList<>();
            for (Map<String, Object> r : rows) {
                if (nameMatches(str(r.get("person")), person)) {
                    hits.add(r);
                }
            }
            if (hits.isEmpty()) {
                return new Target(null, List.of(), null, null, Map.of("ok", false,
                        "reason", "待签的转移单里没有「" + person + "」的（共 " + rows.size() + " 条待签，都不是这个人的）",
                        "note", "要么他这批已签完/撤了，要么不在你负责范围内。让用户核对一下。"));
            }
            if (hits.size() > 1) {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("ok", false);
                out.put("reason", "「" + person + "」有 " + hits.size() + " 条待签转移单，让用户挑一条，不要自己选");
                out.put("candidates", hits);
                out.put("choices", choicesOf(hits));
                out.put("choicesTitle", person + " · 挑一张转移单");
                out.put("note", "用户点选后，把选中的 requestId 传给 signCageTransfer 再调一次");
                return new Target(null, List.of(), null, null, out);
            }
            hit = hits.get(0);
        }

        List<String> roles = new ArrayList<>();
        if (hit.get("mySignRoles") instanceof List<?> l) {
            for (Object o : l) {
                roles.add(String.valueOf(o));
            }
        }
        return new Target(str(hit.get("requestId")), roles, str(hit.get("docNo")), hit, null);
    }

    /** 单号（给人看的名字，不是主键）。取不到就留空 —— 不能因为它失败而看不到整条待签单。 */
    private String docNoOf(String id) {
        try {
            CageOpRequest req = transferFormService.findRequest(Long.valueOf(id));
            return req == null ? "" : str(transferFormService.docNo(req));
        } catch (RuntimeException e) {
            return "";
        }
    }

    /**
     * 在**调用者自己的待审列表**里按 id 或人名找一张单。
     *
     * <p>有意不提供「拿 id 直连服务」这条路：id 是自增的，两条链会撞号；
     * 而且只在该链自己的待审里找，越界的 id、别的类型的单子、已经审过的单子，
     * 在触到服务层之前就被挡住了 —— 分笼工具误签转移单这类错调也就无从发生。
     */
    private static Resolved resolveIn(User actor, List<Map<String, Object>> rows, String person,
                                      String toolName, String what) {
        if (person.isBlank()) {
            return new Resolved(null, Map.of("ok", false,
                    "reason", "没说是哪一张" + what + "。给申请人姓名，或先用清单工具拿到 requestId"));
        }
        List<Map<String, Object>> hits = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (nameMatches(str(row.get("person")), person)) {
                hits.add(row);
            }
        }
        if (hits.isEmpty()) {
            return new Resolved(null, Map.of("ok", false,
                    "reason", "待审里找不到「" + person + "」的" + what
                            + "（有 " + rows.size() + " 张，都不是这个人的）",
                    "note", "要么他这批已经审过/撤了，要么不在你负责的范围内。让用户核对一下。"));
        }
        if (hits.size() == 1) {
            return new Resolved(str(hits.get(0).get("requestId")), null);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "「" + person + "」有 " + hits.size() + " 张待审" + what + "，让用户挑一张，不要自己选");
        out.put("candidates", hits);
        out.put("choices", choicesOf(hits));
        out.put("choicesTitle", person + " · 挑一张单子");
        out.put("note", "用户点选后，把选中的 requestId 传给 " + toolName + " 再调一次");
        return new Resolved(null, out);
    }

    private static List<Map<String, Object>> choicesOf(List<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("label", String.valueOf(r.get("summary")));
            item.put("value", String.valueOf(r.get("requestId")));
            out.add(item);
        }
        return out;
    }

    private static <T> List<T> firstRows(List<T> rows) {
        return rows.size() <= MAX_ROWS ? rows : new ArrayList<>(rows.subList(0, MAX_ROWS));
    }

    /** 姓名匹配：包含即可（展示名可能带后缀）。 */
    private static boolean nameMatches(String candidate, String wanted) {
        if (candidate == null || candidate.isBlank() || wanted == null || wanted.isBlank()) {
            return false;
        }
        return candidate.contains(wanted.trim()) || wanted.trim().contains(candidate.trim());
    }

    private static String join(String sep, Object... parts) {
        StringBuilder sb = new StringBuilder();
        for (Object p : parts) {
            String s = str(p);
            if (s.isEmpty()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append(sep);
            }
            sb.append(s);
        }
        return sb.toString();
    }

    private static String text(JsonNode args, String field) {
        return args.path(field).asText("").trim();
    }

    private static String str(Object o) {
        if (o == null) return "";
        String s = String.valueOf(o).trim();
        return "null".equalsIgnoreCase(s) ? "" : s;
    }
}
