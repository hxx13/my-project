package com.example.demo.modules.cageshelf.service;

import com.example.demo.modules.cageshelf.entity.CageFormAuditLog;
import com.example.demo.modules.cageshelf.mapper.CageFormAuditLogMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 把 cage_form_audit_log 的逐字段变更折叠成「某笼位某状态从何时开到何时关」的区间。
 *
 * 这是「特殊状态持续超时告警」的数据层：引擎只关心某个状态持续了多久，不关心中间改过别的字段。
 * 真相源是审计日志（逐字段 before/after），不读快照；与老的快照告警链路完全无关。
 */
@Service
public class CageStatusIntervalService {

    /**
     * status_code ↔ 表单 canonical 字段码。双向都要查：
     * 折叠时 field_code → status_code，将来别处（阈值配置、前端）要 status_code → field_code。
     * 这五个是「特殊状态」字段；其余字段（experimenter_name / aup_number 等）不参与告警。
     */
    public static final Map<String, String> STATUS_TO_FIELD = Map.of(
            "NEED_DIVIDE", "needs_division",
            "SPECIAL_FEEDING", "needs_special_feeding",
            "ANIMAL_TRANSFER", "needs_transfer",
            "HEALTH_ABNORMAL", "has_health_abnormality",
            "COHABITATION", "needs_cohabitation"
    );

    private static final Map<String, String> FIELD_TO_STATUS = invert(STATUS_TO_FIELD);

    private final CageFormAuditLogMapper auditLogMapper;

    public CageStatusIntervalService(CageFormAuditLogMapper auditLogMapper) {
        this.auditLogMapper = auditLogMapper;
    }

    /** field_code → status_code 反查；方法比裸 Map 反查直白，调用方不用手写反向。 */
    public static String statusCodeOf(String fieldCode) {
        return FIELD_TO_STATUS.get(fieldCode);
    }

    /** 查库：只取五个状态字段、created_at >= since 的行，按 id 升序，再委托纯函数折叠。 */
    public List<StatusInterval> fold(LocalDateTime since) {
        List<CageFormAuditLog> rows = auditLogMapper.listStatusFieldRows(
                new ArrayList<>(STATUS_TO_FIELD.values()), since);
        return foldRows(rows, since);
    }

    /**
     * 折叠（纯函数，单测主入口）。
     *
     * @param rows  任意顺序的审计行，内部会按 id 升序重排；不能用 created_at 排——同秒多次变更 created_at 相同
     * @param since 观测窗口下界；起算点不可观测时用它兜底 addedAt 并置 estimated=true
     */
    public List<StatusInterval> foldRows(List<CageFormAuditLog> rows, LocalDateTime since) {
        LocalDateTime bound = since != null ? since : LocalDateTime.MIN;

        // 过滤：只留 data + animal_cage + 五个状态字段；其余字段的变更不能干扰告警区间。
        List<CageFormAuditLog> relevant = new ArrayList<>();
        if (rows != null) {
            for (CageFormAuditLog r : rows) {
                if (r == null || r.getId() == null || r.getTargetId() == null) continue;
                if (!"data".equals(r.getCategory())) continue;
                if (!"animal_cage".equals(r.getTargetType())) continue;
                if (!FIELD_TO_STATUS.containsKey(r.getFieldCode())) continue;
                relevant.add(r);
            }
        }
        // 正确性依赖 id 而非 created_at：同秒内 created_at 相同，只有自增 id 能区分先后。
        relevant.sort(Comparator.comparing(CageFormAuditLog::getId));

        Map<Key, State> states = new HashMap<>();
        List<StatusInterval> result = new ArrayList<>();

        for (CageFormAuditLog r : relevant) {
            long cageId = r.getTargetId();
            String status = FIELD_TO_STATUS.get(r.getFieldCode());
            Key key = new Key(cageId, status);
            State st = states.computeIfAbsent(key, k -> new State());

            Boolean after = parseBool(r.getAfterValue());
            Boolean before = parseBool(r.getBeforeValue());
            if (after == null) {
                continue; // after 无法识别 → 保守跳过（宁可少算不可算错）
            }

            if (Boolean.TRUE.equals(after)) {
                if (!st.open) {
                    // 起算点是否可观测：第一次观测就「开」且 before 非明确「关」→ 推断，用 since 兜底。
                    boolean estimated = !st.seen && !Boolean.FALSE.equals(before);
                    LocalDateTime addedAt = estimated ? bound : r.getCreatedAt();
                    StatusInterval iv = new StatusInterval(
                            cageId, status, addedAt, null, r.getOperatorId(), null, estimated);
                    st.resultIndex = result.size();
                    result.add(iv);
                    st.open = true;
                }
                // 已开又来一条「开」→ 重复开，忽略
                st.seen = true;
            } else { // after == FALSE
                if (st.open) {
                    // 开 → 关：闭合当前开着的区间
                    StatusInterval open = result.get(st.resultIndex);
                    result.set(st.resultIndex, new StatusInterval(
                            open.animalCageId(), open.statusCode(), open.addedAt(),
                            r.getCreatedAt(), open.addedBy(), r.getOperatorId(), open.estimated()));
                    st.open = false;
                } else if (!st.seen && Boolean.TRUE.equals(before)) {
                    // 第一次观测就是「关」且 before 明确是「开」→ 观测窗口之前就已开着，起算点不可观测，合成一个已闭合区间。
                    // 为什么加 before 判断：写库在「某字段从未设过值、用户显式置关」时会写 before=null, after=false 这类行，
                    // 它并不表示「之前开着」，只是从未开过；若不筛掉会凭空造出一条假告警区间。
                    result.add(new StatusInterval(
                            cageId, status, bound, r.getCreatedAt(), null, r.getOperatorId(), true));
                }
                // 已关又来一条「关」→ 重复关，忽略
                st.seen = true;
            }
        }

        result.sort(Comparator
                .comparing(StatusInterval::animalCageId)
                .thenComparing(StatusInterval::statusCode)
                .thenComparing(StatusInterval::addedAt));
        return result;
    }

    /**
     * 稳健的布尔解析：0/false（大小写不敏感）→ 关，1/true → 开；空串/null/无法识别 → null（未知）。
     * 调用方对 null 一律按「未知」保守处理，不做任何开闭判定。
     */
    private static Boolean parseBool(String v) {
        if (v == null) return null;
        String s = v.trim();
        if (s.isEmpty()) return null;
        if ("1".equals(s) || "true".equalsIgnoreCase(s)) return Boolean.TRUE;
        if ("0".equals(s) || "false".equalsIgnoreCase(s)) return Boolean.FALSE;
        return null;
    }

    private static Map<String, String> invert(Map<String, String> m) {
        Map<String, String> out = new LinkedHashMap<>();
        m.forEach((k, v) -> out.put(v, k));
        return out;
    }

    /** (笼位, 状态) 复合键。 */
    private record Key(long cageId, String status) {
    }

    /** 每个 (笼位, 状态) 的折叠中间态。 */
    private static final class State {
        boolean seen;       // 是否已见过该键的确定性行（用于判「第一条观测」）
        boolean open;       // 当前是否开着
        int resultIndex;    // 当前开着的区间在 result 里的下标（闭合时替换用）
    }

    /**
     * 一个「笼位某状态」的存续区间。
     *
     * @param addedAt    起算时刻；起算点不可观测时取 fold 的 since（estimated=true）
     * @param removedAt  null = 该状态此刻仍在
     * @param estimated  true = 起算点不可观测，调用方应改用「引擎首次见到它的时刻」起算
     */
    public record StatusInterval(
            long animalCageId,
            String statusCode,
            LocalDateTime addedAt,
            LocalDateTime removedAt,
            String addedBy,
            String removedBy,
            boolean estimated
    ) {
    }
}
