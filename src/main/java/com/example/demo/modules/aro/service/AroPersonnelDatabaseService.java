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

    @Autowired
    private AroPersonnelMapper aroPersonnelMapper;

    public void upsertPersonnel(List<AroPersonnel> list) {
        if (list == null || list.isEmpty()) return;

        String currentTime = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        aroPersonnelMapper.upsertPersonnelBatch(list, currentTime);
    }
}