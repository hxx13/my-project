package com.example.demo.modules.broadcast.client;

/**
 * 广播平台业务错误。平台用数字码返回失败，这里翻译成人话。
 */
public class BroadcastException extends RuntimeException {

    private final int result;

    public BroadcastException(String message) {
        this(-1, message);
    }

    public BroadcastException(int result, String message) {
        super(message);
        this.result = result;
    }

    public int getResult() {
        return result;
    }

    /** 平台错误码 → 人话。表来自原厂前端代码（LoginError_Number / Error_Number）。 */
    public static String describe(int code) {
        return switch (code) {
            case 0 -> "成功";
            case -1 -> "未知错误";
            case 1 -> "用户权限不足";
            case 3 -> "目标不存在";
            case 5 -> "未登录（会话已失效）";
            case 6 -> "用户已登录";
            case 7 -> "目标不存在";
            case 8 -> "目标已存在";
            case 9 -> "目标数量不匹配";
            case 10 -> "目标格式不匹配";
            case 11 -> "目标参数不匹配";
            case 12 -> "目标忙";
            case 13 -> "目标离线";
            case 14 -> "分区编号不匹配";
            case 15 -> "超出数量限制";
            case 22 -> "定时方案编号错误";
            case 23 -> "定时点编号错误";
            case 24 -> "定时方案名称不正确";
            case 25 -> "定时点名称不正确";
            case 49 -> "操作超时（网络）";
            default -> "平台返回错误码 " + code;
        };
    }
}
