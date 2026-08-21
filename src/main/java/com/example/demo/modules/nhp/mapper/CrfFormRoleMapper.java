package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfFormRole;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 表单级授权矩阵 mapper。 */
@Mapper
public interface CrfFormRoleMapper {

    @Insert("INSERT INTO crf_form_role (role_key, form_id, capability) VALUES (#{roleKey}, #{formId}, #{capability})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfFormRole row);

    @Select("SELECT * FROM crf_form_role WHERE role_key = #{roleKey}")
    List<CrfFormRole> listByRoleKey(String roleKey);

    @Select("SELECT * FROM crf_form_role WHERE form_id = #{formId} OR form_id IS NULL")
    List<CrfFormRole> listByFormId(Long formId);
}
