package com.example.demo.modules.broadcast.service;

import com.example.demo.modules.broadcast.client.BroadcastException;
import com.example.demo.modules.broadcast.client.DsppaClient;
import com.example.demo.modules.broadcast.dto.SongListView;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 广播曲库：读取曲目清单 + 上传音频。
 *
 * <p>曲目清单一律读平台上的 Playlist.xml —— 这是**刻意的简化**：实现平台那套
 * 分块文件传输协议代价很大，而这个文件可经 HTTP 直接读到、结构稳定。
 * 若日后判断不稳妥，再退回实现 WS 文件协议。
 *
 * <p>上传是**两步**：先把文件字节 POST 到平台的 cgi 入口，再发指令让后台登记进曲库。
 * 两步缺一，曲目不会出现在清单里。
 */
@Service
public class BroadcastSongsService {

    private static final Logger log = LoggerFactory.getLogger(BroadcastSongsService.class);

    /** 平台曲库清单文件（相对 HTTP 基址）。 */
    private static final String PLAYLIST_XML = "/Data/Xml/Playlist.xml";
    /** 平台的上传入口（相对 HTTP 基址）。 */
    private static final String UPLOAD_CGI = "/cgi-bin/Addsong.cgi";
    /** 平台只认这两种：厂家自己的上传页校验的就是 wav / mp3。 */
    private static final java.util.regex.Pattern ALLOWED_EXT =
            java.util.regex.Pattern.compile("(?i).*\\.(mp3|wav)$");
    /**
     * 单个音频上限。**必须与 spring.servlet.multipart.max-file-size 对齐**：
     * 超过容器上限时请求在进入控制器前就被拒了，这里的分支根本走不到。
     */
    private static final long MAX_UPLOAD_BYTES = 30L * 1024 * 1024;

    private final DsppaClient client;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    public BroadcastSongsService(DsppaClient client) {
        this.client = client;
    }

    // ---------------------------------------------------------------- 读取

    /** 曲库列表与曲目。 */
    public List<SongListView> listSongLists() {
        String xml = fetchPlaylistXml();
        return parsePlaylist(xml);
    }

    private String fetchPlaylistXml() {
        String url = client.getHttpBase() + PLAYLIST_XML;
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(15))
                    .GET()
                    .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() != 200) {
                throw new BroadcastException("读取平台曲库清单失败，HTTP " + resp.statusCode());
            }
            return resp.body();
        } catch (BroadcastException e) {
            throw e;
        } catch (Exception e) {
            throw new BroadcastException("读取平台曲库清单失败: " + e.getMessage());
        }
    }

    private List<SongListView> parsePlaylist(String xml) {
        List<SongListView> out = new ArrayList<>();
        try {
            javax.xml.parsers.DocumentBuilderFactory f = javax.xml.parsers.DocumentBuilderFactory.newInstance();
            // 关掉外部实体：读的是内网设备上的文件，不该解析外部引用
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            f.setFeature("http://xml.org/sax/features/external-general-entities", false);
            f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            f.setExpandEntityReferences(false);
            var doc = f.newDocumentBuilder().parse(
                    new org.xml.sax.InputSource(new java.io.StringReader(xml)));
            var lists = doc.getElementsByTagName("List");
            for (int i = 0; i < lists.getLength(); i++) {
                var el = (org.w3c.dom.Element) lists.item(i);
                String id = el.getAttribute("ID");
                String name = el.getAttribute("Name");
                List<SongListView.SongView> songs = new ArrayList<>();
                var songNodes = el.getElementsByTagName("Song");
                for (int j = 0; j < songNodes.getLength(); j++) {
                    var s = (org.w3c.dom.Element) songNodes.item(j);
                    String path = s.getAttribute("PathName");
                    if (path == null || path.isBlank()) {
                        continue;
                    }
                    songs.add(new SongListView.SongView(
                            path,
                            fileNameOf(path),
                            parseInt(s.getAttribute("Duration")),
                            parseLong(s.getAttribute("Size"))));
                }
                out.add(new SongListView(id, name, songs.size(), songs));
            }
        } catch (Exception e) {
            throw new BroadcastException("解析平台曲库清单失败: " + e.getMessage());
        }
        out.sort(Comparator.comparing(SongListView::name, Comparator.nullsLast(Comparator.naturalOrder())));
        return out;
    }

    /** 找出某个曲目属于哪个列表 —— 平台下发播放时要求同时给出列表编号。 */
    public String findListIdBySongPath(String songPath) {
        if (songPath == null || songPath.isBlank()) {
            return "";
        }
        return pathToListId().getOrDefault(songPath, "");
    }

    /**
     * 平台当前曲库快照：曲目路径 → 所属列表编号。
     *
     * <p>**播放时必须现查**，不能用方案保存时的列表快照 —— 曲库被改过（曲目移走、列表重建）后，
     * 快照会让平台回「目标不存在」。方案里的曲目横跨多个列表时，快照更是只记得住其中一个。
     */
    public Map<String, String> pathToListId() {
        Map<String, String> out = new java.util.HashMap<>();
        for (SongListView list : listSongLists()) {
            for (SongListView.SongView s : list.songs()) {
                out.putIfAbsent(s.pathName(), list.id());
            }
        }
        return out;
    }

    /** 按顺序取第一首仍在平台曲库里的曲目；都不在了返回 null。 */
    public static String pickExisting(List<String> paths, Map<String, String> liveByPath) {
        if (paths == null) {
            return null;
        }
        for (String p : paths) {
            if (liveByPath.containsKey(p)) {
                return p;
            }
        }
        return null;
    }

    // ---------------------------------------------------------------- 列表（文件夹）管理

    /**
     * 新建曲库列表。**列表编号由我方生成** —— 原厂客户端也是这么做的（命令里带 list_id）。
     *
     * @return 新列表编号
     */
    public String createList(String listName) {
        String name = requireName(listName);
        String listId = UUID.randomUUID().toString();
        client.addSongList(listId, name);
        log.info("[广播] 新建曲库列表 {} -> {}", name, listId);
        return listId;
    }

    public void renameList(String listId, String listName) {
        String name = requireName(listName);
        client.renameSongList(requireListId(listId), name);
        log.info("[广播] 曲库列表改名 {} -> {}", listId, name);
    }

    /** 删除列表。**不删音频文件** —— 只摘掉这个列表本身。 */
    public void deleteList(String listId) {
        client.removeSongList(requireListId(listId));
        log.info("[广播] 删除曲库列表 {}", listId);
    }

    /**
     * 把曲目移到另一个列表 = 从原列表摘掉 + 加进目标列表。
     * 两步都**不删文件**（原厂那个 remove_local 开关一律传 0）。
     */
    public void moveSong(String fromListId, String toListId, String songPath) {
        moveSongs(fromListId, toListId, java.util.List.of(songPath));
    }

    /**
     * 批量移动。逐首从原列表摘出，**再一次性**加入目标列表（平台的加入接口原生收数组）。
     *
     * <p>某一首在原列表里已经不存在（比如刚被别的操作移动/删除、界面数据是旧的）时，
     * 不整体失败，按首记失败原因继续 —— 否则一首过期就会让整批白做。
     *
     * @return 逐首结果（pathName / fileName / success / message）
     */
    public java.util.List<java.util.Map<String, Object>> moveSongs(
            String fromListId, String toListId, java.util.List<String> songPaths) {
        String from = requireListId(fromListId);
        String to = requireListId(toListId);
        if (from.equals(to)) {
            throw new IllegalArgumentException("源列表与目标列表相同");
        }
        if (songPaths == null || songPaths.isEmpty()) {
            throw new IllegalArgumentException("未选择曲目");
        }

        java.util.List<java.util.Map<String, Object>> out = new java.util.ArrayList<>();
        java.util.List<String> movedNames = new java.util.ArrayList<>();
        for (String raw : songPaths) {
            String song = requireSong(raw);
            String fileName = fileNameOf(song);
            java.util.Map<String, Object> one = new java.util.LinkedHashMap<>();
            one.put("pathName", song);
            one.put("fileName", fileName);
            try {
                client.removeSongFromList(from, fileName, false);
                movedNames.add(fileName);
                one.put("success", true);
            } catch (BroadcastException e) {
                one.put("success", false);
                // 3/7 = 目标不存在：几乎都是「界面上的列表已经过期」
                one.put("message", (e.getResult() == 3 || e.getResult() == 7)
                        ? "已不在原列表（可能刚被移动或删除），请刷新后再试"
                        : e.getMessage());
            }
            out.add(one);
        }

        if (!movedNames.isEmpty()) {
            try {
                client.addSongsToList(to, movedNames);
            } catch (RuntimeException e) {
                // 已经摘出来了但没加进去：不补偿的话这些歌会从两个列表里同时消失。
                // 音频文件本身不受影响，这里先把它们放回原列表再报错。
                try {
                    client.addSongsToList(from, movedNames);
                } catch (Exception ignored) {
                    // 补偿也失败就照实抛，至少调用方能知道状态不确定
                }
                throw new BroadcastException("移动到目标列表失败，已退回原列表：" + e.getMessage());
            }
        }
        log.info("[广播] 曲目移列表 {} -> {} : {} 首（成功 {}）",
                from, to, songPaths.size(), movedNames.size());
        return out;
    }

    /** 把曲目加入列表。入参仍是**路径**（上层统一口径），转成文件名是平台的要求，封在这一层。 */
    public void addSongToList(String listId, String songPath) {
        String song = requireSong(songPath);
        client.addSongToList(requireListId(listId), fileNameOf(song));
        log.info("[广播] 曲目加入列表 {} : {}", listId, song);
    }

    /** 从列表移除曲目。**不删文件**（文件删除不经本系统）。 */
    public void removeSongFromList(String listId, String songPath) {
        String song = requireSong(songPath);
        client.removeSongFromList(requireListId(listId), fileNameOf(song), false);
        log.info("[广播] 曲目移出列表 {} : {}", listId, song);
    }

    private static String requireName(String raw) {
        String name = raw == null ? "" : raw.trim();
        if (name.isEmpty()) {
            throw new IllegalArgumentException("列表名称不能为空");
        }
        return name;
    }

    private static String requireListId(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("未指定列表");
        }
        return raw.trim();
    }

    private static String requireSong(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("未指定曲目");
        }
        return raw.trim();
    }

    // ---------------------------------------------------------------- 上传

    /**
     * 上传一首音频到平台曲库，并通知后台登记。
     *
     * @param listId 目标曲库列表编号
     * @return 平台上的曲目路径（登记成功后即为可播放身份）
     */
    public String uploadSong(MultipartFile file, String listId) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("上传文件为空");
        }
        if (file.getSize() > MAX_UPLOAD_BYTES) {
            throw new IllegalArgumentException("单个文件超过上限 " + (MAX_UPLOAD_BYTES / 1024 / 1024) + "MB");
        }
        if (listId == null || listId.isBlank()) {
            throw new IllegalArgumentException("未指定目标曲库列表");
        }
        String fileName = file.getOriginalFilename() == null ? "upload.mp3" : file.getOriginalFilename();
        if (!ALLOWED_EXT.matcher(fileName).matches()) {
            throw new IllegalArgumentException("平台只接受 mp3 / wav 格式（当前：" + fileName + "）");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (Exception e) {
            throw new BroadcastException("读取上传文件失败: " + e.getMessage());
        }

        postMultipart(fileName, bytes);
        // **必须再发一次「加入列表」**。只发登记类命令（request_upload_song_to_server）实测
        // 回执成功、文件也传上去了，但歌曲**不会出现在任何列表里** —— 现场「传完看不到」就是它。
        // 厂家自己的上传页做的也是这一步（add_song_to_list，song_count + song_names）。
        client.addSongToList(listId, fileName);
        String path = "/Data/Program/Other/" + fileName;
        log.info("[广播] 曲目已上传并加入列表: {} -> {}", fileName, listId);
        return path;
    }

    /** 第一步：把字节传到平台的 cgi 入口。表单字段沿用原厂页面的 file + author。 */
    private void postMultipart(String fileName, byte[] bytes) {
        String boundary = "----BroadcastUpload" + UUID.randomUUID().toString().replace("-", "");
        String url = client.getHttpBase() + UPLOAD_CGI;
        try {
            ByteArrayOutputStream body = new ByteArrayOutputStream(bytes.length + 1024);
            // 普通字段
            body.write(("--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"author\"\r\n\r\n"
                    + "web\r\n").getBytes(StandardCharsets.UTF_8));
            // 文件字段：文件名按浏览器行为发原始 UTF-8 字节（中文名平台才认得）
            body.write(("--" + boundary + "\r\n"
                    + "Content-Disposition: form-data; name=\"file\"; filename=\"" + fileName + "\"\r\n"
                    + "Content-Type: application/octet-stream\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            body.write(bytes);
            body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));

            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofMinutes(5))
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
                    .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                // 把平台回的内容带出来：只报一个 HTTP 500 等于什么都没说，
                // 现场排查时「平台为什么拒」全在这个响应体里。
                String respBody = resp.body() == null ? "" : resp.body().replaceAll("\\s+", " ").trim();
                if (respBody.length() > 200) {
                    respBody = respBody.substring(0, 200) + "…";
                }
                throw new BroadcastException("上传音频失败，HTTP " + resp.statusCode()
                        + (respBody.isEmpty() ? "" : "：" + respBody));
            }
        } catch (BroadcastException e) {
            throw e;
        } catch (Exception e) {
            throw new BroadcastException("上传音频失败: " + e.getMessage());
        }
    }

    private static String fileNameOf(String path) {
        int idx = path.lastIndexOf('/');
        return idx >= 0 ? path.substring(idx + 1) : path;
    }

    private static Integer parseInt(String s) {
        try {
            return s == null || s.isBlank() ? null : Integer.parseInt(s.trim());
        } catch (Exception ignored) {
            return null;
        }
    }

    private static Long parseLong(String s) {
        try {
            return s == null || s.isBlank() ? null : Long.parseLong(s.trim());
        } catch (Exception ignored) {
            return null;
        }
    }
}
