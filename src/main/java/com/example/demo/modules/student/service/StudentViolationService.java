package com.example.demo.modules.student.service;

import com.example.demo.modules.auth.entity.User;
import com.example.demo.modules.twin.dashboard.entity.TwinStudentViolation;
import com.example.demo.modules.twin.dashboard.mapper.TwinStudentViolationMapper;
import com.example.demo.modules.twin.dashboard.service.TwinStudentViolationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class StudentViolationService {

    private static final Logger log = LoggerFactory.getLogger(StudentViolationService.class);

    private final TwinStudentViolationMapper violationMapper;
    private final TwinStudentViolationService twinStudentViolationService;

    public StudentViolationService(TwinStudentViolationMapper violationMapper,
                                   TwinStudentViolationService twinStudentViolationService) {
        this.violationMapper = violationMapper;
        this.twinStudentViolationService = twinStudentViolationService;
    }

    public Map<String, Object> getViolations(User user, int page, int size, String startDate, String endDate) {
        int offset = (page - 1) * size;
        List<TwinStudentViolation> allViolations = violationMapper.selectRecent(user.getId(), 10000);

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
        int toIndex = Math.min(offset + size, filtered.size());
        List<TwinStudentViolation> pageData = offset < filtered.size()
            ? filtered.subList(offset, toIndex)
            : Collections.emptyList();

        List<Map<String, Object>> data = new ArrayList<>();
        for (TwinStudentViolation v : pageData) {
            data.add(twinStudentViolationService.toMobileListItem(v));
        }

        return Map.of("data", data, "total", total, "page", page, "size", size);
    }
}
