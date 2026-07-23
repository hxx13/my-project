package com.example.demo.modules.reportform.util;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;

import java.nio.charset.StandardCharsets;

/**
 * 报表导出文件名：模板名称；个人表附加子文件名称。
 */
public final class ReportFormExportFilename {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private ReportFormExportFilename() {
    }

    public static String sanitize(String raw) {
        if (raw == null) return "";
        String s = raw.trim().replaceAll("[\\\\/:*?\"<>|]", "_").replaceAll("\\s+", " ");
        return s.strip();
    }

    public static boolean isIndividualMode(ReportFormDefinition form) {
        if (form == null || form.getFillPolicyJson() == null || form.getFillPolicyJson().isBlank()) {
            return false;
        }
        try {
            JsonNode node = MAPPER.readTree(form.getFillPolicyJson());
            return "individual".equalsIgnoreCase(node.path("mode").asText(""));
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * @param batch 无 submissionId 的批量导出
     */
    public static String build(ReportFormDefinition form, ReportFormSubmission submission,
                               boolean batch, String extension) {
        String base = sanitize(form != null ? form.getName() : null);
        if (base.isEmpty()) {
            base = form != null && form.getId() != null
                    ? "report-form-" + form.getId()
                    : "report-form";
        }
        String ext = extension.startsWith(".") ? extension.substring(1) : extension;

        if (batch) {
            return base + "-批量." + ext;
        }

        if (form != null && isIndividualMode(form) && submission != null) {
            String label = sanitize(submission.getInstanceLabel());
            if (!label.isEmpty()) {
                return base + "-" + label + "." + ext;
            }
        }

        return base + "." + ext;
    }

    /** 设计页 Word 模板导出：表单名 + 模板名 */
    public static String buildWordTemplate(ReportFormDefinition form, String wordTemplateName, String extension) {
        String base = sanitize(form != null ? form.getName() : null);
        if (base.isEmpty()) {
            base = form != null && form.getId() != null
                    ? "report-form-" + form.getId()
                    : "report-form";
        }
        String ext = extension.startsWith(".") ? extension.substring(1) : extension;
        String tmpl = sanitize(wordTemplateName);
        if (!tmpl.isEmpty()) {
            return base + "-" + tmpl + "." + ext;
        }
        return base + "." + ext;
    }

    public static HttpHeaders attachmentHeaders(String filename) {
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(filename, StandardCharsets.UTF_8)
                .build();
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.CONTENT_DISPOSITION, disposition.toString());
        return headers;
    }

    public static HttpHeaders inlineHeaders(String filename) {
        ContentDisposition disposition = ContentDisposition.inline()
                .filename(filename, StandardCharsets.UTF_8)
                .build();
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.CONTENT_DISPOSITION, disposition.toString());
        return headers;
    }
}
