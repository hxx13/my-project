package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfSampleCocEvent;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_sample_coc_event` mapper. */
@Mapper
public interface CrfSampleCocEventMapper {

    @Insert("INSERT INTO crf_sample_coc_event (sample_id, handler, event_time, temperature, note) VALUES (#{sampleId}, #{handler}, #{eventTime}, #{temperature}, #{note})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfSampleCocEvent row);

    @Select("SELECT * FROM crf_sample_coc_event WHERE id = #{id}")
    CrfSampleCocEvent findById(Long id);

    @Select("SELECT * FROM crf_sample_coc_event ORDER BY id DESC")
    List<CrfSampleCocEvent> list();
}
