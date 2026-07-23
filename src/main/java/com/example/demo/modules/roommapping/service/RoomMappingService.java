package com.example.demo.modules.roommapping.service;

import com.example.demo.modules.roommapping.dto.OfficialPermissionLevelPatchRequest;
import com.example.demo.modules.roommapping.dto.RoomMappingImportStats;
import com.example.demo.modules.roommapping.dto.RoomMappingRoomView;
import com.example.demo.modules.roommapping.entity.RoomMappingChannel;
import com.example.demo.modules.roommapping.entity.RoomMappingRoom;
import com.example.demo.modules.roommapping.mapper.RoomMappingChannelMapper;
import com.example.demo.modules.roommapping.mapper.RoomMappingRoomMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class RoomMappingService {

    private static final String CSV_PATH = "room_mapping.csv";

    private final RoomMappingRoomMapper roomMapper;
    private final RoomMappingChannelMapper channelMapper;

    public RoomMappingService(RoomMappingRoomMapper roomMapper, RoomMappingChannelMapper channelMapper) {
        this.roomMapper = roomMapper;
        this.channelMapper = channelMapper;
    }

    /**
     * 按房间 ID 返回大华通道 resourceCode 列表（排序与落库一致）。
     */
    public List<String> resolveChannelCodes(String roomId) {
        if (!StringUtils.hasText(roomId)) {
            return List.of();
        }
        List<RoomMappingChannel> list = channelMapper.selectByRoomId(roomId.trim());
        if (list == null || list.isEmpty()) {
            return List.of();
        }
        return list.stream().map(RoomMappingChannel::getChannelCode).filter(StringUtils::hasText).toList();
    }

    public RoomMappingRoomView findByRoomIdWithChannels(String roomId) {
        RoomMappingRoomView v = new RoomMappingRoomView();
        if (!StringUtils.hasText(roomId)) {
            return v;
        }
        RoomMappingRoom r = roomMapper.selectByRoomId(roomId.trim());
        if (r == null) {
            return v;
        }
        copyRoom(v, r);
        List<RoomMappingChannel> ch = channelMapper.selectByRoomId(r.getRoomId());
        if (ch != null) {
            for (RoomMappingChannel c : ch) {
                v.getChannelCodes().add(c.getChannelCode());
                RoomMappingRoomView.ChannelItem ci = new RoomMappingRoomView.ChannelItem();
                ci.setChannelCode(c.getChannelCode());
                ci.setLabel(c.getLabel());
                ci.setSortOrder(c.getSortOrder());
                v.getChannels().add(ci);
            }
        }
        return v;
    }

    @Transactional
    public RoomMappingRoomView updateOfficialPermissionLevel(String roomId, OfficialPermissionLevelPatchRequest body) {
        if (!StringUtils.hasText(roomId)) {
            throw new IllegalArgumentException("roomId 不能为空");
        }
        String rid = roomId.trim();
        RoomMappingRoom existing = roomMapper.selectByRoomId(rid);
        if (existing == null) {
            throw new IllegalArgumentException("房间不存在: " + rid);
        }
        Integer level = body != null ? body.getOfficialPermissionLevel() : null;
        if (level != null && (level < 1 || level > 999)) {
            throw new IllegalArgumentException("官方权限等级须在 1～999 之间，或留空表示未配置");
        }
        roomMapper.updateOfficialPermissionLevel(rid, level);
        return findByRoomIdWithChannels(rid);
    }

    public Map<String, Object> facets() {
        List<String> regions = roomMapper.selectDistinctRegionNames();
        if (regions == null) {
            regions = List.of();
        }
        Map<String, List<String>> floorsByRegion = new LinkedHashMap<>();
        for (String r : regions) {
            List<String> floors = roomMapper.selectDistinctFloorNames(r);
            floorsByRegion.put(r, floors != null ? floors : List.of());
        }
        Map<String, Object> out = new HashMap<>();
        out.put("regions", regions);
        out.put("floorsByRegion", floorsByRegion);
        return out;
    }

    public Map<String, Object> listRooms(String keyword, String regionName, String floorName, String tagFilter,
                                         int page, int pageSize, boolean includeChannels) {
        int p = Math.max(1, page);
        int size = Math.min(200, Math.max(1, pageSize));
        String kw = keyword != null ? keyword.trim() : "";
        String rn = regionName != null ? regionName.trim() : "";
        String fn = floorName != null ? floorName.trim() : "";
        String tf = tagFilter != null ? tagFilter.trim() : "";

        long total = roomMapper.countList(
                kw.isEmpty() ? null : kw,
                rn.isEmpty() ? null : rn,
                fn.isEmpty() ? null : fn,
                tf.isEmpty() ? null : tf);
        int offset = (p - 1) * size;
        List<RoomMappingRoom> rows = roomMapper.selectPage(
                kw.isEmpty() ? null : kw,
                rn.isEmpty() ? null : rn,
                fn.isEmpty() ? null : fn,
                tf.isEmpty() ? null : tf,
                offset,
                size);

        Map<String, List<RoomMappingChannel>> channelMap = new HashMap<>();
        if (includeChannels) {
            List<String> roomIds = rows.stream().map(RoomMappingRoom::getRoomId).toList();
            if (!roomIds.isEmpty()) {
                List<RoomMappingChannel> allCh = channelMapper.selectByRoomIds(roomIds);
                if (allCh != null) {
                    channelMap = allCh.stream().collect(Collectors.groupingBy(RoomMappingChannel::getRoomId));
                }
            }
        }

        List<RoomMappingRoomView> list = new ArrayList<>();
        for (RoomMappingRoom r : rows) {
            RoomMappingRoomView v = new RoomMappingRoomView();
            copyRoom(v, r);
            if (includeChannels) {
                List<RoomMappingChannel> chList = channelMap.getOrDefault(r.getRoomId(), List.of());
                for (RoomMappingChannel c : chList) {
                    v.getChannelCodes().add(c.getChannelCode());
                    RoomMappingRoomView.ChannelItem ci = new RoomMappingRoomView.ChannelItem();
                    ci.setChannelCode(c.getChannelCode());
                    ci.setLabel(c.getLabel());
                    ci.setSortOrder(c.getSortOrder());
                    v.getChannels().add(ci);
                }
            }
            list.add(v);
        }

        Map<String, Object> out = new HashMap<>();
        out.put("list", list);
        out.put("total", total);
        out.put("page", p);
        out.put("pageSize", size);
        return out;
    }

    @Transactional(rollbackFor = Exception.class)
    public RoomMappingImportStats refreshFromClasspath() throws Exception {
        ClassPathResource res = new ClassPathResource(CSV_PATH);
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(res.getInputStream(), StandardCharsets.UTF_8))) {
            return parseAndImport(br);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void replaceRoomChannels(String roomId, List<String> channelCodes) {
        if (!StringUtils.hasText(roomId)) {
            throw new IllegalArgumentException("roomId 不能为空");
        }
        String rid = roomId.trim();
        RoomMappingRoom existing = roomMapper.selectByRoomId(rid);
        if (existing == null) {
            throw new IllegalArgumentException("房间不存在或未导入: " + rid);
        }
        channelMapper.deleteByRoomId(rid);
        List<RoomMappingChannel> rows = new ArrayList<>();
        if (channelCodes != null) {
            int order = 0;
            for (String code : channelCodes) {
                if (!StringUtils.hasText(code)) {
                    continue;
                }
                RoomMappingChannel c = new RoomMappingChannel();
                c.setRoomId(rid);
                c.setChannelCode(code.trim());
                c.setSortOrder(order++);
                rows.add(c);
            }
        }
        if (!rows.isEmpty()) {
            channelMapper.insertBatch(rows);
        }
    }

    private static void copyRoom(RoomMappingRoomView v, RoomMappingRoom r) {
        v.setId(r.getId());
        v.setRuleNo(r.getRuleNo());
        v.setShelfId(r.getShelfId());
        v.setRegionId(r.getRegionId());
        v.setRegionName(r.getRegionName());
        v.setFloorId(r.getFloorId());
        v.setFloorName(r.getFloorName());
        v.setRoomId(r.getRoomId());
        v.setRoomName(r.getRoomName());
        v.setRackName(r.getRackName());
        v.setTags(r.getTags());
        v.setOfficialPermissionLevel(r.getOfficialPermissionLevel());
        v.setUpdatedAt(r.getUpdatedAt());
    }

    private RoomMappingImportStats parseAndImport(BufferedReader br) throws Exception {
        String first = br.readLine();
        if (first == null) {
            return new RoomMappingImportStats(0, 0, 0, 0, 0);
        }
        if (first.startsWith("\uFEFF")) {
            first = first.substring(1);
        }
        String[] headerCells = splitCsvLine(first);
        Map<String, Integer> col = buildHeaderIndex(headerCells);

        int idxShelf = col.getOrDefault("架子id", -1);
        int idxRegion = col.getOrDefault("区域id", -1);
        int idxRegionName = col.getOrDefault("区域名称", -1);
        int idxFloor = col.getOrDefault("楼层id", -1);
        int idxFloorName = col.getOrDefault("楼层名称", -1);
        int idxRoom = col.getOrDefault("房间id", -1);
        int idxRoomName = col.getOrDefault("房间名称", -1);
        int idxRack = col.getOrDefault("架子名称", -1);
        int idxRule = col.getOrDefault("规则编号", -1);
        int idxTags = col.getOrDefault("标签", -1);
        int idxChannels = col.getOrDefault("门禁通道编码", -1);

        if (idxRoom < 0) {
            throw new IllegalArgumentException("CSV 表头缺少「房间id」列");
        }

        int roomsUpserted = 0;
        int rowsSkipped = 0;
        int rowsRead = 0;
        int channelRowsWritten = 0;
        int roomsChannelReplaced = 0;

        String line;
        while ((line = br.readLine()) != null) {
            if (line.isBlank()) {
                continue;
            }
            rowsRead++;
            String[] cells = splitCsvLine(line);
            String roomId = cellAt(cells, idxRoom);
            if (!StringUtils.hasText(roomId)) {
                rowsSkipped++;
                continue;
            }
            roomId = roomId.trim();

            RoomMappingRoom row = new RoomMappingRoom();
            row.setRoomId(roomId);
            row.setShelfId(val(idxShelf, cells));
            row.setRegionId(val(idxRegion, cells));
            row.setRegionName(val(idxRegionName, cells));
            row.setFloorId(val(idxFloor, cells));
            row.setFloorName(val(idxFloorName, cells));
            row.setRoomName(val(idxRoomName, cells));
            row.setRackName(val(idxRack, cells));
            row.setTags(val(idxTags, cells));
            if (idxRule >= 0) {
                String rno = val(idxRule, cells);
                if (StringUtils.hasText(rno)) {
                    try {
                        row.setRuleNo(Integer.parseInt(rno.trim()));
                    } catch (NumberFormatException ignored) {
                        row.setRuleNo(null);
                    }
                }
            }
            row.setSourceRowHash(sha256Hex(line));

            roomMapper.upsert(row);
            roomsUpserted++;

            String channelRaw = idxChannels >= 0 ? val(idxChannels, cells) : null;
            if (StringUtils.hasText(channelRaw)) {
                List<String> codes = splitChannelCodes(channelRaw);
                channelMapper.deleteByRoomId(roomId);
                if (!codes.isEmpty()) {
                    List<RoomMappingChannel> batch = new ArrayList<>();
                    int o = 0;
                    for (String c : codes) {
                        RoomMappingChannel ch = new RoomMappingChannel();
                        ch.setRoomId(roomId);
                        ch.setChannelCode(c);
                        ch.setSortOrder(o++);
                        batch.add(ch);
                    }
                    channelMapper.insertBatch(batch);
                    channelRowsWritten += batch.size();
                    roomsChannelReplaced++;
                }
            }
        }
        return new RoomMappingImportStats(roomsUpserted, rowsSkipped, rowsRead, channelRowsWritten, roomsChannelReplaced);
    }

    private static Map<String, Integer> buildHeaderIndex(String[] headerCells) {
        Map<String, Integer> map = new HashMap<>();
        for (int i = 0; i < headerCells.length; i++) {
            String h = headerCells[i] != null ? headerCells[i].trim() : "";
            if (h.isEmpty()) {
                continue;
            }
            map.putIfAbsent(h, i);
        }
        return map;
    }

    /**
     * 轻量 CSV 行切分：不支持字段内换行；与当前 room_mapping 格式一致。
     */
    static String[] splitCsvLine(String line) {
        return line.split(",", -1);
    }

    private static String cellAt(String[] cells, int idx) {
        if (idx < 0 || idx >= cells.length) {
            return null;
        }
        return cells[idx];
    }

    private static String val(int idx, String[] cells) {
        String s = cellAt(cells, idx);
        return StringUtils.hasText(s) ? s.trim() : null;
    }

    private static List<String> splitChannelCodes(String raw) {
        String[] parts = raw.split("[;,，\\s]+");
        List<String> out = new ArrayList<>();
        for (String p : parts) {
            if (StringUtils.hasText(p)) {
                out.add(p.trim());
            }
        }
        return out;
    }

    private static String sha256Hex(String line) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(line.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            return null;
        }
    }
}
