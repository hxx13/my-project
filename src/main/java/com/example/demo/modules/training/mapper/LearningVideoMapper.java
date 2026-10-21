package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.LearningVideo;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface LearningVideoMapper {

    String COLS = """
            id, title, file_url AS fileUrl, file_record_id AS fileRecordId,
            duration_seconds AS durationSeconds, size_bytes AS sizeBytes,
            allow_seek AS allowSeek, remember_position AS rememberPosition,
            require_full_watch AS requireFullWatch, complete_threshold AS completeThreshold,
            active, sort_order AS sortOrder, created_by AS createdBy,
            created_at AS createdAt, updated_at AS updatedAt
            """;

    @Select("SELECT " + COLS + " FROM learning_video ORDER BY sort_order, id DESC")
    List<LearningVideo> listAll();

    @Select("SELECT " + COLS + " FROM learning_video WHERE active = 1 ORDER BY sort_order, id DESC")
    List<LearningVideo> listActive();

    @Select("SELECT " + COLS + " FROM learning_video WHERE id = #{id}")
    LearningVideo findById(@Param("id") Long id);

    @Insert("""
            INSERT INTO learning_video
                (title, file_url, file_record_id, duration_seconds, size_bytes,
                 allow_seek, remember_position, require_full_watch, complete_threshold,
                 active, sort_order, created_by, created_at, updated_at)
            VALUES
                (#{title}, #{fileUrl}, #{fileRecordId}, #{durationSeconds}, #{sizeBytes},
                 #{allowSeek}, #{rememberPosition}, #{requireFullWatch}, #{completeThreshold},
                 #{active}, #{sortOrder}, #{createdBy}, NOW(), NOW())
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(LearningVideo video);

    @Update("""
            UPDATE learning_video SET
                title = #{title},
                file_url = #{fileUrl},
                duration_seconds = #{durationSeconds},
                size_bytes = #{sizeBytes},
                allow_seek = #{allowSeek},
                remember_position = #{rememberPosition},
                require_full_watch = #{requireFullWatch},
                complete_threshold = #{completeThreshold},
                active = #{active},
                sort_order = #{sortOrder},
                updated_at = NOW()
            WHERE id = #{id}
            """)
    int update(LearningVideo video);

    /** 学生首次播放时回填真实时长（管理端上传时不需要解析视频头）。 */
    @Update("UPDATE learning_video SET duration_seconds = #{seconds}, updated_at = NOW() WHERE id = #{id} AND duration_seconds = 0")
    int fillDuration(@Param("id") Long id, @Param("seconds") Integer seconds);

    @Delete("DELETE FROM learning_video WHERE id = #{id}")
    int delete(@Param("id") Long id);
}
