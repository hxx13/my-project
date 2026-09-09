package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.HealthSurveyResponse;
import org.apache.ibatis.annotations.*;

@Mapper
public interface HealthSurveyResponseMapper {

    @Select("""
            SELECT person_id AS personId, data_json AS dataJson,
                   submitted_at AS submittedAt, updated_at AS updatedAt
            FROM health_survey_response WHERE person_id = #{personId}
            """)
    HealthSurveyResponse findByPersonId(@Param("personId") String personId);

    @Insert("""
            INSERT INTO health_survey_response (person_id, data_json, submitted_at)
            VALUES (#{personId}, #{dataJson}, NOW())
            ON DUPLICATE KEY UPDATE data_json = #{dataJson}, submitted_at = NOW()
            """)
    int upsert(HealthSurveyResponse row);
}
