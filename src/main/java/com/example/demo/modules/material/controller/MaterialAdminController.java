package com.example.demo.modules.material.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.material.dto.*;
import com.example.demo.modules.material.entity.MaterialDemand;
import com.example.demo.modules.material.mapper.MaterialDemandMapper;
import com.example.demo.modules.material.service.MaterialExcelExportService;
import com.example.demo.modules.material.service.MaterialService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/material/admin")
@Tag(name = "物资申领管理", description = "教职工审核、管理物资")
public class MaterialAdminController {
    private final AuthContextService authContextService;
    private final MaterialService materialService;

    private final MaterialExcelExportService excelExportService;
    private final MaterialDemandMapper demandMapper;

    public MaterialAdminController(AuthContextService authContextService, MaterialService materialService,
                                    MaterialExcelExportService excelExportService,
                                    MaterialDemandMapper demandMapper) {
        this.authContextService = authContextService;
        this.materialService = materialService;
        this.excelExportService = excelExportService;
        this.demandMapper = demandMapper;
    }

    @GetMapping("/categories")
    @Operation(summary = "全部分类")
    public Result<List<MaterialCategoryView>> listCategories() {
        return Result.success(materialService.listCategoriesForAdmin());
    }

    @PostMapping("/categories")
    @Operation(summary = "新建分类")
    public Result<MaterialCategoryView> createCategory(@RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        Integer sortOrder = body.get("sortOrder") instanceof Number ? ((Number) body.get("sortOrder")).intValue() : 0;
        return materialService.createCategory(name, sortOrder);
    }

    @PatchMapping("/categories/{id}")
    @Operation(summary = "更新分类")
    public Result<MaterialCategoryView> updateCategory(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        Integer sortOrder = body.get("sortOrder") instanceof Number ? ((Number) body.get("sortOrder")).intValue() : null;
        Integer status = body.get("status") instanceof Number ? ((Number) body.get("status")).intValue() : null;
        return materialService.updateCategory(id, name, sortOrder, status);
    }

    @DeleteMapping("/categories/{id}")
    @Operation(summary = "删除分类")
    public Result<?> deleteCategory(@PathVariable Long id) {
        return materialService.deleteCategory(id);
    }

    @GetMapping("/items")
    @Operation(summary = "物品列表")
    public Result<List<MaterialItemView>> listItems(@RequestParam(required = false) Long categoryId) {
        return Result.success(materialService.listItemsForAdmin(categoryId));
    }

    @PostMapping("/items")
    @Operation(summary = "上架新物品")
    public Result<MaterialItemView> createItem(@RequestBody MaterialItemUpsertReq body) {
        return materialService.createItem(body);
    }

    @PatchMapping("/items/{id}")
    @Operation(summary = "编辑物品")
    public Result<MaterialItemView> updateItem(@PathVariable Long id, @RequestBody MaterialItemUpsertReq body) {
        return materialService.updateItem(id, body);
    }

    @DeleteMapping("/items/{id}")
    @Operation(summary = "删除物品（软删除进回收站）")
    public Result<?> deleteItem(@RequestHeader(value = "Authorization", required = false) String auth,
                                @PathVariable Long id) {
        User user = resolveUser(auth);
        return materialService.softDeleteItem(user, id);
    }

    @GetMapping("/items/recycle")
    @Operation(summary = "物品回收站")
    public Result<Map<String, Object>> itemRecycle(@RequestParam(defaultValue = "1") int page,
                                                    @RequestParam(defaultValue = "20") int size) {
        return materialService.listItemRecycle(page, size);
    }

    @PostMapping("/items/recycle/{id}/restore")
    @Operation(summary = "恢复回收站物品")
    public Result<?> restoreItem(@PathVariable Long id) {
        return materialService.restoreItem(id);
    }

    @DeleteMapping("/items/recycle/{id}")
    @Operation(summary = "彻底删除回收站物品")
    public Result<?> purgeItem(@PathVariable Long id) {
        return materialService.purgeItem(id);
    }

    @PostMapping("/items/recycle/purge")
    @Operation(summary = "批量彻底删除回收站物品")
    public Result<?> purgeItems(@RequestBody Map<String, List<Long>> payload) {
        List<Long> ids = payload != null ? payload.getOrDefault("ids", List.of()) : List.of();
        return materialService.purgeItems(ids);
    }

    @DeleteMapping("/items/recycle")
    @Operation(summary = "一键清空回收站")
    public Result<?> purgeAllItems() {
        return materialService.purgeAllItems();
    }

    @PatchMapping("/items/{id}/stock")
    @Operation(summary = "库存数字纠偏")
    public Result<?> adjustStock(@RequestHeader(value = "Authorization", required = false) String auth,
                                 @PathVariable Long id, @RequestBody Map<String, Object> body) {
        User user = resolveUser(auth);
        int newQty = body.get("newQty") instanceof Number ? ((Number) body.get("newQty")).intValue() : 0;
        return materialService.adjustStock(user, id, newQty);
    }

    @PostMapping("/inbound")
    @Operation(summary = "入库")
    public Result<?> inbound(@RequestHeader(value = "Authorization", required = false) String auth,
                             @RequestBody InboundMaterialReq body) {
        User user = resolveUser(auth);
        return materialService.inbound(user, body);
    }

    @GetMapping("/requests/pending")
    @Operation(summary = "待审核申领")
    public Result<List<MaterialRequestView>> pendingRequests(@RequestHeader(value = "Authorization", required = false) String auth) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.listPendingForReview(user);
    }

    @GetMapping("/requests/all")
    @Operation(summary = "全部申领记录")
    public Result<Map<String, Object>> allRequests(@RequestParam(required = false) String status,
                                                    @RequestParam(defaultValue = "1") int page,
                                                    @RequestParam(defaultValue = "20") int size) {
        return materialService.listAll(status, page, size);
    }

    @GetMapping("/requests/{id}")
    @Operation(summary = "申领详情")
    public Result<MaterialRequestView> requestDetail(@RequestHeader(value = "Authorization", required = false) String auth,
                                                       @PathVariable String id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.getRequestDetail(user, id);
    }

    @PostMapping("/requests/{id}/approve")
    @Operation(summary = "审核通过")
    public Result<MaterialRequestView> approve(@RequestHeader(value = "Authorization", required = false) String auth,
                                                @PathVariable String id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.approve(user, id);
    }

    @PostMapping("/requests/{id}/reject")
    @Operation(summary = "审核拒绝")
    public Result<?> reject(@RequestHeader(value = "Authorization", required = false) String auth,
                            @PathVariable String id) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.reject(user, id);
    }

    @PostMapping("/requests/{id}/fulfill")
    @Operation(summary = "出库履行")
    public Result<MaterialRequestView> fulfill(@RequestHeader(value = "Authorization", required = false) String auth,
                                                @PathVariable String id, @RequestBody FulfillMaterialRequestReq body) {
        User user = resolveUser(auth);
        if (user == null) return Result.error("未登录");
        return materialService.fulfill(user, id, body);
    }

    @GetMapping("/demands")
    @Operation(summary = "全部需求建议")
    public Result<Map<String, Object>> allDemands(@RequestParam(defaultValue = "1") int page,
                                                   @RequestParam(defaultValue = "50") int size) {
        int offset = (page - 1) * size;
        List<MaterialDemand> list = demandMapper.selectAll(offset, size);
        int total = demandMapper.countAll();
        Map<String, Object> result = new HashMap<>();
        result.put("data", list);
        result.put("total", total);
        return Result.success(result);
    }

    @PatchMapping("/demands/{id}")
    @Operation(summary = "更新需求建议状态")
    public Result<?> updateDemandStatus(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        int status = body.get("status") instanceof Number ? ((Number) body.get("status")).intValue() : 1;
        demandMapper.updateStatus(id, status);
        return Result.success(null);
    }

    @GetMapping("/stats/overview")
    @Operation(summary = "统计概览")
    public Result<MaterialStatsOverview> statsOverview(@RequestParam(defaultValue = "2000-01-01") String from,
                                                        @RequestParam(defaultValue = "2099-12-31") String to) {
        return materialService.getStatsOverview(from, to);
    }

    @GetMapping("/stats/audit")
    @Operation(summary = "审计流水")
    public Result<Map<String, Object>> auditTrail(@RequestParam(defaultValue = "2000-01-01") String from,
                                                   @RequestParam(defaultValue = "2099-12-31") String to,
                                                   @RequestParam(required = false) Long categoryId,
                                                   @RequestParam(required = false) String groupId,
                                                   @RequestParam(defaultValue = "1") int page,
                                                   @RequestParam(defaultValue = "20") int size) {
        return materialService.getAuditTrail(from, to, categoryId, groupId, page, size);
    }

    @GetMapping("/stats/export")
    @Operation(summary = "导出审计流水Excel")
    public ResponseEntity<byte[]> exportAuditTrailExcel(@RequestParam(defaultValue = "2000-01-01") String from,
                                                         @RequestParam(defaultValue = "2099-12-31") String to,
                                                         @RequestParam(required = false) Long categoryId,
                                                         @RequestParam(required = false) String groupId) {
        try {
            Result<Map<String, Object>> result = materialService.getAuditTrail(from, to, categoryId, groupId, 1, 100000);
            if (result == null || !Boolean.TRUE.equals(result.getSuccess())) {
                return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN)
                        .body("导出失败".getBytes(StandardCharsets.UTF_8));
            }
            @SuppressWarnings("unchecked")
            List<MaterialAuditTrailView> rows = (List<MaterialAuditTrailView>) result.getData().get("data");
            if (rows == null) rows = List.of();
            byte[] body = excelExportService.buildAuditTrailSheet(rows);
            String fn = "material-audit-" + from + "_" + to + ".xlsx";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fn + "\"")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(body);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN)
                    .body(("导出失败: " + ex.getMessage()).getBytes(StandardCharsets.UTF_8));
        }
    }

    private User resolveUser(String auth) {
        User user = authContextService.resolveUserFromBearer(auth);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(RoleEnum.STUDENT);
        return user;
    }
}
