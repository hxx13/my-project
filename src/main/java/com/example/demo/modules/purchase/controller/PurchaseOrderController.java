package com.example.demo.modules.purchase.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.purchase.dto.CompletePurchaseOrderRequest;
import com.example.demo.modules.purchase.dto.CreatePurchaseOrderRequest;
import com.example.demo.modules.purchase.dto.PurchaseOrderView;
import com.example.demo.modules.purchase.entity.PurchaseOrder;
import com.example.demo.modules.purchase.enums.PurchaseOrderStatus;
import com.example.demo.modules.purchase.mapper.PurchaseOrderMapper;
import com.example.demo.modules.purchase.service.PurchaseOrderService;
import com.example.demo.modules.notification.dto.PublishNotificationEvent;
import com.example.demo.modules.notification.service.NotificationService;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.upload.service.UploadFileService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/purchase/orders")
@Tag(name = "采购工单", description = "采购申请与处理闭环接口")
public class PurchaseOrderController {
    private final AuthContextService authContextService;
    private final PurchaseOrderService purchaseOrderService;
    private final PurchaseOrderMapper purchaseOrderMapper;
    private final UploadFileService uploadFileService;
    private final NotificationService notificationService;
    private final UserDisplayNameService userDisplayNameService;
    private final CapabilityPolicyService capabilityPolicyService;

    public PurchaseOrderController(AuthContextService authContextService,
                                   PurchaseOrderService purchaseOrderService,
                                   PurchaseOrderMapper purchaseOrderMapper,
                                   UploadFileService uploadFileService,
                                   NotificationService notificationService,
                                   UserDisplayNameService userDisplayNameService,
                                   CapabilityPolicyService capabilityPolicyService) {
        this.authContextService = authContextService;
        this.purchaseOrderService = purchaseOrderService;
        this.purchaseOrderMapper = purchaseOrderMapper;
        this.uploadFileService = uploadFileService;
        this.notificationService = notificationService;
        this.userDisplayNameService = userDisplayNameService;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    @PostMapping
    @Operation(summary = "创建采购申请")
    public Result<?> create(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @RequestBody CreatePurchaseOrderRequest request) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.PURCHASE);
        if (denied != null) return denied;
        if (request == null || !StringUtils.hasText(request.getLocation()) || !StringUtils.hasText(request.getContent())) {
            return Result.error("采购参数不完整");
        }
        PurchaseOrder order = new PurchaseOrder();
        order.setId("PO_" + UUID.randomUUID().toString().replace("-", ""));
        order.setApplicantId(user.getId());
        order.setApplicantName(userDisplayNameService.resolveDisplayName(user.getId()));
        order.setLocation(request.getLocation().trim());
        order.setContent(request.getContent().trim());
        order.setStatus(PurchaseOrderStatus.PENDING.name());
        order.setIsPublic(Boolean.FALSE.equals(request.getIsPublic()) ? 0 : 1);
        order.setRequestImagesJson(purchaseOrderService.toJsonArray(request.getRequestImages()));
        order.setResultImagesJson("[]");
        order.setCreateTime(LocalDateTime.now());
        purchaseOrderMapper.insert(order);
        publishEvent("CREATED", user, order, Map.of(
                "applicantName", order.getApplicantName(),
                "location", order.getLocation()
        ));
        return Result.success(purchaseOrderService.toView(order));
    }

    @GetMapping
    @Operation(summary = "分页查询采购单")
    public Result<?> list(@RequestHeader(value = "Authorization", required = false) String authorization,
                          @RequestParam(defaultValue = "1") int page,
                          @RequestParam(defaultValue = "20") int size,
                          @RequestParam(required = false) String status,
                          @RequestParam(required = false) String dateFrom,
                          @RequestParam(required = false) String dateTo,
                          @RequestParam(defaultValue = "false") boolean includePrivate,
                          @RequestParam(defaultValue = "false") boolean onlyMine) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.PURCHASE);
        if (denied != null) return denied;
        String statusValue = normalizeStatus(status);
        LocalDateTime start = parseDateStart(dateFrom);
        LocalDateTime end = parseDateEnd(dateTo);
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        int offset = (safePage - 1) * safeSize;

        List<PurchaseOrder> rows;
        int total;
        if (onlyMine) {
            rows = purchaseOrderMapper.listForApplicant(user.getId(), statusValue, start, end, safeSize, offset);
            total = purchaseOrderMapper.countForApplicant(user.getId(), statusValue, start, end);
        } else if (includePrivate && capabilityPolicyService.canProcess(user, BizDomains.PURCHASE)) {
            rows = purchaseOrderMapper.listAll(statusValue, start, end, safeSize, offset);
            total = purchaseOrderMapper.countAll(statusValue, start, end);
        } else if (capabilityPolicyService.canProcess(user, BizDomains.PURCHASE)) {
            rows = purchaseOrderMapper.listVisible(user.getId(), statusValue, start, end, safeSize, offset);
            total = purchaseOrderMapper.countVisible(user.getId(), statusValue, start, end);
        } else {
            rows = purchaseOrderMapper.listVisible(user.getId(), statusValue, start, end, safeSize, offset);
            total = purchaseOrderMapper.countVisible(user.getId(), statusValue, start, end);
        }
        List<PurchaseOrderView> views = rows.stream().map(purchaseOrderService::toView).toList();
        Map<String, Object> data = new HashMap<>();
        data.put("data", views);
        data.put("total", total);
        return Result.success(data);
    }

    @PatchMapping("/{id}/start")
    @Operation(summary = "采购接单处理")
    public Result<?> start(@RequestHeader(value = "Authorization", required = false) String authorization,
                           @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.PURCHASE);
        if (denied != null) return denied;
        PurchaseOrder order = purchaseOrderMapper.findById(id);
        if (order == null) return Result.error("采购单不存在");
        if (!PurchaseOrderStatus.PENDING.name().equals(order.getStatus())) return Result.error("仅待处理状态可接单");
        int updated = purchaseOrderMapper.markProcessing(id, user.getId(), LocalDateTime.now());
        if (updated < 1) return Result.error("接单失败，请刷新后重试");
        publishEvent("STARTED", user, order, Map.of("operatorName", StringUtils.hasText(user.getUsername()) ? user.getUsername() : user.getId()));
        return Result.success();
    }

    @PatchMapping("/{id}/complete")
    @Operation(summary = "采购完成处理")
    public Result<?> complete(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @PathVariable String id,
                              @RequestBody(required = false) CompletePurchaseOrderRequest request) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.PURCHASE);
        if (denied != null) return denied;
        PurchaseOrder order = purchaseOrderMapper.findById(id);
        if (order == null) return Result.error("采购单不存在");
        if (!PurchaseOrderStatus.PROCESSING.name().equals(order.getStatus())) return Result.error("仅处理中状态可完成");
        String resultRemark = request == null ? null : request.getResultRemark();
        String resultImagesJson = purchaseOrderService.toJsonArray(request == null ? null : request.getResultImages());
        int updated = purchaseOrderMapper.markCompleted(id, resultRemark, resultImagesJson, LocalDateTime.now());
        if (updated < 1) return Result.error("完成处理失败，请刷新后重试");
        publishEvent("COMPLETED", user, order, Map.of());
        return Result.success();
    }

    @PostMapping("/{id}/withdraw")
    @Operation(summary = "撤回采购申请")
    public Result<?> withdraw(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.PURCHASE);
        if (denied != null) return denied;
        PurchaseOrder order = purchaseOrderMapper.findById(id);
        if (order == null) return Result.error("采购单不存在");
        if (!user.getId().equals(order.getApplicantId())) return Result.error("仅申请人可撤回");
        int deleted = purchaseOrderMapper.withdrawPendingByApplicant(id, user.getId());
        if (deleted < 1) return Result.error("处理中或已完成状态不可撤回");
        deleteOrderImages(order);
        publishEvent("WITHDRAWN", user, order, Map.of());
        return Result.success();
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除采购单")
    public Result<?> deleteOrder(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.PURCHASE);
        if (denied != null) return denied;
        PurchaseOrder order = purchaseOrderMapper.findById(id);
        if (order == null) return Result.error("采购单不存在");
        int deleted = purchaseOrderMapper.deleteById(id, user.getId());
        if (deleted < 1) return Result.error("删除失败");
        publishEvent("DELETED", user, order, Map.of());
        return Result.success();
    }

    @GetMapping("/recycle")
    @Operation(summary = "分页查询回收站采购单")
    public Result<?> listRecycle(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @RequestParam(defaultValue = "1") int page,
                                 @RequestParam(defaultValue = "20") int size) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.PURCHASE);
        if (denied != null) return denied;
        int safePage = Math.max(page, 1);
        int safeSize = Math.min(Math.max(size, 1), 100);
        int offset = (safePage - 1) * safeSize;
        List<PurchaseOrderView> views = purchaseOrderMapper.listRecycle(safeSize, offset).stream().map(purchaseOrderService::toView).toList();
        Map<String, Object> data = new HashMap<>();
        data.put("data", views);
        data.put("total", purchaseOrderMapper.countRecycle());
        return Result.success(data);
    }

    @GetMapping("/{id}")
    @Operation(summary = "查询采购单详情")
    public Result<?> detail(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.PURCHASE);
        if (denied != null) return denied;

        PurchaseOrder order = purchaseOrderMapper.findById(id);
        if (order == null) {
            return Result.error("采购单不存在");
        }
        if (!capabilityPolicyService.canProcess(user, BizDomains.PURCHASE) && !user.getId().equals(order.getApplicantId())) {
            return Result.error("无权限查看该采购单");
        }
        return Result.success(purchaseOrderService.toView(order));
    }

    @DeleteMapping("/recycle/{id}")
    @Operation(summary = "彻底删除单个回收站采购单")
    public Result<?> hardDeleteOne(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.PURCHASE);
        if (denied != null) return denied;
        PurchaseOrder order = findRecycleById(id);
        if (order == null) return Result.error("回收站订单不存在");
        int deleted = purchaseOrderMapper.hardDeleteById(id);
        if (deleted < 1) return Result.error("彻底删除失败");
        deleteOrderImages(order);
        return Result.success();
    }

    @PostMapping("/recycle/{id}/restore")
    @Operation(summary = "恢复回收站采购单")
    public Result<?> restoreOne(@RequestHeader(value = "Authorization", required = false) String authorization,
                                @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.PURCHASE);
        if (denied != null) return denied;
        int restored = purchaseOrderMapper.restoreById(id);
        if (restored < 1) return Result.error("恢复失败或订单不在回收站");
        PurchaseOrder recycleOrder = findRecycleById(id);
        if (recycleOrder != null) {
            publishEvent("RESTORED", user, recycleOrder, Map.of());
        }
        return Result.success();
    }

    @PostMapping("/recycle/purge")
    @Operation(summary = "按选择批量彻底删除回收站采购单")
    public Result<?> purgeSelected(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @RequestBody(required = false) Map<String, List<String>> payload) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.PURCHASE);
        if (denied != null) return denied;
        List<String> ids = payload == null ? new ArrayList<>() : payload.getOrDefault("ids", new ArrayList<>());
        if (ids.isEmpty()) return Result.error("请选择要彻底删除的订单");
        List<PurchaseOrder> recycleRows = purchaseOrderMapper.listRecycle(1000, 0);
        List<PurchaseOrder> toDelete = recycleRows.stream().filter(row -> ids.contains(row.getId())).toList();
        int deleted = purchaseOrderMapper.hardDeleteByIds(ids);
        toDelete.forEach(this::deleteOrderImages);
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", deleted);
        return Result.success(data);
    }

    @DeleteMapping("/recycle")
    @Operation(summary = "一键清空回收站采购单")
    public Result<?> purgeAll(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireProcess(user, BizDomains.PURCHASE);
        if (denied != null) return denied;
        List<PurchaseOrder> recycleRows = purchaseOrderMapper.listRecycle(1000, 0);
        List<String> ids = recycleRows.stream().map(PurchaseOrder::getId).toList();
        if (ids.isEmpty()) return Result.success();
        int deleted = purchaseOrderMapper.hardDeleteByIds(ids);
        recycleRows.forEach(this::deleteOrderImages);
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", deleted);
        return Result.success(data);
    }

    private User resolveUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(RoleEnum.STUDENT);
        return user;
    }

    private String normalizeStatus(String status) {
        if (!StringUtils.hasText(status)) return null;
        String value = status.trim().toUpperCase();
        try {
            return PurchaseOrderStatus.valueOf(value).name();
        } catch (Exception e) {
            return null;
        }
    }

    private LocalDateTime parseDateStart(String date) {
        try {
            if (!StringUtils.hasText(date)) return null;
            return LocalDate.parse(date.trim()).atStartOfDay();
        } catch (Exception e) {
            return null;
        }
    }

    private LocalDateTime parseDateEnd(String date) {
        try {
            if (!StringUtils.hasText(date)) return null;
            return LocalDate.parse(date.trim()).atTime(23, 59, 59);
        } catch (Exception e) {
            return null;
        }
    }

    private void deleteOrderImages(PurchaseOrder order) {
        uploadFileService.deleteByUrls(purchaseOrderService.fromJsonArray(order.getRequestImagesJson()));
        uploadFileService.deleteByUrls(purchaseOrderService.fromJsonArray(order.getResultImagesJson()));
    }

    private PurchaseOrder findRecycleById(String id) {
        return purchaseOrderMapper.listRecycle(1000, 0).stream()
                .filter(row -> id.equals(row.getId()))
                .findFirst()
                .orElse(null);
    }

    private void publishEvent(String eventType, User operator, PurchaseOrder order, Map<String, String> variables) {
        if (order == null) return;
        PublishNotificationEvent event = new PublishNotificationEvent();
        event.setEventType(eventType);
        event.setBizType("PURCHASE");
        event.setBizId(order.getId());
        event.setSenderId(operator == null ? null : operator.getId());
        event.setApplicantId(order.getApplicantId());
        event.setProcessorId(order.getProcessorId());
        event.setVariables(variables);
        notificationService.publish(event);
    }
}
