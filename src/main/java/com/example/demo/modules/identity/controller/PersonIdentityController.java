package com.example.demo.modules.identity.controller;

import com.example.demo.common.config.AdminAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.identity.dto.IdentityTagUpsertRequest;
import com.example.demo.modules.identity.dto.IdentityTagVO;
import com.example.demo.modules.identity.dto.PersonIdentityVO;
import com.example.demo.modules.identity.dto.SetIdentityRequest;
import com.example.demo.modules.identity.service.PersonIdentityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/person-identity")
@Tag(name = "人员身份标识", description = "人员身份标签字典与身份映射管理（学生/员工双视角独立）")
public class PersonIdentityController {

    private final PersonIdentityService personIdentityService;

    public PersonIdentityController(PersonIdentityService personIdentityService) {
        this.personIdentityService = personIdentityService;
    }

    @GetMapping("/tags")
    @Operation(summary = "查询启用的身份标签")
    public Result<List<IdentityTagVO>> listTags(HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return (Result<List<IdentityTagVO>>) (Object) denied;
        return Result.success(personIdentityService.listTags());
    }

    @PostMapping("/tags")
    @Operation(summary = "新建身份标签（需 code + label，id 后端自增）")
    public Result<?> createTag(@RequestBody IdentityTagUpsertRequest req, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        try {
            Long id = personIdentityService.createTag(
                    req != null ? req.getCode() : null,
                    req != null ? req.getLabel() : null,
                    req != null ? req.getSortOrder() : null);
            return Result.success(Map.of("id", id));
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @PutMapping("/tags/{id}")
    @Operation(summary = "更新身份标签")
    public Result<?> updateTag(@PathVariable Long id,
                               @RequestBody IdentityTagUpsertRequest req,
                               HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        try {
            personIdentityService.updateTag(id,
                    req != null ? req.getLabel() : null,
                    req != null ? req.getSortOrder() : null,
                    req != null ? req.getActive() : null);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @DeleteMapping("/tags/{id}")
    @Operation(summary = "删除身份标签（被引用时拒绝）")
    public Result<?> deleteTag(@PathVariable Long id, HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        try {
            personIdentityService.deleteTag(id);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    @GetMapping
    @Operation(summary = "批量查询人员身份（userIds 缺省返回全部有身份的人）")
    public Result<List<PersonIdentityVO>> listByIds(@RequestParam(required = false) String userIds,
                                                    HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return (Result<List<PersonIdentityVO>>) (Object) denied;
        Map<String, List<IdentityTagVO>> map = personIdentityService.listByUserIds(splitUserIds(userIds));
        List<PersonIdentityVO> result = new ArrayList<>();
        map.forEach((uid, tags) -> {
            PersonIdentityVO vo = new PersonIdentityVO();
            vo.setUserId(uid);
            vo.setTags(tags);
            result.add(vo);
        });
        return Result.success(result);
    }

    @GetMapping("/{userId}")
    @Operation(summary = "查询单个人员的身份")
    public Result<PersonIdentityVO> getByUser(@PathVariable String userId,
                                              HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return (Result<PersonIdentityVO>) (Object) denied;
        PersonIdentityVO vo = new PersonIdentityVO();
        vo.setUserId(userId);
        vo.setTags(personIdentityService.getByUser(userId));
        return Result.success(vo);
    }

    @PutMapping("/{userId}")
    @Operation(summary = "全量写入人员身份标签（先删后插）")
    public Result<?> setByUser(@PathVariable String userId,
                               @RequestBody(required = false) SetIdentityRequest body,
                               HttpServletRequest request) {
        Result<?> denied = requireSuperAdmin(request);
        if (denied != null) return denied;
        try {
            personIdentityService.setByUser(userId, body != null ? body.getTagIds() : null);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.error(e.getMessage());
        }
    }

    private Result<?> requireSuperAdmin(HttpServletRequest request) {
        Object attr = request.getAttribute(AdminAuthInterceptor.CURRENT_ADMIN_USER_ATTR);
        if (!(attr instanceof User currentUser)) {
            return Result.error("当前登录信息无效");
        }
        RoleEnum currentRole = currentUser.getRole() == null ? RoleEnum.MEMBER : currentUser.getRole();
        if (currentRole.getLevel() < RoleEnum.SUPER_ADMIN.getLevel()) {
            return Result.error("无权限访问");
        }
        return null;
    }

    private List<String> splitUserIds(String userIds) {
        if (userIds == null || userIds.isBlank()) {
            return null;
        }
        List<String> result = new ArrayList<>();
        for (String part : userIds.split(",")) {
            String t = part.trim();
            if (!t.isEmpty()) {
                result.add(t);
            }
        }
        return result;
    }
}
