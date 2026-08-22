package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfAdverseEvent;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_adverse_event` mapper. */
@Mapper
public interface CrfAdverseEventMapper {

    @Insert("INSERT INTO crf_adverse_event (ae_code, tx_id, ae_type, ae_grade, rejection_ref, biopsy_sample_id, intervention, ae_outcome, status) VALUES (#{aeCode}, #{txId}, #{aeType}, #{aeGrade}, #{rejectionRef}, #{biopsySampleId}, #{intervention}, #{aeOutcome}, #{status})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfAdverseEvent row);

    @Select("SELECT * FROM crf_adverse_event WHERE id = #{id}")
    CrfAdverseEvent findById(Long id);

    @Select("SELECT * FROM crf_adverse_event WHERE ae_code = #{aeCode}")
    CrfAdverseEvent findByCode(String aeCode);

    @Select("SELECT * FROM crf_adverse_event ORDER BY id DESC")
    List<CrfAdverseEvent> list();

    @Select("SELECT * FROM crf_adverse_event WHERE tx_id = #{txId} ORDER BY id DESC")
    List<CrfAdverseEvent> listByTxId(Long txId);
}
