package com.example.demo.modules.student.service;

import com.example.demo.modules.aro.mapper.AroPersonnelMapper;
import com.example.demo.modules.auth.entity.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Map;

@Service
public class StudentRoomService {

    private static final Logger log = LoggerFactory.getLogger(StudentRoomService.class);

    private final AroPersonnelMapper aroPersonnelMapper;

    public StudentRoomService(AroPersonnelMapper aroPersonnelMapper) {
        this.aroPersonnelMapper = aroPersonnelMapper;
    }

    public Map<String, Object> getRooms(User user, String pinned, String floor,
                                         String status, String search,
                                         int page, int size) {
        log.debug("getRooms called: user={}, pinned={}, floor={}, status={}, search={}, page={}, size={}",
                user.getId(), pinned, floor, status, search, page, size);
        return Map.of(
                "data", Collections.emptyList(),
                "total", 0,
                "page", page,
                "size", size
        );
    }

    public void togglePin(User user, String roomId) {
        log.debug("togglePin called: user={}, roomId={}", user.getId(), roomId);
    }
}
