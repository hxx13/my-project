package com.example.demo.modules.reportform.mapper;

import com.example.demo.modules.reportform.entity.ReportFormSubmissionLog;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ReportFormSubmissionLogMapper {

    @Select("SELECT * FROM report_form_submission_log WHERE id = #{id}")
    ReportFormSubmissionLog selectById(Long id);

    @Select("SELECT * FROM report_form_submission_log WHERE submission_id = #{submissionId} ORDER BY created_at DESC")
    List<ReportFormSubmissionLog> selectBySubmissionId(Long submissionId);

    @Insert("INSERT INTO report_form_submission_log (submission_id, user_id, action, field_values_snapshot_json) " +
            "VALUES (#{submissionId}, #{userId}, #{action}, #{fieldValuesSnapshotJson})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(ReportFormSubmissionLog entity);
}
