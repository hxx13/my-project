package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.HealthSurveyResponse;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface HealthSurveyResponseMapper {

    @Select("""
            SELECT person_id AS personId, data_json AS dataJson,
                   submitted_at AS submittedAt, updated_at AS updatedAt
            FROM health_survey_response WHERE person_id = #{personId}
            """)
    HealthSurveyResponse findByPersonId(@Param("personId") String personId);

    /** 按该人的全部可能键查询（人员主键 + 两个账号 id），兼容历史按账号 id 存的数据。 */
    @Select("""
            <script>
            SELECT person_id AS personId, data_json AS dataJson,
                   submitted_at AS submittedAt, updated_at AS updatedAt
            FROM health_survey_response
            WHERE person_id IN
            <foreach collection="keys" item="k" open="(" separator="," close=")">#{k}</foreach>
            ORDER BY updated_at DESC LIMIT 1
            </script>
            """)
    HealthSurveyResponse findByPersonKeys(@Param("keys") List<String> keys);

    @Insert("""
            INSERT INTO health_survey_response (person_id, data_json, submitted_at)
            VALUES (#{personId}, #{dataJson}, NOW())
            ON DUPLICATE KEY UPDATE data_json = #{dataJson}, submitted_at = NOW()
            """)
    int upsert(HealthSurveyResponse row);
}
