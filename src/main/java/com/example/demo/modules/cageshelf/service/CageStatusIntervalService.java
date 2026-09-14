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
 *
 * <p>「何时算开」不写死：每个 (笼位,状态) 的**计时起点**由配置决定（出现 1 还是出现 0 开始记录），
 * 见 {@link #foldRows}。起点定了，终点就是它的反向 —— 布尔只有两个值，所以一个配置项表达两个边。
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

    /**
     * 「特殊饲养明细」子状态的码前缀。
     *
     * <p>明细项（需喂食 / 需喝水 …）的值域由码表维护、可增长，所以它们的码不做静态映射：
     * status_code 直接 = {@code SF_} + 码表 item_code，审计行也以这个码作 field_code 落库。
     * 折叠时 `statusCodeOf` 见前缀即原样返回 —— **码就是码**，不必登记进 {@link #STATUS_TO_FIELD}。
     * 前缀同时是把明细码与保留的五个状态码隔开的命名空间。
     */
    public static final String DETAIL_STATUS_PREFIX = "SF_";

    /** 明细字段的 canonical（`cage_info_field`）。 */
    public static final String DETAIL_CANONICAL = "special_feeding_details";
    /** 明细的码表 code（与字段的 dict_key 一致）。 */
    public static final String DETAIL_DICT_CODE = "special_feeding_detail";
    /**
     * 「特殊饲养名称」字段的 canonical —— 明细选中集合**同步镜像**到这里（人读拼接，如「需加食、勿加水」）。
     * 那是 ARO 侧 specialBreedingName 的本地落点，下游/老链路只认它。
     */
    public static final String DETAIL_NAME_CANONICAL = "special_breeding_name";

    /** 该状态码是不是「特殊饲养明细」子状态。 */
    public static boolean isDetailStatus(String statusCode) {
        return statusCode != null && statusCode.startsWith(DETAIL_STATUS_PREFIX);
    }

    private final CageFormAuditLogMapper auditLogMapper;

    public CageStatusIntervalService(CageFormAuditLogMapper auditLogMapper) {
        this.auditLogMapper = auditLogMapper;
    }

    /**
     * field_code → status_code 反查；方法比裸 Map 反查直白，调用方不用手写反向。
     *
     * <p>明细子状态走前缀直通：{@code SF_FEED → SF_FEED}。它们不是静态字段，登记不进
     * {@link #STATUS_TO_FIELD}，但折叠拿到的区间与五个状态完全同构。
     */
    public static String statusCodeOf(String fieldCode) {
        if (isDetailStatus(fieldCode)) return fieldCode;
        return FIELD_TO_STATUS.get(fieldCode);
    }

    /**
     * 查库：五个状态字段 + **全部特殊饲养明细**（{@code SF_%} 前缀）、created_at >= since 的行，
     * 按 id 升序（**不折叠**）。
     *
     * <p>为什么把「取行」单独暴露出来：折叠需要每个 (笼位,状态) 的计时起点，而起点是区域级配置、
     * 得靠笼位集合去解析 —— 笼位集合本身又由这些行给出。所以调用方必须「先取行 → 解析方向 → 再 foldRows」。
     *
     * <p>明细按**前缀**取而不是按码表项列表取：码表项是可增长的，写死列表等于每加一项都要改代码。
     */
    public List<CageFormAuditLog> loadStatusFieldRows(LocalDateTime since) {
        return auditLogMapper.listStatusFieldRows(new ArrayList<>(STATUS_TO_FIELD.values()),
                DETAIL_STATUS_PREFIX, since);
    }

    /** (笼位,状态) 的计时起点；缺项按 true（出现 1 开始 = 现状语义，缺配置绝不把方向翻成反向）。 */
    private static boolean startValueFor(Map<Long, Map<String, Boolean>> startValueByCage,
                                        long cageId, String status) {
        if (startValueByCage == null) return true;
        Map<String, Boolean> perCage = startValueByCage.get(cageId);
        Boolean v = perCage == null ? null : perCage.get(status);
        return v == null || v;
    }

    /** null 安全的布尔比较：v 非空且等于 expected。 */
    private static boolean isBool(Boolean v, boolean expected) {
        return v != null && v == expected;
    }

    /**
     * 折叠（纯函数，单测主入口）。
     *
     * <p>区间的两个边由该 (笼位,状态) 的**计时起点**决定：出现 startValue → 开区间；变成它的反向 → 闭区间。
     * 布尔只有两个值，所以起点定了终点就是它的反向 —— true = 出现 1 开始记录、1→0 结束（默认）；
     * false = 出现 0 开始记录、0→1 结束。
     *
     * @param rows             任意顺序的审计行，内部会按 id 升序重排；不能用 created_at 排——同秒多次变更 created_at 相同
     * @param since            观测窗口下界；起算点不可观测时用它兜底 addedAt 并置 estimated=true
     * @param startValueByCage 每笼位每状态的计时起点；缺项按 true（出现 1 开始 = 现状语义）
     */
    public List<StatusInterval> foldRows(List<CageFormAuditLog> rows, LocalDateTime since,
                                         Map<Long, Map<String, Boolean>> startValueByCage) {
        LocalDateTime bound = since != null ? since : LocalDateTime.MIN;

        // 过滤：只留 data + animal_cage + 状态字段（五个特殊状态 ∪ 特殊饲养明细 SF_*）；
        // 其余字段的变更不能干扰告警区间。判定走 statusCodeOf，别再直接查静态表 ——
        // 静态表只有五项，直接查会把明细整条丢掉，明细就永远不进告警链。
        List<CageFormAuditLog> relevant = new ArrayList<>();
        if (rows != null) {
            for (CageFormAuditLog r : rows) {
                if (r == null || r.getId() == null || r.getTargetId() == null) continue;
                if (!"data".equals(r.getCategory())) continue;
                if (!"animal_cage".equals(r.getTargetType())) continue;
                if (statusCodeOf(r.getFieldCode()) == null) continue;
                relevant.add(r);
            }
        }
        // 正确性依赖 id 而非 created_at：同秒内 created_at 相同，只有自增 id 能区分先后。
        relevant.sort(Comparator.comparing(CageFormAuditLog::getId));

        Map<Key, State> states = new HashMap<>();
        List<StatusInterval> result = new ArrayList<>();

        for (CageFormAuditLog r : relevant) {
            long cageId = r.getTargetId();
            String status = statusCodeOf(r.getFieldCode());
            Key key = new Key(cageId, status);
            State st = states.computeIfAbsent(key, k -> new State());

            Boolean after = parseBool(r.getAfterValue());
            Boolean before = parseBool(r.getBeforeValue());
            if (after == null) {
                continue; // after 无法识别 → 保守跳过（宁可少算不可算错）
            }

            boolean startValue = startValueFor(startValueByCage, cageId, status);

            if (isBool(after, startValue)) {
                // 出现起点值 → 开
                if (!st.open) {
                    // 起算点是否可观测：第一次观测就落在起点值、且 before 非明确是它的反向 → 推断，用 since 兜底。
                    boolean estimated = !st.seen && !isBool(before, !startValue);
                    LocalDateTime addedAt = estimated ? bound : r.getCreatedAt();
                    StatusInterval iv = new StatusInterval(
                            cageId, status, addedAt, null, r.getOperatorId(), null, estimated);
                    st.resultIndex = result.size();
                    result.add(iv);
                    st.open = true;
                }
                // 已开又来一条起点值 → 重复开，忽略
                st.seen = true;
            } else { // after == 起点值的反向
                if (st.open) {
                    // 开 → 关：闭合当前开着的区间
                    StatusInterval open = result.get(st.resultIndex);
                    result.set(st.resultIndex, new StatusInterval(
                            open.animalCageId(), open.statusCode(), open.addedAt(),
                            r.getCreatedAt(), open.addedBy(), r.getOperatorId(), open.estimated()));
                    st.open = false;
                } else if (!st.seen && isBool(before, startValue)) {
                    // 第一次观测就是反向值、且 before 明确是起点值 → 观测窗口之前就已开着，起算点不可观测，合成一个已闭合区间。
                    // 为什么加 before 判断：写库在「某字段从未设过值、用户显式置成反向值」时会写 before=null, after=反向 这类行，
                    // 它并不表示「之前是起点值」，只是从未设过；若不筛掉会凭空造出一条假告警区间。
                    result.add(new StatusInterval(
                            cageId, status, bound, r.getCreatedAt(), null, r.getOperatorId(), true));
                }
                // 已关又来一条反向值 → 重复关，忽略
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
