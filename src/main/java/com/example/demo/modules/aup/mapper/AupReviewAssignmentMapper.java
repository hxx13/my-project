package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.AupReviewAssignment;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AupReviewAssignmentMapper {

    int insertBatch(@Param("list") List<AupReviewAssignment> rows);

    AupReviewAssignment selectByAupRoundReviewer(@Param("aupId") long aupId,
                                                 @Param("roundNo") int roundNo,
                                                 @Param("reviewerId") String reviewerId);

    int updateStatus(@Param("aupId") long aupId,
                     @Param("roundNo") int roundNo,
                     @Param("reviewerId") String reviewerId,
                     @Param("status") String status);

    /** 尚未投票（status=pending）的专家 userId 列表 */
    List<String> selectPendingReviewerIds(@Param("aupId") long aupId, @Param("roundNo") int roundNo);

    /** 某轮次分配的全部专家 userId（去重），返修后默认沿用上一轮专家 */
    List<String> selectReviewerIdsByAupRound(@Param("aupId") long aupId, @Param("roundNo") int roundNo);
}
