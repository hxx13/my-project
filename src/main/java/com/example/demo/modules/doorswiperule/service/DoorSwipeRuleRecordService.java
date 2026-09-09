package com.example.demo.modules.doorswiperule.service;

import com.example.demo.modules.doorswiperule.entity.DoorSwipeRuleRecord;
import com.example.demo.modules.doorswiperule.mapper.DoorSwipeRuleRecordMapper;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class DoorSwipeRuleRecordService {

    private final DoorSwipeRuleRecordMapper mapper;

    public DoorSwipeRuleRecordService(DoorSwipeRuleRecordMapper mapper) {
        this.mapper = mapper;
    }

    public Map<String, Object> page(String channelCode, String person, Integer openType,
                                    String startTime, String endTime, int page, int pageSize) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(200, Math.max(1, pageSize));
        int offset = (safePage - 1) * safeSize;
        List<DoorSwipeRuleRecord> list = mapper.selectPage(channelCode, person, openType, startTime, endTime, safeSize, offset);
        long total = mapper.countPage(channelCode, person, openType, startTime, endTime);
        Map<String, Object> out = new HashMap<>();
        out.put("list", list);
        out.put("total", total);
        out.put("page", safePage);
        out.put("pageSize", safeSize);
        return out;
    }
}
