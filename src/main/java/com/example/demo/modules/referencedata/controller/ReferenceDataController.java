package com.example.demo.modules.referencedata.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.excel.SubtotalConfig;
import com.example.demo.common.excel.SubtotalSummary;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.referencedata.dto.*;
import com.example.demo.modules.referencedata.registry.ReferenceFieldRegistry;
import com.example.demo.modules.referencedata.service.AnimalOrderExportService;
import com.example.demo.modules.referencedata.service.AroOrderImportService;
import com.example.demo.modules.referencedata.service.ReferenceDataService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/reference-data")
@Tag(name = "参考数据管理", description = "供应商/品种/品系/规格等基础数据维护")
public class ReferenceDataController {
    private final AuthContextService authContextService;
    private final ReferenceDataService referenceDataService;
    private final CapabilityPolicyService capabilityPolicyService;
    private final ReferenceFieldRegistry fieldRegistry;
    private final AnimalOrderExportService animalOrderExportService;
    private final AroOrderImportService aroOrderImportService;

    public ReferenceDataController(AuthContextService authContextService,
                                    ReferenceDataService referenceDataService,
                                    CapabilityPolicyService capabilityPolicyService,
                                    ReferenceFieldRegistry fieldRegistry,
                                    AnimalOrderExportService animalOrderExportService,
                                    AroOrderImportService aroOrderImportService) {
        this.authContextService = authContextService;
        this.referenceDataService = referenceDataService;
        this.capabilityPolicyService = capabilityPolicyService;
        this.fieldRegistry = fieldRegistry;
        this.animalOrderExportService = animalOrderExportService;
        this.aroOrderImportService = aroOrderImportService;
    }

    // ==================== RefData ====================

    @GetMapping("/{typeKey}")
    @Operation(summary = "按类型分页列表")
    public Result<List<RefDataView>> listByType(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String typeKey,
            @RequestParam(required = false) Long parentId,
            @RequestParam(required = false) Integer status,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "200") int size) {
        resolveUser(authorization);
        return Result.success(referenceDataService.listByType(typeKey, parentId, status, keyword, page, size));
    }

    @GetMapping("/{typeKey}/{id}")
    @Operation(summary = "详情")
    public Result<RefDataView> getById(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String typeKey,
            @PathVariable Long id) {
        User user = resolveUser(authorization);
        RefDataView view = referenceDataService.findById(id);
        if (view == null) return Result.error("数据不存在");
        return Result.success(view);
    }

    @PostMapping("/{typeKey}")
    @Operation(summary = "新建")
    public Result<RefDataView> create(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String typeKey,
            @RequestBody RefDataUpsertRequest body) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.REFERENCE_DATA_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return referenceDataService.create(typeKey, body);
    }

    @PutMapping("/{typeKey}/{id}")
    @Operation(summary = "更新")
    public Result<RefDataView> update(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String typeKey,
            @PathVariable Long id,
            @RequestBody RefDataUpsertRequest body) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.REFERENCE_DATA_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return referenceDataService.update(id, body);
    }

    @DeleteMapping("/{typeKey}/{id}")
    @Operation(summary = "删除")
    public Result<?> delete(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String typeKey,
            @PathVariable Long id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.REFERENCE_DATA_ADMIN);
        if (denied != null) return denied;
        return referenceDataService.delete(id);
    }

    @GetMapping("/{typeKey}/options")
    @Operation(summary = "下拉选项（仅可订购项）")
    public Result<List<RefDataView>> listOptions(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String typeKey) {
        User user = resolveUser(authorization);
        return Result.success(referenceDataService.listOptions(typeKey));
    }

    @GetMapping("/types")
    @Operation(summary = "获取所有支持的数据类型")
    public Result<List<String>> listTypes() {
        return Result.success(fieldRegistry.getAllTypes());
    }

    // ==================== Spec Templates ====================

    @GetMapping("/spec-templates")
    @Operation(summary = "规格模板列表")
    public Result<List<RefSpecTemplateView>> listSpecTemplates(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        return Result.success(referenceDataService.listSpecTemplates());
    }

    @PostMapping("/spec-templates")
    @Operation(summary = "新建规格模板")
    public Result<RefSpecTemplateView> createSpecTemplate(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody RefSpecTemplateUpsertRequest body) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.REFERENCE_DATA_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return referenceDataService.createSpecTemplate(body);
    }

    @PutMapping("/spec-templates/{id}")
    @Operation(summary = "更新规格模板")
    public Result<RefSpecTemplateView> updateSpecTemplate(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id,
            @RequestBody RefSpecTemplateUpsertRequest body) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.REFERENCE_DATA_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return referenceDataService.updateSpecTemplate(id, body);
    }

    @DeleteMapping("/spec-templates/{id}")
    @Operation(summary = "删除规格模板")
    public Result<?> deleteSpecTemplate(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.REFERENCE_DATA_ADMIN);
        if (denied != null) return denied;
        return referenceDataService.deleteSpecTemplate(id);
    }

    // ==================== Cart ====================

    @GetMapping("/group-members")
    @Operation(summary = "本课题组成员（下单选领用人用，仅本人课题组）")
    public Result<List<Map<String, Object>>> myGroupMembers(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        return referenceDataService.listMyGroupMembers(user.getId());
    }

    @GetMapping("/cart")
    @Operation(summary = "查看购物车")
    public Result<List<RefCartView>> listCart(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String groupId) {
        User user = resolveUser(authorization);
        return Result.success(referenceDataService.listCart(groupId));
    }

    @PostMapping("/cart")
    @Operation(summary = "加入购物车")
    public Result<RefCartView> addToCart(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String groupId,
            @RequestBody RefCartUpsertRequest body) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        return referenceDataService.addToCart(groupId, user.getId(), body);
    }

    @PutMapping("/cart/{id}")
    @Operation(summary = "修改购物车项")
    public Result<RefCartView> updateCartItem(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id,
            @RequestBody RefCartUpsertRequest body) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        return referenceDataService.updateCartItem(id, user.getId(), body);
    }

    @DeleteMapping("/cart/{id}")
    @Operation(summary = "移出购物车")
    public Result<?> removeFromCart(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        return referenceDataService.removeFromCart(id, user.getId());
    }

    @DeleteMapping("/cart")
    @Operation(summary = "清空购物车")
    public Result<?> clearCart(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String groupId) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        return referenceDataService.clearCart(groupId, user.getId());
    }

    @PostMapping("/cart/package-ready")
    @Operation(summary = "实验员提交订单包（本人行 → READY + packageRemark）")
    public Result<List<RefCartView>> markPackageReady(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String groupId,
            @RequestBody(required = false) RefCartPackageRequest body) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        return referenceDataService.markPackageReady(groupId, user.getId(), body);
    }

    @PostMapping("/cart/package-draft")
    @Operation(summary = "撤回订单包（本人 READY → DRAFT）")
    public Result<List<RefCartView>> withdrawPackage(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String groupId,
            @RequestBody(required = false) RefCartPackageRequest body) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        return referenceDataService.withdrawPackage(groupId, user.getId(), body);
    }

    // ==================== Orders ====================

    @GetMapping("/orders")
    @Operation(summary = "订单列表（按 groupId）")
    public Result<List<RefOrderView>> listOrders(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String groupId) {
        User user = resolveUser(authorization);
        return Result.success(referenceDataService.listOrders(groupId));
    }

    @PostMapping("/orders")
    @Operation(summary = "提交订单")
    public Result<RefOrderView> submitOrder(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody RefOrderSubmitRequest body) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        return referenceDataService.submitOrder(user.getId(), body);
    }

    @GetMapping("/orders/all")
    @Operation(summary = "全部订单（后台审核页，全字段筛选 + 分页）")
    public Result<Map<String, Object>> listAllOrders(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize,
            RefOrderQuery filter) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.REFERENCE_DATA_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(referenceDataService.listAllOrders(page, pageSize, filter));
    }

    @GetMapping("/orders/filter-options")    @Operation(summary = "审核页筛选下拉候选（供应商/品系/领用人/房间）")
    public Result<List<String>> orderFilterOptions(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String column) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.REFERENCE_DATA_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return referenceDataService.distinctFilterValues(column);
    }

    @GetMapping("/orders/my-group")
    @Operation(summary = "本课题组订单（学生端；同组互见，服务端强制按本人课题组圈定）")
    public Result<Map<String, Object>> listMyGroupOrders(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int pageSize,
            RefOrderQuery filter) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        return Result.success(referenceDataService.listMyGroupOrders(user.getId(), page, pageSize, filter));
    }

    @GetMapping("/orders/my-group/export")
    @Operation(summary = "导出本课题组订单 Excel（学生端）")
    public ResponseEntity<byte[]> exportMyGroupOrders(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            RefOrderQuery filter) {
        User user = resolveUser(authorization);
        if (user == null) {
            return ResponseEntity.status(401).contentType(MediaType.TEXT_PLAIN)
                    .body("未登录".getBytes(StandardCharsets.UTF_8));
        }
        String from = filter != null ? filter.getFrom() : null;
        String to = filter != null ? filter.getTo() : null;
        try {
            byte[] body = animalOrderExportService.buildReviewSheet(
                    referenceDataService.listMyGroupOrdersForExport(user.getId(), filter));
            String fn = "my-group-orders-" + (from == null ? "all" : from) + "_" + (to == null ? "now" : to) + ".xlsx";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fn + "\"")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(body);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN)
                    .body(("导出失败: " + ex.getMessage()).getBytes(StandardCharsets.UTF_8));
        }
    }

    @GetMapping("/orders/my-group/filter-options")
    @Operation(summary = "本课题组订单的筛选候选（学生端；范围限定本人课题组）")
    public Result<List<String>> myGroupOrderFilterOptions(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String column) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        return referenceDataService.distinctMyGroupFilterValues(user.getId(), column);
    }

    // ==================== 待处理订单编辑 ====================
    // 流程：load（回填购物车）→ 用户在购物车改 → apply（写回原单）。
    // 中途放弃走 discard，原单始终不动。

    @PostMapping("/orders/{id}/edit/load")
    @Operation(summary = "把待处理订单回填到购物车，进入编辑模式")
    public Result<List<RefCartView>> loadOrderToCart(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        return referenceDataService.loadOrderToCart(id, user.getId(), canManageAnyOrder(user));
    }

    @DeleteMapping("/orders/{id}/edit")
    @Operation(summary = "放弃编辑：清掉回填行，原单不受影响")
    public Result<Void> discardOrderEdit(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        return referenceDataService.discardOrderEdit(id, user.getId(), canManageAnyOrder(user));
    }

    @PutMapping("/orders/{id}/edit")
    @Operation(summary = "保存编辑：用回填的购物车内容整体替换原单明细（单号不变）")
    public Result<RefOrderView> applyOrderEdit(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        return referenceDataService.applyOrderEdit(id, user.getId(), canManageAnyOrder(user));
    }

    /** 有参考数据管理权限（管理员）时可编辑任意课题组的单；否则只能编辑本组。 */
    private boolean canManageAnyOrder(User user) {
        return capabilityPolicyService.requireProcess(user, BizDomains.REFERENCE_DATA_ADMIN) == null;
    }

    @PostMapping("/orders/import-aro")
    @Operation(summary = "把 ARO 历史订单导入本地订单库（仅超管；手动执行，幂等可重跑）")
    public Result<Map<String, Object>> importAroOrders(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.error("仅超级管理员可执行导入");
        }
        AroOrderImportService.ImportResult r = aroOrderImportService.importFromAro();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ordersCreated", r.ordersCreated());
        out.put("ordersUpdated", r.ordersUpdated());
        out.put("linesWritten", r.linesWritten());
        out.put("failed", r.failed());
        out.put("failedSns", r.failedSns());
        return Result.success(out);
    }

    @GetMapping("/orders/export")
    @Operation(summary = "导出订购审核 Excel（按 课题组→申领人→物品 逐层小计）")
    public ResponseEntity<byte[]> exportOrderReviewExcel(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            RefOrderQuery filter) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.REFERENCE_DATA_ADMIN);
        if (denied != null) {
            return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN)
                    .body(String.valueOf(denied.getMessage()).getBytes(StandardCharsets.UTF_8));
        }
        String from = filter != null ? filter.getFrom() : null;
        String to = filter != null ? filter.getTo() : null;
        try {
            SubtotalConfig config = SubtotalConfig.parse(
                    filter != null ? filter.getLevels() : null,
                    filter != null ? filter.getExcludeBlocks() : null);
            byte[] body = animalOrderExportService.buildReviewSheet(
                    referenceDataService.listOrdersForExport(filter), config);
            String fn = "animal-order-review-" + (from == null ? "all" : from) + "_" + (to == null ? "now" : to) + ".xlsx";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fn + "\"")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(body);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN)
                    .body(("导出失败: " + ex.getMessage()).getBytes(StandardCharsets.UTF_8));
        }
    }

    @GetMapping("/orders/export/summary")
    @Operation(summary = "订购审核导出结构摘要（全量层级与板块，供勾选；忽略 levels/excludeBlocks）")
    public Result<SubtotalSummary> summarizeOrderReviewExport(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            RefOrderQuery filter) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.REFERENCE_DATA_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(animalOrderExportService.summarizeReview(
                referenceDataService.listOrdersForExport(filter)));
    }

    @GetMapping("/orders/{id}")
    @Operation(summary = "订单详情")
    public Result<RefOrderView> getOrder(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = resolveUser(authorization);
        RefOrderView view = referenceDataService.getOrder(id);
        if (view == null) return Result.error("订单不存在");
        return Result.success(view);
    }

    @PutMapping("/orders/{id}/status")
    @Operation(summary = "更新订单状态")
    public Result<RefOrderView> updateOrderStatus(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id,
            @RequestParam String status) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.REFERENCE_DATA_ADMIN);
        if (denied != null) return Result.error(denied.getMessage());
        return referenceDataService.updateOrderStatus(id, status, user.getId());
    }

    @GetMapping("/orders/{id}/logs")
    @Operation(summary = "订单操作日志")
    public Result<List<RefOrderLogView>> getOrderLogs(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = resolveUser(authorization);
        return Result.success(referenceDataService.getOrderLogs(id));
    }

    // ==================== Helper ====================

    private User resolveUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(RoleEnum.MEMBER);
        return user;
    }
}
