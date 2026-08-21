package com.example.demo.modules.repair.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.repair.dto.RepairOrderView;
import com.example.demo.modules.repair.entity.RepairOrder;
import com.example.demo.modules.repair.mapper.RepairOrderMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class RepairOrderService {
    private final RepairOrderMapper repairOrderMapper;
    private final ObjectMapper objectMapper;
    private final UserDisplayNameService userDisplayNameService;

    public RepairOrderService(RepairOrderMapper repairOrderMapper,
                              ObjectMapper objectMapper,
                              UserDisplayNameService userDisplayNameService) {
        this.repairOrderMapper = repairOrderMapper;
        this.objectMapper = objectMapper;
        this.userDisplayNameService = userDisplayNameService;
    }

    public RepairOrderMapper getMapper() {
        return repairOrderMapper;
    }

    public String toJsonArray(List<String> urls) {
        try {
            return objectMapper.writeValueAsString(urls == null ? Collections.emptyList() : urls);
        } catch (Exception e) {
            return "[]";
        }
    }

    public List<String> fromJsonArray(String json) {
        if (json == null || json.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {
            });
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    public RepairOrderView toView(RepairOrder order) {
        if (order == null) {
            return null;
        }
        return toViews(List.of(order)).stream().findFirst().orElse(null);
    }

    /** 列表/回收站：批量解析申请人与处理人展示名（staffId / 19 位 id 同源）。 */
    public List<RepairOrderView> toViews(List<RepairOrder> orders) {
        if (orders == null || orders.isEmpty()) {
            return List.of();
        }
        Set<String> ids = new LinkedHashSet<>();
        for (RepairOrder order : orders) {
            if (order == null) continue;
            addId(ids, order.getApplicantId());
            addId(ids, order.getProcessorId());
        }
        Map<String, String> nameMap = userDisplayNameService.resolveDisplayNames(ids);
        List<RepairOrderView> out = new ArrayList<>(orders.size());
        for (RepairOrder order : orders) {
            if (order == null) continue;
            out.add(toView(order, nameMap));
        }
        return out;
    }

    private RepairOrderView toView(RepairOrder order, Map<String, String> nameMap) {
        RepairOrderView view = new RepairOrderView();
        view.setId(order.getId());
        view.setApplicantId(order.getApplicantId());
        view.setApplicantName(displayNameOf(nameMap, order.getApplicantId(), order.getApplicantName()));
        view.setLocation(order.getLocation());
        view.setContent(order.getContent());
        view.setStatus(order.getStatus());
        view.setRequestImages(fromJsonArray(order.getRequestImagesJson()));
        view.setResultImages(fromJsonArray(order.getResultImagesJson()));
        view.setResultRemark(order.getResultRemark());
        view.setProcessorId(order.getProcessorId());
        if (StringUtils.hasText(order.getProcessorId())) {
            view.setProcessorName(displayNameOf(nameMap, order.getProcessorId(), null));
        }
        view.setIsPublic(order.getIsPublic() == null ? 0 : order.getIsPublic());
        view.setCreateTime(order.getCreateTime());
        view.setStartTime(order.getStartTime());
        view.setFinishTime(order.getFinishTime());
        return view;
    }

    /**
     * 展示名始终优先走 {@link UserDisplayNameService}；仅在解析结果为空时回退库内快照（且快照不能等于裸 id）。
     */
    private String displayNameOf(Map<String, String> nameMap, String userId, String storedName) {
        if (StringUtils.hasText(userId)) {
            String id = userId.trim();
            String resolved = nameMap != null ? nameMap.get(id) : null;
            if (!StringUtils.hasText(resolved)) {
                resolved = userDisplayNameService.resolveDisplayName(id);
            }
            if (StringUtils.hasText(resolved) && !resolved.trim().equals(id)) {
                return resolved.trim();
            }
            if (StringUtils.hasText(resolved)) {
                // 解析仍等于 id：再尝试非 id 快照
                String trimmed = StringUtils.hasText(storedName) ? storedName.trim() : "";
                if (StringUtils.hasText(trimmed) && !trimmed.equals(id)) {
                    return trimmed;
                }
                return resolved.trim();
            }
        }
        String trimmed = StringUtils.hasText(storedName) ? storedName.trim() : "";
        return trimmed;
    }

    private static void addId(Set<String> ids, String raw) {
        if (StringUtils.hasText(raw)) {
            ids.add(raw.trim());
        }
    }
}
