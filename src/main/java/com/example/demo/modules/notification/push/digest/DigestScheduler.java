package com.example.demo.modules.notification.push.digest;

import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.notification.entity.NotifyDeliveryLog;
import com.example.demo.modules.notification.mapper.NotificationMiniProgramMapper;
import com.example.demo.modules.notification.push.PushConstants;
import com.example.demo.modules.notification.push.channel.PushChannel;
import com.example.demo.modules.notification.push.channel.PushResult;
import com.example.demo.modules.notification.push.config.NotifySourceChannel;
import com.example.demo.modules.notification.push.config.NotifySourceChannelService;
import com.example.demo.modules.notification.push.source.NotifySource;
import com.example.demo.modules.notification.push.source.NotifySourceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.util.UUID;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 每分钟轮询：匹配 schedule_times，合并缓冲项，发送摘要，标记已发送。
 * 溢出策略 ROLL_OVER 由 PushDispatchEngine 分叉 + 本调度器天然支持；
 * FALLBACK_INSTANT 在 DigestResolutionService 中处理（末班后返回 INSTANT）。
 */
@Service
public class DigestScheduler {
    private static final Logger log = LoggerFactory.getLogger(DigestScheduler.class);
    private final NotifyDigestItemMapper digestItemMapper;
    private final NotifyDigestDefaultConfigMapper defaultConfigMapper;
    private final UserDigestPreferenceMapper userPrefMapper;
    private final NotifySourceService sourceService;
    private final NotifySourceChannelService channelConfigService;
    private final UserMapper userMapper;
    private final UserDisplayNameService displayNameService;
    private final List<PushChannel> channels;
    private final NotificationMiniProgramMapper deliveryLogMapper;

    public DigestScheduler(NotifyDigestItemMapper digestItemMapper,
                           NotifyDigestDefaultConfigMapper defaultConfigMapper,
                           UserDigestPreferenceMapper userPrefMapper,
                           NotifySourceService sourceService,
                           NotifySourceChannelService channelConfigService,
                           UserMapper userMapper,
                           UserDisplayNameService displayNameService,
                           List<PushChannel> channels,
                           NotificationMiniProgramMapper deliveryLogMapper) {
        this.digestItemMapper = digestItemMapper;
        this.defaultConfigMapper = defaultConfigMapper;
        this.userPrefMapper = userPrefMapper;
        this.sourceService = sourceService;
        this.channelConfigService = channelConfigService;
        this.userMapper = userMapper;
        this.displayNameService = displayNameService;
        this.channels = channels;
        this.deliveryLogMapper = deliveryLogMapper;
    }

    @Scheduled(cron = "0 * * * * *") // 每分钟执行
    public void tick() {
        LocalTime now = LocalTime.now().withSecond(0).withNano(0);
        LocalDateTime nowDt = LocalDateTime.now();
        int todayDow = nowDt.getDayOfWeek().getValue(); // 1=Mon, 7=Sun
        String nowStr = now.format(DateTimeFormatter.ofPattern("HH:mm"));
        String dateTimeStr = nowDt.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));

        // 收集所有活跃 config → 找到当前时刻应触发的 source_codes
        Set<String> activeSources = new LinkedHashSet<>();
        for (NotifyDigestDefaultConfig def : defaultConfigMapper.findAll()) {
            if (def.getEnabled() == null || def.getEnabled() != 1) continue;
            if (def.getDigestMode() == null || "INSTANT".equalsIgnoreCase(def.getDigestMode())) continue;
            if (!isTodayActive(def.getScheduleDays(), todayDow)) continue;

            if ("MINUTELY".equalsIgnoreCase(def.getDigestMode())) {
                int interval = def.getMinutelyInterval() != null && def.getMinutelyInterval() > 0 ? def.getMinutelyInterval() : 5;
                if (now.getHour() * 60 + now.getMinute() > 0 && (now.getHour() * 60 + now.getMinute()) % interval == 0) {
                    activeSources.add(def.getSourceCode());
                }
            } else if ("HOURLY".equalsIgnoreCase(def.getDigestMode())) {
                int interval = def.getHourlyInterval() != null && def.getHourlyInterval() > 0 ? def.getHourlyInterval() : 1;
                if (now.getMinute() == 0 && now.getHour() % interval == 0) {
                    activeSources.add(def.getSourceCode());
                }
            } else { // SCHEDULED
                String times = def.getScheduleTimes();
                if (times == null) continue;
                for (String t : times.split(",")) {
                    if (t.trim().equals(nowStr)) {
                        activeSources.add(def.getSourceCode());
                        break;
                    }
                }
            }
        }

        // ── 夜间结束冲刷：night_end 时刻 flush 所有暂存 ──
        Set<String> nightEndSources = new LinkedHashSet<>();
        for (NotifyDigestDefaultConfig def : defaultConfigMapper.findAll()) {
            if (def.getNightModeEnabled() != null && def.getNightModeEnabled() == 1
                    && def.getNightEnd() != null && def.getNightEnd().equals(nowStr)) {
                nightEndSources.add(def.getSourceCode());
            }
        }
        if (!nightEndSources.isEmpty()) {
            log.info("[Digest] night-end flush {} — sources: {}", nowStr, nightEndSources);
            flushAllPendingForSources(nightEndSources);
        }

        if (activeSources.isEmpty() && nightEndSources.isEmpty()) return;
        log.info("[Digest] tick {} — matched sources: {}", now, activeSources);

        List<String> allPendingUsers = digestItemMapper.findDistinctPendingUsers();
        if (allPendingUsers.isEmpty()) return;

        for (String userId : allPendingUsers) {
            List<NotifyDigestItem> items = digestItemMapper.findPendingByUser(userId);
            if (items.isEmpty()) continue;

            // 过滤：仅保留 source_code 命中当前 schedule 的项
            List<NotifyDigestItem> matchedItems = items.stream()
                    .filter(it -> activeSources.contains(it.getSourceCode()))
                    .toList();
            if (matchedItems.isEmpty()) continue;

            // 按 source 分组，构建摘要
            String userName = displayNameService.resolveDisplayName(userId);
            Map<String, List<NotifyDigestItem>> grouped = matchedItems.stream()
                    .collect(Collectors.groupingBy(NotifyDigestItem::getSourceCode, LinkedHashMap::new, Collectors.toList()));

            StringBuilder body = new StringBuilder();
            List<String> sourceNames = new ArrayList<>();
            for (var entry : grouped.entrySet()) {
                String sc = entry.getKey();
                try {
                    NotifySource src = sourceService.getByCode(sc);
                    sourceNames.add(src.getSourceName());
                } catch (Exception e) {
                    sourceNames.add(sc);
                }
                // 按信息源分组，每个源下面列出该源的通知
                body.append("【").append(sourceNames.get(sourceNames.size() - 1)).append("】\n\n");
                for (NotifyDigestItem it : entry.getValue()) {
                    body.append("· ").append(plainText(it.getTitle())).append("\n");
                    if (it.getContent() != null && !it.getContent().isBlank()) {
                        String c = plainText(it.getContent());
                        if (c.length() > 200) c = c.substring(0, 200) + "…";
                        body.append("  ").append(c).append("\n");
                    }
                    body.append("\n");
                }
            }

            String templateTitle = null, templateContent = null;
            try {
                NotifyDigestDefaultConfig def = defaultConfigMapper.findBySourceCode(matchedItems.get(0).getSourceCode());
                if (def != null && def.getDigestTitleTpl() != null && !def.getDigestTitleTpl().isBlank()) {
                    templateTitle = def.getDigestTitleTpl();
                    templateContent = def.getDigestContentTpl();
                }
            } catch (Exception ignored) {}
            String title = renderDigestTitle(templateTitle, userName, matchedItems.size(), dateTimeStr);
            String content = renderDigestContent(templateContent, userName, matchedItems.size(), dateTimeStr, body.toString());

            // 通过该用户绑定的渠道发送摘要
            int sent = 0;
            for (NotifyDigestItem sample : matchedItems) {
                try {
                    NotifySource src = sourceService.getByCode(sample.getSourceCode());
                    for (NotifySourceChannel chCfg : channelConfigService.listBySourceId(src.getId())) {
                        if (!Boolean.TRUE.equals(chCfg.getEnabled())) continue;
                        PushChannel channel = channels.stream()
                                .filter(c -> c.getCode().equals(chCfg.getChannelCode())).findFirst().orElse(null);
                        if (channel == null || !channel.isEnabled()) continue;

                        String target = resolveTarget(userId, chCfg.getChannelCode());
                        if (target == null || target.isBlank()) continue;

                        try {
                            PushResult result = channel.send(target, title, content);
                            if (result.isSuccess()) {
                                sent++;
                                writeDeliveryLog(userId, chCfg.getChannelCode(), sample.getSourceCode(),
                                        src.getSourceName(), userName, title, content, true, null, null);
                            } else {
                                writeDeliveryLog(userId, chCfg.getChannelCode(), sample.getSourceCode(),
                                        src.getSourceName(), userName, title, content, false,
                                        result.getErrorCode(), result.getErrorMsg());
                            }
                        } catch (Exception e) {
                            log.warn("[Digest] send failed: {} {} {}", userId, chCfg.getChannelCode(), e.getMessage());
                            writeDeliveryLog(userId, chCfg.getChannelCode(), sample.getSourceCode(),
                                    src.getSourceName(), userName, title, content, false,
                                    "INTERNAL_ERROR", truncate(e.getMessage(), 500));
                        }
                    }
                } catch (Exception e) {
                    log.warn("[Digest] source lookup failed for {}", sample.getSourceCode());
                }
                break; // 只取一个 sample 获取 source/channel 信息即可
            }

            // 标记已发送
            List<Long> ids = matchedItems.stream().map(NotifyDigestItem::getId).toList();
            digestItemMapper.markSent(ids, LocalDateTime.now());
            log.info("[Digest] sent to {}: {} items, {} channels hit", userName, matchedItems.size(), sent);
        }
    }

    /** 夜间结束时冲刷指定 sources 的所有 PENDING 缓冲 */
    private void flushAllPendingForSources(Set<String> sources) {
        List<String> allPendingUsers = digestItemMapper.findDistinctPendingUsers();
        if (allPendingUsers.isEmpty()) return;
        for (String userId : allPendingUsers) {
            List<NotifyDigestItem> items = digestItemMapper.findPendingByUser(userId);
            List<NotifyDigestItem> matched = items.stream()
                    .filter(it -> sources.contains(it.getSourceCode()))
                    .toList();
            if (matched.isEmpty()) continue;
            sendDigestToUser(userId, matched);
            List<Long> ids = matched.stream().map(NotifyDigestItem::getId).toList();
            digestItemMapper.markSent(ids, LocalDateTime.now());
        }
    }

    /** 向用户发送一份摘要 */
    private void sendDigestToUser(String userId, List<NotifyDigestItem> items) {
        String userName = displayNameService.resolveDisplayName(userId);
        // 按 source 分组排版
        Map<String, List<NotifyDigestItem>> grouped = items.stream()
                .collect(java.util.stream.Collectors.groupingBy(NotifyDigestItem::getSourceCode, LinkedHashMap::new, java.util.stream.Collectors.toList()));
        StringBuilder body = new StringBuilder();
        for (var entry : grouped.entrySet()) {
            String sourceName = entry.getKey();
            try { sourceName = sourceService.getByCode(entry.getKey()).getSourceName(); } catch (Exception ignored) {}
            body.append("【").append(sourceName).append("】\n\n");
            for (NotifyDigestItem it : entry.getValue()) {
                body.append("· ").append(plainText(it.getTitle())).append("\n");
                if (it.getContent() != null && !it.getContent().isBlank()) {
                    String c = plainText(it.getContent());
                    if (c.length() > 200) c = c.substring(0, 200) + "…";
                    body.append("  ").append(c).append("\n");
                }
                body.append("\n");
            }
        }
        String dateTimeStr = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String tTitle = null, tContent = null;
        try {
            NotifyDigestDefaultConfig def = defaultConfigMapper.findBySourceCode(items.get(0).getSourceCode());
            if (def != null && def.getDigestTitleTpl() != null && !def.getDigestTitleTpl().isBlank()) {
                tTitle = def.getDigestTitleTpl();
                tContent = def.getDigestContentTpl();
            }
        } catch (Exception ignored) {}
        String title = renderDigestTitle(tTitle, userName, items.size(), dateTimeStr);
        String content = renderDigestContent(tContent, userName, items.size(), dateTimeStr, body.toString());

        // 尝试通过用户绑定渠道发送
        boolean sent = false;
        for (PushChannel channel : channels) {
            if (!channel.isEnabled()) continue;
            String target = resolveTarget(userId, channel.getCode());
            if (target == null || target.isBlank()) continue;
            try {
                channel.send(target, title, content);
                sent = true;
                writeDeliveryLog(userId, channel.getCode(), items.get(0).getSourceCode(),
                        items.get(0).getSourceCode(), userName, title, content, true, null, null);
            } catch (Exception e) {
                log.warn("[Digest] night flush send failed: {} {} {}", userId, channel.getCode(), e.getMessage());
                writeDeliveryLog(userId, channel.getCode(), items.get(0).getSourceCode(),
                        items.get(0).getSourceCode(), userName, title, content, false,
                        "INTERNAL_ERROR", truncate(e.getMessage(), 500));
            }
        }
        log.info("[Digest] night flush to {}: {} items, sent={}", userName, items.size(), sent);
    }

    /** 写入 notify_delivery_log 使仪表盘可追踪聚合发送 */
    private NotifyDeliveryLog writeDeliveryLog(String userId, String channelCode, String sourceCode, String srcName, String userName, String title, String content, boolean success, String errCode, String errMsg) {
        NotifyDeliveryLog entry = new NotifyDeliveryLog();
        entry.setNotificationId("DIGEST_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
        entry.setRecipientUserId(userId);
        entry.setChannel(channelCode);
        entry.setTemplateKey("DIGEST:" + sourceCode);
        entry.setStatus(success ? PushConstants.STATUS_SUCCESS : PushConstants.STATUS_FAILED);
        entry.setRetryCount(0);
        entry.setMaxRetries(0);
        entry.setCreateTime(LocalDateTime.now());
        entry.setSourceCode(sourceCode);
        entry.setSourceName("聚合:" + (srcName != null ? srcName : sourceCode));
        entry.setChannelName(channelDisplayName(channelCode));
        entry.setRecipientName(userName != null ? userName : userId);
        entry.setTitle(title);
        entry.setContent(content);
        try {
            deliveryLogMapper.insertDeliveryLog(entry);
            if (success) {
                deliveryLogMapper.markDeliverySuccess(entry.getId(), null);
            } else {
                deliveryLogMapper.markDeliveryFailed(entry.getId(), errCode, errMsg);
            }
        } catch (Exception e) {
            log.warn("[Digest] failed to write delivery log: {}", e.getMessage());
        }
        return entry;
    }

    /** 渲染摘要标题模板 */
    private String renderDigestTitle(String tpl, String userName, int count, String time) {
        String def = (tpl != null && !tpl.isBlank()) ? tpl : "ARO 通知摘要 · {time}";
        return def.replace("{userName}", userName != null ? userName : "")
                .replace("{count}", String.valueOf(count))
                .replace("{time}", time != null ? time : "");
    }

    /** 渲染摘要正文模板 */
    private String renderDigestContent(String tpl, String userName, int count, String time, String itemsText) {
        String def = (tpl != null && !tpl.isBlank()) ? tpl
                : "{userName}，您有 {count} 条新通知：\n\n{items}\n\n> {time} · ARO 系统自动推送";
        return def.replace("{userName}", userName != null ? userName : "")
                .replace("{count}", String.valueOf(count))
                .replace("{time}", time != null ? time : "")
                .replace("{items}", itemsText != null ? itemsText : "");
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max - 3) + "...";
    }

    /** 去除 HTML + Markdown 标签，保留纯文本 */
    private static String plainText(String s) {
        if (s == null) return "";
        return s.replaceAll("<[^>]+>", " ")
                .replaceAll("[*#>`_~]", "")
                .replaceAll("\\s+", " ")
                .trim();
    }

    /** schedule_days 为空或包含 todayDow 则视为今日活跃 */
    private static boolean isTodayActive(String scheduleDays, int todayDow) {
        if (scheduleDays == null || scheduleDays.isBlank()) return true;
        for (String s : scheduleDays.split(",")) {
            try {
                if (Integer.parseInt(s.trim()) == todayDow) return true;
            } catch (NumberFormatException ignored) {}
        }
        return false;
    }

    private String channelDisplayName(String code) {
        return switch (code) {
            case "EMAIL" -> "邮件通知";
            case "SERVER_CHAN" -> "Server酱微信通知";
            case "WXPUSHER" -> "WxPusher推送";
            default -> code;
        };
    }

    private String resolveTarget(String userId, String channelCode) {
        if ("EMAIL".equals(channelCode)) {
            List<Map<String, String>> emails = userMapper.findContactEmailsByIds(List.of(userId));
            if (emails != null && !emails.isEmpty()) {
                String email = emails.get(0).get("contact_email");
                if (email != null && !email.isBlank()) return email;
            }
        }
        if ("WXPUSHER".equals(channelCode)) {
            List<Map<String, String>> wuids = userMapper.findWxPusherUidsByIds(List.of(userId));
            if (wuids != null && !wuids.isEmpty()) {
                String wuid = wuids.get(0).get("wx_pusher_uid");
                if (wuid != null && !wuid.isBlank()) return wuid;
            }
        }
        List<Map<String, String>> keys = userMapper.findSendKeysByIds(List.of(userId));
        if (keys != null && !keys.isEmpty()) {
            String sk = keys.get(0).get("send_key");
            if (sk != null && !sk.isBlank()) return sk;
        }
        return null;
    }
}
