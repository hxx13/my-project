package com.example.demo.modules.accessfusion.mapper;

import com.example.demo.modules.accessfusion.entity.AccessAuditSourceConfig;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface AccessAuditSourceConfigMapper {
    List<AccessAuditSourceConfig> selectAll();

    AccessAuditSourceConfig selectById(@Param("id") long id);

    int insert(AccessAuditSourceConfig row);

    int update(AccessAuditSourceConfig row);

    int delete(@Param("id") long id);

    int updateSyncStats(
            @Param("id") long id,
            @Param("syncCount") int syncCount,
            @Param("swingPreview") int swingPreview,
            @Param("rawPreview") int rawPreview);
}
