package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.dahua.entity.DahuaDeviceChannelCache;
import com.example.demo.modules.dahua.service.DahuaDeviceChannelCacheService;
import com.example.demo.modules.dahua.service.DahuaTvWallService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 视频上墙（{@code /#/console/admin/video-wall} 页面）的工具包。
 *
 * <p>对应页面上的事：**看有哪些电视墙/在播什么**、**看某面墙存了哪些预设**、
 * **把预设推上墙**、**直接挑几路摄像头摆到某面墙的格子里**、**清空**、**存成预设**。
 *
 * <p>和别的包一样，工具是业务动词、不是接口：页面调 {@code /layout} {@code /apply} {@code /channels}，
 * 这里换成「把 2 号猪舍的摄像头放到大屏四宫格」。执行体直接调页面用的 {@link DahuaTvWallService}，
 * 所以行为与手工点按完全一致。
 *
 * <p><b>上墙是碰硬件的动作</b>（会真的切大屏画面），侧效等级 C：服务端挂起等用户点确认，
 * 模型正文里说「已经切过去了」不算数。
 */
@Component
public class DahuaTvWallToolPack implements AiToolPack {

    public static final String CAP_TV_WALL = "ai.dahua.tvwall";

    /** 一次最多摆几路通道（再多就该走人工点页面了） */
    private static final int MAX_WINDOWS = 16;
    /** 列通道时最多返回几条 */
    private static final int MAX_LIST = 20;
    /** 候选多到超过这个数就不给可点选项了 */
    private static final int CHOICE_MAX = 6;

    /** ICC 客户端支持的分屏数 */
    private static final Set<Integer> SPLITS = Set.of(1, 4, 5, 9, 16, 36, 64);

    private final DahuaTvWallService tvWallService;
    private final DahuaDeviceChannelCacheService channelCacheService;

    public DahuaTvWallToolPack(DahuaTvWallService tvWallService,
                               DahuaDeviceChannelCacheService channelCacheService) {
        this.tvWallService = tvWallService;
        this.channelCacheService = channelCacheService;
    }

    @Override
    public String packKey() {
        return "tvwall";
    }

    @Override
    public String displayName() {
        return "视频上墙";
    }

    @Override
    public Set<String> routeHints() {
        return Set.of("电视墙", "上墙", "视频墙", "大屏", "分屏", "宫格", "投屏", "监控画面");
    }

    @Override
    public String defaultPrompt() {
        return """
                视频上墙的口径：
                - 「上墙」是把监控画面推到实验室的大屏/电视。先搞清是**哪面墙**（用 listTvWalls 查，
                  别凭印象写 id），再看用户要的是**套用一个存好的预设**（applyWallPreset）
                  还是**现挑几路画面摆上去**（putChannelsOnWall）。
                - 摄像头要先查到再摆：用 listVideoChannels 把用户说的点位查出来；重名或多命中时
                  把候选列给用户挑，**不要自己选一个**。通道码是内部标识，绝不凭空写。
                - 用户说的多半是俗名（「2 号猪舍那个」「清洗间门口」）：先按关键词查，查不到就问清，
                  不要拿名字相近的顶上 —— 上错画面比不上下更糟。
                - putChannelsOnWall 要同时给**宫格数**和**每路画面对应的窗口号**。用户只说
                  「把这几个上去」而没说怎么排时，按数量取一个最贴的宫格（3 路 → 4 宫格）并在正文里
                  说清你打算怎么排，让他有机会纠正。
                - **这是碰硬件的动作**（大屏真的会切画面），服务端会挂起等用户点确认；
                  所以正文里**不要**说「已经切过去了」，等确认结果出来再说。
                - 只想看看大屏现在放的是什么，用 listTvWalls（它带每面墙**当前在播**）。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(
                // 与页面入口 adminNavRegistry 里 /admin/video-wall 的 fallbackMinRole(ADMIN) 同口径
                CAP_TV_WALL, user -> level(user) >= RoleEnum.ADMIN.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listTvWalls(), listVideoChannels(), listWallPresets(),
                applyWallPreset(), putChannelsOnWall(), clearWall(), saveWallPreset());
    }

    // ── 读 ──

    private AiTool listTvWalls() {
        String schema = """
                {
                  "type": "object",
                  "properties": {},
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listTvWalls",
                "列出所有电视墙，以及每面墙**当前正在播**什么（预设名）。"
                        + "用户问「大屏现在放的什么」「有哪些墙」时用它，也是上墙前确定墙的第一步。",
                schema,
                CAP_TV_WALL,
                SideEffect.READ,
                (ctx, args) -> {
                    List<Map<String, Object>> walls = tvWallService.listTvWalls();
                    Map<String, String> playing = new LinkedHashMap<>();
                    try {
                        for (Map<String, Object> t : tvWallService.listCurrentTasks(null)) {
                            String id = str(t.get("tvWallId"));
                            String name = str(t.get("taskName"));
                            String plan = str(t.get("planName"));
                            if (!id.isEmpty()) {
                                playing.put(id, !plan.isEmpty() ? plan : name);
                            }
                        }
                    } catch (RuntimeException ignored) {
                        // 当前状态取不到不该让「有哪些墙」也答不出来
                    }
                    List<Map<String, Object>> items = new ArrayList<>();
                    for (Map<String, Object> w : walls) {
                        Map<String, Object> it = new LinkedHashMap<>();
                        String id = str(w.get("tvWallId"));
                        it.put("tvWallId", id);
                        it.put("name", str(w.get("tvWallName")));
                        it.put("playing", playing.getOrDefault(id, ""));
                        items.add(it);
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("total", items.size());
                    out.put("walls", items);
                    return out;
                });
    }

    private AiTool listVideoChannels() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "keyword": { "type": "string", "description": "点位名/编码的任意片段；不传就是前若干路" },
                    "limit": { "type": "integer", "description": "最多返回几条，默认 10，上限 20" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listVideoChannels",
                "按关键词查可上墙的摄像头点位（返回点位名与内部通道码）。"
                        + "**摆画面上墙之前先用它把点位查出来**，不要凭印象写通道码。",
                schema,
                CAP_TV_WALL,
                SideEffect.READ,
                (ctx, args) -> {
                    int limit = clamp(args.path("limit").asInt(10), 1, MAX_LIST);
                    String kw = text(args, "keyword");
                    List<DahuaDeviceChannelCache> hits = searchChannels(kw);
                    List<Map<String, Object>> items = new ArrayList<>();
                    for (DahuaDeviceChannelCache c : hits) {
                        if (items.size() >= limit) {
                            break;
                        }
                        items.add(describeChannel(c));
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("total", hits.size());
                    out.put("channels", items);
                    if (hits.isEmpty()) {
                        out.put("note", "没查到匹配的点位，换个关键词或去掉关键词再试");
                    }
                    return out;
                });
    }

    private AiTool listWallPresets() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "tvWall": { "type": "string", "description": "电视墙的名字或 id，先用 listTvWalls 查" }
                  },
                  "required": ["tvWall"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listWallPresets",
                "列出某面电视墙上存了哪些预设（可一键套用的画面方案）。",
                schema,
                CAP_TV_WALL,
                SideEffect.READ,
                (ctx, args) -> {
                    WallLookup w = resolveWall(text(args, "tvWall"));
                    if (w.error != null) {
                        return w.error;
                    }
                    List<Map<String, Object>> tasks = tvWallService.listTasks(w.wallId);
                    List<Map<String, Object>> items = new ArrayList<>();
                    for (Map<String, Object> t : tasks) {
                        Map<String, Object> it = new LinkedHashMap<>();
                        it.put("name", str(t.get("taskName")));
                        it.put("taskId", str(t.get("taskId")));
                        items.add(it);
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("wall", w.wallName);
                    out.put("total", items.size());
                    out.put("presets", items);
                    return out;
                });
    }

    // ── 写 ──

    private AiTool applyWallPreset() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "tvWall": { "type": "string", "description": "电视墙的名字或 id，先用 listTvWalls 查" },
                    "preset": { "type": "string", "description": "预设名，先用 listWallPresets 查" }
                  },
                  "required": ["tvWall", "preset"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "applyWallPreset",
                "把某个存好的预设推上电视墙（大屏立刻切到那套画面）。"
                        + "这是**碰硬件**的动作，服务端会挂起等用户点确认，正文里不要说「已经切好了」。",
                schema,
                CAP_TV_WALL,
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    WallLookup w = resolveWall(text(args, "tvWall"));
                    if (w.error != null) {
                        return w.error;
                    }
                    String want = text(args, "preset");
                    if (want.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说要套哪个预设");
                    }
                    List<Map<String, Object>> tasks = tvWallService.listTasks(w.wallId);
                    List<Map<String, Object>> candidates = new ArrayList<>();
                    Map<String, Object> hit = null;
                    for (Map<String, Object> t : tasks) {
                        String name = str(t.get("taskName"));
                        if (name.equalsIgnoreCase(want)) {
                            hit = t;
                            break;
                        }
                        if (name.contains(want)) {
                            candidates.add(t);
                        }
                    }
                    if (hit == null && candidates.size() == 1) {
                        hit = candidates.get(0);
                    }
                    if (hit == null) {
                        Map<String, Object> out = new LinkedHashMap<>();
                        out.put("ok", false);
                        out.put("reason", "这面墙上没有叫「" + want + "」的预设，让用户从候选里挑，不要自己定");
                        List<Map<String, Object>> names = new ArrayList<>();
                        for (Map<String, Object> t : tasks) {
                            Map<String, Object> o = new LinkedHashMap<>();
                            o.put("label", str(t.get("taskName")));
                            o.put("value", str(t.get("taskName")));
                            names.add(o);
                        }
                        out.put("candidates", names);
                        if (!names.isEmpty() && names.size() <= CHOICE_MAX) {
                            out.put("choices", names);
                            out.put("choicesTitle", "挑一个预设");
                        }
                        return out;
                    }
                    tvWallService.applyTask(w.wallId, str(hit.get("taskId")));
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("wall", w.wallName);
                    out.put("preset", str(hit.get("taskName")));
                    return out;
                },
                null,
                args -> "把「" + text(args, "tvWall") + "」切成预设：" + text(args, "preset"));
    }

    private AiTool putChannelsOnWall() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "tvWall": { "type": "string", "description": "电视墙的名字或 id，先用 listTvWalls 查" },
                    "split": { "type": "integer", "enum": [1, 4, 5, 9, 16, 36, 64],
                               "description": "分屏数（宫格）" },
                    "channels": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "channel": { "type": "string", "description": "点位名或通道码，先用 listVideoChannels 查" },
                          "window": { "type": "integer", "description": "放到第几个窗口，从 1 开始计；不传按顺序排" }
                        },
                        "required": ["channel"],
                        "additionalProperties": false
                      },
                      "description": "要上墙的画面，按顺序对应窗口"
                    }
                  },
                  "required": ["tvWall", "split", "channels"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "putChannelsOnWall",
                "把几路摄像头画面直接摆到电视墙的格子里（不用先存预设）。"
                        + "这是**碰硬件**的动作，服务端会挂起等用户点确认，正文里不要说「已经切过去了」。"
                        + "点位先经 listVideoChannels 查；重名会交回候选让你问用户，不会随便摆一路画面。",
                schema,
                CAP_TV_WALL,
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    WallLookup w = resolveWall(text(args, "tvWall"));
                    if (w.error != null) {
                        return w.error;
                    }
                    int split = args.path("split").asInt(0);
                    if (!SPLITS.contains(split)) {
                        return Map.of("ok", false,
                                "reason", "不支持的分屏数：" + split + "。可用的有 " + SPLITS);
                    }
                    JsonNode arr = args.path("channels");
                    if (!arr.isArray() || arr.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说要摆哪几路画面");
                    }
                    if (arr.size() > MAX_WINDOWS) {
                        return Map.of("ok", false,
                                "reason", "一次最多摆 " + MAX_WINDOWS + " 路，请拆开或让用户确认批量操作");
                    }

                    List<Map<String, Object>> windows = new ArrayList<>();
                    List<String> names = new ArrayList<>();
                    List<Map<String, Object>> candidates = new ArrayList<>();
                    List<String> unresolved = new ArrayList<>();
                    int auto = 0;
                    for (JsonNode n : arr) {
                        String want = n.path("channel").asText("").trim();
                        if (want.isEmpty()) {
                            continue;
                        }
                        int window = n.path("window").asInt(0);
                        if (window <= 0) {
                            window = ++auto;
                        }
                        if (window > split) {
                            return Map.of("ok", false,
                                    "reason", "窗口号 " + window + " 超出了 " + split + " 宫格的范围");
                        }
                        DahuaDeviceChannelCache c = findOne(want, candidates);
                        if (c == null) {
                            unresolved.add(want);
                            continue;
                        }
                        Map<String, Object> item = new LinkedHashMap<>();
                        item.put("index", window - 1);
                        item.put("channelCode", c.getChannelCode());
                        item.put("channelName", str(c.getChannelName()));
                        windows.add(item);
                        names.add(str(c.getChannelName()));
                    }
                    if (!unresolved.isEmpty()) {
                        Map<String, Object> out = new LinkedHashMap<>();
                        out.put("ok", false);
                        out.put("reason", "这些点位对不上（" + String.join("、", unresolved)
                                + "）。让用户从候选里挑，不要自己定");
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
                            out.put("choicesTitle", "挑一路画面");
                        }
                        return out;
                    }

                    tvWallService.operateLayout(w.wallId, split, windows);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("wall", w.wallName);
                    out.put("split", split);
                    out.put("channels", names);
                    return out;
                },
                null,
                args -> {
                    List<String> who = new ArrayList<>();
                    for (JsonNode n : args.path("channels")) {
                        String v = n.path("channel").asText("").trim();
                        if (!v.isEmpty()) {
                            who.add(v);
                        }
                    }
                    return "把 " + who.size() + " 路画面摆到「" + text(args, "tvWall")
                            + "」的 " + args.path("split").asInt(0) + " 宫格："
                            + (who.isEmpty() ? "（未指明点位）" : String.join("、", who));
                });
    }

    private AiTool clearWall() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "tvWall": { "type": "string", "description": "电视墙的名字或 id，先用 listTvWalls 查" }
                  },
                  "required": ["tvWall"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "clearWall",
                "清空电视墙（大屏变黑，不再显示任何画面）。"
                        + "这是**碰硬件**的动作，服务端会挂起等用户点确认。",
                schema,
                CAP_TV_WALL,
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    WallLookup w = resolveWall(text(args, "tvWall"));
                    if (w.error != null) {
                        return w.error;
                    }
                    tvWallService.operateLayout(w.wallId, 0, List.of());
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("wall", w.wallName);
                    return out;
                },
                null,
                args -> "清空「" + text(args, "tvWall") + "」（大屏将不再显示任何画面）");
    }

    private AiTool saveWallPreset() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "tvWall": { "type": "string", "description": "电视墙的名字或 id，先用 listTvWalls 查" },
                    "name": { "type": "string", "description": "新预设叫什么（用户起的名字）" },
                    "split": { "type": "integer", "enum": [1, 4, 5, 9, 16, 36, 64],
                               "description": "分屏数（宫格）" },
                    "channels": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "channel": { "type": "string", "description": "点位名或通道码，先用 listVideoChannels 查" },
                          "window": { "type": "integer", "description": "放到第几个窗口，从 1 开始计；不传按顺序排" }
                        },
                        "required": ["channel"],
                        "additionalProperties": false
                      }
                    }
                  },
                  "required": ["tvWall", "name", "split", "channels"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "saveWallPreset",
                "把一套画面方案存成电视墙上的预设，以后可以一键套用。这是写配置（不切当前画面）。",
                schema,
                CAP_TV_WALL,
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> {
                    WallLookup w = resolveWall(text(args, "tvWall"));
                    if (w.error != null) {
                        return w.error;
                    }
                    String name = text(args, "name");
                    if (name.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说要给这个预设起什么名字");
                    }
                    int split = args.path("split").asInt(0);
                    if (!SPLITS.contains(split)) {
                        return Map.of("ok", false,
                                "reason", "不支持的分屏数：" + split + "。可用的有 " + SPLITS);
                    }
                    JsonNode arr = args.path("channels");
                    List<Map<String, Object>> windows = new ArrayList<>();
                    List<String> names = new ArrayList<>();
                    List<Map<String, Object>> candidates = new ArrayList<>();
                    List<String> unresolved = new ArrayList<>();
                    int auto = 0;
                    if (arr.isArray()) {
                        for (JsonNode n : arr) {
                            String want = n.path("channel").asText("").trim();
                            if (want.isEmpty()) {
                                continue;
                            }
                            int window = n.path("window").asInt(0);
                            if (window <= 0) {
                                window = ++auto;
                            }
                            if (window > split) {
                                return Map.of("ok", false,
                                        "reason", "窗口号 " + window + " 超出了 " + split + " 宫格的范围");
                            }
                            DahuaDeviceChannelCache c = findOne(want, candidates);
                            if (c == null) {
                                unresolved.add(want);
                                continue;
                            }
                            Map<String, Object> item = new LinkedHashMap<>();
                            item.put("index", window - 1);
                            item.put("channelCode", c.getChannelCode());
                            item.put("channelName", str(c.getChannelName()));
                            windows.add(item);
                            names.add(str(c.getChannelName()));
                        }
                    }
                    if (!unresolved.isEmpty()) {
                        Map<String, Object> out = new LinkedHashMap<>();
                        out.put("ok", false);
                        out.put("reason", "这些点位对不上（" + String.join("、", unresolved)
                                + "）。让用户从候选里挑，不要自己定");
                        out.put("unresolved", unresolved);
                        out.put("candidates", candidates);
                        return out;
                    }
                    tvWallService.savePreset(w.wallId, null, name, split, windows);
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("wall", w.wallName);
                    out.put("preset", name);
                    out.put("channels", names);
                    return out;
                },
                null,
                args -> "在「" + text(args, "tvWall") + "」上新建预设「" + text(args, "name")
                        + "」（" + args.path("split").asInt(0) + " 宫格，"
                        + args.path("channels").size() + " 路画面）");
    }

    // ── 内部 ──

    private record WallLookup(String wallId, String wallName, Map<String, Object> error) {
    }

    /**
     * 把「用户说的墙」解析成墙 id。对不上**交回候选**，不硬猜 —— 猜错就是切错大屏。
     */
    private WallLookup resolveWall(String want) {
        if (want == null || want.isBlank()) {
            return new WallLookup(null, null, Map.of("ok", false, "reason", "没说是哪面电视墙"));
        }
        List<Map<String, Object>> walls = tvWallService.listTvWalls();
        List<Map<String, Object>> candidates = new ArrayList<>();
        for (Map<String, Object> w : walls) {
            String id = str(w.get("tvWallId"));
            String name = str(w.get("tvWallName"));
            if (id.equalsIgnoreCase(want) || name.equalsIgnoreCase(want)) {
                return new WallLookup(id, name, null);
            }
            if (name.contains(want)) {
                candidates.add(w);
            }
        }
        if (candidates.size() == 1) {
            Map<String, Object> w = candidates.get(0);
            return new WallLookup(str(w.get("tvWallId")), str(w.get("tvWallName")), null);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "对不上哪面墙是「" + want + "」，让用户从候选里挑，不要自己定");
        List<Map<String, Object>> names = new ArrayList<>();
        for (Map<String, Object> w : (candidates.isEmpty() ? walls : candidates)) {
            Map<String, Object> o = new LinkedHashMap<>();
            o.put("label", str(w.get("tvWallName")));
            o.put("value", str(w.get("tvWallName")));
            names.add(o);
        }
        out.put("candidates", names);
        if (!names.isEmpty() && names.size() <= CHOICE_MAX) {
            out.put("choices", names);
            out.put("choicesTitle", "挑一面墙");
        }
        return new WallLookup(null, null, out);
    }

    /** 视频通道里按关键词找；命中候选顺带收集起来供「让用户挑」。 */
    private List<DahuaDeviceChannelCache> searchChannels(String keyword) {
        List<DahuaDeviceChannelCache> all = channelCacheService.listVideoChannels();
        String kw = keyword == null ? "" : keyword.trim().toLowerCase();
        List<DahuaDeviceChannelCache> out = new ArrayList<>();
        for (DahuaDeviceChannelCache c : all) {
            if (kw.isEmpty()
                    || str(c.getChannelName()).toLowerCase().contains(kw)
                    || str(c.getChannelCode()).toLowerCase().contains(kw)) {
                out.add(c);
            }
        }
        return out;
    }

    /**
     * 把「用户说的点位」解析成唯一一条通道。完全匹配 > 只命中一条；否则记进 candidates 交回用户。
     */
    private DahuaDeviceChannelCache findOne(String want, List<Map<String, Object>> candidates) {
        List<DahuaDeviceChannelCache> hits = searchChannels(want);
        for (DahuaDeviceChannelCache c : hits) {
            if (str(c.getChannelName()).equalsIgnoreCase(want.trim())
                    || str(c.getChannelCode()).equalsIgnoreCase(want.trim())) {
                return c;
            }
        }
        if (hits.size() == 1) {
            return hits.get(0);
        }
        for (DahuaDeviceChannelCache c : hits) {
            candidates.add(describeChannel(c));
        }
        return null;
    }

    private static Map<String, Object> describeChannel(DahuaDeviceChannelCache c) {
        Map<String, Object> it = new LinkedHashMap<>();
        it.put("name", str(c.getChannelName()));
        it.put("channelCode", str(c.getChannelCode()));
        it.put("deviceCode", str(c.getDeviceCode()));
        it.put("online", c.getIsOnline() != null && c.getIsOnline() == 1);
        return it;
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
