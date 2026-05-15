package com.example.demo.modules.supplies.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.supplies.dto.CreateSupplyClaimRequest;
import com.example.demo.modules.supplies.dto.SupplyClaimApplicantOption;
import com.example.demo.modules.supplies.dto.SupplyClaimOrderView;
import com.example.demo.modules.supplies.dto.SupplyCategoryView;
import com.example.demo.modules.supplies.dto.SupplyItemView;
import com.example.demo.modules.policy.BizDomains;
import com.example.demo.modules.policy.service.CapabilityPolicyService;
import com.example.demo.modules.supplies.service.SuppliesService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/supplies")
@Tag(name = "物资领用", description = "教职工领用物资")
public class SuppliesController {
    private final AuthContextService authContextService;
    private final SuppliesService suppliesService;
    private final CapabilityPolicyService capabilityPolicyService;

    public SuppliesController(AuthContextService authContextService,
                              SuppliesService suppliesService,
                              CapabilityPolicyService capabilityPolicyService) {
        this.authContextService = authContextService;
        this.suppliesService = suppliesService;
        this.capabilityPolicyService = capabilityPolicyService;
    }

    @GetMapping("/categories")
    @Operation(summary = "分类列表（启用）")
    public Result<List<SupplyCategoryView>> categories(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(suppliesService.listCategoriesForStaff());
    }

    @GetMapping("/items")
    @Operation(summary = "上架物资列表")
    public Result<List<SupplyItemView>> items(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                @RequestParam(required = false) Long categoryId) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(suppliesService.listItemsForStaff(user == null ? null : user.getId(), categoryId));
    }

    @PostMapping("/items/mark-viewed")
    @Operation(summary = "标记物资页已查看（清除新品/进货提示）")
    public Result<?> markItemsViewed(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return denied;
        return suppliesService.markItemsViewed(user);
    }

    @GetMapping("/cart")
    @Operation(summary = "当前用户领用购物车（云端，Web/小程序多端同步）")
    public Result<Map<String, Object>> getCart(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) {
            return Result.error(denied.getMessage());
        }
        if (user == null) {
            return Result.error("未登录");
        }
        return suppliesService.getShoppingCart(user);
    }

    @PutMapping("/cart")
    @Operation(summary = "保存领用购物车（云端）")
    public Result<?> saveCart(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @RequestBody Map<String, Object> body) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) {
            return denied;
        }
        if (user == null) {
            return Result.error("未登录");
        }
        return suppliesService.saveShoppingCart(user, body);
    }

    @GetMapping("/items/{id}")
    @Operation(summary = "物资详情")
    public Result<SupplyItemView> itemDetail(@RequestHeader(value = "Authorization", required = false) String authorization,
                                               @PathVariable Long id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.getItem(id);
    }

    @PostMapping("/claims")
    @Operation(summary = "提交领用单")
    public Result<SupplyClaimOrderView> createClaim(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                      @RequestBody CreateSupplyClaimRequest request) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.createClaim(user, request);
    }

    @PostMapping("/claims/{id}/withdraw")
    @Operation(summary = "撤回领用单")
    public Result<?> withdraw(@RequestHeader(value = "Authorization", required = false) String authorization,
                              @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return denied;
        return suppliesService.withdraw(user, id);
    }

    @PutMapping("/claims/{id}/lines")
    @Operation(summary = "修订待出库领用单明细（申请人本人或处理端，覆盖购物车行）")
    public Result<SupplyClaimOrderView> revisePendingClaimLines(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                                  @PathVariable String id,
                                                                  @RequestBody CreateSupplyClaimRequest body) {
        User user = resolveUser(authorization);
        Result<?> deniedSubmit = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        Result<?> deniedProcess = capabilityPolicyService.requireProcess(user, BizDomains.SUPPLIES_CLAIM);
        if (deniedSubmit != null && deniedProcess != null) {
            return Result.error(deniedSubmit.getMessage());
        }
        return suppliesService.revisePendingClaimLines(user, id, body);
    }

    @DeleteMapping("/claims/{id}")
    @Operation(summary = "删除我的领用单（进入回收站）")
    public Result<?> deleteMyClaim(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return denied;
        return suppliesService.deleteClaimOrder(user, id);
    }

    @GetMapping("/claims/pending-tasks")
    @Operation(summary = "待处理领用单（管理员全量，本人仅自己）")
    public Result<List<SupplyClaimOrderView>> pendingTasks(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(suppliesService.listPendingTasks(user));
    }

    @GetMapping("/claims/recent-closed")
    @Operation(summary = "最近已关闭领用单（出库完成/撤回；管理员全量，非管理员仅本人）")
    public Result<List<SupplyClaimOrderView>> recentClosedClaims(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                                 @RequestParam(defaultValue = "30") int limit) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(suppliesService.listRecentClosedClaims(user, limit));
    }

    @GetMapping("/claims/mine")
    @Operation(summary = "我的领用记录")
    public Result<Map<String, Object>> mine(@RequestHeader(value = "Authorization", required = false) String authorization,
                                            @RequestParam(required = false) String status,
                                            @RequestParam(defaultValue = "1") int page,
                                            @RequestParam(defaultValue = "20") int size) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(suppliesService.listMine(user, status, page, size));
    }

    @GetMapping("/claims/applicant-options")
    @Operation(summary = "领用区间筛选：曾在领用单中出现过的申请人（昵称）；非超级管理员及以上仅本人")
    public Result<List<SupplyClaimApplicantOption>> claimApplicantOptions(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        try {
            return Result.success(suppliesService.listClaimApplicantOptions(user));
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage() != null ? ex.getMessage() : "加载失败");
        }
    }

    @GetMapping("/claims/mine-range")
    @Operation(summary = "按领用人与领用单申请日期区间查询领用单（含明细，用于聚合展示）。applicantUserId 代查他人仅超级管理员及以上")
    public Result<Map<String, Object>> mineClaimsByRange(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                         @RequestParam String from,
                                                         @RequestParam String to,
                                                         @RequestParam(required = false) String applicantUserId) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        try {
            LocalDate f = LocalDate.parse(from.trim());
            LocalDate t = LocalDate.parse(to.trim());
            return Result.success(suppliesService.listMineClaimsByCreatedRange(user, f, t, applicantUserId));
        } catch (DateTimeParseException ex) {
            return Result.error("日期格式无效，请使用 yyyy-MM-dd");
        } catch (IllegalArgumentException ex) {
            return Result.error(ex.getMessage() != null ? ex.getMessage() : "查询失败");
        }
    }

    @GetMapping("/claims/mine-range/export/excel")
    @Operation(summary = "按领用人与申请日期区间导出领用聚合明细 Excel（无库存列）。applicantUserId 代查他人仅超级管理员及以上")
    public ResponseEntity<byte[]> exportPersonalClaimsRangeExcel(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                                 @RequestParam String from,
                                                                 @RequestParam String to,
                                                                 @RequestParam(required = false) String applicantUserId) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) {
            return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN)
                    .body((denied.getMessage() != null ? denied.getMessage() : "无权限").getBytes(StandardCharsets.UTF_8));
        }
        try {
            LocalDate f = LocalDate.parse(from.trim());
            LocalDate t = LocalDate.parse(to.trim());
            byte[] body = suppliesService.exportPersonalClaimsRangeExcel(user, f, t, applicantUserId);
            String uidPart = (applicantUserId == null || applicantUserId.isBlank()) ? "me" : applicantUserId.replaceAll("[^A-Za-z0-9_-]", "_");
            String fn = "supply-claims-" + uidPart + "-" + f + "_" + t + ".xlsx";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fn + "\"")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(body);
        } catch (DateTimeParseException ex) {
            return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN)
                    .body("日期格式无效，请使用 yyyy-MM-dd".getBytes(StandardCharsets.UTF_8));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN)
                    .body((ex.getMessage() != null ? ex.getMessage() : "导出失败").getBytes(StandardCharsets.UTF_8));
        }
    }

    @GetMapping("/claims/recycle/mine")
    @Operation(summary = "我的领用回收站")
    public Result<Map<String, Object>> myRecycle(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                 @RequestParam(defaultValue = "1") int page,
                                                 @RequestParam(defaultValue = "20") int size) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(suppliesService.listMyClaimRecycle(user, page, size));
    }

    @PostMapping("/claims/recycle/{id}/restore")
    @Operation(summary = "恢复我的领用回收站工单")
    public Result<?> restoreMyClaim(@RequestHeader(value = "Authorization", required = false) String authorization,
                                    @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return denied;
        return suppliesService.restoreMyClaimOrder(user, id);
    }

    @GetMapping("/claims/{id}")
    @Operation(summary = "领用单详情")
    public Result<SupplyClaimOrderView> claimDetail(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                     @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return Result.error(denied.getMessage());
        return suppliesService.getClaimDetail(user, id);
    }

    @GetMapping("/claims/{id}/export/personal/excel")
    @Operation(summary = "导出所选领用单 Excel（一单内全部物品）")
    public ResponseEntity<byte[]> exportPersonalClaimExcel(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                             @PathVariable("id") String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) {
            return ResponseEntity.status(403).contentType(MediaType.TEXT_PLAIN)
                    .body((denied.getMessage() != null ? denied.getMessage() : "无权限").getBytes(StandardCharsets.UTF_8));
        }
        try {
            byte[] body = suppliesService.exportPersonalClaimExcel(user, id);
            String fn = "supply-claim-" + id.replaceAll("[^A-Za-z0-9_-]", "_") + ".xlsx";
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fn + "\"")
                    .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .body(body);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN)
                    .body((ex.getMessage() != null ? ex.getMessage() : "导出失败").getBytes(StandardCharsets.UTF_8));
        }
    }

    @PostMapping("/claims/{id}/pdf-link")
    @Operation(summary = "生成或复用领用记录PDF下载链接")
    public Result<?> createOrReuseClaimPdfLink(@RequestHeader(value = "Authorization", required = false) String authorization,
                                               @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return denied;
        return suppliesService.createOrReuseClaimPdfLink(user, id);
    }

    @GetMapping("/claims/{id}/pdf-links")
    @Operation(summary = "查询领用记录PDF下载链接列表")
    public Result<?> listClaimPdfLinks(@RequestHeader(value = "Authorization", required = false) String authorization,
                                       @PathVariable String id) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return denied;
        return suppliesService.listClaimPdfLinks(user, id);
    }

    @DeleteMapping("/claims/{id}/pdf-links/{linkId}")
    @Operation(summary = "删除（失效）领用记录PDF下载链接")
    public Result<?> invalidateClaimPdfLink(@RequestHeader(value = "Authorization", required = false) String authorization,
                                            @PathVariable String id,
                                            @PathVariable String linkId) {
        User user = resolveUser(authorization);
        Result<?> denied = capabilityPolicyService.requireSubmit(user, BizDomains.SUPPLIES_CLAIM);
        if (denied != null) return denied;
        return suppliesService.invalidateClaimPdfLink(user, id, linkId);
    }

    @GetMapping("/claims/download/{token}")
    @Operation(summary = "根据下载令牌跳转领取用记录PDF")
    public ResponseEntity<?> downloadClaimPdfByToken(@PathVariable String token) {
        Result<Map<String, Object>> result = suppliesService.resolveClaimPdfDownload(token);
        if (result == null || !Boolean.TRUE.equals(result.getSuccess())) {
            String msg = result == null ? "下载失败" : result.getMessage();
            return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN).body(msg.getBytes(StandardCharsets.UTF_8));
        }
        Map<String, Object> data = result.getData();
        String downloadUrl = data == null || data.get("downloadUrl") == null ? "" : String.valueOf(data.get("downloadUrl"));
        if (downloadUrl.isBlank()) {
            return ResponseEntity.badRequest().contentType(MediaType.TEXT_PLAIN).body("下载链接无效".getBytes(StandardCharsets.UTF_8));
        }
        return ResponseEntity.status(302).location(URI.create(downloadUrl)).build();
    }

    private User resolveUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(RoleEnum.STUDENT);
        return user;
    }

}
