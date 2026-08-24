package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageInfoFieldDictionary;
import com.example.demo.modules.cageshelf.service.CageInfoDictionaryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 笼位字段字典套 + 域/子模块结构 API — /api/admin/cage-info/dictionaries。
 * 「新建文件夹」= 新建域（Dn）/ 子模块（Dn.mm）。
 */
@RestController
@RequestMapping("/api/admin/cage-info/dictionaries")
@Tag(name = "笼位字段字典套")
public class CageInfoDictionaryController {

    private static final Logger log = LoggerFactory.getLogger(CageInfoDictionaryController.class);

    private final AuthContextService authContextService;
    private final CageInfoDictionaryService dictionaryService;

    public CageInfoDictionaryController(AuthContextService authContextService,
                                        CageInfoDictionaryService dictionaryService) {
        this.authContextService = authContextService;
        this.dictionaryService = dictionaryService;
    }

    private User resolveUser(HttpServletRequest req) {
        User u = authContextService.resolveUserFromBearer(req.getHeader("Authorization"));
        if (u == null) return null;
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);
        return u;
    }

    private Result<?> requireAdmin(User u) {
        if (u == null) return Result.error("未登录");
        if (u.getStatus() != null && u.getStatus() == 0) return Result.error("账号已禁用");
        if (u.getRole().getLevel() < RoleEnum.ADMIN.getLevel()) return Result.error("无权限");
        return null;
    }

    @GetMapping
    @Operation(summary = "字典套列表")
    public Result<List<CageInfoFieldDictionary>> list(HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(dictionaryService.list());
    }

    @GetMapping("/{dictKey}/structure")
    @Operation(summary = "字典套结构（域/子模块大纲）")
    public Result<Map<String, Object>> structure(@PathVariable String dictKey, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(dictionaryService.getStructure(dictKey));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PostMapping("/{dictKey}/structure/domains")
    @Operation(summary = "新建数据域（一级文件夹）")
    public Result<Map<String, Object>> addDomain(@PathVariable String dictKey,
                                                 @RequestBody Map<String, Object> body,
                                                 HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(dictionaryService.addDomain(dictKey, body));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PostMapping("/{dictKey}/structure/submodules")
    @Operation(summary = "新建子模块（二级文件夹）")
    public Result<Map<String, Object>> addSubmodule(@PathVariable String dictKey,
                                                    @RequestBody Map<String, Object> body,
                                                    HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(dictionaryService.addSubmodule(dictKey, body));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PatchMapping("/{dictKey}/structure/domains/{domainCode}")
    @Operation(summary = "重命名数据域")
    public Result<Map<String, Object>> renameDomain(@PathVariable String dictKey,
                                                    @PathVariable String domainCode,
                                                    @RequestBody Map<String, Object> body,
                                                    HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(dictionaryService.renameDomain(dictKey, domainCode, body));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @PatchMapping("/{dictKey}/structure/submodules/{submoduleCode}")
    @Operation(summary = "重命名子模块")
    public Result<Map<String, Object>> renameSubmodule(@PathVariable String dictKey,
                                                       @PathVariable String submoduleCode,
                                                       @RequestBody Map<String, Object> body,
                                                       HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(dictionaryService.renameSubmodule(dictKey, submoduleCode, body));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @DeleteMapping("/{dictKey}/structure/domains/{domainCode}")
    @Operation(summary = "删除数据域（cascade=true 软删字段）")
    public Result<Map<String, Object>> deleteDomain(@PathVariable String dictKey,
                                                    @PathVariable String domainCode,
                                                    @RequestParam(defaultValue = "false") boolean cascade,
                                                    HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(dictionaryService.deleteDomain(dictKey, domainCode, cascade));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @DeleteMapping("/{dictKey}/structure/submodules/{submoduleCode}")
    @Operation(summary = "删除子模块（cascade=true 软删字段）")
    public Result<Map<String, Object>> deleteSubmodule(@PathVariable String dictKey,
                                                       @PathVariable String submoduleCode,
                                                       @RequestParam(defaultValue = "false") boolean cascade,
                                                       HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireAdmin(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            return Result.success(dictionaryService.deleteSubmodule(dictKey, submoduleCode, cascade));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    @SuppressWarnings("unchecked")
    private static <T> Result<T> handleServiceException(Exception e) {
        if (e instanceof com.example.demo.common.exception.TwinBusinessException be) {
            return (Result<T>) Result.fail(be.getCode(), be.getMessage());
        }
        log.warn("[cage-info-dictionary] 操作失败: {}", e.getMessage(), e);
        return (Result<T>) Result.error(e.getMessage());
    }
}
