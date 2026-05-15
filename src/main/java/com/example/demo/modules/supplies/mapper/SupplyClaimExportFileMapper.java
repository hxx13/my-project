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

    int markExpired(@Param("now") LocalDateTime now);

    int deleteById(@Param("id") String id);

    int deleteByClaimId(@Param("claimId") String claimId);
}

