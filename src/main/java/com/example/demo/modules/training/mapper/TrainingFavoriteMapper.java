package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.TrainingFavorite;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface TrainingFavoriteMapper {

    @Insert("""
            INSERT INTO training_favorite (user_id, training_id, created_at)
            VALUES (#{userId}, #{trainingId}, NOW())
            """)
    int insert(TrainingFavorite favorite);

    @Delete("DELETE FROM training_favorite WHERE user_id = #{userId} AND training_id = #{trainingId}")
    int delete(@Param("userId") String userId, @Param("trainingId") Long trainingId);

    @Select("""
            SELECT user_id AS userId, training_id AS trainingId, created_at AS createdAt
            FROM training_favorite WHERE user_id = #{userId} ORDER BY created_at DESC
            """)
    List<TrainingFavorite> findByUserId(@Param("userId") String userId);

    @Select("SELECT training_id FROM training_favorite WHERE user_id = #{userId}")
    List<Long> listTrainingIdsByUser(@Param("userId") String userId);

    @Select("SELECT COUNT(*) FROM training_favorite WHERE user_id = #{userId} AND training_id = #{trainingId}")
    int exists(@Param("userId") String userId, @Param("trainingId") Long trainingId);
}
