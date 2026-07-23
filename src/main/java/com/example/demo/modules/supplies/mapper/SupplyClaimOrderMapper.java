package com.example.demo.modules.supplies.mapper;

import com.example.demo.modules.supplies.entity.SupplyClaimOrder;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface SupplyClaimOrderMapper {
    int insert(SupplyClaimOrder row);

    SupplyClaimOrder findById(@Param("id") String id);

    SupplyClaimOrder findByIdAny(@Param("id") String id);

    SupplyClaimOrder findByIdForUpdate(@Param("id") String id);

    int updateWithdrawn(@Param("id") String id, @Param("userId") String userId);

    int updateFulfilled(@Param("id") String id,
                         @Param("fulfilledBy") String fulfilledBy,
                         @Param("fulfilledAt") java.time.LocalDateTime fulfilledAt);

    List<SupplyClaimOrder> listPendingAll();

    int countPendingAll();

    List<SupplyClaimOrder> listPendingByUser(@Param("userId") String userId);

    int countPendingByUser(@Param("userId") String userId);

    List<SupplyClaimOrder> listMine(@Param("userId") String userId,
                                    @Param("status") String status,
                                    @Param("limit") int limit,
                                    @Param("offset") int offset);

    int countMine(@Param("userId") String userId, @Param("status") String status);

    /** 按申请人 + 申请时间范围（created_at ∈ [from, toExclusive)） */
    List<SupplyClaimOrder> listByUserCreatedBetween(@Param("userId") String userId,
                                                    @Param("from") LocalDateTime from,
                                                    @Param("toExclusive") LocalDateTime toExclusive,
                                                    @Param("limit") int limit,
                                                    @Param("offset") int offset);

    int countByUserCreatedBetween(@Param("userId") String userId,
                                  @Param("from") LocalDateTime from,
                                  @Param("toExclusive") LocalDateTime toExclusive);

    List<SupplyClaimOrder> listRecentClosedAll(@Param("limit") int limit);

    List<SupplyClaimOrder> listRecentClosedByUser(@Param("userId") String userId, @Param("limit") int limit);

    int deleteById(@Param("id") String id, @Param("operatorId") String operatorId, @Param("purgeAfter") LocalDateTime purgeAfter);

    List<SupplyClaimOrder> listRecycleByUser(@Param("userId") String userId, @Param("limit") int limit, @Param("offset") int offset);

    int countRecycleByUser(@Param("userId") String userId);

    SupplyClaimOrder findRecycleByIdForUser(@Param("id") String id, @Param("userId") String userId);

    List<SupplyClaimOrder> listRecycle(@Param("limit") int limit, @Param("offset") int offset);

    int countRecycle();

    int restoreById(@Param("id") String id);

    int hardDeleteById(@Param("id") String id);

    int hardDeleteByIds(@Param("ids") List<String> ids);

    /** 历史上在领用单中出现过的申请人 user_id（去重） */
    List<String> listDistinctApplicantUserIds();
}
