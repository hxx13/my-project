package com.example.demo.modules.twin.dashboard.service;

import com.example.demo.modules.twin.dashboard.entity.ViolationTextTemplate;
import com.example.demo.modules.twin.dashboard.mapper.ViolationTextTemplateMapper;
import com.example.demo.modules.twin.obligation.content.ContentJsonSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * T2-2 定稿：预设模板库<strong>保留</strong>，职责仅限管理端「快选调色板」。
 *
 * <p>运行时文案渲染唯一走 {@code ViolationTextTemplateRenderer}，来源为滞留配置 /
 * 违规规则模板，不读本表。本 Service 无服务端业务消费方，禁止在开单/定时任务中引用。
 */
@Service
public class ViolationTextTemplateService {
    private static final Logger log = LoggerFactory.getLogger(ViolationTextTemplateService.class);
    private final ViolationTextTemplateMapper mapper;
    private final ObjectMapper objectMapper;

    public ViolationTextTemplateService(ViolationTextTemplateMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public List<ViolationTextTemplate> listAll() {
        return mapper.selectAll();
    }

    public ViolationTextTemplate getById(long id) {
        return mapper.selectById(id);
    }

    @Transactional
    public ViolationTextTemplate create(String name, String violationText, int sortOrder) {
        ContentJsonSupport.Resolved resolved = ContentJsonSupport.resolve(objectMapper, null, violationText, true);
        ViolationTextTemplate row = new ViolationTextTemplate();
        row.setName(name != null && !name.isBlank() ? name.trim() : "未命名模板");
        row.setViolationText(resolved.contentHtml());
        row.setContentJson(resolved.contentJson());
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
            ContentJsonSupport.Resolved resolved = ContentJsonSupport.resolve(objectMapper, null, violationText, true);
            existing.setViolationText(resolved.contentHtml());
            existing.setContentJson(resolved.contentJson());
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
