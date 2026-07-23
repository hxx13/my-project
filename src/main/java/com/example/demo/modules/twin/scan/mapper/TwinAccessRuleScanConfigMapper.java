package com.example.demo.modules.twin.scan.mapper;

import com.example.demo.modules.twin.scan.entity.TwinAccessRuleScanConfigRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TwinAccessRuleScanConfigMapper {

    TwinAccessRuleScanConfigRow selectById(@Param("id") int id);

    int insertIgnoreDefault(@Param("id") int id);

    int updateConfig(
            @Param("id") int id,
            @Param("enterDispatchEnabled") int enterDispatchEnabled,
            @Param("exitDispatchEnabled") int exitDispatchEnabled,
            @Param("enterUnfreezeEnabled") int enterUnfreezeEnabled,
            @Param("exitFreezeEnabled") int exitFreezeEnabled,
            @Param("swipeExitSkipConfirm") int swipeExitSkipConfirm,
            @Param("updatedBy") String updatedBy);
}
