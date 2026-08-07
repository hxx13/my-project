package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageClaim;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface CageClaimMapper {

    int insert(CageClaim claim);

    int update(CageClaim claim);

    CageClaim selectById(@Param("id") Long id);

    /** FOR UPDATE 锁单条记录（审批用） */
    CageClaim selectByIdForUpdate(@Param("id") Long id);

    /** 查某笼位当前活跃的认领（FOR UPDATE 用） */
    CageClaim selectActiveByAnimalCageId(@Param("animalCageId") Long animalCageId);

    /** 学生本人的认领列表 */
    List<CageClaim> selectByClaimantId(@Param("claimantId") String claimantId,
                                       @Param("status") String status);

    /** 管理端待审批列表（分页+筛选） */
    List<CageClaim> selectPending(@Param("status") String status,
                                  @Param("keyword") String keyword,
                                  @Param("offset") int offset,
                                  @Param("limit") int limit);

    int countPending(@Param("status") String status,
                     @Param("keyword") String keyword);

    /** 查某笼位的驳回次数 */
    int countRejectedByAnimalCage(@Param("animalCageId") Long animalCageId,
                                   @Param("claimantId") String claimantId);

    /** 查某笼位最近一次驳回时间 */
    String selectLastRejectedAt(@Param("animalCageId") Long animalCageId,
                                 @Param("claimantId") String claimantId);

    /** 超时扫描：查超时的 pending_approval */
    List<CageClaim> selectTimedOutPendingApproval(@Param("beforeHours") int beforeHours);

    /** 超时扫描：查超时的 locked */
    List<CageClaim> selectTimedOutLocked(@Param("beforeHours") int beforeHours);

    /** 批量更新状态 */
    int batchUpdateStatus(@Param("ids") List<Long> ids,
                          @Param("status") String status,
                          @Param("note") String note);

    /** 按架子查池中可用的笼位（cageTypeCode=2 + 无 active claim） */
    List<Map<String, Object>> selectPoolCells(@Param("shelfIndexId") Long shelfIndexId);

    /** 查某笼位所有认领记录（FOR UPDATE 并发控制） */
    List<CageClaim> selectByAnimalCageIdForUpdate(@Param("animalCageId") Long animalCageId);
}
