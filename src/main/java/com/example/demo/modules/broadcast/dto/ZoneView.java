package com.example.demo.modules.broadcast.dto;

/**
 * 分区（广播区域）对外的稳定视图。
 * 平台原始报文里字段名与本项目习惯不同，这里统一成一套，供后台页面与小程序共用。
 */
public record ZoneView(
        Integer id,
        /** 分区名称，同时也是位置标识（如「1楼走廊」「监听音箱」）。 */
        String name,
        String ip,
        String mac,
        /** 音量 0-100。 */
        Integer volume,
        /** 平台原始播放状态码。 */
        Integer playStatus,
        /** 播放状态人话。 */
        String playStatusText,
        /** 正在播的曲目名，空表示没在播。 */
        String currentSong,
        boolean playing
) {

    /** 平台状态码 → 人话（实测：4 空闲、1 播放中、2 已暂停）。 */
    public static String playStatusText(Integer code) {
        if (code == null) {
            return "未知";
        }
        return switch (code) {
            case 1 -> "播放中";
            case 2 -> "已暂停";
            case 3 -> "暂停中";
            case 4 -> "空闲";
            default -> "未知(" + code + ")";
        };
    }
}
