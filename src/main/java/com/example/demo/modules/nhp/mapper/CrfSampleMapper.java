package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfSample;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_sample` mapper. */
@Mapper
public interface CrfSampleMapper {

    @Insert("INSERT INTO crf_sample (sample_code, tx_id, donor_subject_id, recipient_subject_id, sample_type, timepoint_code, collect_datetime, storage_condition, storage_location, status, active) VALUES (#{sampleCode}, #{txId}, #{donorSubjectId}, #{recipientSubjectId}, #{sampleType}, #{timepointCode}, #{collectDatetime}, #{storageCondition}, #{storageLocation}, #{status}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfSample row);

    @Select("SELECT * FROM crf_sample WHERE id = #{id}")
    CrfSample findById(Long id);

    @Select("SELECT * FROM crf_sample WHERE sample_code = #{sampleCode}")
    CrfSample findByCode(String sampleCode);

    @Select("SELECT * FROM crf_sample ORDER BY id DESC")
    List<CrfSample> list();

    @Select("SELECT * FROM crf_sample WHERE recipient_subject_id = #{subjectId} OR donor_subject_id = #{subjectId} ORDER BY id DESC")
    List<CrfSample> listBySubjectId(Long subjectId);
}
