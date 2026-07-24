package com.example.demo.modules.aro.mapper;

import com.example.demo.modules.aro.entity.AroTrainingSession;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface AroTrainingSessionMapper {

    @Insert("REPLACE INTO aro_training_session (id, title, test_content, address, start_time, end_time, sign_number, examiner_name, examiner_number, exam_cert_type, exam_state, state, cached_at) " +
            "VALUES (#{id}, #{title}, #{testContent}, #{address}, #{startTime}, #{endTime}, #{signNumber}, #{examinerName}, #{examinerNumber}, #{examCertType}, #{examState}, #{state}, NOW())")
    void upsert(AroTrainingSession s);

    @Select("SELECT * FROM aro_training_session ORDER BY start_time DESC")
    List<AroTrainingSession> selectAll();

    @Select("SELECT * FROM aro_training_session WHERE id = #{id}")
    AroTrainingSession selectById(Long id);

    @Delete("DELETE FROM aro_training_session")
    void deleteAll();
}
