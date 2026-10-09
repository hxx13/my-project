package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.pagepermission.entity.PagePermissionItem;
import com.example.demo.modules.pagepermission.service.PagePermissionService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 页面导航包 —— 「帮我打开 X，我不知道入口在哪」。
 *
 * <p>用户报的是**入口的名字**（「流水线」「门禁规则」），不是 URL。名字到路径的映射全在本类里做：
 * 模型一个 URL 都编不出来（不变量 I2），它只能报名字。路径的唯一来源是
 * {@link PagePermissionService} 的页面权限表 —— 与前端侧栏/守卫**同一份数据**，
 * 于是「导航能到达的页面」与「这个人真正能打开的页面」天然一致，不会出现
 * 「助手把我送到了一个 403」。
 *
 * <p>三种结局（与网关的三态一致，设计文档 §10.4）：
 * <ol>
 *   <li>唯一命中 → 返回 {@code navigate} 指令，载体真的跳过去；</li>
 *   <li>多个命中（「内容管理」在两个壳子里都有）→ 返回 {@code choices}，
 *       面板渲染成**可点选芯片**，用户点一个再来一次；</li>
 *   <li>一个都没命中 → 明确说找不到，并给出最接近的几个当芯片 ——
 *       比让模型自己瞎猜一个页面强得多。</li>
 * </ol>
 */
@Component
public class NavToolPack implements AiToolPack {

    /** 找页面并跳过去：登录即可。**两个视角共用** —— 能去哪些页面由页面清单按视角+角色过滤。 */
    public static final String CAP_NAV_OPEN = "ai.nav.open";

    /** 一次最多给几个候选（与澄清的「最多 4 个 + 留兜底」口径一致）。 */
    private static final int MAX_CHOICES = 4;
    /** 找不到时的建议条数。 */
    private static final int MAX_SUGGESTIONS = 5;
    /** 名字长度上限，防上面板撑爆。 */
    private static final int MAX_LABEL = 40;

    /**
     * 少数页面的「人话名」补齐。
     *
     * <p>为什么需要：Twin 控制台那几页（主大屏 / 流水线 / 各 debug 页）的入口名**只存在于前端**
     * {@code DebugNav.tsx} 里，权限表是靠启动时扫那个文件认出来的（见
     * {@code PagePermissionService#mergeLegacyWebEntryPaths}），而扫描结果里只存路径、不存名字 ——
     * 于是它们的 display_name 就是 {@code /console/debug} 这种路径，用户说「流水线」永远匹配不上。
     *
     * <p>只在这几页的 display_name 取不到人话时才用它，所以它**不会盖住**权限表里的真名。
     * 名字取自 DebugNav.tsx 的 name 字段，改那处时这里要跟着改。
     */
    private static final Map<String, String> LABEL_SUPPLEMENT = Map.of(
            "/console/dashboard", "主大屏",
            "/console/dashboard-preview", "大屏预览",
            "/console/debug", "流水线日志",
            "/console/debug-personnel", "档案库",
            "/console/debug-prediction", "AI 推演",
            "/console/debug-order", "订单库",
            "/console/debug-heatmap", "空间雷达",
            "/console/debug-cards", "房卡调度",
            "/console/admin", "后台管理");

    /** 这些不是「页面入口」：首页占位、登录页、退出动作。 */
    private static final Set<String> SKIP_EXACT = Set.of("/", "/login", "/admin", "/_dock-logout",
            "/profile-security", "/content-hub");
    /** 教职工 console 之外的壳子（学生门户自己的页面在 STUDENT 视角里才收） */
    private static final String STUDENT_PREFIX = "/student";

    private final PagePermissionService pagePermissionService;

    public NavToolPack(PagePermissionService pagePermissionService) {
        this.pagePermissionService = pagePermissionService;
    }

    @Override
    public String packKey() {
        return "nav";
    }

    @Override
    public String displayName() {
        return "页面导航";
    }

    @Override
    public Set<String> routeHints() {
        // 「入口 / 菜单 / 在哪儿 / 怎么进」是用户找不到页面时的自然说法；packKey=nav、displayName=页面导航
        // 也天然是路由词。
        // **不写「打开」**：它太泛（「打开门禁」「打开某个单子」都会命中）。
        // 2026-10-09 语气上补过一轮动作词（打开/帮我找/在哪儿…），随后收窄整体停用
        // （见 AiPackRouter 类注释：命中不等于「用户只要这几个域」，少发一个域代价最高），
        // 这轮词汇表照旧按「域词」写，不再靠补动词追口语。
        return Set.of("入口", "菜单", "页面", "跳转", "导航", "在哪儿", "在哪里", "怎么进", "找不到", "哪个页");
    }

    @Override
    public String defaultPrompt() {
        return """
                页面导航的口径：
                - 用户报**入口的名字**（「流水线」「门禁规则」「资产记录」）却不知道在哪、或说「帮我打开 X」时 → openPage。
                - **一个 URL 都不要自己拼、不要凭印象说路径**。名字由你报，路径由 openPage 从服务端的页面清单里查，
                  它查得到就会**真的把页面跳过去**（用户那边会切换页面，你只要用一句话说「已帮你打开「流水线日志」」）。
                - openPage 回 choices 时（同一个名字对应多个页面，比如两个壳子里都有「内容管理」）：
                  **不要在你的正文里把候选列出来**，面板会把它们渲染成可点选芯片，用户点一个你再调一次 openPage。
                - openPage 回 ok:false（一个都没匹配上）时：把它的建议芯片交给用户挑，并说清你没找到；
                  **不要**猜一个相近的页面就跳 —— 跳错页面比说「没找到」更烦人。
                - 只能跳到用户有权限打开的页面（服务端按页面权限判定；它没返回的东西就是你不能送他去的）。
                  **web 与小程序都适用** —— 服务端按用户所在的载体返回那一端的页面路径，
                  所以你不用关心是哪个端，照常报名字即可。
                - 这一包只管「跳到哪个页面」，不管页面上要做什么 —— 进去了要办事是别的工具的事。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(CAP_NAV_OPEN, user -> true);
    }

    @Override
    public List<AiTool> tools() {
        return List.of(openPage());
    }

    private AiTool openPage() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "query": {
                      "type": "string",
                      "description": "用户说的入口名字，尽量照原话（「流水线」「门禁规则」「资产记录」）；用户从芯片里点了候选时也可传路径"
                    }
                  },
                  "required": ["query"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "openPage",
                "按入口名字找到对应的后台页面并**跳转过去**。用户说「帮我打开 X」「X 在哪儿」「我找不到 X 的入口」时用它。"
                        + "query 传入口名字，**不要传 URL**（URL 编不出来也算不出来）。"
                        + "名字对应多个页面时会返回候选芯片让用户挑，这时不要自己在正文里列候选。",
                schema, CAP_NAV_OPEN, SideEffect.READ,
                (ctx, args) -> {
                    String query = text(args, "query");
                    if (query.isEmpty()) {
                        return Map.of("ok", false, "reason", "没说要找哪个入口");
                    }
                    // 视角来自请求上下文（服务端按唯一判据推出来的，模型影响不到）
                    Pages pages = scan(ctx.actor(), ctx.miniProgram(), ctx.studentView());
                    Map<String, Object> out = resolve(query, pages);
                    if (Boolean.FALSE.equals(out.get("ok"))) {
                        // 「没这个页面」与「有、但你的角色打不开」是两回事，不能同一句回。
                        // 说成前者会让用户一遍遍换说法重试，而他真正需要的是找人开权限。
                        String denied = deniedNameFor(query, pages.deniedLabels());
                        if (denied != null) {
                            out.put("reason", "「" + denied + "」这个入口存在，但你的账号打不开（需要更高权限）");
                            out.put("hint", "如实告诉用户是权限不够，建议他找管理员开通；不要换着名字再试");
                        }
                    }
                    return out;
                });
    }

    // ── 匹配 ──

    /** 一次「跳哪儿」的决策。 */
    private Map<String, Object> resolve(String rawQuery, Pages pages) {
        String q = flat(rawQuery);
        List<Page> visible = pages.visible();

        List<Page> exact = match(visible, p -> flat(p.label).equals(q));
        if (exact.size() == 1) {
            return hit(exact.get(0));
        }
        if (exact.size() > 1) {
            return ask("「" + rawQuery + "」对应好几个页面，去哪一个？", exact);
        }

        // 名字**一字不差**地落在「存在但角色不够」那一堆里 → 先把这句话说了，别再往下模糊匹配。
        // 不拦的话，模糊匹配会拿「互含」规则把「物资领用审计」吞到 STAFF 能看的「领用审计」上
        // （2026-10-09 实测：问物资领用审计，人被打发到了领用审计页）。
        String exactDenied = exactDeniedLabel(rawQuery, pages.deniedLabels());
        if (exactDenied != null) {
            return denied(exactDenied);
        }

        // 名字互含：用户说「门禁规则」命中「门禁规则配置」，说「流水线日志」命中「流水线」
        List<Page> byLabel = match(visible, p -> {
            String label = flat(p.label);
            return !label.isEmpty() && (label.contains(q) || q.contains(label));
        });
        if (byLabel.size() == 1) {
            return hit(byLabel.get(0));
        }
        if (byLabel.size() > 1) {
            return ask("「" + rawQuery + "」可能指这几个，去哪一个？", byLabel);
        }

        // 退一步按路径找：用户点过芯片之后，回传的 query 就是路径
        List<Page> byPath = match(visible, p -> flat(p.path).contains(q));
        if (byPath.size() == 1) {
            return hit(byPath.get(0));
        }
        if (byPath.size() > 1) {
            return ask("「" + rawQuery + "」可能指这几个，去哪一个？", byPath);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "没找到叫「" + rawQuery + "」的入口");
        List<Page> near = nearest(rawQuery, visible);
        if (!near.isEmpty()) {
            out.put("hint", "下面是名字最接近的几个，让用户从中挑一个（**不要自己挑**）");
            out.put("choices", options(near));
            out.put("choicesTitle", "你是想找这几个里的哪一个？");
        } else {
            out.put("hint", "直接告诉用户你没找到这个入口，问他是不是记错名字了；别猜一个页面跳过去");
        }
        return out;
    }

    /** 「存在、但角色不够」的标准答法。 */
    private Map<String, Object> denied(String label) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "「" + label + "」这个入口存在，但你的账号打不开（需要更高权限）");
        out.put("hint", "如实告诉用户是权限不够，建议他找管理员开通；不要换着名字再试");
        return out;
    }

    private Map<String, Object> hit(Page page) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        Map<String, Object> nav = new LinkedHashMap<>();
        nav.put("path", page.path);
        nav.put("label", page.label);
        out.put("navigate", nav);
        out.put("note", "已经跳过去了；用一句话告诉用户打开的是哪个页面，不要念路径");
        return out;
    }

    /** 多候选 → 芯片。value 用**路径**（唯一），label 用名字（给人看，面板只会把它铺进用户气泡）。 */
    private Map<String, Object> ask(String title, List<Page> candidates) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("multi", true);
        out.put("choices", options(candidates));
        out.put("choicesTitle", title);
        out.put("note", "把候选交给用户点选，**不要**在正文里把这几项念一遍");
        return out;
    }

    /**
     * 候选芯片。
     *
     * <p>{@code value} 用**路径**（唯一，回传后按路径再查一次必命中）；{@code label} 给人看
     * （面板只把它铺进用户气泡，value 照旧发给模型）。
     *
     * <p><b>同名必须补路径</b>：真机上「内容管理」对应两个页面（管理端门户内容 + 独立内容管理壳），
     * 两个芯片都写着「内容管理」时人根本分不出该点哪个 —— 权限表里没有更好的人话区分字段
     * （chain_key 是内部键），所以撞名时把路径补上去，宁可难看也不能让人瞎点。
     */
    private List<Map<String, Object>> options(List<Page> pages) {
        List<Page> chosen = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (Page p : pages) {
            if (chosen.size() >= MAX_CHOICES) {
                break;
            }
            if (seen.add(p.path)) {
                chosen.add(p);
            }
        }
        // 先算出基础文案（名字 + 可选分组），再统计重名
        List<String> base = new ArrayList<>();
        Map<String, Integer> labelCount = new LinkedHashMap<>();
        for (Page p : chosen) {
            String label = p.label;
            if (p.group != null && !p.group.isBlank()) {
                label = label + " · " + p.group;
            }
            base.add(label);
            labelCount.merge(label, 1, Integer::sum);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < chosen.size(); i++) {
            Page p = chosen.get(i);
            String label = labelCount.get(base.get(i)) > 1 ? base.get(i) + " · " + p.path : base.get(i);
            Map<String, Object> opt = new LinkedHashMap<>();
            opt.put("label", clip(label));
            opt.put("value", p.path);
            out.add(opt);
        }
        return out;
    }

    /** 一个都没命中时给的建议：按「与 query 共有的字符数」挑最像的几个。 */
    private List<Page> nearest(String rawQuery, List<Page> pages) {
        Set<Character> q = chars(rawQuery);
        if (q.isEmpty()) {
            return List.of();
        }
        List<Page> sorted = new ArrayList<>(pages);
        sorted.sort(Comparator.comparingInt((Page p) -> overlap(q, chars(p.label))).reversed()
                .thenComparing(p -> p.label));
        List<Page> out = new ArrayList<>();
        for (Page p : sorted) {
            if (overlap(q, chars(p.label)) == 0) {
                break;
            }
            out.add(p);
            if (out.size() >= MAX_SUGGESTIONS) {
                break;
            }
        }
        return out;
    }

    private static int overlap(Set<Character> a, Set<Character> b) {
        int n = 0;
        for (Character c : b) {
            if (a.contains(c)) {
                n++;
            }
        }
        return n;
    }

    private static Set<Character> chars(String s) {
        Set<Character> out = new LinkedHashSet<>();
        for (char c : s.toCharArray()) {
            if (Character.isLetterOrDigit(c)) {
                out.add(c);
            }
        }
        return out;
    }

    private static List<Page> match(List<Page> pages, Predicate<Page> test) {
        List<Page> out = new ArrayList<>();
        for (Page p : pages) {
            if (test.test(p)) {
                out.add(p);
            }
        }
        return out;
    }

    // ── 页面清单 ──

    /**
     * 这个人（在这个载体上）能打开的页面入口。
     *
     * <p>读 {@link PagePermissionService}（= 前端侧栏守卫的同一份数据）。
     *
     * <p><b>载体决定查哪一端</b>：web 查 `WEB`（侧栏入口，`/admin/...`），小程序查 `MINI`
     * （`/pages/...`）。**不能拿 web 的路径去小程序里跳** —— 那边根本没有这些路由；
     * 反过来小程序也没有 `/admin/*`。两端同一份权限模型，所以「能跳到哪儿」在两端各自成立。
     *
     * <p>两端的噪声不同，各滤各的：web 有裸路径/legacy 重定向与占位页；小程序有 tabbar/首页的
     * 合成入口（display_name 形如 `Tab:/pages/index/index`）—— 那不是人话，用户说不出这个名字，
     * 摆给他挑只会增加噪声。
     */
    private Pages scan(User actor, boolean miniProgram, boolean studentView) {
        List<PagePermissionItem> rows;
        try {
            rows = pagePermissionService.listByPlatform(miniProgram ? "MINI" : "WEB");
        } catch (RuntimeException e) {
            return new Pages(List.of(), List.of());
        }
        int level = actor == null || actor.getRole() == null ? RoleEnum.MEMBER.getLevel() : actor.getRole().getLevel();
        Map<String, Page> byPath = new LinkedHashMap<>();
        Set<String> denied = new LinkedHashSet<>();
        Set<String> consolePaths = miniProgram ? Set.of() : consolePaths(rows);
        for (PagePermissionItem row : rows) {
            if (!"ENTRY".equalsIgnoreCase(row.getNodeType()) || !isEnabled(row.getEnabled())) {
                continue;
            }
            String path = row.getPathOrRoute() == null ? "" : row.getPathOrRoute().trim();
            if (path.isEmpty() || path.contains(":")) {
                continue;
            }
            String label = labelOf(row, path);
            if (!usable(miniProgram, studentView, path, label, consolePaths)) {
                continue;
            }
            if (roleLevel(row.getMinRole()) > level) {
                denied.add(label);
                continue;
            }
            byPath.putIfAbsent(path, new Page(path, label, groupOf(row)));
        }
        // 扫描发现不出来的入口，在这里**显式登记**。
        // 电子签名在 Web 是头像菜单里的弹窗、在小程序是手写板页，都不在「页面清单」里，
        // 可用户就是会直接喊它的名字（「帮我打开电子签名」）。不登记的话球球答得出名字却跳不过去。
        String signature = signaturePath(miniProgram, studentView);
        byPath.putIfAbsent(signature, new Page(signature, "电子签名", "我的"));
        return new Pages(new ArrayList<>(byPath.values()), new ArrayList<>(denied));
    }

    /**
     * 电子签名在两端各自的目标。
     *
     * <ul>
     *   <li>小程序 —— 手写板页（**已签名时那一页会自己转成只读展示**，所以签没签都能进）；</li>
     *   <li>Web —— 独立页：教职工 {@code /console/admin/signature}、学生 {@code /student/signature}。</li>
     * </ul>
     *
     * <p>小程序侧写**主包形式**路径（{@code /pages/signaturePad/index}），由小程序自己展开成分包 ——
     * 与页面权限表同一约定，页面以后搬分包这里不用改。
     */
    private static String signaturePath(boolean miniProgram, boolean studentView) {
        if (miniProgram) {
            return "/pages/signaturePad/index";
        }
        return studentView ? "/student/signature" : "/console/admin/signature";
    }

    /** web 端 `/console/...` 的规范路径集合：用来丢掉「同一个页面的裸路径写法」。 */
    private static Set<String> consolePaths(List<PagePermissionItem> rows) {
        Set<String> out = new LinkedHashSet<>();
        for (PagePermissionItem row : rows) {
            String path = row.getPathOrRoute() == null ? "" : row.getPathOrRoute().trim();
            if (path.startsWith("/console/")) {
                out.add(path);
            }
        }
        return out;
    }

    /** 这个入口值不值得摆给用户挑（两端的噪声不同，见 {@link #scan}）。 */
    private static boolean usable(boolean miniProgram, boolean studentView, String path, String label,
                                  Set<String> consolePaths) {
        if (miniProgram) {
            // 名字必须是**人话**：合成名（Tab:/…、Quick:/…）和「名字就是路径」的都不给挑
            return label != null && !label.isEmpty() && !label.equals(path) && !label.contains(":");
        }
        if (SKIP_EXACT.contains(path)) {
            return false;
        }
        // web 两端的页面集合是**不相交**的：教职工在 /console|/admin|内容管理，学生在 /student。
        // 靠这一行分流，而不是靠页面权限表的 minRole —— 学生账号的角色档可能就是 STAFF 级。
        if (studentView != path.startsWith(STUDENT_PREFIX)) {
            return false;
        }
        if (studentView) {
            return true;
        }
        // 老式裸路径（/debug）与 /console/debug 是同一个页面：只留后者。
        // 走老路径会命中顶层 legacy 重定向 —— 整个后台壳层卸载重建、页面闪一下（真机踩过）。
        return path.startsWith("/console/") || path.startsWith("/admin/")
                || !consolePaths.contains("/console" + path);
    }

    /**
     * 一字不差的重名才认。
     *
     * <p>「存在但打不开」这句话要拦在模糊匹配**前面**，所以判据必须比 {@link #deniedNameFor} 严：
     * 用包含关系判的话，「领用审计」会被当成「物资领用审计」，把一个能打开的页面也说成打不开。
     */
    private static String exactDeniedLabel(String rawQuery, List<String> deniedLabels) {
        String q = flat(rawQuery);
        if (q.isEmpty()) {
            return null;
        }
        for (String label : deniedLabels) {
            if (flat(label).equals(q)) {
                return label;
            }
        }
        return null;
    }

    /** 名字落在「存在但权限不够」那一堆里 —— 用来把话说明白，不做匹配决策。 */
    private static String deniedNameFor(String rawQuery, List<String> deniedLabels) {        String q = flat(rawQuery);
        if (q.isEmpty()) {
            return null;
        }
        for (String label : deniedLabels) {
            String flatLabel = flat(label);
            if (!flatLabel.isEmpty() && (flatLabel.contains(q) || q.contains(flatLabel))) {
                return label;
            }
        }
        return null;
    }

    /** 一次扫描的结果：能去的 + 存在但去不了的（后者只用于说清楚为什么去不了）。 */
    private record Pages(List<Page> visible, List<String> deniedLabels) {
    }

    private static String labelOf(PagePermissionItem row, String path) {
        String name = row.getDisplayName() == null ? "" : row.getDisplayName().trim();
        // 权限表里没名字时存的就是路径本身 —— 那种不算名字，去补表里找
        if (name.isEmpty() || name.equals(path)) {
            String supplement = LABEL_SUPPLEMENT.get(path);
            if (supplement != null) {
                return supplement;
            }
        }
        return name.isEmpty() ? path : name;
    }

    private static String groupOf(PagePermissionItem row) {
        String chain = row.getChainKey() == null ? "" : row.getChainKey().trim();
        if (chain.isEmpty()) {
            return null;
        }
        // chainKey 形如 "group › child"：拿最后一段当分组名，太长就不用
        int idx = chain.lastIndexOf('›');
        String tail = idx >= 0 ? chain.substring(idx + 1).trim() : chain;
        return tail.isEmpty() || tail.length() > 12 || tail.equals(chain) ? null : tail;
    }

    private static boolean isEnabled(Integer enabled) {
        return enabled == null || enabled == 1;
    }

    private static int roleLevel(String role) {
        if (role == null || role.isBlank()) {
            return RoleEnum.MEMBER.getLevel();
        }
        return switch (role.trim().toUpperCase(Locale.ROOT)) {
            case "STUDENT", "MEMBER" -> RoleEnum.MEMBER.getLevel();
            case "STAFF" -> RoleEnum.STAFF.getLevel();
            case "SENIOR" -> RoleEnum.SENIOR.getLevel();
            case "ADMIN" -> RoleEnum.ADMIN.getLevel();
            case "SUPER_ADMIN" -> RoleEnum.SUPER_ADMIN.getLevel();
            case "PLATFORM_OWNER" -> RoleEnum.PLATFORM_OWNER.getLevel();
            default -> RoleEnum.MEMBER.getLevel();
        };
    }

    // ── 杂项 ──

    /** 一个可跳转的页面。 */
    private record Page(String path, String label, String group) {
    }

    /** 归一化：小写、去空白与标点，让「门禁 规则」也能命中「门禁规则」。 */
    private static String flat(String s) {
        if (s == null) {
            return "";
        }
        return s.toLowerCase(Locale.ROOT).replaceAll("[\\s/\\-_·]+", "");
    }

    private static String clip(String s) {
        return s.length() <= MAX_LABEL ? s : s.substring(0, MAX_LABEL) + "…";
    }

    private static String text(JsonNode args, String field) {
        JsonNode n = args == null ? null : args.path(field);
        return n == null || !n.isTextual() ? "" : n.asText("").trim();
    }
}
