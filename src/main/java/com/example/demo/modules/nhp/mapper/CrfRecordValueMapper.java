package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfRecordValue;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 字段值（EAV）mapper。 */
@Mapper
public interface CrfRecordValueMapper {

    @Insert("INSERT INTO crf_record_value (record_id, field_id, field_version_id, value_string, value_text, " +
            "value_int, value_decimal, value_date, value_datetime, value_bool, codelist_item_id, value_file_id, " +
            "value_json, entry_mode, entry_pass, source_ref, collected_at, created_by) " +
            "VALUES (#{recordId}, #{fieldId}, #{fieldVersionId}, #{valueString}, #{valueText}, " +
            "#{valueInt}, #{valueDecimal}, #{valueDate}, #{valueDatetime}, #{valueBool}, #{codelistItemId}, #{valueFileId}, " +
            "#{valueJson}, #{entryMode}, #{entryPass}, #{sourceRef}, #{collectedAt}, #{createdBy})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfRecordValue row);

    @Select("SELECT * FROM crf_record_value WHERE id = #{id}")
    CrfRecordValue findById(Long id);

    @Select("SELECT * FROM crf_record_value WHERE record_id = #{recordId} " +
            "AND (entry_pass IS NULL OR entry_pass = 1) ORDER BY id")
    List<CrfRecordValue> listByRecordId(Long recordId);

    @Select("SELECT * FROM crf_record_value WHERE record_id = #{recordId} AND entry_pass = #{entryPass} ORDER BY id")
    List<CrfRecordValue> listByRecordIdAndPass(@Param("recordId") Long recordId, @Param("entryPass") int entryPass);

    @Select("SELECT * FROM crf_record_value WHERE record_id = #{recordId} AND field_id = #{fieldId} " +
            "AND (entry_pass IS NULL OR entry_pass = 1) ORDER BY id LIMIT 1")
    CrfRecordValue findByRecordAndField(@Param("recordId") Long recordId, @Param("fieldId") Long fieldId);

    @Select("SELECT * FROM crf_record_value WHERE record_id = #{recordId} AND field_id = #{fieldId} " +
            "AND entry_pass = #{entryPass} ORDER BY id LIMIT 1")
    CrfRecordValue findByRecordFieldPass(@Param("recordId") Long recordId,
                                         @Param("fieldId") Long fieldId,
                                         @Param("entryPass") int entryPass);

    @Update("UPDATE crf_record_value SET value_string = #{valueString}, value_text = #{valueText}, " +
            "value_int = #{valueInt}, value_decimal = #{valueDecimal}, value_date = #{valueDate}, " +
            "value_datetime = #{valueDatetime}, value_bool = #{valueBool}, codelist_item_id = #{codelistItemId}, " +
            "value_file_id = #{valueFileId}, value_json = #{valueJson}, entry_mode = #{entryMode}, " +
            "entry_pass = #{entryPass}, source_ref = #{sourceRef}, collected_at = #{collectedAt}, " +
            "updated_by = #{updatedBy} WHERE id = #{id}")
    int update(CrfRecordValue row);

    @Delete("DELETE FROM crf_record_value WHERE record_id = #{recordId}")
    int deleteByRecordId(Long recordId);

    @Delete("DELETE FROM crf_record_value WHERE record_id = #{recordId} AND entry_pass = #{entryPass}")
    int deleteByRecordIdAndPass(@Param("recordId") Long recordId, @Param("entryPass") int entryPass);

    /**
     * 活跃填写实例中该字段的取值条数（软删实例 status=DELETED 不计入占用）。
     */
    @Select("SELECT COUNT(1) FROM crf_record_value v "
            + "INNER JOIN crf_record r ON r.id = v.record_id "
            + "WHERE v.field_id = #{fieldId} AND r.status <> 'DELETED'")
    long countActiveByFieldId(@Param("fieldId") Long fieldId);
}
