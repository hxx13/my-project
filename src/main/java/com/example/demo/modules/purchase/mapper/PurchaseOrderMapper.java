package com.example.demo.modules.purchase.mapper;

import com.example.demo.modules.purchase.entity.PurchaseOrder;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface PurchaseOrderMapper {
    int insert(PurchaseOrder order);

    PurchaseOrder findById(@Param("id") String id);

    List<PurchaseOrder> listForApplicant(@Param("applicantId") String applicantId,
                                         @Param("status") String status,
                                         @Param("startTime") LocalDateTime startTime,
                                         @Param("endTime") LocalDateTime endTime,
                                         @Param("limit") int limit,
                                         @Param("offset") int offset);

    int countForApplicant(@Param("applicantId") String applicantId,
                          @Param("status") String status,
                          @Param("startTime") LocalDateTime startTime,
                          @Param("endTime") LocalDateTime endTime);

    List<PurchaseOrder> listAll(@Param("status") String status,
                                @Param("startTime") LocalDateTime startTime,
                                @Param("endTime") LocalDateTime endTime,
                                @Param("limit") int limit,
                                @Param("offset") int offset);

    int countAll(@Param("status") String status,
                 @Param("startTime") LocalDateTime startTime,
                 @Param("endTime") LocalDateTime endTime);

    List<PurchaseOrder> listVisible(@Param("applicantId") String applicantId,
                                    @Param("status") String status,
                                    @Param("startTime") LocalDateTime startTime,
                                    @Param("endTime") LocalDateTime endTime,
                                    @Param("limit") int limit,
                                    @Param("offset") int offset);

    int countVisible(@Param("applicantId") String applicantId,
                     @Param("status") String status,
                     @Param("startTime") LocalDateTime startTime,
                     @Param("endTime") LocalDateTime endTime);

    int markProcessing(@Param("id") String id,
                       @Param("processorId") String processorId,
                       @Param("startTime") LocalDateTime startTime);

    int markCompleted(@Param("id") String id,
                      @Param("resultRemark") String resultRemark,
                      @Param("resultImagesJson") String resultImagesJson,
                      @Param("finishTime") LocalDateTime finishTime);

    int deleteById(@Param("id") String id, @Param("operatorId") String operatorId);

    int withdrawPendingByApplicant(@Param("id") String id, @Param("applicantId") String applicantId);

    List<PurchaseOrder> listRecycle(@Param("limit") int limit, @Param("offset") int offset);

    int countRecycle();

    int restoreById(@Param("id") String id);

    int hardDeleteById(@Param("id") String id);

    int hardDeleteByIds(@Param("ids") List<String> ids);

    List<PurchaseOrder> listDueForPurge(@Param("now") LocalDateTime now, @Param("limit") int limit);
}
