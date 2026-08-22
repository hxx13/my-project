package com.example.demo.modules.nhp.service;

import com.example.demo.modules.nhp.entity.CrfEventRule;
import com.example.demo.modules.nhp.entity.CrfTodo;
import com.example.demo.modules.nhp.mapper.CrfEventRuleMapper;
import com.example.demo.modules.nhp.mapper.CrfSubjectMapper;
import com.example.demo.modules.nhp.mapper.CrfTodoMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * NHP 事件规则执行器（22 §6.3 / V35）。
 * onEvent：按 source_atom 匹配规则，逐条执行 action。
 */
@Service
public class NhpEventEngine {

    private static final Logger log = LoggerFactory.getLogger(NhpEventEngine.class);

    private final CrfEventRuleMapper eventRuleMapper;
    private final CrfTodoMapper todoMapper;
    private final NhpVisitService visitService;
    private final ObjectMapper objectMapper;
    private final CrfSubjectMapper subjectMapper;

    public NhpEventEngine(CrfEventRuleMapper eventRuleMapper,
                          CrfTodoMapper todoMapper,
                          NhpVisitService visitService,
                          ObjectMapper objectMapper,
                          CrfSubjectMapper subjectMapper) {
        this.eventRuleMapper = eventRuleMapper;
        this.todoMapper = todoMapper;
        this.visitService = visitService;
        this.objectMapper = objectMapper;
        this.subjectMapper = subjectMapper;
    }

    /**
     * 事件入库 / 状态变更时调用。
     *
     * @param atomCode 源原子 code（SMP/TX/AE/MED/XM…）
     * @param entityId 源实体 id
     * @param payload  可选：subjectId / transplantId / triggerOn / status / dueDate …
     */
    @Transactional
    public void onEvent(String atomCode, Long entityId, Map<String, Object> payload) {
        if (atomCode == null || atomCode.isBlank()) {
            return;
        }
        Map<String, Object> ctx = payload == null ? Map.of() : payload;
        String triggerOn = str(ctx.get("triggerOn"));
        if (triggerOn == null) {
            triggerOn = "CREATED";
        }
        String status = str(ctx.get("status"));

        List<CrfEventRule> rules = eventRuleMapper.listBySourceAtom(atomCode.trim());
        for (CrfEventRule rule : rules) {
            if (!triggerOn.equalsIgnoreCase(rule.getTriggerOn())) {
                continue;
            }
            if (rule.getTriggerCond() != null && !rule.getTriggerCond().isBlank()) {
                if (status == null || !rule.getTriggerCond().equalsIgnoreCase(status)) {
                    continue;
                }
            }
            Map<String, Object> spec = parseSpec(rule.getActionSpec());
            String action = rule.getAction() == null ? "" : rule.getAction().toUpperCase();
            switch (action) {
                case "GENERATE_TODO" -> generateTodo(entityId, ctx, spec);
                case "EXPAND_SCHEDULE" -> expandSchedule(ctx, spec);
                case "ADVANCE_STATE" -> advanceState(ctx, spec);
                case "CREATE_EVENT" ->
                        log.info("NhpEventEngine no-op action={} atom={} entityId={} spec={}",
                                action, atomCode, entityId, spec);
                default -> log.warn("NhpEventEngine unknown action={} atom={}", action, atomCode);
            }
        }
    }

    private void generateTodo(Long entityId, Map<String, Object> ctx, Map<String, Object> spec) {
        Long subjectId = longVal(ctx.get("subjectId"));
        if (subjectId == null) {
            log.warn("GENERATE_TODO skipped: subjectId missing");
            return;
        }
        String todoType = str(spec.get("todo_type"));
        if (todoType == null) {
            todoType = "GENERIC";
        }
        CrfTodo todo = new CrfTodo();
        todo.setSubjectId(subjectId);
        todo.setTransplantId(longVal(ctx.get("transplantId")));
        todo.setTodoType(todoType);
        todo.setSource("EVENT_RULE");
        todo.setSourceRef(entityId == null ? null : String.valueOf(entityId));
        Object due = ctx.get("dueDate");
        if (due instanceof LocalDate d) {
            todo.setDueDate(d);
        } else if (due instanceof String s && !s.isBlank()) {
            todo.setDueDate(LocalDate.parse(s));
        }
        todo.setStatus("OPEN");
        todo.setActive(true);
        todoMapper.insert(todo);
        log.info("GENERATE_TODO type={} subjectId={} entityId={}", todoType, subjectId, entityId);
    }

    private void expandSchedule(Map<String, Object> ctx, Map<String, Object> spec) {
        Long subjectId = longVal(ctx.get("subjectId"));
        Long transplantId = longVal(ctx.get("transplantId"));
        String anchor = str(spec.get("schedule_anchor"));
        if (anchor == null) {
            anchor = str(ctx.get("eventAnchor"));
        }
        if (anchor == null) {
            anchor = "POST_TX";
        }
        if (subjectId == null) {
            log.warn("EXPAND_SCHEDULE skipped: subjectId missing");
            return;
        }
        visitService.expandVisitPlan(subjectId, transplantId, anchor);
    }

    private void advanceState(Map<String, Object> ctx, Map<String, Object> spec) {
        Long subjectId = longVal(ctx.get("subjectId"));
        String targetState = str(spec.get("target_state"));
        if (subjectId == null || targetState == null) {
            log.warn("ADVANCE_STATE skipped: subjectId/target_state missing");
            return;
        }
        subjectMapper.updateLifecycleStage(subjectId, targetState.trim().toUpperCase());
        log.info("ADVANCE_STATE subjectId={} target={}", subjectId, targetState);
    }

    private Map<String, Object> parseSpec(String actionSpec) {
        if (actionSpec == null || actionSpec.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(actionSpec, new TypeReference<>() {});
        } catch (Exception e) {
            log.warn("invalid action_spec: {}", actionSpec);
            return Map.of();
        }
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static Long longVal(Object o) {
        if (o == null) {
            return null;
        }
        if (o instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(o));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
