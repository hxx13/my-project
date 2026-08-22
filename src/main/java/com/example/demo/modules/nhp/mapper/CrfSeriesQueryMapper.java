package com.example.demo.modules.nhp.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * NHP 读侧聚合查询（概念序列等）。对齐 22 §6.4。
 */
@Mapper
public interface CrfSeriesQueryMapper {

    /**
     * 按 subject + concept_code 聚合跨域 EAV 值成纵向序列。
     * 时间优先 collected_at，其次 value_datetime / value_date / updated_at。
     * 日期窗由 Service 层过滤（避免注解动态 SQL 复杂度）。
     */
    @Select("SELECT " +
            "v.id AS valueId, r.id AS recordId, r.subject_id AS subjectId, " +
            "f.id AS fieldId, f.field_code AS fieldCode, f.name_en AS nameEn, f.name_cn AS nameCn, " +
            "f.concept_code AS conceptCode, f.unit AS unit, " +
            "COALESCE(v.collected_at, v.value_datetime, " +
            "  CASE WHEN v.value_date IS NOT NULL THEN TIMESTAMP(v.value_date) END, " +
            "  v.updated_at) AS observedAt, " +
            "COALESCE(CAST(v.value_decimal AS CHAR), CAST(v.value_int AS CHAR), " +
            "  v.value_string, v.value_text) AS valueDisplay, " +
            "v.value_decimal AS valueDecimal, v.value_int AS valueInt, v.value_string AS valueString " +
            "FROM crf_record_value v " +
            "INNER JOIN crf_record r ON r.id = v.record_id " +
            "INNER JOIN crf_field f ON f.id = v.field_id " +
            "WHERE r.subject_id = #{subjectId} " +
            "AND r.status <> 'DELETED' " +
            "AND f.concept_code = #{conceptCode} " +
            "AND f.active = 1 " +
            "AND (v.entry_pass IS NULL OR v.entry_pass = 1) " +
            "ORDER BY observedAt ASC, v.id ASC")
    List<Map<String, Object>> listSeries(@Param("subjectId") Long subjectId,
                                         @Param("conceptCode") String conceptCode);

    /**
     * 无 conceptCode 时：该受试者全部带 concept_code 的观测值（多指标网格）。
     */
    @Select("SELECT " +
            "v.id AS valueId, r.id AS recordId, r.subject_id AS subjectId, " +
            "f.id AS fieldId, f.field_code AS fieldCode, f.name_en AS nameEn, f.name_cn AS nameCn, " +
            "f.concept_code AS conceptCode, f.unit AS unit, " +
            "COALESCE(v.collected_at, v.value_datetime, " +
            "  CASE WHEN v.value_date IS NOT NULL THEN TIMESTAMP(v.value_date) END, " +
            "  v.updated_at) AS observedAt, " +
            "COALESCE(CAST(v.value_decimal AS CHAR), CAST(v.value_int AS CHAR), " +
            "  v.value_string, v.value_text) AS valueDisplay, " +
            "v.value_decimal AS valueDecimal, v.value_int AS valueInt, v.value_string AS valueString " +
            "FROM crf_record_value v " +
            "INNER JOIN crf_record r ON r.id = v.record_id " +
            "INNER JOIN crf_field f ON f.id = v.field_id " +
            "WHERE r.subject_id = #{subjectId} " +
            "AND r.status <> 'DELETED' " +
            "AND f.concept_code IS NOT NULL AND f.concept_code <> '' " +
            "AND f.active = 1 " +
            "AND (v.entry_pass IS NULL OR v.entry_pass = 1) " +
            "ORDER BY observedAt ASC, f.concept_code ASC, v.id ASC")
    List<Map<String, Object>> listSeriesMulti(@Param("subjectId") Long subjectId);
}
