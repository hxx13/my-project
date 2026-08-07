package com.example.demo.modules.referencedata.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.referencedata.dto.*;
import com.example.demo.modules.referencedata.registry.ReferenceFieldRegistry;
import com.example.demo.modules.referencedata.service.ReferenceDataService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

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

    public ReferenceDataController(AuthContextService authContextService,
                                    ReferenceDataService referenceDataService,
                                    CapabilityPolicyService capabilityPolicyService,
                                    ReferenceFieldRegistry fieldRegistry) {
        this.authContextService = authContextService;
        this.referenceDataService = referenceDataService;
        this.capabilityPolicyService = capabilityPolicyService;
        this.fieldRegistry = fieldRegistry;
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
        resolveUser(authorization);
        return referenceDataService.updateCartItem(id, body);
    }

    @DeleteMapping("/cart/{id}")
    @Operation(summary = "移出购物车")
    public Result<?> removeFromCart(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        resolveUser(authorization);
        return referenceDataService.removeFromCart(id);
    }

    @DeleteMapping("/cart")
    @Operation(summary = "清空购物车")
    public Result<?> clearCart(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam String groupId) {
        User user = resolveUser(authorization);
        if (user == null) return Result.error("请先登录");
        referenceDataService.clearCart(groupId);
        return Result.success();
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
