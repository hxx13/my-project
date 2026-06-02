package com.example.demo.modules.analytics.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Mapper
public interface StudentActivitySnapshotMapper {

    /** 写入/更新单日快照 */
    int upsertSnapshot(@Param("snapshotDate") LocalDate snapshotDate,
                       @Param("groupName") String groupName,
                       @Param("campus") String campus,
                       @Param("memberCount") int memberCount,
                       @Param("totalEntries") int totalEntries);

    /** 删除指定日期的快照（重算前清理） */
    int deleteByDate(@Param("snapshotDate") LocalDate snapshotDate);

    /** 按时间范围汇总：GROUP BY group_name, campus, SUM */
    List<Map<String, Object>> aggregateByDateRange(@Param("startDate") LocalDate startDate,
                                                    @Param("endDate") LocalDate endDate,
                                                    @Param("keyword") String keyword);

    /** 获取所有不同的课题组名（用于 summary 的 campus 聚合） */
    List<String> distinctGroupNamesInRange(@Param("startDate") LocalDate startDate,
                                           @Param("endDate") LocalDate endDate);

    /** 是否存在指定日期的快照 */
    int countByDate(@Param("snapshotDate") LocalDate snapshotDate);
}
