package com.example.demo.modules.smartsheet.mapper;

import com.example.demo.modules.smartsheet.entity.SmartsheetRow;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface SmartsheetRowMapper {

    @Select("SELECT * FROM smartsheet_row WHERE sheet_id = #{sheetId} ORDER BY row_index ASC")
    List<SmartsheetRow> selectBySheetId(@Param("sheetId") Long sheetId);

    @Select("SELECT * FROM smartsheet_row WHERE id = #{id}")
    SmartsheetRow selectById(@Param("id") Long id);

    @Insert("INSERT INTO smartsheet_row (sheet_id, row_index, row_entity_id, row_label, cell_data, version, created_at, updated_at) " +
            "VALUES (#{sheetId}, #{rowIndex}, #{rowEntityId}, #{rowLabel}, #{cellData}, 0, NOW(), NOW())")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(SmartsheetRow row);

    @Update("UPDATE smartsheet_row SET row_label = #{rowLabel}, cell_data = #{cellData}, version = version + 1, updated_at = NOW() " +
            "WHERE id = #{id} AND version = #{version}")
    int update(SmartsheetRow row);

    @Update("UPDATE smartsheet_row SET cell_data = #{cellData}, version = version + 1, updated_at = NOW() " +
            "WHERE id = #{id} AND version = #{version}")
    int updateCellData(@Param("id") Long id, @Param("cellData") String cellData, @Param("version") Integer version);

    @Delete("DELETE FROM smartsheet_row WHERE id = #{id}")
    int deleteById(@Param("id") Long id);

    @Delete("DELETE FROM smartsheet_row WHERE sheet_id = #{sheetId}")
    int deleteBySheetId(@Param("sheetId") Long sheetId);

    @Insert("<script>" +
            "INSERT INTO smartsheet_row (sheet_id, row_index, row_entity_id, row_label, cell_data, version, created_at, updated_at) VALUES " +
            "<foreach collection='rows' item='r' separator=','>" +
            "(#{r.sheetId}, #{r.rowIndex}, #{r.rowEntityId}, #{r.rowLabel}, #{r.cellData}, 0, NOW(), NOW())" +
            "</foreach>" +
            "</script>")
    int insertBatch(@Param("rows") List<SmartsheetRow> rows);

    @Select("SELECT COUNT(*) FROM smartsheet_row WHERE sheet_id = #{sheetId}")
    int countBySheetId(@Param("sheetId") Long sheetId);

    @Select("SELECT COALESCE(MAX(row_index), 0) FROM smartsheet_row WHERE sheet_id = #{sheetId}")
    int maxRowIndex(@Param("sheetId") Long sheetId);
}
