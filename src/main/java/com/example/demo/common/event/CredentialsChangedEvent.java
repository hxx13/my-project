package com.example.demo.common.event;

/**
 * 系统设置中凭证/集成配置被管理员修改后发布，触发各 Service 重载凭证。
 */
public class CredentialsChangedEvent {

    private final String module;
    private final String configKey;

    public CredentialsChangedEvent(String module, String configKey) {
        this.module = module;
        this.configKey = configKey;
    }

    public String getModule() {
        return module;
    }

    public String getConfigKey() {
        return configKey;
    }

    /** 是否涉及凭证模块（需重载外部系统登录态）。 */
    public boolean isCredentials() {
        return "credentials".equals(module);
    }

    /** 是否涉及集成配置模块。 */
    public boolean isIntegration() {
        return "integration".equals(module);
    }
}
