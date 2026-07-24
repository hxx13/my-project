package com.example.demo.modules.aro.mapper;

import com.example.demo.modules.aro.entity.AroTrainingTrainee;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface AroTrainingTraineeMapper {

    @Insert("INSERT INTO aro_training_trainee (session_id, exam_sign_id, name, job_number, mobile_phone, project_group, test_yn, test_fraction, user_id, room_ids_json, rooms_json, cached_at) " +
            "VALUES (#{sessionId}, #{examSignId}, #{name}, #{jobNumber}, #{mobilePhone}, #{projectGroup}, #{testYn}, #{testFraction}, #{userId}, #{roomIdsJson}, #{roomsJson}, NOW())")
    void insert(AroTrainingTrainee t);

    @Select("SELECT * FROM aro_training_trainee WHERE session_id = #{sessionId} ORDER BY test_yn ASC, test_fraction ASC")
    List<AroTrainingTrainee> selectBySessionId(Long sessionId);

    @Select("SELECT COUNT(*) FROM aro_training_trainee WHERE session_id = #{sessionId}")
    int countBySessionId(Long sessionId);

    @Select("SELECT COUNT(*) FROM aro_training_trainee WHERE session_id = #{sessionId} AND test_yn = 1 AND test_fraction = 1")
    int countQualified(Long sessionId);

    @Delete("DELETE FROM aro_training_trainee WHERE session_id = #{sessionId}")
    void deleteBySessionId(Long sessionId);

    @Select("SELECT DISTINCT rooms_json FROM aro_training_trainee WHERE rooms_json IS NOT NULL AND rooms_json != '' AND rooms_json != '[]' LIMIT 5000")
    List<String> selectDistinctRoomsJson();

    @Delete("DELETE FROM aro_training_trainee")
    void deleteAll();
}
