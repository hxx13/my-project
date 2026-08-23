package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.service.CageClaimInfoService;
import com.example.demo.modules.cageshelf.service.CageClaimService;
import com.example.demo.modules.identity.service.PersonIdentityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;

/**
 * 管理端笼位申请 API — 审批 + 手动分配。
 */
@RestController
@RequestMapping("/api/admin/cage-claims")
@Tag(name = "管理端笼位申请")
@Transactional
public class AdminCageClaimController {

    private static final Logger log = LoggerFactory.getLogger(AdminCageClaimController.class);

    private final AuthContextService authContextService;
    private final CageClaimService claimService;
    private final CageClaimInfoService infoService;
    private final PersonIdentityService personIdentityService;

    public AdminCageClaimController(AuthContextService authContextService,
                                     CageClaimService claimService,
                                     CageClaimInfoService infoService,
                                     PersonIdentityService personIdentityService) {
        this.authContextService = authContextService;
        this.claimService = claimService;
        this.infoService = infoService;
        this.personIdentityService = personIdentityService;
    }

    private User resolveUser(HttpServletRequest req) {
        User u = authContextService.resolveUserFromBearer(req.getHeader("Authorization"));
        if (u == null) return null;
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);
        return u;
    }

    private Result<?> requireMinRole(User u, RoleEnum min) {
        if (u == null) return Result.error("未登录");
        if (u.getStatus() != null && u.getStatus() == 0) return Result.error("账号已禁用");
        if (u.getRole().getLevel() < min.getLevel()) return Result.error("无权限");
        return null;
    }

    /** 审批人 = 管理员及以上，或组长（GROUP_LEADER 身份标识，替代已废弃的 RoleEnum.PI）。 */
    private Result<?> requireApprover(User u) {
        if (u == null) return Result.error("未登录");
        if (u.getStatus() != null && u.getStatus() == 0) return Result.error("账号已禁用");
        if (u.getRole() != null && u.getRole().getLevel() >= RoleEnum.ADMIN.getLevel()) return null;
        if (personIdentityService.isPi(u.getId())) return null;
        return Result.error("无审批权限（仅管理员或组长）");
    }

    // ── 待审批列表 ──

    @GetMapping("/pending")
    @Operation(summary = "待审批列表（分页+筛选）")
    public Result<Map<String, Object>> pending(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireApprover(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(claimService.getPendingList(status, keyword, page, pageSize));
    }

    // ── 审批 ──

    @PostMapping("/{id}/approve")
    @Operation(summary = "审批申请/释放")
    public Result<Map<String, Object>> approve(@PathVariable Long id,
                                                @RequestBody Map<String, Object> body,
                                                HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireApprover(u);
        if (denied != null) return Result.fail(403, denied.getMessage());

        String decision = str(body, "decision");
        String reason = str(body, "reason");
        if (decision == null || decision.isBlank())
            return Result.fail(400, "decision 必填（approved / rejected）");
        if (!"approved".equals(decision) && !"rejected".equals(decision))
            return Result.fail(400, "decision 必须为 approved 或 rejected");

        try {
            CageClaim claim = claimService.approve(u, id, decision, reason);
            return Result.success(Map.of("id", claim.getId(), "status", claim.getClaimStatus()));
        } catch (Exception e) {
            log.warn("[admin-approve] 审批失败 claimId={}: {}", id, e.getMessage());
            return handleServiceException(e);
        }
    }

    // ── 手动分配 ──

    @PostMapping("/assign")
    @Operation(summary = "管理员手动分配笼位给学生")
    public Result<Map<String, Object>> assign(@RequestBody Map<String, Object> body,
                                               HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireMinRole(u, RoleEnum.ADMIN);
        if (denied != null) return Result.fail(403, denied.getMessage());

        Long animalCageId = toLong(body.get("animalCageId"));
        Long shelfIndexId = toLong(body.get("shelfIndexId"));
        String studentUserId = str(body, "studentUserId");
        Long aupId = toLong(body.get("aupId"));
        if (animalCageId == null || shelfIndexId == null || studentUserId == null)
            return Result.fail(400, "animalCageId, shelfIndexId, studentUserId 必填");

        try {
            CageClaim claim = claimService.assign(u, animalCageId, shelfIndexId, studentUserId, aupId);
            return Result.success(Map.of("id", claim.getId(), "status", claim.getClaimStatus()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    // ── 分配候选人 ──

    @GetMapping("/assign-candidates")
    @Operation(summary = "可被分配的学生列表")
    public Result<?> assignCandidates(@RequestParam Long shelfIndexId,
                                       HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireMinRole(u, RoleEnum.STAFF);
        if (denied != null) return Result.fail(403, denied.getMessage());
        // 后续版本实现：从 AUP → ARO 拉课题组成员列表
        return Result.success(List.of());
    }

    // ── 审批历史 ──

    @GetMapping("/{id}/history")
    @Operation(summary = "认领审批历史")
    public Result<?> history(@PathVariable Long id, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireMinRole(u, RoleEnum.STAFF);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(claimService.getApprovalHistory(id));
    }

    // ── 信息读写（管理端，无归属校验） ──

    @GetMapping("/{id}/info")
    @Operation(summary = "查看认领信息（管理端）")
    public Result<List<Map<String, Object>>> getInfo(@PathVariable Long id,
                                                     HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireMinRole(u, RoleEnum.ADMIN);
        if (denied != null) return Result.fail(403, denied.getMessage());

        CageClaim claim = claimService.getById(id);
        if (claim == null) return Result.fail(404, "认领记录不存在");

        return Result.success(infoService.getInfo(id));
    }

    @PutMapping("/{id}/info")
    @Operation(summary = "保存认领信息（管理端）")
    public Result<List<Map<String, Object>>> updateInfo(@PathVariable Long id,
                                                        @RequestBody Map<String, Object> body,
                                                        HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireMinRole(u, RoleEnum.ADMIN);
        if (denied != null) return Result.fail(403, denied.getMessage());

        CageClaim claim = claimService.getById(id);
        if (claim == null) return Result.fail(404, "认领记录不存在");

        List<Map<String, Object>> values = toMapList(body == null ? null : body.get("values"));
        if (values == null) return Result.fail(400, "values 必填且为数组");

        try {
            return Result.success(infoService.updateInfo(id, values));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    // ── helpers ──

    @SuppressWarnings("unchecked")
    private static <T> Result<T> handleServiceException(Exception e) {
        if (e instanceof com.example.demo.common.exception.TwinBusinessException be) {
            return (Result<T>) Result.fail(be.getCode(), be.getMessage());
        }
        return (Result<T>) Result.error(e.getMessage());
    }

    private static String str(Map<String, Object> m, String k) {
        Object v = m.get(k); return v == null ? null : String.valueOf(v).trim();
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); }
        catch (NumberFormatException e) { return null; }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> toMapList(Object v) {
        if (!(v instanceof List<?> list)) return null;
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> m) {
                out.add((Map<String, Object>) m);
            }
        }
        return out;
    }
}
