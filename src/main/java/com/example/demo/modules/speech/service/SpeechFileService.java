package com.example.demo.modules.speech.service;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 服务端语音生成 + 文件存储。
 * <p>
 * 生成：POST 到 CosyVoice → 得到 WAV → 写入 data/speech/{messageId}.wav
 * 读取：直接返回文件字节
 * <p>
 * 文件持久化在磁盘，刷新页面 / 重启服务均不丢失。
 */
@Service
public class SpeechFileService {

    private static final Logger log = LoggerFactory.getLogger(SpeechFileService.class);

    private final Path storageDir;
    private final String cosyvoiceBaseUrl;

    public SpeechFileService(
            @Value("${app.cosyvoice.base-url:http://127.0.0.1:50000}") String cosyvoiceBaseUrl,
            @Value("${app.speech.storage-dir:data/speech}") String storageDirPath) {
        this.cosyvoiceBaseUrl = cosyvoiceBaseUrl;
        this.storageDir = Paths.get(storageDirPath).toAbsolutePath();
        try {
            Files.createDirectories(this.storageDir);
        } catch (IOException e) {
            log.error("Failed to create speech storage dir: {}", this.storageDir, e);
        }
    }

    /** 检查音频文件是否已存在 */
    public boolean exists(long messageId) {
        return Files.exists(filePath(messageId));
    }

    /**
     * 列出所有已生成音频的消息 ID。
     * 扫描 storageDir 下所有 .mp3 文件，提取文件名中的数字 ID。
     * 后端重启 / 浏览器重启后仍能返回完整记录。
     */
    public java.util.List<Long> listReadyIds() {
        java.util.List<Long> ids = new java.util.ArrayList<>();
        java.io.File dir = storageDir.toFile();
        java.io.File[] files = dir.listFiles((d, name) -> name.endsWith(".mp3"));
        if (files != null) {
            for (java.io.File f : files) {
                try {
                    String name = f.getName();
                    // "123.mp3" → 123
                    long id = Long.parseLong(name.substring(0, name.length() - 4));
                    ids.add(id);
                } catch (NumberFormatException ignored) {
                    // skip non-numeric filenames
                }
            }
        }
        return ids;
    }

    /** 读取已生成的音频文件 */
    public byte[] load(long messageId) throws IOException {
        Path path = filePath(messageId);
        if (!Files.exists(path)) {
            throw new FileNotFoundException("Speech file not found: " + messageId);
        }
        return Files.readAllBytes(path);
    }

    /**
     * 触发生成语音并保存到磁盘。
     * @param text 要合成的文本
     * @param voiceId 音色 ID
     * @param messageId 关联的消息 ID（用于文件命名）
     */
    public void generate(String text, String voiceId, long messageId) throws IOException {
        Path path = filePath(messageId);

        // 幂等：已存在则跳过
        if (Files.exists(path)) {
            log.info("Speech file already exists for message {}, skipping", messageId);
            return;
        }

        String json = String.format(
                "{\"text\":\"%s\",\"voice_id\":\"%s\"}",
                escapeJson(text), voiceId);

        log.info("Generating speech for message {} ({} chars) -> {}", messageId, text.length(), path);

        HttpURLConnection conn = (HttpURLConnection) URI.create(cosyvoiceBaseUrl + "/v1/tts").toURL().openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setConnectTimeout(5_000);
        conn.setReadTimeout(120_000);
        conn.setRequestProperty("Content-Type", "application/json");

        try (OutputStream os = conn.getOutputStream()) {
            os.write(json.getBytes(StandardCharsets.UTF_8));
            os.flush();
        }

        int status = conn.getResponseCode();
        if (status != 200) {
            throw new IOException("CosyVoice returned HTTP " + status);
        }

        // 读音频 → 写磁盘
        byte[] audio;
        try (InputStream is = conn.getInputStream()) {
            audio = is.readAllBytes();
        }

        if (audio.length < 100) {
            throw new IOException("CosyVoice returned too-small audio: " + audio.length + " bytes");
        }

        Files.write(path, audio);
        log.info("Speech file saved: {} ({} bytes)", path, audio.length);
    }

    private Path filePath(long messageId) {
        return storageDir.resolve(messageId + ".mp3");
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
