package com.example.demo.modules.nhp.mapper;

import com.example.demo.modules.nhp.entity.CrfAttachment;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CrfAttachmentMapper {

    int insert(CrfAttachment attachment);

    CrfAttachment selectByRecordIdAndFileId(@Param("recordId") Long recordId, @Param("fileId") Long fileId);

    CrfAttachment selectByFileId(@Param("fileId") Long fileId);

    List<CrfAttachment> selectActiveByRecordId(@Param("recordId") Long recordId);

    int countActiveByRecordId(@Param("recordId") Long recordId);

    int softDeleteById(@Param("id") Long id);
}
