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
import com.example.demo.modules.notification.push.preference.UserNotifyMute;
import com.example.demo.modules.notification.push.preference.UserNotifySettingService;
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
    private final UserNotifySettingService notifySettingService;
    /** 学生端绑定查询（contact_email / send_key / wx_pusher_uid 在 aro_personnel 表中） */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.example.demo.modules.aro.mapper.AroPersonnelMapper aroPersonnelMapper;

    public DigestScheduler(NotifyDigestItemMapper digestItemMapper,
                           NotifyDigestDefaultConfigMapper defaultConfigMapper,
                           UserDigestPreferenceMapper userPrefMapper,
                           NotifySourceService sourceService,
                           NotifySourceChannelService channelConfigService,
                           UserMapper userMapper,
                           UserDisplayNameService displayNameService,
                           List<PushChannel> channels,
                           NotificationMiniProgramMapper deliveryLogMapper,
                           UserNotifySettingService notifySettingService) {
        this.digestItemMapper = digestItemMapper;
        this.defaultConfigMapper = defaultConfigMapper;
        this.userPrefMapper = userPrefMapper;
        this.sourceService = sourceService;
        this.channelConfigService = channelConfigService;
        this.userMapper = userMapper;
        this.displayNameService = displayNameService;
        this.channels = channels;
        this.deliveryLogMapper = deliveryLogMapper;
        this.notifySettingService = notifySettingService;
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
                // 按信息源分组，直接拼接该源已渲染好的渠道模板内容
                String srcLabel = sourceNames.get(sourceNames.size() - 1);
                body.append("## ").append(srcLabel).append("\n\n");
                for (NotifyDigestItem it : entry.getValue()) {
                    if (it.getContent() != null && !it.getContent().isBlank()) {
                        body.append(stripItemForDigest(it.getContent())).append("\n\n");
                    } else if (it.getTitle() != null && !it.getTitle().isBlank()) {
                        body.append(stripItemForDigest(it.getTitle())).append("\n\n");
                    }
                }
                body.append("---\n\n");
            }

            String templateTitle = null, templateContent = null;
            try {
                NotifyDigestDefaultConfig def = defaultConfigMapper.findBySourceCode(matchedItems.get(0).getSourceCode());
                if (def != null && def.getDigestTitleTpl() != null && !def.getDigestTitleTpl().isBlank()) {
                    templateTitle = def.getDigestTitleTpl();
                    templateContent = def.getDigestContentTpl();
                }
            } catch (Exception ignored) {}

            // ── 超长拆分：每 ~2000 字符一批，标记序号 ──
            final int MAX_CHUNK = 2000;
            List<String> chunks = new ArrayList<>();
            if (body.length() <= MAX_CHUNK) {
                chunks.add(body.toString());
            } else {
                StringBuilder buf = new StringBuilder();
                String srcLabel = "";
                for (var entry : grouped.entrySet()) {
                    srcLabel = sourceNames.get(grouped.keySet().stream().toList().indexOf(entry.getKey()));
                    for (NotifyDigestItem it : entry.getValue()) {
                        String line = it.getContent() != null && !it.getContent().isBlank()
                                ? it.getContent() : it.getTitle();
                        String block = stripItemForDigest(line) + "\n";
                        if (buf.length() + block.length() > MAX_CHUNK && buf.length() > 0) {
                            chunks.add(buf.toString().trim());
                            buf.setLength(0);
                            buf.append("## ").append(srcLabel).append("\n\n");
                        }
                        buf.append(block);
                    }
                }
                if (buf.length() > 0) chunks.add(buf.toString().trim());
            }

            if (chunks.isEmpty()) chunks.add(body.toString());
            int totalPages = chunks.size();
            int sent = 0;

            for (int pi = 0; pi < totalPages; pi++) {
                String pageSuffix = totalPages > 1 ? "（" + (pi + 1) + "/" + totalPages + "）" : "";
                String title = renderDigestTitle(templateTitle, userName, matchedItems.size(), dateTimeStr) + pageSuffix;
                String content = renderDigestContent(templateContent, userName, matchedItems.size(), dateTimeStr, chunks.get(pi)) + pageSuffix;

                // 通过该用户绑定的渠道发送摘要
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

                        // ★ 个人静默偏好：检查当前用户是否关闭了该信息源或该渠道
                        if (isMuted(userId, sample.getSourceCode(), chCfg.getChannelCode())) {
                            log.debug("[Digest] skipped muted: userId={} source={} channel={}",
                                    userId, sample.getSourceCode(), chCfg.getChannelCode());
                            continue;
                        }

                        try {
                            // EMAIL 渠道需要 HTML 格式，Markdown 源码会显示为乱码
                            String channelContent = PushConstants.CHANNEL_EMAIL.equals(chCfg.getChannelCode())
                                    ? markdownToHtml(content) : content;
                            PushResult result = channel.send(target, title, channelContent);
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
            } // end chunk loop

            // 标记已发送（所有分片共用一个 mark）
            List<Long> ids = matchedItems.stream().map(NotifyDigestItem::getId).toList();
            digestItemMapper.markSent(ids, LocalDateTime.now());
            if (sent > 0) {
                log.info("[Digest] sent to {}: {} items, {} pages, {} channels hit", userName, matchedItems.size(), totalPages, sent);
            } else {
                log.warn("[Digest] NO delivery to {}: {} items, {} pages, 0 channels hit — user has no bindings or all channels disabled", userName, matchedItems.size(), totalPages);
            }
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
            body.append("## ").append(sourceName).append("\n\n");
            for (NotifyDigestItem it : entry.getValue()) {
                if (it.getContent() != null && !it.getContent().isBlank()) {
                    body.append(stripItemForDigest(it.getContent())).append("\n\n");
                } else if (it.getTitle() != null && !it.getTitle().isBlank()) {
                    body.append(stripItemForDigest(it.getTitle())).append("\n\n");
                }
            }
            body.append("\n");
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
            // ★ 个人静默偏好：夜间冲刷同样遵守
            if (isMuted(userId, items.get(0).getSourceCode(), channel.getCode())) {
                log.debug("[Digest] night flush skipped muted: userId={} source={} channel={}",
                        userId, items.get(0).getSourceCode(), channel.getCode());
                continue;
            }
            try {
                String channelContent = PushConstants.CHANNEL_EMAIL.equals(channel.getCode())
                        ? markdownToHtml(content) : content;
                channel.send(target, title, channelContent);
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
        if (sent) {
            log.info("[Digest] night flush to {}: {} items delivered", userName, items.size());
        } else {
            log.warn("[Digest] night flush to {}: {} items — NO channel delivered (user has no bindings)", userName, items.size());
        }
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
                : "{userName}，{count} 条新通知\n\n{items}\n> ARO 系统自动推送";
        return def.replace("{userName}", userName != null ? userName : "")
                .replace("{count}", String.valueOf(count))
                .replace("{time}", time != null ? time : "")
                .replace("{items}", itemsText != null ? itemsText : "");
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max - 3) + "...";
    }

    /** 聚合条目内容清理：去尾注、去 Markdown 标题头、合并空行，保证跨源格式统一 */
    private static String stripItemForDigest(String raw) {
        if (raw == null) return "";
        String s = raw.strip();
        // 去掉各种尾注行
        s = s.replaceAll("(?m)^> ARO 系统自动推送.*$", "");
        s = s.replaceAll("(?m)^> ARO 动物房环境监测.*$", "");
        s = s.replaceAll("(?m)^ARO 门禁监测.*$", "");
        // 去掉开头的 Markdown 标题（## xxx），保留内容主体
        s = s.replaceAll("(?m)^##\\s+.*$", "");
        // 合并 3+ 连续空行为双空行
        s = s.replaceAll("\\n{3,}", "\n\n");
        // 清理首尾空行
        s = s.strip();
        // 去掉首尾的 --- 分隔线
        s = s.replaceAll("^---+\\s*", "");
        s = s.replaceAll("\\s*---+$", "");
        return s.strip();
    }

    /** 检查用户是否对特定信息源和渠道设置了静默。
     *  @return true = 应跳过发送 */
    private boolean isMuted(String userId, String sourceCode, String channelCode) {
        try {
            UserNotifyMute mute = notifySettingService.getMute(userId, sourceCode);
            if (mute == null) return false; // 无记录 = 不静默
            // 信息源总开关关闭 → 所有渠道跳过
            if (Boolean.FALSE.equals(mute.getEnabled())) return true;
            // 渠道级静默
            if (PushConstants.CHANNEL_EMAIL.equals(channelCode) && Boolean.TRUE.equals(mute.getMuteEmail()))
                return true;
            if (PushConstants.CHANNEL_SERVER_CHAN.equals(channelCode) && Boolean.TRUE.equals(mute.getMuteServerChan()))
                return true;
            if (PushConstants.CHANNEL_WXPUSHER.equals(channelCode) && Boolean.TRUE.equals(mute.getMuteWxpusher()))
                return true;
        } catch (Exception e) {
            log.warn("[Digest] failed to check mute for {}/{}: {}", userId, sourceCode, e.getMessage());
        }
        return false;
    }

    /** 将聚合摘要用的轻量 Markdown 转为 HTML（专用于 EMAIL 渠道） */
    private static String markdownToHtml(String md) {
        if (md == null) return "";
        String s = md;
        // 标题 ## xxx
        s = s.replaceAll("(?m)^##\\s+(.+)$", "<h2 style='font-size:16px;margin:16px 0 8px'>$1</h2>");
        // 粗体 **xxx**
        s = s.replaceAll("\\*\\*(.+?)\\*\\*", "<b>$1</b>");
        // 分隔线 ---
        s = s.replaceAll("(?m)^---\\s*$", "<hr style='border:none;border-top:1px solid #e2e8f0;margin:12px 0'>");
        // 引用 > xxx
        s = s.replaceAll("(?m)^>\\s?(.+)$", "<blockquote style='color:#64748b;border-left:3px solid #cbd5e1;padding-left:12px;margin:8px 0'>$1</blockquote>");
        // 换行
        s = s.replaceAll("\n\n", "<br><br>");
        s = s.replaceAll("\n", "<br>");
        return s;
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
        // ① 先查 sys_user（教职工）
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
        // Server酱：sys_user.send_key（所有渠道的兜底）
        List<Map<String, String>> keys = userMapper.findSendKeysByIds(List.of(userId));
        if (keys != null && !keys.isEmpty()) {
            String sk = keys.get(0).get("send_key");
            if (sk != null && !sk.isBlank()) return sk;
        }

        // ② 再查 aro_personnel（学生端）
        if (aroPersonnelMapper != null) {
            if ("EMAIL".equals(channelCode)) {
                String email = aroPersonnelMapper.findContactEmailByUserId(userId);
                if (email != null && !email.isBlank()) return email;
            }
            if ("WXPUSHER".equals(channelCode)) {
                String wuid = aroPersonnelMapper.findWxPusherUidByUserId(userId);
                if (wuid != null && !wuid.isBlank()) return wuid;
            }
            String sk = aroPersonnelMapper.findSendKeyByUserId(userId);
            if (sk != null && !sk.isBlank()) return sk;
        }
        return null;
    }
}
