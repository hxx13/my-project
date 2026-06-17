package com.example.demo.modules.twin.scan.delay.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.common.enums.RoleEnum;
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
    @Operation(summary = "管理端：保存某房间绑定的延迟选项")
    public Result<ScanDelayRoomBindingDTO> saveRoomBinding(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @PathVariable String roomId,
            @RequestBody Map<String, Object> body) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == null || user.getRole().ordinal() < RoleEnum.ADMIN.ordinal()) {
            return Result.error("需要管理员权限");
        }
        try {
            List<Long> optionIds = new java.util.ArrayList<>();
            Object raw = body.get("optionIds");
            if (raw instanceof List<?> list) {
                for (Object o : list) {
                    if (o == null) continue;
                    optionIds.add(Long.parseLong(o.toString()));
                }
            }
            return Result.success(configService.saveRoomBinding(roomId, optionIds));
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
        if (user == null || user.getRole() == RoleEnum.STUDENT) {
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

    @GetMapping("/request/pending")
    @Operation(summary = "教职工：我的待审核延迟申请")
    public Result<List<Map<String, Object>>> listPending(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null || user.getRole() == RoleEnum.STUDENT) {
            return Result.error("需要教职工权限");
        }
        return Result.success(requestService.listPendingEnriched(user.getId()));
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
