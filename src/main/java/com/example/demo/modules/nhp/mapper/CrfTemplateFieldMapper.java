package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfTemplateField;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 表单模板字段 mapper。 */
@Mapper
public interface CrfTemplateFieldMapper {

    @Insert("INSERT INTO crf_template_field (form_id, section_id, field_key, data_type, label, description, type, " +
            "options, dict_key, role, role_meta, required, show_when, sort_order, config) " +
            "VALUES (#{formId}, #{sectionId}, #{fieldKey}, #{dataType}, #{label}, #{description}, #{type}, " +
            "#{options}, #{dictKey}, #{role}, #{roleMeta}, #{required}, #{showWhen}, #{sortOrder}, #{config})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfTemplateField row);

    @Select("SELECT * FROM crf_template_field WHERE form_id = #{formId} ORDER BY sort_order, id")
    List<CrfTemplateField> listByFormId(Long formId);

    @Select("SELECT * FROM crf_template_field WHERE field_key = #{fieldKey}")
    List<CrfTemplateField> listByFieldKey(String fieldKey);

    @Delete("DELETE FROM crf_template_field WHERE form_id = #{formId}")
    int deleteByFormId(Long formId);
}
