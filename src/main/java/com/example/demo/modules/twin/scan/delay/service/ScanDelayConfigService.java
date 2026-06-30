package com.example.demo.modules.twin.scan.delay.service;

import com.example.demo.modules.twin.scan.delay.dto.ScanDelayCarrierDTO;
import com.example.demo.modules.twin.scan.delay.dto.ScanDelayOptionDTO;
import com.example.demo.modules.twin.scan.delay.dto.ScanDelayRoomBindingDTO;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayCarrier;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayOption;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayCarrierOption;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRoomCarrier;
import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRoomOption;
import com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayCarrierMapper;
import com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayCarrierOptionMapper;
import com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayOptionMapper;
import com.example.demo.modules.twin.scan.delay.mapper.TwinScanDelayRoomCarrierMapper;
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
    private TwinScanDelayCarrierMapper carrierMapper;

    @Autowired
    private TwinScanDelayCarrierOptionMapper carrierOptionMapper;

    @Autowired
    private TwinScanDelayRoomCarrierMapper roomCarrierMapper;

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

    /** 载体按钮列表（含已分配菜单项） */
    public List<ScanDelayCarrierDTO> listAllCarriers() {
        return carrierMapper.listAll().stream().map(row -> {
            ScanDelayCarrierDTO dto = toCarrierDto(row);
            List<Long> optionIds = carrierOptionMapper.listOptionIdsByCarrierId(row.getId());
            dto.setOptionIds(optionIds);
            dto.setOptionCount(optionIds.size());
            return dto;
        }).collect(Collectors.toList());
    }

    public ScanDelayCarrierDTO saveCarrier(ScanDelayCarrierDTO dto) {
        if (dto == null || !StringUtils.hasText(dto.getButtonLabel())) {
            throw new IllegalArgumentException("请填写载体按钮文案");
        }
        TwinScanDelayCarrier row = new TwinScanDelayCarrier();
        row.setId(dto.getId());
        row.setButtonLabel(dto.getButtonLabel().trim());
        row.setEnabled(dto.isEnabled() ? 1 : 0);
        row.setSortOrder(dto.getSortOrder());
        if (row.getId() == null) {
            if (row.getEnabled() == null) row.setEnabled(1);
            if (row.getSortOrder() == null) row.setSortOrder(0);
            carrierMapper.insert(row);
        } else {
            carrierMapper.update(row);
        }
        if (dto.getOptionIds() != null) {
            replaceCarrierOptions(row.getId(), dto.getOptionIds());
        }
        ScanDelayCarrierDTO out = toCarrierDto(carrierMapper.findById(row.getId()));
        List<Long> optionIds = carrierOptionMapper.listOptionIdsByCarrierId(row.getId());
        out.setOptionIds(optionIds);
        out.setOptionCount(optionIds.size());
        return out;
    }

    public void deleteCarrier(Long id) {
        if (id == null) return;
        carrierOptionMapper.deleteByCarrierId(id);
        roomCarrierMapper.deleteByCarrierId(id);
        carrierMapper.deleteById(id);
    }

    /** 延迟菜单项库（与载体、房间无关） */
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
        carrierOptionMapper.deleteByOptionId(id);
        optionMapper.deleteById(id);
    }

    public List<ScanDelayRoomBindingDTO> listRoomBindings() {
        Map<String, List<Long>> grouped = new LinkedHashMap<>();
        for (TwinScanDelayRoomCarrier row : roomCarrierMapper.listAll()) {
            grouped.computeIfAbsent(row.getRoomId(), k -> new ArrayList<>()).add(row.getCarrierId());
        }
        return grouped.entrySet().stream()
                .map(e -> {
                    ScanDelayRoomBindingDTO dto = new ScanDelayRoomBindingDTO();
                    dto.setRoomId(e.getKey());
                    dto.setCarrierIds(e.getValue());
                    return dto;
                })
                .sorted(Comparator.comparing(ScanDelayRoomBindingDTO::getRoomId))
                .collect(Collectors.toList());
    }

    /** 保存房间绑定的载体；该载体下全部二级菜单项对学生可见 */
    public ScanDelayRoomBindingDTO saveRoomBinding(String roomId, List<Long> carrierIds) {
        if (!StringUtils.hasText(roomId)) {
            throw new IllegalArgumentException("请选择房间");
        }
        String rid = roomId.trim();
        roomCarrierMapper.deleteByRoomId(rid);
        if (carrierIds != null) {
            int order = carrierIds.size();
            for (Long carrierId : carrierIds) {
                if (carrierId == null) continue;
                TwinScanDelayCarrier carrier = carrierMapper.findById(carrierId);
                if (carrier == null) {
                    throw new IllegalArgumentException("载体不存在: " + carrierId);
                }
                TwinScanDelayRoomCarrier bind = new TwinScanDelayRoomCarrier();
                bind.setRoomId(rid);
                bind.setCarrierId(carrierId);
                bind.setSortOrder(order--);
                roomCarrierMapper.insert(bind);
            }
        }
        ScanDelayRoomBindingDTO out = new ScanDelayRoomBindingDTO();
        out.setRoomId(rid);
        out.setCarrierIds(carrierIds == null ? List.of() : carrierIds.stream().filter(id -> id != null).collect(Collectors.toList()));
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
        for (TwinScanDelayRoomCarrier bind : roomCarrierMapper.listByRoomIds(ids)) {
            TwinScanDelayCarrier carrier = carrierMapper.findById(bind.getCarrierId());
            if (carrier == null || carrier.getEnabled() == null || carrier.getEnabled() != 1) continue;
            String buttonLabel = StringUtils.hasText(carrier.getButtonLabel()) ? carrier.getButtonLabel().trim() : getButtonLabel();
            for (Long optionId : carrierOptionMapper.listOptionIdsByCarrierId(bind.getCarrierId())) {
                TwinScanDelayOption opt = optionMapper.findById(optionId);
                if (opt == null || opt.getEnabled() == null || opt.getEnabled() != 1) continue;
                if (!isWithinDisplayWindow(opt)) continue;
                ScanDelayOptionDTO dto = toTemplateDto(opt);
                dto.setCarrierId(bind.getCarrierId());
                dto.setRoomId(bind.getRoomId());
                dto.setButtonLabel(buttonLabel);
                out.computeIfAbsent(bind.getRoomId(), k -> new ArrayList<>()).add(dto);
            }
        }
        for (List<ScanDelayOptionDTO> list : out.values()) {
            list.sort(Comparator.comparingInt(ScanDelayOptionDTO::getSortOrder).reversed()
                    .thenComparing(ScanDelayOptionDTO::getId));
        }
        return out;
    }

    public TwinScanDelayOption requireOption(Long id) {
        TwinScanDelayOption opt = requireOptionEnabled(id);
        if (!isWithinDisplayWindow(opt)) {
            throw new IllegalArgumentException("当前不在该延迟选项的显示时段内");
        }
        return opt;
    }

    /** 审核/自动审批/直批授予：仅校验选项存在且启用，不受 displayStart/displayEnd 限制 */
    public TwinScanDelayOption requireOptionEnabled(Long id) {
        TwinScanDelayOption opt = id == null ? null : optionMapper.findById(id);
        if (opt == null || opt.getEnabled() == null || opt.getEnabled() != 1) {
            throw new IllegalArgumentException("延迟选项不存在或已禁用");
        }
        return opt;
    }

    public TwinScanDelayOption requireOptionQuiet(Long id) {
        if (id == null) return null;
        return optionMapper.findById(id);
    }

    /** 校验房间是否绑定了包含该菜单项的载体 */
    public boolean isOptionBoundToRoom(String roomId, Long optionId) {
        if (!StringUtils.hasText(roomId) || optionId == null) {
            return false;
        }
        for (TwinScanDelayRoomCarrier bind : roomCarrierMapper.listByRoomId(roomId.trim())) {
            if (carrierOptionMapper.listOptionIdsByCarrierId(bind.getCarrierId()).contains(optionId)) {
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
        dto.setCarrierId(row.getCarrierId());
        dto.setOptionLabel(row.getOptionLabel());
        dto.setButtonLabel(StringUtils.hasText(row.getButtonLabel()) ? row.getButtonLabel().trim() : "延迟");
        dto.setDisplayStart(row.getDisplayStart());
        dto.setDisplayEnd(row.getDisplayEnd());
        dto.setRequireApproval(row.getRequireApproval() != null && row.getRequireApproval() == 1);
        dto.setReviewerUserIds(parseStringList(row.getReviewerUserIds()));
        dto.setExemptMode(row.getExemptMode());
        dto.setDurationMinutes(row.getDurationMinutes());
        dto.setExtendUntilTime(row.getExtendUntilTime());
        dto.setMaxCount(row.getMaxCount());
        dto.setExemptRoomIds(parseStringList(row.getExemptRoomIds()));
        dto.setEnabled(row.getEnabled() != null && row.getEnabled() == 1);
        dto.setSortOrder(row.getSortOrder() == null ? 0 : row.getSortOrder());
        return dto;
    }

    private TwinScanDelayOption fromTemplateDto(ScanDelayOptionDTO dto) {
        TwinScanDelayOption row = new TwinScanDelayOption();
        row.setId(dto.getId());
        row.setCarrierId(null);
        row.setRoomId("");
        row.setRoomName("");
        row.setButtonLabel(getButtonLabel());
        row.setOptionLabel(dto.getOptionLabel());
        row.setDisplayStart(dto.getDisplayStart());
        row.setDisplayEnd(dto.getDisplayEnd());
        row.setRequireApproval(dto.isRequireApproval() ? 1 : 0);
        row.setReviewerUserIds(writeJson(dto.getReviewerUserIds()));
        row.setExemptMode(StringUtils.hasText(dto.getExemptMode()) ? dto.getExemptMode() : "TIME");
        row.setDurationMinutes(dto.getDurationMinutes());
        row.setExtendUntilTime(StringUtils.hasText(dto.getExtendUntilTime()) ? dto.getExtendUntilTime().trim() : null);
        row.setMaxCount(dto.getMaxCount());
        row.setExemptRoomIds(writeJson(dto.getExemptRoomIds()));
        row.setEnabled(dto.isEnabled() ? 1 : 0);
        row.setSortOrder(dto.getSortOrder());
        return row;
    }

    private void replaceCarrierOptions(Long carrierId, List<Long> optionIds) {
        if (carrierId == null) return;
        carrierOptionMapper.deleteByCarrierId(carrierId);
        if (optionIds == null || optionIds.isEmpty()) return;
        int order = optionIds.size();
        for (Long optionId : optionIds) {
            if (optionId == null) continue;
            TwinScanDelayOption opt = optionMapper.findById(optionId);
            if (opt == null) {
                throw new IllegalArgumentException("菜单项不存在: " + optionId);
            }
            TwinScanDelayCarrierOption bind = new TwinScanDelayCarrierOption();
            bind.setCarrierId(carrierId);
            bind.setOptionId(optionId);
            bind.setSortOrder(order--);
            carrierOptionMapper.insert(bind);
        }
    }

    private ScanDelayCarrierDTO toCarrierDto(TwinScanDelayCarrier row) {
        if (row == null) return null;
        ScanDelayCarrierDTO dto = new ScanDelayCarrierDTO();
        dto.setId(row.getId());
        dto.setButtonLabel(row.getButtonLabel());
        dto.setEnabled(row.getEnabled() != null && row.getEnabled() == 1);
        dto.setSortOrder(row.getSortOrder() == null ? 0 : row.getSortOrder());
        return dto;
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
