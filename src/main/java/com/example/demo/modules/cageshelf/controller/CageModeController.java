package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageModeVisibilityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 笼架模式可见性：给三端下发「当前用户可见的模式列表」。
 * 后端一次性算好身份判断，避免 Web/H5/小程序各自拉配置 + 各自算身份导致三套逻辑漂移。
 */
@RestController
@RequestMapping("/api/cage-mode")
@Tag(name = "笼架模式可见性")
public class CageModeController {

    private final AuthContextService authContextService;
    private final CageModeVisibilityService visibilityService;

    public CageModeController(AuthContextService authContextService, CageModeVisibilityService visibilityService) {
        this.authContextService = authContextService;
        this.visibilityService = visibilityService;
    }

    @GetMapping("/visible")
    @Operation(summary = "当前用户可见的笼架模式列表（按视角）")
    public Result<Map<String, Object>> visible(HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);

        boolean student = visibilityService.isStudent(u);
        Map<String, Object> out = new LinkedHashMap<>();
        if (student) {
            // 学生视角：查看 / 申请预约 / 确认。
            // 「划分」是管家（GROUP_STEWARD）专属，且管家多为学生账号（单视角），
            // 所以学生分支也要按身份配置补发，否则学生账号的管家永远看不到入口。
            List<String> modes = new ArrayList<>(List.of("view", "studentClaim", "confirm"));
            if (visibilityService.canUseMode(u, "division")) modes.add("division");
            out.put("modes", modes);
        } else {
            out.put("modes", visibilityService.visibleStaffModes(u));
        }
        out.put("isStudent", student);
        out.put("isSuperAdmin", visibilityService.isSuperAdmin(u));
        return Result.success(out);
    }
}
