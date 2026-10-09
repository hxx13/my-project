package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.excel.SubtotalSummary;
import com.example.demo.modules.ai.excel.WorkbookColumnEditor;
import com.example.demo.modules.ai.excel.WorkbookRowEditor;
import com.example.demo.modules.ai.export.entity.AiExportArtifact;
import com.example.demo.modules.ai.export.service.AiExportArtifactService;
import com.example.demo.modules.ai.tool.AiChoices;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.material.dto.MaterialAuditGridRow;
import com.example.demo.modules.material.dto.MaterialCategoryView;
import com.example.demo.modules.material.dto.MaterialItemFlowExportRow;
import com.example.demo.modules.material.dto.MaterialItemView;
import com.example.demo.modules.material.service.MaterialExcelExportService;
import com.example.demo.modules.material.service.MaterialService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/**
 * 物资**申领**审计导出（{@code /#/console/admin/material/audit-export}，**学生领用**那一条）的工具包。
 *
 * <p><b>本包只管学生领用的申领审计。</b>另有一个教职工侧的领用审计页
 * （{@code /#/console/admin/supplies/audit-export}）**本轮不接** —— 用户问到那边就直说没接，
 * 别拿这边的数糊过去（两个域的物品、单据、金额都不是一套）。
 *
 * <p>数据一律走 {@link MaterialService} 里页面用的那几条方法（{@code collectAuditGridRows} /
 * {@code collectItemFlowExportRows}）与同一个摘要器（{@link MaterialExcelExportService}）——
 * 口径与页面同源，助手不会报出和页面对不上的行数。
 *
 * <p>**导出不下发文件**：返回一个**带筛选参数的页面链接**，用户点进去筛选已就绪，
 * 再由页面上的「导出前小计面板」确认后下载（那份小计配置记在用户浏览器里，见下）。
 */
@Component
public class MaterialAuditToolPack implements AiToolPack {

    /** 与页面同口径：{@code /admin/material/audit-export} 在页面权限表里是 ADMIN。 */
    public static final String CAP_MATERIAL_AUDIT = "ai.material.audit";

    /** 一次最多回几行明细（完整数据走导出，别把整表塞进对话）。 */
    private static final int MAX_ROWS = 40;
    /** 候选选项一次最多回几个（给模型看的）。 */
    private static final int MAX_OPTIONS = 40;
    /** 候选里最多几个可以做成**可点芯片** —— 再多用户就不会一个个点了（澄清的「最多 4~5 个」口径）。 */
    private static final int CHIP_MAX = 5;

    /** 网页版导出页（canonical 形式，前端会补 /console 前缀）。 */
    private static final String WEB_PAGE_PATH = "/admin/material/audit-export";
    /**
     * 小程序版：物资领用审计页（网页版的只读镜像，页签与筛选同一套，权限同口径 ADMIN）。
     *
     * <p>写**主包形式**（权限表里就是这个名字），由小程序自己展开成分包路径 —— 页面以后搬分包这里不用改。
     */
    private static final String MP_PAGE_PATH = "/pages/materialAudit/index";

    private final MaterialService materialService;
    private final MaterialExcelExportService excelExportService;
    private final AiExportArtifactService exportArtifactService;

    public MaterialAuditToolPack(MaterialService materialService,
                                 MaterialExcelExportService excelExportService,
                                 AiExportArtifactService exportArtifactService) {
        this.materialService = materialService;
        this.excelExportService = excelExportService;
        this.exportArtifactService = exportArtifactService;
    }

    @Override
    public String packKey() {
        return "materialAudit";
    }

    @Override
    public String displayName() {
        return "申领审计导出（学生物资）";
    }

    @Override
    public Set<String> routeHints() {
        // 「申领审计 / 领用审计（学生侧）/ 物资审计导出」是本域的说法。
        // 教职工侧那条叫「领用导出」，本包接不住 —— 别用「领用」这种宽词把两个域都拉进来。
        return Set.of("申领审计", "物资审计", "物资导出", "审计导出", "领用审计", "物资统计", "materialAudit");
    }

    @Override
    public String defaultPrompt() {
        return """
                物资**申领**审计导出（学生领用 / #/console/admin/material/audit-export）的口径：
                - 本包**只做学生领用的申领审计**。教职工侧的「领用导出」（#/console/admin/supplies/audit-export）
                  **本轮没接**；用户问到那一边就直说没接，**不要**拿这边的数糊过去（两边物品与单据不是一套）。
                - 四个页签（tab）：personal 个人审计 / group 课题组审计 / item 按物品审计 /
                  itemGroup 物品+课题组。
                - **参数不齐就先问，一次只问一件**，而且能做成芯片的就做芯片：
                  ① 用户没说按什么维度导（只说「导出物资审计」）→ 先调 listMaterialAuditOptions(kind=tabs)，
                     四个页签会变成可点选项，**别在正文里列**；
                  ② 时间段没说 → 用一句话问清（日期做不了芯片），**不要**默认导全量（全量摘要又慢又没意义）；
                  ③ 对象没说 → 问是全部还是某个组/某人/某类物资；用户给了名字但写法不确定时，
                     用 kind=groups/applicants/categories/items 查候选，候选也会变成可点选项。
                - **每个页签的「对象」没定就先问**：按物品（item/itemGroup）问物品、个人审计问人、
                  课题组审计问课题组。工具会**把候选做成可点选项**交回来；用户点完，把他点的 value
                  原样放进 filterChoice 再调一次。他若说不用筛，就调「全部」那一项。
                - **同一个问题只问一次**：工具已经把选项交回来了，就**不要再为同一件事调一遍** ——
                  那会让用户看到两个一模一样的提问（真机 2026-10-09 撞到）。
                - **多级筛选要一层层收窄**：先定维度再取明细 ——
                  课题组（listMaterialAuditOptions kind=groups）→ 人（kind=applicants）→
                  分类（kind=categories）→ 物资（kind=items，可再按 categoryId 收窄）；
                  明细一律用 queryMaterialAudit 取（带 tab 与已定的筛选）。
                  用户只报了个名字时**先用 options 确认真实取值**，别拿用户原话当筛选项硬传
                  （课题组是全称「卢今的课题组」这种写法）。
                - **已经确认过的对象不要再问一遍**（2026-10-09 用户反馈「又在重复提问」）：
                  用户上一句已经点了「郑俊克的课题组」，你就**当它确定了**，别在同一轮里再调
                  listMaterialAuditOptions(kind=groups) 把它摆成选项 —— 载体会把这一轮抛出的候选
                  按顺序排队，于是「哪个课题组」会和真正该问的那题一起出现，变成一次答两问。
                  **一轮只问真正还缺的那一件**。
                - **用户已经说清了就别再问**（2026-10-09 用户点名）：他若已经说了「用上次的配置 / 上次那份」，
                  直接 mode=last；已经点名要哪些小计层级，直接 mode=direct 带上 levels。
                  **不要**再摆一次「用上次的还是自己配」—— 参数都在手上了还问，是在浪费他一轮。
                  mode=ask 只在**他完全没提小计配置**时才用。
                - **导出全程在对话里走完，不要跳页**（用 prepareMaterialAuditExport 的 mode）：
                  ① 默认 mode=ask：工具回**两个可点选项**，问句里带「这批多少行 / 几个板块 / 可按哪些层级小计」。
                     **把问题交给用户点**，别在正文里复述选项。
                  ② 他选「用上次的小计配置」→ mode=last：工具给出**下载按钮**（点一下就用他浏览器里那份配置下载）。
                  ③ 他选「自己配」→ mode=custom：工具回一道**多选题**（总计 / 课题组小计 / 申领人小计 / 物品小计）。
                     用户勾完会回一句他勾中的层级 —— 你据此再用 mode=direct 调一次，并把 levels 传成他勾的那些
                     （如 ["total","lv1"]），工具就会给**下载按钮**。
                  四个模式**都不要把 URL 写进正文、也不要自己跳页**；拿到下载按钮时告诉用户「点下面的按钮下载」。
                - **改一份已经导出的文件**（用户「打开看了不满意」时）—— 走 editMaterialAuditExport：
                  ① 用户说「把某一列删掉」「只要某两列」「把某列改名」→ **就是在改文件，不要重新导出一遍**。
                     他改的是他已经下到的那份，动的是文件本身。
                  ② 不知道「刚才那份」是哪一份、或不确定列名怎么写 → 先 listMaterialAuditExports，
                     它会给出每份的 id 和**列名**；表里没有他说的那个列名时，把列名做成**可点选项**让他挑
                     （他对列的叫法常和表头不一样）。
                  ③ 工具回 ok:false 说「还没有文件本体」= 他还没点过那个下载按钮。**让他先点一次下载**，
                     别自己造一份出来（造出来的和他界面上看到的可能不一样）。
                  ④ 改完会回一个新的下载按钮；告诉用户点它。**原来的那份不失效**，两份都在对话里。
                  ⑤ 能改的是**列**（删 / 只留 / 改名）和**行**（删某几行 / 按条件删行 / 删空行），
                     一次可以一起给（「删掉状态是已驳回的行，再去掉数量列」）。行号按 Excel 里显示的来（表头占第 1 行）。
                  ⑥ **改坏了什么由你判断**：这是对文件的忠实编辑，不替你做"报表语义"上的保护
                     （比如删了明细行，夹在中间的小计行不会自动重算）。用户要的若是口径重算，
                     那应该重新导出一份，而不是改文件 —— 该说的时候跟他说清楚。
                  ⑦ 改动**一个字都没落上**时（列名对不上，或按条件一行都没删掉）工具会回 ok:false，
                     并给出**那一列实际写着的值**。照实告诉用户没有他说的那一种、让他从真实取值里挑，
                     **不要说改好了** —— 那样他会拿到一份和原件一模一样的文件还以为改生效了。
                - **小程序两端能力已对齐**（2026-10-09 起）：mode=last/direct 给**下载按钮**、
                  mode=custom 给**多选题**（勾完点确认），**改文件（editMaterialAuditExport）也能用** ——
                  都是抽屉自己渲染、点完在微信里打开文件，不用跳页。
                  唯一还会退化成跳页的是「数据为空」那种过滤后先放宽条件的情形。
                - 金额、数量、行数一律照工具返回的原样报，**不要自己加总**（小计由导出面板算，口径在它那儿）。
                - 查询是只读；导出也不碰数据（只是把筛选条件交给页面）。这一包没有任何写操作。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        return Map.of(CAP_MATERIAL_AUDIT, user -> user.getRole() != null
                && user.getRole().getLevel() >= RoleEnum.ADMIN.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listOptions(), queryAudit(), prepareExport(), listExports(), editExport());
    }

    // ── 四、产物：列出与修订（文件跟对话走） ──

    /**
     * 本会话产出的导出文件。
     *
     * <p>模型要能回答「刚才那份」「上一次导的」指哪一份，并知道它有哪些列 ——
     * 否则「删掉数量那一列」里的「数量」它无从确认。
     */
    private AiTool listExports() {
        String schema = """
                {
                  "type": "object",
                  "properties": {},
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listMaterialAuditExports",
                "列出**当前对话**里已经产出的导出文件（id、标签、有哪些列、有没有文件本体）。"
                        + "用户说「刚才那份」「上一次导的」，或要改某一份但没指明是哪份时用它。",
                schema, CAP_MATERIAL_AUDIT, SideEffect.READ,
                (ctx, args) -> {
                    List<AiExportArtifact> rows = exportArtifactService.listBySession(ctx.sessionId());
                    List<Map<String, Object>> out = new ArrayList<>();
                    for (AiExportArtifact row : rows) {
                        Map<String, Object> m = exportArtifactService.describe(row);
                        byte[] bytes = exportArtifactService.contentOf(row);
                        m.put("columns", bytes == null ? null : WorkbookColumnEditor.headersOf(bytes));
                        out.add(m);
                    }
                    Map<String, Object> result = new LinkedHashMap<>();
                    result.put("ok", true);
                    result.put("exports", out);
                    if (out.isEmpty()) {
                        result.put("note", "这个对话里还没产出过导出文件。用户要导出的话走 prepareMaterialAuditExport。");
                    }
                    return result;
                });
    }

    /**
     * 改一份已产出的导出文件（**在文件本身上改**，不重跑导出）。
     *
     * <p>用户说「把数量那一列删掉」时走这里：取回那份文件的字节 → 删列 → 落一份**新产物** →
     * 给一个新的下载。原件不失效，两份都在对话里。
     */
    private AiTool editExport() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "exportId": {
                      "type": "integer",
                      "description": "改哪一份（来自 listMaterialAuditExports）；省略 = 本会话最近产出的那一份"
                    },
                    "dropColumns": {
                      "type": "array",
                      "items": { "type": "string" },
                      "description": "删掉哪几列，**写表头原文**（如：数量）"
                    },
                    "keepColumns": {
                      "type": "array",
                      "items": { "type": "string" },
                      "description": "只留哪几列，按给的顺序重排（如：时间、物品）。与 dropColumns 同给时先只留、再删"
                    },
                    "renameColumns": {
                      "type": "array",
                      "description": "改列名",
                      "items": {
                        "type": "object",
                        "properties": {
                          "from": { "type": "string", "description": "现在的列名" },
                          "to": { "type": "string", "description": "改成什么" }
                        },
                        "required": ["from", "to"]
                      }
                    },
                    "dropRows": {
                      "type": "array",
                      "items": { "type": "integer" },
                      "description": "删掉哪几行，**行号从 1 起、与 Excel 里显示的行号一致**（表头占第 1 行）"
                    },
                    "dropRowsWhere": {
                      "type": "array",
                      "description": "按条件删行，**满足条件的会被删掉**（可给多条，逐条执行）",
                      "items": {
                        "type": "object",
                        "properties": {
                          "column": { "type": "string", "description": "按哪一列判断，写表头原文" },
                          "op": {
                            "type": "string",
                            "enum": ["equals", "notEquals", "contains", "empty", "notEmpty"],
                            "description": "怎么判断；省略=equals"
                          },
                          "value": { "type": "string", "description": "比什么（empty / notEmpty 不用给）" }
                        },
                        "required": ["column"]
                      }
                    },
                    "dropEmptyRows": {
                      "type": "boolean",
                      "description": "删掉整行都空的行"
                    }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "editMaterialAuditExport",
                "**修改一份已经导出的文件**（删列 / 只留几列 / 改列名 / 删行 / 按条件删行 / 删空行），"
                        + "改完给一个新的下载按钮。"
                        + "用户说「把某一列删掉」「只要某两列」「把状态是已驳回的行去掉」时用它 —— "
                        + "**不要重新导出一遍**：他改的是那份文件，动的是文件本身。",
                schema, CAP_MATERIAL_AUDIT, SideEffect.IDEMPOTENT_WRITE,
                (ctx, args) -> doEditExport(ctx, args));
    }

    private Map<String, Object> doEditExport(AiToolContext ctx, JsonNode args) {
        // 小程序**不再回绝**（2026-10-09 用户指出这条已经过时）：抽屉接上了 download 事件，
        // 改完照样能渲染一张下载卡、点完 openDocument —— 与网页端同一条路。
        Long exportId = args.path("exportId").canConvertToLong() ? args.path("exportId").asLong() : null;
        AiExportArtifact base;
        try {
            base = exportId == null
                    ? exportArtifactService.latest(ctx.sessionId())
                    : exportArtifactService.requireOwned(exportId, ctx.actor().getId());
        } catch (IllegalStateException e) {
            return Map.of("ok", false, "reason", e.getMessage());
        }
        if (base == null) {
            return Map.of("ok", false, "reason",
                    "这个对话里还没有导出过文件，没有可改的对象。先按用户的条件导出一次，再改。");
        }
        byte[] bytes = exportArtifactService.contentOf(base);
        if (bytes == null) {
            // 只有参数、还没有文件本体：用户还没点过那个下载按钮。
            // **不要凭空造一份出来** —— 造出来的和他界面上看到的不一定一样。
            return Map.of("ok", false, "reason",
                    "这（份）导出还没有文件本体（用户还没点过下载按钮），拿不到可改的文件。"
                            + "让他先点一次下载按钮，拿到文件后我再改。");
        }

        List<String> drop = stringList(args.path("dropColumns"));
        List<String> keep = stringList(args.path("keepColumns"));
        List<Map<String, String>> renames = renameList(args.path("renameColumns"));
        List<Integer> dropRows = intList(args.path("dropRows"));
        List<Map<String, String>> where = whereList(args.path("dropRowsWhere"));
        boolean dropEmpty = args.path("dropEmptyRows").asBoolean(false);
        if (drop.isEmpty() && keep.isEmpty() && renames.isEmpty()
                && dropRows.isEmpty() && where.isEmpty() && !dropEmpty) {
            return Map.of("ok", false, "reason", "没有说要改什么。列出可改的列给用户挑，或问清要删/留哪几列、删哪些行。");
        }

        byte[] edited = bytes;
        List<String> applied = new ArrayList<>();
        if (!keep.isEmpty()) {
            edited = WorkbookColumnEditor.keepColumns(edited, keep);
            applied.add("只留 " + String.join("、", keep));
        }
        if (!drop.isEmpty()) {
            edited = WorkbookColumnEditor.dropColumns(edited, drop);
            applied.add("删掉 " + String.join("、", drop));
        }
        for (Map<String, String> r : renames) {
            edited = WorkbookColumnEditor.renameColumn(edited, r.get("from"), r.get("to"));
            applied.add("把「" + r.get("from") + "」改名为「" + r.get("to") + "」");
        }
        try {
            if (!dropRows.isEmpty()) {
                edited = WorkbookRowEditor.dropRows(edited, dropRows);
                applied.add("删掉第 " + dropRows.stream().map(String::valueOf).collect(Collectors.joining("、"))
                        + " 行");
            }
            for (Map<String, String> w : where) {
                edited = WorkbookRowEditor.dropRowsWhere(edited, w.get("column"), w.get("op"), w.get("value"));
                applied.add("删掉「" + w.get("column") + "」"
                        + wherePhrase(w.get("op")) + "「" + (w.get("value") == null ? "" : w.get("value")) + "」的行");
            }
            if (dropEmpty) {
                edited = WorkbookRowEditor.dropEmptyRows(edited);
                applied.add("删掉空行");
            }
        } catch (IllegalArgumentException e) {
            // 列名/行号对不上是**用户和模型能自己解决**的事：把实际情况回给他们，别当系统错误
            Map<String, Object> fail = new LinkedHashMap<>();
            fail.put("ok", false);
            fail.put("reason", e.getMessage());
            fail.put("columns", WorkbookColumnEditor.headersOf(bytes));
            fail.put("note", "把上面这些列名做成**可点选项**让用户挑（他对列的叫法可能和表头不一样）");
            return fail;
        }

        List<String> before = WorkbookColumnEditor.headersOf(bytes);
        List<String> after = WorkbookColumnEditor.headersOf(edited);
        if (java.util.Arrays.equals(bytes, edited)) {
            // **一个字都没改**（列名对不上、或按条件一行都没删掉）：别落一份看起来改过、
            // 其实和原件一模一样的产物 —— 用户会拿着它以为改生效了（真机 2026-10-09 撞到：
            // 库里根本没有「已驳回」这个状态，工具却照样产出了一份新文件并回了成功）。
            Map<String, Object> noop = new LinkedHashMap<>();
            noop.put("ok", false);
            noop.put("reason", "这次改动没有落到任何地方，文件与原件完全一样，所以没有产出新的下载。");
            noop.put("columns", before);
            if (!where.isEmpty()) {
                // 把**那一列实际写着的值**给出去：比干说一句「没找到」有用得多，
                // 模型可以照实告诉用户没有他说的那一种、并让他从真实取值里挑。
                Map<String, Object> actual = new LinkedHashMap<>();
                for (Map<String, String> w : where) {
                    actual.put(w.get("column"), WorkbookRowEditor.distinctValues(bytes, w.get("column"), 12));
                }
                noop.put("actualValues", actual);
                noop.put("note", "上面是那一列**实际写着**的值。照实告诉用户没有他说的那一种，"
                        + "让他从这些值里挑 —— **不要说改好了**。");
            } else {
                noop.put("note", "把上面这些列名做成**可点选项**让用户挑（他对列的叫法可能和表头不一样）。");
            }
            return noop;
        }

        String label = revisedLabel(base.getLabel());
        AiExportArtifact saved = exportArtifactService.record(
                ctx.sessionId(), ctx.messageId(), ctx.actor().getId(),
                AiExportArtifact.KIND_MATERIAL_AUDIT, label, label + ".xlsx", null, base.getId());
        if (saved == null) {
            return Map.of("ok", false, "reason", "产物落库失败，没能生成新的下载。");
        }
        exportArtifactService.saveContent(saved.getId(), edited,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        Map<String, Object> dl = new LinkedHashMap<>();
        dl.put("kind", AiExportArtifact.KIND_MATERIAL_AUDIT);
        dl.put("label", label);
        dl.put("exportId", saved.getId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("exportId", saved.getId());
        out.put("applied", applied);
        out.put("columnsBefore", before);
        out.put("columnsAfter", after);
        out.put("download", dl);
        out.put("note", "已改好并生成**下载按钮**。告诉用户点下面那个按钮下载；"
                + "**不要把任何 URL 写进正文**。原件仍然在，用户想对比可以让他看历史里的上一张卡片。");
        return out;
    }

    /** 改过的文件名：在原标签后加一个「（改）」，反复改不叠字。 */
    private static String revisedLabel(String base) {
        String b = base == null || base.isBlank() ? "导出" : base;
        return b.endsWith("（改）") ? b : b + "（改）";
    }

    private static List<String> stringList(JsonNode node) {
        List<String> out = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode n : node) {
                String s = n == null ? "" : n.asText("").trim();
                if (!s.isEmpty() && !out.contains(s)) {
                    out.add(s);
                }
            }
        }
        return out;
    }

    private static List<Map<String, String>> renameList(JsonNode node) {
        List<Map<String, String>> out = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode n : node) {
                String from = n.path("from").asText("").trim();
                String to = n.path("to").asText("").trim();
                if (!from.isEmpty() && !to.isEmpty()) {
                    out.add(Map.of("from", from, "to", to));
                }
            }
        }
        return out;
    }

    private static List<Integer> intList(JsonNode node) {
        List<Integer> out = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode n : node) {
                if (n != null && n.canConvertToInt()) {
                    out.add(n.asInt());
                }
            }
        }
        return out;
    }

    private static List<Map<String, String>> whereList(JsonNode node) {
        List<Map<String, String>> out = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode n : node) {
                String column = n.path("column").asText("").trim();
                if (column.isEmpty()) {
                    continue;
                }
                Map<String, String> one = new LinkedHashMap<>();
                one.put("column", column);
                one.put("op", n.path("op").asText("equals").trim());
                one.put("value", n.path("value").asText("").trim());
                out.add(one);
            }
        }
        return out;
    }

    /** 条件的说法翻成人话（确认句与「本次改了什么」都要给人看）。 */
    private static String wherePhrase(String op) {
        return switch (op == null ? "equals" : op) {
            case "notEquals" -> "不等于";
            case "contains" -> "包含";
            case "empty" -> "为空";
            case "notEmpty" -> "不为空";
            default -> "等于";
        };
    }

    // ── 一、候选选项（多级筛选的每一层） ──

    private AiTool listOptions() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "kind": {
                      "type": "string",
                      "enum": ["tabs", "groups", "applicants", "categories", "items"],
                      "description": "要列哪一层：tabs=四个页签（用户没说按什么维度导时先用它，选项会变成可点芯片）/ 课题组 / 申请人 / 物资分类 / 物资"
                    },
                    "from": { "type": "string", "description": "起始日期 yyyy-MM-dd（课题组与申请人只列这段时间内有记录的）" },
                    "to": { "type": "string", "description": "结束日期 yyyy-MM-dd" },
                    "group": { "type": "string", "description": "课题组全称，用于收窄分类 / 物资（可选）" },
                    "categoryId": { "type": "integer", "description": "分类 id，用于收窄物资（可选，来自 kind=categories 的结果）" },
                    "keyword": { "type": "string", "description": "按名称过滤（物资用得到，如「枪头」「手套」）" }
                  },
                  "required": ["kind"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listMaterialAuditOptions",
                "列申领审计能筛的**候选值**：课题组 / 申请人 / 物资分类 / 物资。"
                        + "用户说了一个名字、但不确定平台里的准确写法时，先用它确认真实取值再筛 —— "
                        + "别拿用户原话当筛选项硬传。",
                schema, CAP_MATERIAL_AUDIT, SideEffect.READ,
                (ctx, args) -> {
                    String kind = arg(args, "kind", "groups");
                    String from = arg(args, "from", null);
                    String to = arg(args, "to", null);
                    String group = arg(args, "group", null);
                    String keyword = arg(args, "keyword", null);
                    NodeMaybe cid = longArg(args, "categoryId");

                    List<Map<String, Object>> rows = new ArrayList<>();
                    switch (kind) {
                        case "tabs" -> {
                            rows.add(AiChoices.option("个人审计（某个人领了什么）", "personal"));
                            rows.add(AiChoices.option("课题组审计（某个组领了什么）", "group"));
                            rows.add(AiChoices.option("按物品审计（某样东西谁领了、领多少）", "item"));
                            rows.add(AiChoices.option("物品+课题组（某样东西在某个组的分布）", "itemGroup"));
                        }
                        case "groups" -> {
                            // 这两条服务方法返回的是 Result 包装（与页面接口同源），要取 getData()
                            Result<List<String>> gr = materialService.listGroupsWithRecords(ctx.actor(), from, to);
                            for (String g : gr == null || gr.getData() == null ? List.<String>of() : gr.getData()) {
                                if (keyword != null && !contains(g, keyword)) continue;
                                rows.add(AiChoices.option(g, g));
                            }
                        }
                        case "applicants" -> {
                            Result<List<Map<String, Object>>> ar =
                                    materialService.listApplicantsWithRecords(ctx.actor(), from, to);
                            for (Map<String, Object> a : ar == null || ar.getData() == null
                                    ? List.<Map<String, Object>>of() : ar.getData()) {
                                String name = str(firstOf(a, "applicantName", "name"));
                                if (keyword != null && !contains(name, keyword)) continue;
                                rows.add(AiChoices.option(name, str(firstOf(a, "userId", "id"))));
                            }
                        }
                        case "categories" -> {
                            for (MaterialCategoryView c : materialService.listCategoriesForAdmin(group)) {
                                String name = str(c.getName());
                                if (keyword != null && !contains(name, keyword)) continue;
                                rows.add(AiChoices.option(name, c.getId() == null ? "" : String.valueOf(c.getId())));
                            }
                        }
                        case "items" -> {
                            // 这几条返回的是 DTO（不是 Map）—— 用 getter，别按 Map 取值（会静默取空）
                            for (MaterialItemView it : materialService.listItemsForAdmin(cid.value, group)) {
                                String name = str(it.getName());
                                String sub = str(it.getSubtitle());
                                if (keyword != null && !contains(name + " " + sub, keyword)) continue;
                                rows.add(AiChoices.option(sub.isEmpty() ? name : name + " · " + sub,
                                        it.getId() == null ? "" : String.valueOf(it.getId())));
                            }
                        }
                        default -> {
                            return Map.of("ok", false, "reason", "kind 只能是 groups / applicants / categories / items");
                        }
                    }
                    boolean truncated = rows.size() > MAX_OPTIONS;
                    if (truncated) {
                        rows = new ArrayList<>(rows.subList(0, MAX_OPTIONS));
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("kind", kind);
                    out.put("count", rows.size());
                    out.put("options", rows);
                    // 候选**一律走芯片**（面板渲染成可点选项）：用户是点一下，不是照着正文手打。
                    // 太多就没法点 —— 只把前 5 个做成芯片，其余靠 keyword 收窄（L1 里交代了怎么说）。
                    if (!rows.isEmpty()) {
                        List<Map<String, Object>> chips = rows.size() <= CHIP_MAX
                                ? rows : new ArrayList<>(rows.subList(0, CHIP_MAX));
                        out.put("choices", chips);
                        out.put("choicesTitle", chipTitle(kind));
                    }
                    if (rows.isEmpty()) {
                        out.put("note", "这个条件下没有候选；时间段放宽一点或换个名字写法再试");
                    } else if (truncated || rows.size() > CHIP_MAX) {
                        out.put("note", "候选很多：芯片只给了前 " + CHIP_MAX + " 个，剩下的让用户给个关键词再查一次");
                    }
                    return out;
                });
    }

    // ── 二、明细查询（多级筛选的交集） ──

    private AiTool queryAudit() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "tab": {
                      "type": "string",
                      "enum": ["personal", "group", "item", "itemGroup"],
                      "description": "个人审计 / 课题组审计 / 按物品审计 / 物品+课题组"
                    },
                    "from": { "type": "string", "description": "起始日期 yyyy-MM-dd" },
                    "to": { "type": "string", "description": "结束日期 yyyy-MM-dd" },
                    "group": { "type": "string", "description": "课题组全称（group 与 itemGroup 用）" },
                    "applicantUserId": { "type": "string", "description": "申请人 id（personal 用，来自 kind=applicants）" },
                    "categoryId": { "type": "integer", "description": "物资分类（item / itemGroup 用）" },
                    "itemId": { "type": "integer", "description": "物资 id（item / itemGroup 用；不传=全部物资）" },
                    "itemKeyword": { "type": "string", "description": "按物资名称过滤（item / itemGroup 用）" },
                    "limit": { "type": "integer", "description": "最多回几行，默认 20，上限 40" }
                  },
                  "additionalProperties": false
                }""";
        return new AiTool(
                "queryMaterialAudit",
                "按多级筛选（页签 + 时间段 + 课题组 / 人 + 分类 + 物资）取**申领审计明细行**。"
                        + "用户想看「谁领了什么、多少、什么状态」「某个课题组/某样东西的来去流水」时用它。"
                        + "只要总数/导出走 prepareMaterialAuditExport。",
                schema, CAP_MATERIAL_AUDIT, SideEffect.READ,
                (ctx, args) -> {
                    String tab = arg(args, "tab", "group");
                    String from = arg(args, "from", null);
                    String to = arg(args, "to", null);
                    String group = arg(args, "group", null);
                    String applicant = arg(args, "applicantUserId", null);
                    String itemKeyword = arg(args, "itemKeyword", null);
                    NodeMaybe categoryId = longArg(args, "categoryId");
                    NodeMaybe itemId = longArg(args, "itemId");
                    int limit = Math.min(Math.max(args.path("limit").asInt(20), 1), MAX_ROWS);

                    List<Map<String, Object>> rows = new ArrayList<>();
                    int total;
                    if ("item".equals(tab) || "itemGroup".equals(tab)) {
                        List<MaterialItemFlowExportRow> all = materialService.collectItemFlowExportRows(
                                itemId.value, from, to, group, categoryId.value, itemKeyword);
                        total = all.size();
                        for (MaterialItemFlowExportRow r : all) {
                            if (rows.size() >= limit) break;
                            Map<String, Object> row = new LinkedHashMap<>();
                            row.put("time", r.getTime());
                            row.put("event", r.getEventType());
                            row.put("item", r.getItemName());
                            row.put("spec", r.getSpec());
                            row.put("qty", r.getQty());
                            row.put("stockAfter", r.getStockAfter());
                            row.put("applicant", r.getApplicantName());
                            row.put("group", r.getApplicantGroup());
                            row.put("requestId", r.getRequestId());
                            rows.add(row);
                        }
                    } else {
                        List<MaterialAuditGridRow> all = materialService.collectAuditGridRows(
                                ctx.actor(), from, to, applicant, group);
                        total = all.size();
                        for (MaterialAuditGridRow r : all) {
                            if (rows.size() >= limit) break;
                            Map<String, Object> row = new LinkedHashMap<>();
                            row.put("time", r.getTime());
                            row.put("applicant", r.getApplicantName());
                            row.put("group", r.getApplicantGroup());
                            row.put("item", r.getItemName());
                            row.put("qty", r.getQty());
                            row.put("status", r.getStatus());
                            row.put("requestId", r.getRequestId());
                            rows.add(row);
                        }
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("tab", tab);
                    out.put("totalRows", total);
                    out.put("returned", rows.size());
                    out.put("rows", rows);
                    out.put("note", rows.isEmpty()
                            ? "这个筛选组合下没有记录；放宽时间段或换维度再试"
                            : (total > rows.size() ? "只回了前 " + rows.size() + " 条，完整数据走导出" : null));
                    return out;
                });
    }

    // ── 三、导出准备：摘要 + 带参数的页面链接 ──

    /**
     * 这个页签的「对象」是否已经给定了。
     *
     * <p>判据按页签分：按物品/物品+课题组看物品（id / 名称 / 分类都算），个人审计看申请人，
     * 课题组审计看课题组。
     */
    private static boolean objectGiven(String tab, String itemKeyword, String group, String applicant,
                                       Long categoryId, Long itemId) {
        return switch (tab) {
            case "item", "itemGroup" -> itemId != null
                    || (itemKeyword != null && !itemKeyword.isBlank())
                    || categoryId != null;
            case "personal" -> applicant != null && !applicant.isBlank();
            default -> group != null && !group.isBlank();
        };
    }

    /**
     * 把「这个页签筛什么」做成可点选项交回去（顺带一个「全部…」兜底）。
     *
     * <p>候选**取自平台真实数据**（物品 / 课题组 / 有记录的人），并且抽不出候选时返回 null
     * —— 一个都问不出来还硬问，只会让用户干瞪眼。
     */
    private Map<String, Object> askObject(User actor, String tab, String from, String to, Long categoryId) {
        List<List<String>> pairs = new ArrayList<>();   // {label, value}
        String what;
        if ("item".equals(tab) || "itemGroup".equals(tab)) {
            for (MaterialItemView it : materialService.listItemsForAdmin(categoryId, null)) {
                if (it == null) continue;
                pairs.add(List.of(str(it.getName()), str(it.getName())));
                if (pairs.size() >= CHIP_MAX) break;
            }
            what = "哪件物品";
        } else if ("personal".equals(tab)) {
            Result<List<Map<String, Object>>> ar = materialService.listApplicantsWithRecords(actor, from, to);
            for (Map<String, Object> a : ar == null || ar.getData() == null ? List.<Map<String, Object>>of() : ar.getData()) {
                String name = str(firstOf(a, "applicantName", "name"));
                pairs.add(List.of(name, str(firstOf(a, "userId", "id"))));
                if (pairs.size() >= CHIP_MAX) break;
            }
            what = "哪个申请人";
        } else {
            Result<List<String>> gr = materialService.listGroupsWithRecords(actor, from, to);
            for (String g : gr == null || gr.getData() == null ? List.<String>of() : gr.getData()) {
                pairs.add(List.of(g, g));
                if (pairs.size() >= CHIP_MAX) break;
            }
            what = "哪个课题组";
        }
        if (pairs.isEmpty()) {
            return null;   // 没候选就别硬问
        }
        List<Map<String, Object>> options = new ArrayList<>();
        for (List<String> p : pairs) {
            options.add(AiChoices.option(p.get(0), p.get(1)));
        }
        options.add(AiChoices.option("全部" + ("哪件物品".equals(what) ? "物品" : what.replace("哪个", "")), "all"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", false);
        out.put("reason", "这个页签还没定要导" + what + "。**先问用户**（选项已做成可点选项，别在正文里列）；"
                + "他若说不用筛，就把「全部」那一项的 value 传回来");
        out.put("choices", options);
        out.put("choicesTitle", "导" + what + "？");
        out.put("note", "用户点完后，把他点的那项 value 原样放进 filterChoice 再调一次本工具");
        return out;
    }

    private AiTool prepareExport() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "tab": {
                      "type": "string",
                      "enum": ["personal", "group", "item", "itemGroup"],
                      "description": "与查询一致：要导哪个页签的审计"
                    },
                    "from": { "type": "string", "description": "起始日期 yyyy-MM-dd" },
                    "to": { "type": "string", "description": "结束日期 yyyy-MM-dd" },
                    "group": { "type": "string", "description": "课题组全称" },
                    "applicantUserId": { "type": "string", "description": "申请人 id（personal 用）" },
                    "categoryId": { "type": "integer", "description": "物资分类（item / itemGroup 用）" },
                    "itemId": { "type": "integer", "description": "物资 id（item / itemGroup 用）" },
                    "itemKeyword": { "type": "string", "description": "物资名称过滤" },
                    "filterChoice": {
                      "type": "string",
                      "description": "**只在工具把「这个页签筛什么」做成可点选项时用**：把用户点的那项 value 原样传回来（如物品名 / 课题组全称 / 申请人 id / 全部）"
                    }
                  },
                  "required": ["tab"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "prepareMaterialAuditExport",
                "准备一次申领审计导出：回报**这批多少行明细、几个板块、可按哪些层级小计**，"
                        + "并给出**带筛选参数的导出页链接**（页面会自动跳过去）。"
                        + "用户要「导出/下载」时用它；**不要**说文件已经生成——文件由用户在页面上的"
                        + "小计面板确认后才下载。",
                schema, CAP_MATERIAL_AUDIT, SideEffect.READ,
                (ctx, args) -> {
                    String tab = arg(args, "tab", "group");
                    String from = arg(args, "from", null);
                    String to = arg(args, "to", null);
                    String group = arg(args, "group", null);
                    String applicant = arg(args, "applicantUserId", null);
                    String itemKeyword = arg(args, "itemKeyword", null);
                    NodeMaybe categoryId = longArg(args, "categoryId");
                    NodeMaybe itemId = longArg(args, "itemId");

                    // 用户刚点的那个选项（如果有）：按页签落到对应的筛选参数上。
                    String filterChoice = arg(args, "filterChoice", null);
                    boolean filterAnswered = filterChoice != null && !filterChoice.isBlank();
                    if (filterAnswered && !"all".equalsIgnoreCase(filterChoice)) {
                        if ("item".equals(tab) || "itemGroup".equals(tab)) {
                            itemKeyword = filterChoice;
                        } else if ("personal".equals(tab)) {
                            applicant = filterChoice;
                        } else {
                            group = filterChoice;
                        }
                    }

                    // **每个页签的「对象」没定就先问**（真机反馈）：用户选了「按物品」页签，
                    // 工具却直接跳到「小计怎么配」，一句都没问他要筛哪件物品 ——
                    // 用户只能自己补一句「我还没筛选」。四个页签问的东西不同：
                    // personal→人、group→课题组、item→物品、itemGroup→物品。
                    // 放在**算摘要之前**：全量摘要又慢又没意义，先问清再算。
                    if (!filterAnswered
                            && !objectGiven(tab, itemKeyword, group, applicant, categoryId.value, itemId.value)) {
                        Map<String, Object> ask = askObject(ctx.actor(), tab, from, to, categoryId.value);
                        if (ask != null) {
                            return ask;
                        }
                    }

                    SubtotalSummary summary;
                    if ("item".equals(tab) || "itemGroup".equals(tab)) {
                        summary = excelExportService.summarizeItemFlow(
                                materialService.collectItemFlowExportRows(
                                        itemId.value, from, to, group, categoryId.value, itemKeyword));
                    } else {
                        summary = excelExportService.summarizeAuditGrid(
                                materialService.collectAuditGridRows(ctx.actor(), from, to, applicant, group));
                    }

                    Map<String, Object> sum = new LinkedHashMap<>();
                    sum.put("detailRows", summary.totals().detailRows());
                    sum.put("blocks", summary.totals().blocks());
                    sum.put("subtotalLevels", summary.levels().stream()
                            .map(l -> summary.levelLabels().getOrDefault(l, l)).toList());
                    sum.put("blockRows", summary.blocks().stream()
                            .map(b -> Map.of("label", b.label(), "rows", b.detailCount())).toList());

                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("ok", true);
                    out.put("summary", sum);
                    boolean mini = ctx.miniProgram();
                    String mode = arg(args, "mode", "ask");

                    // ① 空数据：什么都不给（不跳页、不给按钮），先让用户放宽条件
                    if (summary.totals().detailRows() == 0) {
                        out.put("note", "这个筛选组合下没有明细行（导出的表会是空的）。**不要给链接/按钮、页面也不会跳**，"
                                + "先让用户放宽条件（时间段 / 换课题组）再导");
                        return out;
                    }

                    // ② 先问一次（一次问完）：多少行 + 可按哪些层级小计 + 用不用上次的配置
                    if ("ask".equals(mode)) {
                        out.putAll(AiChoices.single("这批明细 " + summary.totals().detailRows() + " 行，"
                                        + summary.totals().blocks() + " 个板块，可按「"
                                        + String.join(" / ", (List<String>) sum.get("subtotalLevels")) + "」小计 —— "
                                        + "用上次的小计配置直接导出，还是自己配一下？",
                                List.of(AiChoices.option("用上次的小计配置直接导出", "last"),
                                        AiChoices.option("我要自己配一下小计", "custom"))));
                        out.put("note", "**把上面这枚问题交给用户点**（面板渲染成两个可点选项）；"
                                + "他选「用上次的」→ 再用 mode=last 调一次；选「自己配」→ 用 mode=custom 调一次。"
                                + "**不要在这一步自己跳页、也不要自己下载**");
                        return out;
                    }

                    // ③ 自己配：**在对话里多选**（不跳页），勾完再调 mode=direct 带 levels 回来。
                    //    **两端都能给**（2026-10-09 起）：小程序抽屉补上了多选渲染（勾完点确认）。
                    if ("custom".equals(mode)) {
                        Map<String, String> levels = new LinkedHashMap<>();
                        levels.put("total", "总计");
                        levels.put("lv1", "课题组小计");
                        levels.put("lv2", "申领人小计");
                        levels.put("lv3", "物品小计");
                        out.putAll(AiChoices.multi("按哪些层级小计？（可多选，勾完点确认）",
                                AiChoices.optionsOf(levels)));
                        out.put("note", "用户在选项里勾完会回一句他勾中的层级；然后**用 mode=last 之外的方式**："
                                + "再调一次本工具并把 levels 传成他勾的那些（如 [\"total\",\"lv1\"]），"
                                + "这样会直接给下载按钮。**这一轮不要跳页**");
                        return out;
                    }

                    // ④ 用上次配置（或用户勾的层级）直接导出 → 给**下载按钮**，全程不跳页。
                    //    **两端都能给**（2026-10-09 起）：小程序抽屉也接上了 download 事件
                    //    （收了指令就渲染一张下载卡，点完 openDocument），不再只能退化成跳页。
                    if ("last".equals(mode) || "direct".equals(mode)) {
                        Map<String, Object> params = new LinkedHashMap<>();
                        params.put("tab", tab);
                        params.put("from", from);
                        params.put("to", to);
                        if ("group".equals(tab) || "itemGroup".equals(tab)) {
                            params.put("group", group);
                        }
                        if ("personal".equals(tab)) {
                            params.put("applicantUserId", applicant);
                        }
                        if (categoryId.value != null) {
                            params.put("categoryId", categoryId.value);
                        }
                        if (itemId.value != null) {
                            params.put("itemId", itemId.value);
                        }
                        params.put("itemKeyword", itemKeyword);
                        List<String> chosen = levelsArg(args);
                        if (!chosen.isEmpty()) {
                            params.put("levels", chosen);
                        }
                        Map<String, Object> dl = new LinkedHashMap<>();
                        dl.put("kind", "materialAudit");
                        dl.put("label", exportLabel(tab, group, itemKeyword));
                        dl.put("params", params);
                        out.put("download", dl);
                        out.put("note", "已让载体生成**下载按钮**（内置本次导出：网页端用他浏览器里那份小计配置，"
                                + "小程序端按上面给的层级/默认全保留）。告诉用户点那个按钮就下载；"
                                + "**不要把任何 URL 写进正文**，也不用再跳页");
                        return out;
                    }

                    // ⑤ 跳页 + 自动打开导出弹窗（**只给小程序用**：那边没有多选 UI、也不记上次配置）
                    out.put("navigate", Map.of(
                            "path", mini
                                    ? miniLink(tab, from, to, group, applicant, categoryId.value, itemId.value, itemKeyword)
                                    : webLink(tab, from, to, group, applicant, categoryId.value, itemId.value, itemKeyword),
                            "label", "申领审计导出"));
                    out.put("note", mini
                            ? "已把小程序页面带过去、筛选也带上了，并在那页直接打开导出设置弹层 —— 让用户确认后导出。"
                                    + "注意：**小程序那个弹层不记上次配置**，别承诺「会带出上次的」"
                            : "已把页面带过去、筛选也带上了，导出弹窗也会自动打开并带出他上次的小计配置 —— "
                                    + "让用户在弹窗里确认或调整后导出。**不要说「文件已生成」**");
                    return out;
                });
    }

    /** 网页版导出页链接：参数名与页面上的筛选项一一对应（页面读 URL 预填）。 */
    private static String webLink(String tab, String from, String to, String group, String applicant,
                                  Long categoryId, Long itemId, String itemKeyword) {
        StringBuilder sb = new StringBuilder(WEB_PAGE_PATH).append("?tab=").append(tab);
        append(sb, "from", from);
        append(sb, "to", to);
        if ("group".equals(tab)) {
            append(sb, "group", group);
        }
        if ("itemGroup".equals(tab)) {
            append(sb, "itemGroup", group);
        }
        if ("personal".equals(tab)) {
            append(sb, "userId", applicant);
        }
        if (categoryId != null && categoryId > 0) {
            append(sb, "categoryId", String.valueOf(categoryId));
        }
        if (itemId != null && itemId > 0) {
            append(sb, "itemId", String.valueOf(itemId));
        }
        append(sb, "itemKeyword", itemKeyword);
        // 落页后直接把导出弹窗打开 —— 助手把用户送到「最后一步」，不用他自己再点「导出表格」
        sb.append("&openExport=1");
        return sb.toString();
    }

    /**
     * 小程序版的页面链接：小程序自己的物资领用审计页（页签键与网页一致）。
     *
     * <p>参数名对应那个页面的 picker 字段（group/category/item/applicant），页面 onLoad 会读出来预填；
     * 值必须在候选里命中才落（命中不了宁可不选，选中一个不存在的值更难解释）。
     */
    private static String miniLink(String tab, String from, String to, String group, String applicant,
                                   Long categoryId, Long itemId, String itemKeyword) {
        StringBuilder sb = new StringBuilder(MP_PAGE_PATH).append("?tab=").append(tab);
        append(sb, "from", from);
        append(sb, "to", to);
        if ("group".equals(tab) || "itemGroup".equals(tab)) {
            append(sb, "group", group);
        }
        if ("personal".equals(tab)) {
            append(sb, "applicant", applicant);
        }
        if (categoryId != null && categoryId > 0) {
            append(sb, "category", String.valueOf(categoryId));
        }
        if (itemId != null && itemId > 0) {
            append(sb, "item", String.valueOf(itemId));
        }
        append(sb, "keyword", itemKeyword);
        sb.append("&openExport=1");
        return sb.toString();
    }

    private static void append(StringBuilder sb, String key, String value) {
        if (value != null && !value.isBlank()) {
            sb.append('&').append(key).append('=').append(java.net.URLEncoder.encode(value,
                    java.nio.charset.StandardCharsets.UTF_8));
        }
    }

    // ── 杂项 ──

    /** 可选 long 参数（缺省与 0 都当「没给」）。 */
    private record NodeMaybe(Long value) {
    }

    private static NodeMaybe longArg(JsonNode args, String field) {
        JsonNode n = args == null ? null : args.path(field);
        if (n == null || !n.canConvertToLong() || n.asLong() <= 0) {
            return new NodeMaybe(null);
        }
        return new NodeMaybe(n.asLong());
    }

    private static String arg(JsonNode args, String field, String fallback) {
        JsonNode n = args == null ? null : args.path(field);
        return n == null || !n.isTextual() || n.asText("").isBlank() ? fallback : n.asText("").trim();
    }

    /** 用户勾中的小计层级（值或中文标签都收，统一折成 total/lv1/lv2/lv3）。 */
    private static List<String> levelsArg(JsonNode args) {
        JsonNode arr = args == null ? null : args.path("levels");
        List<String> out = new ArrayList<>();
        if (arr == null || !arr.isArray()) {
            return out;
        }
        for (JsonNode n : arr) {
            String v = n == null ? "" : n.asText("").trim();
            String key = switch (v) {
                case "总计", "total" -> "total";
                case "课题组小计", "课题组", "lv1" -> "lv1";
                case "申领人小计", "申领人", "lv2" -> "lv2";
                case "物品小计", "物品", "lv3" -> "lv3";
                default -> "";
            };
            if (!key.isEmpty() && !out.contains(key)) {
                out.add(key);
            }
        }
        return out;
    }

    /** 导出标签（进文件名）：与页面那套命名保持一致，用户在文件列表里认得出来。 */
    private static String exportLabel(String tab, String group, String itemKeyword) {
        return switch (tab) {
            case "personal" -> "个人审计";
            case "item" -> "物品审计" + (itemKeyword == null ? "" : "-" + itemKeyword);
            case "itemGroup" -> "物品+课题组审计" + (group == null ? "" : "-" + group);
            default -> "课题组审计" + (group == null ? "" : "-" + group);
        };
    }

    /** 芯片标题：问的是一件事，标题要把「选什么」说清楚。 */
    private static String chipTitle(String kind) {
        return switch (kind) {
            case "tabs" -> "按哪个维度导？";
            case "groups" -> "哪个课题组？";
            case "applicants" -> "哪个申领人？";
            case "categories" -> "哪一类物资？";
            case "items" -> "哪样物资？";
            default -> "选一个";
        };
    }

    private static boolean contains(String hay, String needle) {
        return hay != null && needle != null && hay.toLowerCase().contains(needle.toLowerCase());
    }

    private static Object firstOf(Map<?, ?> row, String... keys) {
        for (String k : keys) {
            Object v = row.get(k);
            if (v != null) {
                return v;
            }
        }
        return null;
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }
}
