package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfTemplateSection;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 表单模板章节 mapper。 */
@Mapper
public interface CrfTemplateSectionMapper {

    @Insert("INSERT INTO crf_template_section (form_id, parent_id, code, label, sort_order, subdivisible, show_when, description) " +
            "VALUES (#{formId}, #{parentId}, #{code}, #{label}, #{sortOrder}, #{subdivisible}, #{showWhen}, #{description})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfTemplateSection row);

    @Select("SELECT * FROM crf_template_section WHERE form_id = #{formId} ORDER BY sort_order, id")
    List<CrfTemplateSection> listByFormId(Long formId);

    @Update("UPDATE crf_template_section SET label = #{label} WHERE id = #{id}")
    int updateLabel(@Param("id") Long id, @Param("label") String label);

    @Delete("DELETE FROM crf_template_section WHERE form_id = #{formId}")
    int deleteByFormId(Long formId);
}
