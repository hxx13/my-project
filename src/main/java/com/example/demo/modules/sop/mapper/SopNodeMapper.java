package com.example.demo.modules.sop.mapper;

import com.example.demo.modules.sop.entity.SopNode;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface SopNodeMapper {

    @Select("""
            SELECT id, parent_id AS parentId, name, sort_order AS sortOrder,
                   created_at AS createdAt, updated_at AS updatedAt
            FROM sop_node ORDER BY sort_order ASC, id ASC
            """)
    List<SopNode> listAll();

    @Select("""
            SELECT id, parent_id AS parentId, name, sort_order AS sortOrder,
                   created_at AS createdAt, updated_at AS updatedAt
            FROM sop_node WHERE id = #{id}
            """)
    SopNode findById(@Param("id") Long id);

    @Select("SELECT COUNT(1) FROM sop_node WHERE parent_id = #{id}")
    int countChildren(@Param("id") Long id);

    @Insert("INSERT INTO sop_node (parent_id, name, sort_order) VALUES (#{parentId}, #{name}, #{sortOrder})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(SopNode n);

    @Update("""
            UPDATE sop_node SET parent_id = #{parentId}, name = #{name}, sort_order = #{sortOrder}, updated_at = NOW()
            WHERE id = #{id}
            """)
    int update(SopNode n);

    @Delete("DELETE FROM sop_node WHERE id = #{id}")
    int delete(@Param("id") Long id);
}
