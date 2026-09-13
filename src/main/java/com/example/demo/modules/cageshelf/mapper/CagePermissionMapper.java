package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageMemberCapability;
import com.example.demo.modules.cageshelf.entity.CagePermissionCapability;
import com.example.demo.modules.cageshelf.entity.CagePermissionGrant;
import org.apache.ibatis.annotations.Param;

import java.util.List;

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
}
