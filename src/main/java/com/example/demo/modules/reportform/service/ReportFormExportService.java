package com.example.demo.modules.reportform.service;

import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.util.*;

@Service
public class ReportFormExportService {

    private final ReportFormDefinitionMapper definitionMapper;
    private final ReportFormSubmissionMapper submissionMapper;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ReportFormExportService(ReportFormDefinitionMapper definitionMapper,
                                   ReportFormSubmissionMapper submissionMapper) {
        this.definitionMapper = definitionMapper;
        this.submissionMapper = submissionMapper;
    }

    /** Single submission export: static cells + fill values */
    public byte[] exportSingle(Long formId, Long submissionId) throws Exception {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) throw new RuntimeException("报表不存在");

        ReportFormSubmission sub = submissionMapper.selectById(submissionId);
        if (sub == null) throw new RuntimeException("提交记录不存在");

        var layout = objectMapper.readTree(form.getLayoutJson());
        var cells = layout.get("cells");
        var fieldValues = objectMapper.readTree(sub.getFieldValuesJson());

        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet(form.getName());
            int rowIdx = 0;
            for (var cell : cells) {
                int r = cell.get("row").asInt();
                while (rowIdx < r) { sheet.createRow(rowIdx++); }
                Row row = sheet.getRow(r);
                if (row == null) row = sheet.createRow(r);
                int c = cell.get("col").asInt();
                Cell xlCell = row.createCell(c);

                String kind = cell.get("kind").asText();
                String text;
                if ("static".equals(kind)) {
                    text = cell.has("staticText") ? cell.get("staticText").asText() : "";
                } else {
                    String fk = cell.get("fieldKey").asText();
                    text = fieldValues.has(fk) ? fieldValues.get(fk).asText() : "";
                }
                xlCell.setCellValue(text);

                int colSpan = cell.has("colSpan") ? cell.get("colSpan").asInt() : 1;
                int rowSpan = cell.has("rowSpan") ? cell.get("rowSpan").asInt() : 1;
                if (colSpan > 1 || rowSpan > 1) {
                    sheet.addMergedRegion(new org.apache.poi.ss.util.CellRangeAddress(
                        r, r + rowSpan - 1, c, c + colSpan - 1));
                }
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            wb.write(bos);
            return bos.toByteArray();
        }
    }

    /** Batch export: all submissions for a form as rows in one sheet */
    public byte[] exportBatch(Long formId) throws Exception {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) throw new RuntimeException("报表不存在");

        List<ReportFormSubmission> subs = submissionMapper.selectByFormId(formId);
        var layout = objectMapper.readTree(form.getLayoutJson());
        var cells = layout.get("cells");
        var fieldCells = new ArrayList<com.fasterxml.jackson.databind.JsonNode>();
        for (var cell : cells) {
            if ("field".equals(cell.get("kind").asText())) fieldCells.add(cell);
        }

        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet(form.getName());
            // Header row: field labels
            Row header = sheet.createRow(0);
            header.createCell(0).setCellValue("填写人");
            header.createCell(1).setCellValue("状态");
            header.createCell(2).setCellValue("提交时间");
            for (int i = 0; i < fieldCells.size(); i++) {
                String fk = fieldCells.get(i).get("fieldKey").asText();
                var fields = layout.get("fields");
                String label = fields.has(fk) && fields.get(fk).has("label")
                    ? fields.get(fk).get("label").asText() : fk;
                header.createCell(i + 3).setCellValue(label);
            }

            // Data rows
            for (int si = 0; si < subs.size(); si++) {
                ReportFormSubmission sub = subs.get(si);
                Row row = sheet.createRow(si + 1);
                row.createCell(0).setCellValue("用户#" + sub.getUserId());
                row.createCell(1).setCellValue("submitted".equals(sub.getStatus()) ? "已提交" : "草稿");
                row.createCell(2).setCellValue(sub.getSubmittedAt() != null ? sub.getSubmittedAt().toString() : "");
                var values = objectMapper.readTree(sub.getFieldValuesJson());
                for (int i = 0; i < fieldCells.size(); i++) {
                    String fk = fieldCells.get(i).get("fieldKey").asText();
                    String val = values.has(fk) ? values.get(fk).asText() : "";
                    row.createCell(i + 3).setCellValue(val);
                }
            }
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            wb.write(bos);
            return bos.toByteArray();
        }
    }
}
