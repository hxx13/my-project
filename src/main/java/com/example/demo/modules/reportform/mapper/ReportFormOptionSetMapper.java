package com.example.demo.modules.reportform.mapper;

import com.example.demo.modules.reportform.entity.ReportFormOptionSet;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ReportFormOptionSetMapper {

    @Select("SELECT * FROM report_form_option_set WHERE id = #{id}")
    ReportFormOptionSet selectById(Long id);

    @Select("SELECT * FROM report_form_option_set WHERE scope = 'global' OR form_id = #{formId}")
    List<ReportFormOptionSet> selectByScope(@Param("formId") Long formId);

    @Insert("INSERT INTO report_form_option_set (name, scope, form_id, items_json) " +
            "VALUES (#{name}, #{scope}, #{formId}, #{itemsJson})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ReportFormOptionSet entity);

    @Update("UPDATE report_form_option_set SET name=#{name}, items_json=#{itemsJson} WHERE id=#{id}")
    int update(ReportFormOptionSet entity);

    @Delete("DELETE FROM report_form_option_set WHERE id=#{id}")
    int deleteById(Long id);

    @Select("SELECT COUNT(*) FROM report_form_option_set WHERE id=#{id}")
    int countById(Long id);

    @Select("SELECT COUNT(*) FROM report_form_definition WHERE " +
            "JSON_CONTAINS(layout_json, JSON_OBJECT('optionSetId', CAST(#{id} AS CHAR)), '$.fields')")
    int countFieldRefsByOptionSetId(Long id);
}
