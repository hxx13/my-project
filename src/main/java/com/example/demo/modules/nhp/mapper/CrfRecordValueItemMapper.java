package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfRecordValueItem;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 多选枚举值项 mapper。 */
@Mapper
public interface CrfRecordValueItemMapper {

    @Insert("INSERT INTO crf_record_value_item (record_value_id, codelist_item_id) " +
            "VALUES (#{recordValueId}, #{codelistItemId})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfRecordValueItem row);

    @Select("SELECT * FROM crf_record_value_item WHERE record_value_id = #{recordValueId} ORDER BY id")
    List<CrfRecordValueItem> listByRecordValueId(Long recordValueId);

    @Delete("DELETE FROM crf_record_value_item WHERE record_value_id = #{recordValueId}")
    int deleteByRecordValueId(Long recordValueId);
}
