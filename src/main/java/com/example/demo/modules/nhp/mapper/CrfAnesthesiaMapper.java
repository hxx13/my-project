package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfAnesthesia;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_anesthesia` mapper. */
@Mapper
public interface CrfAnesthesiaMapper {

    @Insert("INSERT INTO crf_anesthesia (anes_code, tx_id, anes_method, depth_monitor, ebl, fluid_total, urine_output, status) VALUES (#{anesCode}, #{txId}, #{anesMethod}, #{depthMonitor}, #{ebl}, #{fluidTotal}, #{urineOutput}, #{status})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfAnesthesia row);

    @Select("SELECT * FROM crf_anesthesia WHERE id = #{id}")
    CrfAnesthesia findById(Long id);

    @Select("SELECT * FROM crf_anesthesia WHERE anes_code = #{anesCode}")
    CrfAnesthesia findByCode(String anesCode);

    @Select("SELECT * FROM crf_anesthesia ORDER BY id DESC")
    List<CrfAnesthesia> list();
}
