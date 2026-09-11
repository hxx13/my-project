package com.example.demo.modules.animalorder.mapper;

import com.example.demo.modules.animalorder.entity.AnimalOrderWindowRule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AnimalOrderWindowRuleMapper {
    List<AnimalOrderWindowRule> listActive(@Param("campus") String campus);

    /** 管理端用：含已停用（active=0）的规则，否则停用后无法在界面上重新开启 */
    List<AnimalOrderWindowRule> listAllByCampus(@Param("campus") String campus);

    int insert(AnimalOrderWindowRule row);

    int update(AnimalOrderWindowRule row);

    /** 停用/启用开关：置 active 标志位，行保留（管理端仍可见，可再开启） */
    int softDelete(@Param("id") Long id);

    /** 软删除：置 deleted=1，列表不再返回、判定不再使用，行保留（可恢复） */
    int markDeleted(@Param("id") Long id);
}
