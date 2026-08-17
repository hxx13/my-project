package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.service.CageClaimService;
import com.example.demo.modules.identity.service.PersonIdentityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;

/**
 * 学生端笼位申请 API。
 */
@RestController
@RequestMapping("/api/student/cage-claims")
@Tag(name = "学生笼位申请")
public class StudentCageClaimController {

    private static final Logger log = LoggerFactory.getLogger(StudentCageClaimController.class);

    private final AuthContextService authContextService;
    private final CageClaimService claimService;
    private final PersonIdentityService personIdentityService;

    public StudentCageClaimController(AuthContextService authContextService,
                                       CageClaimService claimService,
                                       PersonIdentityService personIdentityService) {
        this.authContextService = authContextService;
        this.claimService = claimService;
        this.personIdentityService = personIdentityService;
    }

    private User resolveUser(HttpServletRequest req) {
        User u = authContextService.resolveUserFromBearer(req.getHeader("Authorization"));
        if (u == null) return null;
        if (u.getRole() == null) u.setRole(RoleEnum.MEMBER);
        return u;
    }

    private Result<?> requireLogin(User u) {
        if (u == null) return Result.error("未登录");
        if (u.getStatus() != null && u.getStatus() == 0) return Result.error("账号已禁用");
        return null;
    }

    /** 审批人 = 组长（GROUP_LEADER）或管理员。学生端审批入口（组长看待审/审批本组申请）。 */
    private Result<?> requireApprover(User u) {
        if (u == null) return Result.error("未登录");
        if (u.getStatus() != null && u.getStatus() == 0) return Result.error("账号已禁用");
        if (u.getRole() != null && u.getRole().getLevel() >= RoleEnum.ADMIN.getLevel()) return null;
        if (personIdentityService.isPi(u.getId())) return null;
        return Result.error("无审批权限（仅组长或管理员）");
    }

    // ── 池查询 ──

    @GetMapping("/pool")
    @Operation(summary = "查看池中可用笼位")
    public Result<List<Map<String, Object>>> pool(@RequestParam Long shelfIndexId,
                                                    HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        return Result.success(claimService.getPoolCells(shelfIndexId));
    }

    // ── 认领 ──

    @PostMapping
    @Operation(summary = "申请笼位")
    public Result<Map<String, Object>> claim(@RequestBody Map<String, Object> body,
                                              HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());

        Long animalCageId = toLong(body.get("animalCageId"));
        Long shelfIndexId = toLong(body.get("shelfIndexId"));
        if (animalCageId == null || shelfIndexId == null)
            return Result.fail(400, "animalCageId 和 shelfIndexId 必填");

        try {
            CageClaim claim = claimService.claim(u, animalCageId, shelfIndexId);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", claim.getId());
            result.put("animalCageId", claim.getAnimalCageId());
            result.put("status", claim.getClaimStatus());
            result.put("needApproval", "pending_approval".equals(claim.getClaimStatus()));
            return Result.success(result);
        } catch (Exception e) {
            log.warn("[student-claim] 认领失败: {}", e.getMessage());
            String msg = e.getMessage();
            if (e instanceof com.example.demo.common.exception.TwinBusinessException be) {
                return Result.fail(be.getCode(), be.getMessage());
            }
            return Result.error(msg != null ? msg : "认领失败");
        }
    }

    // ── 取消 ──

    @PostMapping("/{id}/cancel")
    @Operation(summary = "取消笼位申请")
    public Result<Map<String, Object>> cancel(@PathVariable Long id,
                                               HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());

        try {
            CageClaim claim = claimService.cancel(u, id);
            return Result.success(Map.of("id", claim.getId(), "status", claim.getClaimStatus()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    // ── 到场确认 ──

    @PostMapping("/{id}/confirm")
    @Operation(summary = "到场确认（幂等）")
    public Result<Map<String, Object>> confirm(@PathVariable Long id,
                                                HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());

        try {
            CageClaim claim = claimService.confirm(u, id);
            return Result.success(Map.of("id", claim.getId(), "status", claim.getClaimStatus()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    // ── 释放 ──

    @PostMapping("/{id}/release")
    @Operation(summary = "释放笼位")
    public Result<Map<String, Object>> release(@PathVariable Long id,
                                                @RequestBody(required = false) Map<String, Object> body,
                                                HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());

        String reason = body != null ? str(body, "reason") : null;
        try {
            CageClaim claim = claimService.release(u, id, reason);
            return Result.success(Map.of("id", claim.getId(), "status", claim.getClaimStatus()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    // ── 转移 ──

    @PostMapping("/{id}/transfer")
    @Operation(summary = "转移笼位归属")
    public Result<Map<String, Object>> transfer(@PathVariable Long id,
                                                 @RequestBody Map<String, Object> body,
                                                 HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());

        String toStudentUserId = str(body, "toStudentUserId");
        String reason = str(body, "reason");
        if (toStudentUserId == null || toStudentUserId.isBlank())
            return Result.fail(400, "toStudentUserId 必填");

        try {
            CageClaim claim = claimService.transfer(u, id, toStudentUserId, reason);
            return Result.success(Map.of("id", claim.getId(), "status", claim.getClaimStatus()));
        } catch (Exception e) {
            return handleServiceException(e);
        }
    }

    // ── 我的认领 ──

    @GetMapping("/my")
    @Operation(summary = "我的申请列表")
    public Result<List<CageClaim>> my(@RequestParam(required = false) String status,
                                       HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        return Result.success(claimService.getMyClaims(u.getId(), status));
    }

    // ── 组长审批（学生端审批入口）──

    @GetMapping("/pending")
    @Operation(summary = "组长看待审批列表（学生端审批入口）")
    public Result<Map<String, Object>> pending(@RequestParam(required = false) String status,
                                                @RequestParam(required = false) String keyword,
                                                @RequestParam(defaultValue = "1") int page,
                                                @RequestParam(defaultValue = "20") int pageSize,
                                                HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireApprover(u);
        if (denied != null) return Result.fail(403, denied.getMessage());
        return Result.success(claimService.getPendingList(status, keyword, page, pageSize));
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "组长审批申请/释放（学生端审批入口）")
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
}
