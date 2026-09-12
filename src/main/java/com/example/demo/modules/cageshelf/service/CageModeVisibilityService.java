package com.example.demo.modules.cageshelf.service;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.identity.dto.IdentityTagVO;
import com.example.demo.modules.identity.service.PersonIdentityService;
import com.example.demo.modules.notification.service.NotificationSettingsService;
import org.springframework.stereotype.Service;

import java.util.Arrays;
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
 *   数据范围（谁能看到哪些笼架）→ 见 {@link PersonScopeService} + 网格过滤。
 *   模式入口（进来后能用哪些模式）→ 本服务，按身份 code 可配。
 *
 * 模式与默认身份（配置模块 cage_mode，key = cage.mode.{modeKey}，值为逗号分隔身份 code）：
 *   booking=SECRETARY, allocate=reserve=BREEDING_GROUP_LEADER,
 *   edit/record/archive/confirm=BREEDER,BREEDING_GROUP_LEADER；division=GROUP_STEWARD；view 恒可见不可配。
 * SUPER_ADMIN（含 PLATFORM_OWNER）逃生口：无视身份看全部模式。
 */
@Service
public class CageModeVisibilityService {

    public static final String MODULE = "cage_mode";

    /** 教职工视角可配的 8 个模式（view 恒可见，不在此列）。 */
    public static final List<String> STAFF_CONFIGURABLE_MODES = List.of(
            "booking", "allocate", "reserve", "edit", "record", "archive", "confirm", "division");

    /** 身份 code 稳定值（与 PersonIdentityTagSeedBootstrap 种子一致）。 */
    public static final String CODE_BREEDER = "BREEDER";
    public static final String CODE_LEADER = "BREEDING_GROUP_LEADER";
    public static final String CODE_SECRETARY = "SECRETARY";
    public static final String CODE_STEWARD = "GROUP_STEWARD";

    /** 分笼/转移的**额外**操作身份配置：值为逗号分隔身份 code（占用者本人恒定放行，不在此列）。 */
    public static final String KEY_OP_MANAGE = "cage.op.manage_identities";
    public static final String DEFAULT_OP_MANAGE = CODE_BREEDER + "," + CODE_LEADER;

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

    private static final Map<String, String> DEFAULTS = Map.of(
            "booking", CODE_SECRETARY,
            "allocate", CODE_LEADER,
            "reserve", CODE_LEADER,
            "edit", CODE_BREEDER + "," + CODE_LEADER,
            "record", CODE_BREEDER + "," + CODE_LEADER,
            "archive", CODE_BREEDER + "," + CODE_LEADER,
            "confirm", CODE_BREEDER + "," + CODE_LEADER,
            "division", CODE_STEWARD);

    private final NotificationSettingsService settingsService;
    private final PersonIdentityService identityService;

    public CageModeVisibilityService(NotificationSettingsService settingsService, PersonIdentityService identityService) {
        this.settingsService = settingsService;
        this.identityService = identityService;
    }

    /** 模式 key → 允许的身份 code 集合（读配置，逗号分隔）。 */
    public Map<String, Set<String>> modeAllowedCodes() {
        Map<String, Set<String>> out = new LinkedHashMap<>();
        for (String mode : STAFF_CONFIGURABLE_MODES) {
            String raw = settingsService.getEffectiveValue(MODULE, "cage.mode." + mode, DEFAULTS.getOrDefault(mode, ""));
            out.put(mode, splitCodes(raw));
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

    /** 分笼/转移允许的**额外**操作身份 code 集合（占用者本人恒定放行，不在配置里）。 */
    public Set<String> opManageCodes() {
        return splitCodes(settingsService.getEffectiveValue(MODULE, KEY_OP_MANAGE, DEFAULT_OP_MANAGE));
    }

    /** 是否为分笼/转移的「额外操作身份」（饲养员/饲养组长等，配置见 cage.op.manage_identities）。 */
    public boolean isOpExtraOperator(User user) {
        if (user == null) return false;
        if (isSuperAdmin(user)) return true;
        Set<String> allowed = opManageCodes();
        if (allowed.isEmpty()) return true; // 未配置 = 不限制
        return !Collections.disjoint(allowed, identityCodesOf(user.getId()));
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
        Map<String, Set<String>> allowed = modeAllowedCodes();
        Set<String> codes = allowed.get(modeKey);
        if (codes == null || codes.isEmpty()) return true; // 未配置 = 不限制
        Set<String> mine = identityCodesOf(user.getId());
        return !Collections.disjoint(codes, mine);
    }

    /** 教职工视角可见模式 key 列表（含恒可见的 view）。 */    public List<String> visibleStaffModes(User user) {
        if (isSuperAdmin(user)) {
            LinkedHashSet<String> all = new LinkedHashSet<>();
            all.add("view");
            all.addAll(STAFF_CONFIGURABLE_MODES);
            return List.copyOf(all);
        }
        Set<String> mine = identityCodesOf(user.getId());
        List<String> out = new java.util.ArrayList<>();
        out.add("view");
        for (String mode : STAFF_CONFIGURABLE_MODES) {
            Set<String> allowed = modeAllowedCodes().get(mode);
            if (allowed == null || allowed.isEmpty() || !Collections.disjoint(allowed, mine)) {
                out.add(mode);
            }
        }
        return out;
    }

    private Set<String> splitCodes(String raw) {
        if (raw == null || raw.isBlank()) return Collections.emptySet();
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }
}
