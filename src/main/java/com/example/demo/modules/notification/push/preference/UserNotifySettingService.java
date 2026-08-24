package com.example.demo.modules.notification.push.preference;

import com.example.demo.modules.notification.push.PushConstants;
import com.example.demo.modules.notification.push.source.NotifySource;
import com.example.demo.modules.notification.push.source.NotifySourceMapper;
import com.example.demo.modules.personnel.service.PersonnelService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 个人通知偏好服务。
 * 自动同步 notify_source 表的所有源，合并用户的 user_notify_mute 设置。
 */
@Service
public class UserNotifySettingService {

    private static final Logger log = LoggerFactory.getLogger(UserNotifySettingService.class);
    private final NotifySourceMapper sourceMapper;
    private final UserNotifyMuteMapper muteMapper;
    private final PersonnelService personnelService;

    public UserNotifySettingService(NotifySourceMapper sourceMapper, UserNotifyMuteMapper muteMapper,
                                    PersonnelService personnelService) {
        this.sourceMapper = sourceMapper;
        this.muteMapper = muteMapper;
        this.personnelService = personnelService;
    }

    /** user_notify_mute 已迁 personnel.id:任意账号 id 归一为 personnel.id;落单账号回落原 id。 */
    private String resolveMuteKey(String userId) {
        String pid = personnelService.resolveIdByAccount(userId);
        return pid != null ? pid : userId;
    }

    /** 单源 + 用户偏好 */
    public record SourceSetting(String sourceCode, String sourceName, String description,
                                boolean sourceEnabled, boolean myEnabled,
                                boolean muteEmail, boolean muteServerChan, boolean muteWxpusher) {}

    /** 全部信息源 + 当前用户的静默设置（已按角色视角过滤可见性） */
    public List<SourceSetting> listForUser(String userId, String userRole) {
        List<NotifySource> sources = sourceMapper.findAll();
        String perspective = resolvePerspective(userRole);
        if (sources == null || sources.isEmpty()) return List.of();

        Map<String, UserNotifyMute> muteMap = new LinkedHashMap<>();
        try {
            for (UserNotifyMute m : muteMapper.findByUserId(resolveMuteKey(userId))) {
                if (m != null && StringUtils.hasText(m.getSourceCode())) {
                    muteMap.put(m.getSourceCode().trim(), m);
                }
            }
        } catch (Exception e) {
            log.warn("[NotifyPref] 加载用户 {} 静默设置失败: {}", userId, e.getMessage());
        }

        List<SourceSetting> list = new ArrayList<>();
        for (NotifySource src : sources) {
            // 视角过滤：visible_to=ALL 或 匹配当前用户角色
            String vt = src.getVisibleTo() != null ? src.getVisibleTo().trim().toUpperCase() : "ALL";
            if (!"ALL".equals(vt) && !perspective.equals(vt)) continue;

            UserNotifyMute m = muteMap.get(src.getSourceCode());
            boolean myEnabled = m == null || m.getEnabled() == null || Boolean.TRUE.equals(m.getEnabled());
            list.add(new SourceSetting(
                    src.getSourceCode(), src.getSourceName(), src.getDescription(),
                    src.getEnabled() != null && src.getEnabled() == 1,
                    myEnabled,
                    m != null && Boolean.TRUE.equals(m.getMuteEmail()),
                    m != null && Boolean.TRUE.equals(m.getMuteServerChan()),
                    m != null && Boolean.TRUE.equals(m.getMuteWxpusher())));
        }
        return list;
    }

    /** 保存用户对单个源的偏好 */
    public void save(String userId, String sourceCode, UserNotifyMute body) {
        String key = resolveMuteKey(userId);
        body.setUserId(key);
        body.setSourceCode(sourceCode);
        // 合并已有设置：未传的字段保留原值
        UserNotifyMute existing = muteMapper.findByUserAndSource(key, sourceCode);
        if (existing != null) {
            if (body.getEnabled() == null) body.setEnabled(existing.getEnabled());
            if (body.getMuteEmail() == null) body.setMuteEmail(existing.getMuteEmail());
            if (body.getMuteServerChan() == null) body.setMuteServerChan(existing.getMuteServerChan());
            if (body.getMuteWxpusher() == null) body.setMuteWxpusher(existing.getMuteWxpusher());
        } else {
            if (body.getEnabled() == null) body.setEnabled(true);
        }
        muteMapper.insertOrUpdate(body);
    }

    /** role to perspective: 教职工侧角色(STAFF/SENIOR/ADMIN/SUPER_ADMIN/PLATFORM_OWNER) -> STAFF，学生(MEMBER/STUDENT) -> STUDENT，其它 -> ALL */
    static String resolvePerspective(String roleCode) {
        if (roleCode == null) return "ALL";
        String u = roleCode.trim().toUpperCase();
        if ("MEMBER".equals(u) || "STUDENT".equals(u)) return "STUDENT";
        if ("STAFF".equals(u) || "SENIOR".equals(u) || "ADMIN".equals(u)
                || "SUPER_ADMIN".equals(u) || "PLATFORM_OWNER".equals(u)) return "STAFF";
        return "ALL";
    }

    /** 查询用户对特定源的静默状态（供 PushDispatchEngine 使用） */
    public UserNotifyMute getMute(String userId, String sourceCode) {
        try {
            return muteMapper.findByUserAndSource(resolveMuteKey(userId), sourceCode);
        } catch (Exception e) {
            return null; // 出错视为无静默
        }
    }
}
