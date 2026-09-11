package com.example.demo.modules.cardprint.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.cardprint.entity.CardPrintArchive;
import com.example.demo.modules.cardprint.entity.CardPrintTemplate;
import com.example.demo.modules.cardprint.mapper.CardPrintArchiveMapper;
import com.example.demo.modules.cardprint.mapper.CardPrintTemplateMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 卡牌打印编排：模板 CRUD、字段校验、预览、生成与归档。 */
@Service
public class CardPrintService {

    private static final Logger log = LoggerFactory.getLogger(CardPrintService.class);
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");

    private final CardPrintTemplateMapper templateMapper;
    private final CardPrintArchiveMapper archiveMapper;
    private final CardFieldDictionaryService dictionaryService;
    private final CardDataAssembler dataAssembler;
    private final CardRenderEngine renderEngine;
    private final CardPdfStorage storage;
    private final ObjectMapper objectMapper;

    public CardPrintService(CardPrintTemplateMapper templateMapper,
                            CardPrintArchiveMapper archiveMapper,
                            CardFieldDictionaryService dictionaryService,
                            CardDataAssembler dataAssembler,
                            CardRenderEngine renderEngine,
                            CardPdfStorage storage,
                            ObjectMapper objectMapper) {
        this.templateMapper = templateMapper;
        this.archiveMapper = archiveMapper;
        this.dictionaryService = dictionaryService;
        this.dataAssembler = dataAssembler;
        this.renderEngine = renderEngine;
        this.storage = storage;
        this.objectMapper = objectMapper;
    }

    public List<CardPrintTemplate> listTemplates() {
        return templateMapper.selectAll();
    }

    public CardPrintTemplate getTemplate(Long id) {
        CardPrintTemplate t = templateMapper.selectById(id);
        if (t == null) throw new TwinBusinessException(404, "模板不存在");
        return t;
    }

    @Transactional
    public CardPrintTemplate saveTemplate(CardPrintTemplate t, String operator) {
        validate(t);
        CardPrintTemplate sameName = templateMapper.selectByName(t.getName());
        if (sameName != null && !sameName.getId().equals(t.getId())) {
            throw new TwinBusinessException(400, "模板名已存在: " + t.getName());
        }
        // is_default / enabled 在 DB 是 NOT NULL，实体是 Boolean，null 会被 MyBatis 写成 NULL 触发约束错误。
        // 新建时给默认值；更新时保留库里原值（否则漏传 isDefault 会抹掉全表唯一的默认模板）。
        if (t.getId() == null) {
            if (t.getIsDefault() == null) t.setIsDefault(Boolean.FALSE);
            if (t.getEnabled() == null) t.setEnabled(Boolean.TRUE);
            t.setCreatedBy(operator);
            t.setUpdatedBy(operator);
            templateMapper.insert(t);
        } else {
            CardPrintTemplate existing = getTemplate(t.getId());
            if (t.getIsDefault() == null) t.setIsDefault(existing.getIsDefault());
            if (t.getEnabled() == null) t.setEnabled(existing.getEnabled());
            t.setUpdatedBy(operator);
            templateMapper.update(t);
        }
        if (Boolean.TRUE.equals(t.getIsDefault())) {
            templateMapper.clearDefault();
            templateMapper.markDefault(t.getId());
        }
        return getTemplate(t.getId());
    }

    @Transactional
    public void deleteTemplate(Long id, String operator) {
        CardPrintTemplate t = getTemplate(id);
        if (Boolean.TRUE.equals(t.getIsDefault())) {
            throw new TwinBusinessException(400, "默认模板不可删除，请先指定其他模板为默认");
        }
        templateMapper.deleteById(id);
    }

    /** 校验槽位绑定的字段都在字段字典里。 */
    private void validate(CardPrintTemplate t) {
        if (t.getName() == null || t.getName().isBlank()) {
            throw new TwinBusinessException(400, "模板名不能为空");
        }
        Set<String> allowed = dictionaryService.allowedKeys();
        for (CardLayoutEngine.Slot s : parseSlots(t.getSlotsJson())) {
            // 新模型字段在 cells 里；effectiveCells() 会兼容老的 label/rightLabel 字段
            for (CardLayoutEngine.Cell c : s.effectiveCells()) {
                checkKey(c.fieldKey(), allowed);
            }
        }
        parseSpec(t.getSpecJson());
    }

    private void checkKey(String key, Set<String> allowed) {
        if (key == null || key.isBlank()) return;
        if (!allowed.contains(key)) {
            throw new TwinBusinessException(400, "字段未在笼位表单中定义: " + key);
        }
    }

    public CardLayoutEngine.Spec parseSpec(String specJson) {
        CardLayoutEngine.Spec spec;
        try {
            spec = objectMapper.readValue(specJson, CardLayoutEngine.Spec.class);
        } catch (Exception e) {
            throw new TwinBusinessException(400, "模板尺寸配置不合法: " + e.getMessage());
        }
        if (spec == null) throw new TwinBusinessException(400, "模板尺寸配置为空");
        if (spec.pageWidthMm() <= 0 || spec.pageHeightMm() <= 0) {
            throw new TwinBusinessException(400, "页面尺寸必须大于 0");
        }
        if (spec.marginMm() < 0 || 2 * spec.marginMm() >= Math.min(spec.pageWidthMm(), spec.pageHeightMm())) {
            throw new TwinBusinessException(400, "页边距不合法");
        }
        if (spec.defaultFontSizePt() <= 0) {
            throw new TwinBusinessException(400, "字号必须大于 0");
        }
        if (spec.lineHeightMm() != null && spec.lineHeightMm() <= 0) {
            throw new TwinBusinessException(400, "行高必须大于 0");
        }
        CardLayoutEngine.Spec.Qr qr = spec.qr();
        if (qr != null && qr.enabled()) {
            if (qr.sizeMm() <= 0 || qr.sizeMm() >= Math.min(spec.pageWidthMm(), spec.pageHeightMm())) {
                throw new TwinBusinessException(400, "二维码尺寸不合法");
            }
        }
        return spec;
    }

    public List<CardLayoutEngine.Slot> parseSlots(String slotsJson) {
        try {
            return objectMapper.readValue(slotsJson, new TypeReference<List<CardLayoutEngine.Slot>>() {});
        } catch (Exception e) {
            throw new TwinBusinessException(400, "模板槽位配置不合法: " + e.getMessage());
        }
    }

    /** 试打单张：返回单页 PDF，不归档。animalCageId 为 null 时用示例数据渲染（不查库）。 */
    public byte[] preview(Long templateId, Long animalCageId) throws IOException {
        CardPrintTemplate t = getTemplate(templateId);
        List<Map<String, Object>> rows = animalCageId == null
                ? sampleRows(t)
                : dataAssembler.assemble(List.of(animalCageId));
        return renderEngine.render(parseSpec(t.getSpecJson()), parseSlots(t.getSlotsJson()), rows);
    }

    /** 试打示例数据：遍历模板槽位的全部 cell.fieldKey（去重）生成一行固定示例值，不查库、一定成功。 */
    private List<Map<String, Object>> sampleRows(CardPrintTemplate t) {
        Map<String, Object> row = new LinkedHashMap<>();
        for (CardLayoutEngine.Slot s : parseSlots(t.getSlotsJson())) {
            for (CardLayoutEngine.Cell c : s.effectiveCells()) {
                String key = c.fieldKey();
                if (key == null || key.isBlank() || row.containsKey(key)) continue;
                row.put(key, sampleValue(key));
            }
        }
        return List.of(row);
    }

    private static String sampleValue(String key) {
        if (CardFieldDictionaryService.QR_FIELD.equals(key)) return "1234567890123456789";
        if (CardFieldDictionaryService.POSITION_FIELD.equals(key)) return "示例笼架#A-10";
        return "示例内容";
    }

    /** 取一批笼位组装好的卡牌数据（供前端实时预览，不生成 PDF、不落盘）。 */
    public List<Map<String, Object>> assembleData(List<Long> animalCageIds) {
        if (animalCageIds == null || animalCageIds.isEmpty()) return List.of();
        if (animalCageIds.size() > 200) {
            throw new TwinBusinessException(400, "一次最多预览 200 个笼位");
        }
        return dataAssembler.assemble(animalCageIds);
    }

    /** 批量生成并归档。 */
    @Transactional
    public Map<String, Object> generate(Long templateId, List<Long> animalCageIds, String operator,
                                        String nameSuffix)
            throws IOException {
        if (animalCageIds == null || animalCageIds.isEmpty()) {
            throw new TwinBusinessException(400, "请至少选择一个笼位");
        }
        CardPrintTemplate t = getTemplate(templateId);
        List<Map<String, Object>> rows = dataAssembler.assemble(animalCageIds);
        if (rows.isEmpty()) throw new TwinBusinessException(400, "未取到笼位数据");

        byte[] pdf = renderEngine.render(parseSpec(t.getSpecJson()), parseSlots(t.getSlotsJson()), rows);
        String relPath = storage.store(pdf);
        String suffix = sanitizeSuffix(nameSuffix);
        String fileName = "card-" + t.getName() + (suffix == null ? "" : "-" + suffix)
                + "-" + LocalDateTime.now().format(TS) + ".pdf";

        CardPrintArchive a = new CardPrintArchive();
        a.setTemplateId(t.getId());
        a.setTemplateName(t.getName());
        a.setSpecSnapshotJson(t.getSpecJson());
        a.setSlotsSnapshotJson(t.getSlotsJson());
        a.setCageIdsJson(objectMapper.writeValueAsString(animalCageIds));
        a.setPageCount(rows.size());
        a.setFileName(fileName);
        a.setStoredPath(relPath);
        a.setFileSize((long) pdf.length);
        a.setCreatedBy(operator);
        archiveMapper.insert(a);
        log.info("[card-print] 生成归档 id={} 模板={} 页数={} 文件={}", a.getId(), a.getTemplateName(), a.getPageCount(), fileName);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("archiveId", a.getId());
        out.put("pageCount", a.getPageCount());
        out.put("fileName", fileName);
        return out;
    }

    public Map<String, Object> listArchives(int page, int size) {
        int safeSize = Math.min(Math.max(size, 1), 100);
        int offset = Math.max(page - 1, 0) * safeSize;
        List<CardPrintArchive> rows = archiveMapper.selectPage(offset, safeSize);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rows", rows);
        out.put("total", archiveMapper.count());
        out.put("page", page);
        out.put("size", safeSize);
        return out;
    }

    public byte[] downloadArchive(Long id) throws IOException {
        CardPrintArchive a = getArchive(id);
        try {
            return storage.read(a.getStoredPath());
        } catch (java.nio.file.NoSuchFileException e) {
            throw new TwinBusinessException(404, "归档文件缺失: " + a.getFileName());
        }
    }

    public CardPrintArchive getArchive(Long id) {
        CardPrintArchive a = archiveMapper.selectById(id);
        if (a == null) throw new TwinBusinessException(404, "归档不存在");
        return a;
    }

    public void deleteArchive(Long id, String operator) {
        CardPrintArchive a = getArchive(id);
        archiveMapper.deleteById(id);
        storage.delete(a.getStoredPath());
    }

    /** 文件名备注消毒：去掉路径分隔符/非法字符与控制字符，trim 后截断到 40 字符。 */
    private static String sanitizeSuffix(String raw) {
        if (raw == null) return null;
        String s = raw.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "").trim();
        if (s.isEmpty()) return null;
        return s.length() > 40 ? s.substring(0, 40) : s;
    }

    /** 全部笼位 id 解析：入参为字符串以防雪花 ID 精度丢失。 */
    public List<Long> parseCageIds(List<?> raw) {
        List<Long> ids = new ArrayList<>();
        if (raw == null) return ids;
        for (Object o : raw) {
            if (o == null) continue;
            try {
                ids.add(Long.parseLong(String.valueOf(o).trim()));
            } catch (NumberFormatException e) {
                throw new TwinBusinessException(400, "非法的笼位ID: " + o);
            }
        }
        return ids;
    }
}
