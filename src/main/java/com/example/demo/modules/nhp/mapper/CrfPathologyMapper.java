package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfPathology;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_pathology` mapper. */
@Mapper
public interface CrfPathologyMapper {

    @Insert("INSERT INTO crf_pathology (path_code, tx_id, sample_id, sampling_type, organ_code, timepoint_code, he_findings, rej_grade, micro_thrombosis, em_result, path_dx, report_date, status) VALUES (#{pathCode}, #{txId}, #{sampleId}, #{samplingType}, #{organCode}, #{timepointCode}, #{heFindings}, #{rejGrade}, #{microThrombosis}, #{emResult}, #{pathDx}, #{reportDate}, #{status})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfPathology row);

    @Select("SELECT * FROM crf_pathology WHERE id = #{id}")
    CrfPathology findById(Long id);

    @Select("SELECT * FROM crf_pathology WHERE path_code = #{pathCode}")
    CrfPathology findByCode(String pathCode);

    @Select("SELECT * FROM crf_pathology ORDER BY id DESC")
    List<CrfPathology> list();
}
