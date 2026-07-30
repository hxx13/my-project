package com.example.demo.modules.aro.mapper;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface AroTrainingFavoriteMapper {

    @Insert("INSERT INTO aro_training_favorite (user_id, session_id, created_at) VALUES (#{userId}, #{sessionId}, NOW())")
    void insert(@Param("userId") String userId, @Param("sessionId") String sessionId);

    @Delete("DELETE FROM aro_training_favorite WHERE user_id = #{userId} AND session_id = #{sessionId}")
    int deleteByUserAndSession(@Param("userId") String userId, @Param("sessionId") String sessionId);

    @Select("SELECT session_id FROM aro_training_favorite WHERE user_id = #{userId} ORDER BY created_at DESC")
    List<String> findByUserId(@Param("userId") String userId);

    @Select("SELECT user_id FROM aro_training_favorite WHERE session_id = #{sessionId}")
    List<String> findSubscribersBySessionId(@Param("sessionId") String sessionId);

    @Select("SELECT COUNT(*) > 0 FROM aro_training_favorite WHERE user_id = #{userId} AND session_id = #{sessionId}")
    boolean existsByUserAndSession(@Param("userId") String userId, @Param("sessionId") String sessionId);
}
