package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfPublicCase;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP `crf_public_case` mapper. */
@Mapper
public interface CrfPublicCaseMapper {

    @Insert("INSERT INTO crf_public_case (pubcase_code, source_ref, species, organ, summary, import_batch_id, active) VALUES (#{pubcaseCode}, #{sourceRef}, #{species}, #{organ}, #{summary}, #{importBatchId}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfPublicCase row);

    @Select("SELECT * FROM crf_public_case WHERE id = #{id}")
    CrfPublicCase findById(Long id);

    @Select("SELECT * FROM crf_public_case WHERE pubcase_code = #{pubcaseCode}")
    CrfPublicCase findByCode(String pubcaseCode);

    @Select("SELECT * FROM crf_public_case ORDER BY id DESC")
    List<CrfPublicCase> list();
}
