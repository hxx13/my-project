package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageAlertConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageAlertConfigMapper {

    void ensureTable();

    /** 存量表迁移：添加 mode 列 */
    void migrateSchema();

    /** 存量表迁移：删除旧 status_code 单列唯一键 */
    void migrateDropOldKey();

    /** 存量表迁移：添加 (status_code, mode) 复合唯一键 */
    void migrateAddNewKey();

    List<CageAlertConfig> selectAllEnabled(@Param("mode") String mode);

    List<CageAlertConfig> selectAll(@Param("mode") String mode);

    int deleteByMode(@Param("mode") String mode);

    int batchInsert(@Param("list") List<CageAlertConfig> configs);
}
