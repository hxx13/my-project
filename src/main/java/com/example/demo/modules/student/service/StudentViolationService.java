package com.example.demo.modules.student.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class StudentViolationService {

    private static final Logger log = LoggerFactory.getLogger(StudentViolationService.class);

    private final TwinStudentViolationMapper violationMapper;

    public StudentViolationService(TwinStudentViolationMapper violationMapper) {
        this.violationMapper = violationMapper;
    }

    public Map<String, Object> getViolations(User user, int page, int size, String startDate, String endDate) {
        int offset = (page - 1) * size;
        List<TwinStudentViolation> allViolations = violationMapper.selectRecent(user.getId(), 10000);

        // Filter by date range (createdAt is LocalDateTime, toString gives ISO format like "2026-05-29T10:30:00")
        List<TwinStudentViolation> filtered = new ArrayList<>();
        if (allViolations != null) {
            for (TwinStudentViolation v : allViolations) {
                if (v.getCreatedAt() == null) continue;
                String createTimeStr = v.getCreatedAt().toString();
                if (startDate != null && !startDate.isEmpty() && createTimeStr.compareTo(startDate) < 0) continue;
                if (endDate != null && !endDate.isEmpty() && createTimeStr.compareTo(endDate + "T23:59:59") > 0) continue;
                filtered.add(v);
            }
        }

        int total = filtered.size();

        // Paginate
        int toIndex = Math.min(offset + size, filtered.size());
        List<TwinStudentViolation> pageData = offset < filtered.size()
            ? filtered.subList(offset, toIndex)
            : Collections.emptyList();

        // Map to DTO
        List<Map<String, Object>> data = new ArrayList<>();
        for (TwinStudentViolation v : pageData) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", String.valueOf(v.getId()));
            item.put("time", v.getCreatedAt() != null ? v.getCreatedAt().toString() : "");
            item.put("type", v.getViolationText() != null ? v.getViolationText() : "违规");
            item.put("roomName", "");
            item.put("doorName", "");
            item.put("description", v.getViolationText() != null ? v.getViolationText() : "");
            item.put("penalty", "0分");
            // Map status: active->pending, cleared->processed
            String status = "pending";
            if ("cleared".equals(v.getStatus())) status = "processed";
            else if ("appealing".equals(v.getStatus())) status = "appealing";
            item.put("status", status);
            item.put("processedBy", v.getClearedByUserId() != null ? v.getClearedByUserId() : "");
            item.put("processedTime", v.getClearedAt() != null ? v.getClearedAt().toString() : "");
            data.add(item);
        }

        return Map.of("data", data, "total", total);
    }
}
