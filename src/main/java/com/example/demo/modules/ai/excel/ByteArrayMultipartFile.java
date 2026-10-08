package com.example.demo.modules.ai.excel;

import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;

/**
 * 内存里的 MultipartFile —— 让「字节已经是现成的」这条路径也能走既有的上传服务。
 *
 * <p>为什么不直接用 Spring 的 {@code MockMultipartFile}：那个类在 **spring-test**（测试作用域）里，
 * 运行期根本没有。而给 {@code AdminFileTemplateService} 加一个「按字节上传」的重载要动别人的模块，
 * 这里自己实现这个接口更省事、也不碰既有代码。
 */
public class ByteArrayMultipartFile implements MultipartFile {

    private final String name;
    private final String originalFilename;
    private final String contentType;
    private final byte[] bytes;

    public ByteArrayMultipartFile(String name, String originalFilename, String contentType, byte[] bytes) {
        this.name = name == null ? "file" : name;
        this.originalFilename = originalFilename == null ? "upload.xlsx" : originalFilename;
        this.contentType = contentType;
        this.bytes = bytes == null ? new byte[0] : bytes;
    }

    @Override
    public String getName() {
        return name;
    }

    @Override
    public String getOriginalFilename() {
        return originalFilename;
    }

    @Override
    public String getContentType() {
        return contentType;
    }

    @Override
    public boolean isEmpty() {
        return bytes.length == 0;
    }

    @Override
    public long getSize() {
        return bytes.length;
    }

    @Override
    public byte[] getBytes() {
        return bytes;
    }

    @Override
    public InputStream getInputStream() {
        return new ByteArrayInputStream(bytes);
    }

    @Override
    public void transferTo(File dest) throws IOException {
        Files.write(dest.toPath(), bytes);
    }
}
