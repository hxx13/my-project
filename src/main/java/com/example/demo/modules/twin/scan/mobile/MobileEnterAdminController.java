package com.example.demo.modules.twin.scan.mobile;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 移动端房间自助进入的灰度管理（后台）。
 *
 * <p>路径落在 {@code /api/v1/**}，全局 apiAuthInterceptor 只校验登录态，因此角色门槛在这里自查。
 * 注意没走 {@code /settings/*}（那套要求 SUPER_ADMIN 且本页只到 ADMIN），总开关由本控制器代理读写。
 */
@RestController
@RequestMapping("/api/v1/twin/scan/mobile-enter")
@Tag(name = "移动端房间自助进入", description = "灰度开关与名单管理")
public class MobileEnterAdminController {

    private final MobileEnterGrantService service;
    private final AuthContextService authContextService;

    public MobileEnterAdminController(MobileEnterGrantService service, AuthContextService authContextService) {
        this.service = service;
        this.authContextService = authContextService;
    }

    /** 全局开关 + 两个名单的人数（弹窗打开时一次性拿）。 */
    @GetMapping("/settings")
    @Operation(summary = "读取一键开关与名单人数")
    public Result<Map<String, Object>> getSettings(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        String denied = requireAdmin(authorization);
        if (denied != null) {
            return Result.error(denied);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("masterEnabled", service.isMasterEnabled());
        out.put("whitelistCount", service.countByEnabled(true));
        out.put("blacklistCount", service.countByEnabled(false));
        return Result.success(out);
    }

    /** 一键开启/关闭所有人（白名单、黑名单不受影响）。 */
    @PostMapping("/settings")
    @Operation(summary = "一键开启/关闭所有人")
    public Result<Boolean> updateSettings(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        String denied = requireAdmin(authorization);
        if (denied != null) {
            return Result.error(denied);
        }
        User operator = authContextService.resolveUserFromBearer(authorization);
        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
        try {
            service.setMasterEnabled(enabled, operator != null ? operator.getId() : null);
            return Result.success(enabled);
        } catch (Exception e) {
            return Result.error(e.getMessage() != null ? e.getMessage() : "保存失败");
        }
    }

    @GetMapping("/grants")
    @Operation(summary = "名单查询；enabled=true 取白名单，false 取黑名单，为空取全部")
    public Result<List<Map<String, Object>>> listGrants(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(value = "enabled", required = false) Boolean enabled,
            @RequestParam(value = "keyword", required = false) String keyword) {
        String denied = requireAdmin(authorization);
        if (denied != null) {
            return Result.error(denied);
        }
        return Result.success(service.list(enabled, keyword));
    }

    @PostMapping("/grants")
    @Operation(summary = "批量加入名单；入参可为 STAFF_ 或 ARO 任意形态 id，服务端统一归一")
    public Result<Integer> updateGrants(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        String denied = requireAdmin(authorization);
        if (denied != null) {
            return Result.error(denied);
        }
        User operator = authContextService.resolveUserFromBearer(authorization);
        boolean enabled = Boolean.TRUE.equals(body.get("enabled"));
        List<String> ids = readIds(body);
        if (ids.isEmpty()) {
            return Result.error("缺少 userIds");
        }
        return Result.success(service.setEnabled(ids, enabled, operator != null ? operator.getId() : null));
    }

    @PostMapping("/grants/remove")
    @Operation(summary = "批量移出名单（回到跟随一键开关）")
    public Result<Integer> removeGrants(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, Object> body) {
        String denied = requireAdmin(authorization);
        if (denied != null) {
            return Result.error(denied);
        }
        List<String> ids = readIds(body);
        if (ids.isEmpty()) {
            return Result.error("缺少 userIds");
        }
        return Result.success(service.removeGrants(ids));
    }

    private static List<String> readIds(Map<String, Object> body) {
        Object raw = body == null ? null : body.get("userIds");
        return raw instanceof List<?> list
                ? list.stream().map(String::valueOf).toList()
                : List.of();
    }

    /** 返回错误文案；null 表示通过。 */
    private String requireAdmin(String authorization) {
        User user = authContextService.resolveUserFromBearer(authorization);
        if (user == null) {
            return "未登录或令牌无效";
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            return "账号已禁用";
        }
        RoleEnum role = user.getRole() != null ? user.getRole() : RoleEnum.MEMBER;
        if (role.getLevel() < RoleEnum.ADMIN.getLevel()) {
            return "无权限访问";
        }
        return null;
    }
}
