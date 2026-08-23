package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageClaimInfoValue;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageClaimInfoValueMapper {

    /** 按 (claim_id, field_id) 幂等写入：键冲突时更新值列 + fill_source + updated_at */
    int upsert(CageClaimInfoValue v);

    /** 查某个认领的全部表单实例值 */
    List<CageClaimInfoValue> selectByClaimId(@Param("claimId") Long claimId);

    /** 查某认领是否存在任何表单实例值（hasInfo 判定用） */
    int countByClaimId(@Param("claimId") Long claimId);

    /** 清除某个认领上某个字段的实例值（value=null 语义） */
    int deleteByClaimAndField(@Param("claimId") Long claimId, @Param("fieldId") Long fieldId);

    /**
     * 把 source 认领的全部值复制到 target 认领。
     * 幂等：目标已有同键行时走 ON DUPLICATE KEY UPDATE（不会重复插入）。
     */
    int batchCopy(@Param("sourceClaimId") Long sourceClaimId,
                  @Param("targetClaimId") Long targetClaimId);
}
