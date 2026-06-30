package com.example.demo.modules.twin.rpg.mapper;

import com.example.demo.modules.twin.rpg.entity.TwinExpRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface TwinExpRecordMapper {
    int insert(TwinExpRecord record);

    int countTotalExp();

    int countTodayExp();

    int countActiveUsers();

    int countTodayActiveUsers();

    List<Map<String, Object>> getTopEarners(@Param("limit") int limit);

    List<TwinExpRecord> selectPage(@Param("offset") int offset,
                                   @Param("pageSize") int pageSize,
                                   @Param("userId") String userId,
                                   @Param("sourceType") String sourceType,
                                   @Param("startDate") String startDate,
                                   @Param("endDate") String endDate);

    long countPage(@Param("userId") String userId,
                   @Param("sourceType") String sourceType,
                   @Param("startDate") String startDate,
                   @Param("endDate") String endDate);

    // ── 新增：带异常/审核/来源筛选的分页查询 ──

    List<TwinExpRecord> selectPageWithFilters(@Param("offset") int offset,
                                              @Param("pageSize") int pageSize,
                                              @Param("userId") String userId,
                                              @Param("sourceType") String sourceType,
                                              @Param("startDate") String startDate,
                                              @Param("endDate") String endDate,
                                              @Param("anomalyFlag") Integer anomalyFlag,
                                              @Param("reviewStatus") Integer reviewStatus,
                                              @Param("feedSource") String feedSource);

    long countPageWithFilters(@Param("userId") String userId,
                              @Param("sourceType") String sourceType,
                              @Param("startDate") String startDate,
                              @Param("endDate") String endDate,
                              @Param("anomalyFlag") Integer anomalyFlag,
                              @Param("reviewStatus") Integer reviewStatus,
                              @Param("feedSource") String feedSource);

    // ── 新增：审核操作 ──

    int updateReviewStatus(@Param("id") Long id,
                           @Param("reviewStatus") Integer reviewStatus,
                           @Param("reviewedBy") String reviewedBy,
                           @Param("reviewNote") String reviewNote);

    int batchUpdateReviewStatus(@Param("ids") List<Long> ids,
                                @Param("reviewStatus") Integer reviewStatus,
                                @Param("reviewedBy") String reviewedBy);

    // ── 新增：汇总查询 ──

    /** 汇总单用户未被驳回的经验总值 */
    Long sumExpByUserIdExcludeRejected(@Param("userId") String userId);

    /** 异常统计（按类型） */
    List<Map<String, Object>> countAnomaliesByType(@Param("startDate") String startDate,
                                                    @Param("endDate") String endDate);

    /** 待审核数量 */
    int countPendingReview();
}
