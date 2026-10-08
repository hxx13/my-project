package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.material.dto.MaterialRequestLineView;
import com.example.demo.modules.material.dto.MaterialRequestView;
import com.example.demo.modules.material.service.MaterialService;
import com.example.demo.modules.twin.scan.delay.service.ScanDelayRequestService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.function.Predicate;

/**
 * 学生审核页（{@code /admin/material/review}）的工具包 —— 目前覆盖**物资申领**与**延迟免冻**两个 tab。
 *
 * <p>这两个 tab 是全站待办量最大的两处（侧栏「学生审核」角标的底色就是它俩），所以排在笼位、培训之前。
 *
 * <p><b>权限怎么定的</b>：能力码只到「能打开这个页面」这一层（教职工起），
 * **「能不能对这张单子做」一律交给业务服务自己的判定**——
 * 物资走 {@code MaterialService.canReview}（按物品上配的审核人名单），
 * 延迟免冻走 {@code ScanDelayRequestService.canUserReviewDelayRequest}（按房间归属）。
 * 这里**不重写一遍**那套判定：AI 只读一份数据源、拿一个动作，够不着的地方服务自己会拒。
 *
 * <p><b>副作用等级一律 C</b>：通过减免冻会真的改大华卡上的豁免并推送到学生手机，
 * 物资审核会动库存与流水 —— 都不是「失败可安全重试」的纯库写。按 §8 一律挂起等用户点确认。
 */
@Component
public class StudentReviewToolPack implements AiToolPack {

    public static final String CAP_PENDING_LIST = "ai.review.pending";
    public static final String CAP_DECIDE = "ai.review.decide";

    /** 待审清单一次最多回这么多行；超出只回计数，逼模型加条件或让用户去页面上看。 */
    private static final int MAX_ROWS = 50;

    private final MaterialService materialService;
    private final ScanDelayRequestService scanDelayRequestService;

    public StudentReviewToolPack(MaterialService materialService,
                                 ScanDelayRequestService scanDelayRequestService) {
        this.materialService = materialService;
        this.scanDelayRequestService = scanDelayRequestService;
    }

    @Override
    public String packKey() {
        return "review";
    }

    @Override
    public String displayName() {
        return "学生审核";
    }

    @Override
    public Set<String> routeHints() {
        // L2 路由词：这些话/页面提到本域时带上本包（见 AiPackRouter）。
        return Set.of("申领", "待审", "驳回", "物资需求", "延迟免冻");
    }

    @Override
    public String defaultPrompt() {
        return """
                学生审核的口径：
                - 「待审」永远是**当前登录人有权审的那些**，跟页面上的列表同源。别人负责的单子在工具里查不到，
                  查不到就如实说查不到，不要说「没有待审」。
                - 审核是**写操作**，一定会先弹确认让人点。你只负责说清是哪一张单子，
                  不要在正文里替用户下结论说「已通过」。
                - 一次只处理一张单子。用户一次说了好几个人，就一个一个来，别把多张单子并成一次调用。
                - **定位单子优先走「人名」，不要自己列候选**：
                  用户只报人名时，直接调对应的写工具并把 person 传进去（**别传 requestId**）。
                  命中多张时工具会把候选做成**可点选选项**，用户点一下就是回答 ——
                  这比你在正文里手打一遍候选清单好得多，也不许替他挑。
                - 什么时候用 requestId：用户自己说清了是哪一张（报了单号），或者你**已经在待审清单里
                  唯一确定**了那一张。只要还剩两个可能，就回到上面那条走 person。
                - 不在待审里、或连人名都对不上时，才回正文里问用户 —— 这是最后手段，不是首选。
                - **驳回要不要理由，两类不一样**：延迟免冻的驳回**能**留一句原因（用户没说就先问他要一句）；
                  物资申领的驳回接口**不收理由**，别问用户要、也别承诺能记下来 —— 直接跟他讲清这条留不上。
                - 已经审过的单子在待审里查不到，这不是出错；告诉用户这张单子已经处理过了。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(
                // 页面入口是教职工（物资的 canReview / 延迟的 entry 都把 MEMBER 挡掉）
                CAP_PENDING_LIST, user -> level(user) >= RoleEnum.STAFF.getLevel(),
                CAP_DECIDE, user -> level(user) >= RoleEnum.STAFF.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listPendingReviews(), approveMaterialRequest(), rejectMaterialRequest(),
                approveScanDelayRequest(), rejectScanDelayRequest());
    }

    // ── 读 ──

    private AiTool listPendingReviews() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "category": {
                      "type": "string",
                      "enum": ["material", "scanDelay", "all"],
                      "description": "看哪一类待审：material=物资申领，scanDelay=延迟免冻，省略或 all=两类都看"
                    }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listPendingReviews",
                "列出当前登录人**有权审**的待办：物资申领（material）与延迟免冻（scanDelay）。"
                        + "用户问「有多少待审」「有什么要我审的」时用它。返回里每一行都带 requestId，"
                        + "后续通过/驳回就用这个 id。",
                schema,
                CAP_PENDING_LIST,
                SideEffect.READ,
                (ctx, args) -> {
                    String category = text(args, "category");
                    boolean wantMaterial = category.isEmpty() || "all".equals(category) || "material".equals(category);
                    boolean wantDelay = category.isEmpty() || "all".equals(category) || "scanDelay".equals(category);

                    Map<String, Object> out = new LinkedHashMap<>();
                    int total = 0;
                    if (wantMaterial) {
                        List<Map<String, Object>> rows = materialPending(ctx.actor());
                        total += rows.size();
                        out.put("materialCount", rows.size());
                        out.put("material", firstRows(rows));
                    }
                    if (wantDelay) {
                        List<Map<String, Object>> rows = delayPending(ctx.actor());
                        total += rows.size();
                        out.put("scanDelayCount", rows.size());
                        out.put("scanDelay", firstRows(rows));
                    }
                    out.put("total", total);
                    if (total == 0) {
                        out.put("note", "当前没有需要你审的单子。只包含你有权审的那些，别人的待办这里看不到。");
                    } else if (total > MAX_ROWS) {
                        out.put("note", "待审总数超过 " + MAX_ROWS + " 条，清单只列了前 " + MAX_ROWS
                                + " 条（各类的准确条数看 materialCount / scanDelayCount）。"
                                + "要办具体某一单，直接按申请人找，或让用户去页面上看。");
                    }
                    return out;
                });
    }

    // ── 写（都要过确认）──

    private AiTool approveMaterialRequest() {
        return decideMaterial("approveMaterialRequest", true);
    }

    private AiTool rejectMaterialRequest() {
        return decideMaterial("rejectMaterialRequest", false);
    }

    private AiTool decideMaterial(String name, boolean approve) {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "requestId": { "type": "string", "description": "物资申领单 id。**只在 listPendingReviews 的结果里拿到过时才填**" },
                    "person": { "type": "string", "description": "申请人姓名。不知道 requestId 时用这个 —— 工具会在这个人的待审里找；找到多张会把候选交回来让用户挑" }
                  },
                  "additionalProperties": false
                }""";
        String verb = approve ? "通过" : "驳回";
        return new AiTool(
                name,
                verb + "一张物资申领单。只处理当前登录人有权审的单子，没权限的会被业务侧拒掉。"
                        + "调用它会先挂起等你点确认，所以**不要**在正文里说已经办好了。",
                schema,
                CAP_DECIDE,
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    String id = text(args, "requestId");
                    if (id.isEmpty()) {
                        Resolved resolved = resolveMaterial(ctx.actor(), text(args, "person"), name);
                        if (resolved.error != null) {
                            return resolved.error;
                        }
                        id = resolved.id;
                    }
                    Result<MaterialRequestView> result = approve
                            ? materialService.approve(ctx.actor(), id)
                            : cast(materialService.reject(ctx.actor(), id));
                    return describeResult(result, id, approve ? "已通过" : "已驳回");
                });
    }

    private AiTool approveScanDelayRequest() {
        return decideDelay("approveScanDelayRequest", true);
    }

    private AiTool rejectScanDelayRequest() {
        return decideDelay("rejectScanDelayRequest", false);
    }

    private AiTool decideDelay(String name, boolean approve) {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "requestId": { "type": "integer", "description": "延迟免冻申请 id。**只在 listPendingReviews 的结果里拿到过时才填**" },
                    "person": { "type": "string", "description": "刷卡人姓名。不知道 requestId 时用这个" },
                    "reason": { "type": "string", "description": "驳回原因，一句话。**只驳回时填**；通过不要填" }
                  },
                  "additionalProperties": false
                }""";
        String verb = approve ? "通过" : "驳回";
        return new AiTool(
                name,
                verb + "一条延迟免冻申请。通过会让该人在这间房的这次刷卡放行。"
                        + "调用它会先挂起等你点确认，所以**不要**在正文里说已经办好了。",
                schema,
                CAP_DECIDE,
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    Long id = longOrNull(args, "requestId");
                    if (id == null) {
                        Resolved resolved = resolveDelay(ctx.actor(), text(args, "person"), name);
                        if (resolved.error != null) {
                            return resolved.error;
                        }
                        id = Long.valueOf(resolved.id);
                    }
                    String reason = approve ? null : text(args, "reason");
                    Map<String, Object> result = scanDelayRequestService.reviewRequest(
                            id, approve, ctx.actor().getId(), reason);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("requestId", id);
                    out.put("status", result.get("status"));
                    out.put("note", approve ? "已通过并放行" : "已驳回");
                    return out;
                });
    }

    // ── 定位单据 ──

    /** 定位结果：要么给出 id，要么给出「让用户挑」的候选（两者互斥）。 */
    private record Resolved(String id, Map<String, Object> error) {
    }

    /**
     * 按申请人从**待审**里找单子。用户说人名时走这条路。
     *
     * <p>只在待审里找是有意的：用户说的是「把他那张申请批了」，那张申请就该还在待审队列里。
     * 拿一张已审结的单子进来，业务侧也会拒（canReview 依赖状态），但先在这里说清更好懂。
     */
    private Resolved resolveMaterial(User actor, String person, String toolName) {
        if (person.isBlank()) {
            return new Resolved(null, Map.of("ok", false,
                    "reason", "没说是哪一张单子。给申请人姓名，或者先用 listPendingReviews 拿到 requestId"));
        }
        List<Map<String, Object>> rows = materialPending(actor);
        List<Map<String, Object>> hits = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (nameMatches(String.valueOf(row.get("applicant")), person)) {
                hits.add(row);
            }
        }
        return pickOne(hits, person, toolName, "有 " + rows.size() + " 张待审单子，但都不是这个人的");
    }

    private Resolved resolveDelay(User actor, String person, String toolName) {
        if (person.isBlank()) {
            return new Resolved(null, Map.of("ok", false,
                    "reason", "没说是哪一条申请。给刷卡人姓名，或者先用 listPendingReviews 拿到 requestId"));
        }
        List<Map<String, Object>> rows = delayPending(actor);
        List<Map<String, Object>> hits = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            if (nameMatches(String.valueOf(row.get("person")), person)) {
                hits.add(row);
            }
        }
        return pickOne(hits, person, toolName, "有 " + rows.size() + " 条待审申请，但都不是这个人的");
    }

    private static Resolved pickOne(List<Map<String, Object>> hits, String person, String toolName, String noneNote) {
        if (hits.isEmpty()) {
            return new Resolved(null, Map.of("ok", false,
                    "reason", "待审里找不到「" + person + "」的单子（" + noneNote + "）",
                    "note", "要么他这批已经审过/撤了，要么他不在你有权审的范围内。让用户核对一下。"));
        }
        if (hits.size() == 1) {
            return new Resolved(String.valueOf(hits.get(0).get("requestId")), null);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "「" + person + "」有 " + hits.size() + " 张待审单子，让用户挑一张，不要自己选");
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

    // ── 待审清单的投影 ──

    private List<Map<String, Object>> materialPending(User actor) {
        Result<List<MaterialRequestView>> result = materialService.listPendingForReview(actor);
        List<MaterialRequestView> list = result == null || result.getData() == null ? List.of() : result.getData();
        List<Map<String, Object>> out = new ArrayList<>();
        for (MaterialRequestView r : list) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("requestId", r.getId());
            row.put("applicant", str(r.getApplicantName()));
            row.put("applicantGroup", str(r.getApplicantGroup()));
            row.put("status", str(r.getStatus()));
            row.put("createdAt", str(r.getCreatedAt()));
            String items = itemSummary(r.getLines());
            row.put("items", items);
            row.put("summary", join(" · ", r.getApplicantName(),
                    items.isEmpty() ? "物资申领" : items, r.getCreatedAt()));
            out.add(row);
        }
        return out;
    }

    private List<Map<String, Object>> delayPending(User actor) {
        List<Map<String, Object>> rows = scanDelayRequestService.listPendingEnriched(actor.getId());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("requestId", r.get("id"));
            row.put("person", str(r.get("subjectDisplayName")));
            row.put("personGroup", str(r.get("subjectGroupName")));
            row.put("room", str(r.get("roomName")));
            row.put("option", str(r.get("optionLabel")));
            row.put("createdAt", str(r.get("createdAt")));
            row.put("summary", join(" · ", r.get("subjectDisplayName"), r.get("roomName"),
                    r.get("optionLabel"), r.get("createdAt")));
            out.add(row);
        }
        return out;
    }

    private static <T> List<T> firstRows(List<T> rows) {
        return rows.size() <= MAX_ROWS ? rows : new ArrayList<>(rows.subList(0, MAX_ROWS));
    }

    /** 物品行压成一句「洗手液×2、手套×1」——模型要的是「这是什么单子」，不是二十个字段。 */
    private static String itemSummary(List<MaterialRequestLineView> lines) {
        if (lines == null || lines.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (MaterialRequestLineView line : lines) {
            if (line == null) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append('、');
            }
            sb.append(str(line.getSnapshotName()));
            if (line.getQty() != null) {
                sb.append('×').append(line.getQty());
            }
            if (sb.length() > 200) {
                return sb.append("…").toString();
            }
        }
        return sb.toString();
    }

    // ── 结果描述 ──

    /**
     * 把 {@code Result} 翻成工具结果。
     *
     * <p>{@code Result.error} 是**业务拒绝**（无权审、状态已变），HTTP 是 200 —— 不显式看 success
     * 就会把「被拦住没做事」说成「已通过」。同一个坑在别处踩过（小程序写请求必须查 success）。
     */
    private static Map<String, Object> describeResult(Result<?> result, String id, String doneWord) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("requestId", id);
        boolean ok = result != null && Boolean.TRUE.equals(result.getSuccess());
        out.put("ok", ok);
        if (!ok) {
            out.put("reason", result == null ? "没有返回结果" : str(result.getMessage()));
            out.put("note", "这单没办成，把原因原样告诉用户，不要改口说已经通过");
            return out;
        }
        out.put("note", doneWord);
        return out;
    }

    @SuppressWarnings("unchecked")
    private static Result<MaterialRequestView> cast(Result<?> raw) {
        return (Result<MaterialRequestView>) raw;
    }

    // ── 小工具 ──

    /** 姓名匹配：包含即可（用户常说「张三」而库里的展示名可能是「张三（3F）」）。 */
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

    private static int level(User user) {
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        return role.getLevel();
    }

    private static String text(JsonNode args, String field) {
        return args.path(field).asText("").trim();
    }

    /** 取整数参数：兼容模型把数字发成字符串（"12" 也要认）。 */
    private static Long longOrNull(JsonNode args, String field) {
        JsonNode n = args.path(field);
        if (n.isMissingNode() || n.isNull()) {
            return null;
        }
        if (n.canConvertToLong()) {
            return n.asLong();
        }
        try {
            return Long.valueOf(n.asText("").trim());
        } catch (Exception e) {
            return null;
        }
    }

    private static String str(Object o) {
        if (o == null) return "";
        String s = String.valueOf(o).trim();
        return "null".equalsIgnoreCase(s) ? "" : s;
    }
}
