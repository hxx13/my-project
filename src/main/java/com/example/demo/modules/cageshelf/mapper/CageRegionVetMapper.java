package com.example.demo.modules.cageshelf.mapper;

import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 区域指定兽医表（cage_region_vet）。
 *
 * <p>形态照 {@link CageAlertRuleMapper} 的区域规则：唯一键带 configured_by（同一区域可有多个饲养组长，
 * 按区域整片删会抹掉别人的配置）；读取用 map 返回，不另建实体。
 */
public interface CageRegionVetMapper {

    /** 批量取这些区域的指定兽医行。regions 每项含 regionType / regionId，空列表不要传进来。 */
    List<Map<String, Object>> listByRegions(@Param("regions") List<Map<String, String>> regions);

    /** 某区域的兽医行（配置界面读用，含配置人）。 */
    List<Map<String, Object>> listByRegion(@Param("regionType") String regionType,
                                           @Param("regionId") String regionId);

    /** 只删**这个人**在该区域配的行（多组长各自配各自的）。 */
    int deleteRegionVets(@Param("regionType") String regionType,
                         @Param("regionId") String regionId,
                         @Param("configuredBy") String configuredBy);

    /** 清掉该区域**所有人**的行。仅超管保存时走这条（超管保存 = 本区重置）。 */
    int deleteAllRegionVets(@Param("regionType") String regionType,
                            @Param("regionId") String regionId);

    int insertRegionVet(@Param("regionType") String regionType,
                        @Param("regionId") String regionId,
                        @Param("vetAccountId") String vetAccountId,
                        @Param("configuredBy") String configuredBy);
}
