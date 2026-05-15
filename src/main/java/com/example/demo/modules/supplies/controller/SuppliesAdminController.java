package com.example.demo.modules.supplies.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.supplies.dto.*;
import com.example.demo.modules.supplies.service.SuppliesService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/supplies/admin")
@Tag(name = "物资管理", description = "管理员维护分类、库存与出库")
public class SuppliesAdminController {
    private final AuthContextService authContextService;
    private final SuppliesService suppliesService;
    private final CapabilityPolicyService capabilityPolicyService;

    public SuppliesAdminController(AuthContextService authContextService,
                                   SuppliesService suppliesService,
                                   CapabilityPolicyService capabilityPolicyService) {
        this.authContextService = authContextService;
        this.suppliesService = suppliesService;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    @GetMapping("/categories")
    @Operation(summary = "全部分类")
    public Result<List<SupplyCategoryView>> listCategories(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(suppliesService.listCategoriesForAdmin());
    }

    @PostMapping("/categories")
    @Operation(summary = "新建分类")
    public Result<SupplyCategoryView> createCategory(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                     @RequestBody SupplyCategoryUpsertRequest body) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.createCategory(body);
    }

    @PatchMapping("/categories/{id}")
    @Operation(summary = "更新分类")
    public Result<SupplyCategoryView> updateCategory(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                       @PathVariable Long id,
                                                       @RequestBody SupplyCategoryUpsertRequest body) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.updateCategory(id, body);
    }

    @DeleteMapping("/categories/{id}")
    @Operation(summary = "删除分类")
    public Result<?> deleteCategory(@RequestHeader(value = "Authorization", required = false) String authorization,
                                     @PathVariable Long id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_ADMIN);
        if (denied != null) return denied;
        return suppliesService.deleteCategory(id);
    }

    @GetMapping("/items")
    @Operation(summary = "物资列表（管理）")
    public Result<List<SupplyItemView>> listItems(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                   @RequestParam(required = false) Long categoryId) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(suppliesService.listItemsForAdmin(categoryId));
    }

    @PostMapping("/items")
    @Operation(summary = "新建物资")
    public Result<SupplyItemView> createItem(@RequestHeader(value = "Authorization", required = false) String authorization,
                                             @RequestBody SupplyItemUpsertRequest body) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.createItem(body);
    }

    @PatchMapping("/items/{id}")
    @Operation(summary = "更新物资")
    public Result<SupplyItemView> updateItem(@RequestHeader(value = "Authorization", required = false) String authorization,
                                             @PathVariable Long id,
                                             @RequestBody SupplyItemUpsertRequest body) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.updateItem(id, body);
    }

    @DeleteMapping("/items/{id}")
    @Operation(summary = "删除物资")
    public Result<?> deleteItem(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @PathVariable Long id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_ADMIN);
        if (denied != null) return denied;
        return suppliesService.deleteItem(id);
    }

    @GetMapping("/items/recycle")
    @Operation(summary = "回收站物资列表")
    public Result<Map<String, Object>> listItemRecycle(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                       @RequestParam(defaultValue = "1") int page,
                                                       @RequestParam(defaultValue = "20") int size) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(suppliesService.listItemRecycle(page, size));
    }

    @PostMapping("/items/recycle/{id}/restore")
    @Operation(summary = "恢复回收站物资")
    public Result<?> restoreItem(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @PathVariable Long id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.restoreItem(id);
    }

    @DeleteMapping("/items/recycle/{id}")
    @Operation(summary = "彻底删除回收站物资")
    public Result<?> purgeItem(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @PathVariable Long id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.purgeItem(id);
    }

    @PostMapping("/items/recycle/purge")
    @Operation(summary = "按选择批量彻底删除回收站物资")
    public Result<?> purgeItems(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @RequestBody(required = false) Map<String, List<Long>> payload) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        List<Long> ids = payload == null ? List.of() : payload.getOrDefault("ids", List.of());
        return suppliesService.purgeItems(ids);
    }

    @DeleteMapping("/items/recycle")
    @Operation(summary = "一键清空回收站物资")
    public Result<?> purgeAllItems(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.purgeAllItemsInRecycle();
    }

    @PostMapping("/inbound")
    @Operation(summary = "入库")
    public Result<?> inbound(@RequestHeader(value = "Authorization", required = false) String authorization,
                             @RequestBody InboundSupplyRequest body) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.inbound(user, body);
    }

    @PatchMapping("/items/{id}/stock")
    @Operation(summary = "库存数字纠偏")
    public Result<?> adjustStock(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @PathVariable Long id,
                                 @RequestBody AdjustStockRequest body) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.adjustStock(user, id, body);
    }

    @PutMapping("/claims/{id}/lines")
    @Operation(summary = "修订待出库领用单明细（覆盖购物车行）")
    public Result<SupplyClaimOrderView> reviseClaimLines(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                           @PathVariable String id,
                                                           @RequestBody CreateSupplyClaimRequest body) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.revisePendingClaimLines(user, id, body);
    }

    @PostMapping("/claims/{id}/fulfill")
    @Operation(summary = "确认出库")
    public Result<SupplyClaimOrderView> fulfill(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                  @PathVariable String id,
                                                  @RequestBody FulfillSupplyClaimRequest body) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        try {
            return suppliesService.fulfill(user, id, body);
        } catch (IllegalStateException ex) {
            return Result.error(ex.getMessage());
        }
    }

    @DeleteMapping("/claims/{id}")
    @Operation(summary = "删除领用工单")
    public Result<?> deleteClaim(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.deleteClaimOrder(user, id);
    }

    @GetMapping("/claims/recycle")
    @Operation(summary = "回收站领用工单列表")
    public Result<Map<String, Object>> listClaimRecycle(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                        @RequestParam(defaultValue = "1") int page,
                                                        @RequestParam(defaultValue = "20") int size) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(suppliesService.listClaimRecycle(page, size));
    }

    @PostMapping("/claims/recycle/{id}/restore")
    @Operation(summary = "恢复回收站领用工单")
    public Result<?> restoreClaim(@RequestHeader(value = "Authorization", required = false) String authorization,
                                  @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.restoreClaimOrder(id);
    }

    @DeleteMapping("/claims/recycle/{id}")
    @Operation(summary = "彻底删除回收站领用工单")
    public Result<?> purgeClaim(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.purgeClaimOrder(id);
    }

    @PostMapping("/claims/recycle/purge")
    @Operation(summary = "按选择批量彻底删除回收站领用工单")
    public Result<?> purgeClaims(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @RequestBody(required = false) Map<String, List<String>> payload) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        List<String> ids = payload == null ? List.of() : payload.getOrDefault("ids", List.of());
        return suppliesService.purgeClaimOrders(ids);
    }

    @DeleteMapping("/claims/recycle")
    @Operation(summary = "一键清空回收站领用工单")
    public Result<?> purgeAllClaims(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.purgeAllClaimOrdersInRecycle();
    }

    @GetMapping("/operation-logs")
    @Operation(summary = "操作日志")
    public Result<Map<String, Object>> operationLogs(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                     @RequestParam(required = false) String opType,
                                                     @RequestParam(defaultValue = "1") int page,
                                                     @RequestParam(defaultValue = "20") int size) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(suppliesService.listOperationLogs(opType, page, size));
    }

    // 采购单、报修单导出链路未在此控制器扩展（保持原状）。

    @GetMapping("/audit/item-ids-with-records")
    @Operation(summary = "有审计表格数据（流水或领用还原）的物资 id 列表，用于物品下拉优先排序")
    public Result<List<Long>> listAuditItemIdsWithRecords(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(required = false) Long categoryId) {
        User user = resolveUser(authorization);
        Result<?> denied = denyUnlessSuppliesAudit(user);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        try {
            return Result.success(suppliesService.listAuditItemIdsWithRecords(user, categoryId));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage());
        }
    }

    @GetMapping("/audit/inventory-movements")
    @Operation(summary = "按物品分页查询库存流水（审计预览）")
    public Result<Map<String, Object>> listAuditInventoryMovements(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam("itemId") long itemId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        User user = resolveUser(authorization);
        Result<?> denied = denyUnlessSuppliesAudit(user);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.listAuditInventoryMovements(user, itemId, page, size);
    }

    @GetMapping("/audit/items/{itemId}/export/excel")
    @Operation(summary = "按物品导出审计明细 Excel（单工作表：流水与领用还原合并）")
    public ResponseEntity<byte[]> exportAuditItemExcel(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                        @PathVariable long itemId) {
        User user = resolveUser(authorization);
        Result<?> denied = denyUnlessSuppliesAudit(user);
        if (denied != null) {
            return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN)
                    .body((denied.getMessage() != null ? denied.getMessage() : "无权限").getBytes(StandardCharsets.UTF_8));
        }
        try {
            byte[] body = suppliesService.exportAuditItemExcel(user, itemId);
            String fn = "supply-audit-item-" + itemId + ".xlsx";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fn + "\"")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(body);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN)
                    .body((ex.getMessage() != null ? ex.getMessage() : "导出失败").getBytes(StandardCharsets.UTF_8));
        }
    }

    /** 物资管理员或领用处理人可查看审计流水 */
    private Result<?> denyUnlessSuppliesAudit(User user) {
        Result<?> deniedAdmin = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_ADMIN);
        Result<?> deniedClaim = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (deniedAdmin != null && deniedClaim != null) {
            return deniedAdmin;
        }
        return null;
    }

    private User resolveUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(RoleEnum.STUDENT);
        return user;
    }
}
