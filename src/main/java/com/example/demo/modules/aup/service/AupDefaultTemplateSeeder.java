package com.example.demo.modules.aup.service;

import com.example.demo.modules.aup.dto.TemplateSaveRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;

/**
 * AUP 默认模板种子：环境变量 {@code AUP_DEFAULT_TEMPLATE}（JSON，对齐 TemplateSaveRequest）优先，
 * 未配置则回退到 classpath:db/default-aup-template.json。
 *
 * <p>幂等：仅当「aup」formKey 尚无任何版本时写入一个 v1 DRAFT，之后不再覆盖——
 * 运维可在后台继续编辑 / 新建草稿。启动链在 bootstrap-aup.sql 之后调用。
 */
@Service
public class AupDefaultTemplateSeeder {

    private static final Logger log = LoggerFactory.getLogger(AupDefaultTemplateSeeder.class);
    private static final String RESOURCE_PATH = "db/default-aup-template.json";

    private final AupTemplateService aupTemplateService;
    private final ObjectMapper objectMapper;

    /** 环境变量 JSON（空 = 未配置，走资源回退）。 */
    @Value("${AUP_DEFAULT_TEMPLATE:}")
    private String envTemplateJson;

    public AupDefaultTemplateSeeder(AupTemplateService aupTemplateService, ObjectMapper objectMapper) {
        this.aupTemplateService = aupTemplateService;
        this.objectMapper = objectMapper;
    }

    /**
     * 启动时调用：保证内置种子作为初始默认配置存在。
     * 幂等——已有已发布/非空内容时不覆盖；无任何版本写 v1；只剩空草稿就地刷新最新草稿。
     */
    public void seedIfNeeded() {
        TemplateSaveRequest req = loadSeedRequest();
        if (req == null) {
            log.info("AUP 默认模板未配置或无法解析，跳过种子（AUP_DEFAULT_TEMPLATE / 环境资源为空）");
            return;
        }
        boolean seeded = aupTemplateService.ensureSeedDraft(
                AupTemplateService.DEFAULT_FORM_KEY,
                req.getName(),
                req.getDescription(),
                req.getSections());
        if (seeded) {
            log.info("AUP 默认模板已就绪：{}（{} 个板块）",
                    req.getName() != null ? req.getName() : "IACUC 动物实验方案（默认）",
                    req.getSections().size());
        }
    }

    /**
     * 读取内置默认模板（环境变量 {@code AUP_DEFAULT_TEMPLATE} 优先，回退 classpath
     * {@code db/default-aup-template.json}），解析为 {@link TemplateSaveRequest}。
     * 供后台「导入内置模板」端点复用；无配置 / 解析失败返回 null。
     */
    public TemplateSaveRequest loadSeedRequest() {
        try {
            String json = resolveJson();
            if (json == null || json.isBlank()) {
                return null;
            }
            TemplateSaveRequest req = objectMapper.readValue(json, TemplateSaveRequest.class);
            if (req.getSections() == null || req.getSections().isEmpty()) {
                log.warn("AUP 默认模板 JSON 无 sections，忽略");
                return null;
            }
            return req;
        } catch (Exception e) {
            log.warn("AUP 默认模板解析失败，忽略：{}", e.getMessage());
            return null;
        }
    }

    /** 环境变量优先，否则读 classpath 资源。 */
    private String resolveJson() throws Exception {
        if (envTemplateJson != null && !envTemplateJson.isBlank()) {
            return envTemplateJson;
        }
        ClassPathResource res = new ClassPathResource(RESOURCE_PATH);
        if (res.exists()) {
            return new String(res.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        }
        return null;
    }
}
