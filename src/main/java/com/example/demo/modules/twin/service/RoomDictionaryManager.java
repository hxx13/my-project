package com.example.demo.modules.twin.service;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class RoomDictionaryManager {

    // 💥 彻底修改：Key 变为 String，防范任何精度丢失
    private final Map<String, RoomMapping> dictionary = new ConcurrentHashMap<>();

    // 🏆 极其丰满的孪生空间实体类
    public static class RoomMapping {
        public String shelfId;       // 💥 索引 0: 架子 ID (改为 String)
        public String areaId;      // 索引 1: 区域 ID
        public String floorName;   // 索引 4: 楼层名称 (如 "3A")
        public String officialRoomId;// 💥 索引 5: 官方房间 ID (改为 String)
        public String roomName;    // 索引 6: 房间名称 (如 "303A")
        public String shelfName;   // 索引 7: 架子名称 (如 "303-1")

        // 💥 前端大屏专属展示字段：拼接楼层与房间名
        public String displayName;

        // 💥 构造函数同步全部改为 String
        public RoomMapping(String shelfId, String areaId, String floorName, String officialRoomId, String roomName, String shelfName) {
            this.shelfId = shelfId;
            this.areaId = areaId;
            this.floorName = floorName;
            this.officialRoomId = officialRoomId;
            this.roomName = roomName;
            this.shelfName = shelfName;

            // 💥 拼接逻辑：如果楼层和房间名都有，就拼起来；否则有什么显什么
            if (!floorName.isEmpty() && !roomName.isEmpty()) {
                this.displayName = floorName + " - " + roomName; // 效果："3A - 303A"
            } else {
                this.displayName = floorName + roomName;
            }
        }
    }

    @PostConstruct
    public void initDictionary() {
        System.out.println("⏳ [字典装载] 正在解析多层级空间映射表 room_mapping.csv ...");

        try {
            ClassPathResource resource = new ClassPathResource("room_mapping.csv");
            BufferedReader reader = new BufferedReader(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8));

            String line;
            boolean isFirstLine = true;

            while ((line = reader.readLine()) != null) {
                if (isFirstLine) {
                    if (line.startsWith("\uFEFF")) {
                        line = line.substring(1);
                    }
                    isFirstLine = false;
                    continue;
                }

                String[] columns = line.split(",", -1);

                if (columns.length >= 8) {
                    try {
                        // 💥 直接拿 String，不再做任何 Long.parseLong 转换！
                        String officialIdStr = columns[5].trim().replace("\"", "");
                        if (officialIdStr.isEmpty()) continue;

                        String shelfIdStr = columns[0].trim().replace("\"", "");
                        String areaId = columns[1].trim().replace("\"", "");
                        String floorName = columns[4].trim().replace("\"", "");
                        String roomName = columns[6].trim().replace("\"", "");
                        String shelfName = columns[7].trim().replace("\"", "");

                        RoomMapping mapping = new RoomMapping(shelfIdStr, areaId, floorName, officialIdStr, roomName, shelfName);

                        dictionary.put(officialIdStr, mapping);

                    } catch (Exception e) {
                        // 忽略脏数据或越界错误
                    }
                }
            }
            reader.close();
            System.out.println("✅ [字典装载] 满血完成！成功映射了 " + dictionary.size() + " 个绝对空间坐标！");

        } catch (Exception e) {
            System.err.println("❌ [字典装载] 严重失败！无法读取 room_mapping.csv！报错：" + e.getMessage());
        }
    }

    // 💥 签名修改：接收 String 参数
    public RoomMapping translate(String officialRoomId) {
        return dictionary.get(officialRoomId);
    }
}