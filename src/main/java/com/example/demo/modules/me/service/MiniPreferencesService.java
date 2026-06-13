package com.example.demo.modules.me.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.me.dto.MiniPreferencesVo;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class MiniPreferencesService {

    private static final int MAX_SELECTIONS = 64;

    private final UserMapper userMapper;
    private final ObjectMapper objectMapper;

    public MiniPreferencesService(UserMapper userMapper, ObjectMapper objectMapper) {
        this.userMapper = userMapper;
        this.objectMapper = objectMapper;
    }

    public MiniPreferencesVo load(String userId) {
        User u = userMapper.findById(userId);
        if (u == null) {
            return empty();
        }
        String raw = u.getMiniPreferencesJson();
        if (raw == null || raw.isBlank()) {
            return empty();
        }
        try {
            MiniPreferencesVo vo = objectMapper.readValue(raw, MiniPreferencesVo.class);
            if (vo == null) {
                return empty();
            }
            if (vo.getRoomWatch() == null) {
                vo.setRoomWatch(new MiniPreferencesVo.RoomWatchVo());
            }
            if (vo.getRoomWatch().getSelections() == null) {
                vo.getRoomWatch().setSelections(new ArrayList<>());
            }
            vo.setTwinWebChromeTheme(sanitizeTwinWebChromeTheme(vo.getTwinWebChromeTheme()));
            vo.setAppearanceSchedule(sanitizeAppearanceSchedule(vo.getAppearanceSchedule()));
            vo.setPageHelpIntroAck(sanitizePageHelpIntroAck(vo.getPageHelpIntroAck()));
            return vo;
        } catch (Exception e) {
            return empty();
        }
    }

    public MiniPreferencesVo save(String userId, MiniPreferencesVo body) throws Exception {
        MiniPreferencesVo existing = load(userId);
        MiniPreferencesVo incoming = body == null ? empty() : body;
        mergeMissingFieldsFromExisting(existing, incoming);
        MiniPreferencesVo normalized = normalize(incoming);
        String json = objectMapper.writeValueAsString(normalized);
        userMapper.updateMiniPreferencesJsonById(userId, json);
        return normalized;
    }

    /**
     * 小程序等客户端可能只提交 roomWatch；Web 可能只改主题：缺省字段从库内已有配置补齐，避免互相覆盖。
     */
    private static void mergeMissingFieldsFromExisting(MiniPreferencesVo existing, MiniPreferencesVo incoming) {
        if (incoming.getTwinWebChromeTheme() == null || incoming.getTwinWebChromeTheme().isBlank()) {
            incoming.setTwinWebChromeTheme(
                    existing.getTwinWebChromeTheme() != null && !existing.getTwinWebChromeTheme().isBlank()
                            ? existing.getTwinWebChromeTheme()
                            : "standard"
            );
        }
        if (incoming.getRoomWatch() == null) {
            incoming.setRoomWatch(existing.getRoomWatch() != null ? existing.getRoomWatch() : new MiniPreferencesVo.RoomWatchVo());
        }
        if (incoming.getRoomWatch().getSelections() == null) {
            incoming.getRoomWatch().setSelections(
                    existing.getRoomWatch() != null && existing.getRoomWatch().getSelections() != null
                            ? new ArrayList<>(existing.getRoomWatch().getSelections())
                            : new ArrayList<>()
            );
        }
        if (incoming.getAppearanceSchedule() == null && existing.getAppearanceSchedule() != null) {
            incoming.setAppearanceSchedule(existing.getAppearanceSchedule());
        }
        if (incoming.getPageHelpIntroAck() == null && existing.getPageHelpIntroAck() != null) {
            incoming.setPageHelpIntroAck(new LinkedHashMap<>(existing.getPageHelpIntroAck()));
        }
    }

    private static String sanitizeTwinWebChromeTheme(String raw) {
        if (raw == null || raw.isBlank()) {
            return "standard";
        }
        String t = raw.trim();
        if ("dashboardSciFi".equals(t) || "standard".equals(t)) {
            return t;
        }
        return "standard";
    }

    private static com.example.demo.modules.me.dto.AppearanceScheduleVo sanitizeAppearanceSchedule(
            com.example.demo.modules.me.dto.AppearanceScheduleVo raw) {
        com.example.demo.modules.me.dto.AppearanceScheduleVo out = new com.example.demo.modules.me.dto.AppearanceScheduleVo();
        if (raw == null) {
            out.setAutoScheduleEnabled(true);
            out.setManualOverride(null);
            out.setLightStart("08:00");
            out.setLightEnd("16:30");
            out.setManualThemeId("standard");
            return out;
        }
        out.setAutoScheduleEnabled(raw.getAutoScheduleEnabled() == null || Boolean.TRUE.equals(raw.getAutoScheduleEnabled()));
        String mo = raw.getManualOverride() == null ? "" : raw.getManualOverride().trim();
        if ("light".equals(mo) || "dark".equals(mo)) {
            out.setManualOverride(mo);
        } else {
            out.setManualOverride(null);
        }
        out.setLightStart(sanitizeHhMm(raw.getLightStart(), "08:00"));
        out.setLightEnd(sanitizeHhMm(raw.getLightEnd(), "16:30"));
        String mt = raw.getManualThemeId() == null ? "" : raw.getManualThemeId().trim();
        if ("standard".equals(mt) || "standard-dark".equals(mt) || "scifi".equals(mt)) {
            out.setManualThemeId(mt);
        } else {
            out.setManualThemeId("standard");
        }
        return out;
    }

    private static String sanitizeHhMm(String raw, String fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        String t = raw.trim();
        if (t.matches("^\\d{1,2}:\\d{2}$")) {
            return t;
        }
        return fallback;
    }

    private static Map<String, String> sanitizePageHelpIntroAck(Map<String, String> raw) {
        Map<String, String> out = new LinkedHashMap<>();
        if (raw == null) {
            return out;
        }
        for (Map.Entry<String, String> e : raw.entrySet()) {
            if (e.getKey() == null || e.getValue() == null) {
                continue;
            }
            String path = e.getKey().trim();
            String at = e.getValue().trim();
            if (path.isEmpty() || path.length() > 512 || path.contains("..") || at.isEmpty()) {
                continue;
            }
            out.put(path, at);
            if (out.size() >= 128) {
                break;
            }
        }
        return out;
    }

    private static MiniPreferencesVo empty() {
        MiniPreferencesVo vo = new MiniPreferencesVo();
        vo.setTwinWebChromeTheme("standard");
        vo.setAppearanceSchedule(sanitizeAppearanceSchedule(null));
        vo.setPageHelpIntroAck(new LinkedHashMap<>());
        vo.setRoomWatch(new MiniPreferencesVo.RoomWatchVo());
        vo.getRoomWatch().setSelections(new ArrayList<>());
        return vo;
    }

    private static MiniPreferencesVo normalize(MiniPreferencesVo in) {
        MiniPreferencesVo out = new MiniPreferencesVo();
        out.setTwinWebChromeTheme(sanitizeTwinWebChromeTheme(in.getTwinWebChromeTheme()));
        out.setAppearanceSchedule(sanitizeAppearanceSchedule(in.getAppearanceSchedule()));
        out.setPageHelpIntroAck(sanitizePageHelpIntroAck(in.getPageHelpIntroAck()));
        MiniPreferencesVo.RoomWatchVo rw = new MiniPreferencesVo.RoomWatchVo();
        List<MiniPreferencesVo.RoomWatchSelectionVo> list =
                in.getRoomWatch() != null && in.getRoomWatch().getSelections() != null
                        ? in.getRoomWatch().getSelections()
                        : List.of();
        Set<String> dedupe = new LinkedHashSet<>();
        List<MiniPreferencesVo.RoomWatchSelectionVo> kept = new ArrayList<>();
        for (MiniPreferencesVo.RoomWatchSelectionVo s : list) {
            if (s == null) {
                continue;
            }
            String campus = s.getCampus() == null ? "" : s.getCampus().trim();
            if (campus.isEmpty() || campus.length() > 32) {
                continue;
            }
            String floor = s.getFloor() == null ? "" : s.getFloor().trim();
            if (floor.length() > 32) {
                continue;
            }
            String key = campus + "\0" + floor;
            if (!dedupe.add(key)) {
                continue;
            }
            MiniPreferencesVo.RoomWatchSelectionVo one = new MiniPreferencesVo.RoomWatchSelectionVo();
            one.setCampus(campus);
            one.setFloor(floor);
            kept.add(one);
            if (kept.size() >= MAX_SELECTIONS) {
                break;
            }
        }
        rw.setSelections(kept);
        out.setRoomWatch(rw);
        return out;
    }
}
