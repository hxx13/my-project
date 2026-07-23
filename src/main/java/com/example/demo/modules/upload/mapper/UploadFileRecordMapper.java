package com.example.demo.modules.upload.mapper;

import com.example.demo.modules.upload.entity.UploadFileRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface UploadFileRecordMapper {

    int insert(UploadFileRecord record);

    UploadFileRecord selectById(@Param("id") Long id);

    UploadFileRecord selectByStorageKey(@Param("storageKey") String storageKey);

    UploadFileRecord selectByWechatFileId(@Param("wechatFileId") String wechatFileId);

    List<UploadFileRecord> selectPendingSync(@Param("limit") int limit);

    int updateWechatFileId(@Param("id") Long id,
                           @Param("wechatFileId") String wechatFileId,
                           @Param("syncedToWechat") Boolean syncedToWechat);

    List<UploadFileRecord> selectByStorageKeyIn(@Param("keys") List<String> storageKeys);

    int countPendingSync();

    int deleteById(@Param("id") Long id);
}
