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
    List<MaterialRequest> selectAll(@Param("status") String status, @Param("offset") int offset, @Param("size") int size);
    int countAll(@Param("status") String status);
    int insert(MaterialRequest request);
    int updateStatus(@Param("id") String id, @Param("status") String status);
    int updateReview(@Param("id") String id, @Param("reviewerId") String reviewerId, @Param("status") String status);
    int updateFulfill(@Param("id") String id, @Param("fulfilledBy") String fulfilledBy);
    int updateReceived(@Param("id") String id);
    int softDelete(@Param("id") String id, @Param("deletedBy") String deletedBy);
    List<MaterialRequest> selectPendingByReviewer(@Param("reviewerId") String reviewerId);
    List<Map<String, Object>> statsByStudent(@Param("from") String from, @Param("to") String to);
    List<Map<String, Object>> statsByItem(@Param("from") String from, @Param("to") String to);
    List<MaterialRequest> selectAuditTrail(@Param("from") String from, @Param("to") String to,
                                            @Param("categoryId") Long categoryId, @Param("groupId") String groupId,
                                            @Param("offset") int offset, @Param("size") int size);
    int countAuditTrail(@Param("from") String from, @Param("to") String to,
                         @Param("categoryId") Long categoryId, @Param("groupId") String groupId);
}
