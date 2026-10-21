package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.LearningVideoProgress;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface LearningVideoProgressMapper {

    String COLS = """
            id, person_id AS personId, video_id AS videoId,
            position_seconds AS positionSeconds, watched_seconds AS watchedSeconds,
            duration_seconds AS durationSeconds, completed,
            last_watched_at AS lastWatchedAt, created_at AS createdAt, updated_at AS updatedAt
            """;

    @Select("SELECT " + COLS + " FROM learning_video_progress WHERE person_id = #{personId} AND video_id = #{videoId}")
    LearningVideoProgress find(@Param("personId") String personId, @Param("videoId") Long videoId);

    @Select("SELECT " + COLS + " FROM learning_video_progress WHERE person_id = #{personId}")
    List<LearningVideoProgress> listByPerson(@Param("personId") String personId);

    @Insert("""
            INSERT INTO learning_video_progress
                (person_id, video_id, position_seconds, watched_seconds, duration_seconds,
                 completed, last_watched_at, created_at, updated_at)
            VALUES
                (#{personId}, #{videoId}, #{positionSeconds}, #{watchedSeconds}, #{durationSeconds},
                 #{completed}, #{lastWatchedAt}, NOW(), NOW())
            ON DUPLICATE KEY UPDATE
                position_seconds = VALUES(position_seconds),
                watched_seconds = VALUES(watched_seconds),
                duration_seconds = VALUES(duration_seconds),
                completed = VALUES(completed),
                last_watched_at = VALUES(last_watched_at),
                updated_at = NOW()
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int upsert(LearningVideoProgress progress);
}
