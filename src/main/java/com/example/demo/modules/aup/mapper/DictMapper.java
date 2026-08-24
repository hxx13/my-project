package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.Dict;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DictMapper {
    int insert(Dict row);
    int update(Dict row);
    /** 该 dict_key 最新已发布版（status=PUBLISHED 取最大 version；无则取最大 version 兜底）。 */
    Dict findByKey(@Param("dictKey") String dictKey);
    Dict findByKeyAndVersion(@Param("dictKey") String dictKey, @Param("version") Integer version);
    /** 该 dict_key 最大 version 的一行（含草稿，作为工作副本）。 */
    Dict findLatestByKey(@Param("dictKey") String dictKey);
    /** 该 dict_key 最大 version 的 PUBLISHED 行（无则 null）。 */
    Dict findPublishedByKey(@Param("dictKey") String dictKey);
    /** 该 dict_key 当前 PUBLISHED 版本号（无则 null）。 */
    Integer findPublishedVersionByKey(@Param("dictKey") String dictKey);
    /** 该 dict_key 全部版本，按 version DESC。 */
    List<Dict> listVersionsByKey(@Param("dictKey") String dictKey);
    Dict findById(@Param("id") Long id);
    int deleteById(@Param("id") Long id);
    int updateStatus(@Param("id") Long id, @Param("status") String status);
    /** 将同 dict_key 的其它 PUBLISHED 置为 ARCHIVED。 */
    int archivePublished(@Param("dictKey") String dictKey, @Param("excludeId") Long excludeId);
    /** 每 dict_key 仅返回最新一行（供分页列表）。 */
    List<Dict> listByKeyword(@Param("keyword") String keyword,
                             @Param("category") String category,
                             @Param("limit") int limit, @Param("offset") int offset);
    /** 每 dict_key 仅统计一次。 */
    int countByKeyword(@Param("keyword") String keyword, @Param("category") String category);
    /** 引用某文件夹的码表数（删空文件夹校验）。 */
    int countByFolderId(@Param("folderId") Long folderId);
}
