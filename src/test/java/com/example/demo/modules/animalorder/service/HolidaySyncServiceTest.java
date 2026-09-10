package com.example.demo.modules.animalorder.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.animalorder.dto.HolidayImportResultDto;
import com.example.demo.modules.animalorder.entity.AnimalOrderHoliday;
import com.example.demo.modules.animalorder.mapper.AnimalOrderHolidayMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HolidaySyncServiceTest {

    private static final String VALID_JSON =
            "{\"year\":2026,\"days\":[{\"date\":\"2026-10-01\",\"isOffDay\":true,\"name\":\"国庆节\"}]}";

    @Mock
    private AnimalOrderHolidayMapper holidayMapper;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private RestTemplate restTemplate;

    @InjectMocks
    private HolidaySyncService service;

    @Test
    void syncFromCdn_primaryFails_fallsBackToMirror() {
        when(restTemplate.getForObject(contains("cdn.jsdelivr.net"), eq(String.class)))
                .thenThrow(new ResourceAccessException("Connection refused: connect"));
        when(restTemplate.getForObject(contains("raw.githubusercontent.com"), eq(String.class)))
                .thenReturn(VALID_JSON);
        when(holidayMapper.countByYear(2026)).thenReturn(1);

        HolidayImportResultDto result = service.syncFromCdn(2026);

        assertEquals(1, result.getUpserted());
        assertEquals(2026, result.getYear());
    }

    @Test
    void syncFromCdn_allSourcesFail_throwsBusinessErrorNotRawNetworkException() {
        when(restTemplate.getForObject(any(String.class), eq(String.class)))
                .thenThrow(new ResourceAccessException("Connection refused: connect"));

        TwinBusinessException ex = assertThrows(TwinBusinessException.class, () -> service.syncFromCdn(2026));

        assertEquals(502, ex.getCode());
        assertTrue(ex.getMessage().contains("无法连接节假日数据源"), ex.getMessage());
        assertTrue(ex.getMessage().contains("上传 JSON 文件"), ex.getMessage());
    }

    @Test
    void syncFromCdn_blankBody_fallsBackInsteadOfImportingNothing() {
        when(restTemplate.getForObject(contains("cdn.jsdelivr.net"), eq(String.class))).thenReturn("");
        when(restTemplate.getForObject(contains("raw.githubusercontent.com"), eq(String.class)))
                .thenReturn(VALID_JSON);
        when(holidayMapper.countByYear(2026)).thenReturn(1);

        HolidayImportResultDto result = service.syncFromCdn(2026);

        assertEquals(1, result.getUpserted());
    }

    @Test
    void syncFromCdn_upsertsEachDay() {
        when(restTemplate.getForObject(contains("cdn.jsdelivr.net"), eq(String.class)))
                .thenReturn("{\"year\":2026,\"days\":["
                        + "{\"date\":\"2026-10-01\",\"isOffDay\":true,\"name\":\"国庆节\"},"
                        + "{\"date\":\"2026-10-10\",\"isOffDay\":false,\"name\":\"补班\"}]}");
        when(holidayMapper.countByYear(2026)).thenReturn(2);

        HolidayImportResultDto result = service.syncFromCdn(2026);

        assertEquals(2, result.getUpserted());
        org.mockito.Mockito.verify(holidayMapper, org.mockito.Mockito.times(2))
                .upsert(any(AnimalOrderHoliday.class));
    }
}
