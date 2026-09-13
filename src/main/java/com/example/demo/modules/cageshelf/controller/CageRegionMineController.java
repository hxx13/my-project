package com.example.demo.modules.cageshelf.controller;

import com.example.demo.common.dto.Result;
import com.example.demo.common.enums.RoleEnum;
import com.example.demo.common.service.AuthContextService;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.cageshelf.entity.CageRegionGrant;
import com.example.demo.modules.cageshelf.service.CagePermissionService;
import com.example.demo.modules.cageshelf.service.CageRegionCapabilityService;
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
 * 「我的区域」——饲养组长看自己负责的区域、组员，以及配本区域对学生开放的功能。
 *
 * <p>饲养组长是**身份**不是角色（role 可能只是 STAFF），所以读接口（/mine）不设角色门槛，
 * 只要求登录：不是组长的人拿到的是「空区域 + 空组员」而不是 403，页面据此显示空态。
 * 写接口（组员、区域能力）则必须**正好负责那一块**——超管可代管。
 */
@RestController
@RequestMapping("/api/cage-region")
@Tag(name = "我的区域")
public class CageRegionMineController {

    private final AuthContextService authContextService;
    private final CageRegionGrantService regionGrantService;
    private final CagePermissionService permissionService;
    private final PersonIdentityService identityService;
    private final CageRegionCapabilityService regionCapabilityService;

    public CageRegionMineController(AuthContextService authContextService,
                                    CageRegionGrantService regionGrantService,
                                    CagePermissionService permissionService,
                                    PersonIdentityService identityService,
                                    CageRegionCapabilityService regionCapabilityService) {
        this.authContextService = authContextService;
        this.regionGrantService = regionGrantService;
        this.permissionService = permissionService;
        this.identityService = identityService;
        this.regionCapabilityService = regionCapabilityService;
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
        try {
            regionGrantService.replaceMembers(target, ids, u.getId());
        } catch (IllegalArgumentException e) {
            // 「一人只能属于一个饲养组长」这类业务拒绝：必须回 400 带原因，否则前端只看到 500，
            // 组长不知道该把谁删掉。
            return Result.fail(400, e.getMessage());
        }
        return Result.success(Map.of("ok", true));
    }

    /**
     * 「加组员」的候选人：默认只列持有**饲养员**身份的人，每人带全部身份标签，
     * 以及他已被哪位饲养组长纳入（前端据此置灰）。
     *
     * <p>不设角色门槛、非组长返回**空列表**而不是 403 —— 与 {@code /mine} 同口径，
     * 页面据此显示空态，不会因为「不是组长」弹一个红错误。
     *
     * <p>{@code identityCode} 可覆盖默认身份口径，方便别处复用这份查询（例如以后要选兽医入组）。
     */
    @GetMapping("/member-candidates")
    @Operation(summary = "组员候选人（只列饲养员，带身份标签与占用者）")
    public Result<List<Map<String, Object>>> memberCandidates(@RequestParam(required = false) String identityCode,
                                                              HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        if (!isSuperAdmin(u) && regionGrantService.leaderRegions(u.getId()).isEmpty()) {
            return Result.success(List.of());
        }
        return Result.success(regionGrantService.memberCandidates(identityCode));
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
        // 身份默认（矩阵按他身份给的那批）**要单独下发**，不能只给 ceiling：
        // 组员级没配过时系统就是按这批生效的，界面必须照着它默认勾上（见 MemberCapabilityDialog）。
        // 拿 ceiling 顶替会把 LEADER_GRANTABLE 那两项也勾上 —— 等于白送「区域审核」，是越权。
        java.util.Set<String> identityDefaults = new java.util.LinkedHashSet<>(permissionService.identityCeiling(memberAccountId));
        out.put("identityDefaults", identityDefaults);
        // 上限 = 身份默认 ∪ 组长可逐人授予的额外能力（后者不受身份约束，见 LEADER_GRANTABLE）
        java.util.Set<String> ceiling = new java.util.LinkedHashSet<>(identityDefaults);
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
        if (isSuperAdmin(u)) return null;
        if (regionGrantService.leaderRegions(u.getId()).isEmpty()) {
            return "你还不是任何区域的负责人";
        }
        String memberPid = identityService.resolveIdByAccount(memberAccountId);
        boolean mine = memberPid != null && regionGrantService.memberRows(u.getId()).stream()
                .anyMatch(r -> memberPid.equals(str(r.get("memberUserId"))));
        return mine ? null : "该人员不在你的组里";
    }

    // ── 区域级学生能力（该区域的饲养组长配：本区学生能用哪些功能）──

    @GetMapping("/capabilities")
    @Operation(summary = "读某区域开放的学生能力")
    public Result<Map<String, Object>> regionCapabilities(@RequestParam String regionType,
                                                          @RequestParam String regionId,
                                                          HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        String denied = manageRegionError(u, regionType, regionId);
        if (denied != null) return Result.fail(403, denied);
        return Result.success(regionCapabilityService.regionView(regionType, regionId, u.getId(), isSuperAdmin(u)));
    }

    /** body: {@code { "regionType": "ROOM", "regionId": "...", "capabilityCodes": [...] }}，全量替换。 */
    @PutMapping("/capabilities")
    @Operation(summary = "设置某区域开放的学生能力（全量替换，超出矩阵上限会被拒）")
    public Result<?> saveRegionCapabilities(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        User u = authContextService.resolveUserFromBearer(request.getHeader("Authorization"));
        if (u == null) return Result.fail(401, "未登录");
        String regionType = body == null || body.get("regionType") == null ? null : String.valueOf(body.get("regionType"));
        String regionId = body == null || body.get("regionId") == null ? null : String.valueOf(body.get("regionId"));
        if (!StringUtils.hasText(regionType) || !StringUtils.hasText(regionId)) {
            return Result.fail(400, "regionType 与 regionId 必填");
        }
        String denied = manageRegionError(u, regionType, regionId);
        if (denied != null) return Result.fail(403, denied);

        List<String> codes = new ArrayList<>();
        Object raw = body.get("capabilityCodes");
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                if (o != null && StringUtils.hasText(String.valueOf(o))) codes.add(String.valueOf(o));
            }
        }
        try {
            regionCapabilityService.replaceRegionCapabilities(regionType, regionId, codes, u.getId(), isSuperAdmin(u));
            return Result.success(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /**
     * 维护某区域的前置校验：超管放行；否则调用者必须**正好负责这一块区域**（LEADER 行的键一致）。
     * 粒度对齐很重要——超管把区域分到房间级，组长就只能配房间级那一块。
     */
    private String manageRegionError(User u, String regionType, String regionId) {
        if (isSuperAdmin(u)) return null;
        boolean mine = regionGrantService.leaderRegions(u.getId()).stream()
                .anyMatch(g -> regionType.equals(g.getRegionType()) && regionId.equals(g.getRegionId()));
        return mine ? null : "这块区域不由你负责，无法配置";
    }

    /** 超管（SUPER_ADMIN+，含平台管理者）。两处门槛判定共用，别各写一遍。 */
    private static boolean isSuperAdmin(User u) {
        return u != null && u.getRole() != null && u.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel();
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
