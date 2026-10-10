package com.example.demo.modules.telemetry.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermBundleOptionDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermCandidateDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermMatrixDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermExportRequest;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermPlanDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermQueryPageDto;
import com.example.demo.modules.telemetry.dto.longterm.TelemetryLongtermVariableDto;
import com.example.demo.modules.telemetry.service.TelemetryLongtermArchiveService;
import com.example.demo.modules.telemetry.service.TelemetryLongtermExportService;
import com.example.demo.modules.telemetry.service.TelemetryLongtermPdfService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 管理端：变量长期归档（配置 + 查询 + 导出）。
 *
 * <p>门槛 ADMIN 起，**方法内显式判一次** —— `/api/admin/**` 的拦截器底座只到 STAFF，
 * 只靠拦截器会把本页对全体教职工开放。
 */
@RestController
@RequestMapping("/api/admin/telemetry/longterm")
@Tag(name = "变量长期归档(管理)")
public class AdminTelemetryLongtermController {

    private final TelemetryLongtermArchiveService service;
    private final TelemetryLongtermExportService exportService;
    private final TelemetryLongtermPdfService pdfService;

    public AdminTelemetryLongtermController(TelemetryLongtermArchiveService service,
                                            TelemetryLongtermExportService exportService,
                                            TelemetryLongtermPdfService pdfService) {
        this.service = service;
        this.exportService = exportService;
        this.pdfService = pdfService;
    }

    @GetMapping("/candidates")
    @Operation(summary = "候选变量（来自变量目录，可按分区 / 关键词 / 楼层收窄）")
    public Result<List<TelemetryLongtermCandidateDto>> candidates(
            HttpServletRequest request,
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(value = "floor", required = false) String floor,
            @RequestParam(value = "bundle", required = false) String bundle) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        return Result.success(service.listCandidates(keyword, floor, bundle));
    }

    @GetMapping("/candidates/bundles")
    @Operation(summary = "候选变量的分区列表（变量目录原本的导入分区 + 各分区变量数）")
    public Result<List<TelemetryLongtermBundleOptionDto>> candidateBundles(HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        return Result.success(service.listCandidateBundles());
    }

    @GetMapping("/matrix")
    @Operation(summary = "按天矩阵（行=变量、列=平分槽位；给了 day 就只看那一天）")
    public Result<TelemetryLongtermMatrixDto> matrix(
            HttpServletRequest request,
            @RequestParam(value = "day", required = false) String day,
            @RequestParam(value = "month", required = false) String month,
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(value = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        return Result.success(service.queryMatrix(day, month, from, to));
    }

    @GetMapping("/days")
    @Operation(summary = "区间内有哪些天有数据（日历上标注用）")
    public Result<List<String>> days(
            HttpServletRequest request,
            @RequestParam(value = "month", required = false) String month,
            @RequestParam(value = "from", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(value = "to", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        return Result.success(service.listDaysWithData(month, from, to));
    }

    @GetMapping("/variables")
    @Operation(summary = "已选变量与顺序")
    public Result<List<TelemetryLongtermVariableDto>> variables(HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        return Result.success(service.listVariables());
    }

    @PutMapping("/variables")
    @Operation(summary = "保存已选变量与顺序（整份替换）")
    public Result<List<TelemetryLongtermVariableDto>> saveVariables(
            HttpServletRequest request,
            @RequestBody List<TelemetryLongtermVariableDto> body) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        service.saveVariables(body);
        return Result.success(service.listVariables(), "已保存");
    }

    @GetMapping("/plan")
    @Operation(summary = "归档计划只读视图（含最近若干轮采集留痕）")
    public Result<TelemetryLongtermPlanDto> plan(HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        return Result.success(service.getPlanView());
    }

    @GetMapping("/samples")
    @Operation(summary = "长期采样明细分页（按月 / 区间 / 变量）")
    public Result<TelemetryLongtermQueryPageDto> samples(
            HttpServletRequest request,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "size", defaultValue = "50") int size,
            @RequestParam(value = "variableQ", required = false) String variableQ,
            @RequestParam(value = "month", required = false) String month,
            @RequestParam(value = "from", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(value = "to", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        return Result.success(service.querySamples(page, size, variableQ, month, from, to));
    }

    @GetMapping("/months")
    @Operation(summary = "有数据的月份（月份下拉）")
    public Result<List<String>> months(HttpServletRequest request) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return cast(denied);
        }
        return Result.success(service.listMonths());
    }

    @PostMapping("/export")
    @Operation(summary = "导出长期采样 Excel（长表/宽表）")
    public ResponseEntity<byte[]> export(HttpServletRequest request,
                                         @RequestBody TelemetryLongtermExportRequest req) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN)
                    .body((denied.getMessage() != null ? denied.getMessage() : "需要管理员权限")
                            .getBytes(StandardCharsets.UTF_8));
        }
        try {
            byte[] body = exportService.exportXlsx(req);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            disposition("telemetry-longterm-" + asciiStem(req) + ".xlsx", displayStem(req) + "监测数据表格.xlsx"))
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(body);
        } catch (IllegalArgumentException ex) {
            // 未选时间范围 → 400：用户口径是「不选时间范围不允许导出」
            return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN)
                    .body((ex.getMessage() != null ? ex.getMessage() : "未选择时间范围").getBytes(StandardCharsets.UTF_8));
        } catch (IllegalStateException ex) {
            return ResponseEntity.internalServerError().contentType(MediaType.TEXT_PLAIN)
                    .body((ex.getMessage() != null ? ex.getMessage() : "导出失败").getBytes(StandardCharsets.UTF_8));
        }
    }

    /**
     * 导出长期采样 Excel 的 GET 变体：给 AI 载体按地址取文件用。
     *
     * <p>网页端载体取文件走的是纯 GET（带不了 body），而页面上的导出是 {@code POST /export}
     * （要 JSON body），不能直接当下载地址。所以这里把同一份导出逻辑用 query 参数再开一条 GET。
     */
    @GetMapping("/export/download")
    @Operation(summary = "导出长期采样 Excel（GET，供 AI 载体按地址取）")
    public ResponseEntity<byte[]> exportDownload(
            HttpServletRequest request,
            @RequestParam(value = "month", required = false) String month,
            @RequestParam(value = "layout", required = false) String layout,
            @RequestParam(value = "variables", required = false) String variables,
            @RequestParam(value = "days", required = false) String days,
            @RequestParam(value = "from", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(value = "to", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN)
                    .body((denied.getMessage() != null ? denied.getMessage() : "需要管理员权限")
                            .getBytes(StandardCharsets.UTF_8));
        }
        try {
            TelemetryLongtermExportRequest req = new TelemetryLongtermExportRequest();
            req.setMonth(month);
            req.setLayout(layout == null || layout.isBlank() ? "LONG" : layout.trim());
            req.setVariableNames(splitVariables(variables));
            req.setDays(splitVariables(days));
            req.setFrom(from);
            req.setTo(to);
            byte[] body = exportService.exportXlsx(req);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            disposition("telemetry-longterm-" + asciiStem(req) + ".xlsx", displayStem(req) + "监测数据表格.xlsx"))
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(body);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN)
                    .body((ex.getMessage() != null ? ex.getMessage() : "未选择时间范围").getBytes(StandardCharsets.UTF_8));
        } catch (IllegalStateException ex) {
            return ResponseEntity.internalServerError().contentType(MediaType.TEXT_PLAIN)
                    .body((ex.getMessage() != null ? ex.getMessage() : "导出失败").getBytes(StandardCharsets.UTF_8));
        }
    }

    /**
     * 曲线导出：A4 纵向 PDF，**一天一页、一行两张**，多天合到一份文件里。
     *
     * <p>实现见 {@link TelemetryLongtermPdfService}：后端开无头浏览器跑页面自己的打印视图再出 PDF。
     * 时间范围同样必填（不选直接 400）。
     */
    @PostMapping("/export/pdf")
    @Operation(summary = "导出曲线 PDF（A4 纵向，一天一页、一行两张）")
    public ResponseEntity<byte[]> exportPdf(HttpServletRequest request,
                                           @RequestBody TelemetryLongtermExportRequest req) {
        Result<?> denied = requireAdmin(request);
        if (denied != null) {
            return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN)
                    .body((denied.getMessage() != null ? denied.getMessage() : "需要管理员权限")
                            .getBytes(StandardCharsets.UTF_8));
        }
        List<String> days = normalizeDays(req == null ? null : req.getDays());
        if (days.isEmpty()) {
            return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN)
                    .body("未选择时间范围".getBytes(StandardCharsets.UTF_8));
        }
        try {
            byte[] body = pdfService.renderPdf(currentUser(request), days,
                    req == null ? null : req.getVariableNames(), displayStem(req));
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            disposition("telemetry-longterm-" + asciiStem(req) + "-curves.pdf",
                                    displayStem(req) + "监测数据曲线图.pdf"))
                    .contentType(MediaType.APPLICATION_PDF)
                    .body(body);
        } catch (com.example.demo.modules.ai.shot.PageScreenshotService.UnavailableException ex) {
            return ResponseEntity.status(503).contentType(MediaType.TEXT_PLAIN)
                    .body((ex.getMessage() != null ? ex.getMessage() : "出图失败").getBytes(StandardCharsets.UTF_8));
        } catch (IllegalStateException ex) {
            return ResponseEntity.internalServerError().contentType(MediaType.TEXT_PLAIN)
                    .body((ex.getMessage() != null ? ex.getMessage() : "导出失败").getBytes(StandardCharsets.UTF_8));
        }
    }

    /** 曲线 PDF 的 GET 变体：给 AI 载体按地址取文件用（载体取文件是纯 GET、带不了 body）。 */
    @GetMapping("/export/pdf/download")
    @Operation(summary = "导出曲线 PDF（GET，供 AI 载体按地址取）")
    public ResponseEntity<byte[]> exportPdfDownload(
            HttpServletRequest request,
            @RequestParam(value = "days", required = false) String days,
            @RequestParam(value = "variables", required = false) String variables) {
        TelemetryLongtermExportRequest req = new TelemetryLongtermExportRequest();
        req.setDays(splitVariables(days));
        req.setVariableNames(splitVariables(variables));
        return exportPdf(request, req);
    }

    /** 归一化选中的日期（只留 yyyy-MM-dd、去重升序）。 */
    private static List<String> normalizeDays(List<String> days) {
        if (days == null || days.isEmpty()) {
            return List.of();
        }
        java.util.TreeSet<String> set = new java.util.TreeSet<>();
        for (String d : days) {
            if (d == null || d.trim().length() != 10) {
                continue;
            }
            set.add(d.trim());
        }
        return new ArrayList<>(set);
    }

    @SuppressWarnings("unchecked")
    private static <T> Result<T> cast(Result<?> r) {        return (Result<T>) r;
    }

    private Result<?> requireAdmin(HttpServletRequest request) {
        User u = currentUser(request);
        if (u == null) {
            return Result.fail(401, "当前登录信息无效");
        }
        RoleEnum r = u.getRole() == null ? RoleEnum.MEMBER : u.getRole();
        if (r.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return Result.fail(403, "需要管理员权限");
        }
        return null;
    }

    private User currentUser(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        return attr instanceof User u ? u : null;
    }

    /**
     * 人话时间范围，用作中文文件名的主干。
     *
     * <p>多天用 {@code ~} 连接两端（用户口径：文件名就叫「2026-10-01~2026-10-07监测数据曲线图」），
     * 单天就是那一天。
     */
    private static String displayStem(TelemetryLongtermExportRequest req) {
        if (req == null) {
            return "全部";
        }
        List<String> days = req.getDays();
        if (days != null && !days.isEmpty()) {
            List<String> sorted = new ArrayList<>(days);
            java.util.Collections.sort(sorted);
            String first = sorted.get(0);
            String last = sorted.get(sorted.size() - 1);
            return first.equals(last) ? first : first + "~" + last;
        }
        if (req.getMonth() != null && !req.getMonth().isBlank()) {
            return req.getMonth().trim();
        }
        if (req.getFrom() != null && req.getTo() != null) {
            return req.getFrom().toLocalDate() + "~" + req.getTo().toLocalDate();
        }
        if (req.getFrom() != null) {
            return req.getFrom().toLocalDate().toString();
        }
        return "全部";
    }

    /** ASCII 兜底文件名用的短标识。 */
    private static String asciiStem(TelemetryLongtermExportRequest req) {
        return displayStem(req).replaceAll("[^A-Za-z0-9_-]", "_");
    }

    /**
     * 下载响应头：**同时**给 ASCII 的 {@code filename} 与 RFC5987 的 {@code filename*}（UTF-8）。
     * 只给中文名时，老客户端会存成乱码甚至直接失败；只给 ASCII 又丢掉了用户要的中文命名。
     */
    private static String disposition(String asciiName, String utf8Name) {
        String encoded = java.net.URLEncoder.encode(utf8Name, StandardCharsets.UTF_8).replace("+", "%20");
        return "attachment; filename=\"" + asciiName + "\"; filename*=UTF-8''" + encoded;
    }

    /** 逗号分隔的变量名 → 列表（空段丢弃）。 */
    private static List<String> splitVariables(String variables) {
        List<String> out = new ArrayList<>();
        if (variables == null || variables.isBlank()) {
            return out;
        }
        for (String v : variables.split(",")) {
            String t = v == null ? "" : v.trim();
            if (!t.isEmpty()) {
                out.add(t);
            }
        }
        return out;
    }
}
