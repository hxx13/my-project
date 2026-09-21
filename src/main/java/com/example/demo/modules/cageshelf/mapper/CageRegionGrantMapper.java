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

    /**
     * 组员候选人：持有指定身份标签的人 + **已被哪位饲养组长纳入**（boundLeaderName 为 null = 没人占）。
     * 已占用的人也在结果里（前端置灰展示），不做过滤。
     */
    List<Map<String, Object>> listMemberCandidates(@Param("identityCode") String identityCode);

    /** 这批 personnel.id 里已经在**别人**（≠ exceptLeaderUserId）组里的那些，带双方姓名。 */
    List<Map<String, Object>> listMemberOwners(@Param("exceptLeaderUserId") String exceptLeaderUserId,
                                               @Param("userIds") List<String> userIds);

    /**
     * 分配里出现过的**真实区域**去重（region_type ∈ CAMPUS/FLOOR/ROOM，排除 MEMBER 行的 LEADER_GROUP 占位）。
     * 超管配告警阈值/区域能力时列「全部可选区域」用。
     */
    List<Map<String, Object>> listDistinctRegions();

    /**
     * 覆盖给定区域（ROOM/FLOOR/CAMPUS 任一命中）的审核人**账号 id** —— 转移待签提醒的收件人来源。
     * 只认 LEADER/REVIEWER：SCOPE 是二期「可见范围」遗留，不是审核授权，不发给它。
     * 收件人要账号 id（pushService 收件人走 resolveIdByAccount），故取 staff_id / aro_user_id 而非 personnel.id。
     */
    List<String> listReviewerAccountIdsByRegions(@Param("roomIds") List<String> roomIds,
                                                 @Param("floorIds") List<String> floorIds,
                                                 @Param("campusIds") List<String> campusIds);
}
