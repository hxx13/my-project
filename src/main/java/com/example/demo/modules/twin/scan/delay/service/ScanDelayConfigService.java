package com.example.demo.modules.twin.scan.delay.service;

import com.example.demo.modules.twin.scan.delay.dto.ScanDelayOptionDTO;
import com.example.demo.modules.twin.scan.delay.dto.ScanDelayRoomBindingDTO;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayOption;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRoomOption;
import com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayOptionMapper;
import com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayRoomOptionMapper;
import com.example.demo.modules.twin.scan.delay.config.DahuaIssueScanDelayConfigSeed;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class ScanDelayConfigService {
    private static final String MODULE = DahuaIssueScanDelayConfigSeed.MODULE;
    private static final String KEY_ENABLED = DahuaIssueScanDelayConfigSeed.KEY_ENABLED;
    private static final String KEY_BUTTON_LABEL = DahuaIssueScanDelayConfigSeed.KEY_BUTTON_LABEL;
    private static final DateTimeFormatter HM = DateTimeFormatter.ofPattern("HH:mm");

    @Autowired
    private TwinScanDelayOptionMapper optionMapper;

    @Autowired
    private TwinScanDelayRoomOptionMapper roomOptionMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    public boolean isMasterEnabled() {
        return parseBoolConfig(KEY_ENABLED, false);
    }

    public String getButtonLabel() {
        String label = getEffectiveConfig(KEY_BUTTON_LABEL, "延迟");
        return StringUtils.hasText(label) ? label.trim() : "延迟";
    }

    public void setMasterEnabled(boolean enabled) {
        upsertConfig(KEY_ENABLED, enabled ? "true" : "false");
    }

    public void setButtonLabel(String label) {
        upsertConfig(KEY_BUTTON_LABEL, StringUtils.hasText(label) ? label.trim() : "延迟");
    }

    /** 延迟选项库（与房间无关） */
    public List<ScanDelayOptionDTO> listAllOptions() {
        return optionMapper.listAll().stream().map(this::toTemplateDto).collect(Collectors.toList());
    }

    public ScanDelayOptionDTO saveOption(ScanDelayOptionDTO dto) {
        if (dto == null || !StringUtils.hasText(dto.getOptionLabel())) {
            throw new IllegalArgumentException("请填写菜单项文案");
        }
        TwinScanDelayOption row = fromTemplateDto(dto);
        if (row.getId() == null) {
            if (row.getEnabled() == null) row.setEnabled(1);
            if (row.getSortOrder() == null) row.setSortOrder(0);
            if (!StringUtils.hasText(row.getExemptMode())) row.setExemptMode("TIME");
            optionMapper.insert(row);
        } else {
            optionMapper.update(row);
        }
        return toTemplateDto(optionMapper.findById(row.getId()));
    }

    public void deleteOption(Long id) {
        if (id == null) return;
        roomOptionMapper.deleteByOptionId(id);
        optionMapper.deleteById(id);
    }

    public List<ScanDelayRoomBindingDTO> listRoomBindings() {
        Map<String, List<Long>> grouped = new LinkedHashMap<>();
        for (TwinScanDelayRoomOption row : roomOptionMapper.listAll()) {
            grouped.computeIfAbsent(row.getRoomId(), k -> new ArrayList<>()).add(row.getOptionId());
        }
        return grouped.entrySet().stream()
                .map(e -> {
                    ScanDelayRoomBindingDTO dto = new ScanDelayRoomBindingDTO();
                    dto.setRoomId(e.getKey());
                    dto.setOptionIds(e.getValue());
                    return dto;
                })
                .sorted(Comparator.comparing(ScanDelayRoomBindingDTO::getRoomId))
                .collect(Collectors.toList());
    }

    /** 保存后仅替换指定房间绑定，禁止整表 load；post-save-no-full-refresh.mdc */
    public ScanDelayRoomBindingDTO saveRoomBinding(String roomId, List<Long> optionIds) {
        if (!StringUtils.hasText(roomId)) {
            throw new IllegalArgumentException("请选择房间");
        }
        String rid = roomId.trim();
        roomOptionMapper.deleteByRoomId(rid);
        if (optionIds != null) {
            int order = optionIds.size();
            for (Long optionId : optionIds) {
                if (optionId == null) continue;
                TwinScanDelayRoomOption bind = new TwinScanDelayRoomOption();
                bind.setRoomId(rid);
                bind.setOptionId(optionId);
                bind.setSortOrder(order--);
                roomOptionMapper.insert(bind);
            }
        }
        ScanDelayRoomBindingDTO out = new ScanDelayRoomBindingDTO();
        out.setRoomId(rid);
        out.setOptionIds(optionIds == null ? List.of() : optionIds.stream().filter(id -> id != null).collect(Collectors.toList()));
        return out;
    }

    /**
     * 按房间 ID 返回当前时段可见的延迟菜单项（供 analyze 与扫码弹窗二级菜单使用）。
     */
    public Map<String, List<ScanDelayOptionDTO>> listVisibleOptionsByRoomIds(List<String> roomIds) {
        if (!isMasterEnabled() || roomIds == null || roomIds.isEmpty()) {
            return Collections.emptyMap();
        }
        List<String> ids = roomIds.stream()
                .filter(StringUtils::hasText)
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
        if (ids.isEmpty()) return Collections.emptyMap();

        Map<String, List<ScanDelayOptionDTO>> out = new LinkedHashMap<>();
        for (TwinScanDelayRoomOption bind : roomOptionMapper.listByRoomIds(ids)) {
            TwinScanDelayOption opt = optionMapper.findById(bind.getOptionId());
            if (opt == null || opt.getEnabled() == null || opt.getEnabled() != 1) continue;
            if (!isWithinDisplayWindow(opt)) continue;
            ScanDelayOptionDTO dto = toTemplateDto(opt);
            dto.setRoomId(bind.getRoomId());
            out.computeIfAbsent(bind.getRoomId(), k -> new ArrayList<>()).add(dto);
        }
        for (List<ScanDelayOptionDTO> list : out.values()) {
            list.sort(Comparator.comparingInt(ScanDelayOptionDTO::getSortOrder).reversed()
                    .thenComparing(ScanDelayOptionDTO::getId));
        }
        return out;
    }

    public TwinScanDelayOption requireOption(Long id) {
        TwinScanDelayOption opt = optionMapper.findById(id);
        if (opt == null || opt.getEnabled() == null || opt.getEnabled() != 1) {
            throw new IllegalArgumentException("延迟选项不存在或已禁用");
        }
        if (!isWithinDisplayWindow(opt)) {
            throw new IllegalArgumentException("当前不在该延迟选项的显示时段内");
        }
        return opt;
    }

    public TwinScanDelayOption requireOptionQuiet(Long id) {
        if (id == null) return null;
        return optionMapper.findById(id);
    }

    /** 校验房间是否绑定了该延迟选项（选项库 + 房间搭配模型） */
    public boolean isOptionBoundToRoom(String roomId, Long optionId) {
        if (!StringUtils.hasText(roomId) || optionId == null) {
            return false;
        }
        String rid = roomId.trim();
        for (TwinScanDelayRoomOption bind : roomOptionMapper.listByRoomId(rid)) {
            if (optionId.equals(bind.getOptionId())) {
                return true;
            }
        }
        return false;
    }

    /** 规则中配置的审核教职工 ID 列表 */
    public List<String> resolveReviewerUserIds(TwinScanDelayOption opt) {
        if (opt == null) {
            return Collections.emptyList();
        }
        return parseStringList(opt.getReviewerUserIds());
    }

    public String resolveExemptRoomIdsJson(TwinScanDelayOption opt, String fallbackRoomId) {
        if (StringUtils.hasText(opt.getExemptRoomIds())) {
            return opt.getExemptRoomIds().trim();
        }
        try {
            return objectMapper.writeValueAsString(List.of(fallbackRoomId));
        } catch (Exception e) {
            return "[\"" + fallbackRoomId + "\"]";
        }
    }

    private boolean isWithinDisplayWindow(TwinScanDelayOption row) {
        String start = row.getDisplayStart();
        String end = row.getDisplayEnd();
        if (!StringUtils.hasText(start) && !StringUtils.hasText(end)) return true;
        try {
            LocalTime now = LocalTime.now();
            if (StringUtils.hasText(start) && StringUtils.hasText(end)) {
                LocalTime s = LocalTime.parse(start.trim(), HM);
                LocalTime e = LocalTime.parse(end.trim(), HM);
                if (s.isBefore(e) || s.equals(e)) {
                    return !now.isBefore(s) && !now.isAfter(e);
                }
                return !now.isBefore(s) || !now.isAfter(e);
            }
            if (StringUtils.hasText(start)) {
                return !now.isBefore(LocalTime.parse(start.trim(), HM));
            }
            return !now.isAfter(LocalTime.parse(end.trim(), HM));
        } catch (Exception ex) {
            return true;
        }
    }

    private ScanDelayOptionDTO toTemplateDto(TwinScanDelayOption row) {
        if (row == null) return null;
        ScanDelayOptionDTO dto = new ScanDelayOptionDTO();
        dto.setId(row.getId());
        dto.setOptionLabel(row.getOptionLabel());
        dto.setDisplayStart(row.getDisplayStart());
        dto.setDisplayEnd(row.getDisplayEnd());
        dto.setRequireApproval(row.getRequireApproval() != null && row.getRequireApproval() == 1);
        dto.setReviewerUserIds(parseStringList(row.getReviewerUserIds()));
        dto.setExemptMode(row.getExemptMode());
        dto.setDurationMinutes(row.getDurationMinutes());
        dto.setMaxCount(row.getMaxCount());
        dto.setExemptRoomIds(parseStringList(row.getExemptRoomIds()));
        dto.setEnabled(row.getEnabled() != null && row.getEnabled() == 1);
        dto.setSortOrder(row.getSortOrder() == null ? 0 : row.getSortOrder());
        return dto;
    }

    private TwinScanDelayOption fromTemplateDto(ScanDelayOptionDTO dto) {
        TwinScanDelayOption row = new TwinScanDelayOption();
        row.setId(dto.getId());
        row.setRoomId("");
        row.setRoomName("");
        row.setButtonLabel("");
        row.setOptionLabel(dto.getOptionLabel());
        row.setDisplayStart(dto.getDisplayStart());
        row.setDisplayEnd(dto.getDisplayEnd());
        row.setRequireApproval(dto.isRequireApproval() ? 1 : 0);
        row.setReviewerUserIds(writeJson(dto.getReviewerUserIds()));
        row.setExemptMode(StringUtils.hasText(dto.getExemptMode()) ? dto.getExemptMode() : "TIME");
        row.setDurationMinutes(dto.getDurationMinutes());
        row.setMaxCount(dto.getMaxCount());
        row.setExemptRoomIds(writeJson(dto.getExemptRoomIds()));
        row.setEnabled(dto.isEnabled() ? 1 : 0);
        row.setSortOrder(dto.getSortOrder());
        return row;
    }

    private List<String> parseStringList(String json) {
        if (!StringUtils.hasText(json)) return Collections.emptyList();
        try {
            return objectMapper.readValue(json.trim(), new TypeReference<List<String>>() {});
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    private String writeJson(List<String> list) {
        if (list == null || list.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(list);
        } catch (Exception e) {
            return null;
        }
    }

    private boolean parseBoolConfig(String key, boolean fallback) {
        try {
            String v = getEffectiveConfig(key, fallback ? "true" : "false");
            if (!StringUtils.hasText(v)) return fallback;
            String s = v.trim().toLowerCase();
            return "true".equals(s) || "1".equals(s) || "yes".equals(s);
        } catch (Exception e) {
            return fallback;
        }
    }

    private String getEffectiveConfig(String key, String fallback) {
        List<String> rows = jdbcTemplate.query(
                "SELECT config_value FROM sys_system_config WHERE module = ? AND config_key = ? LIMIT 1",
                (rs, i) -> rs.getString(1),
                MODULE,
                key
        );
        if (!rows.isEmpty() && StringUtils.hasText(rows.get(0))) {
            return rows.get(0);
        }
        return fallback;
    }

    private void upsertConfig(String key, String value) {
        int updated = jdbcTemplate.update(
                "UPDATE sys_system_config SET config_value = ?, update_time = NOW() WHERE module = ? AND config_key = ?",
                value,
                MODULE,
                key
        );
        if (updated == 0) {
            jdbcTemplate.update(
                    "INSERT INTO sys_system_config (module, config_key, config_value, update_time) VALUES (?, ?, ?, NOW())",
                    MODULE,
                    key,
                    value
            );
        }
    }
}
