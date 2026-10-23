package com.example.demo.modules.dahua.service;

import com.example.demo.modules.dahua.entity.DahuaDeviceChannelCache;
import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelCacheMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * 浏览器实时预览：按通道找到摄像机，拉起一路 ffmpeg，输出 HLS 给网页播放。
 *
 * <p>只做「取流 + 转封装/转码」，不经过 ICC。摄像机地址取通道缓存里的 link_url；
 * 当前子码流多为 H.265，未批量改为 H.264 前用转码，改完后把 video.preview.transcode 置 false 即可只转封装。
 */
@Service
public class VideoPreviewService {
    private static final Logger log = LoggerFactory.getLogger(VideoPreviewService.class);

    private static final Pattern MEDIA_FILE = Pattern.compile("^(index\\.m3u8|seg\\d{1,6}\\.ts)$");
    private static final int WAIT_PLAYLIST_MS = 10_000;
    /** 大屏/解码器设备大类：输入槽位可由 ICC 平台取流，输出屏不行 */
    private static final int VIDEO_WALL_CATEGORY = 45;

    private final DahuaDeviceChannelCacheMapper channelMapper;
    private final DahuaAuthService authService;

    @Value("${video.preview.ffmpeg-path:ffmpeg}")
    private String ffmpegPath;

    @Value("${video.preview.output-dir:}")
    private String outputDir;

    @Value("${video.preview.camera-username:admin}")
    private String cameraUsername;

    @Value("${video.preview.camera-password:}")
    private String cameraPassword;

    @Value("${video.preview.max-sessions:4}")
    private int maxSessions;

    @Value("${video.preview.idle-seconds:180}")
    private int idleSeconds;

    @Value("${video.preview.max-minutes:120}")
    private int maxMinutes;

    @Value("${video.preview.transcode:true}")
    private boolean transcode;

    private final Map<String, Session> sessions = new ConcurrentHashMap<>();

    public VideoPreviewService(DahuaDeviceChannelCacheMapper channelMapper,
                               DahuaAuthService authService) {
        this.channelMapper = channelMapper;
        this.authService = authService;
    }

    public synchronized Map<String, Object> start(String channelCode, String streamType) {
        pruneIdle();
        boolean mainStream = "main".equalsIgnoreCase(streamType);
        if (channelCode == null || channelCode.isBlank()) {
            throw new IllegalArgumentException("通道编码不能为空");
        }
        if (sessions.size() >= maxSessions) {
            throw new IllegalArgumentException("同时预览路数已达上限（" + maxSessions + " 路），请先关闭其他画面");
        }

        DahuaDeviceChannelCache channel = channelMapper.findByChannelCode(channelCode);
        if (channel == null) {
            throw new IllegalArgumentException("通道不存在或尚未同步");
        }
        String host = resolveHost(channel.getLinkUrl());
        boolean videoWall = Integer.valueOf(VIDEO_WALL_CATEGORY).equals(channel.getDeviceCategory());
        String inputUrl;
        String platformSession = null;
        boolean copyVideo;
        if (host != null) {
            if (cameraPassword == null || cameraPassword.isBlank()) {
                throw new IllegalArgumentException("未配置摄像机口令，无法取流");
            }
            inputUrl = "rtsp://" + encode(cameraUsername) + ":" + encode(cameraPassword)
                    + "@" + host + ":554/Streaming/Channels/" + (mainStream ? "101" : "102");
            copyVideo = !transcode;
        } else if (videoWall) {
            if (Integer.valueOf(2).equals(channel.getUnitType())) {
                throw new IllegalArgumentException("该通道是大屏输出画面，不能直接取流；请选择对应的输入槽位（槽位02-01～04-04）");
            }
            PlatformStream stream = openPlatformStream(channelCode);
            inputUrl = stream.url();
            platformSession = stream.session();
            copyVideo = true;
        } else {
            throw new IllegalArgumentException("该通道未配置设备地址，请先在通道编码页填写设备跳转地址");
        }

        Path baseDir = baseDir();
        String sessionId = UUID.randomUUID().toString().replace("-", "");
        Path dir = baseDir.resolve(sessionId);
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            releasePlatformStream(platformSession);
            throw new IllegalArgumentException("创建预览目录失败");
        }

        List<String> command = buildCommand(inputUrl, dir, mainStream, copyVideo);
        Process process;
        try {
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.redirectErrorStream(true);
            pb.redirectOutput(dir.resolve("ffmpeg.log").toFile());
            process = pb.start();
        } catch (IOException e) {
            releasePlatformStream(platformSession);
            deleteQuietly(dir);
            log.warn("[视频预览] 启动 ffmpeg 失败: {}", e.getMessage());
            throw new IllegalArgumentException("启动取流进程失败（ffmpeg: " + ffmpegPath + "），请检查服务器 ffmpeg 配置");
        }

        try {
            waitForPlaylist(process, dir.resolve("index.m3u8"), dir.resolve("ffmpeg.log"));
        } catch (RuntimeException e) {
            process.destroyForcibly();
            releasePlatformStream(platformSession);
            deleteQuietly(dir);
            throw e;
        }

        Session session = new Session(sessionId, channelCode, channel.getChannelName(),
                platformSession != null || mainStream ? "main" : "sub", dir, process, platformSession);
        sessions.put(sessionId, session);
        log.info("[视频预览] 开始 {} ({}) -> {}", channelCode, channel.getChannelName(), dir);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sessionId", sessionId);
        out.put("channelCode", channelCode);
        out.put("streamType", mainStream ? "main" : "sub");
        out.put("hlsUrl", "/v1/dahua/preview/hls/" + sessionId + "/index.m3u8");
        return out;
    }

    public synchronized void stop(String sessionId) {
        if (sessionId == null) return;
        Session session = sessions.remove(sessionId);
        if (session != null) {
            stopSession(session);
        }
    }

    public HlsFile readFile(String sessionId, String file) {
        Session session = sessions.get(sessionId);
        if (session == null) {
            throw new IllegalArgumentException("预览会话已结束");
        }
        if (file == null || !MEDIA_FILE.matcher(file).matches()) {
            throw new IllegalArgumentException("非法的媒体文件");
        }
        Path path = session.dir.resolve(file).normalize();
        if (!path.startsWith(session.dir)) {
            throw new IllegalArgumentException("非法的媒体路径");
        }
        if (!Files.exists(path)) {
            throw new IllegalArgumentException("媒体文件尚未生成");
        }
        session.lastAccess = System.currentTimeMillis();
        pruneIdle();
        if (!sessions.containsKey(sessionId)) {
            throw new IllegalArgumentException("预览会话已结束");
        }
        try {
            String contentType = file.endsWith(".m3u8")
                    ? "application/vnd.apple.mpegurl"
                    : "video/mp2t";
            return new HlsFile(Files.readAllBytes(path), contentType);
        } catch (IOException e) {
            throw new IllegalArgumentException("读取媒体文件失败");
        }
    }

    public record HlsFile(byte[] data, String contentType) {
    }

    private record PlatformStream(String url, String session) {
    }

    /**
     * 大屏输入槽位/解码器通道没有可直接访问的摄像机地址，向 ICC 平台申请一路 RTSP。
     * 平台下发的是 H.264，ffmpeg 只做转封装。
     */
    private PlatformStream openPlatformStream(String channelCode) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "bearer " + authService.getValidToken());
            headers.setContentType(MediaType.APPLICATION_JSON);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("channelId", channelCode);
            data.put("streamType", 1);
            data.put("dataType", 1);
            data.put("trackId", 0);
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("data", data);
            ResponseEntity<Map> resp = authService.getRestTemplate().postForEntity(
                    authService.getBaseUrl() + "/evo-apigw/admin/API/MTS/Video/StartVideo",
                    new HttpEntity<>(body, headers), Map.class);
            Map<?, ?> r = resp.getBody();
            if (r == null || !"1000".equals(String.valueOf(r.get("code")))) {
                String desc = r == null ? "平台无响应" : String.valueOf(r.get("desc"));
                throw new IllegalArgumentException("平台无法为该通道取流：" + desc);
            }
            Map<?, ?> d = (Map<?, ?>) r.get("data");
            String url = String.valueOf(d.get("url"));
            String token = String.valueOf(d.get("token"));
            String session = String.valueOf(d.get("session"));
            return new PlatformStream(url + "&token=" + token, session);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            log.warn("[视频预览] 平台取流失败 {}: {}", channelCode, e.getMessage());
            throw new IllegalArgumentException("从 ICC 平台取流失败，请检查该通道是否在线");
        }
    }

    private void releasePlatformStream(String session) {
        if (session == null || session.isBlank()) {
            return;
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "bearer " + authService.getValidToken());
            headers.setContentType(MediaType.APPLICATION_JSON);
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("data", Map.of("session", session));
            authService.getRestTemplate().postForEntity(
                    authService.getBaseUrl() + "/evo-apigw/admin/API/MTS/Video/StopVideo",
                    new HttpEntity<>(body, headers), Map.class);
        } catch (Exception e) {
            log.warn("[视频预览] 释放平台取流会话失败 {}: {}", session, e.getMessage());
        }
    }

    private List<String> buildCommand(String inputUrl, Path dir, boolean mainStream, boolean copyVideo) {
        List<String> command = new ArrayList<>();
        command.add(ffmpegPath == null || ffmpegPath.isBlank() ? "ffmpeg" : ffmpegPath);
        command.add("-hide_banner");
        command.add("-loglevel");
        command.add("warning");
        command.add("-rtsp_transport");
        command.add("tcp");
        command.add("-i");
        command.add(inputUrl);
        command.add("-an");
        // 硬上限：即使后台/页面异常，ffmpeg 到点也会自己退出
        command.add("-t");
        command.add(String.valueOf(Math.max(1, maxMinutes) * 60));
        if (!copyVideo) {
            command.add("-c:v");
            command.add("libx264");
            command.add("-preset");
            command.add("ultrafast");
            command.add("-tune");
            command.add("zerolatency");
            command.add("-b:v");
            command.add(mainStream ? "2500k" : "800k");
            command.add("-g");
            command.add("25");
        } else {
            command.add("-c:v");
            command.add("copy");
        }
        command.add("-f");
        command.add("hls");
        command.add("-hls_time");
        command.add("1");
        command.add("-hls_list_size");
        command.add("6");
        command.add("-hls_flags");
        command.add("delete_segments+omit_endlist");
        command.add("-hls_segment_filename");
        command.add(dir.resolve("seg%03d.ts").toString());
        command.add(dir.resolve("index.m3u8").toString());
        return command;
    }

    private void waitForPlaylist(Process process, Path playlist, Path logFile) {
        long deadline = System.currentTimeMillis() + WAIT_PLAYLIST_MS;
        while (System.currentTimeMillis() < deadline) {
            if (Files.exists(playlist)) return;
            if (!process.isAlive()) break;
            try {
                Thread.sleep(200);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        throw new IllegalArgumentException(diagnose(process, logFile));
    }

    /** 把 ffmpeg 的失败原因收敛成用户能处理的一句话 */
    private static String diagnose(Process process, Path logFile) {
        String log = "";
        try {
            if (Files.exists(logFile)) {
                log = Files.readString(logFile);
                if (log.length() > 16_000) {
                    log = log.substring(log.length() - 16_000);
                }
            }
        } catch (IOException ignored) {
            // 日志读不到时按通用提示处理
        }
        String lower = log.toLowerCase();
        if (lower.contains("401") || lower.contains("unauthorized")) {
            return "摄像机鉴权失败，请检查预览用的摄像机口令";
        }
        if (lower.contains("connection refused") || lower.contains("timed out")
                || lower.contains("no route") || lower.contains("unreachable")) {
            return "摄像机不可达，请检查网络和设备是否在线";
        }
        if (lower.contains("404") || lower.contains("not found")) {
            return "摄像机码流地址不可用，请检查设备地址是否正确";
        }
        if (!process.isAlive() && !log.isBlank()) {
            return "取流失败，请检查设备地址、口令或通道是否在线";
        }
        return "取流超时，请检查摄像机是否在线、地址与口令是否正确";
    }

    /** 定时兜底：不等下一次请求，主动回收空闲、进程已退出或超时的会话 */
    @Scheduled(fixedDelay = 30_000)
    public void cleanupSessions() {
        pruneIdle();
    }

    private void pruneIdle() {
        long now = System.currentTimeMillis();
        long idleMs = Math.max(30, idleSeconds) * 1000L;
        long maxMs = Math.max(1, maxMinutes) * 60_000L;
        for (Session session : sessions.values()) {
            String reason = null;
            if (!session.process.isAlive()) {
                reason = "进程已退出";
            } else if (now - session.startedAt > maxMs) {
                reason = "超过最长预览时长";
            } else if (now - session.lastAccess > idleMs) {
                reason = "空闲超时";
            }
            if (reason != null && sessions.remove(session.id, session)) {
                stopSession(session);
                log.info("[视频预览] 回收 {}（{}）", session.id, reason);
            }
        }
    }

    /** 当前预览占用：给后台页显示「服务端占用 N/4」，避免占满了没人知道 */
    public Map<String, Object> active() {
        long now = System.currentTimeMillis();
        List<Map<String, Object>> list = new ArrayList<>();
        for (Session session : sessions.values()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("sessionId", session.id);
            item.put("channelCode", session.channelCode);
            item.put("channelName", session.channelName);
            item.put("streamType", session.streamType);
            item.put("ageSeconds", (now - session.startedAt) / 1000);
            item.put("idleSeconds", (now - session.lastAccess) / 1000);
            list.add(item);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("max", maxSessions);
        out.put("sessions", list);
        return out;
    }

    /** 启动时清掉上次异常退出留下的 ffmpeg 和临时目录 */
    @PostConstruct
    public void init() {
        Path base = baseDir();
        try {
            Files.createDirectories(base);
        } catch (IOException e) {
            log.warn("[视频预览] 创建输出目录失败: {}", e.getMessage());
            return;
        }
        String marker = base.toAbsolutePath().toString();
        try {
            ProcessHandle.allProcesses()
                    .filter(ph -> ph.info().commandLine()
                            .map(cmd -> cmd.contains(marker) && cmd.toLowerCase().contains("ffmpeg"))
                            .orElse(false))
                    .forEach(ph -> {
                        log.warn("[视频预览] 清理残留 ffmpeg pid={}", ph.pid());
                        ph.destroyForcibly();
                    });
        } catch (Exception e) {
            log.warn("[视频预览] 清理残留 ffmpeg 失败: {}", e.getMessage());
        }
        try (var dirs = Files.newDirectoryStream(base)) {
            for (Path dir : dirs) {
                deleteQuietly(dir);
            }
        } catch (IOException ignored) {
            // 清理失败不影响启动
        }
    }

    private Path baseDir() {
        return Paths.get(
                outputDir == null || outputDir.isBlank()
                        ? System.getProperty("java.io.tmpdir") + "/twin-video-preview"
                        : outputDir
        );
    }

    private void stopSession(Session session) {
        try {
            session.process.destroy();
            if (!session.process.waitFor(3, java.util.concurrent.TimeUnit.SECONDS)) {
                session.process.destroyForcibly();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            session.process.destroyForcibly();
        }
        releasePlatformStream(session.platformSession);
        deleteQuietly(session.dir);
    }

    private static String resolveHost(String linkUrl) {
        if (linkUrl == null || linkUrl.isBlank()) return null;
        try {
            URI uri = URI.create(linkUrl.trim());
            String host = uri.getHost();
            return host == null || host.isBlank() ? null : host;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String encode(String value) {
        if (value == null) return "";
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static void deleteQuietly(Path dir) {
        if (dir == null || !Files.exists(dir)) return;
        try (var paths = Files.walk(dir)) {
            paths.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                    // 目录可能正被 ffmpeg 占用，下次启动时再清理
                }
            });
        } catch (IOException ignored) {
            // ignored
        }
    }

    @PreDestroy
    public void shutdown() {
        for (Session session : sessions.values()) {
            stopSession(session);
        }
        sessions.clear();
    }

    private static final class Session {
        private final String id;
        private final String channelCode;
        private final String channelName;
        private final String streamType;
        private final Path dir;
        private final Process process;
        private final String platformSession;
        private final long startedAt = System.currentTimeMillis();
        private volatile long lastAccess = System.currentTimeMillis();

        private Session(String id, String channelCode, String channelName, String streamType,
                        Path dir, Process process, String platformSession) {
            this.id = id;
            this.channelCode = channelCode;
            this.channelName = channelName;
            this.streamType = streamType;
            this.dir = dir;
            this.process = process;
            this.platformSession = platformSession;
        }
    }
}
