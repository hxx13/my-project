package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfCodelistItem;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 码表项 mapper。 */
@Mapper
public interface CrfCodelistItemMapper {

    @Insert("INSERT INTO crf_codelist_item (codelist_id, item_code, item_label, sort_order, active) " +
            "VALUES (#{codelistId}, #{itemCode}, #{itemLabel}, #{sortOrder}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfCodelistItem row);

    @Select("SELECT * FROM crf_codelist_item WHERE id = #{id}")
    CrfCodelistItem findById(Long id);

    @Select("SELECT * FROM crf_codelist_item WHERE codelist_id = #{codelistId} ORDER BY sort_order, id")
    List<CrfCodelistItem> listByCodelistId(Long codelistId);

    @Update("UPDATE crf_codelist_item SET item_label = #{itemLabel}, sort_order = #{sortOrder}, active = #{active} " +
            "WHERE id = #{id}")
    int update(CrfCodelistItem row);

    @Select("SELECT COUNT(1) FROM crf_codelist_item WHERE codelist_id = #{codelistId} AND item_code = #{itemCode} AND active = 1")
    int countByCodelistIdAndItemCode(@Param("codelistId") Long codelistId, @Param("itemCode") String itemCode);

    @Delete("DELETE FROM crf_codelist_item WHERE id = #{id}")
    int deleteById(Long id);

    @Delete("DELETE FROM crf_codelist_item WHERE codelist_id = #{codelistId}")
    int deleteByCodelistId(Long codelistId);
}
