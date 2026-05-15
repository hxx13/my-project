package com.example.demo.modules.asset.service;

import com.example.demo.common.excel.ExcelExportColumnAutosizer;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.demo.modules.asset.dto.AssetTransferApplyRequest;
import com.example.demo.modules.asset.entity.AssetColumnDef;
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

@Service
public class AssetService {
    private static final Set<String> RESERVED_HEADERS = Set.of("资产编码", "资产编号", "资产名称", "状态", "当前位置", "存放地点", "标注", "备注");
    private static final Set<String> RESERVED_KEYS = Set.of("assetCode", "assetName", "status", "location", "note", "locked");
    private static final DateTimeFormatter EXPORT_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final int TRANSFER_EXPORT_LINK_LIMIT = 10;

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
        row.put("latestTransferPhotoUrl", latestReq == null ? null : latestReq.getPhotoUrl());
        row.put("latestTransferPhotoUrlsBefore", latestReq == null ? List.of() : photoUrlsFromRequest(latestReq, true));
        row.put("latestTransferPhotoUrlsAfter", latestReq == null ? List.of() : photoUrlsFromRequest(latestReq, false));
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
        int created = 0;
        int updated = 0;
        int skipped = 0;
        List<AssetColumnDef> defs = assetMapper.listColumnDefs();
        Map<String, AssetColumnDef> defByKey = new HashMap<>();
        for (AssetColumnDef d : defs) {
            defByKey.put(d.getColumnKey(), d);
        }

        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(file.getBytes()))) {
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
                throw new IllegalArgumentException("Excel 必须包含“资产编码”和“资产名称”列");
            }

            Map<Integer, String> dynamicColumnByIndex = new HashMap<>();
            for (int i = 0; i < headers.size(); i++) {
                String header = headers.get(i);
                if (!StringUtils.hasText(header) || RESERVED_HEADERS.contains(header)) {
                    continue;
                }
                String key = buildColumnKey(header);
                if (!defByKey.containsKey(key)) {
                    AssetColumnDef def = new AssetColumnDef();
                    def.setColumnKey(key);
                    def.setColumnLabel(header);
                    def.setValueType("TEXT");
                    def.setSortable(1);
                    def.setSearchable(1);
                    def.setSortOrder(defByKey.size() + 1);
                    def.setCreateBy(operatorId);
                    assetMapper.insertColumnDef(def);
                    defByKey.put(key, def);
                }
                dynamicColumnByIndex.put(i, key);
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
            throw new IllegalArgumentException("Excel 解析失败: " + e.getMessage());
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("created", created);
        result.put("updated", updated);
        result.put("skipped", skipped);
        return result;
    }

    private Map<String, Object> importAssetsFromCsv(String operatorId, MultipartFile file) {
        int created = 0;
        int updated = 0;
        int skipped = 0;
        List<AssetColumnDef> defs = assetMapper.listColumnDefs();
        Map<String, AssetColumnDef> defByKey = new HashMap<>();
        for (AssetColumnDef d : defs) {
            defByKey.put(d.getColumnKey(), d);
        }
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
                throw new IllegalArgumentException("CSV 必须包含“资产编码”和“资产名称”列");
            }
            Map<Integer, String> dynamicColumnByIndex = new HashMap<>();
            for (int i = 0; i < headers.size(); i++) {
                String header = headers.get(i) == null ? "" : headers.get(i).trim();
                if (!StringUtils.hasText(header) || RESERVED_HEADERS.contains(header)) {
                    continue;
                }
                String key = buildColumnKey(header);
                if (!defByKey.containsKey(key)) {
                    AssetColumnDef def = new AssetColumnDef();
                    def.setColumnKey(key);
                    def.setColumnLabel(header);
                    def.setValueType("TEXT");
                    def.setSortable(1);
                    def.setSearchable(1);
                    def.setSortOrder(defByKey.size() + 1);
                    def.setCreateBy(operatorId);
                    assetMapper.insertColumnDef(def);
                    defByKey.put(key, def);
                }
                dynamicColumnByIndex.put(i, key);
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
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("CSV 解析失败: " + e.getMessage());
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("created", created);
        result.put("updated", updated);
        result.put("skipped", skipped);
        return result;
    }

    public byte[] exportAssetsAsExcel(String keyword, String assetName, String campus, String user, String model, Integer lockStatus, String status) {
        Map<String, Object> page = listAssets(keyword, assetName, campus, user, model, lockStatus, status, 1, 100000, "updateTime", "desc", null);
        @SuppressWarnings("unchecked")
        List<AssetColumnDef> columnDefs = (List<AssetColumnDef>) page.getOrDefault("columns", List.of());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) page.getOrDefault("rows", List.of());
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
                                          String note,
                                          String status,
                                          String location,
                                          Map<String, String> dynamicValues) {
        AssetRecord record = assetMapper.findAssetById(id);
        if (record == null) {
            throw new IllegalArgumentException("资产不存在");
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
        record.setUpdateBy("system");
        assetMapper.updateAssetBase(record);
        if (dynamicValues != null && !dynamicValues.isEmpty()) {
            List<AssetColumnDef> defs = assetMapper.listColumnDefs();
            Set<String> validKeys = new HashSet<>();
            for (AssetColumnDef d : defs) {
                validKeys.add(d.getColumnKey());
            }
            for (Map.Entry<String, String> e : dynamicValues.entrySet()) {
                if (validKeys.contains(e.getKey())) {
                    assetMapper.upsertAssetValue(id, e.getKey(), e.getValue());
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
        return Map.of("requestId", reqId, "status", "IN_PROGRESS");
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
        List<String> userKeys = mergeKeys(
                resolveKeys(defs, List.of("使用人"), List.of("工号"), "col_使用人"),
                List.of("col_使用人", "col_使用者", "col_领用人", "col_保管人")
        );
        List<String> modelKeys = mergeKeys(
                resolveKeys(defs, List.of("规格型号", "型号"), List.of(), "col_型号"),
                List.of("col_规格型号", "col_型号", "col_规格")
        );

        // 维度联动：每个维度的可选项都由“其他维度 + 关键词”共同约束，不包含本维度自身过滤。
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

    private String pickStorageLocationColumnKey(List<AssetColumnDef> defs) {
        if (defs == null) {
            return null;
        }
        for (AssetColumnDef d : defs) {
            if (d == null || !StringUtils.hasText(d.getColumnKey())) {
                continue;
            }
            String label = str(d.getColumnLabel()).trim();
            if (label.matches("(?i)存放地点\\d+")) {
                return d.getColumnKey();
            }
        }
        for (AssetColumnDef d : defs) {
            if (d == null || !StringUtils.hasText(d.getColumnKey())) {
                continue;
            }
            if (str(d.getColumnLabel()).contains("存放地点")) {
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

