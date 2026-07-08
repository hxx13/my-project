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

    /** 软删除：标记 DELETED，后续所有判定自动排除 */
    int softDeleteById(@Param("id") Long id);

    /** 隔夜自动过期：PENDING 且创建日期非今天 → EXPIRED */
    int expireOldPending();

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

    /** 查询用户在某房间的活跃申请（PENDING/APPROVED），用于防重复提交 */
    List<TwinScanDelayRequest> listActiveByUserAndRoom(
            @Param("subjectUserId") String subjectUserId,
            @Param("roomId") String roomId);

    /** 仅查 PENDING（审核中），用于活跃状态展示 */
    List<TwinScanDelayRequest> listPendingByUserAndRoom(
            @Param("subjectUserId") String subjectUserId,
            @Param("roomId") String roomId);

    /** 当天同人同房同选项申请数（不限状态），用于防重复提交 */
    int countTodayByUserRoomOption(
            @Param("subjectUserId") String subjectUserId,
            @Param("roomId") String roomId,
            @Param("optionId") Long optionId);

    /** 今日被拒选项 ID 列表（供前端菜单标记） */
    List<Long> listTodayRejectedOptionIds(
            @Param("subjectUserId") String subjectUserId,
            @Param("roomId") String roomId);
}
