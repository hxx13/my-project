package com.example.demo.modules.notification.push.binding;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface PersonnelNotifyBindingMapper {

    @Select("SELECT * FROM personnel_notify_binding WHERE personnel_id = #{personnelId} AND channel_code = #{channelCode} LIMIT 1")
    PersonnelNotifyBinding find(@Param("personnelId") Long personnelId, @Param("channelCode") String channelCode);

    @Select("SELECT * FROM personnel_notify_binding WHERE personnel_id = #{personnelId}")
    List<PersonnelNotifyBinding> listByPersonnelId(@Param("personnelId") Long personnelId);

    @Select({
            "<script>",
            "SELECT personnel_id AS personnelId, channel_code AS channelCode, target_value AS targetValue",
            "FROM personnel_notify_binding WHERE personnel_id IN",
            "<foreach collection='ids' item='id' open='(' separator=',' close=')'>#{id}</foreach>",
            "</script>"
    })
    List<PersonnelNotifyBinding> listByPersonnelIds(@Param("ids") List<Long> ids);

    @Insert("INSERT INTO personnel_notify_binding(personnel_id, channel_code, target_value) " +
            "VALUES(#{personnelId}, #{channelCode}, #{targetValue}) " +
            "ON DUPLICATE KEY UPDATE target_value = VALUES(target_value)")
    int upsert(PersonnelNotifyBinding row);

    @Delete("DELETE FROM personnel_notify_binding WHERE personnel_id = #{personnelId} AND channel_code = #{channelCode}")
    int delete(@Param("personnelId") Long personnelId, @Param("channelCode") String channelCode);
}
