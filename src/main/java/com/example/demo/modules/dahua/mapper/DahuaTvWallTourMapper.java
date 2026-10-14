package com.example.demo.modules.dahua.mapper;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/** 电视墙参观模式的预设播放队列（顺序由人排，整表替换式写入）。 */
@Mapper
public interface DahuaTvWallTourMapper {

    @Select("SELECT task_id FROM dahua_tvwall_tour "
            + "WHERE tv_wall_id = #{tvWallId} ORDER BY sort_order, id")
    List<String> listTaskIds(@Param("tvWallId") String tvWallId);

    @Delete("DELETE FROM dahua_tvwall_tour WHERE tv_wall_id = #{tvWallId}")
    int deleteByWall(@Param("tvWallId") String tvWallId);

    @Insert("INSERT INTO dahua_tvwall_tour (tv_wall_id, task_id, sort_order) "
            + "VALUES (#{tvWallId}, #{taskId}, #{sortOrder})")
    int insert(@Param("tvWallId") String tvWallId,
               @Param("taskId") String taskId,
               @Param("sortOrder") int sortOrder);
}
