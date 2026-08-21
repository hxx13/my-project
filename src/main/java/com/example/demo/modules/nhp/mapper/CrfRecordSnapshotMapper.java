package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfRecordSnapshot;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP CRF 快照 mapper（只 insert/select，禁 update/delete）。 */
@Mapper
public interface CrfRecordSnapshotMapper {

    @Insert("INSERT INTO crf_record_snapshot (record_id, version_no, stage, biz_stage, data_json, form_id, note, created_by) " +
            "VALUES (#{recordId}, #{versionNo}, #{stage}, #{bizStage}, #{dataJson}, #{formId}, #{note}, #{createdBy})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfRecordSnapshot row);

    @Select("SELECT * FROM crf_record_snapshot WHERE id = #{id} AND record_id = #{recordId}")
    CrfRecordSnapshot findByIdAndRecordId(@Param("id") Long id, @Param("recordId") Long recordId);

    @Select("SELECT id, record_id, version_no, stage, biz_stage, form_id, note, created_by, created_at " +
            "FROM crf_record_snapshot WHERE record_id = #{recordId} ORDER BY version_no DESC")
    List<CrfRecordSnapshot> listLightByRecordId(Long recordId);

    @Select("SELECT COALESCE(MAX(version_no), 0) FROM crf_record_snapshot WHERE record_id = #{recordId}")
    Integer selectMaxVersionNo(Long recordId);

    @Select("SELECT COUNT(*) FROM crf_record_snapshot WHERE record_id = #{recordId}")
    int countByRecordId(Long recordId);
}
