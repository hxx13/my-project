package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageShelfService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/cage-shelves")
@Tag(name = "笼架信息", description = "笼架索引导入与详情查询")
public class CageShelfController {
    private final AuthContextService authContextService;
    private final CageShelfService cageShelfService;

    public CageShelfController(AuthContextService authContextService, CageShelfService cageShelfService) {
        this.authContextService = authContextService;
        this.cageShelfService = cageShelfService;
    }

    @PostMapping("/import")
    @Operation(summary = "导入笼架 CSV")
    public Result<?> importCsv(@RequestHeader(value = "Authorization", required = false) String authorization,
                               @RequestParam("file") MultipartFile file) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(cageShelfService.importFromCsv(user.getId(), file));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/filter-options")
    @Operation(summary = "笼架筛选项")
    public Result<?> filterOptions(@RequestHeader(value = "Authorization", required = false) String authorization,
                                   @RequestParam(required = false) Integer campusId,
                                   @RequestParam(required = false) String areaId,
                                   @RequestParam(required = false) String areaName,
                                   @RequestParam(required = false) String floorId,
                                   @RequestParam(required = false) String floorName,
                                   @RequestParam(required = false) String roomId,
                                   @RequestParam(required = false) String roomName) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) {
            return denied;
        }
        return Result.success(cageShelfService.filterOptions(campusId, areaId, areaName, floorId, floorName, roomId, roomName));
    }

    @GetMapping("/{shelveId}/detail")
    @Operation(summary = "获取笼架详情（后端代理外部接口）")
    public Result<?> detail(@RequestHeader(value = "Authorization", required = false) String authorization,
                            @PathVariable String shelveId) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) {
            return denied;
        }
        try {
            return Result.success(cageShelfService.fetchShelfDetail(shelveId));
        } catch (Exception e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping("/indexes")
    @Operation(summary = "笼架索引表可视化查询")
    public Result<?> indexes(@RequestHeader(value = "Authorization", required = false) String authorization,
                             @RequestParam(required = false) Integer campusId,
                             @RequestParam(required = false) String areaId,
                             @RequestParam(required = false) String floorId,
                             @RequestParam(required = false) String roomId,
                             @RequestParam(defaultValue = "1") int page,
                             @RequestParam(defaultValue = "50") int size) {
        User user = resolveUser(authorization);
        Result<?> denied = requireMinRole(user, RoleEnum.STAFF);
        if (denied != null) {
            return denied;
        }
        return Result.success(cageShelfService.listIndexRows(campusId, areaId, floorId, roomId, page, size));
    }

    private User resolveUser(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return null;
        }
        if (user.getRole() == null) {
            user.setRole(RoleEnum.STUDENT);
        }
        return user;
    }

    private Result<?> requireMinRole(User user, RoleEnum minRole) {
        if (user == null) {
            return Result.error("未登录或Token无效");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return Result.error("账号已禁用");
        }
        if (user.getRole().getLevel() < minRole.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }
}
