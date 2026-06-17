package com.example.demo.modules.facerecognition.mapper;

import com.example.demo.modules.facerecognition.entity.FaceVerifyAuditRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface FaceVerifyAuditMapper {
    int insert(FaceVerifyAuditRecord record);

    FaceVerifyAuditRecord findByUserIdAndSessionId(
            @Param("userId") String userId,
            @Param("sessionId") String sessionId);

    int updateMerged(FaceVerifyAuditRecord record);

    List<FaceVerifyAuditRecord> selectAdminPage(
            @Param("triggerType") String triggerType,
            @Param("keyword") String keyword,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime,
            @Param("offset") int offset,
            @Param("limit") int limit
    );

    long countAdminPage(
            @Param("triggerType") String triggerType,
            @Param("keyword") String keyword,
            @Param("startTime") LocalDateTime startTime,
            @Param("endTime") LocalDateTime endTime
    );
}
