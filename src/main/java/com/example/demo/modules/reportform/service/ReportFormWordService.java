package com.example.demo.modules.reportform.service;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.reportform.entity.ReportFormDefinition;
import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import com.example.demo.modules.reportform.mapper.ReportFormDefinitionMapper;
import com.example.demo.modules.reportform.mapper.ReportFormSubmissionMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.xwpf.model.XWPFHeaderFooterPolicy;
import org.apache.poi.xwpf.usermodel.*;
import org.apache.xmlbeans.XmlCursor;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTBookmark;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTMarkupRange;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.CTP;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.w3c.dom.Node;

import javax.xml.namespace.QName;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.util.*;

/**
 * Word 模板服务：导入 .docx 解析书签 → 书签→fieldKey 映射 → 注入填报数据导出。
 */
@Service
public class ReportFormWordService {

    private static final Logger log = LoggerFactory.getLogger(ReportFormWordService.class);
    private static final QName W_R = new QName(
            "http://schemas.openxmlformats.org/wordprocessingml/2006/main", "r", "w");
    private static final QName W_T = new QName(
            "http://schemas.openxmlformats.org/wordprocessingml/2006/main", "t", "w");

    private final ReportFormDefinitionMapper definitionMapper;
    private final ReportFormSubmissionMapper submissionMapper;
    private final ObjectMapper objectMapper;

    public ReportFormWordService(ReportFormDefinitionMapper definitionMapper,
                                 ReportFormSubmissionMapper submissionMapper,
                                 ObjectMapper objectMapper) {
        this.definitionMapper = definitionMapper;
        this.submissionMapper = submissionMapper;
        this.objectMapper = objectMapper;
    }

    public List<String> parseBookmarks(byte[] docxBytes) throws Exception {
        List<String> bookmarks = new ArrayList<>();
        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(docxBytes))) {
            collectAllParagraphs(doc).forEach(p -> collectBookmarkNames(p, bookmarks));
        }
        log.info("[report-form] Word 模板解析书签: 共 {} 个 — {}", bookmarks.size(), bookmarks);
        return bookmarks;
    }

    public byte[] exportWord(Long formId, Long submissionId, byte[] templateBytes,
                            Map<String, String> bookmarkMapping) throws Exception {
        return exportWord(formId, submissionId, templateBytes, bookmarkMapping, null);
    }

    /** @param fieldValuesOverrideJson 非空时优先使用（填报页导出前刚保存的内存值） */
    public byte[] exportWord(Long formId, Long submissionId, byte[] templateBytes,
                            Map<String, String> bookmarkMapping,
                            String fieldValuesOverrideJson) throws Exception {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }

        ReportFormSubmission sub = submissionMapper.selectById(submissionId);
        if (sub == null) {
            throw new RuntimeException("提交记录不存在");
        }

        JsonNode fieldValues = parseFieldValues(sub.getFieldValuesJson());
        if (fieldValuesOverrideJson != null && !fieldValuesOverrideJson.isBlank()) {
            fieldValues = parseFieldValues(fieldValuesOverrideJson);
        }

        return fillWordDocument(form, templateBytes, bookmarkMapping, fieldValues, formId, submissionId);
    }

    /**
     * 设计页/未发布预览：将 layout 中静态格、STATIC 字段标签写入 Word（可不依赖 submission）。
     */
    public byte[] exportWordLayoutPreview(Long formId, String wtId) throws Exception {
        ReportFormDefinition form = definitionMapper.selectById(formId);
        if (form == null) {
            throw TwinBusinessException.of(ErrorCodeConstants.REPORT_FORM_NOT_FOUND, "报表不存在");
        }
        TemplateBundle bundle = resolveTemplateBundle(form, wtId);
        JsonNode fieldValues = objectMapper.createObjectNode();
        return fillWordDocument(form, bundle.templateBytes(), bundle.bookmarkMapping(), fieldValues, formId, null);
    }

    private record TemplateBundle(byte[] templateBytes, Map<String, String> bookmarkMapping) {}

    private TemplateBundle resolveTemplateBundle(ReportFormDefinition form, String wtId) throws Exception {
        var templates = objectMapper.readTree(form.getWordTemplateIdsJson());
        com.fasterxml.jackson.databind.JsonNode target = null;
        for (var t : templates) {
            if (t.get("id").asText().equals(wtId)) {
                target = t;
                break;
            }
        }
        if (target == null) {
            throw new RuntimeException("Word模板不存在");
        }
        if (!target.has("data") || target.get("data").asText("").isBlank()) {
            throw new RuntimeException("Word模板 data 为空，请重新绑定模板");
        }
        byte[] templateBytes = java.util.Base64.getDecoder().decode(target.get("data").asText());
        var bookmarkMapping = new LinkedHashMap<String, String>();
        var bmMap = target.get("bookmarkMapping");
        if (bmMap != null) {
            var iter = bmMap.fields();
            while (iter.hasNext()) {
                var e = iter.next();
                bookmarkMapping.put(e.getKey(), e.getValue().asText());
            }
        }
        var templateBookmarks = parseBookmarks(templateBytes);
        var suggested = suggestBookmarkMapping(form.getLayoutJson(), templateBookmarks);
        suggested.forEach(bookmarkMapping::putIfAbsent);
        return new TemplateBundle(templateBytes, bookmarkMapping);
    }

    private byte[] fillWordDocument(ReportFormDefinition form,
                                    byte[] templateBytes,
                                    Map<String, String> bookmarkMapping,
                                    JsonNode fieldValues,
                                    Long formId,
                                    Long submissionId) throws Exception {
        JsonNode layout = objectMapper.readTree(form.getLayoutJson());
        JsonNode layoutFields = layout.path("fields");

        List<String> templateBookmarks = parseBookmarks(templateBytes);
        Map<String, String> effectiveMapping = buildEffectiveBookmarkMapping(
                bookmarkMapping, layout, fieldValues, templateBookmarks);

        int replacedCount = 0;
        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(templateBytes))) {
            replacedCount += replaceInBodyElements(doc.getBodyElements(), effectiveMapping, layoutFields, fieldValues);

            XWPFHeaderFooterPolicy hfPolicy = doc.getHeaderFooterPolicy();
            if (hfPolicy != null) {
                if (hfPolicy.getDefaultHeader() != null) {
                    replacedCount += replaceInBodyElements(
                            hfPolicy.getDefaultHeader().getBodyElements(), effectiveMapping, layoutFields, fieldValues);
                }
                if (hfPolicy.getDefaultFooter() != null) {
                    replacedCount += replaceInBodyElements(
                            hfPolicy.getDefaultFooter().getBodyElements(), effectiveMapping, layoutFields, fieldValues);
                }
            }
            for (XWPFHeader header : doc.getHeaderList()) {
                replacedCount += replaceInBodyElements(header.getBodyElements(), effectiveMapping, layoutFields, fieldValues);
            }
            for (XWPFFooter footer : doc.getFooterList()) {
                replacedCount += replaceInBodyElements(footer.getBodyElements(), effectiveMapping, layoutFields, fieldValues);
            }

            replacedCount += applyLayoutFieldValues(doc, layout, layoutFields, fieldValues, effectiveMapping);

            int positionInjected = injectAllLayoutContentAtPositions(doc, layout, layoutFields, fieldValues);
            replacedCount += positionInjected;

            int anchorInjected = injectFieldValuesByWordAnchor(doc, layout, layoutFields, fieldValues);
            replacedCount += anchorInjected;

            int scanInjected = injectByBookmarkCellScan(doc, layoutFields, fieldValues, effectiveMapping);
            replacedCount += scanInjected;

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            doc.write(bos);
            log.info("[report-form] Word 导出完成: form={} submission={} mapping={} bookmarksInTemplate={} replaced={} positionInjected={} valueKeys={}",
                    formId, submissionId, effectiveMapping.size(), templateBookmarks.size(), replacedCount,
                    positionInjected, listFieldValueKeys(fieldValues));
            return bos.toByteArray();
        }
    }

    static Map<String, String> buildEffectiveBookmarkMapping(Map<String, String> explicit,
                                                             JsonNode layout,
                                                             JsonNode fieldValues,
                                                             Collection<String> templateBookmarks) {
        Map<String, String> mapping = new LinkedHashMap<>();
        if (explicit != null) {
            mapping.putAll(explicit);
        }

        Set<String> layoutFieldKeys = extractLayoutFieldKeys(layout);
        Map<String, String> labelToFieldKey = buildLabelToFieldKey(layout);

        for (String bm : templateBookmarks) {
            if (bm == null || bm.isBlank()) continue;
            if (mapping.containsKey(bm)) continue;
            if (layoutFieldKeys.contains(bm)) {
                mapping.put(bm, bm);
                continue;
            }
            for (String fk : layoutFieldKeys) {
                if (fk.equalsIgnoreCase(bm)) {
                    mapping.put(bm, fk);
                    break;
                }
            }
            if (mapping.containsKey(bm)) continue;
            String byLabel = labelToFieldKey.get(bm);
            if (byLabel == null) byLabel = labelToFieldKey.get(bm.trim());
            if (byLabel != null) {
                mapping.put(bm, byLabel);
            }
        }

        for (String fk : layoutFieldKeys) {
            mapping.putIfAbsent(fk, fk);
            for (String bm : templateBookmarks) {
                if (fk.equalsIgnoreCase(bm)) {
                    mapping.putIfAbsent(bm, fk);
                }
            }
            String label = layout.path("fields").path(fk).path("label").asText("");
            if (!label.isBlank()) {
                for (String bm : templateBookmarks) {
                    if (label.equals(bm) || label.equalsIgnoreCase(bm)) {
                        mapping.putIfAbsent(bm, fk);
                    }
                }
            }
        }

        return mapping;
    }

    public Map<String, String> suggestBookmarkMapping(String layoutJson, List<String> bookmarks) throws Exception {
        if (layoutJson == null || layoutJson.isBlank()) return Map.of();
        JsonNode layout = objectMapper.readTree(layoutJson);
        JsonNode fields = layout.path("fields");
        Map<String, String> mapping = new LinkedHashMap<>();
        Set<String> fieldKeys = extractLayoutFieldKeys(layout);
        Map<String, String> labelToFieldKey = buildLabelToFieldKey(layout);

        for (String bm : bookmarks) {
            if (bm == null || bm.isBlank()) continue;
            if (fieldKeys.contains(bm)) {
                mapping.put(bm, bm);
                continue;
            }
            for (String fk : fieldKeys) {
                if (fk.equalsIgnoreCase(bm)) {
                    mapping.put(bm, fk);
                    break;
                }
            }
            if (mapping.containsKey(bm)) continue;
            String byLabel = labelToFieldKey.get(bm);
            if (byLabel != null) {
                mapping.put(bm, byLabel);
            }
        }
        return mapping;
    }

    private static Map<String, String> buildLabelToFieldKey(JsonNode layout) {
        Map<String, String> map = new HashMap<>();
        JsonNode fields = layout.path("fields");
        if (!fields.isObject()) return map;
        var iter = fields.fields();
        while (iter.hasNext()) {
            var e = iter.next();
            String label = e.getValue().path("label").asText("");
            if (!label.isBlank()) {
                map.put(label.trim(), e.getKey());
            }
        }
        return map;
    }

    static Set<String> extractLayoutFieldKeys(JsonNode layout) {
        Set<String> keys = new LinkedHashSet<>();
        JsonNode cells = layout.path("cells");
        if (!cells.isArray()) return keys;
        for (JsonNode cell : cells) {
            if (!"field".equals(cell.path("kind").asText())) continue;
            String fk = cell.path("fieldKey").asText("");
            if (!fk.isBlank()) keys.add(fk);
        }
        return keys;
    }

    private JsonNode parseFieldValues(String raw) throws Exception {
        if (raw == null || raw.isBlank()) {
            return objectMapper.createObjectNode();
        }
        JsonNode node = objectMapper.readTree(raw);
        if (node.isTextual()) {
            String inner = node.asText("");
            if (inner.isBlank()) return objectMapper.createObjectNode();
            return objectMapper.readTree(inner);
        }
        return node;
    }

    private List<XWPFParagraph> collectAllParagraphs(XWPFDocument doc) {
        List<XWPFParagraph> paragraphs = new ArrayList<>();
        paragraphs.addAll(doc.getParagraphs());
        collectParagraphsFromTables(doc.getTables(), paragraphs);
        for (XWPFHeader header : doc.getHeaderList()) {
            paragraphs.addAll(header.getParagraphs());
            collectParagraphsFromTables(header.getTables(), paragraphs);
        }
        for (XWPFFooter footer : doc.getFooterList()) {
            paragraphs.addAll(footer.getParagraphs());
            collectParagraphsFromTables(footer.getTables(), paragraphs);
        }
        return paragraphs;
    }

    private void collectParagraphsFromTables(List<XWPFTable> tables, List<XWPFParagraph> out) {
        for (XWPFTable table : tables) {
            collectParagraphsFromTableRecursive(table, out);
        }
    }

    private void collectParagraphsFromTableRecursive(XWPFTable table, List<XWPFParagraph> out) {
        for (XWPFTableRow row : table.getRows()) {
            for (XWPFTableCell cell : row.getTableCells()) {
                out.addAll(cell.getParagraphs());
                collectParagraphsFromTables(cell.getTables(), out);
            }
        }
    }

    private void collectBookmarkNames(XWPFParagraph para, List<String> bookmarks) {
        for (CTBookmark bm : para.getCTP().getBookmarkStartList()) {
            String name = bm.getName();
            if (name != null && !name.isEmpty() && !isInternalBookmark(name) && !bookmarks.contains(name)) {
                bookmarks.add(name);
            }
        }
    }

    private boolean isInternalBookmark(String name) {
        return name.startsWith("_");
    }

    private int replaceInBodyElements(List<IBodyElement> elements,
                                    Map<String, String> bookmarkMapping,
                                    JsonNode layoutFields,
                                    JsonNode fieldValues) {
        int count = 0;
        for (IBodyElement element : elements) {
            if (element instanceof XWPFParagraph para) {
                count += replaceBookmarksInParagraph(para, bookmarkMapping, layoutFields, fieldValues);
            } else if (element instanceof XWPFTable table) {
                count += replaceInTableRecursive(table, bookmarkMapping, layoutFields, fieldValues);
            }
        }
        return count;
    }

    private int replaceInTableRecursive(XWPFTable table,
                                      Map<String, String> bookmarkMapping,
                                      JsonNode layoutFields,
                                      JsonNode fieldValues) {
        int count = 0;
        for (XWPFTableRow row : table.getRows()) {
            for (XWPFTableCell cell : row.getTableCells()) {
                count += replaceCellBookmarksPrimary(cell, bookmarkMapping, layoutFields, fieldValues);
                for (XWPFTable nested : cell.getTables()) {
                    count += replaceInTableRecursive(nested, bookmarkMapping, layoutFields, fieldValues);
                }
            }
        }
        return count;
    }

    /** 表格单元格优先：单书签单元格直接覆写，多书签逐段替换 */
    private int replaceCellBookmarksPrimary(XWPFTableCell cell,
                                            Map<String, String> bookmarkMapping,
                                            JsonNode layoutFields,
                                            JsonNode fieldValues) {
        List<String> bookmarkNames = collectBookmarkNamesInCell(cell);
        if (bookmarkNames.isEmpty()) {
            int c = 0;
            for (XWPFParagraph para : cell.getParagraphs()) {
                c += replaceBookmarksInParagraph(para, bookmarkMapping, layoutFields, fieldValues);
            }
            return c;
        }

        int count = 0;
        for (String bmName : bookmarkNames) {
            String fieldKey = bookmarkMapping.getOrDefault(bmName, bmName);
            if (!hasResolvableValue(fieldValues, fieldKey)) continue;
            String value = resolveFieldText(layoutFields, fieldValues, fieldKey);
            setCellPlainText(cell, value);
            return 1;
        }
        return count;
    }

    private int injectFieldValuesByWordAnchor(XWPFDocument doc,
                                              JsonNode layout,
                                              JsonNode layoutFields,
                                              JsonNode fieldValues) {
        JsonNode cells = layout.path("cells");
        if (!cells.isArray()) return 0;

        XWPFHeaderFooterPolicy hfPolicy = doc.getHeaderFooterPolicy();
        int count = 0;
        for (JsonNode cell : cells) {
            String fieldKey = cell.path("fieldKey").asText("");
            JsonNode anchor = cell.path("wordAnchor");
            if (fieldKey.isBlank() || anchor.isMissingNode() || !anchor.isObject()) continue;
            if (!hasResolvableValue(fieldValues, fieldKey)) continue;

            String region = anchor.path("region").asText("body");
            int tableIdx = anchor.path("tableIdx").asInt(0);
            int tr = anchor.path("tr").asInt();
            int tc = anchor.path("tc").asInt();

            List<IBodyElement> elements = resolveRegionElements(doc, hfPolicy, region);
            XWPFTable table = WordTableNavigator.findNthTable(elements, tableIdx);
            XWPFTableCell wc = WordTableNavigator.getCellAtLogicalPosition(table, tr, tc);
            if (wc != null) {
                String value = resolveFieldText(layoutFields, fieldValues, fieldKey);
                setCellPlainText(wc, value);
                count++;
            }
        }
        return count;
    }

    private List<IBodyElement> resolveRegionElements(XWPFDocument doc,
                                                     XWPFHeaderFooterPolicy hfPolicy,
                                                     String region) {
        return switch (region) {
            case "header" -> resolveHeaderElements(doc, hfPolicy);
            case "footer" -> resolveFooterElements(doc, hfPolicy);
            default -> doc.getBodyElements();
        };
    }

    /** 扫描文档内所有表格格：书签名命中 fieldKey / 映射名则整格覆写 */
    private int injectByBookmarkCellScan(XWPFDocument doc,
                                         JsonNode layoutFields,
                                         JsonNode fieldValues,
                                         Map<String, String> bookmarkMapping) {
        Map<String, String> aliasToValue = buildValueAliasMap(layoutFields, fieldValues, bookmarkMapping);
        if (aliasToValue.isEmpty()) return 0;

        int count = 0;
        for (XWPFTable table : WordTableNavigator.collectAllTables(doc)) {
            for (XWPFTableRow row : table.getRows()) {
                if (row == null) continue;
                for (XWPFTableCell cell : row.getTableCells()) {
                    if (cell == null) continue;
                    List<String> bms = collectBookmarkNamesInCell(cell);
                    for (String bm : bms) {
                        String value = lookupAliasValue(aliasToValue, bm);
                        if (value == null) {
                            String mappedKey = bookmarkMapping.get(bm);
                            if (mappedKey != null) {
                                value = lookupAliasValue(aliasToValue, mappedKey);
                            }
                        }
                        if (value != null) {
                            setCellPlainText(cell, value);
                            count++;
                            break;
                        }
                    }
                }
            }
        }
        return count;
    }

    private Map<String, String> buildValueAliasMap(JsonNode layoutFields,
                                                   JsonNode fieldValues,
                                                   Map<String, String> bookmarkMapping) {
        Map<String, String> map = new LinkedHashMap<>();
        if (fieldValues == null || !fieldValues.isObject()) return map;

        var names = fieldValues.fieldNames();
        while (names.hasNext()) {
            String fk = names.next();
            if (!hasResolvableValue(fieldValues, fk)) continue;
            String value = resolveFieldText(layoutFields, fieldValues, fk);
            map.put(fk, value);
            for (Map.Entry<String, String> e : bookmarkMapping.entrySet()) {
                if (fk.equals(e.getValue())) {
                    map.put(e.getKey(), value);
                }
            }
            String label = layoutFields.path(fk).path("label").asText("");
            if (!label.isBlank()) {
                map.put(label.trim(), value);
            }
        }
        return map;
    }

    private static String lookupAliasValue(Map<String, String> aliasToValue, String key) {
        if (key == null || key.isBlank()) return null;
        if (aliasToValue.containsKey(key)) return aliasToValue.get(key);
        for (Map.Entry<String, String> e : aliasToValue.entrySet()) {
            if (e.getKey().equalsIgnoreCase(key)) return e.getValue();
        }
        return null;
    }

    /**
     * 按 layout (row,col) 写入：静态格 staticText、STATIC 字段标签、填报 fieldValues（填报值优先）。
     */
    private int injectAllLayoutContentAtPositions(XWPFDocument doc,
                                                JsonNode layout,
                                                JsonNode layoutFields,
                                                JsonNode fieldValues) {
        JsonNode cells = layout.path("cells");
        if (!cells.isArray() || cells.isEmpty()) return 0;

        int headerEnd = layout.path("wordPrintHeaderRowEnd").asInt(0);
        int footerStart = layout.path("wordPrintFooterRowStart").asInt(-1);
        int footerBound = footerStart >= 0 ? footerStart : Integer.MAX_VALUE;

        Map<Long, String> posToValue = new LinkedHashMap<>();
        for (JsonNode cell : cells) {
            int row = cell.path("row").asInt();
            int col = cell.path("col").asInt();
            long pos = WordTableNavigator.packPos(row, col);

            String layoutText = resolveLayoutCellText(cell, layoutFields);
            if (!layoutText.isBlank()) {
                posToValue.put(pos, layoutText);
            }

            String fk = cell.path("fieldKey").asText("");
            if (!fk.isBlank() && hasResolvableValue(fieldValues, fk)) {
                posToValue.put(pos, resolveFieldText(layoutFields, fieldValues, fk));
            }
        }
        if (posToValue.isEmpty()) {
            return 0;
        }

        WordTableNavigator.CellTextWriter writer = (cell, text) -> setCellPlainText(cell, text);
        int count = 0;

        XWPFHeaderFooterPolicy hfPolicy = doc.getHeaderFooterPolicy();
        if (headerEnd > 0) {
            count += WordTableNavigator.walkAndInject(
                    resolveHeaderElements(doc, hfPolicy), 0, headerEnd, posToValue, writer);
        }
        count += WordTableNavigator.walkAndInject(
                doc.getBodyElements(), headerEnd, footerBound, posToValue, writer);
        if (footerStart >= 0) {
            count += WordTableNavigator.walkAndInject(
                    resolveFooterElements(doc, hfPolicy), footerStart, Integer.MAX_VALUE, posToValue, writer);
        }
        return count;
    }

    /** 设计器中的静态格文案 / STATIC 字段标签（不含 submission 填报值） */
    private String resolveLayoutCellText(JsonNode cell, JsonNode layoutFields) {
        String kind = cell.path("kind").asText("static");
        String fk = cell.path("fieldKey").asText("");

        if ("field".equals(kind) && !fk.isBlank()) {
            JsonNode fieldDef = layoutFields.path(fk);
            String type = fieldDef.path("type").asText("TEXT");
            if ("STATIC".equals(type)) {
                return fieldDef.path("label").asText("").trim();
            }
            return "";
        }

        if ("static".equals(kind)) {
            return cell.path("staticText").asText("").trim();
        }
        return "";
    }

    /** @deprecated 合并至 injectAllLayoutContentAtPositions */
    @SuppressWarnings("unused")
    private int injectFieldValuesByLayoutPosition(XWPFDocument doc,
                                                  JsonNode layout,
                                                  JsonNode layoutFields,
                                                  JsonNode fieldValues) {
        return injectAllLayoutContentAtPositions(doc, layout, layoutFields, fieldValues);
    }

    private List<IBodyElement> resolveHeaderElements(XWPFDocument doc, XWPFHeaderFooterPolicy hfPolicy) {
        if (hfPolicy != null && hfPolicy.getDefaultHeader() != null) {
            return hfPolicy.getDefaultHeader().getBodyElements();
        }
        if (!doc.getHeaderList().isEmpty()) {
            return doc.getHeaderList().get(0).getBodyElements();
        }
        return List.of();
    }

    private List<IBodyElement> resolveFooterElements(XWPFDocument doc, XWPFHeaderFooterPolicy hfPolicy) {
        if (hfPolicy != null && hfPolicy.getDefaultFooter() != null) {
            return hfPolicy.getDefaultFooter().getBodyElements();
        }
        if (!doc.getFooterList().isEmpty()) {
            return doc.getFooterList().get(0).getBodyElements();
        }
        return List.of();
    }

    private static boolean hasResolvableValue(JsonNode fieldValues, String fieldKey) {
        JsonNode node = findFieldValueNode(fieldValues, fieldKey);
        if (node == null || node.isNull()) return false;
        if (node.isTextual()) {
            String s = node.asText("");
            return !"null".equalsIgnoreCase(s);
        }
        if (node.isArray()) return true;
        return true;
    }

    /** @deprecated use {@link #hasResolvableValue} */
    private static boolean hasFieldValue(JsonNode fieldValues, String fieldKey) {
        return hasResolvableValue(fieldValues, fieldKey);
    }

    private static JsonNode findFieldValueNode(JsonNode fieldValues, String fieldKey) {
        if (fieldValues == null || fieldKey == null || fieldKey.isBlank()) return null;
        if (fieldValues.has(fieldKey)) return fieldValues.get(fieldKey);
        var names = fieldValues.fieldNames();
        while (names.hasNext()) {
            String k = names.next();
            if (k.equalsIgnoreCase(fieldKey)) return fieldValues.get(k);
        }
        return null;
    }

    private static List<String> listFieldValueKeys(JsonNode fieldValues) {
        List<String> keys = new ArrayList<>();
        if (fieldValues == null || !fieldValues.isObject()) return keys;
        fieldValues.fieldNames().forEachRemaining(keys::add);
        return keys;
    }

    private List<String> collectBookmarkNamesInCell(XWPFTableCell cell) {
        List<String> names = new ArrayList<>();
        for (XWPFParagraph para : cell.getParagraphs()) {
            for (CTBookmark bm : para.getCTP().getBookmarkStartList()) {
                String name = bm.getName();
                if (name != null && !name.isBlank() && !isInternalBookmark(name) && !names.contains(name)) {
                    names.add(name);
                }
            }
        }
        return names;
    }

    /** 按 layout 中 fieldKey 对模板全书签做兜底写入 */
    private int applyLayoutFieldValues(XWPFDocument doc,
                                       JsonNode layout,
                                       JsonNode layoutFields,
                                       JsonNode fieldValues,
                                       Map<String, String> bookmarkMapping) {
        JsonNode cells = layout.path("cells");
        if (!cells.isArray()) return 0;

        int count = 0;
        Set<String> done = new HashSet<>();
        for (JsonNode cell : cells) {
            if (!"field".equals(cell.path("kind").asText())) continue;
            String fieldKey = cell.path("fieldKey").asText("");
            if (fieldKey.isBlank() || done.contains(fieldKey)) continue;
            if (!hasResolvableValue(fieldValues, fieldKey)) continue;
            done.add(fieldKey);

            String value = resolveFieldText(layoutFields, fieldValues, fieldKey);
            LinkedHashSet<String> names = new LinkedHashSet<>();
            names.add(fieldKey);
            for (Map.Entry<String, String> e : bookmarkMapping.entrySet()) {
                if (fieldKey.equals(e.getValue())) names.add(e.getKey());
            }
            String label = layoutFields.path(fieldKey).path("label").asText("");
            if (!label.isBlank()) names.add(label.trim());

            for (String bmName : names) {
                count += replaceBookmarkByNameInDocument(doc, bmName, value);
            }
        }
        return count;
    }

    private int replaceBookmarkByNameInDocument(XWPFDocument doc, String bookmarkName, String value) {
        int count = replaceBookmarkByNameInElements(doc.getBodyElements(), bookmarkName, value);
        XWPFHeaderFooterPolicy hfPolicy = doc.getHeaderFooterPolicy();
        if (hfPolicy != null) {
            if (hfPolicy.getDefaultHeader() != null) {
                count += replaceBookmarkByNameInElements(hfPolicy.getDefaultHeader().getBodyElements(), bookmarkName, value);
            }
            if (hfPolicy.getDefaultFooter() != null) {
                count += replaceBookmarkByNameInElements(hfPolicy.getDefaultFooter().getBodyElements(), bookmarkName, value);
            }
        }
        for (XWPFHeader header : doc.getHeaderList()) {
            count += replaceBookmarkByNameInElements(header.getBodyElements(), bookmarkName, value);
        }
        for (XWPFFooter footer : doc.getFooterList()) {
            count += replaceBookmarkByNameInElements(footer.getBodyElements(), bookmarkName, value);
        }
        return count;
    }

    private int replaceBookmarkByNameInElements(List<IBodyElement> elements,
                                                String bookmarkName,
                                                String value) {
        int count = 0;
        for (IBodyElement element : elements) {
            if (element instanceof XWPFParagraph para) {
                if (replaceNamedBookmarkInParagraph(para, bookmarkName, value)) count++;
            } else if (element instanceof XWPFTable table) {
                count += replaceBookmarkByNameInTable(table, bookmarkName, value);
            }
        }
        return count;
    }

    private int replaceBookmarkByNameInTable(XWPFTable table, String bookmarkName, String value) {
        int count = 0;
        for (XWPFTableRow row : table.getRows()) {
            for (XWPFTableCell cell : row.getTableCells()) {
                for (XWPFParagraph para : cell.getParagraphs()) {
                    if (replaceNamedBookmarkInParagraph(para, bookmarkName, value)) count++;
                }
                for (XWPFTable nested : cell.getTables()) {
                    count += replaceBookmarkByNameInTable(nested, bookmarkName, value);
                }
            }
        }
        return count;
    }

    private boolean replaceNamedBookmarkInParagraph(XWPFParagraph para, String bookmarkName, String value) {
        CTP ctp = para.getCTP();
        List<CTBookmark> starts = ctp.getBookmarkStartList();
        if (starts.isEmpty()) return false;

        for (int i = 0; i < starts.size(); i++) {
            CTBookmark bmStart = starts.get(i);
            if (!bookmarkName.equals(bmStart.getName())) continue;
            CTMarkupRange bmEnd = findBookmarkEnd(ctp, ctp.getBookmarkEndList(), bmStart, i);
            if (bmEnd == null) continue;
            return replaceBookmarkContent(para, bmStart, bmEnd, value);
        }
        return false;
    }

    private String resolveFieldText(JsonNode layoutFields, JsonNode fieldValues, String fieldKey) {
        JsonNode valueNode = findFieldValueNode(fieldValues, fieldKey);
        if (valueNode == null || valueNode.isNull()) {
            return "";
        }
        JsonNode fieldDef = layoutFields.path(fieldKey);
        if (!fieldDef.isObject() || fieldDef.isMissingNode()) {
            var names = layoutFields.fieldNames();
            while (names.hasNext()) {
                String k = names.next();
                if (k.equalsIgnoreCase(fieldKey)) {
                    fieldDef = layoutFields.path(k);
                    break;
                }
            }
        }
        return ReportFormFieldValueFormatter.format(fieldDef, valueNode);
    }

    private void setCellPlainText(XWPFTableCell cell, String text) {
        String safe = text != null ? text : "";
        while (cell.getParagraphs().size() > 1) {
            cell.removeParagraph(cell.getParagraphs().size() - 1);
        }
        XWPFParagraph para = cell.getParagraphs().isEmpty()
                ? cell.addParagraph()
                : cell.getParagraphs().get(0);
        for (int i = para.getRuns().size() - 1; i >= 0; i--) {
            para.removeRun(i);
        }
        if (!safe.isEmpty()) {
            para.createRun().setText(safe, 0);
        }
    }

    private int replaceBookmarksInParagraph(XWPFParagraph para,
                                            Map<String, String> bookmarkMapping,
                                            JsonNode layoutFields,
                                            JsonNode fieldValues) {
        CTP ctp = para.getCTP();
        if (ctp.getBookmarkStartList().isEmpty()) return 0;

        int count = 0;
        List<CTBookmark> starts = new ArrayList<>(ctp.getBookmarkStartList());
        List<CTMarkupRange> ends = new ArrayList<>(ctp.getBookmarkEndList());

        for (int i = 0; i < starts.size(); i++) {
            CTBookmark bmStart = starts.get(i);
            String bmName = bmStart.getName();
            if (bmName == null || bmName.isBlank() || isInternalBookmark(bmName)) continue;

            String fieldKey = bookmarkMapping.getOrDefault(bmName, bmName);
            String value = resolveFieldText(layoutFields, fieldValues, fieldKey);

            CTMarkupRange bmEnd = findBookmarkEnd(ctp, ends, bmStart, i);
            if (bmEnd == null) {
                log.warn("[report-form] Word 书签缺少结束标记: {}", bmName);
                continue;
            }

            if (replaceBookmarkContent(para, bmStart, bmEnd, value)) {
                count++;
            } else if (replaceFirstRunAfterBookmarkEnd(para, bmEnd, value)) {
                count++;
            } else if (starts.size() == 1 && replaceFirstRunInParagraph(para, value)) {
                count++;
            } else {
                log.warn("[report-form] Word 书签未能写入: bookmark={} fieldKey={}", bmName, fieldKey);
            }
        }
        return count;
    }

    private boolean replaceBookmarkContent(XWPFParagraph paragraph,
                                           CTBookmark bookmarkStart,
                                           CTMarkupRange bookmarkEnd,
                                           String text) {
        Node bmStartNode = bookmarkStart.getDomNode();
        Node bmEndNode = bookmarkEnd.getDomNode();
        String safeText = text != null ? text : "";

        List<XWPFRun> runs = paragraph.getRuns();
        for (int i = runs.size() - 1; i >= 0; i--) {
            Node runNode = runs.get(i).getCTR().getDomNode();
            if (isStrictlyBetween(runNode, bmStartNode, bmEndNode)
                    || isRunAdjacentAfterBookmarkEnd(runNode, bmEndNode)) {
                paragraph.removeRun(i);
            }
        }

        try (XmlCursor cursor = bookmarkStart.newCursor()) {
            cursor.toEndToken();
            cursor.beginElement(W_R);
            cursor.beginElement(W_T);
            cursor.insertChars(safeText);
            return true;
        } catch (Exception e) {
            log.debug("[report-form] XmlCursor 书签写入失败，尝试 run 回退: {}", e.getMessage());
            XWPFRun run = paragraph.createRun();
            run.setText(safeText, 0);
            return true;
        }
    }

    /** 占位符常在 bookmarkEnd 后第一个 run */
    private boolean isRunAdjacentAfterBookmarkEnd(Node runNode, Node bmEndNode) {
        if (runNode == null || bmEndNode == null) return false;
        return (runNode.compareDocumentPosition(bmEndNode) & Node.DOCUMENT_POSITION_PRECEDING) != 0;
    }

    private boolean replaceFirstRunAfterBookmarkEnd(XWPFParagraph paragraph,
                                                    CTMarkupRange bookmarkEnd,
                                                    String text) {
        Node bmEndNode = bookmarkEnd.getDomNode();
        for (XWPFRun run : paragraph.getRuns()) {
            Node runNode = run.getCTR().getDomNode();
            if ((runNode.compareDocumentPosition(bmEndNode) & Node.DOCUMENT_POSITION_FOLLOWING) != 0) {
                run.setText(text != null ? text : "", 0);
                return true;
            }
        }
        return false;
    }

    private boolean replaceFirstRunInParagraph(XWPFParagraph paragraph, String text) {
        List<XWPFRun> runs = paragraph.getRuns();
        if (!runs.isEmpty()) {
            runs.get(0).setText(text != null ? text : "", 0);
            for (int i = 1; i < runs.size(); i++) {
                runs.get(i).setText("", 0);
            }
            return true;
        }
        XWPFRun run = paragraph.createRun();
        run.setText(text != null ? text : "", 0);
        return true;
    }

    private CTMarkupRange findBookmarkEnd(CTP ctp,
                                          List<CTMarkupRange> ends,
                                          CTBookmark start,
                                          int startIndex) {
        BigInteger id = start.getId();
        if (id != null) {
            for (CTMarkupRange end : ends) {
                if (id.equals(end.getId())) return end;
            }
        }
        if (startIndex < ends.size()) {
            return ends.get(startIndex);
        }
        return null;
    }

    private boolean isStrictlyBetween(Node node, Node start, Node end) {
        if (node == null || start == null || end == null) return false;
        return (node.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_PRECEDING) != 0
                && (node.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING) != 0;
    }
}
