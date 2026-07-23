package com.example.demo.common.config;

import org.apache.catalina.connector.Connector;
import org.apache.catalina.startup.Tomcat;
import org.apache.tomcat.util.net.SSLHostConfig;
import org.apache.tomcat.util.net.SSLHostConfigCertificate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.embedded.tomcat.TomcatWebServer;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.ApplicationListener;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.OptionalInt;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 在保留 HTTP {@code server.port} 的同时额外监听 HTTPS，供浏览器 {@code getUserMedia}（须安全上下文）。
 * Tomcat 10+ 须用 {@link SSLHostConfig}；HTTPS 在 HTTP 主服务就绪后再挂载，失败不阻断启动。
 */
@Configuration
@ConditionalOnProperty(prefix = "app.server.https-extra", name = "enabled", havingValue = "true", matchIfMissing = true)
public class ExtraHttpsConnectorConfig implements ApplicationListener<WebServerInitializedEvent> {

    private static final Logger log = LoggerFactory.getLogger(ExtraHttpsConnectorConfig.class);

    private static final int[] FALLBACK_HTTPS_PORTS = {18_443, 18_444, 19_443, 9_443};

    private final HttpsExtraPortRegistry httpsExtraPortRegistry;
    private final List<Connector> pendingConnectors = new CopyOnWriteArrayList<>();

    @Value("${app.server.https-extra.port:18443}")
    private int httpsPort;

    @Value("${app.server.https-extra.key-store:classpath:ssl/twin-local.p12}")
    private Resource keyStoreResource;

    @Value("${app.server.https-extra.key-store-password:twinlocal}")
    private String keyStorePassword;

    @Value("${app.server.https-extra.key-alias:twin-local}")
    private String keyAlias;

    public ExtraHttpsConnectorConfig(HttpsExtraPortRegistry httpsExtraPortRegistry) {
        this.httpsExtraPortRegistry = httpsExtraPortRegistry;
    }

    @Bean
    public WebServerFactoryCustomizer<TomcatServletWebServerFactory> extraHttpsConnectorCustomizer() {
        return factory -> {
            try {
                OptionalInt resolvedPort = resolveAvailablePort();
                if (resolvedPort.isEmpty()) {
                    log.warn(
                            "[https-extra] 无可用 HTTPS 端口（已尝试 {} 及备选端口），跳过额外 HTTPS。"
                                    + "人脸摄像头请在本机使用 http://localhost:{} 或配置 app.server.https-extra.port",
                            httpsPort,
                            factory.getPort()
                    );
                    return;
                }
                int port = resolvedPort.getAsInt();
                Path keystorePath = resolveKeystorePath();
                validateKeystore(keystorePath);
                Connector connector = createHttpsConnector(keystorePath, port);
                pendingConnectors.add(connector);
                httpsExtraPortRegistry.setActivePort(port);
                log.info("[https-extra] 将在 HTTP 就绪后挂载 HTTPS 端口 {}（人脸请用 https://<主机>:{} ）", port, port);
            } catch (Exception ex) {
                log.warn("[https-extra] 额外 HTTPS 未配置：{}。HTTP 下仅 localhost 可调用摄像头", ex.getMessage());
            }
        };
    }

    /** HTTP 主服务启动后再挂载 HTTPS，避免 SSL/端口问题拖垮整应用 */
    @Override
    public void onApplicationEvent(WebServerInitializedEvent event) {
        if (pendingConnectors.isEmpty()) {
            return;
        }
        if (!(event.getWebServer() instanceof TomcatWebServer tomcatWebServer)) {
            log.warn("[https-extra] 非 Tomcat 容器，跳过额外 HTTPS");
            pendingConnectors.clear();
            httpsExtraPortRegistry.setActivePort(-1);
            return;
        }
        Tomcat tomcat = tomcatWebServer.getTomcat();
        for (Connector connector : pendingConnectors) {
            int port = connector.getPort();
            try {
                tomcat.getService().addConnector(connector);
                connector.start();
                if (!connector.getState().isAvailable()) {
                    throw new IllegalStateException("connector state=" + connector.getState());
                }
                log.info("[https-extra] 额外 HTTPS 已监听 {}（人脸/摄像头请用 https://<主机>:{} ）", port, port);
            } catch (Exception ex) {
                log.warn("[https-extra] HTTPS 端口 {} 启动失败，已跳过：{}", port, ex.getMessage());
                httpsExtraPortRegistry.setActivePort(-1);
                try {
                    tomcat.getService().removeConnector(connector);
                } catch (Exception ignored) {
                    /* ignore */
                }
                try {
                    connector.destroy();
                } catch (Exception ignored) {
                    /* ignore */
                }
            }
        }
        pendingConnectors.clear();
    }

    private OptionalInt resolveAvailablePort() {
        Set<Integer> candidates = new LinkedHashSet<>();
        candidates.add(httpsPort);
        for (int fallback : FALLBACK_HTTPS_PORTS) {
            candidates.add(fallback);
        }
        for (int port : candidates) {
            if (isPortAvailable(port)) {
                if (port != httpsPort) {
                    log.warn("[https-extra] 端口 {} 已被占用，改用 {}", httpsPort, port);
                }
                return OptionalInt.of(port);
            }
        }
        return OptionalInt.empty();
    }

    private static boolean isPortAvailable(int port) {
        if (port <= 0 || port > 65_535) {
            return false;
        }
        try (ServerSocket socket = new ServerSocket()) {
            socket.setReuseAddress(true);
            socket.bind(new InetSocketAddress("0.0.0.0", port));
            return true;
        } catch (IOException ex) {
            return false;
        }
    }

    /** Tomcat 10+：须配置 SSLHostConfig，旧 keystoreFile 属性会报 No SSLHostConfig element */
    private Connector createHttpsConnector(Path keystorePath, int port) {
        Connector connector = new Connector(TomcatServletWebServerFactory.DEFAULT_PROTOCOL);
        connector.setScheme("https");
        connector.setSecure(true);
        connector.setPort(port);

        SSLHostConfig sslHostConfig = new SSLHostConfig();
        sslHostConfig.setHostName("_default_");
        sslHostConfig.setSslProtocol("TLS");
        sslHostConfig.setProtocols("TLSv1.2+TLSv1.3");

        SSLHostConfigCertificate certificate = new SSLHostConfigCertificate(
                sslHostConfig,
                SSLHostConfigCertificate.Type.RSA
        );
        certificate.setCertificateKeystoreFile(keystorePath.toAbsolutePath().toString());
        certificate.setCertificateKeystorePassword(keyStorePassword);
        certificate.setCertificateKeystoreType("PKCS12");
        certificate.setCertificateKeyAlias(keyAlias);
        sslHostConfig.addCertificate(certificate);
        connector.addSslHostConfig(sslHostConfig);

        return connector;
    }

    private void validateKeystore(Path keystorePath) throws Exception {
        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        try (InputStream in = Files.newInputStream(keystorePath)) {
            keyStore.load(in, keyStorePassword.toCharArray());
        }
        if (!keyStore.containsAlias(keyAlias)) {
            throw new IOException("keystore 缺少 alias: " + keyAlias);
        }
    }

    /** 固定写入用户目录，避免 JAR 内 classpath 资源或临时文件路径导致 Tomcat 读不到 keystore */
    private Path resolveKeystorePath() throws IOException, InterruptedException {
        Path userStore = Path.of(System.getProperty("user.home"), ".twin-system", "ssl", "twin-local.p12");
        if (Files.exists(userStore) && Files.size(userStore) > 0) {
            return userStore;
        }
        Files.createDirectories(userStore.getParent());
        if (keyStoreResource.exists()) {
            try (InputStream in = keyStoreResource.getInputStream()) {
                Files.copy(in, userStore, StandardCopyOption.REPLACE_EXISTING);
            }
            if (Files.size(userStore) > 0) {
                return userStore;
            }
        }
        generateKeystoreWithKeytool(userStore);
        return userStore;
    }

    private void generateKeystoreWithKeytool(Path target) throws IOException, InterruptedException {
        Path keytool = Path.of(System.getProperty("java.home"), "bin", isWindows() ? "keytool.exe" : "keytool");
        if (!Files.isExecutable(keytool)) {
            throw new IOException("未找到 keytool: " + keytool);
        }
        List<String> cmd = new ArrayList<>();
        cmd.add(keytool.toAbsolutePath().toString());
        cmd.add("-genkeypair");
        cmd.add("-alias");
        cmd.add(keyAlias);
        cmd.add("-keyalg");
        cmd.add("RSA");
        cmd.add("-keysize");
        cmd.add("2048");
        cmd.add("-storetype");
        cmd.add("PKCS12");
        cmd.add("-keystore");
        cmd.add(target.toAbsolutePath().toString());
        cmd.add("-validity");
        cmd.add("3650");
        cmd.add("-storepass");
        cmd.add(keyStorePassword);
        cmd.add("-keypass");
        cmd.add(keyStorePassword);
        cmd.add("-dname");
        cmd.add("CN=localhost, OU=Twin, O=Twin, L=Local, ST=Local, C=CN");

        Process process = new ProcessBuilder(cmd).redirectErrorStream(true).start();
        int code = process.waitFor();
        if (code != 0 || !Files.exists(target)) {
            throw new IOException("keytool 生成自签证书失败，exit=" + code);
        }
        log.info("[https-extra] 已在 {} 生成自签 keystore", target);
    }

    private static boolean isWindows() {
        String os = System.getProperty("os.name", "");
        return os.toLowerCase().contains("win");
    }
}
