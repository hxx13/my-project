package com.example.demo.modules.animalorder.service;

import com.example.demo.common.exception.ErrorCodeConstants;
import com.example.demo.common.exception.TwinBusinessException;
import com.example.demo.modules.animalorder.AnimalOrderCampus;
import com.example.demo.modules.animalorder.dto.AnimalOrderHolidayDto;
import com.example.demo.modules.animalorder.dto.AnimalOrderTimePolicyAdminDto;
import com.example.demo.modules.animalorder.dto.AnimalOrderTimePolicySummaryDto;
import com.example.demo.modules.animalorder.dto.AnimalOrderWindowRuleDto;
import com.example.demo.modules.animalorder.engine.AnimalOrderTimeEngine;
import com.example.demo.modules.animalorder.engine.AnimalOrderTimeModels;
import com.example.demo.modules.animalorder.entity.AnimalOrderHoliday;
import com.example.demo.modules.animalorder.entity.AnimalOrderTimePolicy;
import com.example.demo.modules.animalorder.entity.AnimalOrderWindowRule;
import com.example.demo.modules.animalorder.mapper.AnimalOrderHolidayMapper;
import com.example.demo.modules.animalorder.mapper.AnimalOrderTimePolicyMapper;
import com.example.demo.modules.animalorder.mapper.AnimalOrderWindowRuleMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.example.demo.modules.animalorder.engine.AnimalOrderTimeModels.Policy;
import static com.example.demo.modules.animalorder.engine.AnimalOrderTimeModels.WindowRule;

@Service
public class AnimalOrderTimePolicyService {

    static final String WARNING_HOLIDAY_YEAR_EMPTY = "ANIMAL_ORDER_HOLIDAY_YEAR_EMPTY";
    private static final String CLOSED_REASON = "当前不在可购时间窗口内";
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");

    @Autowired
    private AnimalOrderTimePolicyMapper policyMapper;

    @Autowired
    private AnimalOrderWindowRuleMapper ruleMapper;

    @Autowired
    private AnimalOrderHolidayMapper holidayMapper;

    public AnimalOrderTimePolicySummaryDto getSummary(String campus, String categoryKey, ZonedDateTime at) {
        String c = AnimalOrderCampus.normalize(campus);
        ZonedDateTime when = at != null ? at : ZonedDateTime.now(ZONE);
        AnimalOrderTimePolicy policyRow = requirePolicy(c);
        AnimalOrderTimeEngine engine = buildEngine(c, when.getYear());

        boolean canOrder = engine.canOrder(when, categoryKey);
        AnimalOrderTimePolicySummaryDto dto = new AnimalOrderTimePolicySummaryDto();
        dto.setCampus(c);
        dto.setDefaultMode(policyRow.getDefaultMode());
        dto.setEtaMode(policyRow.getEtaMode());
        dto.setEtaWorkdayOffset(policyRow.getEtaWorkdayOffset());
        dto.setEtaWeekday(policyRow.getEtaWeekday());
        dto.setCanOrderNow(canOrder);
        if (!canOrder) {
            dto.setClosedReason(CLOSED_REASON);
            dto.setNextOpenAt(engine.findNextOpenAt(when, categoryKey));
        }
        dto.setEstimatedDeliveryDate(engine.estimateDelivery(when, categoryKey));
        dto.setWarnings(buildHolidayWarnings(when.getYear()));
        return dto;
    }

    public boolean canOrderAt(String campus, ZonedDateTime at, String categoryKey) {
        String c = AnimalOrderCampus.normalize(campus);
        ZonedDateTime when = at != null ? at : ZonedDateTime.now(ZONE);
        return buildEngine(c, when.getYear()).canOrder(when, categoryKey);
    }

    public LocalDate estimateDeliveryAt(String campus, ZonedDateTime at, String categoryKey) {
        String c = AnimalOrderCampus.normalize(campus);
        ZonedDateTime when = at != null ? at : ZonedDateTime.now(ZONE);
        return buildEngine(c, when.getYear()).estimateDelivery(when, categoryKey);
    }

    public AnimalOrderTimePolicyAdminDto getAdminView(String campus) {
        String c = AnimalOrderCampus.normalize(campus);
        AnimalOrderTimePolicy policyRow = requirePolicy(c);
        List<AnimalOrderWindowRule> ruleRows = ruleMapper.listAllByCampus(c);

        AnimalOrderTimePolicyAdminDto dto = new AnimalOrderTimePolicyAdminDto();
        dto.setCampus(c);
        dto.setDefaultMode(policyRow.getDefaultMode());
        dto.setEtaMode(policyRow.getEtaMode());
        dto.setEtaWorkdayOffset(policyRow.getEtaWorkdayOffset());
        dto.setEtaWeekday(policyRow.getEtaWeekday());
        dto.setRules(ruleRows.stream().map(this::toRuleDto).toList());
        return dto;
    }

    @Transactional(rollbackFor = Exception.class)
    public void saveAdmin(String campus, AnimalOrderTimePolicyAdminDto body) {
        if (body == null) {
            throw new IllegalArgumentException("请求体不能为空");
        }
        String c = AnimalOrderCampus.normalize(campus);
        validateEtaPolicy(body);

        List<AnimalOrderWindowRuleDto> ruleDtos = body.getRules() != null ? body.getRules() : List.of();
        for (AnimalOrderWindowRuleDto ruleDto : ruleDtos) {
            if (ruleDto.getActive() != null && ruleDto.getActive() == 0) {
                continue;
            }
            normalizeAndValidateRule(ruleDto);
        }

        AnimalOrderTimePolicy policyRow = requirePolicy(c);
        policyRow.setDefaultMode(body.getDefaultMode());
        policyRow.setEtaMode(body.getEtaMode());
        policyRow.setEtaWorkdayOffset(body.getEtaWorkdayOffset());
        policyRow.setEtaWeekday("FIXED".equals(body.getEtaMode()) ? body.getEtaWeekday() : null);
        policyMapper.update(policyRow);

        for (AnimalOrderWindowRuleDto ruleDto : ruleDtos) {
            if (ruleDto.getActive() != null && ruleDto.getActive() == 0) {
                if (ruleDto.getId() != null) {
                    ruleMapper.softDelete(ruleDto.getId());
                }
                continue;
            }
            normalizeAndValidateRule(ruleDto);
            AnimalOrderWindowRule row = fromRuleDto(ruleDto);
            // 校区由请求参数决定，不允许被请求体里的行数据改写
            row.setCampus(c);
            if (row.getActive() == null) {
                row.setActive(1);
            }
            if (row.getSortOrder() == null) {
                row.setSortOrder(0);
            }
            if (row.getId() == null) {
                ruleMapper.insert(row);
            } else {
                ruleMapper.update(row);
            }
        }

        // 显式删除：软删除（置 deleted=1，行保留），只处理既在 deletedRuleIds 里、又没被本次提交同时更新的行
        Set<Long> upsertedIds = new HashSet<>();
        for (AnimalOrderWindowRuleDto ruleDto : ruleDtos) {
            if (ruleDto.getId() != null) {
                upsertedIds.add(ruleDto.getId());
            }
        }
        if (body.getDeletedRuleIds() != null) {
            for (Long id : body.getDeletedRuleIds()) {
                if (id != null && !upsertedIds.contains(id)) {
                    ruleMapper.markDeleted(id);
                }
            }
        }
    }

    public List<AnimalOrderHolidayDto> listHolidays(int year) {
        return holidayMapper.listByYear(year).stream().map(this::toHolidayDto).toList();
    }

    public AnimalOrderHolidayDto upsertHoliday(AnimalOrderHolidayDto dto) {
        if (dto == null || dto.getHolidayDate() == null || !StringUtils.hasText(dto.getDayType())) {
            throw new IllegalArgumentException("节假日日期与类型不能为空");
        }
        AnimalOrderHoliday row = new AnimalOrderHoliday();
        row.setHolidayDate(dto.getHolidayDate());
        row.setDayType(dto.getDayType().trim());
        row.setName(dto.getName());
        row.setSource(StringUtils.hasText(dto.getSource()) ? dto.getSource().trim() : "MANUAL");
        holidayMapper.upsert(row);
        return holidayMapper.listByYear(dto.getHolidayDate().getYear()).stream()
                .filter(h -> dto.getHolidayDate().equals(h.getHolidayDate()))
                .findFirst()
                .map(this::toHolidayDto)
                .orElseGet(() -> toHolidayDto(row));
    }

    public void deleteHoliday(long id) {
        holidayMapper.deleteById(id);
    }

    private AnimalOrderTimeEngine buildEngine(String campus, int centerYear) {
        AnimalOrderTimePolicy policyRow = requirePolicy(campus);
        List<AnimalOrderWindowRule> ruleRows = ruleMapper.listActive(campus);
        Map<LocalDate, String> holidayMap = loadHolidayMap(centerYear);
        return new AnimalOrderTimeEngine(toModel(policyRow), toRules(ruleRows), holidayMap);
    }

    private AnimalOrderTimePolicy requirePolicy(String campus) {
        AnimalOrderTimePolicy policy = policyMapper.findByCampus(campus);
        if (policy == null) {
            throw new IllegalStateException("动物订购时间策略未初始化: " + campus);
        }
        return policy;
    }

    private void validateEtaPolicy(AnimalOrderTimePolicyAdminDto body) {
        if ("FIXED".equals(body.getEtaMode())) {
            Integer weekday = body.getEtaWeekday();
            if (weekday == null || weekday < 1 || weekday > 7) {
                throw TwinBusinessException.of(
                        ErrorCodeConstants.ANIMAL_ORDER_ETA_POLICY_INVALID, "固定送达星期未配置");
            }
        }
    }

    /**
     * 时段形态：
     * <ul>
     *   <li>WEEKLY / WEEKLY_SPAN：按星期循环（DAILY 归一为 WEEKLY）</li>
     *   <li>RANGE：一次性绝对区间，即「特殊时段」——全局、只能开放，区间过了自然不再命中（自动关闭）</li>
     * </ul>
     */
    private void normalizeAndValidateRule(AnimalOrderWindowRuleDto dto) {
        String shape = dto.getShape();
        if (AnimalOrderTimeEngine.SHAPE_RANGE.equals(shape)) {
            normalizeRangeRule(dto);
            return;
        }

        if (AnimalOrderTimeEngine.SHAPE_WEEKLY_SPAN.equals(shape)) {
            normalizeWeeklySpanRule(dto);
            return;
        }

        if (!AnimalOrderTimeEngine.SHAPE_WEEKLY.equals(shape)
                && !AnimalOrderTimeEngine.SHAPE_DAILY.equals(shape)) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.ANIMAL_ORDER_WINDOW_CONFLICT, "时段形态无效");
        }

        String normalized = normalizeWeekdaysCsv(dto.getWeekdays());
        // Legacy DAILY with empty weekdays = every day
        if (normalized.isEmpty() && AnimalOrderTimeEngine.SHAPE_DAILY.equals(shape)) {
            normalized = "1,2,3,4,5,6,7";
        }
        if (normalized.isEmpty()) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.ANIMAL_ORDER_WINDOW_CONFLICT, "请至少选择一个星期");
        }

        dto.setShape(AnimalOrderTimeEngine.SHAPE_WEEKLY);
        dto.setWeekdays(normalized);
        dto.setStartWeekday(null);
        dto.setEndWeekday(null);
        dto.setRangeStartAt(null);
        dto.setRangeEndAt(null);

        if (dto.getDailyStartTime() == null || dto.getDailyEndTime() == null) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.ANIMAL_ORDER_WINDOW_CONFLICT, "请填写起止时间");
        }
    }

    /** 特殊时段：一次性绝对区间。固定全局开放；区间一过引擎自然不再命中，无需额外清理任务。 */
    private void normalizeRangeRule(AnimalOrderWindowRuleDto dto) {
        if (dto.getRangeStartAt() == null || dto.getRangeEndAt() == null) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.ANIMAL_ORDER_WINDOW_CONFLICT, "请填写特殊时段的起止时间");
        }
        if (!dto.getRangeStartAt().isBefore(dto.getRangeEndAt())) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.ANIMAL_ORDER_WINDOW_CONFLICT, "特殊时段的结束时间必须晚于开始时间");
        }
        dto.setShape(AnimalOrderTimeEngine.SHAPE_RANGE);
        dto.setEffect(AnimalOrderTimeEngine.EFFECT_OPEN);
        dto.setScope("GLOBAL");
        dto.setCategoryKey(null);
        dto.setWeekdays(null);
        dto.setStartWeekday(null);
        dto.setEndWeekday(null);
        dto.setDailyStartTime(null);
        dto.setDailyEndTime(null);
    }

    private void normalizeWeeklySpanRule(AnimalOrderWindowRuleDto dto) {
        Integer startDow = dto.getStartWeekday();
        Integer endDow = dto.getEndWeekday();
        if (startDow == null || startDow < 1 || startDow > 7
                || endDow == null || endDow < 1 || endDow > 7) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.ANIMAL_ORDER_WINDOW_CONFLICT, "请选择起止星期");
        }
        if (dto.getDailyStartTime() == null || dto.getDailyEndTime() == null) {
            throw TwinBusinessException.of(
                    ErrorCodeConstants.ANIMAL_ORDER_WINDOW_CONFLICT, "请填写起止时间");
        }
        dto.setShape(AnimalOrderTimeEngine.SHAPE_WEEKLY_SPAN);
        dto.setWeekdays(null);
        dto.setStartWeekday(startDow);
        dto.setEndWeekday(endDow);
        dto.setRangeStartAt(null);
        dto.setRangeEndAt(null);
    }

    private static String normalizeWeekdaysCsv(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        java.util.TreeSet<Integer> days = new java.util.TreeSet<>();
        for (String part : raw.split(",")) {
            String trimmed = part.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            try {
                int v = Integer.parseInt(trimmed);
                if (v >= 1 && v <= 7) {
                    days.add(v);
                }
            } catch (NumberFormatException ignored) {
                // skip
            }
        }
        if (days.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (Integer d : days) {
            if (sb.length() > 0) {
                sb.append(',');
            }
            sb.append(d);
        }
        return sb.toString();
    }

    private Map<LocalDate, String> loadHolidayMap(int centerYear) {
        Map<LocalDate, String> map = new HashMap<>();
        for (int year = centerYear - 1; year <= centerYear + 1; year++) {
            for (AnimalOrderHoliday holiday : holidayMapper.listByYear(year)) {
                map.put(holiday.getHolidayDate(), holiday.getDayType());
            }
        }
        return map;
    }

    private List<String> buildHolidayWarnings(int year) {
        List<String> warnings = new ArrayList<>();
        if (holidayMapper.countByYear(year) == 0) {
            warnings.add(WARNING_HOLIDAY_YEAR_EMPTY);
        }
        return warnings;
    }

    private Policy toModel(AnimalOrderTimePolicy row) {
        int offset = row.getEtaWorkdayOffset() != null ? row.getEtaWorkdayOffset() : 0;
        return AnimalOrderTimeModels.policy(
                row.getDefaultMode(), row.getEtaMode(), offset, row.getEtaWeekday());
    }

    private List<WindowRule> toRules(List<AnimalOrderWindowRule> rows) {
        return rows.stream().map(this::toRule).toList();
    }

    private WindowRule toRule(AnimalOrderWindowRule row) {
        ZonedDateTime rangeStart = row.getRangeStartAt() != null ? row.getRangeStartAt().atZone(ZONE) : null;
        ZonedDateTime rangeEnd = row.getRangeEndAt() != null ? row.getRangeEndAt().atZone(ZONE) : null;
        int sortOrder = row.getSortOrder() != null ? row.getSortOrder() : 0;
        int active = row.getActive() != null ? row.getActive() : 1;
        return new WindowRule(
                row.getId(),
                row.getScope(),
                row.getCategoryKey(),
                row.getEffect(),
                row.getShape(),
                row.getWeekdays(),
                row.getStartWeekday(),
                row.getEndWeekday(),
                row.getDailyStartTime(),
                row.getDailyEndTime(),
                rangeStart,
                rangeEnd,
                row.getLabel(),
                sortOrder,
                active);
    }

    private AnimalOrderWindowRuleDto toRuleDto(AnimalOrderWindowRule row) {
        AnimalOrderWindowRuleDto dto = new AnimalOrderWindowRuleDto();
        dto.setId(row.getId());
        dto.setScope(row.getScope());
        dto.setCategoryKey(row.getCategoryKey());
        dto.setEffect(row.getEffect());
        dto.setShape(row.getShape());
        dto.setWeekdays(row.getWeekdays());
        dto.setStartWeekday(row.getStartWeekday());
        dto.setEndWeekday(row.getEndWeekday());
        dto.setDailyStartTime(row.getDailyStartTime());
        dto.setDailyEndTime(row.getDailyEndTime());
        dto.setRangeStartAt(row.getRangeStartAt());
        dto.setRangeEndAt(row.getRangeEndAt());
        dto.setLabel(row.getLabel());
        dto.setSortOrder(row.getSortOrder());
        dto.setActive(row.getActive());
        return dto;
    }

    private AnimalOrderWindowRule fromRuleDto(AnimalOrderWindowRuleDto dto) {
        AnimalOrderWindowRule row = new AnimalOrderWindowRule();
        row.setId(dto.getId());
        row.setScope(dto.getScope());
        row.setCategoryKey(dto.getCategoryKey());
        row.setEffect(dto.getEffect());
        row.setShape(dto.getShape());
        row.setWeekdays(dto.getWeekdays());
        row.setStartWeekday(dto.getStartWeekday());
        row.setEndWeekday(dto.getEndWeekday());
        row.setDailyStartTime(dto.getDailyStartTime());
        row.setDailyEndTime(dto.getDailyEndTime());
        row.setRangeStartAt(dto.getRangeStartAt());
        row.setRangeEndAt(dto.getRangeEndAt());
        row.setLabel(dto.getLabel());
        row.setSortOrder(dto.getSortOrder());
        row.setActive(dto.getActive());
        return row;
    }

    private AnimalOrderHolidayDto toHolidayDto(AnimalOrderHoliday row) {
        AnimalOrderHolidayDto dto = new AnimalOrderHolidayDto();
        dto.setId(row.getId());
        dto.setHolidayDate(row.getHolidayDate());
        dto.setDayType(row.getDayType());
        dto.setName(row.getName());
        dto.setSource(row.getSource());
        return dto;
    }
}
