package com.example.demo.modules.broadcast.service;

import com.example.demo.modules.broadcast.client.DsppaClient;
import com.example.demo.modules.broadcast.dto.ZoneView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 广播分区与音量。平台的分区读写都封在 {@link DsppaClient} 里，这里只做视图转换。
 */
@Service
public class BroadcastZonesService {

    private static final Logger log = LoggerFactory.getLogger(BroadcastZonesService.class);

    private final DsppaClient client;

    public BroadcastZonesService(DsppaClient client) {
        this.client = client;
    }

    /** 分区清单（含音量、播放状态、当前曲目）。 */
    public List<ZoneView> listZones() {
        List<Map<String, Object>> raw = client.fetchZones();
        List<ZoneView> out = new ArrayList<>(raw.size());
        for (Map<String, Object> z : raw) {
            out.add(toView(z));
        }
        return out;
    }

    /** 批量设音量。 */
    public void setVolume(List<String> macs, Integer volume) {
        if (volume == null) {
            throw new IllegalArgumentException("未指定音量");
        }
        client.requireReady();
        client.setVolume(macs, volume);
        log.info("[广播] 设置音量 macs={} volume={}", macs, volume);
    }

    /** 按 MAC 找回分区名，写播放记录与日志时用。 */
    public Map<String, String> nameByMac() {
        Map<String, String> map = new java.util.HashMap<>();
        try {
            for (Map<String, Object> z : client.fetchZones()) {
                Object mac = z.get("mac");
                Object name = z.get("name");
                if (mac != null && name != null) {
                    map.put(String.valueOf(mac), String.valueOf(name));
                }
            }
        } catch (Exception e) {
            log.debug("[广播] 取分区名失败: {}", e.getMessage());
        }
        return map;
    }

    private ZoneView toView(Map<String, Object> z) {
        Integer status = toInt(z.get("play_status"));
        Object song = z.get("source_name");
        String songText = song == null ? "" : String.valueOf(song);
        // 平台在没播时也会留着上一次的曲名，所以「有没有在播」只认状态码
        boolean playing = status != null && status == 1;
        return new ZoneView(
                toInt(z.get("id")),
                str(z.get("name")),
                str(z.get("ip")),
                str(z.get("mac")),
                toInt(z.get("volume")),
                status,
                ZoneView.playStatusText(status),
                playing ? songText : "",
                playing);
    }

    private static String str(Object o) {
        return o == null ? "" : String.valueOf(o);
    }

    private static Integer toInt(Object o) {
        if (o instanceof Number n) {
            return n.intValue();
        }
        if (o instanceof String s) {
            try {
                return Integer.parseInt(s.trim());
            } catch (Exception ignored) {
                return null;
            }
        }
        return null;
    }
}
