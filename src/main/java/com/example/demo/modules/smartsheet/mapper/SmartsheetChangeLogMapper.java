package com.example.demo.modules.smartsheet.mapper;

import com.example.demo.modules.smartsheet.entity.SmartsheetChangeLog;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface SmartsheetChangeLogMapper {

    @Insert("INSERT INTO smartsheet_change_log (sheet_id, row_id, column_key, old_value, new_value, changed_by, changed_at) " +
            "VALUES (#{sheetId}, #{rowId}, #{columnKey}, #{oldValue}, #{newValue}, #{changedBy}, NOW())")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(SmartsheetChangeLog log);

    @Select("SELECT * FROM smartsheet_change_log WHERE row_id = #{rowId} ORDER BY changed_at DESC")
    List<SmartsheetChangeLog> selectByRowId(@Param("rowId") Long rowId);

    @Delete("DELETE FROM smartsheet_change_log WHERE sheet_id = #{sheetId}")
    int deleteBySheetId(@Param("sheetId") Long sheetId);
}
