package com.example.demo.modules.accessfusion.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AccessFusionRoomResolver {

    private final JdbcTemplate jdbcTemplate;
    private volatile Map<String, RoomCtx> byChannel = Map.of();

    public AccessFusionRoomResolver(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void refreshCache() {
        List<RoomCtx> rows =
                jdbcTemplate.query(
                        """
                        SELECT c.channel_code, r.room_id, r.room_name, r.region_name, r.floor_name
                        FROM room_mapping_channel c
                        INNER JOIN room_mapping_room r ON r.room_id = c.room_id
                        """,
                        (rs, i) ->
                                new RoomCtx(
                                        rs.getString("channel_code"),
                                        rs.getString("room_id"),
                                        rs.getString("room_name"),
                                        rs.getString("region_name"),
                                        rs.getString("floor_name")));
        Map<String, RoomCtx> map = new HashMap<>();
        for (RoomCtx ctx : rows) {
            map.put(ctx.channelCode, ctx);
        }
        byChannel = map;
    }

    public RoomCtx resolve(String channelCode) {
        if (byChannel.isEmpty()) {
            refreshCache();
        }
        return byChannel.get(channelCode);
    }

    public String projectGroupsForUser(String userId) {
        if (userId == null || userId.isBlank()) {
            return null;
        }
        List<String> names =
                jdbcTemplate.query(
                        "SELECT project_group_name FROM aro_personnel WHERE user_id = ? AND project_group_name IS NOT NULL AND project_group_name != '' LIMIT 3",
                        (rs, i) -> rs.getString(1),
                        userId);
        if (names.isEmpty()) {
            return null;
        }
        return String.join(",", names);
    }

    public record RoomCtx(String channelCode, String roomId, String roomName, String areaName, String floorName) {}
}
