package com.example.demo.modules.facilitymaintenance.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.facilitymaintenance.service.FacilityMaintenanceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/facility-maintenance")
@Tag(name = "检查维护", description = "机房巡查、耗材、更换记录")
public class FacilityMaintenanceController {

    private static final DateTimeFormatter FN_TS = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final ZoneId ZONE_CN = ZoneId.of("Asia/Shanghai");

    private final AuthContextService authContextService;
    private final FacilityMaintenanceService service;

    public FacilityMaintenanceController(AuthContextService authContextService,
                                           FacilityMaintenanceService service) {
        this.authContextService = authContextService;
        this.service = service;
    }

    // --- Sites ---

    @GetMapping("/sites")
    @Operation(summary = "机房地点列表")
    public Result<?> listSites(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @RequestParam(defaultValue = "false") boolean includeDisabled) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        return Result.success(service.listSites(includeDisabled));
    }

    @PostMapping("/sites")
    @Operation(summary = "新增机房地点")
    public Result<?> createSite(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        String name = str(body.get("name"));
        String code = str(body.get("code"));
        int sort = parseInt(body.get("sortOrder"), 0);
        return Result.success(service.createSite(name, code, sort));
    }

    @PatchMapping("/sites/{id}")
    @Operation(summary = "更新机房地点")
    public Result<?> patchSite(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @PathVariable String id,
                               @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        service.updateSite(id,
                body.containsKey("name") ? str(body.get("name")) : null,
                body.containsKey("code") ? str(body.get("code")) : null,
                body.containsKey("sortOrder") ? parseInt(body.get("sortOrder"), 0) : null,
                body.containsKey("disabled") ? parseInt(body.get("disabled"), 0) : null);
        return Result.success();
    }

    @DeleteMapping("/sites/{id}")
    @Operation(summary = "停用机房地点（软停用，等同 PATCH disabled=1）")
    public Result<?> deleteSite(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @PathVariable String id) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            service.disableSite(id);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/sites/{id}/permanent")
    @Operation(summary = "永久删除机房地点")
    public Result<?> deleteSitePermanent(@RequestHeader(value = "Authorization", required = false) String authorization,
                                         @PathVariable String id) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            service.deleteSitePermanently(id);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    // --- Option sets ---

    @GetMapping("/option-sets")
    @Operation(summary = "下拉选项集列表")
    public Result<?> listOptionSets(@RequestHeader(value = "Authorization", required = false) String authorization) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        return Result.success(service.listOptionSetsWithItems());
    }

    @PostMapping("/option-sets")
    @Operation(summary = "新增选项集")
    public Result<?> createOptionSet(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        String name = str(body.get("name"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
        return Result.success(service.createOptionSet(name, items));
    }

    @PatchMapping("/option-sets/{id}")
    @Operation(summary = "更新选项集")
    public Result<?> patchOptionSet(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @PathVariable String id,
                                    @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        String name = body.containsKey("name") ? str(body.get("name")) : null;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = body.containsKey("items") ? (List<Map<String, Object>>) body.get("items") : null;
        service.updateOptionSet(id, name, items);
        return Result.success();
    }

    @DeleteMapping("/option-sets/{id}")
    @Operation(summary = "删除选项集")
    public Result<?> deleteOptionSet(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @PathVariable String id) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            service.deleteOptionSet(id);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    // --- Templates ---

    @GetMapping("/templates")
    @Operation(summary = "巡查模板列表")
    public Result<?> listTemplates(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @RequestParam(required = false) String siteId) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        return Result.success(service.listTemplates(siteId));
    }

    @GetMapping("/templates/{id}")
    @Operation(summary = "巡查模板详情")
    public Result<?> getTemplate(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @PathVariable String id) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(service.getTemplate(id));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/templates")
    @Operation(summary = "新增巡查模板")
    public Result<?> createTemplate(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        String name = str(body.get("name"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
        boolean hasSiteIdsKey = body.containsKey("siteIds");
        if (hasSiteIdsKey) {
            List<String> siteIds = parseSiteIdsList(body.get("siteIds"));
            return Result.success(service.createTemplate(null, name, items, siteIds));
        }
        String siteId = blankToNull(str(body.get("siteId")));
        return Result.success(service.createTemplate(siteId, name, items, null));
    }

    @PatchMapping("/templates/{id}")
    @Operation(summary = "更新巡查模板")
    public Result<?> patchTemplate(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @PathVariable String id,
                                   @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        boolean hasSiteIdsKey = body.containsKey("siteIds");
        List<String> siteIds = hasSiteIdsKey ? parseSiteIdsList(body.get("siteIds")) : null;
        boolean legacySiteIdKeyPresent = body.containsKey("siteId") && !hasSiteIdsKey;
        String siteId = legacySiteIdKeyPresent ? blankToNull(str(body.get("siteId"))) : null;
        String name = body.containsKey("name") ? str(body.get("name")) : null;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = body.containsKey("items") ? (List<Map<String, Object>>) body.get("items") : null;
        service.updateTemplate(id, siteId, name, items, hasSiteIdsKey, siteIds, legacySiteIdKeyPresent);
        return Result.success();
    }

    @DeleteMapping("/templates/{id}")
    @Operation(summary = "删除巡查模板")
    public Result<?> deleteTemplate(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @PathVariable String id) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            service.deleteTemplate(id);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    // --- Daily inspection sheet（按日协作）---

    @GetMapping("/daily-inspection-sheets/summaries")
    @Operation(summary = "按日期倒序列出已有按日协作巡查表（目录用，不含单元格）")
    public Result<?> listDailyInspectionSheetSummaries(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                       @RequestParam(defaultValue = "1") int page,
                                                       @RequestParam(defaultValue = "20") int size) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        return Result.success(service.listDailyInspectionSheetSummaries(page, size));
    }

    @GetMapping("/daily-inspection-sheets")
    @Operation(summary = "获取或创建某日巡查表（已有则沿用；若传 templateId 与库中不同且格子全空则自动换绑模板）")
    public Result<?> getDailyInspectionSheet(@RequestHeader(value = "Authorization", required = false) String authorization,
                                             @RequestParam String date,
                                             @RequestParam(required = false) String templateId) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(service.getOrCreateDailyInspectionSheet(LocalDate.parse(date.trim()), templateId));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/daily-inspection-sheets/{id}")
    @Operation(summary = "删除某日协作巡查表（释放该业务日，可重新选模板）")
    public Result<?> deleteDailyInspectionSheet(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                @PathVariable String id) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            service.deleteDailyInspectionSheet(id);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PatchMapping("/daily-inspection-sheets/{id}")
    @Operation(summary = "合并填报单元格（多人在线协作），body: cells + version")
    public Result<?> patchDailyInspectionSheet(@RequestHeader(value = "Authorization", required = false) String authorization,
                                               @PathVariable String id,
                                               @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        @SuppressWarnings("unchecked")
        Map<String, String> cells = (Map<String, String>) body.get("cells");
        int ver = parseInt(body.get("version"), -1);
        if (ver < 0) return Result.error("缺少有效 version");
        try {
            return Result.success(service.patchDailyInspectionSheet(id, cells == null ? Map.of() : cells, ver));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/daily-inspection-sheets/{id}/submit")
    @Operation(summary = "登记上传（登记后仍可编辑）")
    public Result<?> submitDailyInspectionSheet(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                @PathVariable String id) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        User user = resolveUser(authorization);
        String opName = user != null && user.getDisplayNickname() != null ? user.getDisplayNickname() : (user != null ? user.getUsername() : null);
        try {
            service.submitDailyInspectionSheet(id, user != null ? user.getId() : null, opName);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/daily-inspection-sheets/{id}/export-excel")
    @Operation(summary = "导出当日协作巡查表 Excel")
    public ResponseEntity<byte[]> exportDailyInspectionSheetExcel(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                                  @PathVariable String id) {
        if (requireStaff(authorization) != null) {
            return ResponseEntity.status(401).body("无权限".getBytes(StandardCharsets.UTF_8));
        }
        try {
            byte[] file = service.exportDailyInspectionSheetExcel(id);
            String name = "daily-inspection-" + FN_TS.format(LocalDateTime.now()) + ".xlsx";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(file);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage().getBytes(StandardCharsets.UTF_8));
        }
    }

    // --- Consumable catalog ---

    @GetMapping("/consumable-catalog")
    @Operation(summary = "耗材名目（快捷填报）")
    public Result<?> listConsumableCatalog(@RequestHeader(value = "Authorization", required = false) String authorization,
                                           @RequestParam(defaultValue = "false") boolean includeDisabled) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        return Result.success(service.listConsumableCatalog(includeDisabled));
    }

    @PostMapping("/consumable-catalog")
    @Operation(summary = "新增耗材名目")
    public Result<?> createConsumableCatalog(@RequestHeader(value = "Authorization", required = false) String authorization,
                                             @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        return Result.success(service.createConsumableCatalog(str(body.get("name")), str(body.get("unit")), parseInt(body.get("sortOrder"), 0)));
    }

    @PatchMapping("/consumable-catalog/{id}")
    @Operation(summary = "更新耗材名目")
    public Result<?> patchConsumableCatalog(@RequestHeader(value = "Authorization", required = false) String authorization,
                                            @PathVariable String id,
                                            @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        service.updateConsumableCatalog(id,
                body.containsKey("name") ? str(body.get("name")) : null,
                body.containsKey("unit") ? str(body.get("unit")) : null,
                body.containsKey("sortOrder") ? parseInt(body.get("sortOrder"), 0) : null,
                body.containsKey("disabled") ? parseInt(body.get("disabled"), 0) : null);
        return Result.success();
    }

    @DeleteMapping("/consumable-catalog/{id}")
    @Operation(summary = "停用耗材名目")
    public Result<?> deleteConsumableCatalog(@RequestHeader(value = "Authorization", required = false) String authorization,
                                             @PathVariable String id) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            service.disableConsumableCatalog(id);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    // --- Replacement filter presets ---

    @GetMapping("/replacement-filter-presets")
    @Operation(summary = "更换类型选项")
    public Result<?> listReplacementFilterPresets(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                  @RequestParam(defaultValue = "false") boolean includeDisabled) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        return Result.success(service.listReplacementFilterPresets(includeDisabled));
    }

    @PostMapping("/replacement-filter-presets")
    @Operation(summary = "新增更换类型")
    public Result<?> createReplacementFilterPreset(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                   @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        return Result.success(service.createReplacementFilterPreset(str(body.get("label")), parseInt(body.get("sortOrder"), 0)));
    }

    @PatchMapping("/replacement-filter-presets/{id}")
    @Operation(summary = "更新更换类型")
    public Result<?> patchReplacementFilterPreset(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                  @PathVariable String id,
                                                  @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        service.updateReplacementFilterPreset(id,
                body.containsKey("label") ? str(body.get("label")) : null,
                body.containsKey("sortOrder") ? parseInt(body.get("sortOrder"), 0) : null,
                body.containsKey("disabled") ? parseInt(body.get("disabled"), 0) : null);
        return Result.success();
    }

    @DeleteMapping("/replacement-filter-presets/{id}")
    @Operation(summary = "停用更换类型")
    public Result<?> deleteReplacementFilterPreset(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                   @PathVariable String id) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            service.disableReplacementFilterPreset(id);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    // --- Inspection ---

    @GetMapping("/inspection-records")
    @Operation(summary = "巡查记录分页")
    public Result<?> listInspection(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @RequestParam(required = false) String siteId,
                                    @RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "20") int size) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        return Result.success(service.listInspectionRecords(siteId, page, size));
    }

    @GetMapping("/inspection-records/{id}")
    @Operation(summary = "巡查记录详情")
    public Result<?> getInspection(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @PathVariable String id) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(service.getInspectionRecord(id));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/inspection-records")
    @Operation(summary = "新增巡查记录")
    public Result<?> createInspection(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        User user = resolveUser(authorization);
        String siteId = str(body.get("siteId"));
        String templateId = blankToNull(str(body.get("templateId")));
        LocalDateTime at = parseDateTime(body.get("inspectedAt"));
        @SuppressWarnings("unchecked")
        Map<String, String> values = (Map<String, String>) body.get("values");
        String opName = user != null && user.getDisplayNickname() != null ? user.getDisplayNickname() : (user != null ? user.getUsername() : null);
        return Result.success(service.createInspectionRecord(siteId, templateId, at, values,
                user != null ? user.getId() : null, opName));
    }

    @PatchMapping("/inspection-records/{id}")
    @Operation(summary = "更新巡查记录")
    public Result<?> patchInspection(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @PathVariable String id,
                                     @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        String siteId = body.containsKey("siteId") ? str(body.get("siteId")) : null;
        String templateId = body.containsKey("templateId") ? blankToNull(str(body.get("templateId"))) : null;
        LocalDateTime at = body.containsKey("inspectedAt") ? parseDateTime(body.get("inspectedAt")) : null;
        String opName = body.containsKey("operatorName") ? str(body.get("operatorName")) : null;
        @SuppressWarnings("unchecked")
        Map<String, String> values = body.containsKey("values") ? (Map<String, String>) body.get("values") : null;
        try {
            service.updateInspectionRecord(id, siteId, templateId, at, values, opName);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/inspection-records/{id}")
    @Operation(summary = "删除巡查记录")
    public Result<?> deleteInspection(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @PathVariable String id) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            service.deleteInspectionRecord(id);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    // --- Consumables ---

    @GetMapping("/consumable-lines")
    @Operation(summary = "耗材登记分页")
    public Result<?> listConsumables(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @RequestParam(required = false) String siteId,
                                     @RequestParam(defaultValue = "1") int page,
                                     @RequestParam(defaultValue = "20") int size) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        return Result.success(service.listConsumableLines(siteId, page, size));
    }

    @PostMapping("/consumable-lines")
    @Operation(summary = "新增耗材登记")
    public Result<?> createConsumable(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        User user = resolveUser(authorization);
        BigDecimal qty = body.get("qty") instanceof Number n ? BigDecimal.valueOf(n.doubleValue()) : BigDecimal.ZERO;
        return Result.success(service.createConsumableLine(
                str(body.get("siteId")),
                str(body.get("consumableName")),
                qty,
                blankToNull(str(body.get("unit"))),
                parseDateTime(body.get("occurredAt")),
                blankToNull(str(body.get("note"))),
                user != null ? user.getId() : null));
    }

    @PatchMapping("/consumable-lines/{id}")
    @Operation(summary = "更新耗材登记")
    public Result<?> patchConsumable(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @PathVariable String id,
                                     @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        BigDecimal qty = body.containsKey("qty") && body.get("qty") instanceof Number n
                ? BigDecimal.valueOf(n.doubleValue()) : null;
        try {
            service.updateConsumableLine(id,
                    body.containsKey("siteId") ? str(body.get("siteId")) : null,
                    body.containsKey("consumableName") ? str(body.get("consumableName")) : null,
                    qty,
                    body.containsKey("unit") ? blankToNull(str(body.get("unit"))) : null,
                    body.containsKey("occurredAt") ? parseDateTime(body.get("occurredAt")) : null,
                    body.containsKey("note") ? blankToNull(str(body.get("note"))) : null);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/consumable-lines/{id}")
    @Operation(summary = "删除耗材登记")
    public Result<?> deleteConsumable(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @PathVariable String id) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            service.deleteConsumableLine(id);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    // --- Replacements ---

    @GetMapping("/replacement-records")
    @Operation(summary = "更换记录分页")
    public Result<?> listReplacements(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @RequestParam(required = false) String siteId,
                                      @RequestParam(defaultValue = "1") int page,
                                      @RequestParam(defaultValue = "20") int size) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        return Result.success(service.listReplacementRecords(siteId, page, size));
    }

    @GetMapping("/replacement-summary")
    @Operation(summary = "按站点汇总各过滤类型最近更换时间")
    public Result<?> replacementSummary(@RequestHeader(value = "Authorization", required = false) String authorization,
                                        @RequestParam String siteId) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        return Result.success(service.replacementSummaryBySite(siteId));
    }

    @PostMapping("/replacement-records")
    @Operation(summary = "新增更换记录")
    public Result<?> createReplacement(@RequestHeader(value = "Authorization", required = false) String authorization,
                                       @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        User user = resolveUser(authorization);
        return Result.success(service.createReplacementRecord(
                str(body.get("siteId")),
                str(body.get("filterType")),
                parseDateTime(body.get("replacedAt")),
                blankToNull(str(body.get("note"))),
                user != null ? user.getId() : null));
    }

    @PatchMapping("/replacement-records/{id}")
    @Operation(summary = "更新更换记录")
    public Result<?> patchReplacement(@RequestHeader(value = "Authorization", required = false) String authorization,
                                      @PathVariable String id,
                                      @RequestBody Map<String, Object> body) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            service.updateReplacementRecord(id,
                    body.containsKey("siteId") ? str(body.get("siteId")) : null,
                    body.containsKey("filterType") ? str(body.get("filterType")) : null,
                    body.containsKey("replacedAt") ? parseDateTime(body.get("replacedAt")) : null,
                    body.containsKey("note") ? blankToNull(str(body.get("note"))) : null);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/replacement-records/{id}")
    @Operation(summary = "删除更换记录")
    public Result<?> deleteReplacement(@RequestHeader(value = "Authorization", required = false) String authorization,
                                       @PathVariable String id) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            service.deleteReplacementRecord(id);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    // --- Excel ---

    @GetMapping("/export/excel")
    @Operation(summary = "导出 Excel（scope=all 含 Sites+四表；inspection/consumables/replacements 仅对应单 Sheet）")
    public ResponseEntity<byte[]> exportExcel(@RequestHeader(value = "Authorization", required = false) String authorization,
                                             @RequestParam(defaultValue = "all") String scope) {
        if (requireStaff(authorization) != null) {
            return ResponseEntity.status(401).body("无权限".getBytes(StandardCharsets.UTF_8));
        }
        byte[] file = service.exportExcel(scope);
        String sc = scope == null || scope.isBlank() ? "all" : scope.trim().toLowerCase();
        String prefix = switch (sc) {
            case "inspection" -> "facility-maintenance-inspection";
            case "consumables" -> "facility-maintenance-consumables";
            case "replacements" -> "facility-maintenance-replacements";
            case "sites" -> "facility-maintenance-sites";
            default -> "facility-maintenance-full";
        };
        String name = prefix + "-" + FN_TS.format(LocalDateTime.now()) + ".xlsx";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(file);
    }

    @PostMapping("/import/excel")
    @Operation(summary = "导入 Excel（scope 与导出一致；仅处理对应 Sheet）")
    public Result<?> importExcel(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @RequestParam("file") MultipartFile file,
                                 @RequestParam(defaultValue = "all") String scope) {
        Result<?> denied = requireStaff(authorization);
        if (denied != null) return denied;
        try {
            return Result.success(service.importExcel(file, scope));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    private User resolveUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(RoleEnum.STUDENT);
        return user;
    }

    private Result<?> requireStaff(String authorization) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("未登录或Token无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.error("账号已禁用");
        if (user.getRole().getLevel() < RoleEnum.STAFF.getLevel()) return Result.error("无权限访问");
        return null;
    }

    private static List<String> parseSiteIdsList(Object raw) {
        if (raw == null) return List.of();
        if (!(raw instanceof List<?> list)) return List.of();
        List<String> out = new ArrayList<>();
        for (Object o : list) {
            if (o == null) continue;
            String s = String.valueOf(o).trim();
            if (!s.isEmpty()) out.add(s);
        }
        return out;
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o).trim();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static int parseInt(Object o, int def) {
        if (o == null) return def;
        if (o instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(o.toString().trim());
        } catch (Exception e) {
            return def;
        }
    }

    private static LocalDateTime parseDateTime(Object o) {
        if (o == null) return null;
        if (o instanceof LocalDateTime dt) return dt;
        String s = String.valueOf(o).trim();
        if (s.isEmpty()) return null;
        try {
            return OffsetDateTime.parse(s).atZoneSameInstant(ZONE_CN).toLocalDateTime();
        } catch (Exception ignored) {
        }
        try {
            return LocalDateTime.parse(s);
        } catch (Exception ignored) {
        }
        try {
            return LocalDateTime.parse(s.replace(" ", "T"));
        } catch (Exception e) {
            return null;
        }
    }
}
