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
import java.util.List;

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
        PurchaseOrderView view = new PurchaseOrderView();
        view.setId(order.getId());
        view.setApplicantId(order.getApplicantId());
        view.setApplicantName(resolveApplicantDisplay(order.getApplicantId(), order.getApplicantName()));
        view.setLocation(order.getLocation());
        view.setContent(order.getContent());
        view.setStatus(order.getStatus());
        view.setRequestImages(fromJsonArray(order.getRequestImagesJson()));
        view.setResultImages(fromJsonArray(order.getResultImagesJson()));
        view.setResultRemark(order.getResultRemark());
        view.setProcessorId(order.getProcessorId());
        if (StringUtils.hasText(order.getProcessorId())) {
            view.setProcessorName(userDisplayNameService.resolveDisplayName(order.getProcessorId()));
        }
        view.setIsPublic(order.getIsPublic() == null ? 0 : order.getIsPublic());
        view.setCreateTime(order.getCreateTime());
        view.setStartTime(order.getStartTime());
        view.setFinishTime(order.getFinishTime());
        return view;
    }

    private String resolveApplicantDisplay(String applicantId, String storedName) {
        String trimmed = StringUtils.hasText(storedName) ? storedName.trim() : "";
        if (StringUtils.hasText(trimmed) && (!StringUtils.hasText(applicantId) || !trimmed.equals(applicantId.trim()))) {
            return trimmed;
        }
        if (StringUtils.hasText(applicantId)) {
            String resolved = userDisplayNameService.resolveDisplayName(applicantId);
            return StringUtils.hasText(resolved) ? resolved : applicantId.trim();
        }
        return trimmed;
    }
}
