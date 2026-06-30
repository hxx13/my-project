package com.example.demo.modules.twin.scan.delay.mapper;

import com.example.demo.modules.twin.scan.delay.entity.TwinScanDelayRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TwinScanDelayRequestMapper {
    int insert(TwinScanDelayRequest row);

    TwinScanDelayRequest findById(@Param("id") Long id);

    int updateStatus(
            @Param("id") Long id,
            @Param("status") String status,
            @Param("reviewedBy") String reviewedBy,
            @Param("rejectReason") String rejectReason,
            @Param("reviewedAt") java.time.LocalDateTime reviewedAt
    );

    List<TwinScanDelayRequest> listPendingByReviewer(@Param("reviewerUserId") String reviewerUserId, @Param("limit") int limit);

    List<TwinScanDelayRequest> listAllPending(@Param("limit") int limit);

    List<TwinScanDelayRequest> listReviewedHistory(@Param("limit") int limit);

    int countPendingByReviewer(@Param("reviewerUserId") String reviewerUserId);

    /** 审核人视角：按申请人+选项统计历史通过次数 */
    List<java.util.Map<String, Object>> listApprovedCountsByReviewer(@Param("reviewerUserId") String reviewerUserId);

    /** 主体用户近期延迟申请（待审+已审结） */
    List<TwinScanDelayRequest> listRecentBySubjectUserId(
            @Param("subjectUserId") String subjectUserId,
            @Param("limit") int limit);
}
