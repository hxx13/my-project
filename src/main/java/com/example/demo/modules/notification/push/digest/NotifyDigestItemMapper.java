package com.example.demo.modules.notification.push.digest;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface NotifyDigestItemMapper {
    int insert(NotifyDigestItem item);
    int batchInsert(@Param("items") List<NotifyDigestItem> items);
    List<NotifyDigestItem> findPendingByUser(@Param("userId") String userId);
    List<String> findDistinctPendingUsers();
    /** 该接收人该源当前是否还有未投递的明细。表格表头靠它判断"这一组要不要带表头"。 */
    int countPending(@Param("userId") String userId, @Param("sourceCode") String sourceCode);
    int markSent(@Param("ids") List<Long> ids, @Param("sendTime") LocalDateTime sendTime);
    int deletePendingBySource(@Param("sourceCode") String sourceCode);
    /**
     * 分批删「已发送且早于 before」的明细，返回本次删掉的行数（0 = 已清空）。
     * 只删 SENT —— PENDING 是还没投出去的，删了就是丢通知。
     * 分片删（LIMIT 一批）是为了首次清积压时不一刀锁死表，走 idx_status_time。
     */
    int deleteSentBefore(@Param("before") LocalDateTime before, @Param("limit") int limit);
}
