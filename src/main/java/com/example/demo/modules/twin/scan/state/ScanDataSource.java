package com.example.demo.modules.twin.scan.state;

/**
 * 扫码进出的数据源开关：决定后续扫码状态机读取 ARO 线上数据还是本地数据源。
 *
 * <p>取值由配置项 {@code integration / scan.data_source} 解析而来，
 * 只有字符串 "local"（忽略大小写）映射到 {@link #LOCAL}，其余一律回退到
 * 默认的 {@link #ARO}，保证未配置或配置异常时仍走线上数据源。</p>
 */
public enum ScanDataSource {
    ARO,
    LOCAL;

    /**
     * 解析配置字符串为数据源枚举。
     *
     * @param raw 配置原始值，可为 null
     * @return "local"（忽略大小写）→ {@link #LOCAL}，其余（含 null、空串）→ {@link #ARO}
     */
    public static ScanDataSource resolve(String raw) {
        String v = raw == null ? "" : raw.trim();
        return "local".equalsIgnoreCase(v) ? LOCAL : ARO;
    }
}
