package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfTestOrder;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_test_order` mapper. */
@Mapper
public interface CrfTestOrderMapper {

    @Insert("INSERT INTO crf_test_order (test_code, lab_id, panel_version, test_items, tat_hours, status, sample_id) VALUES (#{testCode}, #{labId}, #{panelVersion}, #{testItems}, #{tatHours}, #{status}, #{sampleId})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfTestOrder row);

    @Select("SELECT * FROM crf_test_order WHERE id = #{id}")
    CrfTestOrder findById(Long id);

    @Select("SELECT * FROM crf_test_order WHERE test_code = #{testCode}")
    CrfTestOrder findByCode(String testCode);

    @Select("SELECT * FROM crf_test_order ORDER BY id DESC")
    List<CrfTestOrder> list();
}
