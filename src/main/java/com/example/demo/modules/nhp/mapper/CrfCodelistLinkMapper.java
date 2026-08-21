package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfCodelistLink;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 字典项→子字典联动 mapper。 */
@Mapper
public interface CrfCodelistLinkMapper {

    @Insert("INSERT IGNORE INTO crf_codelist_link (item_id, child_codelist_id, sort_order) " +
            "VALUES (#{itemId}, #{childCodelistId}, #{sortOrder})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfCodelistLink row);

    @Select("SELECT * FROM crf_codelist_link WHERE id = #{id}")
    CrfCodelistLink findById(Long id);

    @Select("SELECT * FROM crf_codelist_link WHERE item_id = #{itemId} ORDER BY sort_order, id")
    List<CrfCodelistLink> listByItemId(Long itemId);

    /** 取某字典项指向的所有子字典码（供级联渲染）。 */
    @Select("SELECT cl.code FROM crf_codelist_link l JOIN crf_codelist cl ON cl.id = l.child_codelist_id " +
            "WHERE l.item_id = #{itemId} ORDER BY l.sort_order, l.id")
    List<String> listChildCodesByItemId(Long itemId);

    @Delete("DELETE FROM crf_codelist_link WHERE id = #{id}")
    int deleteById(Long id);

    @Delete("DELETE FROM crf_codelist_link WHERE item_id = #{itemId}")
    int deleteByItemId(Long itemId);

    /** 删掉「指向本码表」的联动（本码表作为子字典时）。 */
    @Delete("DELETE FROM crf_codelist_link WHERE child_codelist_id = #{childCodelistId}")
    int deleteByChildCodelistId(Long childCodelistId);

    /** 删掉本码表所有项上的联动。 */
    @Delete("DELETE FROM crf_codelist_link WHERE item_id IN (SELECT id FROM crf_codelist_item WHERE codelist_id = #{codelistId})")
    int deleteByParentCodelistId(Long codelistId);
}
