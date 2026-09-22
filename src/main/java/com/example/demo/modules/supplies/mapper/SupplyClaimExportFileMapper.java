package com.example.demo.modules.supplies.mapper;

import com.example.demo.modules.supplies.entity.SupplyClaimExportFile;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface SupplyClaimExportFileMapper {
    int insert(SupplyClaimExportFile row);

    SupplyClaimExportFile selectLatestValid(@Param("claimId") String claimId, @Param("now") LocalDateTime now);

    List<SupplyClaimExportFile> listByClaimId(@Param("claimId") String claimId, @Param("limit") int limit);

    SupplyClaimExportFile findByToken(@Param("token") String token);

    // 曾经的 markExpired(now)：全表 UPDATE status='EXPIRED'。2026-09-22 删掉 ——
    // 它与并发 INSERT 新归档件抢锁、实测死锁，而且到期判定处处是懒算的
    // （selectLatestValid 用 expire_at > now），本来就不需要它。别再加回来。

    int deleteById(@Param("id") String id);

    int deleteByClaimId(@Param("claimId") String claimId);
}

