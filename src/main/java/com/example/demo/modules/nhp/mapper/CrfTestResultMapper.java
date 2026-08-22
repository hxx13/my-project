package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfTestResult;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_test_result` mapper. */
@Mapper
public interface CrfTestResultMapper {

    @Insert("INSERT INTO crf_test_result (result_code, test_order_id, assay_code, concept_code, value_string, value_decimal, value_text, qc_status) VALUES (#{resultCode}, #{testOrderId}, #{assayCode}, #{conceptCode}, #{valueString}, #{valueDecimal}, #{valueText}, #{qcStatus})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfTestResult row);

    @Select("SELECT * FROM crf_test_result WHERE id = #{id}")
    CrfTestResult findById(Long id);

    @Select("SELECT * FROM crf_test_result WHERE result_code = #{resultCode}")
    CrfTestResult findByCode(String resultCode);

    @Select("SELECT * FROM crf_test_result ORDER BY id DESC")
    List<CrfTestResult> list();
}
