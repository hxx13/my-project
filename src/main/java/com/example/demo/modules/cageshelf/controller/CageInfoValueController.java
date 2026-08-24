package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageInfoValueService;
import com.example.demo.modules.identity.service.PersonIdentityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 笼位级表单值（关键信息）读写 — /api/admin/cage-info/values。
 * 表单是固定信息模板，值挂笼位，与认领无关。
 */
@RestController
@RequestMapping("/api/admin/cage-info/values")
@Tag(name = "笼位表单值")
public class CageInfoValueController {

    private static final Logger log = LoggerFactory.getLogger(CageInfoValueController.class);

    private final AuthContextService authContextService;
    private final CageInfoValueService infoValueService;
    private final PersonIdentityService personIdentityService;

    public CageInfoValueController(AuthContextService authContextService,
                                   CageInfoValueService infoValueService,
                                   PersonIdentityService personIdentityService) {
        this.authContextService = authContextService;
        this.infoValueService = infoValueService;
        this.personIdentityService = personIdentityService;
    }

    private User resolveUser(HttpServletRequest req) {
        User u = authContextService.resolveUserFromBearer(req.getHeader("Authorization"));
        if (u == null) return null;
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);
        return u;
    }

    /** 笼位表单值编辑权限 = 管理员及以上，或「饲养组长」身份标识（区别于 PI）。 */
    private Result<?> requireEditor(User u) {
        if (u == null) return Result.error("未登录");
        if (u.getStatus() != null && u.getStatus() == 0) return Result.error("账号已禁用");
        if (u.getRole() != null && u.getRole().getLevel() >= RoleEnum.ADMIN.getLevel()) return null;
        if (personIdentityService.isBreedingGroupLeader(u.getId())) return null;
        return Result.error("无编辑权限（仅管理员或饲养组长）");
    }

    @GetMapping("/{animalCageId}")
    @Operation(summary = "读某笼位的表单值（字段字典 + 实例值）")
    public Result<List<Map<String, Object>>> getInfo(@PathVariable Long animalCageId, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireEditor(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(infoValueService.getInfo(animalCageId));
    }

    @PutMapping("/{animalCageId}")
    @Operation(summary = "写某笼位的表单值")
    public Result<List<Map<String, Object>>> updateInfo(@PathVariable Long animalCageId,
                                                        @RequestBody Map<String, Object> body,
                                                        HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireEditor(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            Object raw = body == null ? null : body.get("values");
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> entries = raw instanceof List<?> list
                ? list.stream().filter(e -> e instanceof Map).map(e -> (Map<String, Object>) e).toList()
                : List.of();
            return Result.success(infoValueService.updateInfo(animalCageId, entries, u.getId()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> Result<T> handleServiceException(Exception e) {
        if (e instanceof com.example.demo.common.exception.TwinBusinessException be) {
            return (Result<T>) Result.fail(be.getCode(), be.getMessage());
        }
        log.warn("[cage-info-value] 操作失败: {}", e.getMessage(), e);
        return (Result<T>) Result.error(e.getMessage());
    }
}
