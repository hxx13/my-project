package com.example.demo.modules.training.service;

import com.example.demo.modules.document.service.DocxToPdfConverter;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.example.demo.modules.reportform.service.ReportFormWordService;
import com.example.demo.modules.training.entity.PersonQualification;
import com.example.demo.modules.training.entity.QualificationItemConfig;
import com.example.demo.modules.training.mapper.PersonQualificationMapper;
import com.example.demo.modules.training.mapper.QualificationItemConfigMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/** 资格报告归档：把表单提交渲染成带页眉页脚的 PDF 并落盘。 */
@Service
public class QualificationReportService {

    private static final Logger log = LoggerFactory.getLogger(QualificationReportService.class);

    private final QualificationItemConfigMapper configMapper;
    private final ReportFormDefinitionMapper definitionMapper;
    private final ReportFormSubmissionMapper submissionMapper;
    private final ReportFormWordService wordService;
    private final DocxToPdfConverter converter;
    private final PersonQualificationMapper qualificationMapper;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Path storageDir;

    public QualificationReportService(QualificationItemConfigMapper configMapper,
                                      ReportFormDefinitionMapper definitionMapper,
                                      ReportFormSubmissionMapper submissionMapper,
                                      ReportFormWordService wordService,
                                      DocxToPdfConverter converter,
                                      PersonQualificationMapper qualificationMapper,
                                      @Value("${app.qualification.storage-dir:./data/qualification-reports}") String storageDir) {
        this.configMapper = configMapper;
        this.definitionMapper = definitionMapper;
        this.submissionMapper = submissionMapper;
        this.wordService = wordService;
        this.converter = converter;
        this.qualificationMapper = qualificationMapper;
        this.storageDir = Path.of(storageDir);
    }

    /**
     * 表单提交后调用：若该表单绑定了资格项，生成 PDF、落盘、写 fileRef（state 保持 0 待审）。
     * 生成失败只记日志，不抛异常——不能因为生成失败让学生的提交回滚。
     */
    public void onSubmitted(Long formId, Long submissionId, String personId) {
        QualificationItemConfig cfg = configMapper.findByFormId(formId);
        if (cfg == null) {
            return;
        }
        try {
            byte[] pdf = generate(formId, submissionId, cfg.getWordTemplateId());
            Files.createDirectories(storageDir);
            String fileName = personId + "-" + cfg.getItemKey() + "-" + System.currentTimeMillis() + ".pdf";
            Files.write(storageDir.resolve(fileName), pdf);

            PersonQualification q = new PersonQualification();
            q.setPersonId(personId);
            q.setItemKey(cfg.getItemKey());
            q.setState(0);
            q.setFileRef(fileName);
            qualificationMapper.upsert(q);
            log.info("[qualification] 报告已生成 person={} item={} file={}", personId, cfg.getItemKey(), fileName);
        } catch (Exception e) {
            log.error("[qualification] 报告生成失败 person={} form={} submission={}: {}",
                    personId, formId, submissionId, e.getMessage());
        }
    }

    /** 读取归档 PDF（找不到抛 IllegalStateException）。 */
    public byte[] load(String personId, String itemKey) {
        PersonQualification q = qualificationMapper.findByPersonAndItem(personId, itemKey);
        if (q == null || q.getFileRef() == null || q.getFileRef().isBlank()) {
            throw new IllegalStateException("报告尚未生成");
        }
        try {
            return Files.readAllBytes(storageDir.resolve(q.getFileRef()));
        } catch (Exception e) {
            throw new IllegalStateException("报告文件读取失败: " + e.getMessage());
        }
    }

    /** 表单值 → 回填 docx → 转 PDF。 */
    public byte[] generate(Long formId, Long submissionId, String wordTemplateId) throws Exception {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) {
            throw new IllegalStateException("表单不存在: " + formId);
        }
        JsonNode templates = objectMapper.readTree(
                form.getWordTemplateIdsJson() == null ? "[]" : form.getWordTemplateIdsJson());
        JsonNode target = null;
        for (JsonNode t : templates) {
            if (wordTemplateId == null || wordTemplateId.isBlank() || t.path("id").asText().equals(wordTemplateId)) {
                target = t;
                break;
            }
        }
        if (target == null) {
            throw new IllegalStateException("表单未配置 Word 模板: " + formId);
        }

        byte[] templateBytes = Base64.getDecoder().decode(target.path("data").asText());
        Map<String, String> bookmarkMapping = new LinkedHashMap<>();
        JsonNode bm = target.get("bookmarkMapping");
        if (bm != null) {
            bm.fields().forEachRemaining(e -> bookmarkMapping.put(e.getKey(), e.getValue().asText()));
        }
        wordService.suggestBookmarkMapping(form.getLayoutJson(), wordService.parseBookmarks(templateBytes))
                .forEach(bookmarkMapping::putIfAbsent);

        byte[] docx = wordService.exportWord(formId, submissionId, templateBytes, bookmarkMapping, null);
        return converter.convert(docx);
    }
}
