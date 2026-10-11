package com.example.demo.modules.ai.service;

import com.example.demo.modules.ai.entity.AiLearnEntry;
import com.example.demo.modules.ai.mapper.AiLearnEntryMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 影子期的**判定**：给池子里每条说法打分，过线的转正、明显有歧义的淘汰。
 *
 * <h2>量的是什么：这个说法**专不专一**</h2>
 * 设计文档想要的是「本该命中 vs 实际命中」的对照，但那需要切流量（成本高，设计里也说不做）。
 * 而**判据其实早就摆在那儿**：设计 §6 写着「同一说法学到两条不同工具 → 不合并，两条都进影子期，
 * 让数据判」—— 也就是说，一个说法如果稳定地只对上同一条工具，它就可信；
 * 如果它同时对上好几条工具，说明**这说法本身是歧义的**，不该喂给模型。
 *
 * <p>所以打分口径是：<b>这条工具的次数 ÷ 这个说法的总次数</b>。
 * 这个数**完全来自池子现成的数据**，不需要加列、不需要切流量、也不需要等「出生之后」的新样本。
 *
 * <h2>为什么不做「出生后才算样本」</h2>
 * 那条路要加时间水位列，而且**判出来的第一分必然是 100%**（关联本来就是从这批数据里学的），
 * 等于影子期是空的、全部瞬间转正。专一性这条判据没有这个毛病：它一开始就能分出高下。
 *
 * <h2>阈值是暂定的</h2>
 * 设计 §13 把「转正门槛与最小样本量」列为待定项，说「先跑出分布再定，不预设」。
 * 这里的三个常量就是**先给一版**，跑一段时间看到真实分布再调；调它们不需要动逻辑。
 */
@Service
public class AiLearnScorer {

    private static final Logger log = LoggerFactory.getLogger(AiLearnScorer.class);

    /** 最少要看过几次，才谈得上去留 —— 看过一两次的说法分不出专一还是巧合。 */
    static final int MIN_SAMPLES = 5;

    /** 到这个分就转正。 */
    static final int PROMOTE_AT = 80;

    /** 到这个分（含）以下就淘汰 —— 一个说法大半都对不上这条工具，留着只会误导模型。 */
    static final int DROP_AT = 50;

    private final AiLearnEntryMapper mapper;

    public AiLearnScorer(AiLearnEntryMapper mapper) {
        this.mapper = mapper;
    }

    /** 一条的去留判定。**纯函数**，可单测。 */
    record Verdict(String status, int trust, String reason) {
    }

    /**
     * 按「这条工具的次数 / 这个说法的总次数」判去留。
     *
     * @param winHits   这个说法对上**这条**工具的次数
     * @param totalHits 这个说法出现的总次数（对着所有工具合计）
     */
    static Verdict decide(int winHits, int totalHits) {
        int trust = totalHits <= 0 ? 0 : (int) Math.round(100.0 * winHits / totalHits);
        if (totalHits < MIN_SAMPLES) {
            return new Verdict(AiLearnEntry.WATCHING, trust,
                    "样本还不够（" + totalHits + "/" + MIN_SAMPLES + "），先继续观察");
        }
        if (trust >= PROMOTE_AT) {
            return new Verdict(AiLearnEntry.ACTIVE, trust,
                    "这个说法稳定对上这一条工具（" + trust + "%）");
        }
        if (trust <= DROP_AT) {
            return new Verdict(AiLearnEntry.DROPPED, trust,
                    "同一个说法对上了好几条工具（本条约 " + trust + "%），说明它本身有歧义");
        }
        return new Verdict(AiLearnEntry.WATCHING, trust, "还在摇摆（" + trust + "%），继续观察");
    }

    /**
     * 跑一遍判定，把分与去留写回池子。
     *
     * <p>只动**观察中**的那些：已经转正的再过一遍没有意义，停用/淘汰的是终态。
     *
     * @return 转正 / 淘汰 各几条
     */
    public Map<String, Integer> settle() {
        List<AiLearnEntry> rows = mapper.list(AiLearnEntry.WATCHING, 500);
        Map<String, Integer> out = new HashMap<>();
        out.put("promoted", 0);
        out.put("dropped", 0);
        out.put("kept", 0);
        if (rows == null || rows.isEmpty()) {
            return out;
        }
        // 同一个说法一共出现多少次（对着所有工具合计）—— 分母
        Map<String, Integer> totalByPhrase = new HashMap<>();
        for (AiLearnEntry e : rows) {
            if (e != null && e.getPhrase() != null) {
                totalByPhrase.merge(e.getPhrase(), e.getHits() == null ? 1 : e.getHits(), Integer::sum);
            }
        }
        for (AiLearnEntry e : rows) {
            if (e == null || e.getPhrase() == null || e.getId() == null) {
                continue;
            }
            Verdict v = decide(e.getHits() == null ? 1 : e.getHits(),
                    totalByPhrase.getOrDefault(e.getPhrase(), 1));
            if (e.getStatus() != null && !e.getStatus().equals(v.status())) {
                log.info("[ai-learn] 「{}」→ {} ：{}（{} → {}）",
                        e.getPhrase(), e.getTarget(), v.reason(), e.getStatus(), v.status());
            }
            mapper.settle(e.getId(), v.trust(), v.status());
            if (AiLearnEntry.ACTIVE.equals(v.status())) {
                out.merge("promoted", 1, Integer::sum);
            } else if (AiLearnEntry.DROPPED.equals(v.status())) {
                out.merge("dropped", 1, Integer::sum);
            } else {
                out.merge("kept", 1, Integer::sum);
            }
        }
        return out;
    }
}
