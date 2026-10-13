package com.example.demo.modules.aup;

/**
 * AUP 阶段常量的单一真相源。
 *
 * <p>此前主服务、审核服务各自定义了一份阶段常量，外部同步又内联了一套字符串映射 ——
 * 改一处漏两处是迟早的事。这里收口成一处，原先各处的常量改为指向本类的同名常量，
 * 既统一了口径，又不动各调用点的写法。
 */
public final class AupStages {

    private AupStages() {
    }

    public static final String DRAFT = "draft";
    public static final String PI_REVIEW = "piReview";
    public static final String FORMAT_REVIEW = "formatReview";
    public static final String EXPERT_REVIEW = "expertReview";
    public static final String APPROVED = "approved";
    public static final String TERMINATED = "terminated";
    public static final String EXPIRED = "expired";

    /** 可在计划书审核流程中流转的阶段（不含终态与过期） */
    public static final java.util.Set<String> REVIEW_STAGES =
            java.util.Set.of(DRAFT, PI_REVIEW, FORMAT_REVIEW, EXPERT_REVIEW);
}
