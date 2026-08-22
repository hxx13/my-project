package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfTransfusion;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_transfusion` mapper. */
@Mapper
public interface CrfTransfusionMapper {

    @Insert("INSERT INTO crf_transfusion (anesthesia_id, component, volume_ml) VALUES (#{anesthesiaId}, #{component}, #{volumeMl})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfTransfusion row);

    @Select("SELECT * FROM crf_transfusion WHERE id = #{id}")
    CrfTransfusion findById(Long id);

    @Select("SELECT * FROM crf_transfusion ORDER BY id DESC")
    List<CrfTransfusion> list();
}
