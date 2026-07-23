package com.example.demo.modules.student.mapper;

import org.apache.ibatis.annotations.*;

import java.util.Map;

@Mapper
public interface CageCellAnnotationMapper {

    @Select("SELECT * FROM cage_cell_annotation WHERE shelve_id = #{shelveId} AND position_x = #{x} AND position_y = #{y}")
    Map<String, Object> selectByPosition(@Param("shelveId") String shelveId,
                                         @Param("x") int x,
                                         @Param("y") int y);

    @Insert("INSERT INTO cage_cell_annotation (shelve_id, position_x, position_y, position_label, rich_text, images, aro_raw_data, updated_by) " +
            "VALUES (#{shelveId}, #{x}, #{y}, #{position}, #{richText}, #{images}, #{aroRawData}, #{updatedBy}) " +
            "ON DUPLICATE KEY UPDATE rich_text = VALUES(rich_text), images = VALUES(images), " +
            "aro_raw_data = VALUES(aro_raw_data), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP")
    int upsert(@Param("shelveId") String shelveId,
               @Param("x") int x,
               @Param("y") int y,
               @Param("position") String position,
               @Param("richText") String richText,
               @Param("images") String images,
               @Param("aroRawData") String aroRawData,
               @Param("updatedBy") String updatedBy);
}
