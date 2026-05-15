package com.example.demo.modules.telemetry.client;

import org.springframework.http.client.SimpleClientHttpRequestFactory;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;

/**
 * 仅为 WinCC RestTemplate 使用：在连接上设置信任所有证书，不调用 {@link HttpsURLConnection#setDefaultSSLSocketFactory}。
 */
public final class WinCcSslRequestFactory extends SimpleClientHttpRequestFactory {

    private final boolean trustAll;

    public WinCcSslRequestFactory(boolean trustAll, int connectTimeoutMs, int readTimeoutMs) {
        this.trustAll = trustAll;
        setConnectTimeout(connectTimeoutMs);
        setReadTimeout(readTimeoutMs);
    }

    @Override
    protected void prepareConnection(HttpURLConnection connection, String httpMethod) throws IOException {
        if (trustAll && connection instanceof HttpsURLConnection https) {
            try {
                SSLContext sc = SSLContext.getInstance("TLS");
                sc.init(null, new TrustManager[]{new X509TrustManager() {
                    @Override
                    public X509Certificate[] getAcceptedIssuers() {
                        return new X509Certificate[0];
                    }

                    @Override
                    public void checkClientTrusted(X509Certificate[] chain, String authType) {
                    }

                    @Override
                    public void checkServerTrusted(X509Certificate[] chain, String authType) {
                    }
                }}, new SecureRandom());
                https.setSSLSocketFactory(sc.getSocketFactory());
                https.setHostnameVerifier((hostname, session) -> true);
            } catch (Exception ignored) {
                // 若失败则退回默认校验
            }
        }
        super.prepareConnection(connection, httpMethod);
    }
}
