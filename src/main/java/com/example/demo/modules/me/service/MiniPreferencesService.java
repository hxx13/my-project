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
    private static final int MAX_ADMIN_NAV_RECENT = 8;
    private static final int MAX_ADMIN_NAV_STARS = 64;
    private static final int MAX_STUDENT_NAV_RECENT = 8;
    private static final int MAX_STUDENT_NAV_STARS = 64;
    /** 侧栏路径前缀：管理员端 /admin、学生端 /student（与前端侧栏作用域一致） */
    private static final String ADMIN_PATH_PREFIX = "/admin";
    private static final String STUDENT_PATH_PREFIX = "/student";

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
            vo.setAdminNavRecent(sanitizeNavPaths(vo.getAdminNavRecent(), MAX_ADMIN_NAV_RECENT, ADMIN_PATH_PREFIX));
            vo.setAdminNavStars(sanitizeNavPaths(vo.getAdminNavStars(), MAX_ADMIN_NAV_STARS, ADMIN_PATH_PREFIX));
            vo.setAdminNavLock(sanitizeNavLock(vo.getAdminNavLock(), ADMIN_PATH_PREFIX));
            vo.setStudentNavRecent(sanitizeNavPaths(vo.getStudentNavRecent(), MAX_STUDENT_NAV_RECENT, STUDENT_PATH_PREFIX));
            vo.setStudentNavStars(sanitizeNavPaths(vo.getStudentNavStars(), MAX_STUDENT_NAV_STARS, STUDENT_PATH_PREFIX));
            vo.setStudentNavLock(sanitizeNavLock(vo.getStudentNavLock(), STUDENT_PATH_PREFIX));
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
        mergePageHelpIntroAck(existing, incoming);
        if (incoming.getAdminNavRecent() == null) {
            incoming.setAdminNavRecent(new ArrayList<>(existing.getAdminNavRecent() == null ? List.of() : existing.getAdminNavRecent()));
        }
        if (incoming.getAdminNavStars() == null) {
            incoming.setAdminNavStars(new ArrayList<>(existing.getAdminNavStars() == null ? List.of() : existing.getAdminNavStars()));
        }
        if (incoming.getAdminNavLock() == null && existing.getAdminNavLock() != null) {
            incoming.setAdminNavLock(existing.getAdminNavLock());
        }
        if (incoming.getStudentNavRecent() == null) {
            incoming.setStudentNavRecent(new ArrayList<>(existing.getStudentNavRecent() == null ? List.of() : existing.getStudentNavRecent()));
        }
        if (incoming.getStudentNavStars() == null) {
            incoming.setStudentNavStars(new ArrayList<>(existing.getStudentNavStars() == null ? List.of() : existing.getStudentNavStars()));
        }
        if (incoming.getStudentNavLock() == null && existing.getStudentNavLock() != null) {
            incoming.setStudentNavLock(existing.getStudentNavLock());
        }
    }

    /** 合并已读记录：incoming 覆盖同 path，但保留 existing 中未被提交的项（避免主题保存冲掉帮助已读） */
    private static void mergePageHelpIntroAck(MiniPreferencesVo existing, MiniPreferencesVo incoming) {
        Map<String, String> merged = new LinkedHashMap<>();
        if (existing.getPageHelpIntroAck() != null) {
            merged.putAll(existing.getPageHelpIntroAck());
        }
        if (incoming.getPageHelpIntroAck() != null) {
            merged.putAll(incoming.getPageHelpIntroAck());
        }
        incoming.setPageHelpIntroAck(merged);
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

    /** 侧栏路径白名单：必须落在 prefix 下（管理员 /admin、学生端 /student） */
    private static List<String> sanitizeNavPaths(List<String> raw, int max, String prefix) {
        List<String> out = new ArrayList<>();
        if (raw == null) {
            return out;
        }
        Set<String> seen = new LinkedHashSet<>();
        for (String p : raw) {
            if (p == null) {
                continue;
            }
            String path = p.trim();
            if (path.isEmpty() || !path.startsWith(prefix) || path.length() > 512 || path.contains("..")) {
                continue;
            }
            if (seen.add(path)) {
                out.add(path);
            }
            if (out.size() >= max) {
                break;
            }
        }
        return out;
    }

    private static String sanitizeNavLock(String raw, String prefix) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String path = raw.trim();
        if (!path.startsWith(prefix) || path.length() > 512 || path.contains("..")) {
            return null;
        }
        return path;
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
        vo.setAdminNavRecent(new ArrayList<>());
        vo.setAdminNavStars(new ArrayList<>());
        vo.setAdminNavLock(null);
        vo.setStudentNavRecent(new ArrayList<>());
        vo.setStudentNavStars(new ArrayList<>());
        vo.setStudentNavLock(null);
        vo.setRoomWatch(new MiniPreferencesVo.RoomWatchVo());
        vo.getRoomWatch().setSelections(new ArrayList<>());
        return vo;
    }

    private static MiniPreferencesVo normalize(MiniPreferencesVo in) {
        MiniPreferencesVo out = new MiniPreferencesVo();
        out.setTwinWebChromeTheme(sanitizeTwinWebChromeTheme(in.getTwinWebChromeTheme()));
        out.setAppearanceSchedule(sanitizeAppearanceSchedule(in.getAppearanceSchedule()));
        out.setPageHelpIntroAck(sanitizePageHelpIntroAck(in.getPageHelpIntroAck()));
        out.setAdminNavRecent(sanitizeNavPaths(in.getAdminNavRecent(), MAX_ADMIN_NAV_RECENT, ADMIN_PATH_PREFIX));
        out.setAdminNavStars(sanitizeNavPaths(in.getAdminNavStars(), MAX_ADMIN_NAV_STARS, ADMIN_PATH_PREFIX));
        out.setAdminNavLock(sanitizeNavLock(in.getAdminNavLock(), ADMIN_PATH_PREFIX));
        out.setStudentNavRecent(sanitizeNavPaths(in.getStudentNavRecent(), MAX_STUDENT_NAV_RECENT, STUDENT_PATH_PREFIX));
        out.setStudentNavStars(sanitizeNavPaths(in.getStudentNavStars(), MAX_STUDENT_NAV_STARS, STUDENT_PATH_PREFIX));
        out.setStudentNavLock(sanitizeNavLock(in.getStudentNavLock(), STUDENT_PATH_PREFIX));
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
