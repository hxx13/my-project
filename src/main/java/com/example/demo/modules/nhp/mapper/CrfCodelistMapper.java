package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfCodelist;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** NHP 码表 mapper（整表版本：同 code 多行）。 */
@Mapper
public interface CrfCodelistMapper {

    @Insert("INSERT INTO crf_codelist (code, name, folder, version, status, active) " +
            "VALUES (#{code}, #{name}, #{folder}, #{version}, #{status}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfCodelist row);

    @Select("SELECT * FROM crf_codelist WHERE id = #{id}")
    CrfCodelist findById(Long id);

    /** 最新版本（version DESC）；编辑优先再走 findDraftByCode。 */
    @Select("SELECT * FROM crf_codelist WHERE code = #{code} AND active = 1 ORDER BY version DESC LIMIT 1")
    CrfCodelist findByCode(String code);

    @Select("SELECT * FROM crf_codelist WHERE code = #{code} AND version = #{version} AND active = 1 LIMIT 1")
    CrfCodelist findByCodeAndVersion(@Param("code") String code, @Param("version") int version);

    /**
     * 含软删：补位复用版号时若槽位已有 inactive 行则复活，避免 uk_(code,version) 冲突。
     */
    @Select("SELECT * FROM crf_codelist WHERE code = #{code} AND version = #{version} ORDER BY id DESC LIMIT 1")
    CrfCodelist findAnyByCodeAndVersion(@Param("code") String code, @Param("version") int version);

    @Select("SELECT * FROM crf_codelist WHERE code = #{code} AND status IN ('DRAFT','ACTIVE') AND active = 1 " +
            "ORDER BY version DESC LIMIT 1")
    CrfCodelist findDraftByCode(String code);

    @Select("SELECT * FROM crf_codelist WHERE code = #{code} AND active = 1 ORDER BY version DESC")
    List<CrfCodelist> listByCode(String code);

    /** 活跃版号列表（软删不占位，供补位分配；落库须复活同槽 inactive 行，勿盲目 INSERT）。 */
    @Select("SELECT version FROM crf_codelist WHERE code = #{code} AND active = 1")
    List<Integer> listActiveVersionsByCode(String code);

    /** 含软删：种子「曾存在则不再强行复活」。 */
    @Select("SELECT COUNT(1) FROM crf_codelist WHERE code = #{code}")
    int countAnyByCode(String code);

    /** 仅活跃行；种子升级草稿用。新建版本请用 listActiveVersionsByCode + NhpVersionAllocator。 */
    @Select("SELECT COALESCE(MAX(version), 0) FROM crf_codelist WHERE code = #{code} AND active = 1")
    int findMaxVersionByCode(String code);

    /** 全部活跃版本（含历史）；列表头由 Service 按 code 取最新。 */
    @Select("SELECT * FROM crf_codelist WHERE active = 1 ORDER BY code, version DESC")
    List<CrfCodelist> list();

    @Update("UPDATE crf_codelist SET name = #{name}, folder = #{folder}, version = #{version}, status = #{status} WHERE id = #{id}")
    int update(CrfCodelist row);

    /** 同步码表定义元数据到同 code 全部活跃版本。 */
    @Update("UPDATE crf_codelist SET name = #{name}, folder = #{folder} WHERE code = #{code} AND active = 1")
    int updateMetaByCode(@Param("code") String code, @Param("name") String name, @Param("folder") String folder);

    @Update("UPDATE crf_codelist SET status = #{status} WHERE id = #{id}")
    int updateStatus(@Param("id") Long id, @Param("status") String status);

    /** 软删后补位：复活同行并刷新元数据（version 不变）。 */
    @Update("UPDATE crf_codelist SET active = 1, name = #{name}, folder = #{folder}, status = #{status} WHERE id = #{id}")
    int reactivateAndUpdate(CrfCodelist row);

    /** 软删码表版本（保留历史引用痕迹）。 */
    @Update("UPDATE crf_codelist SET active = 0, status = 'RETIRED' WHERE id = #{id}")
    int softDelete(Long id);
}
