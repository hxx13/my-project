package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageClaim;
import com.example.demo.modules.cageshelf.service.CageOperationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 笼位操作（分笼 / 转移笼位）—— 三端通用接口。
 * 权限与审核由服务按「身份 + 分笼/转移两个独立审核开关」分流，前端不做视角判断。
 */
@RestController
@RequestMapping("/api/cage-op")
@Tag(name = "笼位操作（分笼/转移）")
public class CageOperationController {

    private static final Logger log = LoggerFactory.getLogger(CageOperationController.class);

    private final AuthContextService authContextService;
    private final CageOperationService opService;

    public CageOperationController(AuthContextService authContextService, CageOperationService opService) {
        this.authContextService = authContextService;
        this.opService = opService;
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

    @GetMapping("/targets")
    @Operation(summary = "分笼/转移的目标笼位候选池（默认全库按课题组过滤；shelfIndexId 可收窄到某笼架）")
    public Result<List<Map<String, Object>>> targets(@RequestParam Long sourceAnimalCageId,
                                                     @RequestParam(required = false) Long shelfIndexId,
                                                     HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        try {
            return Result.success(opService.targets(u, sourceAnimalCageId, shelfIndexId));
        } catch (Exception e) {
            return handle(e);
        }
    }

    @GetMapping("/operable")
    @Operation(summary = "该笼位当前用户能否分笼/转移（前端据此决定显示入口按钮还是「先认领」提示）")
    public Result<Map<String, Object>> operable(@RequestParam Long animalCageId, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        return Result.success(opService.operableInfo(u, animalCageId));
    }

    @GetMapping("/editable")
    @Operation(summary = "该笼位当前用户能否编辑表单值（前端据此决定表单是否可编辑）")
    public Result<Map<String, Object>> editable(@RequestParam Long animalCageId, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        try {
            return Result.success(opService.cageEditInfo(u, animalCageId));
        } catch (Exception e) {
            // 不能让它裸抛：前端只拿到 500 → 按钮消失且连 reason 都没有，用户无从判断是权限问题还是服务异常
            return handle(e);
        }
    }

    @GetMapping("/field-options")
    @Operation(summary = "动态字段选项（按笼位现算，候选源由字段 config.optionsSource 决定）")
    public Result<Map<String, Object>> fieldOptions(@RequestParam Long animalCageId,
                                                    @RequestParam String canonical,
                                                    HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        try {
            return Result.success(opService.fieldOptions(u, animalCageId, canonical));
        } catch (Exception e) {
            return handle(e);
        }
    }

    @PostMapping("/field-option")
    @Operation(summary = "新增字段预设（落点=AUP 白名单或笼位域码表，返回刷新后的选项）")
    public Result<Map<String, Object>> addFieldOption(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        try {
            Long animalCageId = toLong(body == null ? null : body.get("animalCageId"));
            if (animalCageId == null) return Result.fail(400, "animalCageId 必填");
            String canonical = str(body, "canonical");
            if (canonical == null || canonical.isBlank()) return Result.fail(400, "canonical 必填");
            return Result.success(opService.addFieldOption(u, animalCageId, canonical, str(body, "label")));
        } catch (Exception e) {
            return handle(e);
        }
    }

    @PostMapping("/claim")
    @Operation(summary = "一键认领：把本人认领为该笼位实验员（限本课题组，直接生效）")
    public Result<Map<String, Object>> claim(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        try {
            Long animalCageId = toLong(body == null ? null : body.get("animalCageId"));
            if (animalCageId == null) return Result.fail(400, "animalCageId 必填");
            CageClaim claim = opService.claimAsOwner(u, animalCageId);
            return Result.success(Map.of("claimId", String.valueOf(claim.getId()), "status", claim.getClaimStatus()));
        } catch (Exception e) {
            return handle(e);
        }
    }

    @PostMapping("/claim-on-behalf")
    @Operation(summary = "代认领：教职工给本课题组某人认领该笼位（支持覆盖已有认领）")
    public Result<Map<String, Object>> claimOnBehalf(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        try {
            Long animalCageId = toLong(body == null ? null : body.get("animalCageId"));
            if (animalCageId == null) return Result.fail(400, "animalCageId 必填");
            CageClaim claim = opService.claimOnBehalf(u, animalCageId, str(body, "accountId"));
            return Result.success(Map.of(
                    "claimId", String.valueOf(claim.getId()),
                    "status", claim.getClaimStatus(),
                    "claimantName", claim.getClaimantName() == null ? "" : claim.getClaimantName()));
        } catch (Exception e) {
            return handle(e);
        }
    }

    @PostMapping("/divide")
    @Operation(summary = "分笼：把源笼位拆分为多个目标笼位")
    public Result<Map<String, Object>> divide(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        try {
            Long sourceId = toLong(body.get("sourceAnimalCageId"));
            if (sourceId == null) return Result.fail(400, "sourceAnimalCageId 必填");
            List<Long> targets = toLongList(body.get("targetAnimalCageIds"));
            boolean keepSource = body.get("keepSource") instanceof Boolean b
                    ? b : "true".equalsIgnoreCase(String.valueOf(body.get("keepSource")));
            return Result.success(opService.submitDivide(u, sourceId, targets, keepSource, str(body, "reason")));
        } catch (Exception e) {
            return handle(e);
        }
    }

    @PostMapping("/transfer")
    @Operation(summary = "转移笼位：把源笼位的占用整体迁到目标笼位")
    public Result<Map<String, Object>> transfer(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        try {
            Long from = toLong(body.get("fromAnimalCageId"));
            Long to = toLong(body.get("toAnimalCageId"));
            return Result.success(opService.submitTransfer(u, from, to, str(body, "reason")));
        } catch (Exception e) {
            return handle(e);
        }
    }

    @GetMapping("/pending")
    @Operation(summary = "待审列表（按审核人归属过滤）")
    public Result<List<Map<String, Object>>> pending(@RequestParam(required = false) String opType,
                                                     HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        return Result.success(opService.pending(u, opType));
    }

    @GetMapping("/markers")
    @Operation(summary = "待审中间态（网格/详情画「分笼审核中」「转移审核中」）；学生只看自己的，教职工看全部")
    public Result<List<Map<String, Object>>> markers(HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        return Result.success(opService.pendingMarkers(u));
    }

    @GetMapping("/reviewed")
    @Operation(summary = "我审过的分笼/转移（审核页「已审核」历史区）")
    public Result<List<Map<String, Object>>> reviewed(@RequestParam(defaultValue = "100") int limit,
                                                      HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        return Result.success(opService.reviewed(u, limit));
    }

    @GetMapping("/my")
    @Operation(summary = "我提交的分笼/转移请求")
    public Result<List<Map<String, Object>>> my(@RequestParam(required = false) String status,
                                                HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        return Result.success(opService.my(u, status));
    }

    @PostMapping("/{id}/approve")
    @Operation(summary = "审批分笼/转移请求")
    public Result<Map<String, Object>> approve(@PathVariable Long id,
                                               @RequestBody Map<String, Object> body,
                                               HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        try {
            String decision = str(body, "decision");
            if (decision == null || decision.isBlank()) return Result.fail(400, "decision 必填");
            return Result.success(opService.review(u, id, decision, str(body, "reason")));
        } catch (Exception e) {
            return handle(e);
        }
    }

    @PostMapping("/{id}/cancel")
    @Operation(summary = "撤销自己提交的待审请求")
    public Result<Map<String, Object>> cancel(@PathVariable Long id,
                                              @RequestBody(required = false) Map<String, Object> body,
                                              HttpServletRequest req) {
        User u = resolveUser(req);
        Result<?> denied = requireLogin(u);
        if (denied != null) return Result.fail(401, denied.getMessage());
        try {
            return Result.success(opService.cancel(u, id, str(body, "reason")));
        } catch (Exception e) {
            return handle(e);
        }
    }

    // ── helpers ──

    @SuppressWarnings("unchecked")
    private static <T> Result<T> handle(Exception e) {
        if (e instanceof TwinBusinessException be) {
            return (Result<T>) Result.fail(be.getCode(), be.getMessage());
        }
        log.warn("[cage-op] 操作失败: {}", e.getMessage(), e);
        return (Result<T>) Result.error(e.getMessage() == null ? "操作失败" : e.getMessage());
    }

    private static String str(Map<String, Object> m, String k) {
        if (m == null) return null;
        Object v = m.get(k);
        return v == null ? null : String.valueOf(v).trim();
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static List<Long> toLongList(Object v) {
        if (!(v instanceof List<?> list)) return null;
        List<Long> out = new ArrayList<>();
        for (Object item : list) {
            Long l = toLong(item);
            if (l != null) out.add(l);
        }
        return out;
    }
}
