package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfSection;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 子模块 mapper。 */
@Mapper
public interface CrfSectionMapper {

    @Insert("INSERT INTO crf_section (form_id, code, name, sort_order, description) " +
            "VALUES (#{formId}, #{code}, #{name}, #{sortOrder}, #{description})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfSection row);

    @Select("SELECT * FROM crf_section WHERE id = #{id}")
    CrfSection findById(Long id);

    @Select("SELECT * FROM crf_section WHERE form_id = #{formId} ORDER BY sort_order, id")
    List<CrfSection> listByFormId(Long formId);

    @Delete("DELETE FROM crf_section WHERE form_id = #{formId}")
    int deleteByFormId(Long formId);
}
