package com.example.demo.modules.animalorder.service;

import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.animalorder.dto.HolidayImportResultDto;
import com.example.demo.modules.animalorder.entity.AnimalOrderHoliday;
import com.example.demo.modules.animalorder.mapper.AnimalOrderHolidayMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.util.List;

@Service
public class HolidaySyncService {

    private static final Logger log = LoggerFactory.getLogger(HolidaySyncService.class);

    /**
     * 按顺序尝试的节假日数据源。jsdelivr 在部分网络环境下不可达（Connection refused），
     * 回退到 GitHub 原始地址；两者都失败时给出可操作的提示，而不是抛未处理异常。
     */
    private static final String[] HOLIDAY_SOURCE_URLS = {
            "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/%d.json",
            "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/%d.json",
    };

    @Autowired
    private AnimalOrderHolidayMapper holidayMapper;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    @Qualifier("holidayRestTemplate")
    private RestTemplate restTemplate;

    @Transactional(rollbackFor = Exception.class)
    public HolidayImportResultDto importJson(String json, String source) {
        return doImportJson(json, source, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public HolidayImportResultDto syncFromCdn(int year) {
        String lastError = null;
        for (String template : HOLIDAY_SOURCE_URLS) {
            String url = String.format(template, year);
            try {
                String body = restTemplate.getForObject(url, String.class);
                if (StringUtils.hasText(body)) {
                    return doImportJson(body, "CDN", year);
                }
                lastError = "数据源返回空内容";
                log.warn("[节假日同步] {} 返回空内容，尝试下一个数据源", url);
            } catch (RestClientException e) {
                lastError = e.getMessage();
                log.warn("[节假日同步] {} 拉取失败，尝试下一个数据源: {}", url, e.getMessage());
            }
        }
        throw new TwinBusinessException(502,
                "无法连接节假日数据源（" + lastError + "）。可改用「上传 JSON 文件」手动导入。");
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
