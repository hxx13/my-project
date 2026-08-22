package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfDonorOrgan;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_donor_organ` mapper. */
@Mapper
public interface CrfDonorOrganMapper {

    @Insert("INSERT INTO crf_donor_organ (donor_subject_id, organ_code, donor_weight, organ_histology_baseline, organ_function_grade, release_decision, release_criteria_ver) VALUES (#{donorSubjectId}, #{organCode}, #{donorWeight}, #{organHistologyBaseline}, #{organFunctionGrade}, #{releaseDecision}, #{releaseCriteriaVer})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfDonorOrgan row);

    @Select("SELECT * FROM crf_donor_organ WHERE id = #{id}")
    CrfDonorOrgan findById(Long id);

    @Select("SELECT * FROM crf_donor_organ ORDER BY id DESC")
    List<CrfDonorOrgan> list();
}
