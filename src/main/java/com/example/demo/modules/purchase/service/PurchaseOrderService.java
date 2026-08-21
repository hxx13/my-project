package com.example.demo.modules.purchase.service;

import com.example.demo.modules.auth.service.UserDisplayNameService;
import com.example.demo.modules.purchase.dto.PurchaseOrderView;
import com.example.demo.modules.purchase.entity.PurchaseOrder;
import com.example.demo.modules.purchase.mapper.PurchaseOrderMapper;
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
public class PurchaseOrderService {
    private final PurchaseOrderMapper purchaseOrderMapper;
    private final ObjectMapper objectMapper;
    private final UserDisplayNameService userDisplayNameService;

    public PurchaseOrderService(PurchaseOrderMapper purchaseOrderMapper,
                                ObjectMapper objectMapper,
                                UserDisplayNameService userDisplayNameService) {
        this.purchaseOrderMapper = purchaseOrderMapper;
        this.objectMapper = objectMapper;
        this.userDisplayNameService = userDisplayNameService;
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

    public PurchaseOrderView toView(PurchaseOrder order) {
        if (order == null) {
            return null;
        }
        return toViews(List.of(order)).stream().findFirst().orElse(null);
    }

    /** 列表/回收站：批量解析申请人与处理人展示名（staffId / 19 位 id 同源）。 */
    public List<PurchaseOrderView> toViews(List<PurchaseOrder> orders) {
        if (orders == null || orders.isEmpty()) {
            return List.of();
        }
        Set<String> ids = new LinkedHashSet<>();
        for (PurchaseOrder order : orders) {
            if (order == null) continue;
            addId(ids, order.getApplicantId());
            addId(ids, order.getProcessorId());
        }
        Map<String, String> nameMap = userDisplayNameService.resolveDisplayNames(ids);
        List<PurchaseOrderView> out = new ArrayList<>(orders.size());
        for (PurchaseOrder order : orders) {
            if (order == null) continue;
            out.add(toView(order, nameMap));
        }
        return out;
    }

    private PurchaseOrderView toView(PurchaseOrder order, Map<String, String> nameMap) {
        PurchaseOrderView view = new PurchaseOrderView();
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
