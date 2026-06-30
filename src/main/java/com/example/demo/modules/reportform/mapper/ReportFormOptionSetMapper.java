package com.example.demo.modules.reportform.mapper;

import com.example.demo.modules.reportform.entity.ReportFormOptionSet;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ReportFormOptionSetMapper {

    @Select("SELECT * FROM report_form_option_set WHERE id = #{id}")
    ReportFormOptionSet selectById(Long id);

    /**
     * 可见范围：同账号体系的共享预设、本人个人预设、当前表单私有预设。
     */
    @Select("""
            SELECT * FROM report_form_option_set
            WHERE (scope = 'global' AND (auth_profile IS NULL OR auth_profile = #{authProfile}))
               OR (scope = 'user' AND created_by = #{username})
               OR (scope = 'form' AND #{formId} IS NOT NULL AND form_id = #{formId})
            ORDER BY scope, name
            """)
    List<ReportFormOptionSet> selectVisible(@Param("username") String username,
                                            @Param("authProfile") String authProfile,
                                            @Param("formId") Long formId);

    @Insert("""
            INSERT INTO report_form_option_set
            (name, scope, form_id, items_json, created_by, auth_profile, created_at, updated_at)
            VALUES (#{name}, #{scope}, #{formId}, #{itemsJson}, #{createdBy}, #{authProfile}, #{createdAt}, #{updatedAt})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ReportFormOptionSet entity);

    @Update("UPDATE report_form_option_set SET name=#{name}, items_json=#{itemsJson}, updated_at=#{updatedAt} WHERE id=#{id}")
    int update(ReportFormOptionSet entity);

    @Delete("DELETE FROM report_form_option_set WHERE id=#{id}")
    int deleteById(Long id);

    @Select("SELECT COUNT(*) FROM report_form_option_set WHERE id=#{id}")
    int countById(Long id);

    @Select("SELECT COUNT(*) FROM report_form_definition WHERE " +
            "JSON_CONTAINS(layout_json, JSON_OBJECT('optionSetId', CAST(#{id} AS CHAR)), '$.fields')")
    int countFieldRefsByOptionSetId(Long id);
}
