package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageMemberCapability;
import com.example.demo.modules.cageshelf.entity.CagePermissionCapability;
import com.example.demo.modules.cageshelf.entity.CagePermissionGrant;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/** 笼架权限矩阵 Mapper（由 @MapperScan 扫描，无需 @Mapper 注解）。 */
public interface CagePermissionMapper {
    List<CagePermissionCapability> listCapabilities();
    List<CagePermissionGrant> listGrants();
    int insertGrant(CagePermissionGrant row);
    int deleteGrant(@Param("capabilityCode") String capabilityCode,
                    @Param("identityCode") String identityCode);

    /** 某组员被组长逐人勾选的能力（user_id = personnel.id）。空 = 没配过，回落到矩阵。 */
    List<CageMemberCapability> listMemberCapabilities(@Param("userId") String userId);
    int deleteMemberCapabilities(@Param("userId") String userId);
    int insertMemberCapability(CageMemberCapability row);

    /** 某区域已开的能力码（**该区域所有组长**的并集）。空 = 该区域从未配置过（回落矩阵上限）。 */
    List<String> listRegionCapabilities(@Param("regionType") String regionType,
                                        @Param("regionId") String regionId);

    /**
     * 某区域里**某一个人**配的能力码。
     * 一个区域可以有多个饲养组长（并集生效），界面必须区分「我勾的」和「别人开的」，
     * 否则组长看到别人开的项被勾上、自己取消却毫无作用（并集里还在），会以为坏了。
     */
    List<String> listRegionCapabilitiesBy(@Param("regionType") String regionType,
                                          @Param("regionId") String regionId,
                                          @Param("configuredBy") String configuredBy);

    /**
     * 批量取这些区域的**全部配置行**（含 enabled=0 的关闭行）。regions 每项含 regionType / regionId，
     * 空列表不要传进来（会生成非法 SQL）。
     * 「逐架解析」要用它：既要知道哪些区域被配过，也要知道各自开了哪些。
     */
    List<Map<String, Object>> listRegionCapabilityRows(@Param("regions") List<Map<String, String>> regions);

    /**
     * 这些区域里**被配过**的个数（不论开还是关）。
     * 0 = 谁都没配过 → 回落矩阵上限；&gt;0 = 按行的并集生效（并集为空即本区全部关闭）。
     */
    int countConfiguredRegions(@Param("regions") List<Map<String, String>> regions);

    /**
     * 只删**这个人**在该区域配的行。
     * 早期版本按区域整片删，导致「A 组长配了 3 项 → B 组长配 1 项 → A 的 3 项被静默抹掉」。
     */
    int deleteRegionCapabilities(@Param("regionType") String regionType,
                                 @Param("regionId") String regionId,
                                 @Param("configuredBy") String configuredBy);

    /**
     * 清掉该区域**所有人**的配置。仅超管保存时走这条（超管保存 = 该区域重置）——
     * 否则别人的行在界面上是只读的「其他组长开放」，谁都删不掉，成死锁。
     */
    int deleteAllRegionCapabilities(@Param("regionType") String regionType,
                                    @Param("regionId") String regionId);

    int insertRegionCapability(@Param("regionType") String regionType,
                               @Param("regionId") String regionId,
                               @Param("capabilityCode") String capabilityCode,
                               @Param("configuredBy") String configuredBy,
                               @Param("enabled") Integer enabled);
}
