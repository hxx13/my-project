package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.dahua.entity.DahuaDeviceChannelCache;
import com.example.demo.modules.dahua.service.DahuaDeviceChannelCacheService;
import com.example.demo.modules.dahua.service.DahuaOpenApiService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.function.Predicate;

/**
 * 门禁通道控制（{@code /#/console/admin/door-control} 页面）的工具包。
 *
 * <p>对应页面上的三件事：**查通道**、**查通道状态**、**控制通道**（远程开/关、常开、常闭、恢复正常）。
 *
 * <p>和别的包一样，工具是业务动词、不是接口：页面调 `/channels` `/status` `/execute` 三个 HTTP 接口，
 * 这里换成「列出这些门 / 这扇门现在什么状态 / 把这扇门设成常开」。执行体直接调**页面用的那两个服务**，
 * 所以行为、上游错误、成功判定都与手工点按一模一样。
 *
 * <p><b>控制是碰硬件的动作</b>（会真的把门打开），所以侧效等级是 C：服务端会挂起等用户点确认，
 * 模型在正文里说「已经开了」不算数。
 */
@Component
public class DoorControlToolPack implements AiToolPack {

    public static final String CAP_DOOR_CONTROL = "ai.dahua.door.control";

    /** 一次最多列几个通道 */
    private static final int MAX_LIST = 20;
    /** 一次最多控制几个通道（再多就是把整片门都动了，该走人工） */
    private static final int MAX_ACTION = 10;
    /** 一个关键词最多取几条候选来解析 */
    private static final int RESOLVE_PAGE_SIZE = 10;
    /** 候选多到超过这个数就不给可点选项了（一屏放不下，让模型在正文里问） */
    private static final int CHOICE_MAX = 6;

    /**
     * 页面上的五种动作，键与上游接口一致 —— **不自己造词**。
     * 括号里是给模型/用户看的人话，也用来在确认弹窗上讲清"要动什么"。
     */
    private static final Map<String, String> MODES = new LinkedHashMap<>();

    static {
        MODES.put("OPEN", "远程开门（开一下，随后回到原状）");
        MODES.put("CLOSE", "远程关门");
        MODES.put("STAY_OPEN", "常开（持续保持打开）");
        MODES.put("STAY_CLOSE", "常闭（持续保持关闭）");
        MODES.put("NORMAL", "恢复正常");
    }

    private final DahuaDeviceChannelCacheService channelCacheService;
    private final DahuaOpenApiService openApiService;

    public DoorControlToolPack(DahuaDeviceChannelCacheService channelCacheService,
                               DahuaOpenApiService openApiService) {
        this.channelCacheService = channelCacheService;
        this.openApiService = openApiService;
    }

    @Override
    public String packKey() {
        return "door";
    }

    @Override
    public String displayName() {
        return "门禁通道控制";
    }

    @Override
    public Set<String> routeHints() {
        // L2 路由词：这些话/页面提到本域时带上本包（见 AiPackRouter）。
        return Set.of("门禁", "通道", "常开", "常闭", "闸机", "开门", "关门");
    }

    @Override
    public String defaultPrompt() {
        return """
                门禁通道控制的口径：
                - 五种动作要分清：「开门/关门」是**一次性**动作（OPEN/CLOSE）；「常开/常闭」是**持续状态**
                  （STAY_OPEN/STAY_CLOSE）；「恢复正常」才是 NORMAL。用户说「把 X 打开」多半是 OPEN，
                  说「让 X 一直开着」才是 STAY_OPEN —— 分不清就问他，别按自己的理解动门。
                - **必须先查到通道再控制**：用 listDoorChannels 把用户说的那扇门查出来；重名或多命中时
                  把候选列给用户挑，不要自己选一个。通道码是内部标识，绝不凭空写。
                - 用户说的可能是俗名（「大门口那台闸机」）：先按关键词查，查不到就问清是哪一台，
                  不要拿名字相近的顶上。
                - 这是**碰硬件**的动作，服务端会挂起等用户在界面上点确认；所以正文里
                  **不要**说「已经开了/已经设成常开」，等确认结果出来再说。
                - 只想看某扇门现在什么状态，用 queryDoorStatus，不要为了看看状态去控制它。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(
                // 与 DahuaDoorControlController#requireSuperAdmin 同口径
                CAP_DOOR_CONTROL, user -> level(user) >= RoleEnum.SUPER_ADMIN.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listChannels(), queryStatus(), controlDoor());
    }

    // ── 工具 ──

    private AiTool listChannels() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "keyword": { "type": "string", "description": "通道名/编号/备注的任意片段；不传就是全部" },
                    "channelType": { "type": "string", "description": "通道类型（上游分类值），一般不用传" },
                    "limit": { "type": "integer", "description": "最多返回几条，默认 10，上限 20" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listDoorChannels",
                "按关键词查门禁通道（门、闸机），返回通道名与内部通道码。"
                        + "**控制某扇门之前先用它把通道查出来**，不要凭印象写通道码。",
                schema,
                CAP_DOOR_CONTROL,
                SideEffect.READ,
                (ctx, args) -> {
                    int limit = clamp(args.path("limit").asInt(10), 1, MAX_LIST);
                    String kw = text(args, "keyword");
                    String type = text(args, "channelType");
                    Map<String, Object> data = channelCacheService.list(
                            kw.isEmpty() ? null : kw,
                            type.isEmpty() ? null : type,
                            null, 7, null, false, 1, limit);
                    List<Map<String, Object>> items = new ArrayList<>();
                    Object listObj = data.get("list");
                    if (listObj instanceof List<?> rows) {
                        for (Object r : rows) {
                            if (r instanceof DahuaDeviceChannelCache c) {
                                items.add(describeChannel(c));
                            }
                        }
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", data.get("total"));
                    out.put("channels", items);
                    if (items.isEmpty()) {
                        out.put("note", "没查到匹配的通道，换个关键词或去掉关键词再试");
                    } else if (items.size() <= CHOICE_MAX) {
                        List<Map<String, Object>> choices = new ArrayList<>();
                        for (Map<String, Object> it : items) {
                            Map<String, Object> o = new LinkedHashMap<>();
                            o.put("label", String.valueOf(it.get("name")));
                            // 值用**通道名**：用户点一下就是下一条消息，说人话；真正落到通道码由工具自己核对
                            o.put("value", String.valueOf(it.get("name")));
                            choices.add(o);
                        }
                        out.put("choices", choices);
                        out.put("choicesTitle", "挑一扇门");
                    }
                    return out;
                });
    }

    private AiTool queryStatus() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "channels": {
                      "type": "array",
                      "items": { "type": "string" },
                      "description": "要查的通道（通道名或通道码），先用 listDoorChannels 查出来"
                    }
                  },
                  "required": ["channels"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "queryDoorStatus",
                "查看门禁通道的当前状态（在线情况、门磁/工作模式等上游返回的字段）。",
                schema,
                CAP_DOOR_CONTROL,
                SideEffect.READ,
                (ctx, args) -> {
                    List<String> asked = stringList(args, "channels");
                    if (asked.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说要查哪扇门");
                    }
                    List<String> codes = new ArrayList<>();
                    for (String want : asked) {
                        for (DahuaDeviceChannelCache c : findByKeyword(want)) {
                            if (matches(c, want)) {
                                codes.add(c.getChannelCode());
                                break;
                            }
                        }
                    }
                    if (codes.isEmpty()) {
                        return Map.of("ok", false,
                                "reason", "这些门在通道表里对不上，先用 listDoorChannels 查准确的名字/通道码");
                    }
                    Map<String, Object> resp = openApiService.queryDoorStatus(null, codes, null);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", openApiService.isSuccess(resp));
                    out.put("queried", codes);
                    out.put("status", DahuaOpenApiService.asListOfMap(resp.get("data")));
                    if (!Boolean.TRUE.equals(out.get("ok"))) {
                        out.put("upstream", resp);
                    }
                    return out;
                });
    }

    private AiTool controlDoor() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "mode": {
                      "type": "string",
                      "enum": ["OPEN", "CLOSE", "STAY_OPEN", "STAY_CLOSE", "NORMAL"],
                      "description": "OPEN 开一下 / CLOSE 关一下 / STAY_OPEN 常开 / STAY_CLOSE 常闭 / NORMAL 恢复正常"
                    },
                    "channels": {
                      "type": "array",
                      "items": { "type": "string" },
                      "description": "要控制的门（通道名或通道码），先用 listDoorChannels 查出来"
                    }
                  },
                  "required": ["mode", "channels"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "controlDoor",
                "远程控制门禁通道：开门 / 关门 / 常开 / 常闭 / 恢复正常。"
                        + "这是**碰硬件**的动作，服务端会挂起等用户点确认，正文里不要说「已经开了」。"
                        + "通道先经 listDoorChannels 查；重名会交回候选让你问用户，不会随便动一扇门。",
                schema,
                CAP_DOOR_CONTROL,
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    String mode = text(args, "mode").toUpperCase();
                    if (!MODES.containsKey(mode)) {
                        return Map.of("ok", false,
                                "reason", "不认识的动作：" + mode + "。可用的有 " + String.join(" / ", MODES.keySet()));
                    }
                    List<String> asked = stringList(args, "channels");
                    if (asked.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说要动哪扇门");
                    }
                    if (asked.size() > MAX_ACTION) {
                        return Map.of("ok", false,
                                "reason", "一次最多动 " + MAX_ACTION + " 扇门，请拆开或让用户确认批量操作");
                    }

                    ChannelLookup lookup = resolveChannels(asked);
                    if (lookup.error != null) {
                        return lookup.error;
                    }

                    List<String> codes = new ArrayList<>();
                    List<String> names = new ArrayList<>();
                    for (DahuaDeviceChannelCache c : lookup.channels) {
                        codes.add(c.getChannelCode());
                        names.add(str(c.getChannelName()));
                    }
                    Map<String, Object> resp = openApiService.controlDoor(mode, codes);
                    boolean ok = openApiService.isSuccess(resp);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", ok);
                    out.put("mode", mode);
                    out.put("modeLabel", MODES.get(mode));
                    out.put("doors", names);
                    if (!ok) {
                        // 上游为什么失败得原样带出来：这句话是用户唯一能拿去排查的东西
                        out.put("upstream", resp);
                    }
                    return out;
                });
    }

    // ── 内部 ──

    private record ChannelLookup(List<DahuaDeviceChannelCache> channels, Map<String, Object> error) {
    }

    /**
     * 把「用户说的门」（名字或通道码）解析成缓存里的通道。
     *
     * <p>对不上或多命中一律**交回候选**，不硬猜 —— 猜错的代价是**动错一扇门**。
     */
    private ChannelLookup resolveChannels(List<String> asked) {
        List<DahuaDeviceChannelCache> found = new ArrayList<>();
        List<Map<String, Object>> candidates = new ArrayList<>();
        List<String> unresolved = new ArrayList<>();
        for (String want : asked) {
            List<DahuaDeviceChannelCache> hits = findByKeyword(want);
            DahuaDeviceChannelCache exact = null;
            for (DahuaDeviceChannelCache c : hits) {
                if (matches(c, want)) {
                    exact = c;
                    break;
                }
            }
            if (exact != null) {
                found.add(exact);
                continue;
            }
            if (hits.size() == 1) {
                // 关键词只命中一台：认（用户可能说的是俗名的一部分）
                found.add(hits.get(0));
                continue;
            }
            unresolved.add(want);
            for (DahuaDeviceChannelCache c : hits) {
                candidates.add(describeChannel(c));
            }
        }
        if (unresolved.isEmpty()) {
            return new ChannelLookup(found, null);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "这些门对不上（" + String.join("、", unresolved) + "）。让用户从候选里挑，不要自己定");
        out.put("unresolved", unresolved);
        out.put("candidates", candidates);
        if (!candidates.isEmpty() && candidates.size() <= CHOICE_MAX) {
            List<Map<String, Object>> choices = new ArrayList<>();
            for (Map<String, Object> c : candidates) {
                Map<String, Object> o = new LinkedHashMap<>();
                o.put("label", String.valueOf(c.get("name")));
                o.put("value", String.valueOf(c.get("name")));
                choices.add(o);
            }
            out.put("choices", choices);
            out.put("choicesTitle", "挑一扇门");
        }
        return new ChannelLookup(List.of(), out);
    }

    private List<DahuaDeviceChannelCache> findByKeyword(String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return List.of();
        }
        Map<String, Object> data = channelCacheService.list(
                keyword.trim(), null, null, 7, null, false, 1, RESOLVE_PAGE_SIZE);
        List<DahuaDeviceChannelCache> rows = new ArrayList<>();
        Object listObj = data.get("list");
        if (listObj instanceof List<?> list) {
            for (Object r : list) {
                if (r instanceof DahuaDeviceChannelCache c) {
                    rows.add(c);
                }
            }
        }
        return rows;
    }

    /** 用户给的写法与这条通道对得上吗：通道码或通道名，忽略大小写与首尾空白 */
    private static boolean matches(DahuaDeviceChannelCache c, String want) {
        String w = want == null ? "" : want.trim();
        if (w.isEmpty()) {
            return false;
        }
        return w.equalsIgnoreCase(str(c.getChannelCode())) || w.equalsIgnoreCase(str(c.getChannelName()));
    }

    private static Map<String, Object> describeChannel(DahuaDeviceChannelCache c) {
        Map<String, Object> it = new LinkedHashMap<>();
        it.put("name", str(c.getChannelName()));
        it.put("channelCode", str(c.getChannelCode()));
        it.put("channelType", str(c.getChannelType()));
        it.put("online", c.getIsOnline() != null && c.getIsOnline() == 1);
        it.put("memo", str(c.getMemo()));
        return it;
    }

    private static List<String> stringList(JsonNode args, String field) {
        List<String> out = new ArrayList<>();
        JsonNode node = args.path(field);
        if (node.isArray()) {
            node.forEach(n -> {
                String v = n.asText("").trim();
                if (!v.isEmpty()) {
                    out.add(v);
                }
            });
        }
        return out;
    }

    private static int clamp(int value, int min, int max) {
        return Math.min(Math.max(value, min), max);
    }

    private static int level(User user) {
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        return role.getLevel();
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
