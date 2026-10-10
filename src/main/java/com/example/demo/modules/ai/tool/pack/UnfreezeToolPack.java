package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.roommapping.entity.RoomMappingRoom;
import com.example.demo.modules.roommapping.mapper.RoomMappingRoomMapper;
import com.example.demo.modules.twin.card.entity.TwinCardMapping;
import com.example.demo.modules.twin.card.service.TwinCardMappingService;
import com.example.demo.modules.twin.card.service.TwinExemptAdminService;
import com.example.demo.modules.twin.common.mapper.TwinDashboardMapper;
import com.example.demo.modules.twin.scan.dto.DahuaIssueAccessPrefillVO;
import com.example.demo.modules.twin.scan.service.DahuaIssueAccessRulePrefillService;
import com.fasterxml.jackson.databind.JsonNode;
import net.sourceforge.pinyin4j.PinyinHelper;
import net.sourceforge.pinyin4j.format.HanyuPinyinCaseType;
import net.sourceforge.pinyin4j.format.HanyuPinyinOutputFormat;
import net.sourceforge.pinyin4j.format.HanyuPinyinToneType;
import net.sourceforge.pinyin4j.format.exception.BadHanyuPinyinOutputFormatCombination;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.function.Predicate;

/**
 * 免冻结（门禁卡冻结豁免）工具包。
 *
 * <p>这一包连接两个接口：`GET /twin/mappings/search`（人名→卡号）与 `POST /twin/mappings/exempt`（改豁免）。
 * 但**不按接口暴露**：工具是业务动词（「授予/收回某某的免冻豁免」），
 * `cardNo` 是实现细节 —— 它是 `1AB38E4B` 这种十六进制串，让模型经手只会给它编造的机会。
 *
 * <p>执行体调 {@link TwinExemptAdminService#apply}，与 HTTP 入口**同一个方法**（含给学生推送通知那一步）。
 * 直接调 `TwinCardMappingService` 会漏掉通知 —— 那是这次抽方法的原因。
 *
 * <p><b>副作用等级 B（幂等写）</b>：`updateExemptFlag` 是纯 DB，不碰大华硬件（冻结/解冻才碰），
 * 所以不需要二次确认，失败可安全重试。
 */
@Component
public class UnfreezeToolPack implements AiToolPack {

    public static final String CAP_EXEMPT_SET = "ai.twin.exempt.set";

    /** 客户端来源标记，写进豁免台账；AI 发起的与手工发起的要能分开追溯。 */
    private static final String AI_CLIENT_TAG = "ai-assistant";

    /** 只用来读我们自己写出去的 room_ids JSON */
    private static final com.fasterxml.jackson.databind.ObjectMapper OM =
            new com.fasterxml.jackson.databind.ObjectMapper();

    /**
     * 时长候选。
     *
     * <p>value 用**自然语言**：芯片点下去就是下一条用户消息，模型按本包 L1 口径
     * （「延迟 2 小时」→ durationMinutes=120；「今天都有效」→ -1）换算成参数。
     * 换成裸数字（如 "120"）模型得猜单位，猜错就是另一种事故。
     */
    private static final List<Map<String, Object>> TIME_CHOICES = List.of(
            Map.of("label", "30 分钟", "value", "延迟 30 分钟"),
            Map.of("label", "1 小时", "value", "延迟 1 小时"),
            Map.of("label", "2 小时", "value", "延迟 2 小时"),
            Map.of("label", "4 小时", "value", "延迟 4 小时"),
            Map.of("label", "今天都有效", "value", "今天都有效"));

    private final TwinCardMappingService mappingService;
    private final TwinExemptAdminService exemptAdminService;
    private final DahuaIssueAccessRulePrefillService prefillService;
    private final TwinDashboardMapper dashboardMapper;
    private final RoomMappingRoomMapper roomMappingRoomMapper;

    public UnfreezeToolPack(TwinCardMappingService mappingService,
                            TwinExemptAdminService exemptAdminService,
                            DahuaIssueAccessRulePrefillService prefillService,
                            TwinDashboardMapper dashboardMapper,
                            RoomMappingRoomMapper roomMappingRoomMapper) {
        this.mappingService = mappingService;
        this.exemptAdminService = exemptAdminService;
        this.prefillService = prefillService;
        this.dashboardMapper = dashboardMapper;
        this.roomMappingRoomMapper = roomMappingRoomMapper;
    }

    @Override
    public String packKey() {
        return "unfreeze";
    }

    @Override
    public String displayName() {
        return "门禁免冻";
    }

    @Override
    public Set<String> routeHints() {
        // L2 路由词：这些话/页面提到本域时带上本包（见 AiPackRouter）。
        return Set.of("免冻", "豁免", "冻结", "受控", "发卡", "卡号");
    }

    @Override
    public String defaultPrompt() {
        return """
                免冻结豁免的口径：
                - 「延迟两小时」这类**相对时长**，用 durationMinutes 传 120；说「今天都有效」传 -1。
                - 「到 18:00」这类**绝对时点**，用 untilTime 传 "18:00"。两个都给了以 untilTime 为准。
                - 也可以按**次数**限制（maxCount），或时长+次数一起（mode=BOTH）。
                - **授权必须指定房间**，且只能从该人已授权的房间里选。用户没说房间时，
                  工具会把这个人可选的房间列给你 —— 你要**把这些房间列给用户让他挑**，不要自己替他选，
                  也不要照抄上文的房间列表：每次都重新问工具要。
                  **一次挑一间**（界面上的房间是可点项，点一下就是一间），用户要几间就分几次办 ——
                - **名字或房间名差一点，不要直接回"找不到 / 不在范围里"**：工具会给出**最接近的候选**
                  （人名按像不像挑几位、房间按接近度排好序）。把它们**以芯片交给用户点一下确认**即可 ——
                  允许猜，但必须用户点头；不要在正文里复述候选，也不要替他认定。
                  别说「可多选」，那和界面对不上。
                - 同样地，用户没说时长时工具会返回**时长候选**（30 分钟 / 1 小时 / … / 今天都有效），
                  也要列给用户挑。房间与时长是两问，工具**可能一次把两道都返回** ——
                  载体用向导一次问完，用户答完那一条消息里两者都在；候选回来什么就问什么，
                  别自己编、也别拆成两次问（拆开就会变成「答了这道、那道又没了」）。
                - **用户没说的参数不要自己凑**：没提时长，就别照上一轮的「延迟两小时」办；
                  没提房间，就别拿上文出现过的房间顶上。缺什么就让用户挑候选、或直接问。
                - 这个人**已经在豁免中**时，再授一次是**覆盖**不是叠加：原来的到期时间与房间会被本次的替换掉，
                  要跟用户说清「会替换原来的 X」，别含糊成「叠加/覆盖」。
                - 这个人的豁免状态也一样：先调工具看本次返回的 alreadyExempt，不要凭上文说他「已经豁免了」。
                - 一个人可能有多张卡或查不到卡，工具会如实返回，不要替用户决定找谁。
                - 收回豁免（改回「受控」）只需说人名，不需要房间和时长。
                - **要「查现在谁被豁免」用 listActiveExemptions**，不要凭上文列人（豁免会被人手工改、
                  也会被定时任务到期收回）。用户说「把豁免都撤了」时：先列名单，再逐个收回，别漏也别多。

                [批量] 用户可能一次粘贴一份名单，一行一个人，例如：
                    张皓瀚 202A 到18:00
                    林安顺 502A、401 延迟2小时
                    王宇 202A 3次
                逐行独立判断：参数齐的直接办，缺参数的单独问他，
                **不要因为某一行缺参数就把整批停下**；一次可以把多个人的调用并行发出。
                """;
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(
                // 与 TwinMappingController#updateExemptFlag 的 requireAdmin 同口径
                CAP_EXEMPT_SET, user -> level(user) >= RoleEnum.ADMIN.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listActiveExemptions(), grantExemption(), revokeExemption());
    }

    // ── 工具 ──

    /**
     * 列出**当前生效**的豁免名单。
     *
     * <p>没有它的时候，「现在谁被豁免了」只能靠上文猜 —— 而豁免是会被人手工改、被定时任务收回的，
     * 上文随时可能过期。批量撤销也必须先拿这份名单，不能凭记忆点名。
     */
    private AiTool listActiveExemptions() {
        String schema = """
                { "type": "object", "properties": {}, "additionalProperties": false }""";
        return new AiTool(
                "listActiveExemptions",
                "列出当前生效的免冻豁免：谁被豁免、哪几个房间、什么时候到期。"
                        + "**问「现在谁被豁免了」「把豁免都撤了」之前先用它**，不要凭上文列人。",
                schema,
                CAP_EXEMPT_SET,
                SideEffect.READ,
                (ctx, args) -> {
                    List<Map<String, Object>> items = new ArrayList<>();
                    for (TwinCardMapping m : mappingService.listActiveExemptions()) {
                        if (m == null) {
                            continue;
                        }
                        Map<String, Object> it = new LinkedHashMap<>();
                        it.put("name", str(m.getUserName()));
                        it.put("jobNumber", str(m.getJobNumber()));
                        it.put("cardNo", m.getCardNo());
                        it.put("projectGroup", str(m.getProjectGroupName()));
                        it.put("rooms", roomNamesFromJson(m.getFreezeExemptRoomIds()));
                        it.put("mode", str(m.getFreezeExemptMode()));
                        it.put("expireAt", m.getFreezeExemptExpireAt() == null
                                ? null : String.valueOf(m.getFreezeExemptExpireAt()));
                        it.put("maxCount", m.getFreezeExemptMaxCount());
                        it.put("usedCount", m.getFreezeExemptUsedCount());
                        items.add(it);
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", items.size());
                    out.put("exemptions", items);
                    if (items.isEmpty()) {
                        out.put("note", "当前没有任何人处于豁免中");
                    }
                    return out;
                });
    }

    /**
     * 从 room_ids 的 JSON 里取房间名（形状由本包写库时固定为 [{"roomId","roomName"}]）。
     * 解析不了就原样返回 —— 宁可显示原始串，也别把信息吞掉。
     */
    private static String roomNamesFromJson(String roomIdsJson) {
        if (roomIdsJson == null || roomIdsJson.isBlank()) {
            return "";
        }
        try {
            StringBuilder sb = new StringBuilder();
            for (JsonNode n : OM.readTree(roomIdsJson)) {
                String name = n.path("roomName").asText("");
                if (name.isEmpty()) {
                    name = n.path("roomId").asText("");
                }
                if (name.isEmpty()) {
                    continue;
                }
                if (sb.length() > 0) {
                    sb.append("、");
                }
                sb.append(name);
            }
            return sb.toString();
        } catch (Exception e) {
            return roomIdsJson;
        }
    }

    private AiTool grantExemption() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "person": { "type": "string", "description": "被授权人的姓名或工号（不要传卡号）" },
                    "durationMinutes": {
                      "type": "integer",
                      "description": "相对时长（分钟）：「两小时」传 120，「今天都有效」传 -1。**只在用户明确说了时长时才填**；用户没说就留空——留空会让工具返回时长候选让用户挑。不要从上一轮对话里拣一个填进去"
                    },
                    "untilTime": {
                      "type": "string",
                      "description": "绝对时点 HH:mm，例如 18:00（当日有效）。**只在用户明确说了某个时刻时才填**；给了它就以它为准"
                    },
                    "maxCount": { "type": "integer", "description": "可用次数上限；**只在用户明确说了次数时才填**" },
                    "mode": {
                      "type": "string",
                      "enum": ["TIME", "COUNT", "BOTH"],
                      "description": "限制方式。省略时自动推断：有次数→COUNT，有时长→TIME，都有→BOTH"
                    },
                    "rooms": {
                      "type": "array",
                      "items": { "type": "string" },
                      "description": "授权房间，填房间名或房间 id。**只在用户明确说了房间时才填**；没说就留空——留空时工具会返回该人的可选房间给用户挑"
                    }
                  },
                  "required": ["person"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "grantFreezeExemption",
                "给某人授予门禁卡免冻结豁免（风控由「受控」改为「豁免」）。支持时长或次数限制，必须指定授权房间。"
                        + "调用它就会拿到这个人**当前**的豁免状态与可选房间 —— 判断他是否已有豁免、有哪些房间，"
                        + "一律以本次调用的返回为准，不要看上文（上文可能已经过期或被收回）。",
                schema,
                CAP_EXEMPT_SET,
                SideEffect.IDEMPOTENT_WRITE,
                (ctx, args) -> {
                    String person = text(args, "person");
                    if (person.isBlank()) {
                        return Map.of("ok", false, "reason", "没说是谁");
                    }
                    CardLookup lookup = resolveCard(person);
                    if (lookup.error != null) {
                        return lookup.error;
                    }
                    TwinCardMapping card = lookup.card;

                    String untilTime = text(args, "untilTime");
                    Integer durationMinutes = intOrNull(args, "durationMinutes");
                    Integer maxCount = intOrNull(args, "maxCount");

                    // 执行侧的兜底闸：**本轮用户原话里没提时间，就不采信模型给的时长/时点**。
                    //
                    // 模型有个顽固倾向：把上一轮的时长搬到这一轮。真机两次 —— 第一次它说「我就照
                    // 『延迟两小时』办」（还没落库），第二次直接给「有效期到今晚 21:00」，而那一句
                    // 只说「给张皓瀚授予免冻豁免，房间 202A」，21:00 是前几轮对话里的。参数描述里
                    // 写「只在用户明确说了才填」压不住它，所以在执行侧再兜一道：当成没给 → 走「缺时长」
                    // 分支去问。宁可多问一句，也不能拿上下文里的时间替用户拍板。
                    if (!mentionsTime(ctx.userText())) {
                        durationMinutes = null;
                        untilTime = "";
                    }

                    String mode = text(args, "mode");
                    if (mode.isBlank()) {
                        mode = inferMode(untilTime, durationMinutes, maxCount);
                    }
                    // 时长还缺不缺（上面那道「本轮原话没提就不采信」的闸之后再看）。
                    // 缺的话要跟房间**一起问**，见 askForInput 的注释。
                    boolean needTime = ("TIME".equals(mode) || "BOTH".equals(mode))
                            && untilTime.isBlank() && durationMinutes == null;

                    // 房间必填：没给就把该人可选的房间交回去，让用户挑 —— 不猜
                    List<String> asked = new ArrayList<>();
                    if (args.path("rooms").isArray()) {
                        args.path("rooms").forEach(n -> {
                            String v = n.asText("").trim();
                            if (!v.isEmpty()) asked.add(v);
                        });
                    }
                    List<Map<String, Object>> available = availableRooms(card.getAroUserId());
                    if (asked.isEmpty()) {
                        return askForInput("授权必须指定房间。让用户从候选里挑，不要替他选",
                                describe(card, lookup.who()), available,
                                choiceTitle(card, lookup.who(), "挑授权房间"), needTime,
                                choiceTitle(card, lookup.who(), "挑时长"));
                    }
                    List<Map<String, Object>> chosen = pickRooms(asked, available);

                    // 同时间那道闸：**本轮原话里没提到这个房间 → 当没给**。
                    // 模型会把上文出现过的房间搬到这一轮来（跟时间一个病），那等于替用户选了房间 ——
                    // 而房间就是这次要授的权限本身，比时长更不能猜。判据用「房间名或 id」，
                    // 模型把 202A 归一成 id 也不冤枉它（roomChoices 的值就是名字，用户点了名字在下一条消息里）。
                    if (!chosen.isEmpty() && !mentionsAnyRoom(ctx.userText(), chosen)) {
                        return askForInput("用户这一轮没有提到房间。把候选列给用户让他挑，不要拿上文出现过的房间顶上",
                                describe(card, lookup.who()), available,
                                choiceTitle(card, lookup.who(), "挑授权房间"), needTime,
                                choiceTitle(card, lookup.who(), "挑时长"));
                    }
                    if (chosen.isEmpty()) {
                        // 房间名差一点就不认也太苛刻（真机反馈：「e11b 区」对不上「E11B-B105」就直接卡住）。
                        // **允许猜**：候选按「跟用户说的那个像不像」排序，最像的排第一 —— 但只给候选，
                        // 用户点一下才算数。绝不自动采纳（房间就是这次要授的权限本身）。
                        return askForInput("用户说的房间不在他的授权范围里。**候选已按接近度排好序**，"
                                        + "最像的在第一个 —— 让用户点一个确认，不要在正文里复述候选、也不要替他选",
                                describe(card, lookup.who()), rankRoomsByCloseness(available, asked),
                                choiceTitle(card, lookup.who(), "是不是这间"), needTime,
                                choiceTitle(card, lookup.who(), "挑时长"));
                    }

                    // 时长缺失 → 给时长候选。否则 apply 会抛「时长限制模式须选择延长至时点」，
                    // 那句话是给开发看的，模型只能把它原样转述给用户 —— 等于把提问变成了报错。
                    if (needTime) {
                        return askForInput("授权必须给定时长（或到点时间）。让用户从候选里挑，不要替他选",
                                describe(card, lookup.who()), List.of(),
                                "", true, choiceTitle(card, lookup.who(), "挑时长"));
                    }

                    Map<String, Object> updated = exemptAdminService.apply(
                            ctx.actor().getId(), card.getCardNo(), 1, durationMinutes, mode, maxCount,
                            toJson(chosen), untilTime.isEmpty() ? null : untilTime, AI_CLIENT_TAG);

                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("person", describe(card, lookup.who()));
                    out.put("mode", mode);
                    out.put("untilTime", untilTime.isEmpty() ? null : untilTime);
                    out.put("durationMinutes", durationMinutes);
                    out.put("maxCount", maxCount);
                    out.put("rooms", chosen);
                    out.put("expireAt", updated.get("freezeExemptExpireAt"));
                    out.put("note", "已通知本人");
                    return out;
                });
    }

    private AiTool revokeExemption() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "person": { "type": "string", "description": "姓名或工号" }
                  },
                  "required": ["person"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "revokeFreezeExemption",
                "收回某人的免冻结豁免（风控改回「受控」）。只需人名 —— 收回不需要房间和时长。",
                schema,
                CAP_EXEMPT_SET,
                SideEffect.IDEMPOTENT_WRITE,
                (ctx, args) -> {
                    String person = text(args, "person");
                    if (person.isBlank()) {
                        return Map.of("ok", false, "reason", "没说是谁");
                    }
                    CardLookup lookup = resolveCard(person);
                    if (lookup.error != null) {
                        return lookup.error;
                    }
                    TwinCardMapping card = lookup.card;
                    exemptAdminService.apply(ctx.actor().getId(), card.getCardNo(), 0,
                            null, "TIME", null, null, null, AI_CLIENT_TAG);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("person", describe(card, lookup.who()));
                    out.put("note", "已收回豁免，风控回到「受控」");
                    return out;
                });
    }

    // ── 内部 ──

    private record CardLookup(TwinCardMapping card, Map<String, Object> who, Map<String, Object> error) {
    }

    /**
     * 人名/工号 → 卡映射。
     *
     * <p>重名或多卡一律**返回候选让用户确认**，不自己挑一个 —— 与人员查询同一口径。
     * 卡号也能查，避免用户直接报卡号时反而失败。
     *
     * <p>映射表里没有姓名（`twin_card_mapping` 只存卡与人 id），所以查到人之后顺带把
     * 姓名/工号/科室/课题组带出来 —— 工具结果与审计台账里都得能看出「改的是谁」，
     * 否则事后只看台账看不出受影响的人。
     */
    private CardLookup resolveCard(String person) {
        TwinCardMapping byCard = mappingService.getByCardNo(person);
        if (byCard != null) {
            return new CardLookup(byCard, Map.of(), null);
        }
        List<Map<String, Object>> hits = dashboardMapper.searchPersonnelPaged(person, 20, 0);
        List<Map<String, Object>> candidates = new ArrayList<>();
        List<TwinCardMapping> cards = new ArrayList<>();
        List<Map<String, Object>> whos = new ArrayList<>();
        if (hits != null) {
            for (Map<String, Object> row : hits) {
                if (row == null) {
                    continue;
                }
                Object uid = row.get("user_id");
                if (uid == null) {
                    continue;
                }
                TwinCardMapping m = mappingService.getByAroUserId(String.valueOf(uid));
                if (m == null || m.getCardNo() == null || m.getCardNo().isBlank()) {
                    continue;
                }
                Map<String, Object> who = new LinkedHashMap<>();
                who.put("name", str(row.get("name")));
                who.put("jobNumber", str(row.get("job_number")));
                who.put("department", str(row.get("department_name")));
                who.put("projectGroup", str(row.get("project_group_name")));
                Map<String, Object> c = new LinkedHashMap<>(who);
                c.put("cardNo", m.getCardNo());
                candidates.add(c);
                cards.add(m);
                whos.add(who);
            }
        }
        if (candidates.isEmpty()) {
            /*
             * 名字错一个字就"查无此人"太苛刻了（真机反馈：姓名差一个字直接说不对，用起来很难受）。
             * 兜底：按**姓氏**再捞一批，用编辑距离挑出「像的几位」，**以芯片交回给用户点一下**。
             * 口径是"允许猜，但必须用户点头" —— 所以这里只产出候选，绝不替他认定是哪一位。
             */
            List<Map<String, Object>> near = fuzzyPersonnel(person);
            if (!near.isEmpty()) {
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("ok", false);
                out.put("reason", "没有「" + person + "」的精确匹配。下面是名字最接近的几位，"
                        + "让用户点一个；不要在正文里复述候选，也不要替他认定是哪一位");
                out.put("candidates", near);
                out.put("choices", PersonChoices.of(near));
                out.put("choicesTitle", "是不是这几位之一");
                return new CardLookup(null, Map.of(), out);
            }
            return new CardLookup(null, Map.of(), Map.of("ok", false,
                    "reason", "没找到这个人的卡。可能是姓名不对，或者他还没有绑卡 / 没发过大华卡"));
        }
        if (candidates.size() > 1) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("ok", false);
            out.put("reason", "命中多条，请让用户确认是哪一位，不要自己选");
            out.put("candidates", candidates);
            // 让用户点选，而不是照着正文手打名字（重名时手打还是分不清）
            out.put("choices", PersonChoices.of(candidates));
            out.put("choicesTitle", "挑一位");
            return new CardLookup(null, Map.of(), out);
        }
        // 直接用上面已经取到的卡对象，不再按卡号回查一次 —— 多一次查询只会多一个失败点
        return new CardLookup(cards.get(0), whos.get(0), null);
    }

    /**
     * 姓名没精确命中时的兜底候选：**逐字去捞一批**，再按「有多像」排序取前几位。
     *
     * <p>逐字而不是只看姓氏：用户打错的那个字可能在任何一位（包括姓）。每位捞一批再合并，
     * 覆盖面比只按姓捞大得多；捞完在内存里比字/比音，不必让数据库做相似度。
     */
    private List<Map<String, Object>> fuzzyPersonnel(String person) {
        String q = person == null ? "" : person.trim();
        if (q.length() < 2) {
            return List.of();
        }
        Map<Object, Map<String, Object>> rows = new LinkedHashMap<>();
        int tried = 0;
        for (char c : q.toCharArray()) {
            if (tried >= 3) {
                break;
            }
            tried++;
            List<Map<String, Object>> hits = dashboardMapper.searchPersonnelPaged(String.valueOf(c), 60, 0);
            if (hits == null) {
                continue;
            }
            for (Map<String, Object> row : hits) {
                if (row != null && row.get("user_id") != null) {
                    rows.putIfAbsent(row.get("user_id"), row);
                }
            }
        }
        // 先按姓名像不像排序（纯内存），**再**给最像的几位去查卡 —— 反过来的话，捞到的几十条
        // 每条都要查一次库，白花几十次查询
        List<Map.Entry<Integer, Map<String, Object>>> scored = new ArrayList<>();
        for (Map<String, Object> row : rows.values()) {
            int score = nameScore(str(row.get("name")), q);
            if (score > 0) {
                scored.add(new java.util.AbstractMap.SimpleEntry<>(score, row));
            }
        }
        scored.sort((x, y) -> Integer.compare(y.getKey(), x.getKey()));
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<Integer, Map<String, Object>> e : scored) {
            if (out.size() >= 5) {
                break;
            }
            Map<String, Object> row = e.getValue();
            TwinCardMapping m = mappingService.getByAroUserId(String.valueOf(row.get("user_id")));
            if (m == null || m.getCardNo() == null || m.getCardNo().isBlank()) {
                continue;
            }
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("name", str(row.get("name")));
            c.put("jobNumber", str(row.get("job_number")));
            c.put("department", str(row.get("department_name")));
            c.put("projectGroup", str(row.get("project_group_name")));
            c.put("cardNo", m.getCardNo());
            out.add(c);
        }
        return out;
    }

    /** 拼音格式：不要声调、全小写 —— 「菲 fēi」与「斐 fěi」才算同音。 */
    private static final HanyuPinyinOutputFormat PY_FORMAT = pinyinFormat();

    private static HanyuPinyinOutputFormat pinyinFormat() {
        HanyuPinyinOutputFormat f = new HanyuPinyinOutputFormat();
        f.setToneType(HanyuPinyinToneType.WITHOUT_TONE);
        f.setCaseType(HanyuPinyinCaseType.LOWERCASE);
        return f;
    }

    /** 两个字是不是**同音**：相同，或拼音（去声调）一致。 */
    private static boolean sameSound(char x, char y) {
        if (x == y) {
            return true;
        }
        try {
            String[] px = PinyinHelper.toHanyuPinyinStringArray(x, PY_FORMAT);
            String[] py = PinyinHelper.toHanyuPinyinStringArray(y, PY_FORMAT);
            if (px == null || py == null) {
                return false;
            }
            for (String a : px) {
                for (String b : py) {
                    if (a.equals(b)) {
                        return true;
                    }
                }
            }
        } catch (BadHanyuPinyinOutputFormatCombination e) {
            // 格式是写死的合法组合，走不到这里；真走到了当不同音，不影响主流程
        }
        return false;
    }

    /**
     * 两个姓名「有多像」：0 = 不像，越大越像（候选按它排序，最像的排第一）。
     *
     * <p>判据：长度差不超过一个字、**至少对上两个字**、且**至少有一个字是同字**。
     *
     * <p>为什么必须算上**同音**：打错字最常见的就是打了同音字（「王毓斐」打成「王毓菲」，
     * 音一样字不一样）。只按字面比对时这种错会掉到"只共用一个姓"，于是查无此人 ——
     * 真机反馈正是如此。
     *
     * <p>为什么还要"至少有一个同字"、且同字计分更高：纯靠谐音配对太松（同音字极多），
     * 会把一堆不相干的人端出来。同字比同音可信，按分排序后正确答案自然排在最前。
     */
    private static int nameScore(String a, String b) {
        if (a.isEmpty() || b.isEmpty() || Math.abs(a.length() - b.length()) > 1) {
            return 0;
        }
        List<Character> pool = new ArrayList<>();
        for (char c : b.toCharArray()) {
            pool.add(c);
        }
        int exact = 0;
        int sound = 0;
        for (char c : a.toCharArray()) {
            int at = -1;
            for (int i = 0; i < pool.size(); i++) {
                if (pool.get(i) == c) {
                    at = i;
                    break;
                }
            }
            if (at >= 0) {
                exact++;
                pool.remove(at);
                continue;
            }
            for (int i = 0; i < pool.size(); i++) {
                if (sameSound(pool.get(i), c)) {
                    at = i;
                    break;
                }
            }
            if (at >= 0) {
                sound++;
                pool.remove(at);
            }
        }
        int hit = exact + sound;
        if (exact < 1 || hit < 2 || hit < Math.min(a.length(), b.length()) - 1) {
            return 0;
        }
        return exact * 10 + sound * 6 + (a.length() == b.length() ? 1 : 0);
    }

    /** 该人可授权的房间（与发卡页「豁免配置」弹窗同源）。 */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> availableRooms(String aroUserId) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (aroUserId == null || aroUserId.isBlank()) {
            return out;
        }
        DahuaIssueAccessPrefillVO vo = prefillService.build(aroUserId);
        List<Map<String, Object>> rooms = vo == null ? null : vo.getOfficialRooms();
        if (rooms == null) {
            return out;
        }
        for (Map<String, Object> r : rooms) {
            if (r == null) {
                continue;
            }
            Object id = r.get("id") != null ? r.get("id") : r.get("roomId");
            Object name = r.get("name") != null ? r.get("name") : r.get("roomName");
            if (id == null || name == null) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("room", String.valueOf(name));
            item.put("roomId", String.valueOf(id));
            String where = roomWhere(String.valueOf(id));
            if (!where.isEmpty()) {
                item.put("where", where);
            }
            out.add(item);
        }
        return out;
    }

    /**
     * 房间的地域说明（区域 + 楼层），例如「浦东 2F」「浦西 5A」。
     *
     * <p>上游 ARO 只给房间 id 和名字，光看「202A」选房间等于凭记忆。这一层来自我们自己的房间主数据
     * （{@code room_mapping_room}，与上游同一套 room_id）。查不到就说空 —— 宁可不显示，也不要编。
     */
    private String roomWhere(String roomId) {
        if (roomMappingRoomMapper == null || roomId == null || roomId.isBlank()) {
            return "";
        }
        try {
            RoomMappingRoom row = roomMappingRoomMapper.selectByRoomId(roomId.trim());
            if (row == null) {
                return "";
            }
            String region = row.getRegionName() == null ? "" : row.getRegionName().trim();
            String floor = row.getFloorName() == null ? "" : row.getFloorName().trim();
            if (floor.isEmpty()) {
                return region;
            }
            // 楼层名常常自带区域（「浦东 2F」），别拼成「浦东 浦东 2F」
            if (region.isEmpty() || floor.contains(region)) {
                return floor;
            }
            return region + " " + floor;
        } catch (Exception e) {
            return "";
        }
    }

    /** 把模型给的房间（名或 id）对上候选表；对不上的**丢弃而不是硬塞** —— 越界的房间不该被授权。 */
    private static List<Map<String, Object>> pickRooms(List<String> asked, List<Map<String, Object>> available) {
        List<Map<String, Object>> chosen = new ArrayList<>();
        for (String want : asked) {
            for (Map<String, Object> room : available) {
                if (want.equals(room.get("room")) || want.equals(room.get("roomId"))) {
                    if (!chosen.contains(room)) {
                        chosen.add(room);
                    }
                    break;
                }
            }
        }
        return chosen;
    }

    /**
     * 候选房间 → 可点选选项。
     *
     * <p>**value 用房间名**（用户点选后这个名字会作为下一条消息发出去，模型再按名字匹配，闭环里不出现 roomId）；
     * **label 带上地域说明**（「202A · 浦东 2F」）—— 光看房号选房间等于凭记忆，界面里得能看出是哪一间。
     */
    /**
     * 缺参数时把**缺的几道题一次交给用户**（房间 / 时长），载体用向导一次问完。
     *
     * <p>为什么必须一次问齐：房间与时长是**两问**，而芯片点一下是一条用户消息、只回答一道 ——
     * 答了时长，那句原话里就没有房间；答了房间，又没有时长。而本工具**两道闸**都要求
     * 「本轮原话里提到」（房间见 mentionsAnyRoom、时长见 mentionsTime），于是两道题**永远凑不齐**，
     * 用户被反复要求「把房间和时间一起重说一遍」（真机反馈的体验就是这么来的）。
     *
     * <p>一次把缺的都问上，载体把几道答案**合成一条消息**发回来，那一条里两者都在，两道闸一次通过。
     * 只缺一道时就只问一道 —— 跟原来一样，点一下即办。
     */
    private static Map<String, Object> askForInput(String reason, Map<String, Object> person,
                                                   List<Map<String, Object>> rooms,
                                                   String roomTitle, boolean needTime, String timeTitle) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", reason);
        out.put("person", person);
        if (!rooms.isEmpty()) {
            out.put("rooms", rooms);
        }
        List<Map<String, Object>> questions = new ArrayList<>();
        if (!rooms.isEmpty()) {
            questions.add(question(roomTitle, roomChoices(rooms)));
        }
        if (needTime) {
            questions.add(question(timeTitle, TIME_CHOICES));
        }
        out.put("questions", questions);
        return out;
    }

    /** 一道单选问题。载体把 {@code questions} 里的每一项都渲染成一问。 */
    private static Map<String, Object> question(String title, List<Map<String, Object>> options) {
        Map<String, Object> q = new LinkedHashMap<>();
        q.put("title", title);
        q.put("options", options);
        return q;
    }

    /**
     * 房间候选按「跟用户说的那个名字像不像」排序，最像的排第一。
     *
     * <p>真机反馈：用户说「e11b 区」、人名的房间叫「E11B-B105」，就差几个字符，系统却只说
     * 「不在授权范围里」—— 用户得自己在候选里翻。排一下序，他点第一个就行。
     *
     * <p>排序只是**把最像的摆到他眼前**，不等于替他选：候选照样以芯片给出，点了才算数。
     */
    private static List<Map<String, Object>> rankRoomsByCloseness(
            List<Map<String, Object>> available, List<String> asked) {
        if (asked.isEmpty() || available.size() < 2) {
            return available;
        }
        List<Map<String, Object>> out = new ArrayList<>(available);
        out.sort((x, y) -> Integer.compare(roomScore(y, asked), roomScore(x, asked)));
        return out;
    }

    /** 分数越大越像：归一化后互为子串给高分，否则看公共前缀有多长。 */
    private static int roomScore(Map<String, Object> room, List<String> asked) {
        String r = normRoom(String.valueOf(room.get("room")));
        if (r.isEmpty()) {
            return 0;
        }
        int best = 0;
        for (String a : asked) {
            String q = normRoom(a);
            if (q.isEmpty()) {
                continue;
            }
            if (r.contains(q) || q.contains(r)) {
                best = Math.max(best, 100 + Math.min(q.length(), r.length()));
            }
            int pre = 0;
            while (pre < q.length() && pre < r.length() && q.charAt(pre) == r.charAt(pre)) {
                pre++;
            }
            best = Math.max(best, pre);
        }
        return best;
    }

    /** 归一化房间名：大小写、空格、连字符这些写法差异一律抹掉（「e11b 区」与「E11B-B105」才比得起来）。 */
    private static String normRoom(String s) {
        StringBuilder sb = new StringBuilder();
        for (char c : String.valueOf(s).toCharArray()) {
            if (Character.isLetterOrDigit(c)) {
                sb.append(Character.toUpperCase(c));
            }
        }
        return sb.toString();
    }

    private static List<Map<String, Object>> roomChoices(List<Map<String, Object>> rooms) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rooms) {
            String room = String.valueOf(r.get("room"));
            String where = r.get("where") == null ? "" : String.valueOf(r.get("where")).trim();
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("label", where.isEmpty() ? room : room + " · " + where);
            o.put("value", room);
            out.add(o);
        }
        return out;
    }

    private static String toJson(List<Map<String, Object>> rooms) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < rooms.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append("{\"roomId\":\"").append(rooms.get(i).get("roomId"))
              .append("\",\"roomName\":\"").append(rooms.get(i).get("room")).append("\"}");
        }
        return sb.append(']').toString();
    }

    /**
     * 用户这一句里有没有提到时间。
     *
     * <p>只认**时间形态**的词，不是「有没有数字」—— 房间号（202A）里也有数字，拿数字当判据会漏。
     *
     * <p>反过来，**宁可漏认也不要误认**：漏认只是多问一句（安全），误认会把模型编出来的时长
     * 当成用户说的（正是要防的那件事）。所以「时」「分」「点」这类会撞「暂时」「重点」「地点」的
     * 单字一律不做判据，只收不会被别的词吃掉的写法。
     */
    static boolean mentionsTime(String userText) {
        if (userText == null || userText.isBlank()) {
            return false;
        }
        // 冒号时钟：18:00 / 18：00
        if (userText.contains(":") || userText.contains("：")) {
            return true;
        }
        // 数字挨着「点」：18点 / 3点半（中文数字的「三点」不认 —— 漏认只会多问一句）
        if (userText.matches(".*[0-9][^0-9]*点.*")) {
            return true;
        }
        for (String word : new String[] {"分钟", "小时", "半小时", "半天", "整天",
                "今天", "今晚", "今早", "明天", "后天", "上午", "下午", "晚上", "中午", "都有效"}) {
            if (userText.contains(word)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 用户这一句里有没有提到这些房间（房间名或房间 id，任一命中即可）。
     *
     * <p>只认「字符串出现过」，不做模糊匹配 —— 漏认只是多问一句（安全），误认会把模型编的房间
     * 当成用户选的（正是要防的那件事）。
     */
    static boolean mentionsAnyRoom(String userText, List<Map<String, Object>> rooms) {
        if (userText == null || userText.isBlank() || rooms == null) {
            return false;
        }
        String text = userText.toLowerCase();
        for (Map<String, Object> room : rooms) {
            if (room == null) {
                continue;
            }
            for (String key : new String[] {"room", "roomId"}) {
                Object v = room.get(key);
                if (v == null) {
                    continue;
                }
                String s = String.valueOf(v).trim().toLowerCase();
                if (!s.isEmpty() && text.contains(s)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static String inferMode(String untilTime, Integer durationMinutes, Integer maxCount) {
        boolean hasTime = !untilTime.isBlank() || durationMinutes != null;
        boolean hasCount = maxCount != null;
        if (hasTime && hasCount) {
            return "BOTH";
        }
        return hasCount ? "COUNT" : "TIME";
    }

    private static Map<String, Object> describe(TwinCardMapping card, Map<String, Object> who) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", pick(who.get("name"), card.getUserName()));
        m.put("jobNumber", pick(who.get("jobNumber"), card.getJobNumber()));
        m.put("department", pick(who.get("department"), null));
        m.put("projectGroup", pick(who.get("projectGroup"), card.getProjectGroupName()));
        m.put("cardNo", card.getCardNo());
        m.put("alreadyExempt", card.getFreezeExemptFlag() != null && card.getFreezeExemptFlag() == 1);
        return m;
    }

    private static String pick(Object first, String fallback) {
        String s = str(first);
        return !s.isEmpty() ? s : (fallback == null ? "" : fallback);
    }

    /**
     * 选项组的标题。
     *
     * <p>批量清单会有**好几问同时挂着**（「张皓瀚 缺房间」+「林安顺 缺时长」），载体要把它们按顺序
     * 依次问出来，所以每一问都得自带标题，否则用户看到一排房间不知道是给谁挑的。
     */
    private static String choiceTitle(TwinCardMapping card, Map<String, Object> who, String what) {
        String name = pick(who.get("name"), card.getUserName());
        return (name.isEmpty() ? "该人员" : name) + " · " + what;
    }

    private static int level(User user) {
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        return role.getLevel();
    }

    /** 取整数参数：兼容模型把数字发成字符串的情况（"120" 也要认）。 */
    private static Integer intOrNull(JsonNode args, String field) {
        JsonNode n = args.path(field);
        if (n.isMissingNode() || n.isNull()) {
            return null;
        }
        if (n.canConvertToInt()) {
            return n.asInt();
        }
        try {
            return Integer.valueOf(n.asText("").trim());
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
