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

    @Update("UPDATE aro_training_trainee SET test_yn = #{testYn}, reviewed_at = NOW() WHERE exam_sign_id = #{examSignId}")
    int updateTestYn(@Param("examSignId") Long examSignId, @Param("testYn") Integer testYn);

    @Update("UPDATE aro_training_trainee SET test_fraction = #{testFraction}, scored_at = NOW() WHERE exam_sign_id = #{examSignId}")
    int updateTestFraction(@Param("examSignId") Long examSignId, @Param("testFraction") Integer testFraction);

    @Update("UPDATE aro_training_trainee SET room_ids_json = #{roomIdsJson}, rooms_json = #{roomsJson} WHERE user_id = #{userId}")
    int updateRooms(@Param("userId") String userId, @Param("roomIdsJson") String roomIdsJson, @Param("roomsJson") String roomsJson);

    @Select("SELECT * FROM aro_training_trainee WHERE exam_sign_id = #{examSignId} LIMIT 1")
    AroTrainingTrainee selectByExamSignId(@Param("examSignId") Long examSignId);

    /** 关联 session 表，返回所有有待审核学员的场次 ID */
    @Select("SELECT t.session_id FROM aro_training_trainee t " +
            "INNER JOIN aro_training_session s ON t.session_id = s.id " +
            "WHERE t.test_yn IS NULL OR t.test_yn = 0 " +
            "GROUP BY t.session_id, s.start_time " +
            "ORDER BY s.start_time DESC")
    List<Long> selectPendingSessionIds();
}
