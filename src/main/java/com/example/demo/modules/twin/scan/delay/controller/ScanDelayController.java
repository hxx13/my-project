package com.example.demo.modules.twin.scan.delay.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.twin.scan.delay.dto.ScanDelayCarrierDTO;
import com.example.demo.modules.twin.scan.delay.dto.ScanDelayOptionDTO;
import com.example.demo.modules.twin.scan.delay.dto.ScanDelayRoomBindingDTO;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRequest;
import com.example.demo.modules.twin.scan.delay.service.ScanDelayConfigService;
import com.example.demo.modules.twin.scan.delay.service.ScanDelayRequestService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/twin/scan-delay")
@Tag(name = "扫码延迟免冻结", description = "扫码弹窗延迟按钮配置与审核")
public class ScanDelayController {

    @Autowired
    private ScanDelayConfigService configService;

    @Autowired
    private ScanDelayRequestService requestService;

    @Autowired
    private AuthContextService authContextService;

    @GetMapping("/carriers")
    @Operation(summary = "管理端：列出载体按钮")
    public Result<List<ScanDelayCarrierDTO>> listCarriers(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == null || user.getRole().ordinal() < RoleEnum.ADMIN.ordinal()) {
            return Result.error("需要管理员权限");
        }
        return Result.success(configService.listAllCarriers());
    }

    @PostMapping("/carriers")
    @Operation(summary = "管理端：新增或更新载体按钮")
    public Result<ScanDelayCarrierDTO> saveCarrier(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody ScanDelayCarrierDTO body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == null || user.getRole().ordinal() < RoleEnum.ADMIN.ordinal()) {
            return Result.error("需要管理员权限");
        }
        try {
            return Result.success(configService.saveCarrier(body));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/carriers/{id}")
    @Operation(summary = "管理端：删除载体按钮（不删除菜单项库）")
    public Result<Void> deleteCarrier(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == null || user.getRole().ordinal() < RoleEnum.ADMIN.ordinal()) {
            return Result.error("需要管理员权限");
        }
        configService.deleteCarrier(id);
        return Result.success(null);
    }

    @GetMapping("/options")
    @Operation(summary = "管理端：列出全部延迟选项")
    public Result<List<ScanDelayOptionDTO>> listOptions(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == null || user.getRole().ordinal() < RoleEnum.ADMIN.ordinal()) {
            return Result.error("需要管理员权限");
        }
        return Result.success(configService.listAllOptions());
    }

    @GetMapping("/room-bindings")
    @Operation(summary = "管理端：房间与延迟选项搭配")
    public Result<List<ScanDelayRoomBindingDTO>> listRoomBindings(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == null || user.getRole().ordinal() < RoleEnum.ADMIN.ordinal()) {
            return Result.error("需要管理员权限");
        }
        return Result.success(configService.listRoomBindings());
    }

    @PutMapping("/room-bindings/{roomId}")
    @Operation(summary = "管理端：保存某房间绑定的延迟载体")
    public Result<ScanDelayRoomBindingDTO> saveRoomBinding(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String roomId,
            @RequestBody Map<String, Object> body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == null || user.getRole().ordinal() < RoleEnum.ADMIN.ordinal()) {
            return Result.error("需要管理员权限");
        }
        try {
            List<Long> carrierIds = new java.util.ArrayList<>();
            Object raw = body.get("carrierIds");
            if (raw instanceof List<?> list) {
                for (Object o : list) {
                    if (o == null) continue;
                    carrierIds.add(Long.parseLong(o.toString()));
                }
            }
            return Result.success(configService.saveRoomBinding(roomId, carrierIds));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PostMapping("/options")
    @Operation(summary = "管理端：新增或更新延迟选项")
    public Result<ScanDelayOptionDTO> saveOption(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody ScanDelayOptionDTO body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == null || user.getRole().ordinal() < RoleEnum.ADMIN.ordinal()) {
            return Result.error("需要管理员权限");
        }
        try {
            return Result.success(configService.saveOption(body));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/options/{id}")
    @Operation(summary = "管理端：删除延迟选项")
    public Result<Void> deleteOption(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == null || user.getRole().ordinal() < RoleEnum.ADMIN.ordinal()) {
            return Result.error("需要管理员权限");
        }
        configService.deleteOption(id);
        return Result.success(null);
    }

    @PostMapping("/request")
    @Operation(summary = "扫码弹窗：提交延迟免冻结（直批或进审核）")
    public Result<Map<String, Object>> submitRequest(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return Result.error("未登录");
        }
        try {
            String subjectUserId = body.get("subjectUserId") != null ? body.get("subjectUserId").toString() : null;
            String roomId = body.get("roomId") != null ? body.get("roomId").toString() : null;
            Long optionId = body.get("optionId") != null ? Long.parseLong(body.get("optionId").toString()) : null;
            String reviewerUserId = body.get("reviewerUserId") != null ? body.get("reviewerUserId").toString() : null;
            Map<String, Object> out = requestService.submitRequest(
                    subjectUserId, roomId, optionId, reviewerUserId, user.getId());
            return Result.success(out);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("提交失败: " + e.getMessage());
        }
    }

    @PostMapping("/request/{id}/review")
    @Operation(summary = "教职工：审核延迟免冻结申请")
    public Result<Map<String, Object>> reviewRequest(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == RoleEnum.MEMBER) {
            return Result.error("需要教职工权限");
        }
        try {
            boolean approve = Boolean.TRUE.equals(body.get("approve"))
                    || "true".equalsIgnoreCase(String.valueOf(body.get("approve")));
            String rejectReason = body.get("rejectReason") != null ? body.get("rejectReason").toString() : null;
            return Result.success(requestService.reviewRequest(id, approve, user.getId(), rejectReason));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        } catch (Exception e) {
            return Result.error("审核失败: " + e.getMessage());
        }
    }

    @DeleteMapping("/request/{id}")
    @Operation(summary = "教职工：删除延迟申请（软删除，标记 DELETED，后续判定自动排除）")
    public Result<Void> deleteRequest(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable Long id) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == RoleEnum.MEMBER) {
            return Result.error("需要教职工权限");
        }
        try {
            requestService.deleteRequest(id);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/request/my-active")
    @Operation(summary = "扫码弹窗：查询我在某房间的活跃延迟申请状态")
    public Result<Map<String, Object>> myActiveRequest(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam("roomId") String roomId,
            @RequestParam(value = "subjectUserId", required = false) String subjectUserId) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return Result.error("未登录");
        // subjectUserId 优先（刷卡人可能不等于登录人），回退到登录用户 ID
        String queryUserId = (subjectUserId != null && !subjectUserId.isBlank())
                ? subjectUserId.trim() : user.getId();
        List<Map<String, Object>> active = requestService.listActiveByUserAndRoom(
                queryUserId, roomId);
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        out.put("requests", active);
        out.put("hasPending", active.stream().anyMatch(r -> "PENDING".equals(r.get("status"))));
        out.put("hasApproved", active.stream().anyMatch(r -> "APPROVED".equals(r.get("status"))));
        out.put("rejectedOptionIds", requestService.listTodayRejectedOptionIds(user.getId(), roomId));
        return Result.success(out);
    }

    @GetMapping("/request/pending")
    @Operation(summary = "教职工：我的待审核延迟申请")
    public Result<List<Map<String, Object>>> listPending(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == RoleEnum.MEMBER) {
            return Result.error("需要教职工权限");
        }
        requestService.expireOldPendingRequests();
        return Result.success(requestService.listPendingEnriched(user.getId()));
    }

    @GetMapping("/request/history")
    @Operation(summary = "教职工：已审结延迟免冻结记录（全员可见）")
    public Result<List<Map<String, Object>>> listHistory(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "100") int limit) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == RoleEnum.MEMBER) {
            return Result.error("需要教职工权限");
        }
        return Result.success(requestService.listReviewedHistoryEnriched(limit));
    }

    @PutMapping("/master-enabled")
    @Operation(summary = "管理端：扫码延迟总开关（大华发卡页）")
    public Result<Map<String, Object>> setMasterEnabled(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == null || user.getRole().ordinal() < RoleEnum.ADMIN.ordinal()) {
            return Result.error("需要管理员权限");
        }
        boolean enabled = Boolean.TRUE.equals(body.get("enabled"))
                || "true".equalsIgnoreCase(String.valueOf(body.get("enabled")));
        configService.setMasterEnabled(enabled);
        if (body.containsKey("buttonLabel")) {
            configService.setButtonLabel(body.get("buttonLabel") != null ? body.get("buttonLabel").toString() : "延迟");
        }
        Map<String, Object> out = new HashMap<>();
        out.put("enabled", enabled);
        out.put("buttonLabel", configService.getButtonLabel());
        return Result.success(out);
    }

    @GetMapping("/status")
    @Operation(summary = "总开关状态（公开）")
    public Result<Map<String, Object>> status() {
        Map<String, Object> m = new HashMap<>();
        m.put("enabled", configService.isMasterEnabled());
        m.put("buttonLabel", configService.getButtonLabel());
        return Result.success(m);
    }
}
