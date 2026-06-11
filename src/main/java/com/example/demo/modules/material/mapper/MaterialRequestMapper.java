package com.example.demo.modules.material.mapper;

import com.example.demo.modules.material.entity.MaterialRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.util.Map;

@Mapper
public interface MaterialRequestMapper {
    MaterialRequest selectById(@Param("id") String id);
    List<MaterialRequest> selectByUserId(@Param("userId") String userId, @Param("status") String status,
                                          @Param("offset") int offset, @Param("size") int size);
    int countByUserId(@Param("userId") String userId, @Param("status") String status);
    List<MaterialRequest> selectAll(@Param("status") String status, @Param("applicantUserId") String applicantUserId,
                                     @Param("applicantGroup") String applicantGroup,
                                     @Param("offset") int offset, @Param("size") int size);
    int countAll(@Param("status") String status, @Param("applicantUserId") String applicantUserId,
                  @Param("applicantGroup") String applicantGroup);
    int insert(MaterialRequest request);
    int updateStatus(@Param("id") String id, @Param("status") String status);
    int updateReview(@Param("id") String id, @Param("reviewerId") String reviewerId, @Param("status") String status);
    int updateFulfill(@Param("id") String id, @Param("fulfilledBy") String fulfilledBy);
    int updateReceived(@Param("id") String id);
    int softDelete(@Param("id") String id, @Param("deletedBy") String deletedBy, @Param("purgeAfter") java.time.LocalDateTime purgeAfter);
    int restoreById(@Param("id") String id);
    int hardDeleteById(@Param("id") String id);
    List<MaterialRequest> selectRecycle(@Param("offset") int offset, @Param("size") int size);
    int countRecycle();
    List<MaterialRequest> selectPendingByReviewer(@Param("reviewerId") String reviewerId);
    /** 有申领记录的课题组列表 */
    List<String> selectDistinctGroups();
    /** 有申领记录的人员列表（userId + applicantName） */
    List<Map<String, Object>> selectDistinctApplicants();
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
                                                        @Param("offset") int offset, @Param("size") int size);
    int countClaimLinesByItemId(@Param("itemId") Long itemId, @Param("from") String from, @Param("to") String to);
    int updateApplicantMeta(@Param("id") String id, @Param("applicantName") String applicantName,
                            @Param("applicantGroup") String applicantGroup);
    /** 待审核申领数（PENDING + 双审 FIRST_OK） */
    int countPendingReview();

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
