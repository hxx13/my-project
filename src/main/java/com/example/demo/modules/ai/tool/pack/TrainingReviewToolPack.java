package com.example.demo.modules.ai.tool.pack;

import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.training.service.TrainingAdminGate;
import com.example.demo.modules.training.service.TrainingService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 培训审批工具包 —— 学生审核页「培训审批」tab。
 *
 * <p><b>这个域最容易搞错的一点：「通过」= 审批 + 评分两道，各要一次。</b>
 * `training_enrollment` 有 `test_yn`（审批）与 `test_fraction`（评分）两个独立字段，
 * **都为 1 才算通过**；任一为 2 即「未通过」；任一为 0 = 流程中。
 * 所以「审批通过」**不等于**「这个学员培训过了」—— 说完必须点明另一道门的状态。
 * （这和笼位转移的三签是同一类陷阱：一次动作 ≠ 整单完成。）
 *
 * <p><b>权限怎么定的</b>：能力码 = `TrainingAdminGate#canManage`（非学生视角 且（≥SUPER_ADMIN 或 饲养组长）），
 * 与 HTTP 拦截器 `AdminAuthInterceptor#preHandleTrainingAdmin` **调同一个方法**；
 * 「能不能动这一条报名」由 `TrainingService` 里的 `checkOwner`（培训所属人或超管）回答，工具不重写。
 *
 * <p>副作用 **C**：审批/评分会改状态，双通过时还会**发证** —— 一律挂起等确认。
 */
@Component
public class TrainingReviewToolPack implements AiToolPack {

    public static final String CAP_PENDING = "ai.training.pending";
    public static final String CAP_DECIDE = "ai.training.decide";

    /** 待审清单一次最多回这么多行；按人定位不受这个上限影响。 */
    private static final int MAX_ROWS = 50;

    private final TrainingService trainingService;
    private final TrainingAdminGate trainingAdminGate;

    public TrainingReviewToolPack(TrainingService trainingService, TrainingAdminGate trainingAdminGate) {
        this.trainingService = trainingService;
        this.trainingAdminGate = trainingAdminGate;
    }

    @Override
    public String packKey() {
        return "training";
    }

    @Override
    public String displayName() {
        return "培训审批";
    }

    /**
     * L2 路由词。**此前一个都没有**（连这个方法都没重写）—— 于是「培训报名审一下」「谁还没批」
     * 这类说法永远命中不了本包，只能等"什么都没命中"时靠全包下发侥幸带上。
     * 真机反馈就是「看看我有什么待审核的」答不全：物资那域命中了，培训这域根本没被带上。
     */
    @Override
    public Set<String> routeHints() {
        return Set.of("培训", "报名", "审批", "审核", "考试", "试卷", "题库", "学员", "评分", "待审", "待办");
    }

    @Override
    public String defaultPrompt() {
        return """
                培训审批的口径：
                - **「通过」= 审批 + 评分两道，各要一次，两道都为「通过」才算这个学员培训过了。**
                  只过了审批**不能**说「已通过」，必须点明「还差评分」。这是本域最容易说错的地方。
                - 两道门各有「通过 / 不通过」两态。**任一道判「不通过」，整条就是未通过**（未通过的学生可以重新报名）。
                - 待审里的每一行都会告诉你**两道门各自的状态**与**这次还差哪道门**。别自己推，看清单给的。
                - **只有你所属的培训**（或你是超管）才动得了；别人的培训在清单里就看不到 —— 看不到就说看不到，
                  不要讲「没有待审」。
                - 审核是**写操作**，一定会先弹确认让人点。你只负责说清是哪一条（谁、哪个培训、哪一场），
                  不要在正文里替用户下结论说「已通过」。
                - **一条一条办**：用户一次说了好几个人，就一个人一次调用，别合并。同一人报了多个培训时，
                  工具会把候选交回来让用户挑，不要自己挑。
                - 通过后如果房间权限要下放给学员，那是在页面上单独做的（「下放房间」），本工具不做。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(
                // 与 AdminAuthInterceptor#preHandleTrainingAdmin 同口径，判定在 TrainingAdminGate#canManage
                CAP_PENDING, trainingAdminGate::canManage,
                CAP_DECIDE, trainingAdminGate::canManage);
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listPendingTrainingEnrollments(), auditTrainingEnrollment(), scoreTrainingEnrollment());
    }

    // ── 读 ──

    private AiTool listPendingTrainingEnrollments() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "person": { "type": "string", "description": "可选。按学员姓名筛" },
                    "trainingKeyword": { "type": "string", "description": "可选。按培训名筛" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listPendingTrainingEnrollments",
                "列出**你所属（或超管可见）**的培训里待处理的报名：还差审批或还差评分的那些。"
                        + "每行都会给出「审批」与「评分」两道门各自的状态、以及这次还差哪道。",
                schema,
                CAP_PENDING,
                SideEffect.READ,
                (ctx, args) -> {
                    List<Map<String, Object>> rows = pendingRows(ctx.actor());
                    String person = text(args, "person").toLowerCase();
                    String kw = text(args, "trainingKeyword").toLowerCase();
                    List<Map<String, Object>> out = new ArrayList<>();
                    for (Map<String, Object> r : rows) {
                        if (!person.isEmpty() && !str(r.get("person")).toLowerCase().contains(person)) {
                            continue;
                        }
                        if (!kw.isEmpty() && !str(r.get("training")).toLowerCase().contains(kw)) {
                            continue;
                        }
                        out.add(r);
                    }
                    Map<String, Object> res = new LinkedHashMap<>();
                    res.put("total", out.size());
                    res.put("enrollments", firstRows(out));
                    if (out.isEmpty()) {
                        res.put("note", rows.isEmpty()
                                ? "当前没有需要你处理的培训报名（只含你所属的培训）。"
                                : "有 " + rows.size() + " 条待处理，但没有符合筛选条件的。");
                    }
                    return res;
                });
    }

    // ── 写：审批 / 评分（两道门，各一次）──

    private AiTool auditTrainingEnrollment() {
        return decide("auditTrainingEnrollment", "审批", true);
    }

    private AiTool scoreTrainingEnrollment() {
        return decide("scoreTrainingEnrollment", "评分", false);
    }

    /**
     * @param audit true = 审批那一关（test_yn），false = 评分那一关（test_fraction）
     */
    private AiTool decide(String name, String gateLabel, boolean audit) {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "enrollmentId": { "type": "integer", "description": "报名记录 id。**只在清单结果里拿到过时才填**" },
                    "person": { "type": "string", "description": "学员姓名。不知道 id 时用这个；命中多条会把候选交回来让用户挑" },
                    "trainingKeyword": { "type": "string", "description": "可选。同一个人报了多个培训时用它缩小范围" },
                    "decision": {
                      "type": "string",
                      "enum": ["approved", "rejected"],
                      "description": "approved=这道门判「通过」，rejected=判「不通过」。任一道判不通过，整条就是未通过"
                    }
                  },
                  "required": ["decision"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                name,
                "把某条培训报名的**" + gateLabel + "**这一关判为通过或不通过（培训的通过要审批 + 评分两道都为通过）。"
                        + "调用它会先挂起等用户点确认，所以**不要**在正文里说已经办好了。"
                        + (audit ? "这是「审批」那道门；「评分」是另一个工具。" : "这是「评分」那道门；「审批」是另一个工具。"),
                schema,
                CAP_DECIDE,
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> doDecide(ctx.actor(), args, audit),
                null,
                args -> gateLabel + "：" + decisionLabel(args == null ? "" : args.path("decision").asText("")));
    }

    private Map<String, Object> doDecide(User actor, JsonNode args, boolean audit) {
        String decision = text(args, "decision");
        if (!"approved".equals(decision) && !"rejected".equals(decision)) {
            return Map.of("ok", false, "reason", "decision 只能是 approved（通过）或 rejected（不通过）");
        }
        Resolved target = resolve(actor, args);
        if (target.error != null) {
            return target.error;
        }
        int state = "approved".equals(decision) ? 1 : 2;
        int rows = audit
                ? trainingService.audit(Long.valueOf(target.id), state, actor)
                : trainingService.score(Long.valueOf(target.id), state, actor);
        if (rows == 0) {
            return Map.of("ok", false, "enrollmentId", target.id,
                    "reason", "这条报名没有发生变化（可能状态刚被改过）。让用户刷新看一下再决定");
        }
        return outcome(actor, target, audit, state);
    }

    /**
     * 写完之后**回读真实状态**再看两道门 —— 判据只有一处（`test_yn` 与 `test_fraction` 都为 1 才算通过），
     * 不能拿「我发出的请求返回了」当结果。
     */
    private Map<String, Object> outcome(User actor, Resolved target, boolean audit, int state) {
        Integer testYn = null;
        Integer testFraction = null;
        try {
            for (Map<String, Object> row : trainingService.listEnrollments(target.occurrenceId)) {
                if (target.id.equals(str(row.get("id")))) {
                    testYn = intOrNull(row.get("testYn"));
                    testFraction = intOrNull(row.get("testFraction"));
                    break;
                }
            }
        } catch (RuntimeException ignore) {
            // 回读失败不影响「这次判了」这个事实，下面的文案会退到不含另一道门的状态
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("enrollmentId", target.id);
        out.put("testYn", testYn);
        out.put("testFraction", testFraction);
        out.put("note", outcomeNote(target, audit, state, testYn, testFraction));
        return out;
    }

    private static String outcomeNote(Resolved target, boolean audit, int state,
                                     Integer testYn, Integer testFraction) {
        String gate = audit ? "审批" : "评分";
        String who = target.person.isEmpty() ? "该学员" : "「" + target.person + "」";
        String what = target.training.isEmpty() ? "这条报名" : "「" + target.training + "」";
        // 开头这句是给模型吃的定心丸：工具描述里写着「调用它会先挂起等用户点确认」，
        // 于是**确认之后**它仍在正文补一句「点一下才生效」—— 用户会以为还要再点。
        // 结果里明说「已经生效」，它就不补了（转移那边同样踩过）。
        String done = "确认已收到并已生效：";

        if (state == 2) {
            return done + "已把" + who + what + "的**" + gate + "**判为**不通过** —— 整条即为未通过"
                    + "（未通过的学生可以重新报名）。";
        }
        boolean otherPassed = audit ? (testFraction != null && testFraction == 1)
                : (testYn != null && testYn == 1);
        boolean otherRejected = audit ? (testFraction != null && testFraction == 2)
                : (testYn != null && testYn == 2);
        String other = audit ? "评分" : "审批";

        if (otherRejected) {
            return done + "已把" + gate + "判为通过，但另一道门（" + other + "）是**不通过** —— 整条仍为未通过。";
        }
        if (otherPassed) {
            return done + "两道门（审批 + 评分）都为通过 —— " + who + what + "**已通过**（证书按培训规则发放）。";
        }
        return done + "已把" + who + what + "的**" + gate + "**判为通过。**但两道门都通过才算过**，"
                + "现在还差**" + other + "**这一道 —— 跟用户说清这一步还没完。";
    }

    // ── 投影与定位 ──

    /** 待审报名（服务端已按「我是所属人 或 我收藏」过滤，订阅的置顶）。 */
    private List<Map<String, Object>> pendingRows(User actor) {
        List<Map<String, Object>> rows = trainingService.listPending(actor.getId());
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Integer testYn = intOrNull(r.get("testYn"));
            Integer testFraction = intOrNull(r.get("testFraction"));
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("enrollmentId", str(r.get("enrollmentId")));
            // 场次 id 必须带出来：写完要按它回读这条报名的两道门真实状态。
            // 漏了它，回读会查不到行 → 文案退化成「还差另一道门」（把双通过说成没过），
            // 这正是不回读就发现不了的那类错（2026-10-08 单测逮到）。
            row.put("occurrenceId", str(r.get("occurrenceId")));
            row.put("person", str(r.get("name")));
            row.put("jobNumber", str(r.get("jobNumber")));
            row.put("personGroup", str(r.get("projectGroup")));
            row.put("training", str(r.get("trainingName")));
            row.put("when", when(r));
            row.put("campus", str(r.get("campus")));
            if (Boolean.TRUE.equals(r.get("subscribed")) || (r.get("subscribed") instanceof Number n && n.intValue() != 0)) {
                row.put("subscribed", true);
            }
            row.put("auditState", gateState(testYn));
            row.put("scoreState", gateState(testFraction));
            row.put("missingGate", missingGate(testYn, testFraction));
            row.put("summary", join(" · ", r.get("name"), r.get("trainingName"),
                    when(r), missingGate(testYn, testFraction)));
            out.add(row);
        }
        return out;
    }

    private static String when(Map<String, Object> r) {
        String start = str(r.get("startTime"));
        String end = str(r.get("endTime"));
        String address = str(r.get("address"));
        StringBuilder sb = new StringBuilder(start);
        if (!end.isEmpty()) {
            sb.append(sb.length() > 0 ? "–" : "").append(end);
        }
        if (!address.isEmpty()) {
            sb.append(sb.length() > 0 ? " " : "").append(address);
        }
        return sb.toString();
    }

    /** 0/1/2 → 待处理 / 通过 / 不通过。null 当待处理（字段缺省）。 */
    private static String gateState(Integer v) {
        if (v == null || v == 0) {
            return "待处理";
        }
        return v == 1 ? "通过" : "不通过";
    }

    /** 这次还差哪道门。两道都为 1（或任一为 2）时不该出现在待审里，这里兜一下给个中性说法。 */
    private static String missingGate(Integer testYn, Integer testFraction) {
        boolean auditPending = testYn == null || testYn == 0;
        boolean scorePending = testFraction == null || testFraction == 0;
        if (auditPending && scorePending) {
            return "还差审批与评分";
        }
        if (auditPending) {
            return "还差审批";
        }
        if (scorePending) {
            return "还差评分";
        }
        return "两道门都已判过";
    }

    /** 定位到的报名：id + 回读用的场次 + 人名/培训名（写文案要用）。 */
    private record Resolved(String id, Long occurrenceId, String person, String training,
                            Map<String, Object> error) {
    }

    /**
     * 在**本人待处理的报名**里按 id 或人名定位一条。
     *
     * <p>不提供「拿 id 直连服务」的路：只在自己这份清单里找，别人的培训、已经处理完的报名
     * 都在触到服务层之前被挡住，跨域错调也无从发生（与笼位包同一约定）。
     */
    private Resolved resolve(User actor, JsonNode args) {
        List<Map<String, Object>> rows = pendingRows(actor);
        String id = text(args, "enrollmentId");
        Map<String, Object> hit = null;

        if (!id.isEmpty()) {
            for (Map<String, Object> r : rows) {
                if (id.equals(str(r.get("enrollmentId")))) {
                    hit = r;
                    break;
                }
            }
            if (hit == null) {
                return new Resolved(null, null, "", "", Map.of("ok", false, "enrollmentId", id,
                        "reason", "待处理的报名里没有这一条（要么不在你所属的培训里，要么两道门都已经判过了）",
                        "note", "先用清单工具看有哪些待处理报名"));
            }
        } else {
            String person = text(args, "person");
            if (person.isBlank()) {
                return new Resolved(null, null, "", "", Map.of("ok", false,
                        "reason", "没说是哪一条报名。给学员姓名，或先用清单工具拿到 enrollmentId"));
            }
            String kw = text(args, "trainingKeyword").toLowerCase();
            List<Map<String, Object>> hits = new ArrayList<>();
            for (Map<String, Object> r : rows) {
                if (!nameMatches(str(r.get("person")), person)) {
                    continue;
                }
                if (!kw.isEmpty() && !str(r.get("training")).toLowerCase().contains(kw)) {
                    continue;
                }
                hits.add(r);
            }
            if (hits.isEmpty()) {
                return new Resolved(null, null, person, "", Map.of("ok", false,
                        "reason", "待处理里找不到「" + person + "」的报名（共 " + rows.size() + " 条待处理，都不是这个人的）",
                        "note", "要么已经处理完，要么不在你所属的培训里。让用户核对一下。"));
            }
            if (hits.size() > 1) {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("ok", false);
                out.put("reason", "「" + person + "」有 " + hits.size() + " 条待处理报名，让用户挑一条，不要自己选");
                out.put("candidates", hits);
                out.put("choices", choicesOf(hits));
                out.put("choicesTitle", person + " · 挑一条报名");
                out.put("note", "用户点选后，把选中的 enrollmentId 传给本工具再调一次");
                return new Resolved(null, null, person, "", out);
            }
            hit = hits.get(0);
        }
        return new Resolved(str(hit.get("enrollmentId")), longOrNull(hit.get("occurrenceId")),
                str(hit.get("person")), str(hit.get("training")), null);
    }

    private static List<Map<String, Object>> choicesOf(List<Map<String, Object>> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("label", String.valueOf(r.get("summary")));
            item.put("value", String.valueOf(r.get("enrollmentId")));
            out.add(item);
        }
        return out;
    }

    private static String decisionLabel(String decision) {
        return switch (decision == null ? "" : decision) {
            case "approved" -> "通过";
            case "rejected" -> "不通过";
            default -> decision == null || decision.isBlank() ? "未指明" : decision;
        };
    }

    private static <T> List<T> firstRows(List<T> rows) {
        return rows.size() <= MAX_ROWS ? rows : new ArrayList<>(rows.subList(0, MAX_ROWS));
    }

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

    private static Integer intOrNull(Object o) {
        if (o instanceof Number n) {
            return n.intValue();
        }
        try {
            return o == null ? null : Integer.valueOf(String.valueOf(o).trim());
        } catch (Exception e) {
            return null;
        }
    }

    private static Long longOrNull(Object o) {
        if (o instanceof Number n) {
            return n.longValue();
        }
        try {
            return o == null ? null : Long.valueOf(String.valueOf(o).trim());
        } catch (Exception e) {
            return null;
        }
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
