package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfConcept;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 概念/指标库 mapper。 */
@Mapper
public interface CrfConceptMapper {

    @Insert("INSERT INTO crf_concept (concept_code, name_cn, name_en, data_type, unit, codelist_id, active) " +
            "VALUES (#{conceptCode}, #{nameCn}, #{nameEn}, #{dataType}, #{unit}, #{codelistId}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfConcept row);

    @Select("SELECT * FROM crf_concept WHERE concept_code = #{conceptCode} AND active = 1 LIMIT 1")
    CrfConcept findByCode(String conceptCode);

    @Select("SELECT * FROM crf_concept WHERE active = 1 ORDER BY concept_code")
    List<CrfConcept> list();

    @Update("UPDATE crf_concept SET name_cn = #{nameCn}, name_en = #{nameEn}, data_type = #{dataType}, " +
            "unit = #{unit}, codelist_id = #{codelistId} WHERE id = #{id}")
    int update(CrfConcept row);
}
