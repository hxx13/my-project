package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfForm;
import org.apache.ibatis.annotations.*;

import java.util.List;

/**
 * NHP 表单 mapper。
 * form_type：DOMAIN/MODULE=原子模板；TEMPLATE=组合模板。
 */
@Mapper
public interface CrfFormMapper {

    @Insert("INSERT INTO crf_form (study_id, code, name, form_type, version, status, description, event_anchor, frequency, capture_form, host_type, active) " +
            "VALUES (#{studyId}, #{code}, #{name}, #{formType}, #{version}, #{status}, #{description}, #{eventAnchor}, #{frequency}, #{captureForm}, #{hostType}, #{active})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CrfForm row);

    @Select("SELECT * FROM crf_form WHERE id = #{id}")
    CrfForm findById(Long id);

    /** 最新版本（version DESC）；编辑优先再走 findDraftByCode。 */
    @Select("SELECT * FROM crf_form WHERE code = #{code} AND active = 1 ORDER BY version DESC LIMIT 1")
    CrfForm findByCode(String code);

    @Select("SELECT * FROM crf_form WHERE code = #{code} AND version = #{version} AND active = 1 LIMIT 1")
    CrfForm findByCodeAndVersion(@Param("code") String code, @Param("version") int version);

    /**
     * 含软删：补位复用版号时若槽位已有 inactive 行则复活，避免 uk_(study,code,version) 冲突。
     */
    @Select("SELECT * FROM crf_form WHERE code = #{code} AND version = #{version} ORDER BY id DESC LIMIT 1")
    CrfForm findAnyByCodeAndVersion(@Param("code") String code, @Param("version") int version);

    @Select("SELECT * FROM crf_form WHERE code = #{code} AND status = 'DRAFT' AND active = 1 ORDER BY version DESC LIMIT 1")
    CrfForm findDraftByCode(String code);

    @Select("SELECT * FROM crf_form WHERE code = #{code} AND active = 1 ORDER BY version DESC")
    List<CrfForm> listByCode(String code);

    /** 活跃版号列表（软删不占位，供补位分配；落库须复活同槽 inactive 行，勿盲目 INSERT）。 */
    @Select("SELECT version FROM crf_form WHERE code = #{code} AND active = 1")
    List<Integer> listActiveVersionsByCode(String code);

    /** @deprecated 版号改补位后仅种子兼容；请用 listActiveVersionsByCode + NhpVersionAllocator */
    @Select("SELECT COALESCE(MAX(version), 0) FROM crf_form WHERE code = #{code} AND active = 1")
    int findMaxVersionByCode(String code);

    @Select("SELECT * FROM crf_form WHERE active = 1 ORDER BY code, version DESC")
    List<CrfForm> list();

    /**
     * 原子：form_type 为 DOMAIN/MODULE/ATOM/PUBLIC（含语义码 donor_profile 与裸 Dn 域码）。
     * nhp-crf 等误标组合在 Service {@code isAtom} 二次过滤。
     */
    @Select("SELECT * FROM crf_form WHERE active = 1 "
            + "AND (form_type IS NULL OR TRIM(form_type) = '' "
            + "OR form_type IN ('DOMAIN', 'MODULE', 'ATOM', 'PUBLIC')) "
            + "AND (form_type IS NULL OR TRIM(form_type) = '' "
            + "OR form_type NOT IN ('TEMPLATE', 'COMPOSITE')) "
            + "ORDER BY code, version DESC")
    List<CrfForm> listAtoms();

    /**
     * 组合：TEMPLATE，或非原子码（纠正误标 DOMAIN 的 nhp-crf 等存量，直到 bootstrap 修好 form_type）。
     */
    @Select("SELECT * FROM crf_form WHERE active = 1 AND ("
            + "form_type IN ('TEMPLATE', 'COMPOSITE') "
            + "OR (code NOT REGEXP '^[Dd]+[0-9]{1,3}$' "
            + "AND code NOT REGEXP '^[a-zA-Z0-9_-]+__[Dd]+[0-9]{1,3}$')"
            + ") ORDER BY code, version DESC")
    List<CrfForm> listComposites();

    /** 含软删行：用于种子「曾存在则不再强行复活」。 */
    @Select("SELECT COUNT(1) FROM crf_form WHERE code = #{code}")
    int countAnyByCode(String code);

    /**
     * 归类按 formKey 整组落库：同一 code 的所有版本行一起改，
     * 新建版本时 folder_id 为 NULL 也不丢分组（读取侧按 code 取组内首个非空）。
     */
    @Update("UPDATE crf_form SET folder_id = #{folderId} WHERE code = #{code}")
    int updateFolderByCode(@Param("code") String code, @Param("folderId") Long folderId);

    /** 文件夹删除保护：统计归属该文件夹的表单（按 code 去重）。 */
    @Select("SELECT COUNT(DISTINCT code) FROM crf_form WHERE active = 1 AND folder_id = #{folderId}")
    int countByFolderId(Long folderId);

    /** 组内首个非空归属：新建版本行 folder_id 为 NULL 时回退到同 code 的既有归属。 */
    @Select("SELECT folder_id FROM crf_form WHERE code = #{code} AND folder_id IS NOT NULL LIMIT 1")
    Long findFolderIdByCode(String code);

    @Update("UPDATE crf_form SET name = #{name}, form_type = #{formType}, description = #{description}, " +
            "event_anchor = #{eventAnchor}, frequency = #{frequency}, capture_form = #{captureForm}, " +
            "host_type = #{hostType} WHERE id = #{id}")
    int update(CrfForm row);

    @Update("UPDATE crf_form SET status = #{status} WHERE id = #{id}")
    int updateStatus(@Param("id") Long id, @Param("status") String status);

    /** 软删后补位：复活同行并刷新元数据（version 不变）。 */
    @Update("UPDATE crf_form SET active = 1, name = #{name}, form_type = #{formType}, status = #{status}, "
            + "description = #{description}, event_anchor = #{eventAnchor}, frequency = #{frequency}, "
            + "capture_form = #{captureForm}, host_type = #{hostType} WHERE id = #{id}")
    int reactivateAndUpdate(CrfForm row);

    /** 软删模板版本（active=0，列表不再出现）。 */
    @Update("UPDATE crf_form SET active = 0 WHERE id = #{id}")
    int softDelete(Long id);
}
