package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfPerfusion;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_perfusion` mapper. */
@Mapper
public interface CrfPerfusionMapper {

    @Insert("INSERT INTO crf_perfusion (perf_code, donor_subject_id, recipient_subject_id, perf_mode, perfusate, perf_start, perf_duration, liver_cold_ischemia, vasc_resistance, status) VALUES (#{perfCode}, #{donorSubjectId}, #{recipientSubjectId}, #{perfMode}, #{perfusate}, #{perfStart}, #{perfDuration}, #{liverColdIschemia}, #{vascResistance}, #{status})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfPerfusion row);

    @Select("SELECT * FROM crf_perfusion WHERE id = #{id}")
    CrfPerfusion findById(Long id);

    @Select("SELECT * FROM crf_perfusion WHERE perf_code = #{perfCode}")
    CrfPerfusion findByCode(String perfCode);

    @Select("SELECT * FROM crf_perfusion ORDER BY id DESC")
    List<CrfPerfusion> list();
}
