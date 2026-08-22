package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfFollowup;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_followup` mapper. */
@Mapper
public interface CrfFollowupMapper {

    @Insert("INSERT INTO crf_followup (fu_code, tx_id, timepoint_code, visit_instance_id, clinical_score, regimen_change, status) VALUES (#{fuCode}, #{txId}, #{timepointCode}, #{visitInstanceId}, #{clinicalScore}, #{regimenChange}, #{status})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfFollowup row);

    @Select("SELECT * FROM crf_followup WHERE id = #{id}")
    CrfFollowup findById(Long id);

    @Select("SELECT * FROM crf_followup WHERE fu_code = #{fuCode}")
    CrfFollowup findByCode(String fuCode);

    @Select("SELECT * FROM crf_followup ORDER BY id DESC")
    List<CrfFollowup> list();
}
