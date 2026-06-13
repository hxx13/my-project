package com.example.demo.modules.reportform.mapper;

import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ReportFormSubmissionMapper {

    @Select("SELECT * FROM report_form_submission WHERE id = #{id}")
    ReportFormSubmission selectById(Long id);

    @Select("SELECT * FROM report_form_submission WHERE form_id = #{formId} AND user_id = #{userId}")
    ReportFormSubmission selectByFormAndUser(@Param("formId") Long formId, @Param("userId") Long userId);

    @Select("SELECT * FROM report_form_submission WHERE form_id = #{formId}")
    List<ReportFormSubmission> selectByFormId(Long formId);

    @Insert("INSERT INTO report_form_submission (form_id, user_id, status, field_values_json, version) " +
            "VALUES (#{formId}, #{userId}, #{status}, #{fieldValuesJson}, #{version})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ReportFormSubmission entity);

    @Update("UPDATE report_form_submission SET field_values_json=#{fieldValuesJson}, " +
            "version=version+1, status=#{status}, updated_at=NOW() " +
            "WHERE id=#{id} AND version=#{version}")
    int updateWithVersion(ReportFormSubmission entity);

    @Update("UPDATE report_form_submission SET status='submitted', submitted_at=NOW(), " +
            "updated_at=NOW() WHERE id=#{id}")
    int submit(Long id);
}
