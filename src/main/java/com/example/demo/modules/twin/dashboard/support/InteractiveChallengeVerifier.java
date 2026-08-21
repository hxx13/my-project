package com.example.demo.modules.twin.dashboard.support;

/**
 * 交互式确认短语的服务端校验。
 *
 * <p>此前短语比对仅在浏览器中进行（InteractiveChallenge.tsx），接口不校验答案，
 * 知道 violationId + userId 即可直接调用并永久解除禁入。本类把比对搬到服务端。
 *
 * <p>注意：目标短语随通知内容下发给客户端，因此本校验是「确保调用方确实拿到过通知」
 * 级别的注意力控制，不是身份认证控制。
 */
public final class InteractiveChallengeVerifier {

    private InteractiveChallengeVerifier() {
    }

    /** 去除首尾空白；null 视为空串 */
    public static String normalize(String raw) {
        return raw == null ? "" : raw.trim();
    }

    /**
     * 答案是否匹配。期望值为空时一律不通过——无短语的记录不应走交互确认路径。
     */
    public static boolean matches(String expected, String answer) {
        String e = normalize(expected);
        if (e.isEmpty()) {
            return false;
        }
        return e.equals(normalize(answer));
    }
}
