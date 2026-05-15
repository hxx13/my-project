package com.example.demo.modules.twin.support;

import com.example.demo.modules.twin.entity.TwinAutomationLog;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 将自动化日志 {@code detail} 中的英文 state / 通道 / roomId 等转为简短中文展示（{@code detailDisplayZh}）。
 */
public final class TwinAutomationLogDetailHumanizer {

    private static final Pattern CHANNEL = Pattern.compile("channel=([^,\\s|]+)");
    private static final Pattern ROOM_ID = Pattern.compile("roomId=([0-9]{6,32})");

    private TwinAutomationLogDetailHumanizer() {
    }

    public static void applyDetailDisplayZh(List<TwinAutomationLog> rows,
                                            Map<String, String> channelNameByCode,
                                            Map<String, String> roomNameById) {
        if (rows == null || rows.isEmpty()) {
            return;
        }
        Map<String, String> ch = channelNameByCode != null ? channelNameByCode : Map.of();
        Map<String, String> rm = roomNameById != null ? roomNameById : Map.of();
        for (TwinAutomationLog row : rows) {
            if (row == null) {
                continue;
            }
            String raw = row.getDetail();
            if (raw == null || raw.isBlank()) {
                row.setDetailDisplayZh("");
                continue;
            }
            row.setDetailDisplayZh(compactForUi(humanize(raw, ch, rm)));
        }
    }

    public static List<String> extractChannelCodes(String detail) {
        List<String> out = new ArrayList<>();
        if (detail == null || detail.isBlank()) {
            return out;
        }
        Matcher m = CHANNEL.matcher(detail);
        while (m.find()) {
            String c = m.group(1).trim();
            if (!c.isEmpty() && !out.contains(c)) {
                out.add(c);
            }
        }
        return out;
    }

    public static List<String> extractRoomIds(String detail) {
        List<String> out = new ArrayList<>();
        if (detail == null || detail.isBlank()) {
            return out;
        }
        Matcher m = ROOM_ID.matcher(detail);
        while (m.find()) {
            String id = m.group(1).trim();
            if (!id.isEmpty() && !out.contains(id)) {
                out.add(id);
            }
        }
        return out;
    }

    private static String humanize(String detail, Map<String, String> channelNameByCode, Map<String, String> roomNameById) {
        String out = detail;
        out = out.replace("state=PENDING_ACTIVATION", "扫过码了，等人去门口刷卡激活");
        out = out.replace("state=AUTO_EXIT_SCHEDULED", "到点会自动办下一步");
        out = out.replace("state=ACTIVATED", "门禁这边已经激活好了");
        out = out.replace("state=IDLE", "没在办激活这档子事");
        out = out.replace("scheduledExitAt=", "计划时刻：");

        List<String> channelKeys = new ArrayList<>(channelNameByCode.keySet());
        channelKeys.sort(Comparator.comparingInt(String::length).reversed());
        for (String code : channelKeys) {
            if (code == null || code.isBlank()) {
                continue;
            }
            String label = channelNameByCode.get(code);
            if (label == null || label.isBlank() || label.equals(code)) {
                continue;
            }
            out = out.replace("channel=" + code, "通道：" + label);
        }

        List<String> roomKeys = new ArrayList<>(roomNameById.keySet());
        roomKeys.sort(Comparator.comparingInt(String::length).reversed());
        for (String roomId : roomKeys) {
            if (roomId == null || roomId.isBlank()) {
                continue;
            }
            String rn = roomNameById.get(roomId);
            if (rn == null || rn.isBlank()) {
                continue;
            }
            out = out.replace("roomId=" + roomId, "房间：" + rn);
        }
        return out;
    }

    /** 去掉括号内英文码、多余管道段，便于列表与弹窗阅读 */
    private static String compactForUi(String s) {
        if (s == null || s.isBlank()) {
            return "";
        }
        String out = s;
        out = out.replaceAll("（state=[A-Za-z0-9_]+）", "");
        out = out.replaceAll("（channel=[^）]+）", "");
        out = out.replaceAll("（编码[^）]*）", "");
        out = out.replaceAll("（roomId=[0-9]+）", "");
        out = out.replace("autoRiskActionEnabled=关闭", "门禁联动已关闭");
        out = out.replace("autoRiskActionEnabled=打开", "门禁联动已开启");
        out = out.replaceAll("\\s*\\|\\s*", "；");
        while (out.contains("；；")) {
            out = out.replace("；；", "；");
        }
        return out.trim();
    }

    public static Map<String, String> mergeBuiltinChannelLabels(Map<String, String> fromDb) {
        Map<String, String> m = new HashMap<>();
        if (fromDb != null) {
            m.putAll(fromDb);
        }
        m.putIfAbsent(TwinActivationLinkageLabels.PENDING_ACTIVATION_CHANNEL, "还没刷到激活门—系统里先占个位帮你记时间（不是哪一扇真门）");
        return m;
    }
}
