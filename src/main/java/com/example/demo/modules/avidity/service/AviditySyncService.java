package com.example.demo.modules.avidity.service;

import com.example.demo.modules.avidity.client.AvidityClient;
import com.example.demo.modules.avidity.entity.AvidityAlarmCurrent;
import com.example.demo.modules.avidity.entity.AvidityAlarmStat;
import com.example.demo.modules.avidity.entity.AvidityChannel;
import com.example.demo.modules.avidity.mapper.AvidityAlarmCurrentMapper;
import com.example.demo.modules.avidity.mapper.AvidityAlarmStatMapper;
import com.example.demo.modules.avidity.mapper.AvidityChannelMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 拉取安维迪「运营仪表盘」那一路数据落库，供我校前端直接查。
 *
 * <p>三件东西：<b>通道</b>（页面顶部的 tab）、<b>告警统计</b>（右侧那张表）、<b>当前报警</b>。
 * 前两者按天累计（同一窗口覆盖写），当前报警是快照（整表替换）。
 *
 * <p>先联网取全，再落库；落库那段走事务，避免「删完还没写完」时前端看到空 tab。
 */
@Service
public class AviditySyncService {

    private static final Logger log = LoggerFactory.getLogger(AviditySyncService.class);

    /** 平台给的时间是 UTC，落库统一换算成北京墙钟（与其它模块一致）。 */
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    private static final String P_DASHBOARDS = "/api/services/app/Dashboard/GetDashboards";
    private static final String P_DEVICES = "/api/services/Sdk/Device/GetDeviceList";
    private static final String P_ALARM_STAT = "/api/services/app/PresetReport/LoadAlarmStatisticsReport";
    private static final String P_ALARM_CURRENT = "/api/services/app/HistoryAlarm/GetCurrentAlarms";
    /** 历史接口一页拉多少条。平台单页上限未知，200 实测稳。 */
    /** 历史最多往回拉多少页，防平台突然返回超大 totalCount 把同步拖死。 */

    private final AvidityClient client;
    private final AvidityChannelMapper channelMapper;
    private final AvidityAlarmStatMapper alarmStatMapper;
    private final AvidityAlarmCurrentMapper alarmCurrentMapper;
    private final ObjectMapper objectMapper;
    private final TransactionTemplate transactionTemplate;

    public AviditySyncService(AvidityClient client,
                              AvidityChannelMapper channelMapper,
                              AvidityAlarmStatMapper alarmStatMapper,
                              AvidityAlarmCurrentMapper alarmCurrentMapper,
                              ObjectMapper objectMapper,
                              PlatformTransactionManager transactionManager) {
        this.client = client;
        this.channelMapper = channelMapper;
        this.alarmStatMapper = alarmStatMapper;
        this.alarmCurrentMapper = alarmCurrentMapper;
        this.objectMapper = objectMapper;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public record SyncResult(int channels, int alarmStats, int currentAlarms, String message) {
    }

    /**
     * 一轮完整同步。任何一步抛异常都会向上抛（由定时器兜住并记日志），
     * 不会因为「这一段没有数据」就把另一段的既有数据清掉。
     */
    public SyncResult syncAll() {
        if (!client.isEnabled()) {
            return new SyncResult(0, 0, 0, "已关闭（app.avidity.enabled=false）");
        }
        LocalDateTime now = LocalDateTime.now(ZONE);
        LocalDate today = now.toLocalDate();

        Map<Long, String> deviceNames = loadDeviceNames();
        List<AvidityChannel> channels = loadChannels(deviceNames, now);
        List<AvidityAlarmStat> alarmStats = loadAlarmStats(channels, today, now);
        List<AvidityAlarmCurrent> currentAlarms = loadCurrentAlarms(now);

        transactionTemplate.executeWithoutResult(status -> {
            channelMapper.deleteAll();
            channels.forEach(channelMapper::insert);
            alarmStats.forEach(alarmStatMapper::upsert);
            alarmCurrentMapper.deleteAll();
            currentAlarms.forEach(alarmCurrentMapper::insert);
        });

        String message = String.format("通道 %d、告警统计 %d 行、当前报警 %d 条",
                channels.size(), alarmStats.size(), currentAlarms.size());
        log.info("[安维迪同步] {}", message);
        return new SyncResult(channels.size(), alarmStats.size(), currentAlarms.size(), message);
    }

    /** 设备 ID → 设备名，用来把通道里引用的设备补上名字。 */
    private Map<Long, String> loadDeviceNames() {
        JsonNode result = client.post(P_DEVICES, Map.of());
        Map<Long, String> names = new HashMap<>();
        for (JsonNode device : result.path("items")) {
            long id = device.path("virtualDeviceId").asLong(device.path("id").asLong(0L));
            if (id > 0) {
                names.put(id, device.path("name").asText(null));
            }
        }
        return names;
    }

    /** 通道 = 平台的一个仪表盘；它内容块里引用的设备摊平成「通道 × 设备」行。 */
    private List<AvidityChannel> loadChannels(Map<Long, String> deviceNames, LocalDateTime now) {
        JsonNode dashboards = client.get(P_DASHBOARDS);
        List<AvidityChannel> rows = new ArrayList<>();
        for (JsonNode dashboard : dashboards) {
            long channelId = dashboard.path("id").asLong();
            String content = dashboard.path("content").asText("");
            Long viewId = configureViewIdOf(content, objectMapper);
            for (Long deviceId : referencedDeviceIds(content, objectMapper)) {
                AvidityChannel row = new AvidityChannel();
                row.setChannelId(channelId);
                row.setChannelName(dashboard.path("name").asText(""));
                row.setSortIndex(dashboard.path("index").asInt(0));
                row.setVirtualDeviceId(deviceId);
                row.setDeviceName(deviceNames.get(deviceId));
                row.setConfigureViewId(viewId);
                row.setSyncedAt(now);
                rows.add(row);
            }
        }
        return rows;
    }

    /**
     * 通道的「主画面」用的是哪个组态画面。前端拿它去取 resources/avidity/&lt;画面ID&gt;.json 那份平面图布局。
     * 取内容块里第一个非空 configureViewId（主画面块带这个字段；告警统计块不带）。
     */
    static Long configureViewIdOf(String contentJson, ObjectMapper objectMapper) {
        if (!StringUtils.hasText(contentJson)) {
            return null;
        }
        try {
            for (JsonNode element : objectMapper.readTree(contentJson)) {
                long viewId = element.path("props").path("configureViewId").asLong(0L);
                if (viewId > 0) {
                    return viewId;
                }
            }
        } catch (Exception e) {
            log.warn("[安维迪同步] 解析仪表盘画面 ID 失败: {}", e.getMessage());
        }
        return null;
    }

    /**
     * 从仪表盘的 content 里挖出它引用了哪些设备。content 是一段被转义过的 JSON 文本，
     * 两种内容块各带一份设备信息：主画面块在 {@code props.virtualDeviceId}，
     * 告警统计块在 {@code props.deviceVariables[]}。
     */
    static List<Long> referencedDeviceIds(String contentJson, ObjectMapper objectMapper) {
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        if (!StringUtils.hasText(contentJson)) {
            return List.of();
        }
        try {
            for (JsonNode element : objectMapper.readTree(contentJson)) {
                JsonNode props = element.path("props");
                long direct = props.path("virtualDeviceId").asLong(0L);
                if (direct > 0) {
                    ids.add(direct);
                }
                for (JsonNode device : props.path("deviceVariables")) {
                    long id = device.path("virtualDeviceId").asLong(0L);
                    if (id > 0) {
                        ids.add(id);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[安维迪同步] 解析仪表盘 content 失败，该通道本轮跳过: {}", e.getMessage());
        }
        return new ArrayList<>(ids);
    }

    /**
     * 告警统计按设备拉（同一台设备可能被多个通道引用，只拉一次）。
     * 窗口固定为「今天」，与平台页面默认口径一致。
     */
    private List<AvidityAlarmStat> loadAlarmStats(List<AvidityChannel> channels, LocalDate today,
                                                  LocalDateTime now) {
        Collection<Long> deviceIds = new LinkedHashSet<>(
                channels.stream().map(AvidityChannel::getVirtualDeviceId).toList());
        List<AvidityAlarmStat> rows = new ArrayList<>();
        for (Long deviceId : deviceIds) {
            Map<String, Object> body = Map.of(
                    "virtualDeviceIds", List.of(deviceId),
                    "startTime", today + " 00:00:00",
                    "endTime", today + " 23:59:59");
            JsonNode result = client.post(P_ALARM_STAT, body);
            for (JsonNode item : result.path("loadAlarmStatisticsReportResultDto")) {
                String alarmName = item.path("alarmName").asText("");
                String alarmContent = item.path("alarmContent").asText(null);
                for (JsonNode deviceAlarm : item.path("deviceAlarms")) {
                    AvidityAlarmStat row = new AvidityAlarmStat();
                    row.setStatDate(today);
                    row.setVirtualDeviceId(deviceId);
                    row.setDeviceName(deviceAlarm.path("deviceName").asText(null));
                    row.setAlarmName(alarmName);
                    row.setAlarmContent(alarmContent);
                    row.setAlarmCount(deviceAlarm.path("alarmCount").asInt(0));
                    row.setSyncedAt(now);
                    rows.add(row);
                }
            }
        }
        return rows;
    }

    private List<AvidityAlarmCurrent> loadCurrentAlarms(LocalDateTime now) {
        JsonNode result = client.get(P_ALARM_CURRENT);
        List<AvidityAlarmCurrent> rows = new ArrayList<>();
        for (JsonNode alarm : result.path("items")) {
            String alarmId = alarm.path("id").asText("");
            if (!StringUtils.hasText(alarmId)) {
                continue;
            }
            AvidityAlarmCurrent row = new AvidityAlarmCurrent();
            row.setAlarmId(alarmId);
            row.setVirtualDeviceId(alarm.path("virtualDeviceId").asLong(0L));
            row.setDeviceName(alarm.path("deviceName").asText(null));
            row.setAlarmName(alarm.path("name").asText(null));
            row.setMessage(alarm.path("message").asText(null));
            row.setState(alarm.hasNonNull("state") ? alarm.path("state").asInt() : null);
            row.setAlarmLevel(alarm.hasNonNull("alarmLevel") ? alarm.path("alarmLevel").asInt() : null);
            row.setAlarmGroupName(alarm.path("alarmGroupName").asText(null));
            row.setTriggeredTime(toBeijing(alarm.path("triggeredTime").asText(null)));
            row.setSyncedAt(now);
            rows.add(row);
        }
        return rows;
    }

    private static LocalDateTime toBeijing(String isoUtc) {
        if (!StringUtils.hasText(isoUtc)) {
            return null;
        }
        try {
            return Instant.parse(isoUtc).atZone(ZONE).toLocalDateTime();
        } catch (Exception e) {
            log.warn("[安维迪同步] 触发时刻解析失败，记空: {}", isoUtc);
            return null;
        }
    }
}
