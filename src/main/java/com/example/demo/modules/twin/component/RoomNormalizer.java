package com.example.demo.modules.twin.component;

import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * 🌟 数字孪生空间锚点清洗器 (Room Normalizer)
 * 作用：抹平各个子系统（大华、ARO、西门子）在房间命名上的物理差异，
 * 向前端 UE5 输出唯一、绝对的 3D 模型标识符！
 */
@Component
public class RoomNormalizer {

    // 1. 暴力硬编码字典 (优先级最高)
    // 如果两边名字完全没规律，比如大华叫 "E11A-B110"，ARO叫 "110"，就在这里写死映射！
    private static final Map<String, String> HARDCODE_MAP = new HashMap<>();
    static {
        // 例子：左边是大华的恶心名字，右边是提供给 UE5 的干净名字
        // HARDCODE_MAP.put("实验楼401北侧换鞋室", "401");
        // HARDCODE_MAP.put("E11A-B110换鞋室", "B110");
    }

    /**
     * 核心清洗逻辑
     * @param rawRoomName 原始系统传来的房间名 (如 "401换鞋室" 或 "401")
     * @return 孪生锚点绝对名称 (如 "401")
     */
    public String normalize(String rawRoomName) {
        if (rawRoomName == null || rawRoomName.trim().isEmpty()) {
            return "未知空间";
        }

        // 1. 查字典：如果是极其特殊的特例，直接返回字典里的干净名字
        if (HARDCODE_MAP.containsKey(rawRoomName)) {
            return HARDCODE_MAP.get(rawRoomName);
        }

        // 2. 智能正则清洗：(最常用的方法)
        // 如果大华的名字总是在 ARO 房间号后面加 "换鞋室"、"门禁" 等字眼，我们直接把它切掉！
        String cleanName = rawRoomName
                .replaceAll("换鞋室", "")
                .replaceAll("大门", "")
                .replaceAll("门禁", "")
                .replaceAll("通道", "")
                .trim();

        return cleanName;
    }
}