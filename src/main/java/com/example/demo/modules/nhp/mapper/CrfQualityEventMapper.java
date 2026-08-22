package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfQualityEvent;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 数据质量事件 mapper。 */
@Mapper
public interface CrfQualityEventMapper {

    @Insert("INSERT INTO crf_quality_event (event_type, subject_id, ref_type, ref_id, trigger_rule, status, reviewer) " +
            "VALUES (#{eventType}, #{subjectId}, #{refType}, #{refId}, #{triggerRule}, #{status}, #{reviewer})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfQualityEvent row);

    @Select("SELECT * FROM crf_quality_event WHERE id = #{id}")
    CrfQualityEvent findById(Long id);

    @Select("SELECT * FROM crf_quality_event WHERE status = #{status} ORDER BY id DESC")
    List<CrfQualityEvent> listByStatus(String status);

    @Select("SELECT * FROM crf_quality_event ORDER BY id DESC LIMIT #{limit}")
    List<CrfQualityEvent> listRecent(int limit);

    @Select("SELECT * FROM crf_quality_event ORDER BY id DESC")
    List<CrfQualityEvent> listAll();

    @Select("SELECT COUNT(*) FROM crf_quality_event WHERE status = #{status}")
    int countByStatus(String status);

    @Select("SELECT COUNT(*) FROM crf_quality_event WHERE event_type = #{eventType} AND status = #{status}")
    int countByTypeAndStatus(@Param("eventType") String eventType, @Param("status") String status);

    @Update("UPDATE crf_quality_event SET status = #{status}, reviewer = #{reviewer} WHERE id = #{id}")
    int updateReview(@Param("id") Long id, @Param("status") String status, @Param("reviewer") String reviewer);
}
