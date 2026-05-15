package com.example.demo.modules.pagepermission.mapper;

import com.example.demo.modules.pagepermission.entity.PagePermissionItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface PagePermissionMapper {
    List<PagePermissionItem> listByPlatform(@Param("platform") String platform);

    List<PagePermissionItem> listAll();

    PagePermissionItem findByNodeKey(@Param("nodeKey") String nodeKey);

    /**
     * 按平台与路径查询（用于侧栏右键快速定位；路径须与扫描入库的 path_or_route 一致）
     */
    List<PagePermissionItem> listByPlatformAndPath(@Param("platform") String platform,
                                                   @Param("pathOrRoute") String pathOrRoute);

    int upsertFromScan(PagePermissionItem item);

    int updateManual(@Param("nodeKey") String nodeKey,
                     @Param("minRole") String minRole,
                     @Param("enabled") Integer enabled);

    int resetDefaultByPlatform(@Param("platform") String platform);

    int touchMissingAsUndiscovered(@Param("platform") String platform,
                                   @Param("aliveKeys") List<String> aliveKeys,
                                   @Param("now") LocalDateTime now);
}

