package com.example.demo.modules.notification.push.dispatch;

import com.example.demo.common.enums.RoleEnum;
import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.notification.push.config.PushChannelMasterMapper;
import com.example.demo.modules.notification.push.preference.UserNotifyMute;
import com.example.demo.modules.notification.push.preference.UserNotifySettingService;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.notification.entity.NotifyDeliveryLog;
import com.example.demo.modules.notification.mapper.NotificationMiniProgramMapper;
import com.example.demo.modules.notification.push.PushConstants;
import com.example.demo.modules.notification.push.binding.NotifyBindingService;
import com.example.demo.modules.personnel.service.PersonnelService;
import com.example.demo.modules.notification.push.channel.PushChannel;
import com.example.demo.modules.notification.push.channel.PushResult;
import com.example.demo.modules.notification.push.config.NotifySourceChannel;
import com.example.demo.modules.notification.push.config.NotifySourceChannelService;
import com.example.demo.modules.notification.push.recipient.NotifySourceRecipient;
import com.example.demo.modules.notification.push.recipient.NotifySourceRecipientService;
import com.example.demo.modules.notification.push.digest.DigestResolutionService;
import com.example.demo.modules.notification.push.digest.NotifyDigestItem;
import com.example.demo.modules.notification.push.digest.NotifyDigestItemMapper;
import com.example.demo.modules.notification.push.digest.ResolvedDigestConfig;
import com.example.demo.modules.notification.push.source.NotifySource;
import com.example.demo.modules.notification.push.source.NotifySourceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class PushDispatchEngine {

    private static final Logger log = LoggerFactory.getLogger(PushDispatchEngine.class);

    private final NotifySourceService sourceService;
    private final NotifySourceChannelService channelConfigService;
    private final NotifySourceRecipientService recipientService;
    private final PersonnelService personnelService;
    private final NotifyBindingService notifyBindingService;
    private final UserMapper userMapper;
    private final UserDisplayNameService displayNameService;
    private final NotificationMiniProgramMapper deliveryLogMapper;
    private final PushRateLimiter rateLimiter;
    private final List<PushChannel> channels;
    private final DigestResolutionService digestResolutionService;
    private final NotifyDigestItemMapper digestItemMapper;
    private final UserNotifySettingService notifySettingService;
    private final PushChannelMasterMapper channelMasterMapper;

    public PushDispatchEngine(NotifySourceService sourceService,
                              NotifySourceChannelService channelConfigService,
                              NotifySourceRecipientService recipientService,
                              PersonnelService personnelService,
                              NotifyBindingService notifyBindingService,
                              UserMapper userMapper,
                              UserDisplayNameService displayNameService,
                              NotificationMiniProgramMapper deliveryLogMapper,
                              PushRateLimiter rateLimiter,
                              List<PushChannel> channels,
                              DigestResolutionService digestResolutionService,
                              NotifyDigestItemMapper digestItemMapper,
                              UserNotifySettingService notifySettingService,
                              PushChannelMasterMapper channelMasterMapper) {
        this.sourceService = sourceService;
        this.channelConfigService = channelConfigService;
        this.recipientService = recipientService;
        this.personnelService = personnelService;
        this.notifyBindingService = notifyBindingService;
        this.userMapper = userMapper;
        this.displayNameService = displayNameService;
        this.deliveryLogMapper = deliveryLogMapper;
        this.rateLimiter = rateLimiter;
        this.channels = channels;
        this.digestResolutionService = digestResolutionService;
        this.digestItemMapper = digestItemMapper;
        this.notifySettingService = notifySettingService;
        this.channelMasterMapper = channelMasterMapper;
    }

    public Map<String, Object> dispatch(String sourceCode, Map<String, String> variables, Set<String> dynamicUserIds) {
        Map<String, Object> report = new LinkedHashMap<>();
        report.put("sourceCode", sourceCode);
        int totalSent = 0;
        int totalFailed = 0;
        int totalSkipped = 0;
        List<String> diag = new ArrayList<>();

        NotifySource source = sourceService.getByCode(sourceCode);
        if (source.getEnabled() == null || source.getEnabled() != 1) {
            log.info("[Push] 通知源已禁用: {}", sourceCode);
            report.put("error", "通知源已禁用");
            diag.add("source disabled");
            report.put("diagnosis", diag);
            return report;
        }
        diag.add("source found: " + source.getSourceName());

        List<NotifySourceChannel> channelConfigs = channelConfigService.listBySourceId(source.getId());
        if (channelConfigs.isEmpty()) {
            log.info("[Push] 无渠道配置: {}", sourceCode);
            report.put("error", "通知源未配置任何渠道（notify_source_channel 为空）");
            diag.add("no channel configs");
            report.put("diagnosis", diag);
            return report;
        }
        diag.add("channel configs: " + channelConfigs.stream().map(c -> c.getChannelCode() + "=" + (Boolean.TRUE.equals(c.getEnabled()) ? "on" : "off")).toList());

        Set<String> allRecipientIds = resolveRecipients(source.getId(), dynamicUserIds);
        if (allRecipientIds.isEmpty()) {
            log.info("[Push] 无接收人: {}", sourceCode);
            report.put("error", "无接收人（notify_source_recipient 为空且未传 targetUserIds）");
            diag.add("no recipients");
            report.put("diagnosis", diag);
            return report;
        }
        // 收件人去重：同人命中 STAFF + STUDENT 两条规则（映射同一 personnel.id）只派发一次
        allRecipientIds = dedupRecipientsByPersonnel(allRecipientIds);
        diag.add("recipient count: " + allRecipientIds.size());

        // 遥测报警源由 TelemetryAlarmCheckScheduler 自行管理缓冲队列，不经过 PushDispatchEngine 的 digest/夜间分支
        boolean isTelemetrySource = "TELEMETRY_ALARM".equals(source.getSourceCode())
                || "TELEMETRY_RECOVERY".equals(source.getSourceCode())
                || "SWIPE_FAILURE_ALERT".equals(source.getSourceCode());

        if (!isTelemetrySource) {

        // ── 夜间模式分叉：夜间时段 → 全部强制缓冲（覆盖一切即时通知） ──
        Set<String> nightUsers = new LinkedHashSet<>();
        Set<String> digestUsers = new LinkedHashSet<>();
        for (String uid : allRecipientIds) {
            ResolvedDigestConfig cfg = digestResolutionService.resolve(uid, source.getSourceCode());
            if (cfg != null) {
                // 夜间模式：在夜间时段内 → 强制缓冲
                if (Boolean.TRUE.equals(cfg.getNightModeActive())
                        && DigestResolutionService.isNightTime(cfg.getNightStart(), cfg.getNightEnd())) {
                    nightUsers.add(uid);
                } else {
                    digestUsers.add(uid);
                }
            }
        }
        // 缓冲存储用 Markdown 渠道模板（SERVER_CHAN / WXPUSHER），避免 HTML 被 plainText 压缩
        NotifySourceChannel mdChannel = channelConfigs.stream()
                .filter(c -> Boolean.TRUE.equals(c.getEnabled()) && !"EMAIL".equals(c.getChannelCode()))
                .findFirst()
                .orElse(channelConfigs.stream().filter(c -> Boolean.TRUE.equals(c.getEnabled())).findFirst().orElse(null));

        if (!nightUsers.isEmpty()) {
            for (String uid : nightUsers) {
                String title = mdChannel != null ? render(mdChannel.getTitleTpl(), variables) : "";
                String content = mdChannel != null ? render(mdChannel.getContentTpl(), variables) : "";
                NotifyDigestItem item = new NotifyDigestItem();
                item.setUserId(uid);
                item.setSourceCode(source.getSourceCode());
                item.setChannelCode("ALL");
                item.setTitle(title);
                item.setContent(content);
                digestItemMapper.insert(item);
            }
            allRecipientIds.removeAll(nightUsers);
            diag.add("night buffered: " + nightUsers.size() + " users");
        }
        if (!digestUsers.isEmpty()) {
            for (String uid : digestUsers) {
                String title = mdChannel != null ? render(mdChannel.getTitleTpl(), variables) : "";
                String content = mdChannel != null ? render(mdChannel.getContentTpl(), variables) : "";
                NotifyDigestItem item = new NotifyDigestItem();
                item.setUserId(uid);
                item.setSourceCode(source.getSourceCode());
                item.setChannelCode("ALL");
                item.setTitle(title);
                item.setContent(content);
                digestItemMapper.insert(item);
            }
            allRecipientIds.removeAll(digestUsers);
            diag.add("digest buffered: " + digestUsers.size() + " users");
        }

        } // end if (!isTelemetrySource)

        // 全部用户已缓冲 → 无需即时发送（遥测源跳过缓冲，直接走即时通道）
        if (allRecipientIds.isEmpty()) {
            report.put("sent", 0);
            report.put("failed", 0);
            report.put("skipped", 0);
            report.put("diagnosis", diag);
            return report;
        }

        // Batch preload users, display names, and channel targets
        List<String> idList = new ArrayList<>(allRecipientIds);
        Map<String, User> userCache = userMapper.findByIds(idList).stream()
                .collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a));
        Map<String, String> nameMap = displayNameService.resolveDisplayNames(idList);

        // 渠道目标统一走 personnel_notify_binding：按 personnel.id 批量预载；落单账号（无人员档案）回落 sys_user 旧列
        Map<String, String> emailMap = new HashMap<>();
        Map<String, String> sendKeyMap = new HashMap<>();
        Map<String, String> wxPusherUidMap = new HashMap<>();

        List<Long> personnelIds = new ArrayList<>();
        Map<String, Long> resolvedByAccount = new LinkedHashMap<>(); // userId -> personnelId
        List<String> fallbackIds = new ArrayList<>();
        for (String uid : idList) {
            String pidStr = personnelService.resolveIdByAccount(uid);
            if (pidStr == null) {
                fallbackIds.add(uid);
                continue;
            }
            try {
                Long pid = Long.parseLong(pidStr);
                resolvedByAccount.put(uid, pid);
                personnelIds.add(pid);
            } catch (NumberFormatException e) {
                fallbackIds.add(uid);
            }
        }

        if (!personnelIds.isEmpty()) {
            List<Long> distinctPids = personnelIds.stream().distinct().toList();
            Map<Long, Map<String, String>> batch = notifyBindingService.readBatchByPersonnelIds(distinctPids);
            for (Map.Entry<String, Long> e : resolvedByAccount.entrySet()) {
                Map<String, String> ch = batch.get(e.getValue());
                if (ch == null) continue;
                String email = ch.get(PushConstants.CHANNEL_EMAIL);
                if (email != null && !email.isBlank()) emailMap.put(e.getKey(), email);
                String sk = ch.get(PushConstants.CHANNEL_SERVER_CHAN);
                if (sk != null && !sk.isBlank()) sendKeyMap.put(e.getKey(), sk);
                String wuid = ch.get(PushConstants.CHANNEL_WXPUSHER);
                if (wuid != null && !wuid.isBlank()) wxPusherUidMap.put(e.getKey(), wuid);
            }
        }

        if (!fallbackIds.isEmpty()) {
            List<Map<String, String>> userEmails = userMapper.findContactEmailsByIds(fallbackIds);
            if (userEmails != null) {
                for (Map<String, String> row : userEmails) {
                    String uid = row.get("id");
                    String email = row.get("contact_email");
                    if (uid != null && email != null && !email.isBlank()) emailMap.put(uid, email);
                }
            }
            List<Map<String, String>> userKeys = userMapper.findSendKeysByIds(fallbackIds);
            if (userKeys != null) {
                for (Map<String, String> row : userKeys) {
                    String uid = row.get("id");
                    String sk = row.get("send_key");
                    if (uid != null && sk != null && !sk.isBlank()) sendKeyMap.put(uid, sk);
                }
            }
            List<Map<String, String>> userWuids = userMapper.findWxPusherUidsByIds(fallbackIds);
            if (userWuids != null) {
                for (Map<String, String> row : userWuids) {
                    String uid = row.get("id");
                    String wuid = row.get("wx_pusher_uid");
                    if (uid != null && wuid != null && !wuid.isBlank()) wxPusherUidMap.put(uid, wuid);
                }
            }
        }
        diag.add("email bindings: " + emailMap.size() + ", sendKey bindings: " + sendKeyMap.size() + ", wxPusher bindings: " + wxPusherUidMap.size());
        diag.add("registered channels: " + channels.stream().map(PushChannel::getCode).toList());

        for (NotifySourceChannel channelCfg : channelConfigs) {
            if (!Boolean.TRUE.equals(channelCfg.getEnabled())) {
                diag.add("channel " + channelCfg.getChannelCode() + " config disabled");
                continue;
            }
            PushChannel channel = findChannel(channelCfg.getChannelCode());
            if (channel == null) {
                log.info("[Push] 渠道未注册: {}", channelCfg.getChannelCode());
                diag.add("channel " + channelCfg.getChannelCode() + " not registered as bean");
                continue;
            }
            if (!channel.isEnabled()) {
                log.info("[Push] 渠道已停用: {}", channelCfg.getChannelCode());
                diag.add("channel " + channelCfg.getChannelCode() + " system-disabled");
                continue;
            }
            // 全局渠道总控
            Integer masterOn = channelMasterMapper.findEnabledByCode(channelCfg.getChannelCode());
            if (masterOn != null && masterOn == 0) {
                diag.add("channel " + channelCfg.getChannelCode() + " master-disabled");
                continue;
            }

            // 遥测报警源自带调度器冷却去重，不应用渠道静默时段和频率限制
            if (!isTelemetrySource && rateLimiter.isQuietTime(channelCfg)) {
                log.info("[Push] 静默时段跳过: {}/{}", sourceCode, channel.getCode());
                diag.add("channel " + channel.getCode() + " in quiet time");
                continue;
            }

            String title = render(channelCfg.getTitleTpl(), variables);
            String content = render(channelCfg.getContentTpl(), variables);

            int chSent = 0, chFailed = 0, chSkipped = 0;
            for (String userId : allRecipientIds) {
                // ★ 个人静默：用户关闭了该源或该渠道
                UserNotifyMute mute = notifySettingService.getMute(userId, source.getSourceCode());
                if (mute != null && Boolean.FALSE.equals(mute.getEnabled())) {
                    chSkipped++;
                    diag.add("user " + userId + " muted source " + source.getSourceCode());
                    continue;
                }
                if (mute != null) {
                    if (PushConstants.CHANNEL_EMAIL.equals(channel.getCode()) && Boolean.TRUE.equals(mute.getMuteEmail())) {
                        chSkipped++; diag.add("user " + userId + " muted EMAIL"); continue;
                    }
                    if (PushConstants.CHANNEL_SERVER_CHAN.equals(channel.getCode()) && Boolean.TRUE.equals(mute.getMuteServerChan())) {
                        chSkipped++; diag.add("user " + userId + " muted SERVER_CHAN"); continue;
                    }
                    if (PushConstants.CHANNEL_WXPUSHER.equals(channel.getCode()) && Boolean.TRUE.equals(mute.getMuteWxpusher())) {
                        chSkipped++; diag.add("user " + userId + " muted WXPUSHER"); continue;
                    }
                }

                // Batch-preloaded maps (C2 fix)
                String target;
                if (PushConstants.CHANNEL_EMAIL.equals(channel.getCode())) {
                    target = emailMap.get(userId);
                } else if (PushConstants.CHANNEL_WXPUSHER.equals(channel.getCode())) {
                    target = wxPusherUidMap.get(userId);
                } else {
                    target = sendKeyMap.get(userId);
                }
                if (target == null || target.isBlank()) {
                    chSkipped++;
                    diag.add("user " + userId + " has no binding for " + channel.getCode());
                    continue;
                }

                int limitSec = channelCfg.getRateLimitSeconds() != null ? channelCfg.getRateLimitSeconds() : 300;
                if (!isTelemetrySource && rateLimiter.isRateLimited(sourceCode, userId, channel.getCode(), limitSec)) {
                    chSkipped++;
                    diag.add("user " + userId + " rate-limited for " + channel.getCode() + " (" + limitSec + "s)");
                    continue;
                }

                String recipientName = nameMap.getOrDefault(userId, userId);

                NotifyDeliveryLog logEntry = new NotifyDeliveryLog();
                logEntry.setNotificationId("PUSH_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
                logEntry.setRecipientUserId(userId);
                logEntry.setChannel(channel.getCode());
                logEntry.setTemplateKey(source.getSourceCode());
                logEntry.setStatus(PushConstants.STATUS_PENDING);
                logEntry.setRetryCount(0);
                logEntry.setMaxRetries(3);
                logEntry.setCreateTime(LocalDateTime.now());
                logEntry.setSourceCode(source.getSourceCode());
                logEntry.setSourceName(source.getSourceName());
                logEntry.setChannelName(channel.getDisplayName());
                logEntry.setRecipientName(recipientName);
                logEntry.setTitle(title);
                logEntry.setContent(content);

                try {
                    deliveryLogMapper.insertDeliveryLog(logEntry);
                    PushResult result = channel.send(target, title, content);
                    if (result.isSuccess()) {
                        deliveryLogMapper.markDeliverySuccess(logEntry.getId(), result.getProviderMsgId());
                        chSent++;
                        log.info("[Push] 发送成功: {} -> {} via {}", sourceCode, recipientName, channel.getCode());
                    } else {
                        deliveryLogMapper.markDeliveryFailed(logEntry.getId(),
                                truncate(result.getErrorCode(), 64),
                                truncate(result.getErrorMsg(), 500));
                        chFailed++;
                        log.warn("[Push] 发送失败: {} -> {} via {}: {} {}", sourceCode, recipientName, channel.getCode(),
                                result.getErrorCode(), result.getErrorMsg());
                    }
                } catch (Exception e) {
                    chFailed++;
                    log.error("[Push] 单用户推送异常: {} {} {}", sourceCode, userId, channel.getCode(), e);
                    try {
                        deliveryLogMapper.markDeliveryFailed(logEntry.getId(),
                                "INTERNAL_ERROR", truncate(e.getMessage(), 500));
                    } catch (Exception ignored) {
                        // best-effort
                    }
                }
            }
            totalSent += chSent;
            totalFailed += chFailed;
            totalSkipped += chSkipped;
        }

        report.put("sent", totalSent);
        report.put("failed", totalFailed);
        report.put("skipped", totalSkipped);
        report.put("diagnosis", diag);
        log.info("[Push] dispatch 完成: {} sent={} failed={} skipped={} diag={}",
                sourceCode, totalSent, totalFailed, totalSkipped, diag);
        return report;
    }

    private Set<String> resolveRecipients(Long sourceId, Set<String> dynamicUserIds) {
        Set<String> result = new LinkedHashSet<>();
        if (dynamicUserIds != null) {
            result.addAll(dynamicUserIds);
        }
        for (NotifySourceRecipient rc : recipientService.listBySourceId(sourceId)) {
            if (PushConstants.PERSPECTIVE_ALL.equals(rc.getPerspective())) {
                if (PushConstants.SCOPE_ALL.equals(rc.getScopeType())) {
                    userMapper.listEnabledUsersByMinRoleLevel(0).forEach(u -> result.add(u.getId()));
                } else {
                    addByScope(rc, result);
                }
            } else if (PushConstants.PERSPECTIVE_STUDENT.equals(rc.getPerspective())) {
                // Only MEMBER role for student perspective
                if (PushConstants.SCOPE_ALL.equals(rc.getScopeType())) {
                    userMapper.findEnabledByRole(RoleEnum.MEMBER.getCode()).forEach(u -> result.add(u.getId()));
                } else if (PushConstants.SCOPE_ROLE.equals(rc.getScopeType()) && rc.getScopeValue() != null) {
                    try {
                        RoleEnum role = RoleEnum.valueOf(rc.getScopeValue());
                        userMapper.findEnabledByRole(role.getCode()).forEach(u -> result.add(u.getId()));
                    } catch (IllegalArgumentException e) {
                        log.warn("[Push] 未知角色: {}", rc.getScopeValue());
                    }
                } else if (PushConstants.SCOPE_USER.equals(rc.getScopeType()) && rc.getScopeValue() != null) {
                    result.add(rc.getScopeValue().trim());
                }
            } else if (PushConstants.PERSPECTIVE_STAFF.equals(rc.getPerspective())) {
                if (PushConstants.SCOPE_ALL.equals(rc.getScopeType())) {
                    userMapper.listEnabledStaffUsers().forEach(u -> result.add(u.getId()));
                } else {
                    addByScope(rc, result);
                }
            }
        }
        return result;
    }

    /**
     * 同人（staff 与 student 双账号映射同一 personnel.id）去重：每个 personnel 保留一个代表账号 id；
     * 无 personnel 档案的落单账号原样保留（各自独立收件人）。
     */
    private Set<String> dedupRecipientsByPersonnel(Set<String> accountIds) {
        if (accountIds == null || accountIds.isEmpty()) {
            return accountIds;
        }
        Map<Long, String> representative = new LinkedHashMap<>();
        List<String> orphans = new ArrayList<>();
        for (String id : accountIds) {
            String pidStr = personnelService.resolveIdByAccount(id);
            if (pidStr != null) {
                try {
                    representative.putIfAbsent(Long.parseLong(pidStr), id);
                    continue;
                } catch (NumberFormatException ignore) {
                    // 非数字 personnel.id 视为落单
                }
            }
            orphans.add(id);
        }
        Set<String> result = new LinkedHashSet<>(representative.values());
        result.addAll(orphans);
        return result;
    }

    private void addByScope(NotifySourceRecipient rc, Set<String> result) {
        if (PushConstants.SCOPE_ROLE.equals(rc.getScopeType()) && rc.getScopeValue() != null) {
            try {
                RoleEnum role = RoleEnum.valueOf(rc.getScopeValue());
                userMapper.findEnabledByRole(role.getCode()).forEach(u -> result.add(u.getId()));
            } catch (IllegalArgumentException e) {
                log.warn("[Push] 未知角色: {}", rc.getScopeValue());
            }
        } else if (PushConstants.SCOPE_USER.equals(rc.getScopeType()) && rc.getScopeValue() != null) {
            result.add(rc.getScopeValue().trim());
        }
    }

    private PushChannel findChannel(String code) {
        return channels.stream().filter(c -> c.getCode().equals(code)).findFirst().orElse(null);
    }

    private String render(String tpl, Map<String, String> vars) {
        if (tpl == null) return "";
        String result = tpl;
        for (Map.Entry<String, String> e : vars.entrySet()) {
            result = result.replace("{" + e.getKey() + "}", e.getValue() != null ? e.getValue() : "");
        }
        return result;
    }

    private static String truncate(String s, int maxLen) {
        if (s == null) return null;
        return s.length() <= maxLen ? s : s.substring(0, maxLen - 3) + "...";
    }

    /** 去除 HTML 标签和 Markdown 语法，保留纯文本 */
    private static String plainText(String s) {
        if (s == null) return "";
        return s.replaceAll("<[^>]+>", " ")  // HTML 标签
                .replaceAll("[*#>`_~]", "")    // Markdown 语法
                .replaceAll("\\s+", " ")       // 合并空白
                .trim();
    }
}
