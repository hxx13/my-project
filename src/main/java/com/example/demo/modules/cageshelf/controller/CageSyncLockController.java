package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.cageshelf.entity.CageSyncLock;
import com.example.demo.modules.cageshelf.service.CageSyncLockService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 笼位同步保护锁：楼层 / 房间 / 笼架 / 笼位四层，锁住的节点在同步时跳过写入。
 * 配置入口是笼架页的「同步保护」模式，写权限由网关/切面控制（平台所有者）。
 */
@RestController
@RequestMapping("/api/cage-sync-lock")
@Tag(name = "笼位同步保护锁")
public class CageSyncLockController {

    private final AuthContextService authContextService;
    private final UserDisplayNameService userDisplayNameService;
    private final CageSyncLockService lockService;

    public CageSyncLockController(AuthContextService authContextService,
                                  UserDisplayNameService userDisplayNameService,
                                  CageSyncLockService lockService) {
        this.authContextService = authContextService;
        this.userDisplayNameService = userDisplayNameService;
        this.lockService = lockService;
    }

    @GetMapping("/list")
    @Operation(summary = "全量锁列表（前端一次拉完）")
    public Result<List<Map<String, Object>>> list(HttpServletRequest request) {
        if (authContextService.resolveUserFromBearer(request.getHeader("Authorization")) == null) {
            return Result.fail(401, "未登录");
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (CageSyncLock row : lockService.listAll()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("scopeType", row.getScopeType());
            m.put("scopeKey", row.getScopeKey());
            m.put("locked", Boolean.TRUE.equals(row.getLocked()));
            m.put("reason", row.getReason());
            m.put("operatorName", row.getOperatorName());
            out.add(m);
        }
        return Result.success(out);
    }

    /** body: { scopeType, scopeKey, locked, reason? } —— locked=false 即白名单解锁。 */
    @PostMapping("/set")
    @Operation(summary = "加锁/解锁某层节点")
    public Result<?> set(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        String scopeType = asStr(body.get("scopeType"));
        String scopeKey = asStr(body.get("scopeKey"));
        if (scopeType == null || scopeKey == null) return Result.fail(400, "scopeType/scopeKey 必填");
        boolean locked = !Boolean.FALSE.equals(body.get("locked"));
        lockService.setLock(scopeType, scopeKey, locked, asStr(body.get("reason")),
                u.getId(), operatorDisplayName(u));
        return Result.success(Map.of("ok", true));
    }

    /** body: { scopeType, scopeKey } —— 清除该层设置，回到继承上级。 */
    @PostMapping("/clear")
    @Operation(summary = "清除某层锁设置（回到继承上级）")
    public Result<?> clear(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        if (authContextService.resolveUserFromBearer(request.getHeader("Authorization")) == null) {
            return Result.fail(401, "未登录");
        }
        String scopeType = asStr(body.get("scopeType"));
        String scopeKey = asStr(body.get("scopeKey"));
        if (scopeType == null || scopeKey == null) return Result.fail(400, "scopeType/scopeKey 必填");
        lockService.clearLock(scopeType, scopeKey);
        return Result.success(Map.of("ok", true));
    }

    private String operatorDisplayName(User user) {
        if (user == null || user.getId() == null) return "unknown";
        String name = userDisplayNameService.resolveDisplayName(user.getId());
        return (name != null && !name.isBlank()) ? name : user.getId();
    }

    private static String asStr(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
