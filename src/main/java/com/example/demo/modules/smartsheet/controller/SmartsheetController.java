package com.example.demo.modules.smartsheet.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.smartsheet.dto.*;
import com.example.demo.modules.smartsheet.entity.SmartsheetDefinition;
import com.example.demo.modules.smartsheet.entity.SmartsheetRow;
import com.example.demo.modules.smartsheet.service.SmartsheetExportService;
import com.example.demo.modules.smartsheet.service.SmartsheetImportService;
import com.example.demo.modules.smartsheet.service.SmartsheetRowService;
import com.example.demo.modules.smartsheet.service.SmartsheetService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.*;

@RestController
@RequestMapping("/api/admin/smartsheet")
public class SmartsheetController {
    private static final Logger log = LoggerFactory.getLogger(SmartsheetController.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final SmartsheetService sheetService;
    private final SmartsheetRowService rowService;
    private final SmartsheetImportService importService;
    private final SmartsheetExportService exportService;

    public SmartsheetController(SmartsheetService sheetService, SmartsheetRowService rowService,
                                 SmartsheetImportService importService, SmartsheetExportService exportService) {
        this.sheetService = sheetService;
        this.rowService = rowService;
        this.importService = importService;
        this.exportService = exportService;
    }

    // ═══════ Sheet CRUD ═══════

    @GetMapping("/sheet/page")
    public Result<Map<String, Object>> page(@RequestParam(defaultValue = "1") int page,
                                            @RequestParam(defaultValue = "20") int pageSize,
                                            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        List<SmartsheetDefinition> list = sheetService.getPage(page, pageSize);
        int total = sheetService.count();
        Map<String, Object> result = Map.of("list", list, "total", total, "page", page, "pageSize", pageSize);
        return Result.success(result);
    }

    @PostMapping("/sheet")
    public Result<SmartsheetDefinition> create(@RequestBody SmartsheetSheetRequest req, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        Long userId = getCurrentUserId(request);
        try {
            SmartsheetDefinition def = sheetService.create(req, userId);
            return Result.success(def);
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/sheet/{id}")
    public Result<SmartsheetDefinition> get(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        try {
            return Result.success(sheetService.getById(id));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/sheet/{id}")
    public Result<SmartsheetDefinition> update(@PathVariable Long id,
                                                @RequestBody SmartsheetSheetRequest req,
                                                HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        Long userId = getCurrentUserId(request);
        try {
            return Result.success(sheetService.update(id, req, userId));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/sheet/{id}")
    public Result<Void> delete(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        try {
            sheetService.delete(id);
            return Result.success(null);
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/sheet/bulk-delete")
    public Result<Map<String, Object>> bulkDelete(@RequestBody List<Long> ids, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        int count = sheetService.bulkDelete(ids);
        return Result.success(Map.of("deleted", count));
    }

    @PutMapping("/sheet/{id}/rename")
    public Result<Void> rename(@PathVariable Long id, @RequestBody Map<String, String> body, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        sheetService.rename(id, body.getOrDefault("name", ""));
        return Result.success(null);
    }

    @PostMapping("/sheet/{id}/duplicate")
    public Result<SmartsheetDefinition> duplicate(@PathVariable Long id,
                                                   @RequestParam(defaultValue = "false") boolean withData,
                                                   HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        Long userId = getCurrentUserId(request);
        return Result.success(sheetService.duplicate(id, withData, userId));
    }

    @PostMapping("/sheet/{id}/clear")
    public Result<Void> clearData(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        sheetService.clearData(id);
        return Result.success(null);
    }

    @PostMapping("/sheet/{id}/pin")
    public Result<Void> togglePin(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        sheetService.togglePin(id);
        return Result.success(null);
    }

    @GetMapping("/sheet/{id}/export-json")
    public void exportJson(@PathVariable Long id, HttpServletResponse response, HttpServletRequest request) throws IOException {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) { response.sendError(403); return; }
        SmartsheetDefinition sheet = sheetService.getById(id);
        List<SmartsheetRow> rows = rowService.getRowsBySheetId(id);
        Map<String, Object> backup = Map.of("definition", sheet, "rows", rows);
        response.setContentType("application/json;charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename=\"" + sheet.getName() + ".json\"");
        response.getWriter().write(objectMapper.writeValueAsString(backup));
    }

    @PostMapping("/sheet/{id}/import-json")
    public Result<Map<String, Object>> importJson(@PathVariable Long id,
                                                    @RequestBody Map<String, Object> backup,
                                                    HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        try {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rows = (List<Map<String, Object>>) backup.get("rows");
            if (rows == null) return Result.error("无效的备份文件");
            List<SmartsheetRow> entities = new ArrayList<>();
            for (Map<String, Object> r : rows) {
                SmartsheetRow row = new SmartsheetRow();
                row.setRowLabel((String) r.getOrDefault("rowLabel", ""));
                row.setRowEntityId((String) r.get("rowEntityId"));
                Object cd = r.get("cellData");
                row.setCellData(cd instanceof String s ? s : objectMapper.writeValueAsString(cd != null ? cd : Map.of()));
                row.setRowIndex(((Number) r.getOrDefault("rowIndex", 0)).intValue());
                entities.add(row);
            }
            int count = rowService.batchInsert(id, entities);
            return Result.success(Map.of("imported", count));
        } catch (Exception e) {
            return Result.error("导入失败: " + e.getMessage());
        }
    }

    // ═══════ Row CRUD ═══════

    @GetMapping("/{sheetId}/rows")
    public Result<List<SmartsheetRow>> rows(@PathVariable Long sheetId, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(rowService.getRowsBySheetId(sheetId));
    }

    @PostMapping("/{sheetId}/row")
    public Result<SmartsheetRow> addRow(@PathVariable Long sheetId,
                                         @RequestBody Map<String, String> body,
                                         HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        try {
            SmartsheetRow row = rowService.addRow(sheetId,
                body.getOrDefault("rowLabel", ""),
                body.get("rowEntityId"));
            return Result.success(row);
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/{sheetId}/row/{rowId}")
    public Result<SmartsheetRow> updateRow(@PathVariable Long sheetId,
                                            @PathVariable Long rowId,
                                            @RequestBody SmartsheetRowUpdateRequest req,
                                            HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        Long userId = getCurrentUserId(request);
        try {
            SmartsheetRow updated = rowService.updateRow(rowId,
                req.getCellData(), req.getRowLabel(), req.getVersion(), userId, sheetId);
            return Result.success(updated);
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @PatchMapping("/{sheetId}/row/{rowId}/cell")
    public Result<SmartsheetRow> updateCell(@PathVariable Long sheetId,
                                             @PathVariable Long rowId,
                                             @RequestBody SmartsheetCellUpdateRequest req,
                                             HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        Long userId = getCurrentUserId(request);
        try {
            SmartsheetRow updated = rowService.updateCell(
                rowId, req.getColumnKey(), req.getValue(), req.getExpectedVersion(), userId, sheetId);
            return Result.success(updated);
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{sheetId}/row/{rowId}")
    public Result<Void> deleteRow(@PathVariable Long sheetId, @PathVariable Long rowId,
                                   HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        try {
            rowService.deleteRow(rowId);
            return Result.success(null);
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/{sheetId}/rows/batch")
    public Result<Map<String, Object>> batchRows(@PathVariable Long sheetId,
                                                   @RequestBody List<Map<String, Object>> rows,
                                                   HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        try {
            List<SmartsheetRow> entities = new ArrayList<>();
            for (Map<String, Object> r : rows) {
                SmartsheetRow row = new SmartsheetRow();
                row.setRowLabel((String) r.getOrDefault("rowLabel", ""));
                row.setRowEntityId((String) r.get("rowEntityId"));
                row.setCellData(objectMapper.writeValueAsString(r.getOrDefault("cellData", Map.of())));
                entities.add(row);
            }
            int count = rowService.batchInsert(sheetId, entities);
            return Result.success(Map.of("inserted", count));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("导入解析失败");
        }
    }

    // ═══════ Import / Export ═══════

    @GetMapping("/{sheetId}/export")
    public void export(@PathVariable Long sheetId, HttpServletResponse response,
                       HttpServletRequest request) throws IOException {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) { response.sendError(403); return; }
        SmartsheetDefinition sheet = sheetService.getById(sheetId);
        List<SmartsheetRow> rows = rowService.getRowsBySheetId(sheetId);
        exportService.exportCsv(sheet, rows, response);
    }

    @GetMapping("/{sheetId}/export/csv")
    public void exportCsv(@PathVariable Long sheetId, HttpServletResponse response,
                           HttpServletRequest request) throws IOException {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) { response.sendError(403); return; }
        SmartsheetDefinition sheet = sheetService.getById(sheetId);
        List<SmartsheetRow> rows = rowService.getRowsBySheetId(sheetId);
        exportService.exportCsv(sheet, rows, response);
    }

    @GetMapping("/{sheetId}/export/xlsx")
    public void exportXlsx(@PathVariable Long sheetId, HttpServletResponse response,
                            HttpServletRequest request) throws IOException {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) { response.sendError(403); return; }
        SmartsheetDefinition sheet = sheetService.getById(sheetId);
        List<SmartsheetRow> rows = rowService.getRowsBySheetId(sheetId);
        exportService.exportXlsx(sheet, rows, response);
    }

    @PostMapping("/{sheetId}/import")
    public Result<SmartsheetImportResult> importFile(@PathVariable Long sheetId,
                                                      @RequestParam("file") MultipartFile file,
                                                      @RequestParam(value = "columnKeys", defaultValue = "") String columnKeys,
                                                      HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        String filename = file.getOriginalFilename();
        if (filename == null || !filename.matches(".*\\.(xlsx|xls|csv)$")) {
            SmartsheetImportResult err = new SmartsheetImportResult();
            err.setErrors(List.of("不支持的文件格式，仅接受 .xlsx/.xls/.csv"));
            return Result.success(err);
        }
        if (file.getSize() > 10 * 1024 * 1024) {
            SmartsheetImportResult err = new SmartsheetImportResult();
            err.setErrors(List.of("文件大小超限(10MB)"));
            return Result.success(err);
        }
        List<String> keys = columnKeys.isEmpty() ? List.of() : Arrays.asList(columnKeys.split(","));
        SmartsheetImportResult result = importService.importFile(sheetId, file, keys);
        return Result.success(result);
    }

    // ═══════ Templates ═══════

    @GetMapping("/templates")
    public Result<List<SmartsheetDefinition>> templates(HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(sheetService.getTemplates());
    }

    @PostMapping("/template")
    public Result<Void> saveAsTemplate(@RequestBody Map<String, Long> body, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        Long id = body.get("id");
        if (id == null) return Result.error("id 不能为空");
        try {
            sheetService.setTemplateFlag(id, true);
            return Result.success(null);
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/sheet/from-template/{templateId}")
    public Result<SmartsheetDefinition> createFromTemplate(@PathVariable Long templateId,
                                                             @RequestBody Map<String, String> body,
                                                             HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        Long userId = getCurrentUserId(request);
        String name = body.getOrDefault("name", "从模板新建");
        try {
            return Result.success(sheetService.createFromTemplate(templateId, name, userId));
        } catch (RuntimeException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/template/{id}")
    public Result<Void> deleteTemplate(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        sheetService.unsetTemplateFlag(id);
        return Result.success(null);
    }

    // ═══════ Stats ═══════

    @GetMapping("/{sheetId}/stats")
    public Result<SmartsheetStatsResponse> stats(@PathVariable Long sheetId,
                                                   @RequestParam String columnKey,
                                                   HttpServletRequest request) {
        Result<?> denied = requireMinRole(request, RoleEnum.STAFF);
        if (denied != null) return Result.error(denied.getMessage());
        SmartsheetDefinition sheet = sheetService.getById(sheetId);
        List<SmartsheetRow> rows = rowService.getRowsBySheetId(sheetId);
        SmartsheetStatsResponse stats = computeStats(columnKey, rows);
        return Result.success(stats);
    }

    // ═══════ Helpers ═══════

    private Result<?> requireMinRole(HttpServletRequest request, RoleEnum minRole) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.STUDENT : currentUser.getRole();
        if (currentRole.getLevel() < minRole.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    private Long getCurrentUserId(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (attr instanceof User user) {
            try { return Long.parseLong(user.getId()); } catch (NumberFormatException e) { return null; }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private SmartsheetStatsResponse computeStats(String colKey, List<SmartsheetRow> rows) {
        SmartsheetStatsResponse s = new SmartsheetStatsResponse();
        s.setColumnKey(colKey);
        s.setTotalRows(rows.size());
        Map<String, Integer> dist = new LinkedHashMap<>();
        int nonEmpty = 0;
        double sum = 0, min = Double.MAX_VALUE, max = Double.MIN_VALUE;
        for (SmartsheetRow r : rows) {
            try {
                Map<String, Object> cellData = objectMapper.readValue(r.getCellData(), Map.class);
                Object val = cellData.get(colKey);
                if (val != null && !val.toString().isEmpty()) {
                    nonEmpty++;
                    String sv = val.toString();
                    dist.merge(sv, 1, Integer::sum);
                    try {
                        double dv = Double.parseDouble(sv);
                        sum += dv;
                        if (dv < min) min = dv;
                        if (dv > max) max = dv;
                    } catch (NumberFormatException ignored) {}
                }
            } catch (Exception ignored) {}
        }
        s.setNonEmptyCount(nonEmpty);
        s.setUniqueCount(dist.size());
        if (nonEmpty > 0) {
            s.setSum(sum);
            s.setAvg(sum / rows.size());
            s.setMin(min == Double.MAX_VALUE ? null : min);
            s.setMax(max == Double.MIN_VALUE ? null : max);
        }
        List<Map<String, Object>> distList = new ArrayList<>();
        for (Map.Entry<String, Integer> e : dist.entrySet()) {
            distList.add(Map.of("label", e.getKey(), "count", e.getValue()));
        }
        s.setDistribution(distList);
        return s;
    }
}
