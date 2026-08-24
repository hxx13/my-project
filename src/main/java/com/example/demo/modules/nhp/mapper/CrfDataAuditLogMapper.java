package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfDataAuditLog;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 数据审计 mapper（只追加）。 */
@Mapper
public interface CrfDataAuditLogMapper {

    @Insert("INSERT INTO crf_data_audit_log (record_id, field_id, field_version_id, change_type, " +
            "before_value, after_value, operator_id, change_reason, signature_id) " +
            "VALUES (#{recordId}, #{fieldId}, #{fieldVersionId}, #{changeType}, " +
            "#{beforeValue}, #{afterValue}, #{operatorId}, #{changeReason}, #{signatureId})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfDataAuditLog row);

    @Select("SELECT a.*, f.field_code AS fieldCode, f.name_cn AS fieldName " +
            "FROM crf_data_audit_log a " +
            "LEFT JOIN crf_field f ON f.id = a.field_id " +
            "WHERE a.record_id = #{recordId} ORDER BY a.id DESC")
    List<CrfDataAuditLog> listByRecordId(Long recordId);

    @Select("SELECT a.*, f.field_code AS fieldCode, f.name_cn AS fieldName " +
            "FROM crf_data_audit_log a " +
            "LEFT JOIN crf_field f ON f.id = a.field_id " +
            "ORDER BY a.id DESC LIMIT #{limit}")
    List<CrfDataAuditLog> listRecent(@Param("limit") int limit);

    @Select("<script>SELECT a.*, f.field_code AS fieldCode, f.name_cn AS fieldName " +
            "FROM crf_data_audit_log a " +
            "LEFT JOIN crf_field f ON f.id = a.field_id " +
            "LEFT JOIN crf_record r ON r.id = a.record_id " +
            "LEFT JOIN crf_subject s ON s.id = r.subject_id " +
            "LEFT JOIN crf_form fm ON fm.id = r.form_id " +
            "WHERE 1=1 " +
            "<if test='formId != null'>AND r.form_id = #{formId}</if> " +
            "<if test='formKey != null and formKey != \"\"'>AND fm.code = #{formKey}</if> " +
            "<if test='changeType != null and changeType != \"\"'>AND a.change_type = #{changeType}</if> " +
            "<if test='operatorId != null and operatorId != \"\"'>AND a.operator_id = #{operatorId}</if> " +
            "<if test='subjectType != null and subjectType != \"\"'>AND s.subject_type = #{subjectType}</if> " +
            "<if test='dateFrom != null and dateFrom != \"\"'>AND a.created_at &gt;= #{dateFrom}</if> " +
            "<if test='dateTo != null and dateTo != \"\"'>AND a.created_at &lt; #{dateTo}</if> " +
            "<if test='keyword != null and keyword != \"\"'>AND (" +
            "f.field_code LIKE CONCAT('%', #{keyword}, '%') OR " +
            "f.name_cn LIKE CONCAT('%', #{keyword}, '%') OR " +
            "s.subject_code LIKE CONCAT('%', #{keyword}, '%') OR " +
            "a.operator_id LIKE CONCAT('%', #{keyword}, '%') OR " +
            "fm.name LIKE CONCAT('%', #{keyword}, '%') OR " +
            "fm.code LIKE CONCAT('%', #{keyword}, '%') OR " +
            "CAST(a.record_id AS CHAR) LIKE CONCAT('%', #{keyword}, '%'))</if> " +
            "ORDER BY a.id DESC LIMIT #{limit} OFFSET #{offset}</script>")
    List<CrfDataAuditLog> listFiltered(@Param("formId") Long formId,
                                       @Param("formKey") String formKey,
                                       @Param("keyword") String keyword,
                                       @Param("changeType") String changeType,
                                       @Param("operatorId") String operatorId,
                                       @Param("subjectType") String subjectType,
                                       @Param("dateFrom") String dateFrom,
                                       @Param("dateTo") String dateTo,
                                       @Param("offset") int offset,
                                       @Param("limit") int limit);

    @Select("<script>SELECT COUNT(1) FROM crf_data_audit_log a " +
            "LEFT JOIN crf_field f ON f.id = a.field_id " +
            "LEFT JOIN crf_record r ON r.id = a.record_id " +
            "LEFT JOIN crf_subject s ON s.id = r.subject_id " +
            "LEFT JOIN crf_form fm ON fm.id = r.form_id " +
            "WHERE 1=1 " +
            "<if test='formId != null'>AND r.form_id = #{formId}</if> " +
            "<if test='formKey != null and formKey != \"\"'>AND fm.code = #{formKey}</if> " +
            "<if test='changeType != null and changeType != \"\"'>AND a.change_type = #{changeType}</if> " +
            "<if test='operatorId != null and operatorId != \"\"'>AND a.operator_id = #{operatorId}</if> " +
            "<if test='subjectType != null and subjectType != \"\"'>AND s.subject_type = #{subjectType}</if> " +
            "<if test='dateFrom != null and dateFrom != \"\"'>AND a.created_at &gt;= #{dateFrom}</if> " +
            "<if test='dateTo != null and dateTo != \"\"'>AND a.created_at &lt; #{dateTo}</if> " +
            "<if test='keyword != null and keyword != \"\"'>AND (" +
            "f.field_code LIKE CONCAT('%', #{keyword}, '%') OR " +
            "f.name_cn LIKE CONCAT('%', #{keyword}, '%') OR " +
            "s.subject_code LIKE CONCAT('%', #{keyword}, '%') OR " +
            "a.operator_id LIKE CONCAT('%', #{keyword}, '%') OR " +
            "fm.name LIKE CONCAT('%', #{keyword}, '%') OR " +
            "fm.code LIKE CONCAT('%', #{keyword}, '%') OR " +
            "CAST(a.record_id AS CHAR) LIKE CONCAT('%', #{keyword}, '%'))</if></script>")
    long countFiltered(@Param("formId") Long formId,
                       @Param("formKey") String formKey,
                       @Param("keyword") String keyword,
                       @Param("changeType") String changeType,
                       @Param("operatorId") String operatorId,
                       @Param("subjectType") String subjectType,
                       @Param("dateFrom") String dateFrom,
                       @Param("dateTo") String dateTo);

    @Select("SELECT r.form_id AS formId, fm.code AS formKey, fm.name AS formTitle, COUNT(*) AS cnt " +
            "FROM crf_data_audit_log a " +
            "INNER JOIN crf_record r ON r.id = a.record_id " +
            "INNER JOIN crf_form fm ON fm.id = r.form_id " +
            "GROUP BY r.form_id, fm.code, fm.name ORDER BY fm.name")
    List<java.util.Map<String, Object>> countByForm();
}
