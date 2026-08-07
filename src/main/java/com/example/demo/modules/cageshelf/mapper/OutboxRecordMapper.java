package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.OutboxRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface OutboxRecordMapper {

    int insert(OutboxRecord record);

    /** 取待投递记录（FOR UPDATE 行锁，防并发重复投递） */
    List<OutboxRecord> selectPending(@Param("limit") int limit);

    int updateStatus(@Param("id") Long id,
                     @Param("status") String status,
                     @Param("retryCount") Integer retryCount,
                     @Param("nextRetryAt") String nextRetryAt,
                     @Param("lastError") String lastError,
                     @Param("aroResponse") String aroResponse,
                     @Param("deliveredAt") String deliveredAt);

    /** 统计面板 */
    List<Map<String, Object>> stats();

    /** 最近记录 */
    List<OutboxRecord> selectRecent(@Param("limit") int limit);

    /** 回填 ARO 实际调用 URL */
    int updateAroUrl(@Param("id") Long id, @Param("aroUrl") String aroUrl);
}
