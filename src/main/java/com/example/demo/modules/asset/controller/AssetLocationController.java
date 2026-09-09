package com.example.demo.modules.asset.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.asset.dto.AssetLocationUpsertRequest;
import com.example.demo.modules.asset.service.AssetLocationService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/asset-locations")
@Tag(name = "资产存放地点", description = "存放地点树维护")
public class AssetLocationController {
    private final AuthContextService authContextService;
    private final AssetLocationService assetLocationService;

    public AssetLocationController(AuthContextService authContextService, AssetLocationService assetLocationService) {
        this.authContextService = authContextService;
        this.assetLocationService = assetLocationService;
    }

    @GetMapping("/tree")
    @Operation(summary = "存放地点树")
    public Result<?> tree(@RequestHeader(value = "Authorization", required = false) String authorization) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        return Result.success(assetLocationService.tree());
    }

    @PostMapping
    @Operation(summary = "新增存放地点节点")
    public Result<?> create(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @RequestBody(required = false) AssetLocationUpsertRequest request) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            return Result.success(assetLocationService.create(
                    request == null ? null : request.getParentId(),
                    request == null ? null : request.getName(),
                    user.getId()));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @PatchMapping("/{id}")
    @Operation(summary = "更新存放地点节点（改名/移动）")
    public Result<?> update(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable Long id,
                            @RequestBody(required = false) AssetLocationUpsertRequest request) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) return denied;
        try {
            return Result.success(assetLocationService.update(
                    id,
                    request == null ? null : request.getName(),
                    request == null ? null : request.getParentId(),
                    request == null ? null : request.getSortOrder()));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "删除存放地点节点")
    public Result<?> delete(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable Long id) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.ADMIN);
        if (denied != null) return denied;
        try {
            assetLocationService.delete(id);
            return Result.success();
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    private User resolveUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return null;
        if (user.getRole() == null) user.setRole(RoleEnum.MEMBER);
        return user;
    }

    private Result<?> requireMinRole(User user, RoleEnum minRole) {
        if (user == null) return Result.error("未登录或Token无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.error("账号已禁用");
        if (user.getRole().getLevel() < minRole.getLevel()) return Result.error("无权限访问");
        return null;
    }
}
