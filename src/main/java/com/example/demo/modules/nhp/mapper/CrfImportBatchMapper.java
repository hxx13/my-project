package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfImportBatch;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 数据导入批次 mapper。 */
@Mapper
public interface CrfImportBatchMapper {

    @Insert("INSERT INTO crf_import_batch (form_id, file_format, file_id, operator_id, mapping_json, status) " +
            "VALUES (#{formId}, #{fileFormat}, #{fileId}, #{operatorId}, #{mappingJson}, #{status})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfImportBatch row);

    @Select("SELECT * FROM crf_import_batch WHERE id = #{id}")
    CrfImportBatch findById(Long id);

    @Select("SELECT * FROM crf_import_batch ORDER BY id DESC")
    List<CrfImportBatch> list();

    @Update("UPDATE crf_import_batch SET status = #{status}, total_rows = #{totalRows}, " +
            "success_rows = #{successRows}, failed_rows = #{failedRows}, error_json = #{errorJson} WHERE id = #{id}")
    int update(CrfImportBatch row);
}
