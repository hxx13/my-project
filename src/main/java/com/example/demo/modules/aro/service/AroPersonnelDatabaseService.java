package com.example.demo.modules.aro.service;

import com.example.demo.modules.aro.dto.AroPersonnel;
import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
public class AroPersonnelDatabaseService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AroPersonnelDatabaseService.class);

    @Autowired
    private AroPersonnelMapper aroPersonnelMapper;

    public void upsertPersonnel(List<AroPersonnel> list) {
        if (list == null || list.isEmpty()) return;

        String currentTime = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        aroPersonnelMapper.upsertPersonnelBatch(list, currentTime);

        // 同步资料字段到 sys_user（统一人员表），仅资料字段、不碰账号字段
        try {
            aroPersonnelMapper.syncProfileToSysUser();
        } catch (Exception e) {
            log.warn("[aro-personnel] 同步资料字段到 sys_user 失败: {}", e.getMessage());
        }
    }
}