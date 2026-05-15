package com.example.demo.modules.dahua.component;

import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;

@Component
public class RoomLoader {
    private final Map<String, String> roomMap = new HashMap<>();

    @PostConstruct
    public void init() {
        try (InputStream is = getClass().getClassLoader().getResourceAsStream("room-map.properties")) {
            if (is != null) {
                Properties props = new Properties();
                props.load(new InputStreamReader(is, StandardCharsets.UTF_8));
                props.forEach((k, v) -> roomMap.put(String.valueOf(k).trim(), String.valueOf(v).trim()));
                System.out.println("✅ [映射表] 已加载 " + roomMap.size() + " 个房间翻译规则");
            }
        } catch (Exception e) {
            System.err.println("❌ [映射表] 加载异常: " + e.getMessage());
        }
    }

    public String getAlias(String channelCode) {
        // 如果映射表里有，就用你的漂亮名称；没有，就显示原始编码
        return roomMap.getOrDefault(channelCode, "未定义区域(" + channelCode + ")");
    }

    public boolean isKnownRoom(String channelCode) {
        return roomMap.containsKey(channelCode);
    }
}