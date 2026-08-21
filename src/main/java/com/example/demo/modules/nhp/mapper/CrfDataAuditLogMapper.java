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
}
