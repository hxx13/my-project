package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfFormField;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 表单-字段引用 mapper。 */
@Mapper
public interface CrfFormFieldMapper {

    @Insert("INSERT INTO crf_form_field (form_id, field_id, role, fk_target, position, required_override, logic_ref) " +
            "VALUES (#{formId}, #{fieldId}, #{role}, #{fkTarget}, #{position}, #{requiredOverride}, #{logicRef})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfFormField row);

    @Select("SELECT * FROM crf_form_field WHERE id = #{id}")
    CrfFormField findById(Long id);

    @Select("SELECT * FROM crf_form_field WHERE form_id = #{formId} ORDER BY position, id")
    List<CrfFormField> listByFormId(Long formId);

    @Select("SELECT * FROM crf_form_field WHERE field_id = #{fieldId}")
    List<CrfFormField> listByFieldId(Long fieldId);

    @Delete("DELETE FROM crf_form_field WHERE form_id = #{formId}")
    int deleteByFormId(Long formId);

    @Update("UPDATE crf_form_field SET role = #{role} WHERE id = #{id}")
    int updateRole(@Param("id") Long id, @Param("role") String role);
}
