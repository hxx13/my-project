package com.example.demo.modules.avidity.service;

import com.example.demo.modules.avidity.client.AvidityClient;
import com.example.demo.modules.avidity.entity.AvidityAlarmCurrent;
import com.example.demo.modules.avidity.entity.AvidityAlarmStat;
import com.example.demo.modules.avidity.entity.AvidityChannel;
import com.example.demo.modules.avidity.mapper.AvidityAlarmCurrentMapper;
import com.example.demo.modules.avidity.mapper.AvidityAlarmStatMapper;
import com.example.demo.modules.avidity.entity.AvidityLayoutPoint;
import com.example.demo.modules.avidity.mapper.AvidityChannelMapper;
import com.example.demo.modules.avidity.mapper.AvidityLayoutPointMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 安维迪数据的只读出口。通道 → 设备 的展开在这里做，调用方按通道取数时不用自己拼设备清单。
 */
@Service
public class AvidityQueryService {

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    private final AvidityChannelMapper channelMapper;
    private final AvidityAlarmStatMapper alarmStatMapper;
    private final AvidityAlarmCurrentMapper alarmCurrentMapper;
    private final AvidityClient client;
    private final ObjectMapper objectMapper;
    private final AvidityLayoutPointMapper layoutPointMapper;

    public AvidityQueryService(AvidityChannelMapper channelMapper,
                               AvidityAlarmStatMapper alarmStatMapper,
                               AvidityAlarmCurrentMapper alarmCurrentMapper,
                               AvidityClient client,
                               ObjectMapper objectMapper,
                               AvidityLayoutPointMapper layoutPointMapper) {
        this.channelMapper = channelMapper;
        this.alarmStatMapper = alarmStatMapper;
        this.alarmCurrentMapper = alarmCurrentMapper;
        this.client = client;
        this.objectMapper = objectMapper;
        this.layoutPointMapper = layoutPointMapper;
    }

    public List<AvidityChannel> channels() {
        return channelMapper.selectAll();
    }

    /**
     * 某日的告警统计。channelId 为空 = 全部；statDate 为空 = 今天（北京时区）。
     */
    public List<AvidityAlarmStat> alarmStats(LocalDate statDate, Long channelId) {
        LocalDate day = statDate != null ? statDate : LocalDate.now(ZONE);
        return alarmStatMapper.selectByDate(day, deviceIdsOf(channelId));
    }

    public List<AvidityAlarmCurrent> currentAlarms() {
        return alarmCurrentMapper.selectAll();
    }

    public boolean upstreamEnabled() {
        return client.isEnabled();
    }

    /**
     * 某通道的平面图布局。布局是按「厂平台组态画面 ID」存的静态资源
     * （{@code resources/avidity/<画面ID>.json}），由 AviditySyncService 从通道内容块里读出来存进通道表。
     * 返回 null 表示这个通道还没同步到画面 ID、或本地没有对应那份布局。
     */
    public JsonNode floorPlan(Long channelId) {
        AvidityChannel target = null;
        for (AvidityChannel channel : channelMapper.selectAll()) {
            if (channelId == null || channelId.equals(channel.getChannelId())) {
                target = channel;
                break;
            }
        }
        if (target == null || target.getConfigureViewId() == null) {
            return null;
        }
        ClassPathResource resource = new ClassPathResource("avidity/" + target.getConfigureViewId() + ".json");
        if (!resource.exists()) {
            return null;
        }
        try (InputStream in = resource.getInputStream()) {
            JsonNode layout = objectMapper.readTree(in);
            applyOverrides(layout, target.getChannelId());
            return layout;
        } catch (Exception e) {
            throw new IllegalStateException("读取平面图布局失败 viewId=" + target.getConfigureViewId(), e);
        }
    }

    /** 把后台拖拽保存的位置覆盖到布局资源上（资源是静态文件，改它要改代码 + 发版）。 */
    private void applyOverrides(JsonNode layout, Long channelId) {
        List<AvidityLayoutPoint> overrides = layoutPointMapper.selectByChannel(channelId);
        if (overrides.isEmpty() || !layout.isObject()) {
            return;
        }
        Map<String, AvidityLayoutPoint> byKey = new HashMap<>();
        for (AvidityLayoutPoint o : overrides) {
            byKey.put(o.getRoomCode() + "/" + o.getRackCode() + "/" + o.getPointNo(), o);
        }
        for (JsonNode room : layout.path("rooms")) {
            String roomCode = room.path("room").asText("");
            for (JsonNode rack : room.path("racks")) {
                String rackCode = rack.path("rack").asText("");
                for (JsonNode point : rack.path("points")) {
                    AvidityLayoutPoint o = byKey.get(roomCode + "/" + rackCode + "/" + point.path("no").asInt());
                    if (o != null && point instanceof ObjectNode node) {
                        node.put("x", o.getPosX());
                        node.put("y", o.getPosY());
                    }
                }
            }
        }
    }


    /** 保存一批手动位置（拖拽后点保存）。 */
    public int saveLayoutPoints(Long channelId, List<AvidityLayoutPoint> points) {
        int n = 0;
        for (AvidityLayoutPoint p : points) {
            p.setChannelId(channelId);
            layoutPointMapper.upsert(p);
            n++;
        }
        return n;
    }

    /** 恢复默认版式：清掉该通道的手动覆盖。 */
    public int resetLayoutPoints(Long channelId) {
        return layoutPointMapper.deleteByChannel(channelId);
    }

    /** 指定通道下挂的设备；channelId 为空则不限定。 */
    private LinkedHashSet<Long> deviceIdsOf(Long channelId) {
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        for (AvidityChannel channel : channelMapper.selectAll()) {
            if (channelId == null || channelId.equals(channel.getChannelId())) {
                ids.add(channel.getVirtualDeviceId());
            }
        }
        return ids;
    }
}
