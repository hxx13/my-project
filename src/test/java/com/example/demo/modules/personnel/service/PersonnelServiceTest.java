package com.example.demo.modules.personnel.service;

import com.example.demo.modules.personnel.mapper.PersonnelMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.*;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PersonnelServiceTest {

    @Mock private JdbcTemplate jdbcTemplate;
    @Mock private PersonnelMapper personnelMapper;

    @Test
    void listRooms_splits_all_delimiters_dedups_and_keeps_order() {
        PersonnelService service = new PersonnelService(personnelMapper, jdbcTemplate);
        when(jdbcTemplate.queryForList(anyString())).thenReturn(List.of(
                Map.of("allowed_rooms_display_zh", "B5-101、B5-102，B6-201,B6-202"),
                Map.of("allowed_rooms_display_zh", "B5-101; B6-202")
        ));
        assertEquals(List.of("B5-101", "B5-102", "B6-201", "B6-202"), service.listRooms());
    }

    @Test
    void listRooms_skips_blank_or_null_rows() {
        PersonnelService service = new PersonnelService(personnelMapper, jdbcTemplate);
        Map<String, Object> nullRow = new HashMap<>();
        nullRow.put("allowed_rooms_display_zh", null);
        when(jdbcTemplate.queryForList(anyString())).thenReturn(List.of(
                Map.of("allowed_rooms_display_zh", ""),
                Map.of("allowed_rooms_display_zh", "，；"),
                nullRow
        ));
        assertEquals(List.of(), service.listRooms());
    }

    @Test
    void listRooms_splits_fullwidth_semicolon_and_skips_whitespace_tokens() {
        PersonnelService service = new PersonnelService(personnelMapper, jdbcTemplate);
        when(jdbcTemplate.queryForList(anyString())).thenReturn(List.of(
                Map.of("allowed_rooms_display_zh", "B5-101；B6-202,   ,B5-102；  ")
        ));
        assertEquals(List.of("B5-101", "B6-202", "B5-102"), service.listRooms());
    }
}
