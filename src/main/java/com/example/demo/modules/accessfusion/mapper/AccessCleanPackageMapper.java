package com.example.demo.modules.accessfusion.mapper;

import com.example.demo.modules.accessfusion.entity.AccessCleanPackage;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface AccessCleanPackageMapper {
    int insert(AccessCleanPackage row);

    int update(AccessCleanPackage row);

    AccessCleanPackage selectById(@Param("id") long id);

    List<AccessCleanPackage> selectByTask(@Param("statsTaskId") long statsTaskId, @Param("limit") int limit);

    /** @deprecated 遗留；请用 selectPrimaryByChannelCode */
    AccessCleanPackage selectPrimaryByStatsTaskId(@Param("statsTaskId") long statsTaskId);

    AccessCleanPackage selectPrimaryByChannelCode(@Param("channelCode") String channelCode);

    List<AccessCleanPackage> listAllPrimaryPackages();
}
