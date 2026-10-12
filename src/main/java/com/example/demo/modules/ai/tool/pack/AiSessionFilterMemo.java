package com.example.demo.modules.ai.tool.pack;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 会话级的**临时参数记忆**（工具包共用）。
 *
 * <h2>为什么非有不可</h2>
 * 工具调用是**无状态**的，而「课题组 / 品系 / 时间窗」这类条件往往是**上一轮才问出来、这一轮才用到**——
 * 模型必须在每次调用里把它重新带上，而它经常不带。后果不是报错，是**静默地按全量办事**：
 * 真机上用户点完「郑俊克的课题组」，导出那次调用里课题组整个没了，导出来是全表，界面上还一切正常。
 *
 * <h2>两条定调（用户 2026-10-12）</h2>
 * <ol>
 *   <li><b>存下来，并且打包回给模型</b>（{@link #describe}）—— 只在服务端兜底是不够的：
 *       模型不知道我们记住了什么，就没法把它接着往下带、也没法跟用户核对。
 *       所以每个工具结果里都该带上「本会话已确定的条件」。</li>
 *   <li><b>有有效期</b>（默认 15 分钟）：不设限的话，早上筛过的组会在几小时后的「导全部」里
 *       悄悄生效 —— 那比丢筛选更坏（用户看到的是一张被悄悄筛小的表）。</li>
 * </ol>
 *
 * <p>用法：工具里用 {@link #merge} 把「本轮的显式参数」和记忆合成最终值，用完 {@link #remember} 写回，
 * 再把 {@link #describe} 塞进结果里。**显式参数永远优先于记忆**，模型给空串表示「这一维清掉」。
 */
public final class AiSessionFilterMemo {

    /** 默认有效期。 */
    public static final long DEFAULT_TTL_MS = 15 * 60 * 1000L;
    /** 最多记多少个会话（兜住「会话 id 无限增长」）。 */
    private static final int MAX_SESSIONS = 500;

    private final long ttlMs;
    private final Map<Long, Slot> slots = new ConcurrentHashMap<>();

    public AiSessionFilterMemo() {
        this(DEFAULT_TTL_MS);
    }

    public AiSessionFilterMemo(long ttlMs) {
        this.ttlMs = ttlMs;
    }

    /** 一个会话记下的东西 + 最后一次写入的时刻。 */
    private static final class Slot {
        final Map<String, String> values = new ConcurrentHashMap<>();
        volatile long touchedAt = System.currentTimeMillis();
    }

    /**
     * 把「本轮显式给的值」与记忆里的合成最终值。
     *
     * <p><b>显式优先</b>；显式给的是**空串**时表示**清掉这一维**（并会从记忆里删掉）——
     * 这是模型唯一能表达「这次不筛了」的方式，没有它记忆会把旧条件一直按着。
     *
     * @param explicit 维度 → 本轮显式值；值为 {@code null} 表示「本轮没提」（沿用记忆），
     *                 值为空串表示「本轮明确清掉」
     * @return 维度 → 生效值（不含被清掉的维度）
     */
    public Map<String, String> merge(Long sessionId, Map<String, String> explicit) {
        Map<String, String> memo = values(sessionId);
        Map<String, String> out = new LinkedHashMap<>();
        memo.forEach(out::put);
        if (explicit != null) {
            explicit.forEach((dim, v) -> {
                if (v == null) {
                    return;                       // 本轮没提 → 沿用记忆
                }
                if (v.isBlank()) {
                    out.remove(dim);              // 明确清掉
                } else {
                    out.put(dim, v);
                }
            });
        }
        return out;
    }

    /**
     * 把这次**生效的完整条件集**写回记忆（整体替换，不是合并）。
     *
     * <p>传进来的就是 {@link #merge} 的结果 —— 那一份本来就是「记忆 ⊕ 本轮显式」的全集，
     * 所以整体替换才是对的：**没出现在里面的维度就是被清掉了**，删干净下一轮才不会又填回来。
     * （只写不删的话，「用户说了全部」那一维会一直粘着。）
     */
    public void remember(Long sessionId, Map<String, String> effective) {
        if (sessionId == null || effective == null) return;
        Slot s = slotForWrite(sessionId);
        if (s == null) return;
        s.values.clear();
        effective.forEach((dim, v) -> {
            if (v != null && !v.isBlank()) {
                s.values.put(dim, v);
            }
        });
        s.touchedAt = System.currentTimeMillis();
    }

    /** 这一维现在记的是什么（过期 = 没记）。 */
    public String get(Long sessionId, String dim) {
        return values(sessionId).get(dim);
    }

    /** 当前还记着的（过期的会话会就地清掉）。 */
    public Map<String, String> values(Long sessionId) {
        if (sessionId == null) return Map.of();
        Slot s = slots.get(sessionId);
        if (s == null) return Map.of();
        if (System.currentTimeMillis() - s.touchedAt > ttlMs) {
            slots.remove(sessionId);
            return Map.of();
        }
        return new LinkedHashMap<>(s.values);
    }

    public void clear(Long sessionId) {
        if (sessionId != null) slots.remove(sessionId);
    }

    /**
     * 打包成一句话给模型看：**「本会话已确定的条件：课题组=郑俊克的课题组、时间=2026-09-01 至 09-30」**。
     *
     * <p>这是这套记忆真正起作用的地方 —— 模型看见它，才能接着往下带、也才能跟用户对一句
     * 「按这些条件导，对吗」。没带出来时返回 {@code null}（调用方就别写了，别塞一句空的）。
     *
     * @param labels 维度 → 给人看的名字（如 {@code projectGroup → 课题组}）；缺省就用维度原名
     */
    public String describe(Long sessionId, Map<String, String> labels) {
        Map<String, String> v = values(sessionId);
        if (v.isEmpty()) return null;
        // 有序：按 labels 给的顺序排，没在 labels 里的排后面 —— 输出稳定，模型不会以为条件变了
        LinkedHashSet<String> dims = new LinkedHashSet<>(labels == null ? java.util.List.of() : labels.keySet());
        dims.addAll(v.keySet());
        StringBuilder sb = new StringBuilder();
        for (String dim : dims) {
            String val = v.get(dim);
            if (val == null || val.isBlank()) continue;
            if (sb.length() > 0) sb.append('、');
            sb.append(labels != null && labels.containsKey(dim) ? labels.get(dim) : dim).append('=').append(val);
        }
        return sb.length() == 0 ? null : "本会话已确定的条件：" + sb;
    }

    private Slot slotForWrite(Long sessionId) {
        if (sessionId == null) return null;
        if (slots.size() > MAX_SESSIONS) {
            // 粗粒度收缩：满了一锅端。会话记忆本来就是短命的东西，不值得为它维护 LRU。
            // ponytail: 上限 500 个会话，超了整体清空；真到那天再说。
            slots.clear();
        }
        return slots.computeIfAbsent(sessionId, k -> new Slot());
    }
}
