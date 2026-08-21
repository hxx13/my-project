package com.example.demo.modules.animalorder.service;

import com.example.demo.modules.animalorder.dto.HolidayImportResultDto;
import com.example.demo.modules.animalorder.entity.AnimalOrderHoliday;
import com.example.demo.modules.animalorder.mapper.AnimalOrderHolidayMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.util.List;

@Service
public class HolidaySyncService {

    private static final String CDN_URL =
            "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/%d.json";

    @Autowired
    private AnimalOrderHolidayMapper holidayMapper;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RestTemplate restTemplate;

    @Transactional(rollbackFor = Exception.class)
    public HolidayImportResultDto importJson(String json, String source) {
        return doImportJson(json, source, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public HolidayImportResultDto syncFromCdn(int year) {
        String url = String.format(CDN_URL, year);
        String body = restTemplate.getForObject(url, String.class);
        return doImportJson(body, "CDN", year);
    }

    private HolidayImportResultDto doImportJson(String json, String source, Integer yearHint) {
        if (!StringUtils.hasText(json)) {
            return buildResult(0, resolveYear(yearHint, null));
        }

        ParsedHolidayFile parsed;
        try {
            parsed = parseHolidayJson(json.trim());
        } catch (Exception e) {
            throw new IllegalArgumentException("无效的节假日 JSON: " + e.getMessage(), e);
        }

        String normalizedSource = StringUtils.hasText(source) ? source.trim() : "IMPORT";
        int upserted = 0;
        Integer inferredYear = yearHint != null ? yearHint : parsed.year();

        for (HolidayCnDay day : parsed.days()) {
            if (day == null || !StringUtils.hasText(day.date())) {
                continue;
            }
            LocalDate holidayDate = LocalDate.parse(day.date().trim());
            if (inferredYear == null) {
                inferredYear = holidayDate.getYear();
            }

            AnimalOrderHoliday row = new AnimalOrderHoliday();
            row.setHolidayDate(holidayDate);
            row.setDayType(Boolean.TRUE.equals(day.isOffDay()) ? "HOLIDAY" : "WORKDAY_SHIFT");
            row.setName(day.name());
            row.setSource(normalizedSource);
            holidayMapper.upsert(row);
            upserted++;
        }

        int year = resolveYear(yearHint != null ? yearHint : parsed.year(), inferredYear);
        return buildResult(upserted, year);
    }

    private HolidayImportResultDto buildResult(int upserted, int year) {
        HolidayImportResultDto result = new HolidayImportResultDto();
        result.setUpserted(upserted);
        result.setYear(year);
        if (holidayMapper.countByYear(year) == 0) {
            result.getWarnings().add(AnimalOrderTimePolicyService.WARNING_HOLIDAY_YEAR_EMPTY);
        }
        return result;
    }

    private static int resolveYear(Integer yearHint, Integer inferredYear) {
        if (yearHint != null) {
            return yearHint;
        }
        if (inferredYear != null) {
            return inferredYear;
        }
        return LocalDate.now().getYear();
    }

    private ParsedHolidayFile parseHolidayJson(String json) throws Exception {
        JsonNode root = objectMapper.readTree(json);
        if (root.isArray()) {
            List<HolidayCnDay> days = objectMapper.convertValue(root, new TypeReference<List<HolidayCnDay>>() {});
            return new ParsedHolidayFile(null, days != null ? days : List.of());
        }
        if (root.isObject()) {
            Integer year = root.hasNonNull("year") ? root.get("year").asInt() : null;
            List<HolidayCnDay> days = List.of();
            if (root.has("days") && root.get("days").isArray()) {
                days = objectMapper.convertValue(root.get("days"), new TypeReference<List<HolidayCnDay>>() {});
            }
            return new ParsedHolidayFile(year, days != null ? days : List.of());
        }
        throw new IllegalArgumentException("根节点须为数组或对象");
    }

    private record ParsedHolidayFile(Integer year, List<HolidayCnDay> days) {}

    private record HolidayCnDay(String date, Boolean isOffDay, String name) {}
}
