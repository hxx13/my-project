package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.identity.dto.IdentityTagVO;
import com.example.demo.modules.identity.service.PersonIdentityService;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 笼架模式可见性服务：单一真相源，前端过滤模式列表 + 后端校验写接口都读它。
 *
 * 两层模型：
 *   数据范围（谁能看到哪些笼架）→ 见 {@link CageRegionGrantService} + 网格过滤。
 *   模式入口（进来后能用哪些模式）→ 本服务，读**身份权限矩阵**（{@link CagePermissionService}）。
 *
 * 矩阵：行 = 身份 code（person_identity_tag），列 = 能力码。
 *   模式能力码 = {@code cage.mode.{modeKey}}；分笼/转移额外操作身份 = {@code cage.op.manage_identities}。
 *   view 恒可见，不占矩阵列。
 * SUPER_ADMIN（含 PLATFORM_OWNER）逃生口：无视身份看全部模式。
 *
 * <p><b>空列语义是 fail-closed</b>（2026-09-15 起）：某能力在矩阵里一个身份都没勾 =
 * 谁也用不了。此前读逗号串配置时是「不配 = 不限制 = 全放开」，方向相反，排查时别搞反。
 */
@Service
public class CageModeVisibilityService {

    /** 教职工视角可配的 8 个模式（view 恒可见，不在此列）。 */
    public static final List<String> STAFF_CONFIGURABLE_MODES = List.of(
            "booking", "allocate", "reserve", "edit", "record", "archive", "confirm", "division");

    /** 分笼/转移的**额外**操作身份能力码（占用者本人恒定放行，不是矩阵列）。 */
    public static final String CAP_OP_MANAGE = "cage.op.manage_identities";

    /**
     * 学生在**状态模式**下被放行的动作：action code → 表单 canonical。
     *
     * <p>目前只有合笼。后续逐批开放时**只改这一张表** —— 后端校验用 canonical
     * （{@link #isStudentEditToggle}），下发给前端过滤渲染用 action code
     * （{@link #studentEditActionCodes}），两边同源不会漂移。
     *
     * <p>学生这条路**不能**走 {@code canUseMode(u,"edit")}：那个判据是身份 code，
     * 而学生也可能带 BREEDER/BREEDING_GROUP_LEADER，会连五个动作一起放开。
     */
    private static final Map<String, String> STUDENT_EDIT_ACTIONS = Map.of(
            "COHABITATION", "needs_cohabitation");

    /** 学生可用的状态动作 code 列表（下发给前端过滤渲染）。 */
    public List<String> studentEditActionCodes() {
        return List.copyOf(STUDENT_EDIT_ACTIONS.keySet());
    }

    /** 该表单 canonical 是否属于学生可用的状态动作。 */
    public boolean isStudentEditToggle(String canonical) {
        return canonical != null && STUDENT_EDIT_ACTIONS.containsValue(canonical);
    }

    /** 模式 key → 对应的矩阵能力码。 */
    public static String modeCapability(String modeKey) {
        return "cage.mode." + modeKey;
    }

    private final CagePermissionService permissionService;
    private final PersonIdentityService identityService;

    public CageModeVisibilityService(CagePermissionService permissionService, PersonIdentityService identityService) {
        this.permissionService = permissionService;
        this.identityService = identityService;
    }

    /** 模式 key → 允许的身份 code 集合（读矩阵）。空集 = 该模式无人可用。 */
    private Map<String, Set<String>> modeAllowedCodes() {
        Map<String, Set<String>> all = permissionService.allowedIdentitiesByCapability();
        Map<String, Set<String>> out = new LinkedHashMap<>();
        for (String mode : STAFF_CONFIGURABLE_MODES) {
            out.put(mode, all.getOrDefault(modeCapability(mode), Set.of()));
        }
        return out;
    }

    /** 当前用户（按账号 id）的身份 code 集合；SUPER_ADMIN 返回空集（调用方按 superAdmin 特判）。 */
    public Set<String> identityCodesOf(String accountId) {
        if (accountId == null || accountId.isBlank()) return Collections.emptySet();
        // 身份表 user_id = personnel.id，而 accountId 是 sys_user.id（staff_id / aro_user_id），
        // 必须先 resolve 到 personnel.id 再查，否则身份永远查不到（getByUser 不 resolve）。
        String pid = identityService.resolveIdByAccount(accountId);
        if (pid == null || pid.isBlank()) return Collections.emptySet();
        return identityService.getByUser(pid).stream()
                .map(IdentityTagVO::getCode)
                .collect(Collectors.toSet());
    }

    /** 是否为超管（逃生口）。 */
    public boolean isSuperAdmin(User user) {
        if (user == null || user.getRole() == null) return false;
        return user.getRole().getLevel() >= RoleEnum.SUPER_ADMIN.getLevel();
    }

    /**
     * 是否学生视角 — 笼架域唯一判定口径：account_source = STUDENT。
     * 三端前端用 isStudentAccount()（按同一字段二分），后端只有这一处，改口径必须同步。
     */
    public boolean isStudent(User user) {
        return user != null && user.getAccountSource() != null
                && "STUDENT".equalsIgnoreCase(user.getAccountSource());
    }

    /** 分笼/转移允许的**额外**操作身份 code 集合（占用者本人恒定放行，不在矩阵里）。 */
    public Set<String> opManageCodes() {
        return permissionService.allowedIdentitiesByCapability()
                .getOrDefault(CAP_OP_MANAGE, Set.of());
    }

    /** 是否为分笼/转移的「额外操作身份」（饲养员/饲养组长等，见矩阵列 cage.op.manage_identities）。 */
    public boolean isOpExtraOperator(User user) {
        if (user == null) return false;
        if (isSuperAdmin(user)) return true;
        // fail-closed：该列一个身份都没勾 = 除占用者本人外无人可操作。
        // （旧配置语义是「未配置 = 不限制」，方向相反。）
        return permissionService.canUse(CAP_OP_MANAGE, identityCodesOf(user.getId()));
    }

    /**
     * 能否对该笼位执行分笼/转移。
     * 额外操作身份放行；否则须是占用者本人（认领记录或实验员姓名任一匹配）。
     */
    public boolean canOperateCage(User user, String occupantAccountId) {
        if (user == null) return false;
        if (isOpExtraOperator(user)) return true;
        return occupantAccountId != null && occupantAccountId.equals(user.getId());
    }

    /** 教职工视角下，某模式是否允许该用户使用。view 恒 true。 */
    public boolean canUseMode(User user, String modeKey) {
        if ("view".equals(modeKey)) return true;
        if (isSuperAdmin(user)) return true;
        return permissionService.canUse(modeCapability(modeKey), identityCodesOf(user.getId()));
    }

    /** 教职工视角可见模式 key 列表（含恒可见的 view）。 */
    public List<String> visibleStaffModes(User user) {
        if (isSuperAdmin(user)) {
            LinkedHashSet<String> all = new LinkedHashSet<>();
            all.add("view");
            all.addAll(STAFF_CONFIGURABLE_MODES);
            return List.copyOf(all);
        }
        Set<String> mine = identityCodesOf(user.getId());
        Map<String, Set<String>> allowed = modeAllowedCodes();
        List<String> out = new java.util.ArrayList<>();
        out.add("view");
        for (String mode : STAFF_CONFIGURABLE_MODES) {
            Set<String> codes = allowed.get(mode);
            // fail-closed：空列不再放行（旧语义是「未配置 = 不限制」）。
            if (codes != null && !codes.isEmpty() && !Collections.disjoint(codes, mine)) {
                out.add(mode);
            }
        }
        return out;
    }
}
