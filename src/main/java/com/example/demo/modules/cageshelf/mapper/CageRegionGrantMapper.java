package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageRegionGrant;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/** 区域归属 Mapper（由 @MapperScan 扫描，无需 @Mapper 注解）。 */
public interface CageRegionGrantMapper {
    int insert(CageRegionGrant row);
    int deleteByUserAndRole(@Param("userId") String userId, @Param("grantRole") String grantRole);
    List<CageRegionGrant> listByUser(@Param("userId") String userId);
    List<CageRegionGrant> listAll();

    /** 已分配过的人（user_id = personnel.id 字符串），带姓名与条目数，按姓名排序。 */
    List<Map<String, Object>> listAssignees(@Param("grantRole") String grantRole);
}
