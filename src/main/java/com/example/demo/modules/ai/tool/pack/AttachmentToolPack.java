package com.example.demo.modules.ai.tool.pack;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.adminfile.AdminFileTemplateService;
import com.example.demo.modules.ai.entity.AiAttachment;
import com.example.demo.modules.ai.excel.ByteArrayMultipartFile;
import com.example.demo.modules.ai.excel.SpreadsheetWriter;
import com.example.demo.modules.ai.service.AiAttachmentService;
import com.example.demo.modules.ai.tool.AiTool;
import com.example.demo.modules.ai.tool.AiToolContext;
import com.example.demo.modules.ai.tool.AiToolPack;
import com.example.demo.modules.ai.tool.SideEffect;
import com.example.demo.modules.auth.entity.User;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 附件包 —— 让大模型「处理表格」的三条腿：**看见全量**、**知道有哪几份**、**把结果落进文件模板库**。
 *
 * <p>背景见「大模型处理 Excel」设计：xlsx 是二进制，模型读不了；整张表塞进消息又会撑爆窗口。
 * 所以服务端解析后**全量留在 {@code ai_attachment}**，消息里只拼一段预览（前若干行）。
 * 模型要看更多，就调本包的分页读。
 *
 * <p><b>清洗本身不在工具里</b>：那是模型看着数据按用户规则产出新数据，属它的本职。
 * 工具只做它够不着的三件事 —— 把全量喂给它（分页读）、让它知道有哪几份（列清单）、
 * 把它产出的结构化结果**落成真文件**（模型产不出二进制，这一步只能由代码做）。
 *
 * <p>读的两个是 A 级；`saveSpreadsheetToLibrary` 是 **C 级**（写进全站共用的库、别人也看得到），
 * 一律挂起等用户点确认。
 */
@Component
public class AttachmentToolPack implements AiToolPack {

    public static final String CAP_ATTACHMENT = "ai.file.attachment";
    /** 落进文件模板库：与模板库 Controller 的 requireStaff 同口径（教职工起）。 */
    public static final String CAP_FILE_SAVE = "ai.file.save";

    /** 一次最多存这么多行：AI 落库不是批量导入通道，超了让它拆。 */
    private static final int MAX_SAVE_ROWS = 5000;

    private final AiAttachmentService attachmentService;
    private final AdminFileTemplateService templateService;

    public AttachmentToolPack(AiAttachmentService attachmentService,
                              AdminFileTemplateService templateService) {
        this.attachmentService = attachmentService;
        this.templateService = templateService;
    }

    @Override
    public String packKey() {
        return "attachment";
    }

    @Override
    public String displayName() {
        return "表格附件";
    }

    /**
     * 路由词（L2）。
     *
     * <p>**不能留空**：包数已超过每轮上限（{@code AiPackRouter.MAX_PACKS_PER_TURN}），
     * 路由只在命中词里挑包，空 hints 的包会被整个漏发 —— 用户传了表却在问「表格里的日期」时，
     * 模型手里连读表的工具都没有。这里挑的是**表格域特征词**，不捡「名单」「导入」这类
     * 在别的域也常出现的泛词，免得抢掉别包的位。
     */
    @Override
    public Set<String> routeHints() {
        return Set.of("表格", "excel", "xlsx", "xls", "附件", "工作表", "表头", "合并单元格", "去重", "清洗");
    }

    @Override
    public String defaultPrompt() {
        return """
                表格附件的口径：
                - 用户上传的表**只在消息里得到前几行的预览**，全量留在服务端。预览里带着「附件 id」。
                - **要看更多、或要精确数值，必须调 readSpreadsheetAttachment**（按 sheet + 行区间 + 选列分段读），
                  不要照着预览里那几行的印象下结论 —— 预览是截断的，后面还有内容。
                - 表里有合并单元格的展开值、公式的**计算结果**（不是公式串）—— 这是服务端解析时做好的，
                  你直接当数据处理即可，不要自己再算。
                - 清洗/转换由你来做（识别表头行、判断列语义、按用户的规则归并/去重/改格式），
                  但**数值、日期、求和这类确定性结果以数据为准**，不要凭印象改。
                - 结果用 markdown 表格展示（多条记录时），并说清「这是按你说的规则清洗后的结果」。
                - 用户要「存下来 / 导出 / 落到模板库」时，调 **saveSpreadsheetToLibrary**：
                  把**清洗后的最终数据**（表头 + 数据行）传给它，服务端会写成真 xlsx 存进文件模板库。
                  存之前会弹确认（那是全站共用的库，别人也看得到）。存完给用户**下载链接**，
                  并说明「这份是 AI 清洗的结果，采用前请人工核对」。
                - 附件是**会话级**的：换一个对话就看不到旧的。找不到就说找不到，别猜内容。""";
    }

    @Override
    public Map<String, Predicate<User>> capabilities() {
        // 与模板库/附件读取的入口同口径：教职工起（镜像 AdminAuthInterceptor#isStaffBase）
        return Map.of(
                CAP_ATTACHMENT, user -> level(user) >= RoleEnum.STAFF.getLevel(),
                // 落库那一个与模板库 Controller 的 requireStaff 同口径
                CAP_FILE_SAVE, user -> level(user) >= RoleEnum.STAFF.getLevel());
    }

    @Override
    public List<AiTool> tools() {
        return List.of(listAttachments(), readSpreadsheetAttachment(), saveSpreadsheetToLibrary());
    }

    // ── 写：把清洗结果落进文件模板库 ──

    /**
     * 清洗后的表格 → 真 xlsx → 存进文件模板库。
     *
     * <p><b>为什么这一步非得有工具</b>：模型产不出二进制文件，它只能给结构化数据；
     * 「落成文件」是代码的事（与「模型只产出意图」那条不变量同源）。
     *
     * <p><b>为什么 C 级、必须确认</b>：落进去的是**全站共用、别人也能下载**的库，
     * 不是用户自己的草稿箱 —— 一次误操作会出现在所有人的模板列表里。
     */
    private AiTool saveSpreadsheetToLibrary() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "filename": { "type": "string", "description": "存进库里的文件名，例如「2026秋季名单-清洗后」（自动补 .xlsx）" },
                    "sheetName": { "type": "string", "description": "工作表名，省略则用文件名" },
                    "headers": { "type": "array", "items": { "type": "string" }, "description": "表头（列名），按列顺序" },
                    "rows": {
                      "type": "array",
                      "items": { "type": "array", "items": { "type": "string" } },
                      "description": "数据行，每行一个字符串数组、与 headers 对齐。**传清洗后的最终数据，不是原始数据**"
                    }
                  },
                  "required": ["filename", "rows"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "saveSpreadsheetToLibrary",
                "把**清洗/转换后的**表格写成 xlsx 存进文件模板库（用户可下载、打印、归类）。"
                        + "传进来的必须是最终数据。调用它会先挂起等用户点确认 —— 那是全站共用的库。",
                schema,
                CAP_FILE_SAVE,
                SideEffect.EXTERNAL_WRITE,
                (ctx, args) -> doSaveToLibrary(ctx, args),
                null,
                AttachmentToolPack::saveConfirmDetail);
    }

    private Map<String, Object> doSaveToLibrary(AiToolContext ctx, JsonNode args) {
        String filename = text(args, "filename").trim();
        if (filename.isEmpty()) {
            return Map.of("ok", false, "reason", "要给个文件名");
        }
        // 库是按扩展名判类型的，缺了就补上 —— 否则会被拒（「不允许的文件类型」）
        if (!filename.toLowerCase().endsWith(".xlsx")) {
            filename = filename + ".xlsx";
        }
        List<String> headers = stringList(args.path("headers"));
        List<List<String>> rows = new ArrayList<>();
        if (args.path("rows").isArray()) {
            for (JsonNode row : args.path("rows")) {
                rows.add(stringList(row));
            }
        }
        if (rows.isEmpty() && headers.isEmpty()) {
            return Map.of("ok", false, "reason", "没有可保存的内容（headers 与 rows 都是空）");
        }
        if (rows.size() > MAX_SAVE_ROWS) {
            return Map.of("ok", false, "reason",
                    "行数 " + rows.size() + " 超过单次上限 " + MAX_SAVE_ROWS + "，请让用户拆分后再存");
        }
        String sheetName = text(args, "sheetName");
        byte[] xlsx = SpreadsheetWriter.toXlsx(
                sheetName.isEmpty() ? filename.replaceFirst("(?i)\\.xlsx$", "") : sheetName, headers, rows);

        Map<String, Object> saved;
        try {
            saved = templateService.saveUpload(
                    new ByteArrayMultipartFile("file", filename,
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xlsx),
                    ctx.actor().getId(), "TEMPLATE", false, null);
        } catch (Exception e) {
            return Map.of("ok", false, "reason", "存入文件模板库失败：" + e.getMessage());
        }
        String id = saved == null || saved.get("id") == null ? "" : String.valueOf(saved.get("id"));
        String path = "/api/admin/file-templates/" + id + "/download";
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("filename", filename);
        out.put("templateId", id);
        out.put("rows", rows.size());
        out.put("columns", headers.isEmpty() ? (rows.isEmpty() ? 0 : rows.get(0).size()) : headers.size());
        out.put("downloadPath", path);
        out.put("note", "已存入文件模板库（未归类）。给用户下载链接时**照抄这个路径**，写成 "
                + "[下载 " + filename + "](" + path + ")。并提醒一句：这是 AI 清洗的结果，采用前请人工核对。");
        return out;
    }

    /** 确认弹窗那行：写清存哪个文件名、多少行多少列 —— 用户唯一能判断的依据就是这行字。 */
    private static String saveConfirmDetail(JsonNode args) {
        String name = args == null ? "" : args.path("filename").asText("");
        int rows = args != null && args.path("rows").isArray() ? args.path("rows").size() : 0;
        int cols = 0;
        if (args != null && args.path("headers").isArray()) {
            cols = args.path("headers").size();
        } else if (args != null && args.path("rows").isArray() && args.path("rows").size() > 0) {
            cols = args.path("rows").get(0).size();
        }
        return "本次：把清洗结果存进**文件模板库** · " + name + "（" + rows + " 行 × " + cols + " 列）";
    }

    private static List<String> stringList(JsonNode node) {
        List<String> out = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode n : node) {
                out.add(n.isNull() ? "" : n.asText(""));
            }
        }
        return out;
    }

    private static String text(JsonNode args, String field) {
        return args.path(field).asText("");
    }

    private AiTool listAttachments() {
        String schema = """
                {
                  "type": "object",
                  "properties": {},
                  "additionalProperties": false
                }""";
        return new AiTool(
                "listAttachments",
                "列出**当前对话**里上传过的表格附件（id、文件名、工作表数、行列数、是否被截断）。"
                        + "忘了附件 id、或用户说「我上传的那份表」时用它。换一个对话看不到旧的。",
                schema,
                CAP_ATTACHMENT,
                SideEffect.READ,
                (ctx, args) -> {
                    List<AiAttachment> list = attachmentService.listSession(ctx.sessionId());
                    List<Map<String, Object>> rows = new ArrayList<>();
                    for (AiAttachment a : list) {
                        rows.add(summary(a));
                    }
                    Map<String, Object> out = new LinkedHashMap<>();
                    out.put("total", rows.size());
                    out.put("attachments", rows);
                    if (rows.isEmpty()) {
                        out.put("note", "这个对话里还没有上传过表格附件。");
                    }
                    return out;
                });
    }

    private AiTool readSpreadsheetAttachment() {
        String schema = """
                {
                  "type": "object",
                  "properties": {
                    "attachmentId": { "type": "integer", "description": "附件 id（预览或 listAttachments 里给的那个）" },
                    "sheet": { "type": "integer", "description": "第几个工作表，**从 0 起**；省略=0" },
                    "offset": { "type": "integer", "description": "从第几行开始（0 起，按数据行算）；省略=0" },
                    "limit": { "type": "integer", "description": "最多取多少行；省略=50，上限=200" },
                    "columns": {
                      "type": "array",
                      "items": { "type": "integer" },
                      "description": "只要哪几列（**从 1 起**，与用户说的「第几列」一致）；省略=全部列。列多时只取需要的几列能省很多 token"
                    }
                  },
                  "required": ["attachmentId"],
                  "additionalProperties": false
                }""";
        return new AiTool(
                "readSpreadsheetAttachment",
                "分页读某个表格附件的内容（按工作表 + 行区间 + 选列）。返回里每行带**行号（1 起）**与列号，"
                        + "方便和用户口中的「第几行第几列」对上。要看全量或精确数值时用它，别照着预览的印象下结论。",
                schema,
                CAP_ATTACHMENT,
                SideEffect.READ,
                (ctx, args) -> {
                    long id = args.path("attachmentId").asLong(0);
                    if (id <= 0) {
                        return Map.of("ok", false, "reason", "要给 attachmentId。先看预览里的附件 id，或用 listAttachments");
                    }
                    AiAttachment a;
                    try {
                        a = attachmentService.requireOwned(id, ctx.sessionId());
                    } catch (IllegalStateException e) {
                        return Map.of("ok", false, "reason", e.getMessage());
                    }
                    int sheet = clamp(args.path("sheet").asInt(0), 0, 20);
                    int offset = Math.max(0, args.path("offset").asInt(0));
                    int limit = clamp(args.path("limit").asInt(50), 1, 200);
                    List<Integer> columns = new ArrayList<>();
                    if (args.path("columns").isArray()) {
                        args.path("columns").forEach(n -> {
                            if (n.canConvertToInt()) {
                                columns.add(n.asInt());
                            }
                        });
                    }
                    try {
                        return attachmentService.readRows(a, sheet, offset, limit, columns);
                    } catch (IllegalArgumentException e) {
                        return Map.of("ok", false, "reason", e.getMessage());
                    }
                });
    }

    private static Map<String, Object> summary(AiAttachment a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("attachmentId", a.getId());
        m.put("filename", a.getFilename());
        m.put("sheets", a.getSheetCount());
        m.put("rows", a.getRowCount());
        m.put("cols", a.getColCount());
        if (Boolean.TRUE.equals(a.getTruncated())) {
            m.put("truncated", true);
            m.put("note", a.getNote());
        }
        m.put("summary", a.getFilename() + "（" + a.getSheetCount() + " 个工作表，首个 "
                + a.getRowCount() + " 行 × " + a.getColCount() + " 列）");
        return m;
    }

    private static int clamp(int v, int min, int max) {
        return Math.min(Math.max(v, min), max);
    }

    private static int level(User user) {
        RoleEnum role = user.getRole() == null ? RoleEnum.MEMBER : user.getRole();
        return role.getLevel();
    }
}
