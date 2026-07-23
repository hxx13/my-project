package com.example.demo.modules.upload.service;

import com.example.demo.modules.upload.entity.UploadFileRecord;
import com.example.demo.modules.upload.mapper.UploadFileRecordMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class UploadFileRecordService {

    private final UploadFileRecordMapper mapper;

    public UploadFileRecordService(UploadFileRecordMapper mapper) {
        this.mapper = mapper;
    }

    public UploadFileRecord create(UploadFileRecord record) {
        mapper.insert(record);
        return record;
    }

    public UploadFileRecord findById(Long id) {
        return mapper.selectById(id);
    }

    public UploadFileRecord findByStorageKey(String storageKey) {
        return mapper.selectByStorageKey(storageKey);
    }

    public UploadFileRecord findByWechatFileId(String wechatFileId) {
        return mapper.selectByWechatFileId(wechatFileId);
    }

    public List<UploadFileRecord> findPendingSync(int limit) {
        return mapper.selectPendingSync(limit);
    }

    public void markSynced(Long id, String wechatFileId) {
        mapper.updateWechatFileId(id, wechatFileId, true);
    }

    public List<UploadFileRecord> findByStorageKeyIn(List<String> storageKeys) {
        if (storageKeys == null || storageKeys.isEmpty()) return List.of();
        return mapper.selectByStorageKeyIn(storageKeys);
    }

    public int countPendingSync() {
        return mapper.countPendingSync();
    }

    public void deleteById(Long id) {
        mapper.deleteById(id);
    }
}
