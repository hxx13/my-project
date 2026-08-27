package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.service.CageOccupancyService;
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
 * 笼位占用操作（copy / transfer / exit）—— 占用周期 = 个人账号 + 笼位 + 起止时间。
 * 权限 = 管理员及以上，或饲养组长（区别于 PI）。
 */
@RestController
@RequestMapping("/api/admin/cage-info/occupancy")
@Tag(name = "笼位占用操作")
public class CageOccupancyController {

    private static final Logger log = LoggerFactory.getLogger(CageOccupancyController.class);

    private final AuthContextService authContextService;
    private final CageOccupancyService occupancyService;
    private final PersonIdentityService personIdentityService;

    public CageOccupancyController(AuthContextService authContextService,
                                   CageOccupancyService occupancyService,
                                   PersonIdentityService personIdentityService) {
        this.authContextService = authContextService;
        this.occupancyService = occupancyService;
        this.personIdentityService = personIdentityService;
    }

    private User resolveUser(HttpServletRequest req) {
        User u = authContextService.resolveUserFromBearer(req.getHeader("Authorization"));
        if (u == null) return null;
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);
        return u;
    }

    private Result<?> requireEditor(User u) {
        if (u == null) return Result.error("未登录");
        if (u.getStatus() != null && u.getStatus() == 0) return Result.error("账号已禁用");
        if (u.getRole() != null && u.getRole().getLevel() >= RoleEnum.ADMIN.getLevel()) return null;
        if (personIdentityService.isBreedingGroupLeader(u.getId())) return null;
        return Result.error("无编辑权限（仅管理员或饲养组长）");
    }

    @PostMapping("/copy")
    @Operation(summary = "复制占用字段到另一笼位（源保留）")
    public Result<Map<String, Object>> copy(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireEditor(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            Long from = toLong(body == null ? null : body.get("fromAnimalCageId"));
            Long to = toLong(body == null ? null : body.get("toAnimalCageId"));
            return Result.success(occupancyService.copy(from, to, u.getId(), str(body, "reason")));
        } catch (Exception e) {
            return handle(e);
        }
    }

    @PostMapping("/transfer")
    @Operation(summary = "转笼：占用字段移到另一笼位（源清空占用字段）")
    public Result<Map<String, Object>> transfer(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireEditor(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            Long from = toLong(body == null ? null : body.get("fromAnimalCageId"));
            Long to = toLong(body == null ? null : body.get("toAnimalCageId"));
            return Result.success(occupancyService.transfer(from, to, u.getId(), str(body, "reason")));
        } catch (Exception e) {
            return handle(e);
        }
    }

    @PostMapping("/exit")
    @Operation(summary = "退出：清空该笼位占用字段并落最终快照")
    public Result<Map<String, Object>> exit(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireEditor(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            Long animalCageId = toLong(body == null ? null : body.get("animalCageId"));
            return Result.success(occupancyService.exit(animalCageId, u.getId(), str(body, "reason")));
        } catch (Exception e) {
            return handle(e);
        }
    }

    @PostMapping("/archive")
    @Operation(summary = "归档：释放占用并回退为空笼盒(type2)")
    public Result<Map<String, Object>> archive(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireEditor(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        try {
            Long animalCageId = toLong(body == null ? null : body.get("animalCageId"));
            return Result.success(occupancyService.archive(animalCageId, u.getId(), str(body, "reason")));
        } catch (Exception e) {
            return handle(e);
        }
    }

    @GetMapping("/records")
    @Operation(summary = "占用记录查询（view=cage 笼位视角 / view=person 个人视角）")
    public Result<List<Map<String, Object>>> records(@RequestParam String view,
                                                     @RequestParam(required = false) Long cageId,
                                                     @RequestParam(required = false) Long occupantId,
                                                     HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireEditor(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        Long id = "person".equals(view) ? occupantId : cageId;
        if (id == null) return Result.fail(400, "缺少 cageId 或 occupantId");
        return Result.success(occupancyService.records(view, id));
    }

    private static String str(Map<String, Object> body, String key) {
        if (body == null) return null;
        Object v = body.get(key);
        return v == null ? null : String.valueOf(v);
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); } catch (NumberFormatException e) { return null; }
    }

    @SuppressWarnings("unchecked")
    private static <T> Result<T> handle(Exception e) {
        if (e instanceof TwinBusinessException be) {
            return (Result<T>) Result.fail(be.getCode(), be.getMessage());
        }
        log.warn("[cage-occupancy] 操作失败: {}", e.getMessage(), e);
        return (Result<T>) Result.error(e.getMessage());
    }
}
