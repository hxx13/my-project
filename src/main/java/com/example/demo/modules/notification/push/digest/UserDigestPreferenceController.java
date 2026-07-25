package com.example.demo.modules.notification.push.digest;

import com.example.demo.common.config.ApiAuthInterceptor;
import com.example.demo.common.dto.Result;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.notification.push.source.NotifySource;
import com.example.demo.modules.notification.push.source.NotifySourceService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/user/digest-preference")
public class UserDigestPreferenceController {

    private final UserDigestPreferenceMapper userPrefMapper;
    private final NotifyDigestDefaultConfigMapper defaultConfigMapper;
    private final NotifySourceService sourceService;

    public UserDigestPreferenceController(UserDigestPreferenceMapper userPrefMapper,
                                          NotifyDigestDefaultConfigMapper defaultConfigMapper,
                                          NotifySourceService sourceService) {
        this.userPrefMapper = userPrefMapper;
        this.defaultConfigMapper = defaultConfigMapper;
        this.sourceService = sourceService;
    }

    /** 返回所有通知源 + 当前用户的聚合偏好 + 默认配置（合并视图） */
    @GetMapping("/sources")
    public Result<List<Map<String, Object>>> listSourcesWithConfig(HttpServletRequest request) {
        String uid = currentUserId(request);
        if (uid == null) return Result.error("未登录");
        List<NotifySource> sources = sourceService.listAll();
        List<UserDigestPreference> prefs = userPrefMapper.findByUserId(uid);
        Map<String, UserDigestPreference> prefMap = new LinkedHashMap<>();
        for (UserDigestPreference p : prefs) prefMap.put(p.getSourceCode(), p);
        List<NotifyDigestDefaultConfig> defaults = defaultConfigMapper.findAll();
        Map<String, NotifyDigestDefaultConfig> defMap = new LinkedHashMap<>();
        for (NotifyDigestDefaultConfig d : defaults) defMap.put(d.getSourceCode(), d);

        List<Map<String, Object>> result = new ArrayList<>();
        for (NotifySource src : sources) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("sourceCode", src.getSourceCode());
            row.put("sourceName", src.getSourceName());
            row.put("description", src.getDescription());
            row.put("sourceEnabled", src.getEnabled() != null && src.getEnabled() == 1);
            UserDigestPreference pref = prefMap.get(src.getSourceCode());
            NotifyDigestDefaultConfig def = defMap.get(src.getSourceCode());
            row.put("hasDefault", def != null);
            row.put("defaultConfig", def);
            row.put("hasPreference", pref != null);
            row.put("preference", pref);
            // 有效模式
            String mode = "INSTANT";
            String schedule = null;
            String overflow = "ROLL_OVER";
            String days = null;
            Integer interval = null;
            if (pref != null && pref.getEnabled() != null && pref.getEnabled() == 1 && pref.getDigestMode() != null) {
                mode = pref.getDigestMode();
                schedule = pref.getScheduleTimes();
                overflow = pref.getOverflowStrategy();
                days = pref.getScheduleDays();
                interval = pref.getHourlyInterval();
            } else if (pref != null && pref.getEnabled() != null && pref.getEnabled() == 0) {
                mode = "INSTANT";
            } else if (def != null && def.getEnabled() != null && def.getEnabled() == 1 && def.getDigestMode() != null) {
                mode = def.getDigestMode();
                schedule = def.getScheduleTimes();
                overflow = def.getOverflowStrategy();
                days = def.getScheduleDays();
                interval = def.getHourlyInterval();
            }
            row.put("effectiveMode", mode);
            row.put("effectiveSchedule", schedule);
            row.put("effectiveOverflow", overflow);
            row.put("effectiveDays", days);
            row.put("effectiveInterval", interval);
            // Night mode: resolve from pref → default
            Integer nightEnabled = null;
            String nightStart = null, nightEnd = null;
            if (pref != null && pref.getNightModeEnabled() != null) {
                nightEnabled = pref.getNightModeEnabled();
                nightStart = pref.getNightStart();
                nightEnd = pref.getNightEnd();
            } else if (def != null) {
                nightEnabled = def.getNightModeEnabled();
                nightStart = def.getNightStart();
                nightEnd = def.getNightEnd();
            }
            row.put("nightModeEnabled", nightEnabled != null ? nightEnabled : 0);
            row.put("nightStart", nightStart);
            row.put("nightEnd", nightEnd);
            result.add(row);
        }
        return Result.success(result);
    }

    private String currentUserId(HttpServletRequest request) {
        Object attr = request.getAttribute(ApiAuthInterceptor.CURRENT_USER_ATTR);
        if (attr instanceof User user) return user.getId();
        return null;
    }

    @GetMapping
    public Result<List<UserDigestPreference>> listMine(HttpServletRequest request) {
        String uid = currentUserId(request);
        if (uid == null) return Result.error("未登录");
        return Result.success(userPrefMapper.findByUserId(uid));
    }

    @PutMapping
    public Result<Void> upsert(@RequestBody UserDigestPreference pref, HttpServletRequest request) {
        String uid = currentUserId(request);
        if (uid == null) return Result.error("未登录");
        pref.setUserId(uid);
        userPrefMapper.upsert(pref);
        return Result.success();
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id, HttpServletRequest request) {
        String uid = currentUserId(request);
        if (uid == null) return Result.error("未登录");
        // 仅允许删除自己的偏好
        UserDigestPreference existing = userPrefMapper.findByUserId(uid).stream()
                .filter(p -> p.getId().equals(id)).findFirst().orElse(null);
        if (existing == null) return Result.error("偏好不存在或无权操作");
        userPrefMapper.delete(id);
        return Result.success();
    }
}
