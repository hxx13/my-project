package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.util.Map;

@Mapper
public interface MaterialRequestMapper {
    MaterialRequest selectById(@Param("id") String id);
    /** 同 selectById，但加 FOR UPDATE 行锁：合并等需要挡住并发审核的场景使用 */
    MaterialRequest selectByIdForUpdate(@Param("id") String id);
    List<MaterialRequest> selectByUserId(@Param("userId") String userId, @Param("status") String status,
                                          @Param("offset") int offset, @Param("size") int size);
    int countByUserId(@Param("userId") String userId, @Param("status") String status);
    List<MaterialRequest> selectAll(@Param("status") String status, @Param("applicantUserId") String applicantUserId,
                                     @Param("applicantGroup") String applicantGroup,
                                     @Param("offset") int offset, @Param("size") int size);
    /**
     * 申领审计导出页的候选单：人员/课题组/日期三条件都下沉到 SQL，取交集。
     * 日期必须在 SQL 里过滤 —— 若先截最新 N 条再在 Java 里按日期筛，
     * 查较早区间会得到空表（本地库 600+ 单，最新 500 条之外的老单永远看不见）。
     */
    List<MaterialRequest> selectAuditCandidates(@Param("applicantUserId") String applicantUserId,
                                                @Param("applicantGroup") String applicantGroup,
                                                @Param("from") String from, @Param("to") String to,
                                                @Param("offset") int offset, @Param("size") int size);
    List<MaterialRequest> selectFinished(@Param("applicantUserId") String applicantUserId,
                                          @Param("applicantGroup") String applicantGroup,
                                          @Param("offset") int offset, @Param("size") int size);
    int countAll(@Param("status") String status, @Param("applicantUserId") String applicantUserId,
                  @Param("applicantGroup") String applicantGroup);
    int countFinished(@Param("applicantUserId") String applicantUserId, @Param("applicantGroup") String applicantGroup);
    int insert(MaterialRequest request);
    int updateStatus(@Param("id") String id, @Param("status") String status, @Param("updatedAt") java.time.LocalDateTime updatedAt);
    /** 仅当仍为 PENDING 时刷新 updated_at；返回 0 表示状态已被并发变更 */
    int touchUpdatedAtIfPending(@Param("id") String id, @Param("now") java.time.LocalDateTime now);
    int updateReview(@Param("id") String id, @Param("reviewerId") String reviewerId, @Param("status") String status,
                     @Param("reviewTime") java.time.LocalDateTime reviewTime);
    int updateFulfill(@Param("id") String id, @Param("fulfilledBy") String fulfilledBy,
                      @Param("fulfilledAt") java.time.LocalDateTime fulfilledAt);
    int updateReceived(@Param("id") String id, @Param("receivedAt") java.time.LocalDateTime receivedAt);
    int softDelete(@Param("id") String id, @Param("deletedBy") String deletedBy,
                   @Param("deletedTime") java.time.LocalDateTime deletedTime,
                   @Param("purgeAfter") java.time.LocalDateTime purgeAfter);
    int restoreById(@Param("id") String id);
    int hardDeleteById(@Param("id") String id);
    int deleteEmptyRequests();
    List<MaterialRequest> selectRecycle(@Param("offset") int offset, @Param("size") int size);
    int countRecycle();
    List<MaterialRequest> selectPendingByReviewer(@Param("reviewerId") String reviewerId);
    /** 有申领记录的课题组列表（可选日期区间，排除草稿） */
    List<String> selectDistinctGroups(@Param("from") String from, @Param("to") String to);
    /** 有申领记录的人员列表（userId + applicantName，可选日期区间，排除草稿） */
    List<Map<String, Object>> selectDistinctApplicants(@Param("from") String from, @Param("to") String to);
    /** 按课题组聚合统计 */
    List<Map<String, Object>> statsByGroup(@Param("from") String from, @Param("to") String to);
    List<Map<String, Object>> statsByStudent(@Param("from") String from, @Param("to") String to);
    List<Map<String, Object>> statsByItem(@Param("from") String from, @Param("to") String to);
    List<MaterialRequest> selectAuditTrail(@Param("from") String from, @Param("to") String to,
                                            @Param("categoryId") Long categoryId, @Param("groupId") String groupId,
                                            @Param("offset") int offset, @Param("size") int size);
    int countAuditTrail(@Param("from") String from, @Param("to") String to,
                         @Param("categoryId") Long categoryId, @Param("groupId") String groupId);
    List<Map<String, Object>> selectClaimLinesByItemId(@Param("itemId") Long itemId,
                                                        @Param("from") String from, @Param("to") String to,
                                                        @Param("applicantGroup") String applicantGroup,
                                                        @Param("categoryId") Long categoryId, @Param("keyword") String keyword,
                                                        @Param("offset") int offset, @Param("size") int size);
    int countClaimLinesByItemId(@Param("itemId") Long itemId, @Param("from") String from, @Param("to") String to,
                                @Param("applicantGroup") String applicantGroup,
                                @Param("categoryId") Long categoryId, @Param("keyword") String keyword);
    /**
     * 已出库却没写出库流水的申领明细（按单判缺）—— 补写流水的输入。
     * 审计页原先只能把这种单反推成一行「申领出库（无流水补录）」且库存列必然是 [无]；
     * 补写回流水表后这笔出库才真正进入库存倒推链。
     */
    List<Map<String, Object>> selectFulfilledLinesMissingOutbound(@Param("limit") int limit);
    int updateApplicantMeta(@Param("id") String id, @Param("applicantName") String applicantName,
                            @Param("applicantGroup") String applicantGroup);
    /** 撤销审核：清空审核/出库字段，回退到 PENDING */
    int resetForRevoke(@Param("id") String id, @Param("updatedAt") java.time.LocalDateTime updatedAt);
    /** 待审核申领数（PENDING + 双审 FIRST_OK） */
    int countPendingReview();
    /** 扫描待通知的预约申领：已到通知窗口 + 未通知 */
    List<MaterialRequest> selectScheduledPendingForNotify();
    /** 标记预约通知已发送 */
    int updateNotificationSent(@Param("id") String id);

    List<Map<String, Object>> statsDailyRequests(@Param("from") String from, @Param("to") String to,
                                                  @Param("groupId") String groupId);

    List<Map<String, Object>> statsStatusInRange(@Param("from") String from, @Param("to") String to,
                                                  @Param("groupId") String groupId);

    Map<String, Object> statsPassRejectInRange(@Param("from") String from, @Param("to") String to,
                                                @Param("groupId") String groupId);

    List<Map<String, Object>> statsByStudentFiltered(@Param("from") String from, @Param("to") String to,
                                                     @Param("groupId") String groupId);

    List<Map<String, Object>> statsByItemFiltered(@Param("from") String from, @Param("to") String to,
                                                   @Param("groupId") String groupId);

    List<Map<String, Object>> statsByGroupFiltered(@Param("from") String from, @Param("to") String to,
                                                  @Param("groupId") String groupId);
}
