package com.example.demo.modules.inventory.mapper;

import com.example.demo.modules.inventory.entity.InvScanSession;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface ScanSessionMapper {
    int insert(InvScanSession session);
    InvScanSession selectById(@Param("id") Long id);
    /** 最近一次已提交的会话，用于「该空间最后盘点时间」 */
    InvScanSession selectLastCommitted(@Param("spaceId") Long spaceId);
    int updateStatus(@Param("id") Long id, @Param("status") String status);
    /** 提交会话：仅在 IN_PROGRESS 时置 COMMITTED 并写提交时间，返回受影响行数 */
    int markCommitted(@Param("id") Long id);
    int updateStats(@Param("id") Long id,
                    @Param("scannedCount") int scannedCount,
                    @Param("foundCount") int foundCount,
                    @Param("newCount") int newCount,
                    @Param("missingCount") int missingCount);
    List<InvScanSession> selectBySpace(@Param("spaceId") Long spaceId);
}
