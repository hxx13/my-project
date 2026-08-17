package com.example.demo.modules.aup.mapper;

import com.example.demo.modules.aup.entity.AupAttachment;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AupAttachmentMapper {

    int insert(AupAttachment attachment);

    AupAttachment selectById(@Param("id") Long id);

    AupAttachment selectByAupIdAndFileId(@Param("aupId") Long aupId, @Param("fileId") Long fileId);

    AupAttachment selectByFileId(@Param("fileId") Long fileId);

    /** 未删除附件列表（deleted=0） */
    List<AupAttachment> selectActiveByAupId(@Param("aupId") Long aupId);

    /** 未删除附件数量（≤10 校验用） */
    int countActiveByAupId(@Param("aupId") Long aupId);

    /** 软删：deleted=1 */
    int softDeleteById(@Param("id") Long id);
}
