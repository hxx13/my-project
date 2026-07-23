package com.example.demo.modules.notification.service;

import com.example.demo.modules.aro.service.AroService;
import com.example.demo.modules.dahua.service.DahuaAuthService;
import com.example.demo.modules.dahua.service.DahuaService;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.InputStream;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

@Service
public class ExternalCommConfigService {
    private final AroService aroService;
    private final DahuaAuthService dahuaAuthService;
    private final DahuaService dahuaService;
    private final Environment environment;

    public ExternalCommConfigService(AroService aroService,
                                     DahuaAuthService dahuaAuthService,
                                     DahuaService dahuaService,
                                     Environment environment) {
        this.aroService = aroService;
        this.dahuaAuthService = dahuaAuthService;
        this.dahuaService = dahuaService;
        this.environment = environment;
    }

    public Map<String, Object> collectOverview() {
        Map<String, Object> data = new HashMap<>();
        data.put("hardcoded", collectHardcoded());
        data.put("applicationProperties", collectApplicationProperties());
        data.put("environmentVariables", collectEnvironmentVariables());
        return data;
    }

    private List<Map<String, Object>> collectHardcoded() {
        List<Map<String, Object>> rows = new ArrayList<>();
        rows.addAll(readBeanFields("aroService", aroService, List.of(
                "account", "password", "cachedToken"
        )));
        rows.addAll(readBeanFields("dahuaAuthService", dahuaAuthService, List.of(
                "baseUrl", "clientId", "clientSecret", "username", "passwordRaw", "cachedToken"
        )));
        rows.addAll(readBeanFields("dahuaService", dahuaService, List.of(
                "myCallbackUrl"
        )));
        rows.sort(Comparator.comparing(it -> String.valueOf(it.get("key"))));
        return rows;
    }

    private List<Map<String, Object>> readBeanFields(String sourceName, Object bean, List<String> fieldNames) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (bean == null) return rows;
        Class<?> type = bean.getClass();
        for (String fieldName : fieldNames) {
            try {
                Field field = type.getDeclaredField(fieldName);
                field.setAccessible(true);
                Object rawValue = field.get(bean);
                String value = rawValue == null ? "" : String.valueOf(rawValue);
                rows.add(entry(
                        sourceName + "." + fieldName,
                        value,
                        sourceName + " (hardcoded)",
                        true
                ));
            } catch (Exception ignored) {
                rows.add(entry(
                        sourceName + "." + fieldName,
                        "",
                        sourceName + " (hardcoded)",
                        true
                ));
            }
        }
        return rows;
    }

    private List<Map<String, Object>> collectApplicationProperties() {
        List<Map<String, Object>> rows = new ArrayList<>();
        Properties props = new Properties();
        try (InputStream in = new ClassPathResource("application.properties").getInputStream()) {
            props.load(in);
        } catch (Exception ignored) {
            return rows;
        }
        List<String> keys = List.of(
                "server.address",
                "server.port",
                "spring.datasource.url",
                "spring.datasource.username",
                "spring.datasource.password"
        );
        for (String key : keys) {
            String value = props.getProperty(key, environment.getProperty(key, ""));
            rows.add(entry(
                    key,
                    value,
                    "application.properties",
                    true
            ));
        }
        return rows;
    }

    private List<Map<String, Object>> collectEnvironmentVariables() {
        List<Map<String, Object>> rows = new ArrayList<>();
        Map<String, String> env = System.getenv();
        for (Map.Entry<String, String> kv : env.entrySet()) {
            String k = kv.getKey();
            if (!isEnvCandidate(k)) continue;
            rows.add(entry(
                    k,
                    kv.getValue(),
                    "environment",
                    true
            ));
        }
        rows.sort(Comparator.comparing(it -> String.valueOf(it.get("key"))));
        return rows;
    }

    private boolean isEnvCandidate(String key) {
        if (!StringUtils.hasText(key)) return false;
        String k = key.toUpperCase();
        return k.startsWith("ARO_")
                || k.startsWith("DAHUA_")
                || k.startsWith("SERVER_")
                || k.startsWith("SPRING_")
                || k.contains("HOST")
                || k.contains("IP")
                || k.contains("PORT")
                || k.contains("URL")
                || k.contains("USERNAME")
                || k.contains("PASSWORD")
                || k.contains("SECRET")
                || k.contains("TOKEN");
    }

    private Map<String, Object> entry(String key, String value, String source, boolean applyMask) {
        boolean sensitive = isSensitiveKey(key);
        boolean exists = StringUtils.hasText(value);
        String maskedValue = sensitive && applyMask && exists ? "******" : (exists ? value : "");
        Map<String, Object> row = new HashMap<>();
        row.put("key", key);
        row.put("value", maskedValue);
        row.put("actualValue", exists ? value : "");
        row.put("masked", sensitive);
        row.put("exists", exists);
        row.put("source", source);
        row.put("modifiable", false);
        return row;
    }

    private boolean isSensitiveKey(String key) {
        String k = key.toLowerCase();
        return k.contains("password")
                || k.contains("secret")
                || k.contains("token")
                || k.contains("clientsecret")
                || k.contains("passwordraw");
    }
}

