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
            flushSourcesNow(nightEndSources);
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
            for (String sc : grouped.keySet()) {
                try {
                    sourceNames.add(sourceService.getByCode(sc).getSourceName());
                } catch (Exception e) {
                    sourceNames.add(sc);
                }
            }
            List<String> groupedKeys = new ArrayList<>(grouped.keySet());
            Map<String, String> nameByCode = new LinkedHashMap<>();
            for (int gi = 0; gi < groupedKeys.size(); gi++) {
                nameByCode.put(groupedKeys.get(gi), sourceNames.get(gi));
            }
            appendGroups(body, grouped, nameByCode);

            String templateTitle = null, templateContent = null;
            NotifyDigestDefaultConfig def = templateFor(matchedItems, grouped);
            if (def != null && def.getDigestTitleTpl() != null && !def.getDigestTitleTpl().isBlank()) {
                templateTitle = def.getDigestTitleTpl();
                templateContent = def.getDigestContentTpl();
            }

            // ── 超长拆分：每 ~2000 字符一批，标记序号 ──
            final int MAX_CHUNK = 2000;
            List<String> chunks = new ArrayList<>();
            if (body.length() <= MAX_CHUNK) {
                chunks.add(body.toString());
            } else {
                StringBuilder buf = new StringBuilder();
                for (var entry : grouped.entrySet()) {
                    String srcLabel = sourceNames.get(grouped.keySet().stream().toList().indexOf(entry.getKey()));
                    // 表格型条目逐行相邻，分隔符用 \n；其他源保持 \n\n，与所有其它组装路径一致。
                    boolean tableItems = entry.getValue().stream().anyMatch(DigestScheduler::looksLikeTableRow);
                    String sep = tableItems ? "\n" : "\n\n";
                    String tableHead = tableItems ? tableHeadBlock(entry.getValue()) : null;
                    // 标签：组的第一片、以及每次拆片后都要交代"这是哪个分组"。
                    // （首片漏标签是实测踩到的：只在一页里看不出问题，多源或翻页时分不清段落归属）
                    boolean needLabel = true;
                    // 表头：**只在续片补**。首片的表头由该组第一条明细自带（写入方拼进去的），
                    // 两处都补就会重复出一个"没有数据行的空表头"——实测踩过。
                    boolean needHead = false;
                    for (NotifyDigestItem it : entry.getValue()) {
                        String line = it.getContent() != null && !it.getContent().isBlank()
                                ? it.getContent() : it.getTitle();
                        if (line == null || line.isBlank()) continue;
                        String block = stripItemForDigest(line) + sep;
                        if (buf.length() + block.length() > MAX_CHUNK && buf.length() > 0) {
                            chunks.add(buf.toString().trim());
                            buf.setLength(0);
                            needLabel = true;
                            needHead = true;
                        }
                        if (needLabel) {
                            // 分组之间要空一行：上一段结尾是数据行或卡片尾，紧邻下一段时
                            // 部分渲染器会把表格尾部吃掉。
                            if (buf.length() > 0 && !buf.toString().endsWith("\n\n")) buf.append('\n');
                            // 标签与表头之间也必须留空行：紧邻的普通文字会被当成表格的段落延续，
                            // 整块退化成裸竖线文本（原因见 appendGroups）。
                            // 标签一律普通文字行，不用 `## `（会渲染成超大号字，且与卡片自带标题重复）。
                            buf.append(srcLabel).append("\n\n");
                            if (needHead && tableHead != null) buf.append(tableHead);
                            needLabel = false;
                            needHead = false;
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
                // 页码后缀必须自成一段。表格正文的最后一行是数据行，直接拼上去会被当成多出来的
                // 一个单元格，把表体结构破坏掉——实测症状是整张表渲染不出来、上方大片留白。
                String baseContent = renderDigestContent(templateContent, userName, matchedItems.size(),
                        dateTimeStr, chunks.get(pi));
                String content = pageSuffix.isEmpty() ? baseContent
                        : baseContent.stripTrailing() + "\n\n" + pageSuffix;

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

    /**
     * 立刻冲刷指定源的待发明细。两条路径用：① 夜间结束冲刷；② 源未启用聚合时，
     * 由写入方在写完明细后调用，让"内存缓冲攒下的一批"仍然只出一条消息（而不是逐条推送）。
     */
    public void flushSourcesNow(Set<String> sources) {
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

    /**
     * 把当前用户的全部明细按源分组追加到正文。
     *
     * <p>两条投递路径（定时聚合 {@code tick} 与立刻冲刷 {@code flushSourcesForUsers}）**必须共用本方法**：
     * 只修一条会让另一条把表格行按散文拼接、把表格打断。
     *
     * <p>分组标签一律用**普通文字行**，不用 Markdown 标题：`## xxx` 会被渲染成超大号字（实测观感
     * 很差），而且卡片模板自己已经带标题，再加一个 Markdown 标题就重复成两行。
     *
     * <p>表格型分组（条目以 {@code |} 开头）的条目之间用单换行相邻，否则空行会截断 GFM 表体。
     */
    private void appendGroups(StringBuilder body, Map<String, List<NotifyDigestItem>> grouped,
                              Map<String, String> sourceNameByCode) {
        for (var entry : grouped.entrySet()) {
            String srcLabel = sourceNameByCode.getOrDefault(entry.getKey(), entry.getKey());
            boolean tableItems = entry.getValue().stream().anyMatch(DigestScheduler::looksLikeTableRow);
            // 标签之后**必须是空行**再跟表头：Markdown 里紧邻的普通文字行会被当成表格的段落延续，
            // 整块退化成裸竖线文本（实测踩过——标签和表头之间只隔一个换行，表格就不渲染了）。
            // 标签一律用普通文字行，不用 `## `：Markdown 二级标题会被渲染成超大号字（实测观感很差），
            // 而且卡片模板自己已经带标题了，再加一个 Markdown 标题就重复成两行。
            body.append(srcLabel).append("\n\n");
            for (NotifyDigestItem it : entry.getValue()) {
                String line = it.getContent() != null && !it.getContent().isBlank()
                        ? it.getContent() : it.getTitle();
                if (line == null || line.isBlank()) continue;
                body.append(stripItemForDigest(line)).append(tableItems ? "\n" : "\n\n");
            }
            // 表格组也要以空行收尾：下一组会以 `## 标题` 或标签开头，紧贴表格最后一行时
            // 部分渲染器会把表格尾部吃掉。
            body.append(tableItems ? "\n\n" : "---\n\n");
        }
    }

    /**
     * 从表格组的第一条明细里取出"表头块"（含分隔行）。
     *
     * <p>分片时新片要以它开头：只续数据行、没有表头与分隔行的续片不是表格，会被渲染成裸竖线文本。
     * 表头由写入方并入该组第一条明细（见 {@code TelemetryAlarmLineFormatter#tableHeader}），
     * 所以这里从第一条里切出"到分隔行为止"的这几行。
     *
     * @return 表头块；该组没带表头时返回 null（无从补起，只能保持原样）
     */
    private static String tableHeadBlock(List<NotifyDigestItem> group) {
        if (group == null || group.isEmpty()) return null;
        NotifyDigestItem first = group.get(0);
        String c = first.getContent() != null && !first.getContent().isBlank()
                ? first.getContent() : first.getTitle();
        if (c == null) return null;
        StringBuilder head = new StringBuilder();
        for (String ln : stripItemForDigest(c).split("\n", -1)) {
            head.append(ln).append('\n');
            if (isSeparatorRow(ln)) return head.toString();
        }
        return null;
    }

    /**
     * 选这份摘要用哪个模板。**只有明细全来自同一个源时**才用该源的模板——混了多个源时
     * 任何一家的措辞都会借错（例如把物资领用算进"条环境动态"），退回默认通用模板。
     */
    private NotifyDigestDefaultConfig templateFor(List<NotifyDigestItem> items,
                                                  Map<String, List<NotifyDigestItem>> grouped) {
        if (grouped.size() > 1) {
            log.info("[Digest] 明细跨 {} 个源，退回默认通用模板", grouped.size());
            return null;
        }
        try {
            return defaultConfigMapper.findBySourceCode(items.get(0).getSourceCode());
        } catch (Exception e) {
            return null;
        }
    }

    /** 向用户发送一份摘要 */
    private void sendDigestToUser(String userId, List<NotifyDigestItem> items) {
        String userName = displayNameService.resolveDisplayName(userId);
        // 按 source 分组排版
        Map<String, List<NotifyDigestItem>> grouped = items.stream()
                .collect(java.util.stream.Collectors.groupingBy(NotifyDigestItem::getSourceCode, LinkedHashMap::new, java.util.stream.Collectors.toList()));
        Map<String, String> nameByCode = new LinkedHashMap<>();
        for (String sc : grouped.keySet()) {
            String n = sc;
            try { n = sourceService.getByCode(sc).getSourceName(); } catch (Exception ignored) {}
            nameByCode.put(sc, n);
        }
        StringBuilder body = new StringBuilder();
        appendGroups(body, grouped, nameByCode);
        String dateTimeStr = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String tTitle = null, tContent = null;
        NotifyDigestDefaultConfig def = templateFor(items, grouped);
        if (def != null && def.getDigestTitleTpl() != null && !def.getDigestTitleTpl().isBlank()) {
            tTitle = def.getDigestTitleTpl();
            tContent = def.getDigestContentTpl();
        }
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
                : "{userName}，{count} 条新通知\n\n{items}";
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

    /** 条目是不是 Markdown 表格的一行（管道行）。表格型条目要求相邻拼接，判据必须来自内容本身。 */
    private static boolean looksLikeTableRow(NotifyDigestItem item) {
        String c = item.getContent() != null && !item.getContent().isBlank()
                ? item.getContent() : item.getTitle();
        return c != null && c.stripLeading().startsWith("|");
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
        // GFM 管道表 → <table>。必须放在换行规则之前，否则行间会被塞进 <br> 破坏结构。
        s = convertPipeTables(s);
        // 分隔线 ---
        s = s.replaceAll("(?m)^---\\s*$", "<hr style='border:none;border-top:1px solid #e2e8f0;margin:12px 0'>");
        // 引用 > xxx
        s = s.replaceAll("(?m)^>\\s?(.+)$", "<blockquote style='color:#64748b;border-left:3px solid #cbd5e1;padding-left:12px;margin:8px 0'>$1</blockquote>");
        // 换行
        s = s.replaceAll("\n\n", "<br><br>");
        s = s.replaceAll("\n", "<br>");
        return s;
    }

    /**
     * 把连续的 GFM 管道表转成 HTML 表格。表体里的内联 HTML（例如 {@code <span style="color:…">}）
     * 原样保留——邮件客户端是 HTML 渲染，颜色照样生效。
     *
     * <p>只处理"表头 + 分隔行 + 至少一行数据"的完整结构；分隔行（{@code |:--|--:|}）用
     * 是否有 {@code -} 判断，因此不会把普通文本误判成表格。
     */
    private static String convertPipeTables(String md) {
        String[] lines = md.split("\n", -1);
        StringBuilder out = new StringBuilder();
        int i = 0;
        while (i < lines.length) {
            int sep = i + 1;
            if (lines[i].stripLeading().startsWith("|")
                    && sep < lines.length
                    && isSeparatorRow(lines[sep])) {
                // 收集表头 + 分隔行 + 后续所有管道行
                List<String> table = new ArrayList<>();
                table.add(lines[i]);
                table.add(lines[sep]);
                int j = sep + 1;
                while (j < lines.length && lines[j].stripLeading().startsWith("|")) {
                    table.add(lines[j]);
                    j++;
                }
                out.append(renderTable(table));
                i = j;
                continue;
            }
            out.append(lines[i]);
            if (i < lines.length - 1) out.append('\n');
            i++;
        }
        return out.toString();
    }

    /** 分隔行形如 |:--|--:|，每个格子只由 : 与 - 组成。 */
    private static boolean isSeparatorRow(String line) {
        if (line == null) return false;
        String t = line.strip();
        if (!t.startsWith("|")) return false;
        for (String cell : t.split("\\|")) {
            String c = cell.strip();
            if (c.isEmpty()) continue;
            if (!c.matches(":?-{2,}:?")) return false;
        }
        return true;
    }

    private static String renderTable(List<String> rows) {
        StringBuilder sb = new StringBuilder();
        sb.append("<table style='border-collapse:collapse;font-size:13px;margin:8px 0'>");
        for (int r = 0; r < rows.size(); r++) {
            if (r == 1) continue; // 分隔行不渲染
            boolean header = r == 0;
            String tag = header ? "th" : "td";
            sb.append("<tr>");
            for (String cell : splitCells(rows.get(r))) {
                String style = "border:1px solid #e2e8f0;padding:4px 8px;"
                        + (header ? "font-weight:700;background:#f8fafc;text-align:left" : "");
                sb.append("<").append(tag).append(" style='").append(style).append("'>")
                        .append(cell).append("</").append(tag).append(">");
            }
            sb.append("</tr>");
        }
        return sb.append("</table>").toString();
    }

    /** 去掉首尾的竖线后按格切分。 */
    private static List<String> splitCells(String row) {
        String t = row.strip();
        if (t.startsWith("|")) t = t.substring(1);
        if (t.endsWith("|")) t = t.substring(0, t.length() - 1);
        List<String> cells = new ArrayList<>();
        for (String c : t.split("\\|", -1)) cells.add(c.strip());
        return cells;
    }

    /** 去除 HTML + Markdown 标签，保留纯文本 */
    private static String plainText(String s) {
        if (s == null) return "";
        return s.replaceAll("<[^>]+>", " ")
                .replaceAll("[*#>`_~]", "")
                .replaceAll("\\s+", " ")
                .trim();
    }

    /**
     * 今天是否落在该配置的可发送星期内。包级可见：{@link DigestResolutionService#isSourceAggregatedNow}
     * 要用同一个判据，两边判据一旦不一致就会出现"写了明细却永远不投递"的静默积压。
     */
    static boolean isTodayActive(String scheduleDays, int todayDow) {
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
