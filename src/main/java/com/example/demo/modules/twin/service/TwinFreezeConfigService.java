package com.example.demo.modules.twin.service;

import com.example.demo.modules.twin.entity.TwinFreezeConfigRow;
import com.example.demo.modules.twin.mapper.TwinFreezeConfigMapper;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.time.DateTimeException;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.Map;

@Service
public class TwinFreezeConfigService {

    private static final int CONFIG_ID = 1;
    private static final String DEFAULT_FREEZE_TIME = "18:00";
    private static final String DEFAULT_TZ = "Asia/Shanghai";
    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

    private final TwinFreezeConfigMapper freezeConfigMapper;

    public TwinFreezeConfigService(TwinFreezeConfigMapper freezeConfigMapper) {
        this.freezeConfigMapper = freezeConfigMapper;
    }

    @PostConstruct
    public void ensureDefaultRow() {
        ensureSecondFreezeColumn();
        ensureSecondFreezeAutoSignoutColumn();
        freezeConfigMapper.insertIgnoreDefault(CONFIG_ID);
    }

    public void ensureRow() {
        ensureSecondFreezeColumn();
        ensureSecondFreezeAutoSignoutColumn();
        freezeConfigMapper.insertIgnoreDefault(CONFIG_ID);
    }

    /**
     * 兼容低版本 MySQL（不支持 ADD COLUMN IF NOT EXISTS）：改为先查 information_schema 再补列。
     */
    private void ensureSecondFreezeColumn() {
        Integer cnt = freezeConfigMapper.countSecondFreezeColumn();
        if (cnt == null || cnt == 0) {
            freezeConfigMapper.addSecondFreezeColumn();
        }
    }

    private void ensureSecondFreezeAutoSignoutColumn() {
        Integer cnt = freezeConfigMapper.countSecondFreezeAutoSignoutColumn();
        if (cnt == null || cnt == 0) {
            freezeConfigMapper.addSecondFreezeAutoSignoutColumn();
        }
    }

    public ZoneId resolveZoneId(TwinFreezeConfigRow row) {
        String tz = row != null && row.getTimezone() != null && !row.getTimezone().isBlank()
                ? row.getTimezone().trim()
                : DEFAULT_TZ;
        try {
            return ZoneId.of(tz);
        } catch (DateTimeException e) {
            return ZoneId.of(DEFAULT_TZ);
        }
    }

    public Map<String, Object> getConfigMap() {
        ensureRow();
        TwinFreezeConfigRow row = freezeConfigMapper.selectById(CONFIG_ID);
        if (row == null) {
            return defaultConfigMap("system");
        }
        Map<String, Object> m = new HashMap<>();
        m.put("enabled", row.getEnabled() != null && row.getEnabled() == 1);
        m.put("freezeTime", row.getFreezeTime() != null ? row.getFreezeTime() : DEFAULT_FREEZE_TIME);
        m.put("secondFreezeTime", row.getSecondFreezeTime() != null ? row.getSecondFreezeTime() : "");
        m.put("secondFreezeAutoSignoutEnabled", row.getSecondFreezeAutoSignoutEnabled() != null && row.getSecondFreezeAutoSignoutEnabled() == 1);
        m.put("timezone", row.getTimezone() != null ? row.getTimezone() : DEFAULT_TZ);
        m.put("updatedBy", row.getUpdatedBy());
        m.put("updatedAt", row.getUpdatedAt() != null ? row.getUpdatedAt().toString() : null);
        m.put("lastAutoFreezeRunDate", row.getLastAutoFreezeRunDate());
        return m;
    }

    private Map<String, Object> defaultConfigMap(String updatedBy) {
        Map<String, Object> m = new HashMap<>();
        m.put("enabled", true);
        m.put("freezeTime", DEFAULT_FREEZE_TIME);
        m.put("secondFreezeTime", "");
        m.put("secondFreezeAutoSignoutEnabled", false);
        m.put("timezone", DEFAULT_TZ);
        m.put("updatedBy", updatedBy);
        m.put("updatedAt", null);
        m.put("lastAutoFreezeRunDate", null);
        return m;
    }

    public void validateFreezeTime(String freezeTime) {
        String t = normalizeTime(freezeTime);
        LocalTime.parse(t, HH_MM);
    }

    public void validateOptionalFreezeTime(String freezeTime) {
        if (freezeTime == null || freezeTime.isBlank()) {
            return;
        }
        validateFreezeTime(freezeTime);
    }

    private static String normalizeTime(String freezeTime) {
        if (freezeTime == null || freezeTime.isBlank()) {
            return DEFAULT_FREEZE_TIME;
        }
        String s = freezeTime.trim();
        if (s.length() == 4 && s.charAt(1) == ':') {
            s = "0" + s;
        }
        return s;
    }

    public Map<String, Object> saveConfig(
            boolean enabled,
            String freezeTime,
            String secondFreezeTime,
            boolean secondFreezeAutoSignoutEnabled,
            String timezone,
            String updatedBy) {
        ensureRow();
        String ft = normalizeTime(freezeTime);
        validateFreezeTime(ft);
        String secondFt = (secondFreezeTime == null || secondFreezeTime.isBlank())
                ? null
                : normalizeTime(secondFreezeTime);
        validateOptionalFreezeTime(secondFt);
        if (secondFt != null && secondFt.equals(ft)) {
            throw new IllegalArgumentException("第二定时与第一定时不能相同");
        }
        String tz = (timezone == null || timezone.isBlank()) ? DEFAULT_TZ : timezone.trim();
        try {
            ZoneId.of(tz);
        } catch (DateTimeException e) {
            throw new IllegalArgumentException("非法时区: " + tz);
        }
        int en = enabled ? 1 : 0;
        int secondAuto = secondFreezeAutoSignoutEnabled ? 1 : 0;
        String by = (updatedBy == null || updatedBy.isBlank()) ? "unknown" : updatedBy.trim();
        freezeConfigMapper.updateConfig(CONFIG_ID, en, ft, secondFt, secondAuto, tz, by);
        return getConfigMap();
    }

    public boolean isSecondFreezeDueNow() {
        ensureRow();
        TwinFreezeConfigRow row = freezeConfigMapper.selectById(CONFIG_ID);
        if (row == null || row.getEnabled() == null || row.getEnabled() != 1) {
            return false;
        }
        LocalTime second = parseOrNull(row.getSecondFreezeTime());
        if (second == null) {
            return false;
        }
        ZoneId zone = resolveZoneId(row);
        LocalTime now = ZonedDateTime.now(zone).toLocalTime();
        return now.getHour() == second.getHour() && now.getMinute() == second.getMinute();
    }

    /**
     * 当前时刻是否命中自动冻结触发窗口（支持两个时刻；同一分钟只触发一次）。
     */
    public String resolveDueFreezeRunKey() {
        ensureRow();
        TwinFreezeConfigRow row = freezeConfigMapper.selectById(CONFIG_ID);
        if (row == null || row.getEnabled() == null || row.getEnabled() != 1) {
            return null;
        }
        ZoneId zone = resolveZoneId(row);
        ZonedDateTime now = ZonedDateTime.now(zone);
        LocalTime target1 = parseOrDefault(row.getFreezeTime(), DEFAULT_FREEZE_TIME);
        LocalTime target2 = parseOrNull(row.getSecondFreezeTime());
        LocalTime cur = now.toLocalTime();
        String hitMinute = null;
        if (cur.getHour() == target1.getHour() && cur.getMinute() == target1.getMinute()) {
            hitMinute = target1.format(HH_MM);
        } else if (target2 != null && cur.getHour() == target2.getHour() && cur.getMinute() == target2.getMinute()) {
            hitMinute = target2.format(HH_MM);
        }
        if (hitMinute == null) {
            return null;
        }
        String runKey = now.toLocalDate() + "@" + hitMinute;
        if (runKey.equals(row.getLastAutoFreezeRunDate())) {
            return null;
        }
        return runKey;
    }

    private LocalTime parseOrDefault(String raw, String defaultVal) {
        try {
            return LocalTime.parse(normalizeTime(raw), HH_MM);
        } catch (DateTimeParseException e) {
            return LocalTime.parse(defaultVal, HH_MM);
        }
    }

    private LocalTime parseOrNull(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return LocalTime.parse(normalizeTime(raw), HH_MM);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    public void markFreezeReaperRunForDate(String yyyyMmDd) {
        freezeConfigMapper.updateLastAutoFreezeRunDate(CONFIG_ID, yyyyMmDd);
    }
}
