package com.example.demo.modules.cageshelf.mapper;

import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 笼位特殊状态超时告警的阈值表（cage_alert_default / cage_region_alert_rule）。
 * 与老的快照告警链路（cage_alert_config 等）零耦合，由 @MapperScan 扫描，无需 @Mapper 注解。
 */
public interface CageAlertRuleMapper {

    /** 全局默认阈值（status_code 主键，5 行）。 */
    List<Map<String, Object>> listDefaultRules();

    /**
     * 批量取这些区域的**全部**告警规则行（含 enabled=0 的关闭行）。regions 每项含 regionType / regionId，
     * 空列表不要传进来（会生成非法 SQL）。
     * 「配过但全关」必须区别于「从未配过」，所以必须含关闭行。
     */
    List<Map<String, Object>> listRegionRules(@Param("regions") List<Map<String, String>> regions);

    /**
     * 全部被配过（有任意行，含 enabled=0 的关闭行）的区域键 (region_type, region_id) 去重。
     * 区域树聚合 configured / descendantConfigured 用——「配过但全关」也算配过，与 regionView 的
     * regionConfigured 同口径。
     */
    List<Map<String, Object>> listConfiguredRegionKeys();

    /** 全局默认阈值 upsert（status_code 主键）：不存在则插、存在则更新。 */
    int upsertDefaultRule(@Param("statusCode") String statusCode,
                          @Param("thresholdDays") int thresholdDays,
                          @Param("action") String action,
                          @Param("enabled") int enabled,
                          @Param("startValue") int startValue);

    /**
     * 只删**这个人**在该区域配的告警规则行。
     * 同一区域可以有多个饲养组长（并集生效），按区域整片删会把别人的配置一起抹掉（见 cage_region_capability 实测教训）。
     */
    int deleteRegionRules(@Param("regionType") String regionType,
                          @Param("regionId") String regionId,
                          @Param("configuredBy") String configuredBy);

    /** 清掉该区域**所有人**的告警规则行。仅超管保存时走这条（超管保存 = 本区重置）。 */
    int deleteAllRegionRules(@Param("regionType") String regionType,
                             @Param("regionId") String regionId);

    int insertRegionRule(@Param("regionType") String regionType,
                         @Param("regionId") String regionId,
                         @Param("statusCode") String statusCode,
                         @Param("thresholdDays") int thresholdDays,
                         @Param("action") String action,
                         @Param("enabled") int enabled,
                         @Param("startValue") int startValue,
                         @Param("configuredBy") String configuredBy);
}
