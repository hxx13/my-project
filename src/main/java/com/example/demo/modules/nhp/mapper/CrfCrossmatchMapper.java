package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfCrossmatch;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_crossmatch` mapper. */
@Mapper
public interface CrfCrossmatchMapper {

    @Insert("INSERT INTO crf_crossmatch (xm_code, donor_subject_id, recipient_subject_id, cdc_xm_result, flow_xm_result, adcc_result, pairing_score, pairing_decision, decision_rationale, status, active) VALUES (#{xmCode}, #{donorSubjectId}, #{recipientSubjectId}, #{cdcXmResult}, #{flowXmResult}, #{adccResult}, #{pairingScore}, #{pairingDecision}, #{decisionRationale}, #{status}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfCrossmatch row);

    @Select("SELECT * FROM crf_crossmatch WHERE id = #{id}")
    CrfCrossmatch findById(Long id);

    @Select("SELECT * FROM crf_crossmatch WHERE xm_code = #{xmCode}")
    CrfCrossmatch findByCode(String xmCode);

    @Select("SELECT * FROM crf_crossmatch ORDER BY id DESC")
    List<CrfCrossmatch> list();
}
