package com.example.demo.modules.reportform.util;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpHeaders;

import java.net.URLEncoder;
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
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.CONTENT_DISPOSITION, disposition("attachment", filename));
        return headers;
    }

    public static HttpHeaders inlineHeaders(String filename) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.CONTENT_DISPOSITION, disposition("inline", filename));
        return headers;
    }

    /**
     * RFC 6266 形状：{@code filename=} 放纯 ASCII 回退名（只认它的老客户端/下载器靠它拿扩展名），
     * {@code filename*=} 放 UTF-8 真名。Spring 的 {@code filename(name, charset)} 会用 RFC 2047
     * encoded-word 填 {@code filename=}（那是邮件头编码，HTTP 里无效），故手工拼。
     */
    private static String disposition(String type, String filename) {
        return type + "; filename=\"" + asciiFallback(filename)
                + "\"; filename*=UTF-8''" + percentEncode(filename);
    }

    /** 只留 ASCII 字母数字与安全标点；空则退到 {@code document}，保证老客户端也能拿到带扩展名的名字。 */
    private static String asciiFallback(String filename) {
        String name = filename;
        String ext = "";
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            ext = name.substring(dot).replaceAll("[^A-Za-z0-9.]", "");
            name = name.substring(0, dot);
        }
        // 剔掉中文后会留下空段连成的 `--`：`20260918-位亚磊-4` 会变成 `20260918--4`。
        // 把连续分隔符并成一个再修两端，老客户端拿到的名字才不像坏了。
        name = name.replaceAll("[^A-Za-z0-9_-]", "")
                .replaceAll("[-_]{2,}", "-")
                .replaceAll("^[-_]+", "")
                .replaceAll("[-_]+$", "");
        if (name.isEmpty()) name = "document";
        return name + ext;
    }

    private static String percentEncode(String filename) {
        return URLEncoder.encode(filename, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("*", "%2A");
    }
}
