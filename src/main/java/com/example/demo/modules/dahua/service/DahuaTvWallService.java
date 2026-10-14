package com.example.demo.modules.dahua.service;

import com.example.demo.modules.dahua.mapper.DahuaTvWallTourMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 大华电视墙上墙。全部走 HTTP，不依赖 DPSDK。
 * 逆向自 ICC Client（详见 Desktop\配置环境.md 第二十章）：
 *  1) token 放 Authorization: bearer 头
 *  2) 请求包一层 PSDK 信封 {clientType/project:"PSDK"/method/data}
 *  3) 上墙 = 拼一份 TVWallScheme XML 下发 VMS.TvWall.OperateTvWall
 *  4) 通道 id 就是大华的 channelCode（形如 1000003$1$0$0）
 */
@Service
public class DahuaTvWallService {
    private static final Logger log = LoggerFactory.getLogger(DahuaTvWallService.class);

    private static final String MAC =
            "40:a6:b7:d8:b9:3f|40:a6:b7:cc:44:77|f8:ed:fc:51:d9:63|00:15:5d:01:ea:5c";

    private final DahuaAuthService authService;
    private final DahuaDeviceChannelCacheService channelCacheService;
    private final DahuaTvWallTourMapper tourMapper;

    public DahuaTvWallService(DahuaAuthService authService,
                              DahuaDeviceChannelCacheService channelCacheService,
                              DahuaTvWallTourMapper tourMapper) {
        this.authService = authService;
        this.channelCacheService = channelCacheService;
        this.tourMapper = tourMapper;
    }

    // ---------------- 查询 ----------------

    /** 电视墙列表 */
    public List<Map<String, Object>> listTvWalls() {
        Map<String, Object> resp = call("BRM.TvWall.GetTvWalls", new HashMap<>());
        return asListOfMap(asMap(resp.get("data")).get("tvWalls"));
    }

    /** 单个电视墙详情；data 字段是墙的物理屏幕布局 XML（画宫格底图用） */
    public Map<String, Object> getTvWall(String tvWallId) {
        Map<String, Object> data = new HashMap<>();
        data.put("tvWallId", tvWallId);
        Map<String, Object> wall = asMap(call("BRM.TvWall.GetTvWall", data).get("data"));
        // 顺带把物理屏解析出来：有的墙是两块电视并排，前端要按屏画
        wall.put("screens", parseWallScreens(String.valueOf(wall.get("data"))));
        return wall;
    }

    public List<Map<String, Object>> listTasks(String tvWallId) {
        Map<String, Object> data = new HashMap<>();
        data.put("tvWallId", tvWallId);
        Map<String, Object> resp = call("BRM.TvWall.GetUserTvWallTasks", data);
        return asListOfMap(asMap(resp.get("data")).get("tasks"));
    }

    public Map<String, Object> getTask(String tvWallId, String taskId) {
        Map<String, Object> data = new HashMap<>();
        data.put("tvWallId", tvWallId);
        data.put("taskId", taskId);
        Map<String, Object> task = asMap(call("BRM.TvWall.GetUserTvWallTask", data).get("data"));
        // 顺带把 XML 还原成「宫格 + 每格通道」，前端选中预设时先预览、不直接上墙
        Map<String, Object> layout = parseScheme(task.get("data") == null ? null : String.valueOf(task.get("data")));
        Map<String, Object> out = new LinkedHashMap<>(task);
        out.put("screens", layout.get("screens"));
        return out;
    }

    /**
     * 把 TVWallScheme XML 还原成 {screens:[{screenId, splitNum, windows}]}，供前端预览。
     * 必须按 Screen 分段 —— 双屏墙的两块屏各有各的窗口，合成一个列表会互相覆盖。
     */
    static Map<String, Object> parseScheme(String xml) {
        List<Map<String, Object>> screens = new ArrayList<>();
        if (xml != null && !xml.isBlank() && !"null".equals(xml)) {
            Matcher sc = Pattern.compile("<Screen\\s+([^>]*)>", Pattern.DOTALL).matcher(xml);
            while (sc.find()) {
                String attrs = sc.group(1);
                boolean selfClose = attrs.trim().endsWith("/");
                String body = "";
                if (!selfClose) {
                    int end = xml.indexOf("</Screen>", sc.end());
                    body = end < 0 ? "" : xml.substring(sc.end(), end);
                }
                Map<String, Object> s = new LinkedHashMap<>();
                s.put("screenId", attrOf(attrs, "screenId"));
                s.put("splitNum", (int) numOf(attrOf(attrs, "splitNum")));
                List<Map<String, Object>> windows = new ArrayList<>();
                // 自闭合的 <SubTv ... /> 是**空窗口**（客户端会写出来）。原来的正则要求成对闭合，
                // 碰到自闭合就把下一个窗口的通道算到自己头上，整排窗口错位一格（实测：预设「一半单画面+清洗间」）。
                Matcher sub = Pattern.compile("<SubTv\\s+([^>]*?)(?:/>|>(.*?)</SubTv>)", Pattern.DOTALL).matcher(body);
                while (sub.find()) {
                    String subAttrs = sub.group(1);
                    String subBody = sub.group(2) == null ? "" : sub.group(2);
                    Matcher ch = Pattern.compile("<Channel\\s+id=\"([^\"]+)\"(?:\\s+name=\"([^\"]*)\")?").matcher(subBody);
                    boolean hasChannel = ch.find();
                    Map<String, Object> w = new LinkedHashMap<>();
                    w.put("index", (int) numOf(attrOf(subAttrs, "id")));
                    // 空窗口也返回（画布要画出这个空格子），只是没有通道
                    w.put("channelCode", hasChannel ? ch.group(1) : "");
                    w.put("channelName", hasChannel ? unescapeXml(ch.group(2) == null ? "" : ch.group(2)) : "");
                    // 带上矩形：自定义切分的窗口不是均分的，前端要按原样摆
                    w.put("left", numOf(attrOf(subAttrs, "left")));
                    w.put("top", numOf(attrOf(subAttrs, "top")));
                    w.put("width", numOf(attrOf(subAttrs, "width")));
                    w.put("height", numOf(attrOf(subAttrs, "height")));
                    windows.add(w);
                }
                windows.sort(Comparator.comparingInt(w -> (Integer) w.get("index")));
                s.put("windows", windows);
                screens.add(s);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("screens", screens);
        return out;
    }

    private static String unescapeXml(String s) {
        return s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"")
                .replace("&apos;", "'").replace("&amp;", "&");
    }

    /** 各电视墙当前正在跑的任务（回读大屏状态） */
    public List<Map<String, Object>> listCurrentTasks(String tvWallId) {
        Map<String, Object> data = new HashMap<>();
        if (tvWallId != null && !tvWallId.isBlank()) {
            data.put("tvWallId", tvWallId);
        }
        Map<String, Object> resp = call("VMS.TvWall.GetTvWallTaskInfo", data);
        return asListOfMap(asMap(resp.get("data")).get("tasks"));
    }

    /** 某墙的屏幕容量（每屏最大窗口数等） */
    public Map<String, Object> getCapacity(String tvWallId) {
        Map<String, Object> data = new HashMap<>();
        data.put("tvWallId", tvWallId);
        return asMap(call("VMS.TvWall.GetTvWallCapacity", data).get("data"));
    }

    /** 可用视频通道（IPC + NVR），读本地缓存（由定时任务 JOB_DH_CHANNEL_REFRESH 刷新）。 */
    public List<Map<String, Object>> listVideoChannels() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (var c : channelCacheService.listVideoChannels()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("channelCode", c.getChannelCode());
            m.put("channelName", c.getChannelName());
            m.put("deviceCode", c.getDeviceCode());
            m.put("ownerCode", c.getOwnerCode());
            m.put("unitType", c.getUnitType());
            m.put("isOnline", c.getIsOnline());
            m.put("videoCategoryId", c.getVideoCategoryId());
            m.put("linkUrl", c.getLinkUrl());
            out.add(m);
        }
        return out;
    }

    // ---------------- 操作 ----------------

    /** 应用已有预设（等价客户端「选中预设 + 立即上墙」） */
    public Map<String, Object> applyTask(String tvWallId, String taskId) {
        Map<String, Object> task = getTask(tvWallId, taskId);
        String xml = String.valueOf(task.get("data"));
        if (xml == null || xml.isBlank() || "null".equals(xml)) {
            throw new IllegalStateException("预设内容为空: tvWallId=" + tvWallId + " taskId=" + taskId);
        }
        String decodeId = firstMatch(xml, "decodeId=\"(\\d+)\"");
        return operate(tvWallId, decodeId, xml);
    }

    /**
     * 按屏下发（整墙一起推）。screens = [{screenId, splitNum, windows}]；
     * 没提到的屏会输出成自闭合 = 清空那块屏，所以调用方要么带齐所有屏，要么明确只清某一块。
     */
    public Map<String, Object> operateScreens(String tvWallId, List<Map<String, Object>> screens) {
        List<Map<String, Object>> wallScreens = listWallScreens(tvWallId);
        if (wallScreens.isEmpty()) {
            throw new IllegalStateException("这面墙没有可识别的物理屏: tvWallId=" + tvWallId);
        }
        String decodeId = String.valueOf(wallScreens.get(0).getOrDefault("decodeId", ""));
        String xml = buildScheme(wallScreens, screens, "matrix");
        return operate(tvWallId, decodeId, xml);
    }

    /**
     * 兼容单屏调用（AI 工具包 / 小程序）：同一宫格与窗口铺到墙上**每一块**屏。
     * splitNum 传 0 表示清空。
     */
    public Map<String, Object> operateLayout(String tvWallId, Integer splitNum,
                                             List<Map<String, Object>> windows) {
        List<Map<String, Object>> screens = new ArrayList<>();
        for (Map<String, Object> s : listWallScreens(tvWallId)) {
            Map<String, Object> one = new LinkedHashMap<>();
            one.put("screenId", s.get("screenId"));
            one.put("splitNum", splitNum == null ? 0 : splitNum);
            one.put("windows", windows);
            screens.add(one);
        }
        return operateScreens(tvWallId, screens);
    }

    /** 兼容单屏调用（AI 工具包 / 小程序）：同一宫格与窗口铺到每一块屏。 */
    public Map<String, Object> savePreset(String tvWallId, String taskId, String taskName,
                                          Integer splitNum, List<Map<String, Object>> windows) {
        List<Map<String, Object>> screens = new ArrayList<>();
        for (Map<String, Object> s : listWallScreens(tvWallId)) {
            Map<String, Object> one = new LinkedHashMap<>();
            one.put("screenId", s.get("screenId"));
            one.put("splitNum", splitNum == null ? 0 : splitNum);
            one.put("windows", windows);
            screens.add(one);
        }
        return savePreset(tvWallId, taskId, taskName, screens);
    }

    /** 保存（或另存）预设。taskId 传空表示新建。 */
    public Map<String, Object> savePreset(String tvWallId, String taskId, String taskName,
                                          List<Map<String, Object>> screens) {
        List<Map<String, Object>> wallScreens = listWallScreens(tvWallId);
        String xml = buildScheme(wallScreens, screens, taskName);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("tvWallId", tvWallId);
        // **新建必须自己给一个没用过的 id**：平台不分配，传 0 会让所有新建预设撞在同一个
        // id 上（实测：连建两个，第一个被第二个覆盖，读回来就"空了"）。
        data.put("taskId", (taskId == null || taskId.isBlank())
                ? String.valueOf(nextTaskId(tvWallId)) : taskId);
        data.put("taskName", taskName);
        data.put("taskDesc", "");
        data.put("data", xml);
        return call("BRM.TvWall.SaveUserTvWallTask", data);
    }

    /**
     * 重命名预设：**保留原方案内容，只换名字**。
     *
     * 大华没有「改名」接口，只能按同一个 taskId 重新保存 SaveUserTvWallTask。
     * 所以取回原 XML、把 Task 上的 name 换掉、再原样存回 —— 窗口、通道、矩形一个字节都不动。
     */
    public Map<String, Object> renamePreset(String tvWallId, String taskId, String newName) {
        if (newName == null || newName.isBlank()) {
            throw new IllegalArgumentException("预设名称不能为空");
        }
        if (taskId == null || taskId.isBlank()) {
            throw new IllegalArgumentException("taskId 不能为空");
        }
        Map<String, Object> task = getTask(tvWallId, taskId);
        String xml = String.valueOf(task.get("data"));
        if (xml == null || xml.isBlank() || "null".equals(xml)) {
            throw new IllegalStateException("预设内容为空: tvWallId=" + tvWallId + " taskId=" + taskId);
        }
        String renamed = xml.replaceFirst("(<Task\s[^>]*?\bname=\")([^\"]*)(\")",
                "$1" + Matcher.quoteReplacement(esc(newName)) + "$3");

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("tvWallId", tvWallId);
        data.put("taskId", taskId);
        data.put("taskName", newName);
        data.put("taskDesc", "");
        data.put("data", renamed);
        return call("BRM.TvWall.SaveUserTvWallTask", data);
    }

    /** 取一个当前没被占用的预设 id（现有最大 + 1）——新建预设用它，避免撞 id。 */
    private long nextTaskId(String tvWallId) {
        long max = 0;
        for (Map<String, Object> t : listTasks(tvWallId)) {
            try {
                max = Math.max(max, Long.parseLong(String.valueOf(t.get("taskId"))));
            } catch (NumberFormatException ignored) {
                // 非数字 id（如 "0"）跳过
            }
        }
        return max + 1;
    }

    public Map<String, Object> deletePreset(String tvWallId, String taskId) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("tvWallId", tvWallId);
        data.put("taskId", taskId);
        return call("BRM.TvWall.DeleteUserTvWallTask", data);
    }

    // ---------------- 参观模式：预设播放队列 ----------------

    /** 这面墙的参观顺序（预设 id 有序）。孤儿行（平台上预设已删）由调用方按预设清单过滤。 */
    public List<String> listTour(String tvWallId) {
        return tourMapper.listTaskIds(tvWallId);
    }

    /**
     * 整队替换：传进来的顺序就是参观顺序。
     * 用「先清后插」而不是逐行 diff —— 队列最多十几条，简单且天然幂等；
     * 前端每次改动都会整份提交，diff 只会带来不必要的状态。
     */
    public List<String> replaceTour(String tvWallId, List<String> taskIds) {
        tourMapper.deleteByWall(tvWallId);
        List<String> out = new ArrayList<>();
        if (taskIds == null) {
            return out;
        }
        int order = 0;
        for (String raw : taskIds) {
            String id = raw == null ? "" : raw.trim();
            // 同一个预设只能出现一次（表上有唯一键），重复的直接跳过，别让整次保存失败
            if (id.isEmpty() || out.contains(id)) {
                continue;
            }
            tourMapper.insert(tvWallId, id, order++);
            out.add(id);
        }
        return out;
    }

    // ---------------- 布局几何 ----------------

    /**
     * 第 index 个窗口在屏上的百分比矩形 {left,top,width,height}。
     * 平方宫格(1/4/9/16/36/64)按 N×N 均分；5 宫格=左半大窗+右半 2×2（实测自客户端）。
     */
    static double[] rect(int splitNum, int index) {
        if (splitNum == 5) {
            if (index == 0) return new double[]{0, 0, 50, 100};
            int i = index - 1;                 // 右侧 2×2
            double col = (i % 2 == 0) ? 50 : 75;
            double row = (i < 2) ? 0 : 50;
            return new double[]{col, row, 25, 50};
        }
        int n = (int) Math.round(Math.sqrt(splitNum));
        if (n < 1) n = 1;
        double w = 100.0 / n;
        int r = index / n, c = index % n;
        return new double[]{c * w, r * w, w, w};
    }

    /**
     * 墙上的物理屏：顶层 `<screen type="3">`。子节点 `type="2"` 是拼屏单元（大屏就是 3×2 六块拼的），
     * 不算独立屏。客户端给**每块屏单独下发一个 `<Screen>`**，窗口坐标是屏内百分比。
     * （实测自「三层电视」的预设「主任画面」：Task screen="2"，两个 Screen 各占 left=0/50、width=50。）
     */
    public List<Map<String, Object>> listWallScreens(String tvWallId) {
        return parseWallScreens(String.valueOf(getTvWall(tvWallId).get("data")));
    }

    static List<Map<String, Object>> parseWallScreens(String wallXml) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (wallXml == null || wallXml.isBlank()) {
            return out;
        }
        Matcher m = Pattern.compile("<screen\\s+([^>]*?)/?>", Pattern.DOTALL).matcher(wallXml);
        while (m.find()) {
            String attrs = m.group(1);
            if (!"3".equals(attrOf(attrs, "type"))) {
                continue;
            }
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("screenId", attrOf(attrs, "id"));
            s.put("name", attrOf(attrs, "name"));
            s.put("decodeId", attrOf(attrs, "code"));
            s.put("left", numOf(attrOf(attrs, "left")));
            s.put("top", numOf(attrOf(attrs, "top")));
            s.put("width", numOf(attrOf(attrs, "width")));
            s.put("height", numOf(attrOf(attrs, "height")));
            out.add(s);
        }
        return out;
    }

    private static String attrOf(String attrs, String name) {
        Matcher m = Pattern.compile("\\b" + name + "=\"([^\"]*)\"").matcher(attrs);
        return m.find() ? m.group(1) : null;
    }

    private static double numOf(Object s) {
        if (s == null) {
            return 0;
        }
        try {
            return Double.parseDouble(String.valueOf(s));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /**
     * 拼一份多屏 TVWallScheme：每块物理屏一个 `<Screen>`，各自带 splitNum 与窗口。
     * requested 里没提到的屏输出成自闭合 —— 语义就是「清空那块屏」，所以「整墙一起推」时前端要把每块屏都带上。
     */
    String buildScheme(List<Map<String, Object>> wallScreens, List<Map<String, Object>> requested,
                       String taskName) {
        Map<String, Map<String, Object>> req = new HashMap<>();
        for (Map<String, Object> r : requested == null ? List.<Map<String, Object>>of() : requested) {
            req.put(String.valueOf(r.get("screenId")), r);
        }
        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<TVWallScheme>\n\t<Tasks>\n");
        sb.append("\t\t<Task id=\"0\"").append(taskName == null ? "" : " name=\"" + esc(taskName) + "\"")
          .append(" screen=\"").append(Math.max(1, wallScreens.size()))
          .append("\" tvWallCfgId=\"1\" desc=\"\" isOnlineSend=\"false\" isAlarmTime=\"0\"")
          .append(" prefTime=\"0\" recordType=\"2\" taskType=\"0\" isDevAutoCycle=\"false\" planType=\"0\">\n");
        int seq = 0;
        for (Map<String, Object> s : wallScreens) {
            String sid = String.valueOf(s.get("screenId"));
            Map<String, Object> r = req.get(sid);
            int split = r == null ? 0 : (int) numOf(r.getOrDefault("splitNum", 0));
            List<Map<String, Object>> wins = r == null ? List.of() : asListOfMap(r.get("windows"));
            double w = numOf(s.get("width"));
            double h = numOf(s.get("height"));
            sb.append("\t\t\t<Screen wndNo=\"").append(seq)
              .append("\" decodeId=\"").append(s.get("decodeId"))
              .append("\" tvIdx=\"").append(sid)
              .append("\" splitNum=\"").append(split)
              .append("\" visitorMode=\"1\" screenId=\"").append(sid)
              .append("\" screenMode=\"2\" isCombined=\"").append(w >= 100 && h >= 100)
              .append("\" name=\"").append(esc(String.valueOf(s.getOrDefault("name", ""))))
              .append("\" left=\"").append(fmt(numOf(s.get("left"))))
              .append("\" top=\"").append(fmt(numOf(s.get("top"))))
              .append("\" width=\"").append(fmt(w)).append("\" height=\"").append(fmt(h))
              .append("\" screenAlarmWall=\"0\" screenSeq=\"").append(seq).append("\"");
            if (split <= 0 || wins.isEmpty()) {
                sb.append(" />\n");
                seq++;
                continue;
            }
            sb.append(">\n");
            for (Map<String, Object> win : wins) {
                appendWindow(sb, split, win);
            }
            sb.append("\t\t\t</Screen>\n");
            seq++;
        }
        sb.append("\t\t</Task>\n\t</Tasks>\n</TVWallScheme>\n");
        return sb.toString();
    }

    /**
     * 一个窗口 + 它上面挂的通道。空窗口不输出（与客户端一致）。
     * 窗口矩形优先取请求里带的 left/top/width/height（自定义切分就是任意矩形），
     * 没带才按宫格均分算 —— 与前端 rect() 同一套算法。
     */
    private void appendWindow(StringBuilder sb, int splitNum, Map<String, Object> win) {
        Object cc = win.get("channelCode");
        if (cc == null || String.valueOf(cc).isBlank()) {
            return;
        }
        int idx = (int) numOf(win.getOrDefault("index", 0));
        double[] r = hasOwnRect(win) ? ownRect(win) : rect(splitNum, idx);
        String code = String.valueOf(cc);
        String[] parts = code.split("\\$");
        String deviceId = parts[0];
        String no = parts.length > 3 ? parts[3] : "0";
        String name = String.valueOf(win.getOrDefault("channelName", ""));
        sb.append("\t\t\t\t<SubTv id=\"").append(idx)
          .append("\" left=\"").append(fmt(r[0])).append("\" top=\"").append(fmt(r[1]))
          .append("\" width=\"").append(fmt(r[2])).append("\" height=\"").append(fmt(r[3]))
          .append("\" name=\"1-").append(idx + 1)
          .append("\" zorder=\"").append(idx)
          .append("\" isAlarm=\"0\" isHighLight=\"0\" isOpenAudio=\"0\" subWinNum=\"0\">\n");
        sb.append("\t\t\t\t\t<Channel id=\"").append(code)
          .append("\" name=\"").append(esc(name))
          .append("\" subStream=\"1\" timeSpan=\"15\" presetPos=\"0\"")
          .append(" deviceId=\"").append(deviceId)
          .append("\" no=\"").append(no)
          .append("\" devType=\"1\" alarmType=\"0\" manufacturerType=\"2\" trackID=\"501\"")
          .append(" OsdText=\"\" osdBackgroundRect=\"\" osdFont=\"\" osdFrontColor=\"\" enableOsd=\"false\"")
          .append(" connType=\"-1\" patrolMode=\"0\" OsdSwitch=\"0\" OsdLeft=\"0\" OsdTop=\"0\"")
          .append(" OsdRed=\"0\" OsdGreen=\"0\" OsdBlue=\"0\" fishFitMode=\"0\" fishShowMode=\"0\"")
          .append(" groupId=\"\" cameraIdentifier=\"\" encodeType=\"0\" beginTime=\"0\" endTime=\"0\" timeOffset=\"-1\" />\n");
        sb.append("\t\t\t\t</SubTv>\n");
    }

    /** 请求里是否自带了窗口矩形（自定义切分） */
    private static boolean hasOwnRect(Map<String, Object> win) {
        return win.get("left") != null && win.get("top") != null
                && win.get("width") != null && win.get("height") != null;
    }

    private static double[] ownRect(Map<String, Object> win) {
        return new double[]{
                numOf(win.get("left")), numOf(win.get("top")),
                numOf(win.get("width")), numOf(win.get("height"))};
    }

    private static String fmt(double d) {
        String s = String.valueOf(Math.round(d * 100.0) / 100.0);
        return s;
    }

    private static String esc(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static String firstMatch(String s, String regex) {
        if (s == null) return null;
        Matcher m = Pattern.compile(regex).matcher(s);
        return m.find() ? m.group(1) : null;
    }

    // ---------------- 内部 ----------------

    private Map<String, Object> operate(String tvWallId, String decodeId, String xml) {
        Map<String, Object> position = new HashMap<>();
        position.put("top", "0");
        position.put("height", "0");
        position.put("left", "0");
        position.put("width", "0");

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("tvWallId", tvWallId);
        data.put("data", xml);
        data.put("position", position);
        data.put("operateType", "0");
        data.put("tvIndex", "0");
        data.put("deviceCode", decodeId == null ? "" : decodeId);
        data.put("alarmLevel", "0");
        data.put("tvWallVersion", "0");
        data.put("tvType", "0");
        data.put("subWindowNo", "0");
        data.put("screenId", "0");
        data.put("order", "0");
        data.put("splitNumber", "0");
        data.put("subTvIndex", "0");
        return call("VMS.TvWall.OperateTvWall", data);
    }

    private Map<String, Object> call(String method, Map<String, Object> data) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("clientType", "WINPC_V1");
        body.put("clientMac", MAC);
        body.put("clientPushId", "");
        body.put("project", "PSDK");
        body.put("method", method);
        body.put("data", data);

        String path = "/evo-apigw/admin/API/" + method.replace('.', '/');
        return exchange(path, body);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> exchange(String path, Map<String, Object> body) {
        boolean retried = false;
        while (true) {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "bearer " + authService.getValidToken());
            headers.setContentType(MediaType.APPLICATION_JSON);
            try {
                Map<String, Object> resp = authService.getRestTemplate()
                        .exchange(authService.getBaseUrl() + path, HttpMethod.POST,
                                new HttpEntity<>(body, headers), Map.class)
                        .getBody();
                if (!retried && resp != null && "27001007".equals(String.valueOf(resp.get("code")))) {
                    retried = true;
                    authService.forceRefreshToken();
                    continue;
                }
                if (resp == null) {
                    resp = new HashMap<>();
                }
                Object code = resp.get("code");
                // 大华 PSDK 网关约定：1000 = 成功；EVO/REST 接口为 "0"
                boolean ok = "1000".equals(String.valueOf(code)) || "0".equals(String.valueOf(code))
                        || Boolean.TRUE.equals(resp.get("success"));
                if (!ok) {
                    throw new IllegalStateException("大华电视墙接口失败: " + path + " -> " + resp);
                }
                return resp;
            } catch (org.springframework.web.client.HttpStatusCodeException ex) {
                if (!retried && ex.getStatusCode().value() == 401) {
                    retried = true;
                    authService.forceRefreshToken();
                    continue;
                }
                throw ex;
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object o) {
        return o instanceof Map ? (Map<String, Object>) o : new HashMap<>();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> asListOfMap(Object o) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (o instanceof List) {
            for (Object x : (List<Object>) o) {
                if (x instanceof Map) out.add((Map<String, Object>) x);
            }
        }
        return out;
    }
}
