package com.example.demo.modules.nhp.service;

import com.example.demo.common.dto.Result;
import com.example.demo.modules.nhp.entity.CrfImportBatch;
import com.example.demo.modules.nhp.mapper.CrfImportBatchMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/** NHP 数据导入：批次创建 + 校验 + 执行（校验复用 17 规则引擎、执行落库二期实现）。 */
@Service
public class NhpImportService {

    private final CrfImportBatchMapper batchMapper;
    private final ObjectMapper objectMapper;

    public NhpImportService(CrfImportBatchMapper batchMapper, ObjectMapper objectMapper) {
        this.batchMapper = batchMapper;
        this.objectMapper = objectMapper;
    }

    public List<CrfImportBatch> list() {
        return batchMapper.list();
    }

    @Transactional
    public Result<CrfImportBatch> createBatch(Map<String, Object> body) {
        Long formId = asLong(body.get("formId"));
        String fileFormat = str(body.get("fileFormat"));
        if (formId == null || fileFormat == null) {
            return Result.fail(400, "formId 与 fileFormat 必填");
        }
        CrfImportBatch b = new CrfImportBatch();
        b.setFormId(formId);
        b.setFileFormat(fileFormat);
        b.setFileId(asLong(body.get("fileId")));
        b.setOperatorId(str(body.get("operatorId")));
        b.setMappingJson(toJson(body.get("mappingJson")));
        b.setStatus("PENDING");
        batchMapper.insert(b);
        return Result.success(b);
    }

    /** 校验：解析 mapping_json + 复用 17 规则引擎（二期接纯函数引擎后落 total/failed 统计）。 */
    @Transactional
    public Result<?> validate(Long batchId) {
        CrfImportBatch b = batchMapper.findById(batchId);
        if (b == null) {
            return Result.error("导入批次不存在");
        }
        if (b.getMappingJson() == null || b.getMappingJson().isBlank()) {
            return Result.fail(400, "批次未配置字段映射 mappingJson");
        }
        b.setStatus("VALIDATED");
        batchMapper.update(b);
        return Result.success(Map.of("batchId", batchId, "status", "VALIDATED"));
    }

    /** 执行导入：按 mapping_json 分层映射写 crf_record_value（source_type=IMPORT），二期实现。 */
    @Transactional
    public Result<?> execute(Long batchId) {
        return Result.fail(501, "导入执行（execute）为二期功能：需接 16 的分层映射展开 + 17 规则引擎落库");
    }

    private String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private Long asLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v)); } catch (Exception e) { return null; }
    }

    private String toJson(Object o) {
        try {
            return o == null ? null : objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            return null;
        }
    }
}
