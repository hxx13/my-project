package com.example.demo.modules.notification.push.digest;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/digest-config")
public class AdminDigestConfigController {

    private final NotifyDigestDefaultConfigMapper defaultConfigMapper;

    public AdminDigestConfigController(NotifyDigestDefaultConfigMapper defaultConfigMapper) {
        this.defaultConfigMapper = defaultConfigMapper;
    }

    private Result<?> requireSuperAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User user)) return Result.error("当前登录信息无效");
        if (user.getRole().getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) return Result.error("无权限访问");
        return null;
    }

    @GetMapping
    public Result<List<NotifyDigestDefaultConfig>> listAll(HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return Result.error(denied.getMessage());
        return Result.success(defaultConfigMapper.findAll());
    }

    @PostMapping
    public Result<NotifyDigestDefaultConfig> create(@RequestBody NotifyDigestDefaultConfig config,
                                                     HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return Result.error(denied.getMessage());
        defaultConfigMapper.insert(config);
        return Result.success(config);
    }

    @PutMapping("/{id}")
    public Result<Void> update(@PathVariable Long id, @RequestBody NotifyDigestDefaultConfig config,
                                HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return Result.error(denied.getMessage());
        config.setId(id);
        defaultConfigMapper.update(config);
        return Result.success();
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return Result.error(denied.getMessage());
        defaultConfigMapper.delete(id);
        return Result.success();
    }
}
