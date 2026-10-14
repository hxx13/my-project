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
    /** 单个音频上限：整份读进内存，别让它把堆撑爆。 */
    private static final long MAX_UPLOAD_BYTES = 100L * 1024 * 1024;

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
        for (SongListView list : listSongLists()) {
            for (SongListView.SongView s : list.songs()) {
                if (songPath.equals(s.pathName())) {
                    return list.id();
                }
            }
        }
        return "";
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
        String from = requireListId(fromListId);
        String to = requireListId(toListId);
        if (from.equals(to)) {
            throw new IllegalArgumentException("源列表与目标列表相同");
        }
        String song = requireSong(songPath);
        String fileName = fileNameOf(song);
        client.removeSongFromList(from, fileName, false);
        client.addSongToList(to, fileName);
        log.info("[广播] 曲目移列表 {} -> {} : {}", from, to, song);
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
            throw new IllegalArgumentException("音频超过上限 " + (MAX_UPLOAD_BYTES / 1024 / 1024) + "MB");
        }
        if (listId == null || listId.isBlank()) {
            throw new IllegalArgumentException("未指定目标曲库列表");
        }
        String fileName = file.getOriginalFilename() == null ? "upload.mp3" : file.getOriginalFilename();
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (Exception e) {
            throw new BroadcastException("读取上传文件失败: " + e.getMessage());
        }

        postMultipart(fileName, bytes);
        client.notifySongUploaded(listId, fileName);
        String path = "/Data/Program/Other/" + fileName;
        log.info("[广播] 曲目已上传并登记: {} -> {}", fileName, listId);
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
                throw new BroadcastException("上传音频失败，HTTP " + resp.statusCode());
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
