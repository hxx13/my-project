package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageInfoField;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageInfoFieldMapper {

    /** 按 sort 升序列出全部字段字典 */
    List<CageInfoField> selectAll();

    /** 按本地规范字段名查单个字段字典 */
    CageInfoField selectByCanonical(@Param("canonical") String canonical);

    /** 按角色过滤字段字典（role 默认 VALUE） */
    List<CageInfoField> selectByRole(@Param("role") String role);

    /** 按主键查单个字段字典 */
    CageInfoField selectById(@Param("id") Long id);

    /** 已发布字段（published=1），按 sort, id 升序 */
    List<CageInfoField> selectPublished();

    /** 插入自定义字段（回填自增主键） */
    int insert(CageInfoField f);

    /** 更新可编辑字段（label/dataType/dictKey/required/showWhen/sort，不动 canonical/syncSource/published） */
    int update(CageInfoField f);

    /** 按主键物理删除（仅自定义字段） */
    int deleteById(@Param("id") Long id);

    /** 批量发布指定 id 字段 */
    int markPublishedByIds(@Param("ids") List<Long> ids);

    /** 发布全部字段 */
    int markAllPublished();
}
