package com.example.demo.modules.training.mapper;

import com.example.demo.modules.training.entity.PersonQualification;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface PersonQualificationMapper {

    @Insert("""
            INSERT INTO person_qualification (person_id, item_key, state, file_ref, updated_at)
            VALUES (#{personId}, #{itemKey}, #{state}, #{fileRef}, NOW())
            ON DUPLICATE KEY UPDATE state = #{state}, file_ref = #{fileRef}, updated_at = NOW()
            """)
    int upsert(PersonQualification q);

    @Update("""
            UPDATE person_qualification SET state = #{state}, updated_at = NOW()
            WHERE person_id = #{personId} AND item_key = #{itemKey}
            """)
    int updateStateOnly(@Param("personId") String personId,
                        @Param("itemKey") String itemKey,
                        @Param("state") Integer state);

    @Select("""
            SELECT id, person_id AS personId, item_key AS itemKey, state, file_ref AS fileRef, updated_at AS updatedAt
            FROM person_qualification WHERE person_id = #{personId} AND item_key = #{itemKey}
            """)
    PersonQualification findByPersonAndItem(@Param("personId") String personId, @Param("itemKey") String itemKey);

    /** 按该人的全部可能键查询（人员主键 + 两个账号 id），兼容历史按账号 id 存的数据。 */
    @Select("""
            <script>
            SELECT id, person_id AS personId, item_key AS itemKey, state, file_ref AS fileRef, updated_at AS updatedAt
            FROM person_qualification
            WHERE item_key = #{itemKey} AND person_id IN
            <foreach collection="keys" item="k" open="(" separator="," close=")">#{k}</foreach>
            ORDER BY updated_at DESC LIMIT 1
            </script>
            """)
    PersonQualification findByPersonKeysAndItem(@Param("keys") List<String> keys,
                                                @Param("itemKey") String itemKey);

    @Select("""
            <script>
            SELECT id, person_id AS personId, item_key AS itemKey, state, file_ref AS fileRef, updated_at AS updatedAt
            FROM person_qualification
            WHERE item_key = #{itemKey}
            <if test="personIds != null and personIds.size() > 0">
              AND person_id IN
              <foreach collection="personIds" item="p" open="(" separator="," close=")">#{p}</foreach>
            </if>
            </script>
            """)
    List<PersonQualification> listByItem(@Param("itemKey") String itemKey, @Param("personIds") List<String> personIds);
}
