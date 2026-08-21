package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfReferenceRange;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 分层参考范围 mapper。 */
@Mapper
public interface CrfReferenceRangeMapper {

    @Insert("INSERT INTO crf_reference_range (field_id, species, sex, age_min, age_max, min, max, source, version, active) " +
            "VALUES (#{fieldId}, #{species}, #{sex}, #{ageMin}, #{ageMax}, #{min}, #{max}, #{source}, #{version}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfReferenceRange row);

    @Select("SELECT * FROM crf_reference_range WHERE id = #{id}")
    CrfReferenceRange findById(Long id);

    @Select("SELECT * FROM crf_reference_range WHERE field_id = #{fieldId} AND active = 1")
    List<CrfReferenceRange> listByFieldId(Long fieldId);
}
