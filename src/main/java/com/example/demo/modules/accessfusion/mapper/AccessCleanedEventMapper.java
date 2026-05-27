package com.example.demo.modules.accessfusion.mapper;

import com.example.demo.modules.accessfusion.entity.AccessCleanedEvent;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public interface AccessCleanedEventMapper {
    int insert(AccessCleanedEvent row);

    int deleteByBatchId(@Param("batchId") long batchId);

    int updateReview(
            @Param("id") long id,
            @Param("direction") String direction,
            @Param("accessType") int accessType,
            @Param("inferenceMethod") String inferenceMethod,
            @Param("confidence") int confidence,
            @Param("needsReview") int needsReview);

    int updateAiSuggestion(@Param("id") long id, @Param("aiSuggestedDirection") String aiSuggestedDirection);

    AccessCleanedEvent selectById(@Param("id") long id);

    List<AccessCleanedEvent> selectReviewQueue(
            @Param("offset") int offset, @Param("limit") int limit);

    int countReviewQueue();

    List<AccessCleanedEvent> selectByBatchId(
            @Param("batchId") long batchId, @Param("offset") int offset, @Param("limit") int limit);

    List<Map<String, Object>> listForAggregation(
            @Param("campusList") List<String> campusList,
            @Param("floorList") List<String> floorList,
            @Param("roomName") String roomName,
            @Param("startTime") String startTime,
            @Param("endTime") String endTime,
            @Param("actionType") Integer actionType,
            @Param("excludeBlacklist") boolean excludeBlacklist);
}
