package com.example.demo.modules.nhp.service;

import com.example.demo.modules.nhp.entity.CrfTodo;
import com.example.demo.modules.nhp.entity.CrfTransplant;
import com.example.demo.modules.nhp.entity.CrfVisit;
import com.example.demo.modules.nhp.entity.CrfVisitInstance;
import com.example.demo.modules.nhp.entity.CrfVisitPlan;
import com.example.demo.modules.nhp.mapper.CrfTodoMapper;
import com.example.demo.modules.nhp.mapper.CrfTransplantMapper;
import com.example.demo.modules.nhp.mapper.CrfVisitInstanceMapper;
import com.example.demo.modules.nhp.mapper.CrfVisitMapper;
import com.example.demo.modules.nhp.mapper.CrfVisitPlanMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * NHP 访视展开引擎（22 §6.2 / V34+V38）。
 * expandVisitPlan：按 event_anchor + planned_days（相对 tx_date）创建 visit_instance；
 * 可读 crf_visit_plan 列出该访视应采集的原子。
 */
@Service
public class NhpVisitService {

    private static final Logger log = LoggerFactory.getLogger(NhpVisitService.class);

    private final CrfVisitMapper visitMapper;
    private final CrfVisitInstanceMapper visitInstanceMapper;
    private final CrfTransplantMapper transplantMapper;
    private final CrfVisitPlanMapper visitPlanMapper;
    private final CrfTodoMapper todoMapper;

    public NhpVisitService(CrfVisitMapper visitMapper,
                           CrfVisitInstanceMapper visitInstanceMapper,
                           CrfTransplantMapper transplantMapper,
                           CrfVisitPlanMapper visitPlanMapper,
                           CrfTodoMapper todoMapper) {
        this.visitMapper = visitMapper;
        this.visitInstanceMapper = visitInstanceMapper;
        this.transplantMapper = transplantMapper;
        this.visitPlanMapper = visitPlanMapper;
        this.todoMapper = todoMapper;
    }

    /**
     * 按组合模板 + schedule 展开 visit_instance。
     * 支持非移植锚点（HARVEST/PERFUSION/ENROLL）：传 eventAnchor，transplantId 可空。
     *
     * @return 新建或已存在的访视实例列表
     */
    @Transactional
    public List<CrfVisitInstance> expandVisitPlan(Long subjectId, Long transplantId, String eventAnchor) {
        if (subjectId == null) {
            throw new IllegalArgumentException("subjectId required");
        }
        String anchor = (eventAnchor == null || eventAnchor.isBlank()) ? "POST_TX" : eventAnchor.trim();

        LocalDate day0 = null;
        if (transplantId != null) {
            CrfTransplant tx = transplantMapper.findById(transplantId);
            if (tx != null && tx.getTxDate() != null) {
                day0 = tx.getTxDate();
            }
        }

        List<CrfVisit> visits = visitMapper.listByEventAnchor(anchor);
        if (visits == null || visits.isEmpty()) {
            // 无匹配锚点时回退全量活跃访视（兼容 seed 未填 event_anchor）
            visits = visitMapper.list();
            visits = visits.stream()
                    .filter(v -> anchor.equalsIgnoreCase(v.getEventAnchor())
                            || (v.getEventAnchor() == null && "POST_TX".equalsIgnoreCase(anchor)))
                    .toList();
        }

        List<CrfVisitInstance> created = new ArrayList<>();
        for (CrfVisit visit : visits) {
            // 事件触发类不预展开（frequency 在 form 侧；visit.repeating 作粗过滤）
            if (Boolean.TRUE.equals(visit.getRepeating()) && visit.getPlannedDays() == null) {
                continue;
            }
            LocalDate planned = null;
            if (day0 != null && visit.getPlannedDays() != null) {
                planned = day0.plusDays(visit.getPlannedDays());
            }

            CrfVisitInstance existing = visitInstanceMapper.findExisting(subjectId, visit.getId(), transplantId);
            if (existing != null) {
                created.add(existing);
                listAtomsForVisit(visit.getId()); // 触达 visit_plan（若表已就绪）
                continue;
            }

            CrfVisitInstance row = new CrfVisitInstance();
            row.setSubjectId(subjectId);
            row.setVisitId(visit.getId());
            row.setTransplantId(transplantId);
            row.setPlannedDate(planned);
            row.setStatus("PLANNED");
            visitInstanceMapper.insert(row);
            created.add(row);

            // schedule 待办：source=SCHEDULE
            CrfTodo todo = new CrfTodo();
            todo.setSubjectId(subjectId);
            todo.setTransplantId(transplantId);
            todo.setTodoType("VISIT_" + (visit.getCode() == null ? visit.getId() : visit.getCode()));
            todo.setSource("SCHEDULE");
            todo.setSourceRef(String.valueOf(row.getId()));
            todo.setDueDate(planned);
            todo.setStatus("OPEN");
            todo.setActive(true);
            todoMapper.insert(todo);

            listAtomsForVisit(visit.getId());
        }
        log.info("expandVisitPlan subjectId={} transplantId={} anchor={} instances={}",
                subjectId, transplantId, anchor, created.size());
        return created;
    }

    /**
     * 列出某访视应采集的原子（读 crf_visit_plan；表未就绪时返回空列表）。
     */
    public List<CrfVisitPlan> listAtomsForVisit(Long visitId) {
        if (visitId == null) {
            return List.of();
        }
        try {
            List<CrfVisitPlan> plans = visitPlanMapper.listByVisitId(visitId);
            return plans == null ? List.of() : plans;
        } catch (Exception e) {
            log.debug("crf_visit_plan not ready yet: {}", e.getMessage());
            return List.of();
        }
    }

    /** 列出全部访视编排（采集侧「事件→指派表单」用）。 */
    public List<CrfVisitPlan> listAllVisitPlans() {
        try {
            List<CrfVisitPlan> plans = visitPlanMapper.listAll();
            return plans == null ? List.of() : plans;
        } catch (Exception e) {
            log.debug("crf_visit_plan not ready yet: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * 整体替换某访视的原子清单（先清后插）。请求体：{@code [{atomId, required}]}。
     */
    @Transactional
    public List<CrfVisitPlan> replaceVisitPlan(Long visitId, List<Map<String, Object>> atoms) {
        if (visitId == null) {
            throw new IllegalArgumentException("visitId required");
        }
        visitPlanMapper.deleteByVisitId(visitId);
        List<CrfVisitPlan> created = new ArrayList<>();
        int order = 0;
        if (atoms != null) {
            for (Map<String, Object> atom : atoms) {
                Long atomId = asLong(atom.get("atomId"));
                if (atomId == null) continue;
                CrfVisitPlan row = new CrfVisitPlan();
                row.setVisitId(visitId);
                row.setAtomId(atomId);
                Object req = atom.get("required");
                row.setRequired(req == null ? Boolean.TRUE : Boolean.parseBoolean(String.valueOf(req)));
                Object cf = atom.get("captureForm");
                if (cf != null) {
                    String cfStr = String.valueOf(cf).trim();
                    row.setCaptureForm(cfStr.isBlank() ? null : cfStr);
                }
                row.setSortOrder(order++);
                visitPlanMapper.insert(row);
                created.add(row);
            }
        }
        return visitPlanMapper.listByVisitId(visitId);
    }

    private static Long asLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        String s = String.valueOf(v).trim();
        if (s.isEmpty() || "null".equalsIgnoreCase(s)) return null;
        return Long.parseLong(s);
    }
}
