package com.example.demo.modules.asset.mapper;

import com.example.demo.modules.asset.entity.AssetLocation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface AssetLocationMapper {

    List<AssetLocation> listAll();

    AssetLocation findById(@Param("id") Long id);

    List<AssetLocation> findByIds(@Param("ids") List<Long> ids);

    int insert(AssetLocation node);

    int updateNode(@Param("id") Long id,
                   @Param("name") String name,
                   @Param("parentId") Long parentId,
                   @Param("sortOrder") Integer sortOrder,
                   @Param("icon") String icon);

    int softDelete(@Param("id") Long id);

    int countChildren(@Param("id") Long id);

    /** 该节点直属资产数 */
    int countAssets(@Param("id") Long id);

    /** 全部节点直属资产数：node_id → count */
    List<Map<String, Object>> countAssetsGroupByNode();
}
