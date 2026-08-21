package com.example.demo.modules.twin.obligation.delivery;

/**
 * notify-only 渠道的引导文案与跳转目标（期 4）。
 */
public final class NotifyChannelGuide {

    private NotifyChannelGuide() {
    }

    public static String message() {
        return "请前往扫码端、手机 H5 或微信小程序完成确认";
    }

    /**
     * 相对前端路由；H5 学生端待办页。扫码端无固定路由时返回 H5。
     *
     * @param obligationId 待办 ID，可拼查询参数
     */
    public static String redirectPath(long obligationId) {
        if (obligationId > 0) {
            return "/student/obligations?focus=" + obligationId;
        }
        return "/student/obligations";
    }

    public static String redirectPathForChannel(String preferredInteractiveChannel, long obligationId) {
        String ch = preferredInteractiveChannel == null ? "" : preferredInteractiveChannel.trim().toUpperCase();
        return switch (ch) {
            case "MP" -> "/package-feature/pages/studentObligation/index?id=" + Math.max(0, obligationId);
            case "SCAN" -> redirectPath(obligationId);
            default -> redirectPath(obligationId);
        };
    }
}
