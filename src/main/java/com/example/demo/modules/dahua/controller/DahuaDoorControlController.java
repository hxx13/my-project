package com.example.demo.modules.dahua.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.dahua.service.DahuaDeviceChannelCacheService;
import com.example.demo.modules.dahua.service.DahuaOpenApiService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/v1/dahua/door-control")
@CrossOrigin("*")
@Tag(name = "大华门禁控制", description = "通道列表与五种门禁控制模式")
public class DahuaDoorControlController {
    private final DahuaDeviceChannelCacheService deviceChannelCacheService;
    private final DahuaOpenApiService dahuaOpenApiService;
    private final AuthContextService authContextService;

    public DahuaDoorControlController(DahuaDeviceChannelCacheService deviceChannelCacheService,
                                      DahuaOpenApiService dahuaOpenApiService,
                                      AuthContextService authContextService) {
        this.deviceChannelCacheService = deviceChannelCacheService;
        this.dahuaOpenApiService = dahuaOpenApiService;
        this.authContextService = authContextService;
    }

    @GetMapping("/channels")
    @Operation(summary = "分页查询门禁通道（名称展示）")
    public Result<?> listChannels(@RequestHeader(value = "Authorization", required = false) String authorization,
                                  @RequestParam(defaultValue = "1") int page,
                                  @RequestParam(defaultValue = "50") int pageSize,
                                  @RequestParam(required = false) String keyword,
                                  @RequestParam(required = false) String channelType,
                                  @RequestParam(required = false) Long remarkCategoryId) {
        Result<?> denied = requireSuperAdmin(authorization);
        if (denied != null) return denied;
        return Result.success(deviceChannelCacheService.list(
                keyword, channelType, null, 7, remarkCategoryId, false, page, pageSize
        ));
    }

    @PostMapping("/execute")
    @Operation(summary = "执行门禁控制（OPEN/CLOSE/STAY_OPEN/STAY_CLOSE/NORMAL）")
    public Result<?> execute(@RequestHeader(value = "Authorization", required = false) String authorization,
                             @RequestBody Map<String, Object> body) {
        Result<?> denied = requireSuperAdmin(authorization);
        if (denied != null) return denied;
        try {
            String mode = body == null ? "" : String.valueOf(body.getOrDefault("mode", "")).trim();
            Object listObj = body == null ? null : body.get("channelCodeList");
            List<String> channelCodeList = listObj instanceof List<?> l
                    ? l.stream().map(String::valueOf).filter(s -> !s.isBlank()).collect(Collectors.toList())
                    : List.of();
            Map<String, Object> resp = dahuaOpenApiService.controlDoor(mode, channelCodeList);
            Map<String, Object> payload = new HashMap<>();
            payload.put("mode", mode);
            payload.put("channelCodeList", channelCodeList);
            payload.put("upstream", resp);
            payload.put("success", dahuaOpenApiService.isSuccess(resp));
            return Result.success(payload);
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "执行失败" : ex.getMessage());
        }
    }

    @PostMapping("/status")
    @Operation(summary = "查询门禁通道状态（支持单通道/批量/门组）")
    public Result<?> queryStatus(@RequestHeader(value = "Authorization", required = false) String authorization,
                                 @RequestBody Map<String, Object> body) {
        Result<?> denied = requireSuperAdmin(authorization);
        if (denied != null) return denied;
        try {
            String channelCode = body == null ? null : stringOf(body.get("channelCode"));
            Object listObj = body == null ? null : body.get("channelCodes");
            List<String> channelCodes = listObj instanceof List<?> l
                    ? l.stream().map(String::valueOf).filter(s -> !s.isBlank()).collect(Collectors.toList())
                    : List.of();
            Long doorGroupId = null;
            if (body != null && body.get("doorGroupId") != null && !String.valueOf(body.get("doorGroupId")).isBlank()) {
                doorGroupId = Long.parseLong(String.valueOf(body.get("doorGroupId")));
            }
            Map<String, Object> resp = dahuaOpenApiService.queryDoorStatus(channelCode, channelCodes, doorGroupId);
            List<Map<String, Object>> rows = DahuaOpenApiService.asListOfMap(resp.get("data"));
            Map<String, Object> payload = new HashMap<>();
            payload.put("success", dahuaOpenApiService.isSuccess(resp));
            payload.put("rows", rows);
            payload.put("upstream", resp);
            return Result.success(payload);
        } catch (Exception ex) {
            return Result.error(ex.getMessage() == null ? "查询状态失败" : ex.getMessage());
        }
    }

    private Result<?> requireSuperAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) return Result.error("未登录或令牌无效");
        if (user.getStatus() != null && user.getStatus() == 0) return Result.error("账号已禁用");
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.STUDENT;
        if (role.getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) return Result.error("无权限访问");
        return null;
    }

    private static String stringOf(Object value) {
        if (value == null) return null;
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? null : s;
    }
}
