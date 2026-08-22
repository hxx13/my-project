package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfDonorGenedit;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_donor_genedit` mapper. */
@Mapper
public interface CrfDonorGeneditMapper {

    @Insert("INSERT INTO crf_donor_genedit (donor_subject_id, edit_combo_code, ko_loci, ki_loci, edit_verify_status, offtarget_result, transgene_copy_num, generation) VALUES (#{donorSubjectId}, #{editComboCode}, #{koLoci}, #{kiLoci}, #{editVerifyStatus}, #{offtargetResult}, #{transgeneCopyNum}, #{generation})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfDonorGenedit row);

    @Select("SELECT * FROM crf_donor_genedit WHERE id = #{id}")
    CrfDonorGenedit findById(Long id);

    @Select("SELECT * FROM crf_donor_genedit ORDER BY id DESC")
    List<CrfDonorGenedit> list();
}
