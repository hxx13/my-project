package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageOwnerApprovalConfig;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 所属人审核配置 Mapper（由 @MapperScan 扫描）。 */
public interface CageOwnerApprovalConfigMapper {
    CageOwnerApprovalConfig selectByOwner(@Param("ownerAccountId") String ownerAccountId);

    List<CageOwnerApprovalConfig> listAll();

    int upsert(CageOwnerApprovalConfig row);
}
