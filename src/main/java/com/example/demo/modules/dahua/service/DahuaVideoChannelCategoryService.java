package com.example.demo.modules.dahua.service;

import com.example.demo.modules.dahua.entity.DahuaDeviceChannelCache;
import com.example.demo.modules.dahua.entity.DahuaVideoChannelCategory;
import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelCacheMapper;
import com.example.demo.modules.dahua.mapper.DahuaVideoChannelCategoryMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 监控通道分类树。独立于门禁的备注分类（两套数据、两套接口）。
 *
 * 骨架按点位表的分区口径自动生成：**楼层 → 相机组**（实验动物中心1F / RD1、GY3F…），
 * 只在**树为空**时播一次种；之后全靠手工维护（新增文件夹 / 重命名 / 删除 / 挪通道）。
 * 另把点位表里的设备 IP 补写进通道的跳转地址（只填空着的）。
 */
@Service
public class DahuaVideoChannelCategoryService {

    private static final Logger log = LoggerFactory.getLogger(DahuaVideoChannelCategoryService.class);

    private static final int VIDEO_DEVICE_CATEGORY = 1;
    /** 解码器/电视墙大类：槽位02-01、HDMIOUT… 这些「大屏」的输入口 */
    private static final int DECODER_DEVICE_CATEGORY = 45;
    /** 电视墙通道源 = 摄像机 + 解码器槽位，与 DahuaDeviceChannelCacheService 的口径一致 */
    private static final List<Integer> WALL_CATEGORIES =
            List.of(VIDEO_DEVICE_CATEGORY, DECODER_DEVICE_CATEGORY);
    private static final long ROOT = 0L;
    private static final String LINKS_CSV = "db/video-channel-links.csv";

    /** 名字里的楼层，如 `RD1-JK01 1F缓冲间` 的 `1F`、`GYB1F-JK01` 的 `B1F` */
    private static final Pattern FLOOR = Pattern.compile("(B1F|\\d+F)");
    private static final Pattern NAME_PREFIX = Pattern.compile("^([A-Za-z0-9]+)[-\\s]");
    /** 楼层节点名前缀；也是「骨架是不是这一版」的判据 */
    private static final String FLOOR_NODE_PREFIX = "实验动物中心";
    /** 名字里没有楼层的通道（SY-NVR-* 那批）收在这里 */
    private static final String NO_FLOOR_NODE = "未标注楼层";
    /** 解码器/电视墙槽位统一收在这里 */
    private static final String DECODER_NODE = "电视墙解码器";

    private final DahuaVideoChannelCategoryMapper categoryMapper;
    private final DahuaDeviceChannelCacheMapper channelMapper;

    public DahuaVideoChannelCategoryService(DahuaVideoChannelCategoryMapper categoryMapper,
                                            DahuaDeviceChannelCacheMapper channelMapper) {
        this.categoryMapper = categoryMapper;
        this.channelMapper = channelMapper;
    }

    /** 全部节点（扁平，前端自己拼树）+ 每个节点直挂的通道数。树为空时先播种。 */
    public List<Map<String, Object>> listTree() {
        ensureTreeSeeded();
        seedLinkUrls();
        Map<Long, Integer> counts = new HashMap<>();
        for (Map<String, Object> row : categoryMapper.countChannelsByNode()) {
            Object nodeId = row.get("nodeId");
            Object cnt = row.get("cnt");
            if (nodeId != null && cnt != null) {
                counts.put(Long.valueOf(String.valueOf(nodeId)), Integer.valueOf(String.valueOf(cnt)));
            }
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (DahuaVideoChannelCategory c : categoryMapper.listAll()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("parentId", c.getParentId());
            m.put("name", c.getName());
            m.put("sortOrder", c.getSortOrder());
            m.put("channelCount", counts.getOrDefault(c.getId(), 0));
            out.add(m);
        }
        return out;
    }

    public Map<String, Object> createNode(Long parentId, String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("文件夹名称不能为空");
        }
        long pid = parentId == null ? ROOT : parentId;
        if (pid != ROOT && categoryMapper.findById(pid) == null) {
            throw new IllegalArgumentException("父节点不存在");
        }
        if (categoryMapper.findIdByParentAndName(pid, trimmed) != null) {
            throw new IllegalArgumentException("同级下已有同名文件夹");
        }
        DahuaVideoChannelCategory row = new DahuaVideoChannelCategory();
        row.setParentId(pid);
        row.setName(trimmed);
        row.setSortOrder(0);
        categoryMapper.insert(row);
        return Map.of("id", row.getId(), "parentId", pid, "name", trimmed);
    }

    public void renameNode(long id, String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("文件夹名称不能为空");
        }
        DahuaVideoChannelCategory node = categoryMapper.findById(id);
        if (node == null) {
            throw new IllegalArgumentException("节点不存在");
        }
        Long dup = categoryMapper.findIdByParentAndName(node.getParentId(), trimmed);
        if (dup != null && dup != id) {
            throw new IllegalArgumentException("同级下已有同名文件夹");
        }
        categoryMapper.updateName(id, trimmed);
    }

    /** 只允许删空文件夹：有子节点就先删子节点，免得通道被静默挪走。 */
    public void deleteNode(long id) {
        if (categoryMapper.findById(id) == null) {
            throw new IllegalArgumentException("节点不存在");
        }
        boolean hasChild = categoryMapper.listAll().stream()
                .anyMatch(c -> c.getParentId() != null && c.getParentId() == id);
        if (hasChild) {
            throw new IllegalArgumentException("该文件夹下还有子文件夹，请先删除子文件夹");
        }
        channelMapper.updateVideoCategoryByNode(id, null);
        categoryMapper.deleteById(id);
    }

    /** 把一路通道挪到某个节点；nodeId = null 表示移出到「未分类」。 */
    public void assignChannel(long channelId, Long nodeId) {
        if (nodeId != null && categoryMapper.findById(nodeId) == null) {
            throw new IllegalArgumentException("节点不存在");
        }
        channelMapper.updateVideoCategory(channelId, nodeId);
    }

    /**
     * 设置通道的设备跳转地址。允许只填 IP（自动补 http:// 与结尾斜杠），
     * 也允许填完整地址；传空则清除。只放行 http/https，挡掉 javascript: 之类的伪协议。
     */
    public void setChannelLink(long channelId, String rawUrl) {
        String url = rawUrl == null ? "" : rawUrl.trim();
        if (url.isEmpty()) {
            channelMapper.updateLinkUrl(channelId, null);
            return;
        }
        if (!url.contains("://")) {
            url = "http://" + url;
        }
        String lower = url.toLowerCase();
        if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
            throw new IllegalArgumentException("只支持 http/https 地址");
        }
        if (url.endsWith("/")) {
            channelMapper.updateLinkUrl(channelId, url);
        } else {
            channelMapper.updateLinkUrl(channelId, url + "/");
        }
    }

    /**
     * 保证骨架是「楼层 → 相机组」这一版。
     *
     * 判据不是「表空」而是「没有楼层节点」：早期按名称前缀草播过一版（只有 RD1/RD2/GY3F… 这层），
     * 若那次骨架还在，表不空、旧判据就不会重建。所以这里认准楼层节点，缺失就清掉重建一次。
     * 只在升级到这一版时命中一次；之后楼层节点一直在，不会再动用户手工整理过的树。
     */
    private void ensureTreeSeeded() {
        List<DahuaVideoChannelCategory> all = categoryMapper.listAll();
        boolean hasFloorNode = all.stream().anyMatch(n -> n.getName() != null
                && (n.getName().startsWith(FLOOR_NODE_PREFIX) || NO_FLOOR_NODE.equals(n.getName())));
        boolean hasDecoderNode = all.stream()
                .anyMatch(n -> DECODER_NODE.equals(n.getName()));
        // 解码器槽位是后补进同步的：缓存里已经有这类通道但树上还没有对应的节点，就补建一次
        boolean decoderPending = !hasDecoderNode
                && !channelMapper.listByDeviceCategory(List.of(DECODER_DEVICE_CATEGORY)).isEmpty();
        if (!all.isEmpty() && hasFloorNode && !decoderPending) {
            return;
        }
        if (!all.isEmpty() && !hasFloorNode) {
            log.info("[video-channel] 旧版前缀骨架（{} 个节点）将被按分区重建", all.size());
        }
        channelMapper.clearVideoCategory(WALL_CATEGORIES);
        categoryMapper.deleteAll();
        seedFromChannelNames();
    }

    /**
     * 播种：两层 —— 楼层（实验动物中心1F…）→ 相机组（RD1/RD2/GY3F…）。
     * 楼层与前缀都直接从通道名里取（名字形如 `RD1-JK01 1F缓冲间(123)` / `GY4F-JK01 4F样品接收室`），
     * 与点位表里的分区口径一致；名字里没有楼层的（SY-NVR-* 这类录像机通道）归到「未标注楼层」。
     * 解码器/电视墙槽位（大类 45：槽位02-01、HDMIOUT…）整批收在「电视墙解码器」下，不按名字前缀乱分。
     */
    private void seedFromChannelNames() {
        List<DahuaDeviceChannelCache> channels = channelMapper.listByDeviceCategory(WALL_CATEGORIES);
        Map<String, Long> floorNodes = new LinkedHashMap<>();
        Map<String, Long> groupNodes = new LinkedHashMap<>();
        for (DahuaDeviceChannelCache c : channels) {
            boolean decoder = c.getDeviceCategory() != null && c.getDeviceCategory() == DECODER_DEVICE_CATEGORY;
            String name = c.getChannelName() == null ? "" : c.getChannelName();
            String floorName;
            String group;
            if (decoder) {
                floorName = DECODER_NODE;
                group = null;                     // 槽位/HDMIOUT 直接挂在「电视墙解码器」下，不再分组
            } else {
                Matcher fm = FLOOR.matcher(name);
                floorName = fm.find() ? FLOOR_NODE_PREFIX + fm.group(1) : NO_FLOOR_NODE;
                Matcher pm = NAME_PREFIX.matcher(name);
                group = pm.find() ? pm.group(1) : "其它";
            }
            long floorId = floorNodes.computeIfAbsent(floorName, f -> insertNode(ROOT, f, 0));
            long gid = group == null ? floorId
                    : groupNodes.computeIfAbsent(floorName + "|" + group,
                            k -> insertNode(floorId, group, groupRank(group)));
            channelMapper.updateVideoCategory(c.getId(), gid);
        }
        int i = 0;
        for (Map.Entry<String, Long> e : floorNodes.entrySet()) {
            categoryMapper.updateSort(e.getValue(), floorRank(e.getKey()) * 100 + i++);
        }
        if (floorNodes.isEmpty()) {
            insertNode(ROOT, "全部监控", 0);
        }
    }

    /** 楼层顺序：1F→2F→3F→4F→B1F→解码器，不认得的排最后。播种按通道名顺序遇到，不排会变成 3F/4F/B1F/1F。 */
    private static int floorRank(String floorName) {
        if (DECODER_NODE.equals(floorName)) {
            return 8;
        }
        Matcher m = Pattern.compile("(B1F|(\\d+)F)").matcher(floorName);
        if (!m.find()) {
            return 9;
        }
        return m.group(2) != null ? Integer.parseInt(m.group(2)) : 5;
    }

    /** 相机组的显示顺序：先 RD1/RD2，再 GY3F/GY4F/GYB1F，最后 SY 与其它。 */
    private static int groupRank(String group) {
        List<String> preferred = List.of("RD1", "RD2", "GY3F", "GY4F", "GYB1F", "SY");
        int i = preferred.indexOf(group);
        return i >= 0 ? i : preferred.size();
    }

    private long insertNode(long parentId, String name, int sortOrder) {
        DahuaVideoChannelCategory node = new DahuaVideoChannelCategory();
        node.setParentId(parentId);
        node.setName(name);
        node.setSortOrder(sortOrder);
        categoryMapper.insert(node);
        return node.getId();
    }

    /**
     * IP 种子：把 {@code db/video-channel-links.csv} 里（由点位表生成）的设备地址填进去。
     * 只填空着的，人工改过的不覆盖；表里没有的（SY-NVR-* 那批）留空，等人工补。
     */
    private void seedLinkUrls() {
        try {
            // 已经有链接就直接跳过：这段是 305 条 UPDATE，早先每次都跑，
            // 把分类树接口拖到了 600ms（实测）。播种本来就只需要一次。
            if (channelMapper.countLinkUrls() > 0) {
                return;
            }
            ClassPathResource res = new ClassPathResource(LINKS_CSV);
            if (!res.exists()) {
                return;
            }
            int n = 0;
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(res.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    if (line.isBlank() || line.startsWith("#")) {
                        continue;
                    }
                    String[] parts = line.split(",", 2);
                    if (parts.length != 2 || parts[0].isBlank() || parts[1].isBlank()) {
                        continue;
                    }
                    n += channelMapper.seedLinkUrlIfEmpty(parts[0].trim(), parts[1].trim());
                }
            }
            log.info("[video-channel] 已补写设备跳转地址 {} 条", n);
        } catch (Exception e) {
            log.warn("[video-channel] 跳转地址种子写入失败：{}", e.getMessage());
        }
    }
}
