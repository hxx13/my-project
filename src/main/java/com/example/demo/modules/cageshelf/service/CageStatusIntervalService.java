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
import java.util.Locale;
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

    // ── 通知对象（notify_target） ──

    /** 默认通知对象：原有单目标语义（五个状态 + 特殊饲养明细全用它）。 */
    public static final String TARGET_DEFAULT = "DEFAULT";
    /** 通知兽医。 */
    public static final String TARGET_VET = "VET";
    /** 通知笼位所有者。 */
    public static final String TARGET_OCCUPANT = "OCCUPANT";

    /** 健康异常的状态码 —— 目前唯一一个有多个通知对象的状态。 */
    public static final String STATUS_HEALTH_ABNORMAL = "HEALTH_ABNORMAL";

    /**
     * ARO 同步写入审计行时用的操作人标记（见 {@code CageInfoValueService.syncFromMapped}）。
     * 折叠时**不能用它开区间**：同步是全量回写，一次会给整库笼位补写状态值。
     */
    public static final String SYNC_OPERATOR = "SYNC";

    /**
     * 某状态的**通知对象域** —— 决定折叠时要为它折几条区间、每条各按哪个对象算计时起点。
     *
     * <p>这是**静态**属性而不是「配置里出现过哪些对象」：配置行可以被删、可以被绕过界面手写，
     * 而折叠的对象集合一旦随配置浮动，「规则被关掉 → 折不出区间 → 存量告警清不掉」那条
     * fail-closed 路径就会失守。静态域的语义是：只要状态存在，它的对象就固定这几个，
     * 配没配规则只影响 enabled（配不到就是 fail-closed 不告警）。
     *
     * <p>健康异常：兽医（出现 1 开始，1→0 结束）+ 笼位所有者（出现 0 开始，0→1 结束）——
     * 两个对象盯的是同一个布尔字段的**互补两段**，所以各自的计时起点可以不同。
     */
    public static List<String> notifyTargetsOf(String statusCode) {
        if (STATUS_HEALTH_ABNORMAL.equals(statusCode)) {
            return List.of(TARGET_VET, TARGET_OCCUPANT);
        }
        return List.of(TARGET_DEFAULT);
    }

    /** 归一化：空/空白一律折叠成 DEFAULT（列默认值就是它），统一大写。 */
    public static String normalizeTarget(String notifyTarget) {
        if (notifyTarget == null || notifyTarget.isBlank()) return TARGET_DEFAULT;
        return notifyTarget.trim().toUpperCase(Locale.ROOT);
    }

    /** 是否「默认对象」—— 只有它才让 active_key 保持 `笼位:状态` 的老形状（存量行不回溯）。 */
    public static boolean isDefaultTarget(String notifyTarget) {
        return TARGET_DEFAULT.equals(normalizeTarget(notifyTarget));
    }

    /** (状态, 通知对象) 的规则键 —— 计时起点按它索引，与实例键同构。 */
    public static String ruleKey(String statusCode, String notifyTarget) {
        return statusCode + ":" + normalizeTarget(notifyTarget);
    }

    /** 通知对象的中文名（阈值配置页那一列、告警视图都用它 —— 唯一出处，别在别处再抄一份）。 */
    public static String targetLabel(String notifyTarget) {
        return switch (normalizeTarget(notifyTarget)) {
            case TARGET_VET -> "通知兽医";
            case TARGET_OCCUPANT -> "通知笼位所有者";
            default -> "默认";
        };
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

    /** (笼位, 状态, 通知对象) 的计时起点；缺项按 true（出现 1 开始 = 现状语义，缺配置绝不把方向翻成反向）。 */
    private static boolean startValueFor(Map<Long, Map<String, Boolean>> startValueByCage,
                                        long cageId, String status, String notifyTarget) {
        if (startValueByCage == null) return true;
        Map<String, Boolean> perCage = startValueByCage.get(cageId);
        Boolean v = perCage == null ? null : perCage.get(ruleKey(status, notifyTarget));
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
     * @param startValueByCage 每笼位每 (状态, 通知对象) 的计时起点（键走 {@link #ruleKey}）；
     *                         缺项按 true（出现 1 开始 = 现状语义）
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

            Boolean after = parseBool(r.getAfterValue());
            Boolean before = parseBool(r.getBeforeValue());
            /*
              前后都读不出布尔才跳过。**不能因为 after 为空就跳过**：
              归档 / 退出 / 转移清空是把值整行删掉，审计里长这样：before=旧值、after=NULL ——
              那是「值没了 = 状态关了」，不是「无法识别」。
              早先这里直接 continue，于是那条状态区间永远合不上，源笼位的超时告警灯就一直挂在
              原格上不灭（2026-09-18 用户报「转移后左上角告警还停在原来那格」）。
              删值一律按「起点值的反向」处理，见下面 afterIsStart。
            */
            if (after == null && before == null) continue;

            // 一个状态可以配多个「通知对象」（目前只有健康异常：兽医 / 笼位所有者）。
            // 每个对象各折一条区间 —— 计时起点按对象配，可以不同，于是同一条审计行
            // 在两边可能一边开、一边关。两个对象各跑一遍，互不影响。
            for (String target : notifyTargetsOf(status)) {
                Key key = new Key(cageId, status, target);
                State st = states.computeIfAbsent(key, k -> new State());

                boolean startValue = startValueFor(startValueByCage, cageId, status, target);
                // after 为空（整行被删）⇒ 状态已关 = 起点值的反向
                boolean afterIsStart = after != null && isBool(after, startValue);

                /*
                  **ARO 同步写进来的行不算「进入状态」**（用户 2026-09-18 口径：要有记录、有时间戳的
                  本地变动才算）。同步是全量回写的：一次同步会给整库笼位补写 has_health_abnormality=false
                  （实测 25,916 行 null→false），把这些当成起点，再配上「出现 0 算开始」的配置
                  就是全库风暴。
                  只挡**开**这个方向：同步把状态改成关，仍然要能把区间合上，否则告警永远清不掉。
                */
                if (afterIsStart && SYNC_OPERATOR.equalsIgnoreCase(String.valueOf(r.getOperatorId()))) {
                    continue;
                }

                if (afterIsStart) {
                    // 出现起点值 → 开
                    if (!st.open) {
                        // 起算点是否可观测：第一次观测就落在起点值、且 before 非明确是它的反向 → 推断，用 since 兜底。
                        boolean estimated = !st.seen && !isBool(before, !startValue);
                        LocalDateTime addedAt = estimated ? bound : r.getCreatedAt();
                        StatusInterval iv = new StatusInterval(
                                cageId, status, target, addedAt, null, r.getOperatorId(), null, estimated);
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
                                open.animalCageId(), open.statusCode(), open.notifyTarget(), open.addedAt(),
                                r.getCreatedAt(), open.addedBy(), r.getOperatorId(), open.estimated()));
                        st.open = false;
                    } else if (!st.seen && isBool(before, startValue)) {
                        // 第一次观测就是反向值、且 before 明确是起点值 → 观测窗口之前就已开着，起算点不可观测，合成一个已闭合区间。
                        // 为什么加 before 判断：写库在「某字段从未设过值、用户显式置成反向值」时会写 before=null, after=反向 这类行，
                        // 它并不表示「之前是起点值」，只是从未设过；若不筛掉会凭空造出一条假告警区间。
                        result.add(new StatusInterval(
                                cageId, status, target, bound, r.getCreatedAt(), null, r.getOperatorId(), true));
                    }
                    // 已关又来一条反向值 → 重复关，忽略
                    st.seen = true;
                }
            }
        }

        result.sort(Comparator
                .comparing(StatusInterval::animalCageId)
                .thenComparing(StatusInterval::statusCode)
                .thenComparing(StatusInterval::notifyTarget)
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

    /** (笼位, 状态, 通知对象) 复合键 —— 通知对象是状态身份的一部分（见 {@link #notifyTargetsOf}）。 */
    private record Key(long cageId, String status, String notifyTarget) {
    }

    /** 每个 (笼位, 状态, 通知对象) 的折叠中间态。 */
    private static final class State {
        boolean seen;       // 是否已见过该键的确定性行（用于判「第一条观测」）
        boolean open;       // 当前是否开着
        int resultIndex;    // 当前开着的区间在 result 里的下标（闭合时替换用）
    }

    /**
     * 一个「笼位某状态某通知对象」的存续区间。
     *
     * @param notifyTarget 通知对象（DEFAULT / VET / OCCUPANT）—— 同一状态可以按对象各折一条
     * @param addedAt    起算时刻；起算点不可观测时取 fold 的 since（estimated=true）
     * @param removedAt  null = 该状态此刻仍在
     * @param estimated  true = 起算点不可观测，调用方应改用「引擎首次见到它的时刻」起算
     */
    public record StatusInterval(
            long animalCageId,
            String statusCode,
            String notifyTarget,
            LocalDateTime addedAt,
            LocalDateTime removedAt,
            String addedBy,
            String removedBy,
            boolean estimated
    ) {
    }
}
