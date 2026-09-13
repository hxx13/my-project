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

    /** 挂在该组长名下的行（MEMBER 行的 leader_user_id = 组长的 personnel.id）。 */
    List<CageRegionGrant> listByLeader(@Param("leaderUserId") String leaderUserId);

    /** 撤销该组长名下的全部组员行（组员全量替换时先删）。 */
    int deleteMembersByLeader(@Param("leaderUserId") String leaderUserId);

    /**
     * 组员带姓名与条目数。**在 SQL 里 join personnel 取名字**——`user_id` 存的是 personnel.id，
     * 而 UserDisplayNameService 按 staff_id/aro_user_id 建索引、不认 personnel.id（二期踩过）。
     */
    List<Map<String, Object>> listMemberRows(@Param("leaderUserId") String leaderUserId);

    /** 已分配过的人（user_id = personnel.id 字符串），带姓名与条目数，按姓名排序。 */
    List<Map<String, Object>> listAssignees(@Param("grantRole") String grantRole);

    /** 概览行（join 出账号 id 与姓名），供设置中心按人分组展示。 */
    List<Map<String, Object>> listAllWithNames(@Param("grantRole") String grantRole);
}
