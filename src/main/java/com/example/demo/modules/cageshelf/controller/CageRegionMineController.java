package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageRegionGrant;
import com.example.demo.modules.cageshelf.service.CagePermissionService;
import com.example.demo.modules.cageshelf.service.CageRegionGrantService;
import com.example.demo.modules.identity.service.PersonIdentityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 「我的区域」——饲养组长看自己负责的区域与组员。**只读**。
 *
 * <p>饲养组长是**身份**不是角色（role 可能只是 STAFF），所以这个接口不设角色门槛，
 * 只要求登录：不是组长的人拿到的是「空区域 + 空组员」而不是 403，页面据此显示空态。
 * 组员的纳入/移出与逐人勾权限属第四期 B。
 */
@RestController
@RequestMapping("/api/cage-region")
@Tag(name = "我的区域")
public class CageRegionMineController {

    private final AuthContextService authContextService;
    private final CageRegionGrantService regionGrantService;
    private final CagePermissionService permissionService;
    private final PersonIdentityService identityService;

    public CageRegionMineController(AuthContextService authContextService,
                                    CageRegionGrantService regionGrantService,
                                    CagePermissionService permissionService,
                                    PersonIdentityService identityService) {
        this.authContextService = authContextService;
        this.regionGrantService = regionGrantService;
        this.permissionService = permissionService;
        this.identityService = identityService;
    }

    @GetMapping("/mine")
    @Operation(summary = "我负责的区域与我的组员")
    public Result<Map<String, Object>> mine(HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");

        List<Map<String, Object>> regions = new ArrayList<>();
        for (CageRegionGrant g : regionGrantService.leaderRegions(u.getId())) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("regionType", g.getRegionType());
            m.put("regionId", g.getRegionId());
            regions.add(m);
        }

        // 组员姓名由 SQL join personnel 出（user_id 是 personnel.id，不能交给
        // UserDisplayNameService——它按 staff_id/aro_user_id 建索引，二期踩过这个回归）。
        List<Map<String, Object>> members = new ArrayList<>();
        for (Map<String, Object> row : regionGrantService.memberRows(u.getId())) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("memberUserId", str(row.get("memberUserId")));
            m.put("memberName", str(row.get("memberName")));
            // 必须带上：前端拿它去调 member-capabilities（接口收的是账号 id），少了它子弹窗永远加载中
            m.put("memberAccountId", str(row.get("memberAccountId")));
            m.put("regionCount", row.get("regionCount"));
            members.add(m);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("regions", regions);
        out.put("members", members);
        out.put("isLeader", !regions.isEmpty());
        return Result.success(out);
    }

    /**
     * 设置本组组员（**全量替换**）。body: {@code { "memberAccountIds": ["STAFF_xxx", ...] }}。
     *
     * <p>权限（设计 5.2：MEMBER 行组长写本组、超管写全部）：
     * 超管可代管任何组（传 leaderAccountId）；非超管只能维护**自己的**组，且必须真的持有 LEADER 行。
     */
    @PutMapping("/members")
    @Operation(summary = "设置本组组员（全量替换）")
    public Result<?> replaceMembers(@RequestParam(required = false) String leaderAccountId,
                                    @RequestBody Map<String, Object> body,
                                    HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");

        boolean superAdmin = u.getRole() != null && u.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel();
        String target = StringUtils.hasText(leaderAccountId) ? leaderAccountId : u.getId();
        if (!target.equals(u.getId()) && !superAdmin) {
            return Result.fail(403, "只能维护自己组的组员");
        }
        // 非超管维护自己的组：必须先真的是组长（有 LEADER 行），否则任何人都能凭空建组
        if (!superAdmin && regionGrantService.leaderRegions(u.getId()).isEmpty()) {
            return Result.fail(403, "你还不是任何区域的负责人，无法维护组员");
        }

        List<String> ids = new ArrayList<>();
        Object raw = body == null ? null : body.get("memberAccountIds");
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o != null && StringUtils.hasText(String.valueOf(o))) ids.add(String.valueOf(o));
            }
        }
        regionGrantService.replaceMembers(target, ids, u.getId());
        return Result.success(Map.of("ok", true));
    }

    /**
     * 读某组员的可配范围与当前勾选：`ceiling` 是他的**身份上限**（矩阵里他这些身份能用的能力），
     * `granted` 是组长已经勾的。界面据此渲染勾选框并把超上限的选项置灰。
     */
    @GetMapping("/member-capabilities")
    @Operation(summary = "读某组员的身份上限与已勾选能力")
    public Result<Map<String, Object>> memberCapabilities(@RequestParam String memberAccountId,
                                                          HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        String denied = manageMemberError(u, memberAccountId);
        if (denied != null) return Result.fail(403, denied);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("granted", permissionService.memberCapabilities(memberAccountId));
        // 上限 = 身份矩阵允许的 ∪ 组长可逐人授予的额外能力（后者不受身份约束，见 LEADER_GRANTABLE）
        java.util.Set<String> ceiling = new java.util.LinkedHashSet<>(permissionService.identityCeiling(memberAccountId));
        ceiling.addAll(CagePermissionService.LEADER_GRANTABLE);
        out.put("ceiling", ceiling);
        // 标签一并下发：矩阵接口是超管专属，组长拿不到，总不能在前端再抄一份模式名
        Map<String, String> labels = new LinkedHashMap<>();
        for (var c : permissionService.listCapabilities()) labels.put(c.getCode(), c.getLabel());
        out.put("labels", labels);
        return Result.success(out);
    }

    /** body: {@code { "memberAccountId": "...", "capabilityCodes": ["cage.mode.edit", ...] }}，全量替换。 */
    @PutMapping("/member-capabilities")
    @Operation(summary = "设置某组员的能力（全量替换，超出身份上限会被拒）")
    public Result<?> saveMemberCapabilities(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        String memberAccountId = body == null || body.get("memberAccountId") == null
                ? null : String.valueOf(body.get("memberAccountId"));
        if (!StringUtils.hasText(memberAccountId)) return Result.fail(400, "memberAccountId 必填");
        String denied = manageMemberError(u, memberAccountId);
        if (denied != null) return Result.fail(403, denied);

        List<String> codes = new ArrayList<>();
        Object raw = body.get("capabilityCodes");
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o != null && StringUtils.hasText(String.valueOf(o))) codes.add(String.valueOf(o));
            }
        }
        try {
            permissionService.replaceMemberCapabilities(memberAccountId, codes, u.getId());
            return Result.success(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /**
     * 维护某组员能力的前置校验：超管放行；否则调用者必须是**该组员所在组的组长**。
     * 不能只查「调用者是不是组长」——那样任一组长都能改别人组的组员。
     * @return null = 放行；否则为拒绝原因
     */
    private String manageMemberError(User u, String memberAccountId) {
        boolean superAdmin = u.getRole() != null && u.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel();
        if (superAdmin) return null;
        if (regionGrantService.leaderRegions(u.getId()).isEmpty()) {
            return "你还不是任何区域的负责人";
        }
        String memberPid = identityService.resolveIdByAccount(memberAccountId);
        boolean mine = memberPid != null && regionGrantService.memberRows(u.getId()).stream()
                .anyMatch(r -> memberPid.equals(str(r.get("memberUserId"))));
        return mine ? null : "该人员不在你的组里";
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
