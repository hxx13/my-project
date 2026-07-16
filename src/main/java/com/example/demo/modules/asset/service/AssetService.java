package com.example.demo.modules.asset.service;

import com.example.demo.common.excel.ExcelExportColumnAutosizer;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.demo.modules.asset.dto.AssetTransferApplyRequest;
import com.example.demo.modules.asset.entity.AssetColumnDef;
import com.example.demo.modules.asset.entity.AssetImportBatch;
import com.example.demo.modules.asset.entity.AssetRecord;
import com.example.demo.modules.asset.entity.AssetTransferExportFile;
import com.example.demo.modules.asset.entity.AssetTransferRequest;
import com.example.demo.modules.asset.mapper.AssetMapper;
import com.example.demo.modules.upload.service.UploadFileService;
import org.apache.fontbox.ttf.TrueTypeCollection;
import org.apache.fontbox.ttf.TrueTypeFont;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AssetService {
    private static final Set<String> RESERVED_HEADERS = Set.of("资产编码", "资产编号", "资产名称", "状态", "当前位置", "存放地点", "当前存放地点", "标注", "备注");
    private static final Set<String> RESERVED_KEYS = Set.of("assetCode", "assetName", "status", "location", "note", "locked");
    private static final DateTimeFormatter EXPORT_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final int TRANSFER_EXPORT_LINK_LIMIT = 10;

    /** 导入预览缓存：key=previewId, value=预览数据，30分钟过期 */
    private final ConcurrentHashMap<String, PreviewCacheEntry> previewCache = new ConcurrentHashMap<>();

    private static class PreviewCacheEntry {
        final Map<String, Object> data;
        final byte[] fileBytes;
        final String originalFilename;
        final long createdAt;

        PreviewCacheEntry(Map<String, Object> data, byte[] fileBytes, String originalFilename) {
            this.data = data;
            this.fileBytes = fileBytes;
            this.originalFilename = originalFilename;
            this.createdAt = System.currentTimeMillis();
        }

        boolean isExpired() {
            return System.currentTimeMillis() - createdAt > 30 * 60 * 1000;
        }
    }

    private final AssetMapper assetMapper;
    private final UploadFileService uploadFileService;

    @Value("${app.public.base-url:}")
    private String appPublicBaseUrl;

    /** Optional path to a .ttf / .otf / .ttc font file with CJK glyphs (转移记录 PDF 用). */
    @Value("${app.pdf.font-path:}")
    private String appPdfFontPath;

    public AssetService(AssetMapper assetMapper, UploadFileService uploadFileService) {
        this.assetMapper = assetMapper;
        this.uploadFileService = uploadFileService;
    }

    public Map<String, Object> createColumn(String operatorId, String label) {
        if (!StringUtils.hasText(label)) {
            throw new IllegalArgumentException("列名不能为空");
        }
        String normalizedLabel = label.trim();
        String key = buildColumnKey(normalizedLabel);
        AssetColumnDef exists = assetMapper.findColumnDefByKey(key);
        if (exists != null) {
            assetMapper.updateColumnDefLabel(key, normalizedLabel);
            return Map.of("columnKey", key, "columnLabel", normalizedLabel);
        }
        AssetColumnDef def = new AssetColumnDef();
        def.setColumnKey(key);
        def.setColumnLabel(normalizedLabel);
        def.setValueType("TEXT");
        def.setSortable(1);
        def.setSearchable(1);
        def.setSortOrder(assetMapper.listColumnDefs().size() + 1);
        def.setCreateBy(operatorId);
        assetMapper.insertColumnDef(def);
        return Map.of("columnKey", key, "columnLabel", normalizedLabel);
    }

    public Map<String, Object> listAssets(String keyword,
                                          String assetName,
                                          String campus,
                                          String user,
                                          String model,
                                          Integer lockStatus,
                                          String status,
                                          int page,
                                          int size,
                                          String sortBy,
                                          String sortDirection,
                                          String assetId) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(Math.max(1, size), 200);
        String assetIdOnly = trimOrNull(assetId);
        if (StringUtils.hasText(assetIdOnly)) {
            List<AssetColumnDef> columnsOnly = assetMapper.listColumnDefs();
            AssetRecord one = assetMapper.findAssetById(assetIdOnly);
            if (one == null) {
                Map<String, Object> empty = new LinkedHashMap<>();
                empty.put("columns", columnsOnly);
                empty.put("rows", List.of());
                empty.put("total", 0);
                empty.put("page", safePage);
                empty.put("size", safeSize);
                return empty;
            }
            Map<String, Map<String, String>> vals = buildValueMap(List.of(one.getId()));
            Map<String, AssetTransferRequest> requestByIdSingle = new HashMap<>();
            if (StringUtils.hasText(one.getLatestTransferRequestId())) {
                AssetTransferRequest tr = assetMapper.findTransferRequestById(one.getLatestTransferRequestId());
                if (tr != null) {
                    requestByIdSingle.put(tr.getId(), tr);
                }
            }
            Map<String, Object> single = new LinkedHashMap<>();
            single.put("columns", columnsOnly);
            single.put("rows", List.of(toAssetListRowView(one, requestByIdSingle, vals)));
            single.put("total", 1);
            single.put("page", 1);
            single.put("size", safeSize);
            return single;
        }
        String keywordVal = trimOrNull(keyword);
        String assetNameVal = trimOrNull(assetName);
        String campusVal = trimOrNull(campus);
        String userVal = trimOrNull(user);
        String modelVal = trimOrNull(model);
        String statusVal = trimOrNull(status);
        String orderDir = "asc".equalsIgnoreCase(sortDirection) ? "asc" : "desc";
        String orderBy = StringUtils.hasText(sortBy) ? sortBy : "updateTime";
        List<AssetColumnDef> columns = assetMapper.listColumnDefs();
        Map<String, String> columnLabelByKey = new LinkedHashMap<>();
        for (AssetColumnDef c : columns) {
            columnLabelByKey.put(c.getColumnKey(), c.getColumnLabel());
        }
        List<String> campusKeys = mergeKeys(
                resolveKeys(columns, List.of("校区"), List.of(), "col_校区"),
                List.of("col_校区", "col_所属校区")
        );
        // 校区筛选也要覆盖 EAV "存放地点" 列（小程序端 campus 由此判定）
        String locationColKey = pickStorageLocationColumnKey(columns);
        if (StringUtils.hasText(locationColKey)) {
            campusKeys = mergeKeys(campusKeys, List.of(locationColKey));
        }
        List<String> userKeys = mergeKeys(
                resolveKeys(columns, List.of("使用人"), List.of("工号"), "col_使用人"),
                List.of("col_使用人", "col_使用者", "col_领用人", "col_保管人")
        );
        List<String> modelKeys = mergeKeys(
                resolveKeys(columns, List.of("规格型号", "型号"), List.of(), "col_型号"),
                List.of("col_规格型号", "col_型号", "col_规格")
        );
        boolean sortByDynamic = columnLabelByKey.containsKey(orderBy) && !RESERVED_KEYS.contains(orderBy);

        List<AssetRecord> records;
        int total;
        if (sortByDynamic) {
            List<AssetRecord> all = assetMapper.listAssetsAll(keywordVal, assetNameVal, campusVal, userVal, modelVal, campusKeys, userKeys, modelKeys, lockStatus, statusVal);
            Map<String, Map<String, String>> allValues = buildValueMap(extractIds(all));
            all.sort((a, b) -> {
                String av = allValues.getOrDefault(a.getId(), Map.of()).getOrDefault(orderBy, "");
                String bv = allValues.getOrDefault(b.getId(), Map.of()).getOrDefault(orderBy, "");
                int c = av.compareToIgnoreCase(bv);
                return "asc".equals(orderDir) ? c : -c;
            });
            total = all.size();
            int from = Math.min((safePage - 1) * safeSize, total);
            int to = Math.min(from + safeSize, total);
            records = all.subList(from, to);
        } else {
            int offset = (safePage - 1) * safeSize;
            records = assetMapper.listAssets(keywordVal, assetNameVal, campusVal, userVal, modelVal, campusKeys, userKeys, modelKeys, lockStatus, statusVal, safeSize, offset, orderBy, orderDir);
            total = assetMapper.countAssets(keywordVal, assetNameVal, campusVal, userVal, modelVal, campusKeys, userKeys, modelKeys, lockStatus, statusVal);
        }

        Map<String, Map<String, String>> valuesByAssetId = buildValueMap(extractIds(records));
        List<String> requestIds = records.stream()
                .map(AssetRecord::getLatestTransferRequestId)
                .filter(StringUtils::hasText)
                .toList();
        Map<String, AssetTransferRequest> requestById = new HashMap<>();
        if (!requestIds.isEmpty()) {
            List<AssetTransferRequest> requestRows = assetMapper.listTransferRequestsByIds(requestIds);
            for (AssetTransferRequest request : requestRows) {
                requestById.put(request.getId(), request);
            }
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (AssetRecord r : records) {
            rows.add(toAssetListRowView(r, requestById, valuesByAssetId));
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("columns", columns);
        data.put("rows", rows);
        data.put("total", total);
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    private Map<String, Object> toAssetListRowView(AssetRecord r,
                                                  Map<String, AssetTransferRequest> requestById,
                                                  Map<String, Map<String, String>> valuesByAssetId) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", r.getId());
        row.put("assetCode", r.getAssetCode());
        row.put("assetName", r.getAssetName());
        row.put("status", r.getStatus());
        row.put("location", r.getLocation());
        row.put("locked", r.getLocked());
        row.put("note", r.getNote());
        row.put("latestTransferRequestId", r.getLatestTransferRequestId());
        AssetTransferRequest latestReq = requestById.get(r.getLatestTransferRequestId());
        row.put("latestTransferTime", latestReq == null ? null : latestReq.getTransferTime());
        row.put("latestTransferLocation", latestReq == null ? null : latestReq.getTransferLocation());
        row.put("latestTransferApplicant", latestReq == null ? null : latestReq.getApplicantName());
        row.put("latestTransferRemark", latestReq == null ? null : latestReq.getRemark());
        row.put("latestTransferStatus", latestReq == null ? null : latestReq.getStatus());
        row.put("latestTransferFromLocation", latestReq == null ? null : latestReq.getFromLocation());
        row.put("latestTransferPhotoUrl", latestReq == null ? null : latestReq.getPhotoUrl());
        row.put("latestTransferPhotoUrlsBefore", latestReq == null ? List.of() : photoUrlsFromRequest(latestReq, true));
        row.put("latestTransferPhotoUrlsAfter", latestReq == null ? List.of() : photoUrlsFromRequest(latestReq, false));
        row.put("photoUrls", readPhotoUrlList(r.getPhotoUrls()));
        row.put("updateTime", r.getUpdateTime());
        row.put("dynamicValues", valuesByAssetId.getOrDefault(r.getId(), Map.of()));
        return row;
    }

    public Map<String, Object> importAssetsFromExcel(String operatorId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("上传文件不能为空");
        }
        String fileName = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase(Locale.ROOT);
        if (fileName.endsWith(".csv")) {
            return importAssetsFromCsv(operatorId, file);
        }
        String batchId = "BATCH_" + UUID.randomUUID().toString().replace("-", "");
        return importAssetsFromExcelInternal(operatorId, file, batchId, null);
    }

    private Map<String, Object> importAssetsFromExcelInternal(String operatorId, MultipartFile file, String batchId, List<String> createNewColumns) {
        int created = 0;
        int updated = 0;
        int skipped = 0;
        List<Map<String, String>> warnings = new ArrayList<>();
        List<AssetColumnDef> defs = assetMapper.listColumnDefs();
        Map<String, AssetColumnDef> defByKey = new HashMap<>();
        for (AssetColumnDef d : defs) {
            defByKey.put(d.getColumnKey(), d);
        }

        // 如果传入了 createNewColumns，先创建这些列定义
        if (createNewColumns != null) {
            for (String label : createNewColumns) {
                String key = buildColumnKey(label);
                if (!defByKey.containsKey(key)) {
                    AssetColumnDef def = new AssetColumnDef();
                    def.setColumnKey(key);
                    def.setColumnLabel(label);
                    def.setValueType("TEXT");
                    def.setSortable(1);
                    def.setSearchable(1);
                    def.setSortOrder(defByKey.size() + 1);
                    def.setCreateBy(operatorId);
                    assetMapper.insertColumnDef(def);
                    defByKey.put(key, def);
                }
            }
        }

        // 插入导入批次记录
        AssetImportBatch batch = new AssetImportBatch();
        batch.setId(batchId);
        batch.setFileName(file.getOriginalFilename() == null ? "" : file.getOriginalFilename());
        batch.setImportedBy(operatorId);
        batch.setImportedAt(LocalDateTime.now());
        batch.setCreateTime(LocalDateTime.now());
        assetMapper.insertImportBatch(batch);

        try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = workbook.getNumberOfSheets() > 0 ? workbook.getSheetAt(0) : null;
            if (sheet == null) {
                throw new IllegalArgumentException("Excel 工作表为空");
            }
            DataFormatter formatter = new DataFormatter();
            Row headerRow = sheet.getRow(0);
            if (headerRow == null) {
                throw new IllegalArgumentException("Excel 缺少表头");
            }
            int last = Math.max(headerRow.getLastCellNum(), 0);
            List<String> headers = new ArrayList<>();
            for (int i = 0; i < last; i++) {
                headers.add(formatter.formatCellValue(headerRow.getCell(i)).trim());
            }
            int codeIdx = findHeader(headers, List.of("资产编码", "资产编号", "编号"));
            int nameIdx = findHeader(headers, List.of("资产名称", "名称"));
            int statusIdx = findHeader(headers, List.of("状态"));
            int locationIdx = findHeader(headers, List.of("当前位置", "存放地点", "位置"));
            int noteIdx = findHeader(headers, List.of("标注", "备注"));
            if (codeIdx < 0 || nameIdx < 0) {
                throw new IllegalArgumentException("Excel 必须包含【资产编码】和【资产名称】列");
            }

            Map<Integer, String> dynamicColumnByIndex = new HashMap<>();
            for (int i = 0; i < headers.size(); i++) {
                String header = headers.get(i);
                if (!StringUtils.hasText(header) || RESERVED_HEADERS.contains(header)) {
                    continue;
                }
                // 先查找已有列定义（按 label 匹配）
                AssetColumnDef existingDef = assetMapper.findColumnDefByLabel(header);
                if (existingDef != null) {
                    dynamicColumnByIndex.put(i, existingDef.getColumnKey());
                } else {
                    String key = buildColumnKey(header);
                    if (defByKey.containsKey(key)) {
                        dynamicColumnByIndex.put(i, key);
                    } else {
                        // 未找到列定义，记录警告
                        warnings.add(Map.of("header", header, "reason", "未找到对应列定义，跳过该列"));
                    }
                }
            }

            for (int rowIndex = 1; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
                Row row = sheet.getRow(rowIndex);
                if (row == null) {
                    skipped++;
                    continue;
                }
                String assetCode = getCellText(row, codeIdx, formatter);
                String assetName = getCellText(row, nameIdx, formatter);
                if (!StringUtils.hasText(assetCode) || !StringUtils.hasText(assetName)) {
                    skipped++;
                    continue;
                }
                String assetStatus = statusIdx >= 0 ? getCellText(row, statusIdx, formatter) : "NORMAL";
                String location = locationIdx >= 0 ? getCellText(row, locationIdx, formatter) : "";
                String note = noteIdx >= 0 ? getCellText(row, noteIdx, formatter) : "";
                AssetRecord record = assetMapper.findAssetByCode(assetCode.trim());
                if (record == null) {
                    record = new AssetRecord();
                    record.setId("ASSET_" + UUID.randomUUID().toString().replace("-", ""));
                    record.setAssetCode(assetCode.trim());
                    record.setAssetName(assetName.trim());
                    record.setStatus(StringUtils.hasText(assetStatus) ? assetStatus.trim() : "NORMAL");
                    record.setLocation(StringUtils.hasText(location) ? location.trim() : "");
                    record.setLocked(0);
                    record.setNote(StringUtils.hasText(note) ? note.trim() : "");
                    record.setCreateBy(operatorId);
                    record.setUpdateBy(operatorId);
                    record.setCreatedByBatchId(batchId);
                    assetMapper.insertAsset(record);
                    created++;
                } else {
                    record.setAssetName(assetName.trim());
                    record.setStatus(StringUtils.hasText(assetStatus) ? assetStatus.trim() : record.getStatus());
                    record.setLocation(StringUtils.hasText(location) ? location.trim() : "");
                    record.setNote(StringUtils.hasText(note) ? note.trim() : "");
                    record.setUpdateBy(operatorId);
                    assetMapper.updateAssetBase(record);
                    updated++;
                }
                for (Map.Entry<Integer, String> e : dynamicColumnByIndex.entrySet()) {
                    String value = getCellText(row, e.getKey(), formatter);
                    assetMapper.upsertAssetValue(record.getId(), e.getValue(), value);
                }
            }
        } catch (Exception e) {
            // 更新批次错误信息
            batch.setErrorDetail(e.getMessage());
            batch.setCreatedCount(created);
            batch.setUpdatedCount(updated);
            batch.setSkippedCount(skipped);
            assetMapper.insertImportBatch(batch);
            throw new IllegalArgumentException("Excel 解析失败: " + e.getMessage());
        }

        // 更新批次计数
        batch.setCreatedCount(created);
        batch.setUpdatedCount(updated);
        batch.setSkippedCount(skipped);
        assetMapper.insertImportBatch(batch);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("batchId", batchId);
        result.put("created", created);
        result.put("updated", updated);
        result.put("skipped", skipped);
        if (!warnings.isEmpty()) {
            result.put("warnings", warnings);
        }
        return result;
    }

    private Map<String, Object> importAssetsFromCsv(String operatorId, MultipartFile file) {
        String batchId = "BATCH_" + UUID.randomUUID().toString().replace("-", "");
        AssetImportBatch batch = new AssetImportBatch();
        batch.setId(batchId);
        batch.setFileName(file.getOriginalFilename());
        batch.setImportedBy(operatorId);
        batch.setImportedAt(LocalDateTime.now());
        int created = 0;
        int updated = 0;
        int skipped = 0;
        List<Map<String, String>> warnings = new ArrayList<>();
        List<AssetColumnDef> defs = assetMapper.listColumnDefs();
        Map<String, AssetColumnDef> defByKey = new HashMap<>();
        for (AssetColumnDef d : defs) {
            defByKey.put(d.getColumnKey(), d);
        }

        // 插入导入批次记录（待导入完成后更新计数）
        assetMapper.insertImportBatch(batch);

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String headerLine = reader.readLine();
            if (!StringUtils.hasText(headerLine)) {
                throw new IllegalArgumentException("CSV 缺少表头");
            }
            if (headerLine.startsWith("\uFEFF")) {
                headerLine = headerLine.substring(1);
            }
            List<String> headers = parseCsvLine(headerLine);
            int codeIdx = findHeader(headers, List.of("资产编码", "资产编号", "编号"));
            int nameIdx = findHeader(headers, List.of("资产名称", "名称"));
            int statusIdx = findHeader(headers, List.of("状态"));
            int locationIdx = findHeader(headers, List.of("当前位置", "存放地点", "位置"));
            int noteIdx = findHeader(headers, List.of("标注", "备注"));
            if (codeIdx < 0 || nameIdx < 0) {
                throw new IllegalArgumentException("CSV 必须包含【资产编码】和【资产名称】列");
            }
            Map<Integer, String> dynamicColumnByIndex = new HashMap<>();
            for (int i = 0; i < headers.size(); i++) {
                String header = headers.get(i) == null ? "" : headers.get(i).trim();
                if (!StringUtils.hasText(header) || RESERVED_HEADERS.contains(header)) {
                    continue;
                }
                // 先查找已有列定义（按 label 匹配）
                AssetColumnDef existingDef = assetMapper.findColumnDefByLabel(header);
                if (existingDef != null) {
                    dynamicColumnByIndex.put(i, existingDef.getColumnKey());
                } else {
                    String key = buildColumnKey(header);
                    if (defByKey.containsKey(key)) {
                        dynamicColumnByIndex.put(i, key);
                    } else {
                        warnings.add(Map.of("header", header, "reason", "未找到对应列定义，跳过该列"));
                    }
                }
            }

            String line;
            while ((line = reader.readLine()) != null) {
                if (!StringUtils.hasText(line)) {
                    skipped++;
                    continue;
                }
                List<String> cells = parseCsvLine(line);
                String assetCode = getCsvCell(cells, codeIdx);
                String assetName = getCsvCell(cells, nameIdx);
                if (!StringUtils.hasText(assetCode) || !StringUtils.hasText(assetName)) {
                    skipped++;
                    continue;
                }
                String assetStatus = statusIdx >= 0 ? getCsvCell(cells, statusIdx) : "NORMAL";
                String location = locationIdx >= 0 ? getCsvCell(cells, locationIdx) : "";
                String note = noteIdx >= 0 ? getCsvCell(cells, noteIdx) : "";
                AssetRecord record = assetMapper.findAssetByCode(assetCode.trim());
                if (record == null) {
                    record = new AssetRecord();
                    record.setId("ASSET_" + UUID.randomUUID().toString().replace("-", ""));
                    record.setAssetCode(assetCode.trim());
                    record.setAssetName(assetName.trim());
                    record.setStatus(StringUtils.hasText(assetStatus) ? assetStatus.trim() : "NORMAL");
                    record.setLocation(StringUtils.hasText(location) ? location.trim() : "");
                    record.setLocked(0);
                    record.setNote(StringUtils.hasText(note) ? note.trim() : "");
                    record.setCreateBy(operatorId);
                    record.setUpdateBy(operatorId);
                    record.setCreatedByBatchId(batchId);
                    assetMapper.insertAsset(record);
                    created++;
                } else {
                    record.setAssetName(assetName.trim());
                    record.setStatus(StringUtils.hasText(assetStatus) ? assetStatus.trim() : record.getStatus());
                    record.setLocation(StringUtils.hasText(location) ? location.trim() : "");
                    record.setNote(StringUtils.hasText(note) ? note.trim() : "");
                    record.setUpdateBy(operatorId);
                    assetMapper.updateAssetBase(record);
                    updated++;
                }
                for (Map.Entry<Integer, String> e : dynamicColumnByIndex.entrySet()) {
                    String value = getCsvCell(cells, e.getKey());
                    assetMapper.upsertAssetValue(record.getId(), e.getValue(), value);
                }
            }
        } catch (IllegalArgumentException e) {
            batch.setErrorDetail(e.getMessage());
            batch.setCreatedCount(created);
            batch.setUpdatedCount(updated);
            batch.setSkippedCount(skipped);
            assetMapper.insertImportBatch(batch);
            throw e;
        } catch (Exception e) {
            batch.setErrorDetail(e.getMessage());
            batch.setCreatedCount(created);
            batch.setUpdatedCount(updated);
            batch.setSkippedCount(skipped);
            assetMapper.insertImportBatch(batch);
            throw new IllegalArgumentException("CSV 解析失败: " + e.getMessage());
        }

        batch.setCreatedCount(created);
        batch.setUpdatedCount(updated);
        batch.setSkippedCount(skipped);
        assetMapper.insertImportBatch(batch);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("batchId", batchId);
        result.put("created", created);
        result.put("updated", updated);
        result.put("skipped", skipped);
        if (!warnings.isEmpty()) {
            result.put("warnings", warnings);
        }
        return result;
    }

    public byte[] exportAssetsAsExcel(String keyword, String assetName, String campus, String user, String model, Integer lockStatus, String status) {
        String keywordVal = trimOrNull(keyword);
        String assetNameVal = trimOrNull(assetName);
        String campusVal = trimOrNull(campus);
        String userVal = trimOrNull(user);
        String modelVal = trimOrNull(model);
        String statusVal = trimOrNull(status);

        List<AssetColumnDef> columnDefs = assetMapper.listColumnDefs();
        Map<String, String> columnLabelByKey = new LinkedHashMap<>();
        for (AssetColumnDef c : columnDefs) {
            columnLabelByKey.put(c.getColumnKey(), c.getColumnLabel());
        }
        List<String> campusKeys = mergeKeys(
                resolveKeys(columnDefs, List.of("校区"), List.of(), "col_校区"),
                List.of("col_校区", "col_所属校区"));
        List<String> userKeys = mergeKeys(
                resolveKeys(columnDefs, List.of("使用人"), List.of("工号"), "col_使用人"),
                List.of("col_使用人", "col_使用者", "col_领用人", "col_保管人"));
        List<String> modelKeys = mergeKeys(
                resolveKeys(columnDefs, List.of("规格型号", "型号"), List.of(), "col_型号"),
                List.of("col_规格型号", "col_型号", "col_规格"));

        // 使用 listAssetsAll 不截断，导出全部数据
        List<AssetRecord> allRecords = assetMapper.listAssetsAll(
                keywordVal, assetNameVal, campusVal, userVal, modelVal,
                campusKeys, userKeys, modelKeys, lockStatus, statusVal);

        Map<String, Map<String, String>> valuesByAssetId = buildValueMap(extractIds(allRecords));
        List<String> requestIds = allRecords.stream()
                .map(AssetRecord::getLatestTransferRequestId).filter(StringUtils::hasText).toList();
        Map<String, AssetTransferRequest> requestById = new HashMap<>();
        if (!requestIds.isEmpty()) {
            List<AssetTransferRequest> reqRows = assetMapper.listTransferRequestsByIds(requestIds);
            for (AssetTransferRequest req : reqRows) { requestById.put(req.getId(), req); }
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (AssetRecord r : allRecords) {
            rows.add(toAssetListRowView(r, requestById, valuesByAssetId));
        }
        List<AssetTransferRequest> allRequests = assetMapper.listTransferRequests(trimOrNull(keyword), 100000, 0);
        Map<String, AssetTransferRequest> latestByAssetId = new HashMap<>();
        for (AssetTransferRequest r : allRequests) {
            if (!latestByAssetId.containsKey(r.getAssetId())) {
                latestByAssetId.put(r.getAssetId(), r);
            }
        }

        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("资产记录");
            List<String> headers = new ArrayList<>(List.of(
                    "资产编码", "资产名称", "状态", "存放地点", "标注", "是否锁定", "申请转移时间", "申请转移地点", "申请人", "申请备注"
            ));
            for (AssetColumnDef d : columnDefs) {
                headers.add(d.getColumnLabel());
            }
            Row header = sheet.createRow(0);
            for (int i = 0; i < headers.size(); i++) {
                header.createCell(i).setCellValue(headers.get(i));
            }
            int r = 1;
            for (Map<String, Object> row : rows) {
                Row line = sheet.createRow(r++);
                int c = 0;
                line.createCell(c++).setCellValue(str(row.get("assetCode")));
                line.createCell(c++).setCellValue(str(row.get("assetName")));
                line.createCell(c++).setCellValue(str(row.get("status")));
                line.createCell(c++).setCellValue(str(row.get("location")));
                line.createCell(c++).setCellValue(str(row.get("note")));
                line.createCell(c++).setCellValue(Objects.equals(row.get("locked"), 1) ? "是" : "否");
                AssetTransferRequest req = latestByAssetId.get(str(row.get("id")));
                line.createCell(c++).setCellValue(req != null && req.getTransferTime() != null ? req.getTransferTime().format(EXPORT_TIME) : "");
                line.createCell(c++).setCellValue(req != null ? str(req.getTransferLocation()) : "");
                line.createCell(c++).setCellValue(req != null ? str(req.getApplicantName()) : "");
                line.createCell(c++).setCellValue(req != null ? str(req.getRemark()) : "");
                @SuppressWarnings("unchecked")
                Map<String, String> dynamicValues = (Map<String, String>) row.getOrDefault("dynamicValues", Map.of());
                for (AssetColumnDef d : columnDefs) {
                    line.createCell(c++).setCellValue(dynamicValues.getOrDefault(d.getColumnKey(), ""));
                }
            }
            ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sheet, 0, headers.size() - 1);
            workbook.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("导出失败: " + e.getMessage());
        }
    }

    public Map<String, Object> patchAsset(String id,
                                          String assetName,
                                          String note,
                                          String status,
                                          String location,
                                          String photoUrls,
                                          Map<String, String> dynamicValues) {
        AssetRecord record = assetMapper.findAssetById(id);
        if (record == null) {
            throw new IllegalArgumentException("资产不存在");
        }
        if (assetName != null) {
            record.setAssetName(assetName.trim());
        }
        if (note != null) {
            record.setNote(note.trim());
        }
        if (status != null) {
            record.setStatus(status.trim());
        }
        if (location != null) {
            record.setLocation(location.trim());
        }
        if (photoUrls != null) {
            record.setPhotoUrls(photoUrls.trim());
        }
        record.setUpdateBy("system");
        int affected = assetMapper.updateAssetBase(record);
        if (affected <= 0) {
            throw new IllegalArgumentException("资产不存在或已被删除");
        }
        if (photoUrls != null) {
            assetMapper.updateAssetPhotoUrls(id, photoUrls.trim());
        }
        // 同步更新 EAV "存放地点" 动态值（与 completeTransfer 保持一致）
        if (location != null) {
            String storageColKey = pickStorageLocationColumnKey(assetMapper.listColumnDefs());
            if (StringUtils.hasText(storageColKey)) {
                assetMapper.upsertAssetValue(id, storageColKey, location.trim());
            }
        }
        if (dynamicValues != null && !dynamicValues.isEmpty()) {
            List<AssetColumnDef> defs = assetMapper.listColumnDefs();
            Set<String> validKeys = new HashSet<>();
            for (AssetColumnDef d : defs) {
                validKeys.add(d.getColumnKey());
            }
            String campusColKey = pickCampusColumnKey(defs);
            for (Map.Entry<String, String> e : dynamicValues.entrySet()) {
                if (!validKeys.contains(e.getKey())) {
                    continue;
                }
                String val = e.getValue() == null ? "" : e.getValue().trim();
                if (StringUtils.hasText(campusColKey) && campusColKey.equals(e.getKey()) && !StringUtils.hasText(val)) {
                    assetMapper.upsertAssetValue(id, e.getKey(), "");
                    continue;
                }
                if (StringUtils.hasText(val)) {
                    assetMapper.upsertAssetValue(id, e.getKey(), val);
                }
            }
        }
        return Map.of("id", id);
    }

    public Map<String, Object> createAsset(String operatorId,
                                           String assetCode,
                                           String assetName,
                                           String status,
                                           String location,
                                           String note,
                                           String photoUrls,
                                           Map<String, String> dynamicValues) {
        String code = trimOrNull(assetCode);
        String name = trimOrNull(assetName);
        if (!StringUtils.hasText(code) || !StringUtils.hasText(name)) {
            throw new IllegalArgumentException("资产编号和资产名称不能为空");
        }
        AssetRecord exists = assetMapper.findAssetByCode(code);
        if (exists != null) {
            throw new IllegalArgumentException("资产编号已存在");
        }
        AssetRecord record = new AssetRecord();
        record.setId("ASSET_" + UUID.randomUUID().toString().replace("-", ""));
        record.setAssetCode(code);
        record.setAssetName(name);
        record.setStatus(StringUtils.hasText(status) ? status.trim() : "NORMAL");
        record.setLocation(trimOrNull(location));
        record.setLocked(0);
        record.setNote(trimOrNull(note));
        record.setPhotoUrls(trimOrNull(photoUrls));
        record.setCreateBy(operatorId);
        record.setUpdateBy(operatorId);
        assetMapper.insertAsset(record);
        if (dynamicValues != null && !dynamicValues.isEmpty()) {
            List<AssetColumnDef> defs = assetMapper.listColumnDefs();
            Set<String> validKeys = new HashSet<>();
            for (AssetColumnDef d : defs) validKeys.add(d.getColumnKey());
            for (Map.Entry<String, String> entry : dynamicValues.entrySet()) {
                String key = entry.getKey();
                if (!validKeys.contains(key)) continue;
                assetMapper.upsertAssetValue(record.getId(), key, trimOrNull(entry.getValue()));
            }
        }
        return Map.of("id", record.getId());
    }

    public List<Map<String, Object>> searchAssets(String keyword, int limit) {
        String key = trimOrNull(keyword);
        if (!StringUtils.hasText(key)) {
            return List.of();
        }
        int safeLimit = Math.min(Math.max(limit, 1), 50);
        List<AssetRecord> records = assetMapper.searchAssetsForPicker(key, safeLimit);
        List<Map<String, Object>> result = new ArrayList<>();
        for (AssetRecord r : records) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", r.getId());
            row.put("assetCode", r.getAssetCode());
            row.put("assetName", r.getAssetName());
            row.put("location", r.getLocation());
            row.put("status", r.getStatus());
            row.put("locked", r.getLocked());
            result.add(row);
        }
        return result;
    }

    /**
     * 按资产编号精确查找，返回完整资产信息（含动态列值）
     */
    public Map<String, Object> findByCode(String code) {
        String codeVal = trimOrNull(code);
        if (!StringUtils.hasText(codeVal)) {
            throw new IllegalArgumentException("资产编号不能为空");
        }
        AssetRecord record = assetMapper.findAssetByCode(codeVal);
        if (record == null) {
            return null;
        }
        List<AssetColumnDef> columns = assetMapper.listColumnDefs();
        Map<String, Map<String, String>> vals = buildValueMap(List.of(record.getId()));
        Map<String, AssetTransferRequest> requestById = new HashMap<>();
        if (StringUtils.hasText(record.getLatestTransferRequestId())) {
            AssetTransferRequest tr = assetMapper.findTransferRequestById(record.getLatestTransferRequestId());
            if (tr != null) {
                requestById.put(tr.getId(), tr);
            }
        }
        return toAssetListRowView(record, requestById, vals);
    }

    /**
     * 获取所有已存储的存放地点（合并 asset_record.location + EAV 存放地点列，去重排序）
     */
    public List<String> listDistinctLocations() {
        List<String> fromRecords = assetMapper.listDistinctLocationValues();
        String storageColKey = pickStorageLocationColumnKey(assetMapper.listColumnDefs());
        List<String> fromEav = StringUtils.hasText(storageColKey)
                ? assetMapper.listDistinctDynamicValuesByKey(storageColKey)
                : List.of();
        TreeSet<String> merged = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        if (fromRecords != null) {
            for (String s : fromRecords) {
                if (StringUtils.hasText(s)) merged.add(s.trim());
            }
        }
        if (fromEav != null) {
            for (String s : fromEav) {
                if (StringUtils.hasText(s)) merged.add(s.trim());
            }
        }
        return new ArrayList<>(merged);
    }

    public void lockAsset(String id, String operatorId) {
        AssetRecord record = assetMapper.findAssetById(id);
        if (record == null) {
            throw new IllegalArgumentException("资产不存在");
        }
        assetMapper.updateAssetLock(id, 1, operatorId);
    }

    public Map<String, Object> moveAssetToRecycle(String id, String operatorId) {
        AssetRecord record = assetMapper.findAssetById(id);
        if (record == null) {
            throw new IllegalArgumentException("资产不存在");
        }
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime purgeAfter = now.plusDays(30);
        int affected = assetMapper.moveAssetToRecycle(id, operatorId, now, purgeAfter);
        if (affected <= 0) {
            throw new IllegalArgumentException("资产已删除或不存在");
        }
        return Map.of("id", id, "purgeAfterTime", purgeAfter.format(EXPORT_TIME));
    }

    public Map<String, Object> listRecycledAssets(String keyword, int page, int size) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(Math.max(1, size), 200);
        int offset = (safePage - 1) * safeSize;
        List<AssetRecord> rows = assetMapper.listRecycledAssets(trimOrNull(keyword), safeSize, offset);
        int total = assetMapper.countRecycledAssets(trimOrNull(keyword));
        List<Map<String, Object>> resultRows = new ArrayList<>();
        for (AssetRecord r : rows) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", r.getId());
            row.put("assetCode", r.getAssetCode());
            row.put("assetName", r.getAssetName());
            row.put("location", r.getLocation());
            row.put("deletedTime", r.getDeletedTime());
            row.put("deletedBy", r.getDeletedBy());
            row.put("purgeAfterTime", r.getPurgeAfterTime());
            resultRows.add(row);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("rows", resultRows);
        data.put("total", total);
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    public Map<String, Object> restoreRecycledAsset(String id, String operatorId) {
        int affected = assetMapper.restoreRecycledAsset(id, operatorId);
        if (affected <= 0) {
            throw new IllegalArgumentException("资产不在回收站或不存在");
        }
        return Map.of("id", id, "restored", true);
    }

    public Map<String, Object> purgeRecycledAsset(String id) {
        assetMapper.deleteAssetValuesByAssetId(id);
        int affected = assetMapper.purgeAssetById(id);
        if (affected <= 0) {
            throw new IllegalArgumentException("资产不存在");
        }
        return Map.of("id", id, "purged", true);
    }

    @Transactional
    public Map<String, Object> submitTransfer(String operatorId, String operatorName, AssetTransferApplyRequest request) {
        if (request == null || !StringUtils.hasText(request.getAssetId())) {
            throw new IllegalArgumentException("资产不能为空");
        }
        if (!StringUtils.hasText(request.getTransferTime()) || !StringUtils.hasText(request.getTransferLocation())) {
            throw new IllegalArgumentException("请填写转移时间和地点");
        }
        AssetRecord asset = assetMapper.findAssetById(request.getAssetId().trim());
        if (asset == null) {
            throw new IllegalArgumentException("资产不存在");
        }
        LocalDateTime transferTime = parseTime(request.getTransferTime().trim());
        List<String> before = new ArrayList<>();
        if (request.getPhotoUrlsBefore() != null) {
            for (String u : request.getPhotoUrlsBefore()) {
                if (StringUtils.hasText(u)) before.add(u.trim());
            }
        }
        if (StringUtils.hasText(request.getPhotoUrl())) {
            before.add(request.getPhotoUrl().trim());
        }
        List<String> after = new ArrayList<>();
        if (request.getPhotoUrlsAfter() != null) {
            for (String u : request.getPhotoUrlsAfter()) {
                if (StringUtils.hasText(u)) after.add(u.trim());
            }
        }
        String beforeJson = before.isEmpty() ? null : writeJsonArray(before);
        String afterJson = after.isEmpty() ? null : writeJsonArray(after);
        String legacyPhoto = before.isEmpty() ? null : before.get(0);

        String reqId = "ATR_" + UUID.randomUUID().toString().replace("-", "");
        AssetTransferRequest row = new AssetTransferRequest();
        row.setId(reqId);
        row.setAssetId(asset.getId());
        row.setAssetCode(asset.getAssetCode());
        row.setAssetName(asset.getAssetName());
        row.setApplicantId(operatorId);
        row.setApplicantName(StringUtils.hasText(operatorName) ? operatorName : operatorId);
        row.setTransferTime(transferTime);
        row.setTransferLocation(request.getTransferLocation().trim());
        row.setFromLocation(StringUtils.hasText(asset.getLocation()) ? asset.getLocation().trim() : null);
        // 捕获转移前使用人
        String oldUser = pickCurrentDynamicValue(asset.getId(), "使用人");
        row.setFromUserName(StringUtils.hasText(oldUser) ? oldUser.trim() : null);
        row.setRemark(trimOrNull(request.getRemark()));
        row.setPhotoUrl(legacyPhoto);
        row.setPhotoUrlsBefore(beforeJson);
        row.setPhotoUrlsAfter(afterJson);
        row.setStatus("IN_PROGRESS");
        row.setCreateTime(LocalDateTime.now());
        assetMapper.insertTransferRequest(row);
        assetMapper.insertTransferLog(
                "ATL_" + UUID.randomUUID().toString().replace("-", ""),
                reqId,
                asset.getId(),
                "IN_PROGRESS",
                operatorId,
                trimOrNull(request.getRemark()),
                LocalDateTime.now()
        );
        assetMapper.updateAssetLock(asset.getId(), 1, operatorId);
        assetMapper.updateLatestTransferRequest(asset.getId(), reqId, operatorId);

        // 同步更新使用人/工号到资产 EAV 列
        if (StringUtils.hasText(request.getUserName()) || StringUtils.hasText(request.getUserEmployeeId())) {
            List<AssetColumnDef> defs = assetMapper.listColumnDefs();
            if (StringUtils.hasText(request.getUserName())) {
                String userKey = pickColumnKeyByLabel(defs, "使用人", "col_使用人");
                if (StringUtils.hasText(userKey)) {
                    assetMapper.upsertAssetValue(asset.getId(), userKey, request.getUserName().trim());
                }
            }
            if (StringUtils.hasText(request.getUserEmployeeId())) {
                String empIdKey = pickColumnKeyByLabel(defs, "工号", "col_工号");
                if (StringUtils.hasText(empIdKey)) {
                    assetMapper.upsertAssetValue(asset.getId(), empIdKey, request.getUserEmployeeId().trim());
                }
            }
        }

        return Map.of("requestId", reqId, "status", "IN_PROGRESS");
    }

    private String pickCurrentDynamicValue(String assetId, String keyword) {
        if (!StringUtils.hasText(assetId) || !StringUtils.hasText(keyword)) return null;
        List<AssetColumnDef> defs = assetMapper.listColumnDefs();
        for (AssetColumnDef d : defs) {
            if (d == null || !StringUtils.hasText(d.getColumnKey())) continue;
            if (str(d.getColumnLabel()).contains(keyword)) {
                List<Map<String, Object>> vals = assetMapper.listAssetValuesByAssetId(assetId);
                if (vals != null) {
                    for (Map<String, Object> row : vals) {
                        if (d.getColumnKey().equals(str(row.get("column_key")))) {
                            return str(row.get("column_value"));
                        }
                    }
                }
            }
        }
        return null;
    }

    private String pickColumnKeyByLabel(List<AssetColumnDef> defs, String keyword, String fallbackKey) {
        if (defs == null) return fallbackKey;
        for (AssetColumnDef d : defs) {
            if (d == null || !StringUtils.hasText(d.getColumnKey())) continue;
            String label = str(d.getColumnLabel()).trim();
            if (label.contains(keyword)) return d.getColumnKey();
        }
        return fallbackKey;
    }

    @Transactional
    public Map<String, Object> appendTransferAfterPhotos(String operatorId, String requestId, List<String> photoUrls) {
        if (!StringUtils.hasText(requestId)) {
            throw new IllegalArgumentException("申请单号不能为空");
        }
        if (photoUrls == null || photoUrls.stream().noneMatch(StringUtils::hasText)) {
            throw new IllegalArgumentException("请至少上传一张转移后照片");
        }
        AssetTransferRequest req = assetMapper.findTransferRequestById(requestId.trim());
        if (req == null) {
            throw new IllegalArgumentException("转移申请不存在");
        }
        if (!"IN_PROGRESS".equals(req.getStatus())) {
            throw new IllegalArgumentException("仅进行中的申请可补充转移后照片");
        }
        List<String> merged = new ArrayList<>(readPhotoUrlList(req.getPhotoUrlsAfter()));
        for (String u : photoUrls) {
            if (StringUtils.hasText(u) && !merged.contains(u.trim())) {
                merged.add(u.trim());
            }
        }
        String json = merged.isEmpty() ? null : writeJsonArray(merged);
        int n = assetMapper.updateTransferRequestAfterPhotos(req.getId(), json);
        if (n <= 0) {
            throw new IllegalArgumentException("更新失败，请确认申请仍为进行中");
        }
        assetMapper.insertTransferLog(
                "ATL_" + UUID.randomUUID().toString().replace("-", ""),
                req.getId(),
                req.getAssetId(),
                "PHOTOS_AFTER",
                operatorId,
                json,
                LocalDateTime.now()
        );
        return Map.of("requestId", req.getId(), "photoUrlsAfter", merged);
    }

    @Transactional
    public Map<String, Object> removeTransferAfterPhoto(String operatorId, String requestId, String photoUrl) {
        if (!StringUtils.hasText(requestId)) {
            throw new IllegalArgumentException("申请单号不能为空");
        }
        if (!StringUtils.hasText(photoUrl)) {
            throw new IllegalArgumentException("照片地址不能为空");
        }
        AssetTransferRequest req = assetMapper.findTransferRequestById(requestId.trim());
        if (req == null) {
            throw new IllegalArgumentException("转移申请不存在");
        }
        if (!"IN_PROGRESS".equals(req.getStatus())) {
            throw new IllegalArgumentException("仅进行中的申请可删除转移后照片");
        }
        String target = photoUrl.trim();
        List<String> existed = new ArrayList<>(readPhotoUrlList(req.getPhotoUrlsAfter()));
        List<String> remained = new ArrayList<>();
        boolean removed = false;
        for (String u : existed) {
            if (!removed && target.equals(u)) {
                removed = true;
                continue;
            }
            remained.add(u);
        }
        if (!removed) {
            throw new IllegalArgumentException("未找到待删除的照片");
        }
        String json = remained.isEmpty() ? null : writeJsonArray(remained);
        int n = assetMapper.updateTransferRequestAfterPhotos(req.getId(), json);
        if (n <= 0) {
            throw new IllegalArgumentException("删除失败，请确认申请仍为进行中");
        }
        assetMapper.insertTransferLog(
                "ATL_" + UUID.randomUUID().toString().replace("-", ""),
                req.getId(),
                req.getAssetId(),
                "PHOTOS_AFTER_REMOVE",
                operatorId,
                target,
                LocalDateTime.now()
        );
        return Map.of("requestId", req.getId(), "photoUrlsAfter", remained);
    }

    @Transactional
    public Map<String, Object> completeTransfer(String operatorId, String requestId) {
        if (!StringUtils.hasText(requestId)) {
            throw new IllegalArgumentException("申请单号不能为空");
        }
        AssetTransferRequest req = assetMapper.findTransferRequestById(requestId.trim());
        if (req == null) {
            throw new IllegalArgumentException("转移申请不存在");
        }
        if (!"IN_PROGRESS".equals(req.getStatus())) {
            throw new IllegalArgumentException("仅进行中的申请可确认转移完毕");
        }
        List<String> after = readPhotoUrlList(req.getPhotoUrlsAfter());
        if (after.isEmpty()) {
            throw new IllegalArgumentException("请先上传转移后照片");
        }
        int updated = assetMapper.updateTransferRequestStatus(req.getId(), "COMPLETED", "IN_PROGRESS");
        if (updated <= 0) {
            throw new IllegalArgumentException("状态更新失败");
        }
        AssetRecord asset = assetMapper.findAssetById(req.getAssetId());
        if (asset == null) {
            throw new IllegalArgumentException("资产不存在");
        }
        asset.setLocation(req.getTransferLocation().trim());
        asset.setUpdateBy(operatorId);
        assetMapper.updateAssetBase(asset);
        // 同步更新 EAV 动态列"存放地点"值，确保 Web/小程序两端展示一致
        String storageColKey = pickStorageLocationColumnKey(assetMapper.listColumnDefs());
        if (StringUtils.hasText(storageColKey)) {
            assetMapper.upsertAssetValue(asset.getId(), storageColKey, req.getTransferLocation().trim());
        }
        assetMapper.updateAssetLock(asset.getId(), 0, operatorId);
        assetMapper.insertTransferLog(
                "ATL_" + UUID.randomUUID().toString().replace("-", ""),
                req.getId(),
                req.getAssetId(),
                "COMPLETED",
                operatorId,
                null,
                LocalDateTime.now()
        );
        return Map.of("requestId", req.getId(), "status", "COMPLETED");
    }

    private void recalculateLatestTransferForAsset(String assetId, String operatorId) {
        if (!StringUtils.hasText(assetId)) {
            return;
        }
        String next = assetMapper.selectLatestActiveTransferRequestId(assetId.trim());
        assetMapper.updateAssetLatestTransferPointer(assetId.trim(), next, operatorId);
    }

    @Transactional
    public Map<String, Object> withdrawTransfer(String operatorId, String requestId) {
        if (!StringUtils.hasText(requestId)) {
            throw new IllegalArgumentException("申请单号不能为空");
        }
        AssetTransferRequest req = assetMapper.findTransferRequestById(requestId.trim());
        if (req == null) {
            throw new IllegalArgumentException("转移申请不存在");
        }
        if (!"IN_PROGRESS".equals(req.getStatus())) {
            throw new IllegalArgumentException("仅进行中的申请可撤回");
        }
        int updated = assetMapper.updateTransferRequestStatus(req.getId(), "WITHDRAWN", "IN_PROGRESS");
        if (updated <= 0) {
            throw new IllegalArgumentException("撤回失败，请确认申请仍为进行中");
        }
        assetMapper.updateAssetLock(req.getAssetId(), 0, operatorId);
        assetMapper.insertTransferLog(
                "ATL_" + UUID.randomUUID().toString().replace("-", ""),
                req.getId(),
                req.getAssetId(),
                "WITHDRAWN",
                operatorId,
                null,
                LocalDateTime.now()
        );
        recalculateLatestTransferForAsset(req.getAssetId(), operatorId);
        return Map.of("requestId", req.getId(), "status", "WITHDRAWN");
    }

    @Transactional
    public Map<String, Object> adminDeleteTransferRecord(String operatorId, String requestId) {
        if (!StringUtils.hasText(requestId)) {
            throw new IllegalArgumentException("申请单号不能为空");
        }
        AssetTransferRequest req = assetMapper.findTransferRequestById(requestId.trim());
        if (req == null) {
            throw new IllegalArgumentException("转移申请不存在");
        }
        AssetRecord asset = assetMapper.findAssetById(req.getAssetId());
        if (asset == null) {
            throw new IllegalArgumentException("资产不存在");
        }
        if ("COMPLETED".equals(req.getStatus()) && StringUtils.hasText(req.getFromLocation())) {
            asset.setLocation(req.getFromLocation().trim());
            asset.setUpdateBy(operatorId);
            assetMapper.updateAssetBase(asset);
            // 同步回滚 EAV 动态列"存放地点"值
            String storageColKey = pickStorageLocationColumnKey(assetMapper.listColumnDefs());
            if (StringUtils.hasText(storageColKey)) {
                assetMapper.upsertAssetValue(asset.getId(), storageColKey, req.getFromLocation().trim());
            }
        }
        assetMapper.updateAssetLock(req.getAssetId(), 0, operatorId);
        assetMapper.insertTransferLog(
                "ATL_" + UUID.randomUUID().toString().replace("-", ""),
                req.getId(),
                req.getAssetId(),
                "ADMIN_DELETE",
                operatorId,
                null,
                LocalDateTime.now()
        );
        int deleted = assetMapper.deleteTransferRequestById(req.getId());
        if (deleted <= 0) {
            throw new IllegalArgumentException("删除转移记录失败");
        }
        recalculateLatestTransferForAsset(req.getAssetId(), operatorId);
        return Map.of("requestId", req.getId(), "deleted", true);
    }

    public Map<String, Object> listTransferRequests(String keyword, int page, int size) {
        assetMapper.markExpiredTransferExportFiles(LocalDateTime.now());
        int safePage = Math.max(1, page);
        int safeSize = Math.min(Math.max(1, size), 200);
        int offset = (safePage - 1) * safeSize;
        List<AssetTransferRequest> rows = assetMapper.listTransferRequests(trimOrNull(keyword), safeSize, offset);
        int total = assetMapper.countTransferRequests(trimOrNull(keyword));
        Map<String, Object> data = new HashMap<>();
        data.put("rows", rows);
        data.put("total", total);
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    @Transactional
    public Map<String, Object> createOrReuseTransferPdfLink(String operatorId, String requestId) {
        if (!StringUtils.hasText(requestId)) {
            throw new IllegalArgumentException("申请单号不能为空");
        }
        String rid = requestId.trim();
        AssetTransferRequest req = assetMapper.findTransferRequestById(rid);
        if (req == null) {
            throw new IllegalArgumentException("转移申请不存在");
        }
        LocalDateTime now = LocalDateTime.now();
        assetMapper.markExpiredTransferExportFiles(now);
        AssetTransferExportFile reusable = assetMapper.selectLatestValidTransferExportFile(rid, now);
        if (reusable != null) {
            return toExportLinkView(reusable, true);
        }

        byte[] pdfBytes = buildTransferPdfBytes(req);
        String fileName = buildTransferPdfFileName(req, now);
        String storageKey = saveTransferPdfToLocal(fileName, pdfBytes);
        AssetTransferExportFile row = new AssetTransferExportFile();
        row.setId("ATF_" + UUID.randomUUID().toString().replace("-", ""));
        row.setRequestId(rid);
        row.setFileName(fileName);
        row.setStorageKey(storageKey);
        row.setDownloadToken(UUID.randomUUID().toString().replace("-", ""));
        row.setStatus("READY");
        row.setExpireAt(now.plusDays(7));
        row.setSummaryText(buildTransferExportSummary(req));
        row.setCreatedBy(operatorId);
        row.setCreatedTime(now);
        assetMapper.insertTransferExportFile(row);
        return toExportLinkView(row, false);
    }

    public Map<String, Object> listTransferPdfLinks(String requestId) {
        if (!StringUtils.hasText(requestId)) {
            throw new IllegalArgumentException("申请单号不能为空");
        }
        LocalDateTime now = LocalDateTime.now();
        assetMapper.markExpiredTransferExportFiles(now);
        List<AssetTransferExportFile> rows = assetMapper.listTransferExportFiles(requestId.trim(), TRANSFER_EXPORT_LINK_LIMIT);
        List<Map<String, Object>> list = new ArrayList<>();
        for (AssetTransferExportFile row : rows) {
            list.add(toExportLinkView(row, false));
        }
        return Map.of("requestId", requestId.trim(), "links", list);
    }

    public Map<String, Object> resolveTransferPdfDownload(String token) {
        if (!StringUtils.hasText(token)) {
            throw new IllegalArgumentException("下载令牌不能为空");
        }
        LocalDateTime now = LocalDateTime.now();
        AssetTransferExportFile row = assetMapper.findTransferExportFileByToken(token.trim());
        if (row == null) {
            throw new IllegalArgumentException("下载链接不存在");
        }
        if (!"READY".equalsIgnoreCase(str(row.getStatus()))) {
            throw new IllegalArgumentException("下载链接不可用，请重新生成");
        }
        if (row.getExpireAt() == null || !row.getExpireAt().isAfter(now)) {
            assetMapper.markExpiredTransferExportFiles(now);
            throw new IllegalArgumentException("链接已过期，请重新生成");
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("downloadUrl", row.getStorageKey());
        data.put("fileName", row.getFileName());
        data.put("expireAt", row.getExpireAt());
        data.put("requestId", row.getRequestId());
        return data;
    }

    public byte[] buildTransferPdfBytes(AssetTransferRequest req) {
        AssetRecord asset = assetMapper.findAssetById(req.getAssetId());
        Map<String, String> columnLabelByKey = new LinkedHashMap<>();
        for (AssetColumnDef def : assetMapper.listColumnDefs()) {
            if (def != null && StringUtils.hasText(def.getColumnKey())) {
                columnLabelByKey.put(def.getColumnKey(), str(def.getColumnLabel()));
            }
        }
        List<Map<String, Object>> valueRows = req.getAssetId() == null ? List.of() : assetMapper.listAssetValuesByAssetId(req.getAssetId());
        LinkedHashMap<String, String> dynamicValues = new LinkedHashMap<>();
        if (valueRows != null) {
            for (Map<String, Object> row : valueRows) {
                String key = str(row.get("column_key"));
                String value = str(row.get("column_value"));
                if (StringUtils.hasText(key) && StringUtils.hasText(value)) {
                    dynamicValues.putIfAbsent(key, value);
                }
            }
        }
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PDFont font = loadPreferredFont(document);
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDPageContentStream stream = new PDPageContentStream(document, page);
            float y = 800f;
            y = writePdfLine(stream, font, 16f, 50f, y, "资产转移记录备案PDF");
            y -= 4f;
            y = writePdfLine(stream, font, 10f, 50f, y, "导出时间: " + LocalDateTime.now().format(EXPORT_TIME));
            y -= 4f;
            y = writePdfLine(stream, font, 11f, 50f, y, "资产编码/名称: " + str(req.getAssetCode()) + " / " + str(req.getAssetName()));
            y = writePdfLine(stream, font, 11f, 50f, y, "申请人: " + (StringUtils.hasText(req.getApplicantName()) ? req.getApplicantName() : str(req.getApplicantId())));
            y = writePdfLine(stream, font, 11f, 50f, y, "转移时间: " + formatDateTime(req.getTransferTime()));
            y = writePdfLine(stream, font, 11f, 50f, y, "申请地点: " + str(req.getTransferLocation()));
            y = writePdfLine(stream, font, 11f, 50f, y, "转移前所在地: " + str(req.getFromLocation()));
            y = writePdfLine(stream, font, 11f, 50f, y, "状态: " + str(req.getStatus()));
            y = writePdfLine(stream, font, 11f, 50f, y, "创建时间: " + formatDateTime(req.getCreateTime()));
            y = writePdfLine(stream, font, 11f, 50f, y, "备注: " + str(req.getRemark()));
            if (asset != null) {
                y -= 3f;
                y = writePdfLine(stream, font, 12f, 50f, y, "资产当前概览");
                y = writePdfLine(stream, font, 11f, 50f, y, "- 当前存放地: " + primaryStoredLocationText(asset, dynamicValues));
                String summaryUser = pickFirstDynamic(dynamicValues, List.of("col_使用人", "col_使用者", "col_领用人", "col_保管人"));
                String summaryModel = pickFirstDynamic(dynamicValues, List.of("col_型号", "col_规格型号", "col_规格"));
                y = writePdfLine(stream, font, 11f, 50f, y, "- 当前使用人: " + str(summaryUser));
                y = writePdfLine(stream, font, 11f, 50f, y, "- 当前型号: " + str(summaryModel));
            }
            if (!dynamicValues.isEmpty()) {
                y -= 3f;
                List<String> pairs = new ArrayList<>();
                for (Map.Entry<String, String> entry : dynamicValues.entrySet()) {
                    String key = entry.getKey();
                    String rawLabel = columnLabelByKey.getOrDefault(key, key);
                    String label = toPdfDynamicLabel(rawLabel, key);
                    pairs.add(label + ": " + str(entry.getValue()));
                }
                for (int i = 0; i < pairs.size(); i += 2) {
                    y = writePdfTextAt(stream, font, 10f, 50f, y, "- " + pairs.get(i));
                    if (i + 1 < pairs.size()) {
                        y = writePdfTextAt(stream, font, 10f, 295f, y, "- " + pairs.get(i + 1));
                    }
                    y -= 18f;
                }
            }
            stream.close();

            document.save(output);
            return output.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("生成PDF失败: " + e.getMessage(), e);
        }
    }

    public byte[] exportTransferRequestsAsExcel(String keyword) {
        List<AssetTransferRequest> rows = assetMapper.listTransferRequests(trimOrNull(keyword), 100000, 0);
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("转移记录");
            List<String> headers = List.of(
                    "申请单号", "资产编码", "资产名称", "申请人", "申请转移时间", "申请地点", "转移前所在地", "备注",
                    "照片URL(兼容)", "转移前照片JSON", "转移后照片JSON", "状态", "申请时间");
            Row header = sheet.createRow(0);
            for (int i = 0; i < headers.size(); i++) {
                header.createCell(i).setCellValue(headers.get(i));
            }
            for (int i = 0; i < rows.size(); i++) {
                AssetTransferRequest r = rows.get(i);
                Row line = sheet.createRow(i + 1);
                line.createCell(0).setCellValue(str(r.getId()));
                line.createCell(1).setCellValue(str(r.getAssetCode()));
                line.createCell(2).setCellValue(str(r.getAssetName()));
                line.createCell(3).setCellValue(str(r.getApplicantName()));
                line.createCell(4).setCellValue(r.getTransferTime() != null ? r.getTransferTime().format(EXPORT_TIME) : "");
                line.createCell(5).setCellValue(str(r.getTransferLocation()));
                line.createCell(6).setCellValue(str(r.getFromLocation()));
                line.createCell(7).setCellValue(str(r.getRemark()));
                line.createCell(8).setCellValue(str(r.getPhotoUrl()));
                line.createCell(9).setCellValue(str(r.getPhotoUrlsBefore()));
                line.createCell(10).setCellValue(str(r.getPhotoUrlsAfter()));
                line.createCell(11).setCellValue(str(r.getStatus()));
                line.createCell(12).setCellValue(r.getCreateTime() != null ? r.getCreateTime().format(EXPORT_TIME) : "");
            }
            ExcelExportColumnAutosizer.autoSizeByContentWithHeaderFloorRow0(sheet, 0, headers.size() - 1);
            workbook.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("导出失败: " + e.getMessage());
        }
    }

    public Map<String, Object> listAssetFacets() {
        List<AssetColumnDef> defs = assetMapper.listColumnDefs();
        List<String> campusKeys = mergeKeys(
                resolveKeys(defs, List.of("校区"), List.of(), "col_校区"),
                List.of("col_校区", "col_所属校区")
        );
        String locKey = pickStorageLocationColumnKey(defs);
        if (StringUtils.hasText(locKey)) {
            campusKeys = mergeKeys(campusKeys, List.of(locKey));
        }
        List<String> userKeys = mergeKeys(
                resolveKeys(defs, List.of("使用人"), List.of("工号"), "col_使用人"),
                List.of("col_使用人", "col_使用者", "col_领用人", "col_保管人")
        );
        List<String> modelKeys = mergeKeys(
                resolveKeys(defs, List.of("规格型号", "型号"), List.of(), "col_型号"),
                List.of("col_规格型号", "col_型号", "col_规格")
        );
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("assetNames", assetMapper.listDistinctAssetNames());
        data.put("campuses", campusKeys.isEmpty() ? List.of() : assetMapper.listDistinctDynamicValuesByKeys(campusKeys));
        data.put("users", userKeys.isEmpty() ? List.of() : assetMapper.listDistinctDynamicValuesByKeys(userKeys));
        data.put("models", modelKeys.isEmpty() ? List.of() : assetMapper.listDistinctDynamicValuesByKeys(modelKeys));
        return data;
    }

    public Map<String, Object> listAssetFacets(String keyword,
                                               String assetName,
                                               String campus,
                                               String user,
                                               String model) {
        String keywordVal = trimOrNull(keyword);
        String assetNameVal = trimOrNull(assetName);
        String campusVal = trimOrNull(campus);
        String userVal = trimOrNull(user);
        String modelVal = trimOrNull(model);

        List<AssetColumnDef> defs = assetMapper.listColumnDefs();
        List<String> campusKeys = mergeKeys(
                resolveKeys(defs, List.of("校区"), List.of(), "col_校区"),
                List.of("col_校区", "col_所属校区")
        );
        String locKey2 = pickStorageLocationColumnKey(defs);
        if (StringUtils.hasText(locKey2)) {
            campusKeys = mergeKeys(campusKeys, List.of(locKey2));
        }
        List<String> userKeys = mergeKeys(
                resolveKeys(defs, List.of("使用人"), List.of("工号"), "col_使用人"),
                List.of("col_使用人", "col_使用者", "col_领用人", "col_保管人")
        );
        List<String> modelKeys = mergeKeys(
                resolveKeys(defs, List.of("规格型号", "型号"), List.of(), "col_型号"),
                List.of("col_规格型号", "col_型号", "col_规格")
        );

        // 维度联动：每个维度的可选项都由"其他维度 + 关键词"共同约束，不包含本维度自身过滤。
        List<AssetRecord> forAssetNames = assetMapper.listAssetsAll(
                keywordVal, null, campusVal, userVal, modelVal,
                campusKeys, userKeys, modelKeys,
                null, null
        );
        List<AssetRecord> forCampuses = assetMapper.listAssetsAll(
                keywordVal, assetNameVal, null, userVal, modelVal,
                campusKeys, userKeys, modelKeys,
                null, null
        );
        List<AssetRecord> forUsers = assetMapper.listAssetsAll(
                keywordVal, assetNameVal, campusVal, null, modelVal,
                campusKeys, userKeys, modelKeys,
                null, null
        );
        List<AssetRecord> forModels = assetMapper.listAssetsAll(
                keywordVal, assetNameVal, campusVal, userVal, null,
                campusKeys, userKeys, modelKeys,
                null, null
        );

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("assetNames", distinctAssetNames(forAssetNames));
        data.put("campuses", distinctDynamicValues(forCampuses, campusKeys));
        data.put("users", distinctDynamicValues(forUsers, userKeys));
        data.put("models", distinctDynamicValues(forModels, modelKeys));
        return data;
    }

    private List<String> resolveKeys(List<AssetColumnDef> defs,
                                     List<String> includeKeywords,
                                     List<String> excludeKeywords,
                                     String fallbackKey) {
        LinkedHashSet<String> keys = new LinkedHashSet<>();
        for (AssetColumnDef def : defs) {
            String label = def == null ? "" : str(def.getColumnLabel()).trim();
            if (!StringUtils.hasText(label)) continue;
            boolean hit = false;
            for (String keyword : includeKeywords) {
                if (StringUtils.hasText(keyword) && label.contains(keyword)) {
                    hit = true;
                    break;
                }
            }
            if (!hit) continue;
            boolean blocked = false;
            for (String keyword : excludeKeywords) {
                if (StringUtils.hasText(keyword) && label.contains(keyword)) {
                    blocked = true;
                    break;
                }
            }
            if (!blocked && StringUtils.hasText(def.getColumnKey())) {
                keys.add(def.getColumnKey());
            }
        }
        if (keys.isEmpty() && StringUtils.hasText(fallbackKey)) {
            keys.add(fallbackKey);
        }
        return new ArrayList<>(keys);
    }

    private List<String> mergeKeys(List<String> primary, List<String> candidates) {
        LinkedHashSet<String> keys = new LinkedHashSet<>();
        if (primary != null) keys.addAll(primary);
        if (candidates != null) keys.addAll(candidates);
        return new ArrayList<>(keys);
    }

    private List<String> distinctAssetNames(List<AssetRecord> records) {
        TreeSet<String> set = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        if (records == null) return List.of();
        for (AssetRecord record : records) {
            String name = record == null ? null : trimOrNull(record.getAssetName());
            if (StringUtils.hasText(name)) {
                set.add(name);
            }
        }
        return new ArrayList<>(set);
    }

    private List<String> distinctDynamicValues(List<AssetRecord> records, List<String> keys) {
        if (records == null || records.isEmpty() || keys == null || keys.isEmpty()) {
            return List.of();
        }
        Set<String> keySet = new HashSet<>(keys);
        Map<String, Map<String, String>> valuesByAssetId = buildValueMap(extractIds(records));
        TreeSet<String> set = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (Map<String, String> values : valuesByAssetId.values()) {
            if (values == null || values.isEmpty()) continue;
            for (Map.Entry<String, String> entry : values.entrySet()) {
                if (!keySet.contains(entry.getKey())) continue;
                String value = trimOrNull(entry.getValue());
                if (StringUtils.hasText(value)) {
                    set.add(value);
                }
            }
        }
        return new ArrayList<>(set);
    }

    // ==================== 批量操作 ====================

    /** 2b. 批量软删除资产（分批500条） */
    public Map<String, Object> batchDelete(List<String> ids, String operatorId) {
        if (ids == null || ids.isEmpty()) {
            return Map.of("deletedCount", 0);
        }
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime purgeAfter = now.plusDays(30);
        int total = 0;
        int batchSize = 500;
        for (int i = 0; i < ids.size(); i += batchSize) {
            int end = Math.min(i + batchSize, ids.size());
            List<String> batch = ids.subList(i, end);
            total += assetMapper.batchSoftDelete(batch, operatorId, now, purgeAfter);
        }
        return Map.of("deletedCount", total);
    }

    /** 2c. 批量更新资产字段 */
    public Map<String, Object> batchUpdate(List<String> ids, Map<String, Object> fixedFields, Map<String, String> dynamicValues, String columnKey, String operatorId) {
        if (ids == null || ids.isEmpty()) {
            return Map.of("updatedCount", 0);
        }
        if (ids.size() > 500) {
            throw new IllegalArgumentException("单次批量更新不得超过500条");
        }
        int updated = 0;

        // 校验 columnKey 有效性
        List<AssetColumnDef> defs = assetMapper.listColumnDefs();
        Set<String> validKeys = new HashSet<>();
        for (AssetColumnDef d : defs) {
            validKeys.add(d.getColumnKey());
        }

        // 固定字段更新
        if (fixedFields != null && !fixedFields.isEmpty()) {
            String status = fixedFields.get("status") instanceof String ? (String) fixedFields.get("status") : null;
            String location = fixedFields.get("location") instanceof String ? (String) fixedFields.get("location") : null;
            String note = fixedFields.get("note") instanceof String ? (String) fixedFields.get("note") : null;
            if (status != null || location != null || note != null) {
                updated += assetMapper.batchUpdateAssetFields(ids, status, location, note, operatorId);
            }
        }

        // 动态列值更新（支持单列 columnKey 或多列遍历）
        if (dynamicValues != null && !dynamicValues.isEmpty()) {
            if (StringUtils.hasText(columnKey) && validKeys.contains(columnKey)) {
                // 单列模式（兼容旧调用）
                String columnValue = dynamicValues.get(columnKey);
                if (columnValue != null) {
                    updated += assetMapper.batchUpdateAssetValues(ids, columnKey, columnValue);
                }
            } else {
                // 多列模式：遍历所有 key，逐个校验并更新
                for (Map.Entry<String, String> entry : dynamicValues.entrySet()) {
                    String key = entry.getKey();
                    String value = entry.getValue();
                    if (StringUtils.hasText(key) && validKeys.contains(key) && value != null) {
                        updated += assetMapper.batchUpdateAssetValues(ids, key, value);
                    }
                }
            }
        }

        return Map.of("updatedCount", updated);
    }

    // ==================== 导入预览与确认 ====================

    /** 2d. 预览导入：解析表头不写数据库，返回预览数据缓存到内存 */
    public Map<String, Object> previewImport(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("上传文件不能为空");
        }
        String previewId = "PREVIEW_" + UUID.randomUUID().toString().replace("-", "");
        List<Map<String, Object>> columns = new ArrayList<>();
        List<Map<String, Object>> sample = new ArrayList<>();
        List<Map<String, String>> warnings = new ArrayList<>();

        String fileName = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase(Locale.ROOT);
        boolean isCsv = fileName.endsWith(".csv");

        try {
            if (isCsv) {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
                    String headerLine = reader.readLine();
                    if (!StringUtils.hasText(headerLine)) {
                        throw new IllegalArgumentException("CSV 缺少表头");
                    }
                    if (headerLine.startsWith("﻿")) {
                        headerLine = headerLine.substring(1);
                    }
                    List<String> headers = parseCsvLine(headerLine);
                    columns = buildPreviewColumns(headers, warnings);

                    // 读取最多5行样本
                    String line;
                    int sampleCount = 0;
                    while ((line = reader.readLine()) != null && sampleCount < 5) {
                        if (!StringUtils.hasText(line)) continue;
                        List<String> cells = parseCsvLine(line);
                        Map<String, Object> row = new LinkedHashMap<>();
                        for (int i = 0; i < headers.size() && i < cells.size(); i++) {
                            row.put(headers.get(i), cells.get(i));
                        }
                        sample.add(row);
                        sampleCount++;
                    }
                }
            } else {
                try (Workbook workbook = WorkbookFactory.create(file.getInputStream())) {
                    Sheet sheet = workbook.getNumberOfSheets() > 0 ? workbook.getSheetAt(0) : null;
                    if (sheet == null) throw new IllegalArgumentException("Excel 工作表为空");
                    DataFormatter formatter = new DataFormatter();
                    Row headerRow = sheet.getRow(0);
                    if (headerRow == null) throw new IllegalArgumentException("Excel 缺少表头");
                    int last = Math.max(headerRow.getLastCellNum(), 0);
                    List<String> headers = new ArrayList<>();
                    for (int i = 0; i < last; i++) {
                        headers.add(formatter.formatCellValue(headerRow.getCell(i)).trim());
                    }
                    columns = buildPreviewColumns(headers, warnings);

                    // 读取最多5行样本
                    for (int rowIndex = 1; rowIndex <= Math.min(sheet.getLastRowNum(), 5); rowIndex++) {
                        Row row = sheet.getRow(rowIndex);
                        if (row == null) continue;
                        Map<String, Object> rowData = new LinkedHashMap<>();
                        for (int i = 0; i < headers.size(); i++) {
                            rowData.put(headers.get(i), i < last ? formatter.formatCellValue(row.getCell(i)).trim() : "");
                        }
                        sample.add(rowData);
                    }
                }
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("预览解析失败: " + e.getMessage());
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("previewId", previewId);
        result.put("columns", columns);
        result.put("sample", sample);
        if (!warnings.isEmpty()) {
            result.put("warnings", warnings);
        }

        // 缓存到内存（30分钟过期），同时缓存文件字节供 confirm 阶段重放
        byte[] fileBytes;
        try { fileBytes = file.getBytes(); } catch (Exception e) { fileBytes = new byte[0]; }
        previewCache.put(previewId, new PreviewCacheEntry(result, fileBytes, file.getOriginalFilename()));
        // 清理过期缓存
        previewCache.entrySet().removeIf(e -> e.getValue().isExpired());

        return result;
    }

    private List<Map<String, Object>> buildPreviewColumns(List<String> headers, List<Map<String, String>> warnings) {
        List<Map<String, Object>> columns = new ArrayList<>();
        for (String header : headers) {
            if (!StringUtils.hasText(header)) continue;
            Map<String, Object> col = new LinkedHashMap<>();
            col.put("header", header);
            if (RESERVED_HEADERS.contains(header)) {
                col.put("type", "reserved");
                col.put("matched", true);
                col.put("matchedKey", header);
                col.put("matchedLabel", header);
            } else {
                AssetColumnDef existingDef = assetMapper.findColumnDefByLabel(header);
                if (existingDef != null) {
                    col.put("type", "dynamic");
                    col.put("matched", true);
                    col.put("columnKey", existingDef.getColumnKey());
                    col.put("matchedKey", existingDef.getColumnKey());
                    col.put("matchedLabel", existingDef.getColumnLabel());
                } else {
                    col.put("type", "dynamic");
                    col.put("matched", false);
                    col.put("suggestedKey", buildColumnKey(header));
                    col.put("matchedKey", null);
                    col.put("matchedLabel", null);
                    warnings.add(Map.of("header", header, "reason", "未找到对应列定义，需确认后创建"));
                }
            }
            columns.add(col);
        }
        return columns;
    }

    /** 2e. 确认导入：根据用户勾选的列创建定义后执行实际导入 */
    public Map<String, Object> confirmImport(String previewId, List<String> createNewColumns, String operatorId) {
        if (!StringUtils.hasText(previewId)) {
            throw new IllegalArgumentException("previewId 不能为空");
        }
        PreviewCacheEntry entry = previewCache.get(previewId);
        if (entry == null || entry.isExpired()) {
            throw new IllegalArgumentException("预览已过期，请重新上传预览");
        }
        // 从缓存重建 MultipartFile
        final byte[] cachedBytes = entry.fileBytes;
        final String cachedName = entry.originalFilename;
        MultipartFile file = new MultipartFile() {
            @Override public String getName() { return "file"; }
            @Override public String getOriginalFilename() { return cachedName; }
            @Override public String getContentType() { return null; }
            @Override public boolean isEmpty() { return cachedBytes == null || cachedBytes.length == 0; }
            @Override public long getSize() { return cachedBytes == null ? 0 : cachedBytes.length; }
            @Override public byte[] getBytes() { return cachedBytes; }
            @Override public InputStream getInputStream() { return new java.io.ByteArrayInputStream(cachedBytes); }
            @Override public void transferTo(java.io.File dest) throws IOException { java.nio.file.Files.write(dest.toPath(), cachedBytes); }
        };
        String batchId = "BATCH_" + UUID.randomUUID().toString().replace("-", "");
        Map<String, Object> result = importAssetsFromExcelInternal(operatorId, file, batchId, createNewColumns);
        // 清理缓存
        previewCache.remove(previewId);
        return result;
    }

    // ==================== 查找替换 ====================

    /** 2f. 查找替换动态列值 */
    public Map<String, Object> searchReplace(String columnKey, String search, String replace, String matchMode) {
        if (!StringUtils.hasText(columnKey)) {
            throw new IllegalArgumentException("columnKey 不能为空");
        }
        if (!StringUtils.hasText(search)) {
            throw new IllegalArgumentException("search 不能为空");
        }
        // 校验 columnKey 在 asset_column_def 中存在
        AssetColumnDef def = assetMapper.findColumnDefByKey(columnKey);
        if (def == null) {
            throw new IllegalArgumentException("列定义不存在: " + columnKey);
        }
        String mode;
        if ("exact".equalsIgnoreCase(matchMode)) {
            mode = "exact";
        } else if ("startsWith".equalsIgnoreCase(matchMode)) {
            mode = "startsWith";
        } else {
            mode = "fuzzy"; // contains
        }
        // 转义 LIKE 通配符，防止 % 和 _ 被误解释
        String escapedSearch = ("exact".equals(mode)) ? search : search
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        int count = assetMapper.searchReplaceValues(columnKey, escapedSearch, replace == null ? "" : replace, mode);
        return Map.of("replacedCount", count);
    }

    // ==================== 导入批次管理 ====================

    /** 2g. 分页获取导入批次列表 */
    public Map<String, Object> listImportBatches(int page, int size) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(Math.max(1, size), 200);
        int offset = (safePage - 1) * safeSize;
        List<AssetImportBatch> rows = assetMapper.listImportBatches(safeSize, offset);
        int total = assetMapper.countImportBatches();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("rows", rows);
        data.put("total", total);
        data.put("page", safePage);
        data.put("size", safeSize);
        return data;
    }

    /** 2h. 按批次ID删除该批次创建的所有资产 */
    public Map<String, Object> deleteByCreatedBatchId(String batchId, String operatorId) {
        if (!StringUtils.hasText(batchId)) {
            throw new IllegalArgumentException("batchId 不能为空");
        }
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime purgeAfter = now.plusDays(30);
        int count = assetMapper.deleteByCreatedBatchId(batchId, operatorId, now, purgeAfter);
        return Map.of("deletedCount", count);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> clearAllAssetData() {
        int values = assetMapper.deleteAllAssetValues();
        int logs = assetMapper.deleteAllTransferLogs();
        int requests = assetMapper.deleteAllTransferRequests();
        int assets = assetMapper.deleteAllAssets();
        int columns = assetMapper.deleteAllColumnDefs();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("assetRows", assets);
        result.put("dynamicColumns", columns);
        result.put("valueRows", values);
        result.put("transferRequests", requests);
        result.put("transferLogs", logs);
        return result;
    }

    private List<String> photoUrlsFromRequest(AssetTransferRequest req, boolean before) {
        if (req == null) {
            return List.of();
        }
        if (before) {
            List<String> fromJson = readPhotoUrlList(req.getPhotoUrlsBefore());
            if (!fromJson.isEmpty()) {
                return new ArrayList<>(fromJson);
            }
            if (StringUtils.hasText(req.getPhotoUrl())) {
                return new ArrayList<>(List.of(req.getPhotoUrl().trim()));
            }
            return new ArrayList<>();
        }
        return new ArrayList<>(readPhotoUrlList(req.getPhotoUrlsAfter()));
    }

    private Map<String, Object> toExportLinkView(AssetTransferExportFile row, boolean reused) {
        LocalDateTime now = LocalDateTime.now();
        String status = str(row.getStatus());
        if ("READY".equalsIgnoreCase(status) && row.getExpireAt() != null && !row.getExpireAt().isAfter(now)) {
            status = "EXPIRED";
        }
        String downloadPath = "/api/v1/asset-transfer-records/download/" + row.getDownloadToken();
        String external = resolvePublicUrl(downloadPath);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", row.getId());
        out.put("requestId", row.getRequestId());
        out.put("fileName", row.getFileName());
        out.put("status", status);
        out.put("expireAt", row.getExpireAt());
        out.put("summaryText", str(row.getSummaryText()));
        out.put("downloadToken", row.getDownloadToken());
        out.put("downloadPath", downloadPath);
        out.put("downloadUrl", external);
        out.put("reused", reused);
        out.put("createdTime", row.getCreatedTime());
        return out;
    }

    private String resolvePublicUrl(String path) {
        if (!StringUtils.hasText(path)) {
            return "";
        }
        if (!StringUtils.hasText(appPublicBaseUrl)) {
            return path;
        }
        String base = appPublicBaseUrl.trim();
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        if (!path.startsWith("/")) {
            return base + "/" + path;
        }
        return base + path;
    }

    private String buildTransferPdfFileName(AssetTransferRequest req, LocalDateTime now) {
        String assetCode = StringUtils.hasText(req.getAssetCode()) ? req.getAssetCode().trim() : "NA";
        String safeCode = assetCode.replaceAll("[^A-Za-z0-9_-]", "");
        if (!StringUtils.hasText(safeCode)) safeCode = "NA";
        return "TR_" + safeCode + "_" + now.format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmm")) + ".pdf";
    }

    private String buildTransferExportSummary(AssetTransferRequest req) {
        String applicant = StringUtils.hasText(req.getApplicantName()) ? req.getApplicantName() : str(req.getApplicantId());
        return "资产 " + str(req.getAssetCode()) + " / 申请人 " + applicant + " / 时间 " + formatDateTime(req.getTransferTime());
    }

    private String saveTransferPdfToLocal(String fileName, byte[] content) {
        String dateDir = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String unique = UUID.randomUUID().toString().replace("-", "");
        String safeName = (StringUtils.hasText(fileName) ? fileName : "transfer.pdf").replaceAll("[^A-Za-z0-9._-]", "_");
        String finalName = unique + "_" + safeName;
        try {
            Path dir = uploadFileService.resolveBaseDir().resolve(dateDir).normalize();
            Files.createDirectories(dir);
            Path target = dir.resolve(finalName).normalize();
            Files.write(target, content);
            return "/api/upload/files/" + dateDir + "/" + finalName;
        } catch (Exception e) {
            throw new IllegalStateException("保存PDF失败: " + e.getMessage(), e);
        }
    }

    private String formatDateTime(LocalDateTime time) {
        if (time == null) return "";
        return time.truncatedTo(ChronoUnit.SECONDS).format(EXPORT_TIME);
    }

    /**
     * 加载可渲染中文的 OpenType/TrueType 字体。Windows 上常见为 .ttc 集合文件，
     * 不能直接用 {@link PDType0Font#load(PDDocument, File)}，需通过 {@link TrueTypeCollection} 取出单套 TrueTypeFont。
     */
    private PDFont loadPreferredFont(PDDocument document) throws IOException {
        String configured = trimOrNull(appPdfFontPath);
        if (configured != null) {
            File f = new File(configured);
            if (f.isFile()) {
                PDFont loaded = loadCjkFontFromFile(document, f);
                if (loaded != null) {
                    return loaded;
                }
            }
        }
        try (InputStream in = getClass().getResourceAsStream("/fonts/NotoSansSC-Regular.otf")) {
            if (in != null) {
                return PDType0Font.load(document, in, true);
            }
        }
        List<String> candidates = new ArrayList<>(List.of(
                "C:/Windows/Fonts/msyh.ttc",
                "C:/Windows/Fonts/msyh.ttf",
                "C:/Windows/Fonts/simsun.ttc",
                "C:/Windows/Fonts/simsun.ttf",
                "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
                "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
                "/System/Library/Fonts/PingFang.ttc",
                "/System/Library/Fonts/STHeiti Light.ttc",
                "/Library/Fonts/Arial Unicode.ttf"
        ));
        for (String p : candidates) {
            File file = new File(p);
            if (!file.isFile()) {
                continue;
            }
            PDFont font = loadCjkFontFromFile(document, file);
            if (font != null) {
                return font;
            }
        }
        throw new IOException(
                "未找到可用的中文字体。PDF 正文含中文，不能使用 Helvetica。"
                        + " 请在服务器安装中文字体（如 Noto CJK / wqy-zenhei），或在 application.properties 中设置 app.pdf.font-path 指向 .ttf/.otf/.ttc 文件。"
        );
    }

    /**
     * @return null if file cannot be parsed as embeddable CJK font
     */
    private PDFont loadCjkFontFromFile(PDDocument document, File file) throws IOException {
        String name = file.getName().toLowerCase(Locale.ROOT);
        if (name.endsWith(".ttc")) {
            try (TrueTypeCollection ttc = new TrueTypeCollection(file)) {
                final TrueTypeFont[] first = new TrueTypeFont[1];
                ttc.processAllFonts(ttf -> {
                    if (first[0] == null) {
                        first[0] = ttf;
                    }
                });
                if (first[0] != null) {
                    return PDType0Font.load(document, first[0], true);
                }
            }
            return null;
        }
        if (name.endsWith(".ttf") || name.endsWith(".otf")) {
            try (FileInputStream in = new FileInputStream(file)) {
                return PDType0Font.load(document, in, true);
            }
        }
        return null;
    }

    private float writePdfLine(PDPageContentStream stream, PDFont font, float fontSize, float x, float y, String text) throws Exception {
        float safeY = y;
        if (safeY < 50f) safeY = 50f;
        stream.beginText();
        stream.setFont(font, fontSize);
        stream.newLineAtOffset(x, safeY);
        stream.showText(sanitizePdfText(text));
        stream.endText();
        return safeY - 18f;
    }

    private float writePdfTextAt(PDPageContentStream stream, PDFont font, float fontSize, float x, float y, String text) throws Exception {
        float safeY = y;
        if (safeY < 50f) safeY = 50f;
        stream.beginText();
        stream.setFont(font, fontSize);
        stream.newLineAtOffset(x, safeY);
        stream.showText(sanitizePdfText(text));
        stream.endText();
        return safeY;
    }

    private String toPdfDynamicLabel(String rawLabel, String key) {
        String label = trimOrNull(rawLabel);
        if (label == null) {
            label = str(key);
        }
        if (label.startsWith("col_")) {
            label = label.substring(4);
        }
        return label;
    }

    private String sanitizePdfText(String text) {
        if (text == null) return "";
        return text.replace('\r', ' ').replace('\n', ' ');
    }

    private String pickCampusColumnKey(List<AssetColumnDef> defs) {
        List<String> keys = resolveKeys(defs, List.of("校区"), List.of(), "col_校区");
        return keys.isEmpty() ? null : keys.get(0);
    }

    private String pickStorageLocationColumnKey(List<AssetColumnDef> defs) {
        if (defs == null) {
            return null;
        }
        // 第一优先：列名精确匹配 "存放地点N"（如 存放地点1）
        for (AssetColumnDef d : defs) {
            if (d == null || !StringUtils.hasText(d.getColumnKey())) {
                continue;
            }
            String label = str(d.getColumnLabel()).trim();
            if (label.matches("(?i)存放地点\\d*")) {
                return d.getColumnKey();
            }
        }
        // 第二优先：列名包含 "存放地点" 或 "当前位置" 或 "所在地"
        for (AssetColumnDef d : defs) {
            if (d == null || !StringUtils.hasText(d.getColumnKey())) {
                continue;
            }
            String label = str(d.getColumnLabel()).trim();
            if (label.contains("存放地点") || label.contains("当前位置") || label.contains("所在地") || label.contains("存放位置") || label.contains("存储位置")) {
                return d.getColumnKey();
            }
        }
        // 第三兜底：column_key 包含 "存放" 或 "位置" 或 "location" 或 "storage"
        for (AssetColumnDef d : defs) {
            if (d == null || !StringUtils.hasText(d.getColumnKey())) {
                continue;
            }
            String key = d.getColumnKey().toLowerCase(Locale.ROOT);
            if (key.contains("存放") || key.contains("位置") || key.contains("location") || key.contains("storage")) {
                return d.getColumnKey();
            }
        }
        return null;
    }

    private String primaryStoredLocationText(AssetRecord asset, Map<String, String> dynamicValues) {
        String key = pickStorageLocationColumnKey(assetMapper.listColumnDefs());
        if (dynamicValues != null && StringUtils.hasText(key)) {
            String v = trimOrNull(dynamicValues.get(key));
            if (StringUtils.hasText(v)) {
                return v;
            }
        }
        return asset == null ? "" : str(asset.getLocation());
    }

    private String pickFirstDynamic(Map<String, String> values, List<String> keys) {
        if (values == null || values.isEmpty()) return "";
        for (String key : keys) {
            String v = values.get(key);
            if (StringUtils.hasText(v)) return v;
        }
        return "";
    }

    private List<String> readPhotoUrlList(String json) {
        if (!StringUtils.hasText(json)) {
            return new ArrayList<>();
        }
        try {
            List<String> list = OBJECT_MAPPER.readValue(json.trim(), new TypeReference<List<String>>() {});
            List<String> out = new ArrayList<>();
            if (list != null) {
                for (String u : list) {
                    if (StringUtils.hasText(u)) {
                        out.add(u.trim());
                    }
                }
            }
            return out;
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private String writeJsonArray(List<String> urls) {
        try {
            return OBJECT_MAPPER.writeValueAsString(urls);
        } catch (Exception e) {
            throw new IllegalArgumentException("照片列表序列化失败");
        }
    }

    private LocalDateTime parseTime(String text) {
        String t = text.replace("T", " ");
        try {
            if (t.length() == 16) {
                return LocalDateTime.parse(t + ":00", DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            }
            if (t.length() == 19) {
                return LocalDateTime.parse(t, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            }
            return LocalDateTime.parse(t);
        } catch (Exception e) {
            throw new IllegalArgumentException("转移时间格式错误，请使用 yyyy-MM-dd HH:mm[:ss]");
        }
    }

    private Map<String, Map<String, String>> buildValueMap(List<String> assetIds) {
        Map<String, Map<String, String>> result = new HashMap<>();
        if (assetIds == null || assetIds.isEmpty()) {
            return result;
        }
        List<Map<String, Object>> rows = assetMapper.listAssetValuesByAssetIds(assetIds);
        for (Map<String, Object> row : rows) {
            String assetId = str(row.get("asset_id"));
            String key = str(row.get("column_key"));
            String value = str(row.get("column_value"));
            result.computeIfAbsent(assetId, k -> new LinkedHashMap<>()).put(key, value);
        }
        return result;
    }

    private List<String> extractIds(List<AssetRecord> records) {
        List<String> ids = new ArrayList<>();
        for (AssetRecord r : records) {
            ids.add(r.getId());
        }
        return ids;
    }

    private String getCellText(Row row, int idx, DataFormatter formatter) {
        if (idx < 0) return "";
        Cell cell = row.getCell(idx);
        if (cell == null) return "";
        return formatter.formatCellValue(cell).trim();
    }

    private String getCsvCell(List<String> cells, int idx) {
        if (idx < 0 || idx >= cells.size()) return "";
        String value = cells.get(idx);
        return value == null ? "" : value.trim();
    }

    private List<String> parseCsvLine(String line) {
        List<String> result = new ArrayList<>();
        if (line == null) return result;
        StringBuilder sb = new StringBuilder();
        boolean inQuote = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (ch == '"') {
                if (inQuote && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    sb.append('"');
                    i++;
                } else {
                    inQuote = !inQuote;
                }
            } else if (ch == ',' && !inQuote) {
                result.add(sb.toString());
                sb.setLength(0);
            } else {
                sb.append(ch);
            }
        }
        result.add(sb.toString());
        return result;
    }

    private int findHeader(List<String> headers, List<String> names) {
        for (int i = 0; i < headers.size(); i++) {
            String h = headers.get(i);
            for (String n : names) {
                if (n.equalsIgnoreCase(h)) {
                    return i;
                }
            }
        }
        return -1;
    }

    private String buildColumnKey(String label) {
        String base = label.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9\\u4e00-\\u9fa5]+", "_")
                .replaceAll("^_+|_+$", "");
        if (!StringUtils.hasText(base)) {
            base = "col";
        }
        String key = "col_" + base;
        if (key.length() > 64) {
            key = key.substring(0, 64);
        }
        return key;
    }

    private String trimOrNull(String text) {
        if (!StringUtils.hasText(text)) {
            return null;
        }
        return text.trim();
    }

    private String str(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}

