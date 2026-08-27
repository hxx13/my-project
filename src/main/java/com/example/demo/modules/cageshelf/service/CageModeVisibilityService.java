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
 *   edit/record/archive/confirm=BREEDER,BREEDING_GROUP_LEADER；view 恒可见不可配。
 * SUPER_ADMIN（含 PLATFORM_OWNER）逃生口：无视身份看全部模式。
 */
@Service
public class CageModeVisibilityService {

    public static final String MODULE = "cage_mode";

    /** 教职工视角可配的 7 个模式（view 恒可见，不在此列）。 */
    public static final List<String> STAFF_CONFIGURABLE_MODES = List.of(
            "booking", "allocate", "reserve", "edit", "record", "archive", "confirm");

    /** 身份 code 稳定值（与 PersonIdentityTagSeedBootstrap 种子一致）。 */
    public static final String CODE_BREEDER = "BREEDER";
    public static final String CODE_LEADER = "BREEDING_GROUP_LEADER";
    public static final String CODE_SECRETARY = "SECRETARY";

    private static final Map<String, String> DEFAULTS = Map.of(
            "booking", CODE_SECRETARY,
            "allocate", CODE_LEADER,
            "reserve", CODE_LEADER,
            "edit", CODE_BREEDER + "," + CODE_LEADER,
            "record", CODE_BREEDER + "," + CODE_LEADER,
            "archive", CODE_BREEDER + "," + CODE_LEADER,
            "confirm", CODE_BREEDER + "," + CODE_LEADER);

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

    /** 教职工视角可见模式 key 列表（含恒可见的 view）。 */
    public List<String> visibleStaffModes(User user) {
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
