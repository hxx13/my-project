package com.example.demo.modules.reportform.mapper;

import com.example.demo.modules.reportform.entity.ReportFormSubmission;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ReportFormSubmissionMapper {

    @Select("SELECT * FROM report_form_submission WHERE id = #{id}")
    ReportFormSubmission selectById(Long id);

    /** 个人单份模式默认记录（instance_label 为空） */
    @Select("SELECT * FROM report_form_submission WHERE form_id = #{formId} AND user_id = #{userId} AND instance_label = '' LIMIT 1")
    ReportFormSubmission selectDefaultByFormAndUser(@Param("formId") Long formId, @Param("userId") Long userId);

    @Select("SELECT * FROM report_form_submission WHERE form_id = #{formId} AND user_id = #{userId} AND instance_label = #{instanceLabel} LIMIT 1")
    ReportFormSubmission selectByFormUserAndLabel(@Param("formId") Long formId, @Param("userId") Long userId,
                                                  @Param("instanceLabel") String instanceLabel);

    @Select("SELECT * FROM report_form_submission WHERE form_id = #{formId} AND user_id = #{userId} ORDER BY updated_at DESC, id DESC")
    List<ReportFormSubmission> selectByFormAndUserId(@Param("formId") Long formId, @Param("userId") Long userId);

    @Select("SELECT COUNT(*) FROM report_form_submission WHERE form_id = #{formId} AND user_id = #{userId}")
    int countByFormAndUserId(@Param("formId") Long formId, @Param("userId") Long userId);

    @Select("SELECT * FROM report_form_submission WHERE form_id = #{formId} ORDER BY user_id ASC, updated_at DESC, id DESC")
    List<ReportFormSubmission> selectByFormId(Long formId);

    @Insert("INSERT INTO report_form_submission (form_id, user_id, instance_label, status, field_values_json, version, created_at, updated_at) " +
            "VALUES (#{formId}, #{userId}, #{instanceLabel}, #{status}, #{fieldValuesJson}, #{version}, #{createdAt}, #{updatedAt})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ReportFormSubmission entity);

    @Update("UPDATE report_form_submission SET field_values_json=#{fieldValuesJson}, " +
            "version=version+1, status=#{status}, updated_at=#{updatedAt} " +
            "WHERE id=#{id} AND version=#{version}")
    int updateWithVersion(ReportFormSubmission entity);

    @Update("UPDATE report_form_submission SET status='submitted', submitted_at=#{submittedAt}, " +
            "updated_at=#{updatedAt} WHERE id=#{id}")
    int submit(@Param("id") Long id,
               @Param("submittedAt") java.time.LocalDateTime submittedAt,
               @Param("updatedAt") java.time.LocalDateTime updatedAt);

    @Select("SELECT COUNT(*) FROM report_form_submission WHERE form_id = #{formId}")
    int countByFormId(Long formId);

    @Select("SELECT COUNT(DISTINCT user_id) FROM report_form_submission WHERE form_id = #{formId} AND user_id > 0")
    int countDistinctFillersByFormId(Long formId);

    @Delete("DELETE FROM report_form_submission WHERE id = #{id}")
    int deleteById(Long id);
}
