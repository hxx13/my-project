package com.example.demo.modules.dahua.service;

import com.example.demo.modules.dahua.entity.DahuaDeviceChannelCache;
import com.example.demo.modules.dahua.mapper.DahuaDeviceChannelCacheMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.apache.hc.client5.http.auth.AuthScope;
import org.apache.hc.client5.http.auth.UsernamePasswordCredentials;
import org.apache.hc.client5.http.classic.methods.HttpPost;
import org.apache.hc.client5.http.impl.auth.BasicCredentialsProvider;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.io.entity.EntityUtils;
import org.apache.hc.core5.http.io.entity.StringEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * 录像机回放：按通道 + 时间检索录像，并把指定时间窗导出为浏览器可播的 H.264 MP4。
 *
 * <p>海康录像机只录主码流（H.265 1080p），所以导出时统一转成 720p H.264；
 * 采用“短片段 + 前端预取”的方式，拖动进度条后重新取一段，避免长转码等待。
 */
@Service
public class NvrPlaybackService {
    private static final Logger log = LoggerFactory.getLogger(NvrPlaybackService.class);

    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter NVR_TIME = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'");
    private static final DateTimeFormatter ISO_LOCAL = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private final DahuaDeviceChannelCacheMapper channelMapper;

    @Value("${video.playback.nvr-hosts:}")
    private String nvrHosts;

    @Value("${video.playback.nvr-username:admin}")
    private String nvrUsername;

    @Value("${video.playback.nvr-password:}")
    private String nvrPassword;

    @Value("${video.playback.ffmpeg-path:${video.preview.ffmpeg-path:ffmpeg}}")
    private String ffmpegPath;

    @Value("${video.playback.cache-dir:}")
    private String cacheDir;

    @Value("${video.playback.chunk-seconds:60}")
    private int defaultChunkSeconds;

    @Value("${video.playback.max-chunk-seconds:180}")
    private int maxChunkSeconds;

    @Value("${video.playback.threads:2}")
    private int threads;

    @Value("${video.playback.keep-minutes:30}")
    private int keepMinutes;

    private final Map<String, String> hostByDevice = new HashMap<>();
    private final Map<String, Job> jobs = new ConcurrentHashMap<>();
    private final Map<String, Job> cache = new ConcurrentHashMap<>();

    private CloseableHttpClient http;
    private ExecutorService executor;

    public NvrPlaybackService(DahuaDeviceChannelCacheMapper channelMapper) {
        this.channelMapper = channelMapper;
    }

    @PostConstruct
    public void init() {
        for (String pair : nvrHosts.split(",")) {
            String[] p = pair.trim().split(":", 2);
            if (p.length == 2 && !p[0].isBlank() && !p[1].isBlank()) {
                hostByDevice.put(p[0].trim(), p[1].trim());
            }
        }
        BasicCredentialsProvider creds = new BasicCredentialsProvider();
        creds.setCredentials(new AuthScope(null, -1),
                new UsernamePasswordCredentials(nvrUsername, nvrPassword == null ? new char[0] : nvrPassword.toCharArray()));
        http = HttpClients.custom().setDefaultCredentialsProvider(creds).build();
        executor = Executors.newFixedThreadPool(Math.max(1, threads));
        try {
            Files.createDirectories(cacheDir());
        } catch (IOException e) {
            log.warn("[录像回放] 创建缓存目录失败: {}", e.getMessage());
        }
    }

    /** 某通道某天的录像段。时间按上海时区输出，前端直接画时间轴。 */
    public List<Map<String, Object>> segments(String channelCode, LocalDate date) {
        NvrTarget target = resolve(channelCode);
        LocalDateTime dayStart = date.atStartOfDay();
        LocalDateTime dayEnd = dayStart.plusDays(1);
        List<Map<String, Object>> out = new ArrayList<>();
        int position = 0;
        for (int page = 0; page < 20; page++) {
            String xml = searchXml(target.track, dayStart, dayEnd, position, 100);
            String resp = postXml("http://" + target.host + "/ISAPI/ContentMgmt/search", xml);
            List<Segment> pageSegments = parseSegments(resp);
            for (Segment s : pageSegments) {
                LocalDateTime start = s.start;
                LocalDateTime end = s.end;
                if (end.isBefore(dayStart) || start.isAfter(dayEnd)) {
                    continue;
                }
                if (start.isBefore(dayStart)) start = dayStart;
                if (end.isAfter(dayEnd)) end = dayEnd;
                if (!end.isAfter(start)) continue;
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("start", start.format(ISO_LOCAL));
                m.put("end", end.format(ISO_LOCAL));
                m.put("seconds", ChronoUnit.SECONDS.between(start, end));
                out.add(m);
            }
            if (pageSegments.size() < 100) {
                break;
            }
            position += pageSegments.size();
        }
        out.sort(Comparator.comparing(m -> String.valueOf(m.get("start"))));
        List<Map<String, Object>> merged = new ArrayList<>();
        for (Map<String, Object> m : out) {
            if (!merged.isEmpty()) {
                Map<String, Object> prev = merged.get(merged.size() - 1);
                if (String.valueOf(prev.get("end")).equals(String.valueOf(m.get("start")))) {
                    prev.put("end", m.get("end"));
                    prev.put("seconds", ChronoUnit.SECONDS.between(
                            LocalDateTime.parse(String.valueOf(prev.get("start")), ISO_LOCAL),
                            LocalDateTime.parse(String.valueOf(m.get("end")), ISO_LOCAL)));
                    continue;
                }
            }
            merged.add(m);
        }
        return merged;
    }

    /** 申请一段可播放的 MP4；返回 jobId，前端轮询状态。 */
    public Map<String, Object> startChunk(String channelCode, String startTime, Integer seconds) {
        NvrTarget target = resolve(channelCode);
        LocalDateTime start = parseStart(startTime);
        int secs = seconds == null ? defaultChunkSeconds : seconds;
        secs = Math.max(5, Math.min(maxChunkSeconds, secs));
        String cacheKey = channelCode + "|" + start.format(NVR_TIME) + "|" + secs;
        Job cached = cache.get(cacheKey);
        if (cached != null && "ready".equals(cached.status) && cached.file != null && Files.exists(cached.file)) {
            return jobView(cached);
        }
        Job job = new Job(UUID.randomUUID().toString().replace("-", ""), channelCode, start, secs, cacheKey);
        jobs.put(job.id, job);
        executor.submit(() -> build(job, target));
        return jobView(job);
    }

    public Map<String, Object> status(String jobId) {
        Job job = jobs.get(jobId);
        if (job == null) {
            throw new IllegalArgumentException("回放任务不存在或已过期");
        }
        return jobView(job);
    }

    public Path file(String jobId) {
        Job job = jobs.get(jobId);
        if (job == null || !"ready".equals(job.status) || job.file == null || !Files.exists(job.file)) {
            throw new IllegalArgumentException("回放片段尚未生成");
        }
        return job.file;
    }

    private void build(Job job, NvrTarget target) {
        job.status = "running";
        Path dir = cacheDir().resolve(job.id);
        Path ps = dir.resolve("source.ps");
        Path mp4 = dir.resolve("chunk.mp4");
        try {
            Files.createDirectories(dir);
            LocalDateTime end = job.start.plusSeconds(job.seconds);
            String uri = "rtsp://" + target.host + ":554/Streaming/tracks/" + target.track + "/?starttime="
                    + job.start.format(NVR_TIME) + "&endtime=" + end.format(NVR_TIME);
            String downloadXml = "<?xml version=\"1.0\" encoding=\"utf-8\"?><downloadRequest><playbackURI>"
                    + uri.replace("&", "&amp;") + "</playbackURI></downloadRequest>";
            byte[] data = postBytes("http://" + target.host + "/ISAPI/ContentMgmt/download", downloadXml);
            if (data == null || data.length < 4096) {
                throw new IllegalStateException("该时间段没有录像");
            }
            if (data[0] == '<') {
                throw new IllegalStateException("该时间段没有录像（录像机返回：" + new String(data, StandardCharsets.UTF_8).substring(0, 120) + "）");
            }
            Files.write(ps, data);
            transcode(ps, mp4, job.seconds);
            if (!Files.exists(mp4) || Files.size(mp4) < 2048) {
                throw new IllegalStateException("录像转码失败");
            }
            job.file = mp4;
            job.status = "ready";
            cache.put(job.cacheKey, job);
        } catch (Exception e) {
            job.status = "error";
            job.error = e.getMessage() == null ? "回放生成失败" : e.getMessage();
            log.warn("[录像回放] 生成失败 {} {}: {}", job.channelCode, job.start, job.error);
        } finally {
            try {
                Files.deleteIfExists(ps);
            } catch (IOException ignored) {
                // 临时文件删不掉不影响结果
            }
        }
    }

    private void transcode(Path input, Path output, int seconds) throws IOException, InterruptedException {
        List<String> cmd = new ArrayList<>();
        cmd.add(ffmpegPath == null || ffmpegPath.isBlank() ? "ffmpeg" : ffmpegPath);
        cmd.add("-hide_banner");
        cmd.add("-loglevel");
        cmd.add("error");
        cmd.add("-err_detect");
        cmd.add("ignore_err");
        cmd.add("-i");
        cmd.add(input.toString());
        cmd.add("-an");
        cmd.add("-vf");
        cmd.add("scale=1280:-2");
        cmd.add("-c:v");
        cmd.add("libx264");
        cmd.add("-preset");
        cmd.add("ultrafast");
        cmd.add("-crf");
        cmd.add("26");
        cmd.add("-pix_fmt");
        cmd.add("yuv420p");
        cmd.add("-movflags");
        cmd.add("+faststart");
        cmd.add("-y");
        cmd.add(output.toString());
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.redirectErrorStream(true);
        pb.redirectOutput(output.resolveSibling("ffmpeg.log").toFile());
        Process process = pb.start();
        if (!process.waitFor(Math.max(60, seconds * 3L), TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IllegalStateException("录像转码超时");
        }
        if (process.exitValue() != 0) {
            throw new IllegalStateException("录像转码失败");
        }
    }

    private NvrTarget resolve(String channelCode) {
        if (channelCode == null || channelCode.isBlank()) {
            throw new IllegalArgumentException("通道不能为空");
        }
        DahuaDeviceChannelCache channel = channelMapper.findByChannelCode(channelCode);
        if (channel == null) {
            throw new IllegalArgumentException("通道不存在或尚未同步");
        }
        String host = hostByDevice.get(channel.getDeviceCode());
        if (host == null) {
            throw new IllegalArgumentException("该通道不是录像机通道，不支持录像回放");
        }
        int seq;
        try {
            seq = Integer.parseInt(channel.getChannelSeq());
        } catch (Exception e) {
            throw new IllegalArgumentException("该通道缺少录像机通道号");
        }
        return new NvrTarget(host, (seq + 1) * 100 + 1);
    }

    private LocalDateTime parseStart(String startTime) {
        if (startTime == null || startTime.isBlank()) {
            throw new IllegalArgumentException("开始时间不能为空");
        }
        try {
            return OffsetDateTime.parse(startTime).atZoneSameInstant(ZONE).toLocalDateTime();
        } catch (Exception ignored) {
            try {
                return LocalDateTime.parse(startTime);
            } catch (Exception e) {
                throw new IllegalArgumentException("开始时间格式不正确");
            }
        }
    }

    private String searchXml(int track, LocalDateTime start, LocalDateTime end, int position, int max) {
        String startText = start.atZone(ZONE).format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX"));
        String endText = end.atZone(ZONE).format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX"));
        return "<?xml version=\"1.0\" encoding=\"utf-8\"?>"
                + "<CMSearchDescription><searchID>{" + UUID.randomUUID() + "}</searchID>"
                + "<trackList><trackID>" + track + "</trackID></trackList>"
                + "<timeSpanList><timeSpan><startTime>" + startText + "</startTime><endTime>" + endText + "</endTime></timeSpan></timeSpanList>"
                + "<maxResults>" + max + "</maxResults><searchResultPostion>" + position + "</searchResultPostion>"
                + "<metadataList><metadataDescriptor>//recordType.meta.std-cgi.com</metadataDescriptor></metadataList>"
                + "</CMSearchDescription>";
    }

    private List<Segment> parseSegments(String xml) {
        List<Segment> out = new ArrayList<>();
        try {
            Document doc = parseXml(xml);
            NodeList items = doc.getElementsByTagName("searchMatchItem");
            for (int i = 0; i < items.getLength(); i++) {
                Element item = (Element) items.item(i);
                String start = text(item, "startTime");
                String end = text(item, "endTime");
                if (start == null || end == null) continue;
                out.add(new Segment(parseNvrTime(start), parseNvrTime(end)));
            }
        } catch (Exception e) {
            log.warn("[录像回放] 解析检索结果失败: {}", e.getMessage());
        }
        return out;
    }

    private static String text(Element parent, String tag) {
        NodeList list = parent.getElementsByTagName(tag);
        return list.getLength() == 0 ? null : list.item(0).getTextContent();
    }

    private static LocalDateTime parseNvrTime(String value) {
        String v = value.trim();
        try {
            if (v.endsWith("Z")) {
                v = v.substring(0, v.length() - 1);
            }
            return LocalDateTime.parse(v);
        } catch (Exception e) {
            return OffsetDateTime.parse(value.trim()).atZoneSameInstant(ZONE).toLocalDateTime();
        }
    }

    private String postXml(String url, String xml) {
        try {
            HttpPost post = new HttpPost(url);
            post.setEntity(new StringEntity(xml, ContentType.APPLICATION_XML));
            return http.execute(post, resp -> EntityUtils.toString(resp.getEntity(), StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("录像机请求失败：" + e.getMessage());
        }
    }

    private byte[] postBytes(String url, String xml) {
        try {
            HttpPost post = new HttpPost(url);
            post.setEntity(new StringEntity(xml, ContentType.APPLICATION_XML));
            return http.execute(post, resp -> EntityUtils.toByteArray(resp.getEntity()));
        } catch (Exception e) {
            throw new IllegalStateException("录像下载失败：" + e.getMessage());
        }
    }

    private static Document parseXml(String xml) throws Exception {
        DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
        f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        f.setFeature("http://xml.org/sax/features/external-general-entities", false);
        f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        f.setExpandEntityReferences(false);
        return f.newDocumentBuilder().parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
    }

    private Path cacheDir() {
        return Paths.get(cacheDir == null || cacheDir.isBlank()
                ? System.getProperty("java.io.tmpdir") + "/twin-nvr-playback"
                : cacheDir);
    }

    private Map<String, Object> jobView(Job job) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("jobId", job.id);
        m.put("status", job.status);
        m.put("channelCode", job.channelCode);
        m.put("startTime", job.start.format(ISO_LOCAL));
        m.put("seconds", job.seconds);
        if (job.error != null) m.put("error", job.error);
        return m;
    }

    @Scheduled(fixedDelay = 600_000)
    public void cleanup() {
        long now = System.currentTimeMillis();
        long ttl = Math.max(5, keepMinutes) * 60_000L;
        for (Job job : new ArrayList<>(jobs.values())) {
            if (job.createdAt + ttl < now) {
                jobs.remove(job.id);
                cache.remove(job.cacheKey, job);
                if (job.file != null) {
                    try {
                        Files.deleteIfExists(job.file);
                    } catch (IOException ignored) {
                        // 下次再清
                    }
                }
            }
        }
    }

    @PreDestroy
    public void shutdown() {
        if (executor != null) executor.shutdownNow();
        if (http != null) {
            try {
                http.close();
            } catch (IOException ignored) {
                // ignored
            }
        }
    }

    private record NvrTarget(String host, int track) {
    }

    private record Segment(LocalDateTime start, LocalDateTime end) {
    }

    private static final class Job {
        private final String id;
        private final String channelCode;
        private final LocalDateTime start;
        private final int seconds;
        private final String cacheKey;
        private final long createdAt = System.currentTimeMillis();
        private volatile String status = "pending";
        private volatile String error;
        private volatile Path file;

        private Job(String id, String channelCode, LocalDateTime start, int seconds, String cacheKey) {
            this.id = id;
            this.channelCode = channelCode;
            this.start = start;
            this.seconds = seconds;
            this.cacheKey = cacheKey;
        }
    }
}
