package com.example.demo.modules.twin.dashboard.service;

import com.example.demo.modules.twin.dashboard.entity.ViolationTextTemplate;
import com.example.demo.modules.twin.dashboard.mapper.ViolationTextTemplateMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ViolationTextTemplateService {
    private static final Logger log = LoggerFactory.getLogger(ViolationTextTemplateService.class);
    private final ViolationTextTemplateMapper mapper;

    public ViolationTextTemplateService(ViolationTextTemplateMapper mapper) {
        this.mapper = mapper;
    }

    public List<ViolationTextTemplate> listAll() {
        return mapper.selectAll();
    }

    public ViolationTextTemplate getById(long id) {
        return mapper.selectById(id);
    }

    @Transactional
    public ViolationTextTemplate create(String name, String violationText, int sortOrder) {
        ViolationTextTemplate row = new ViolationTextTemplate();
        row.setName(name != null && !name.isBlank() ? name.trim() : "未命名模板");
        row.setViolationText(violationText != null ? violationText : "");
        row.setSortOrder(sortOrder);
        mapper.insert(row);
        log.info("[violation-template] created id={} name={}", row.getId(), row.getName());
        return row;
    }

    @Transactional
    public ViolationTextTemplate update(long id, String name, String violationText, Integer sortOrder) {
        ViolationTextTemplate existing = mapper.selectById(id);
        if (existing == null) {
            throw new IllegalArgumentException("模板不存在: " + id);
        }
        if (name != null && !name.isBlank()) {
            existing.setName(name.trim());
        }
        if (violationText != null) {
            existing.setViolationText(violationText);
        }
        if (sortOrder != null) {
            existing.setSortOrder(sortOrder);
        }
        mapper.update(existing);
        return mapper.selectById(id);
    }

    @Transactional
    public boolean delete(long id) {
        int n = mapper.deleteById(id);
        return n > 0;
    }
}
