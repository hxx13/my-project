package com.example.demo.modules.asset.service;

import com.example.demo.modules.asset.config.AssetSchemaMigrator;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 图标关键词规则纯函数契约：顺序敏感（先匹配先赢）+ 无匹配走兜底。
 * 与 AssetSchemaMigrator.seedIcons 共用同一张规则表。
 */
class AssetIconRuleTest {

    @Test
    void assetRulesAreOrderSensitive() {
        // 「台」规则在最后，前面更具体的必须赢
        assertEquals("🧪", AssetSchemaMigrator.resolveAssetIcon("二级生物安全柜"));
        assertEquals("🧪", AssetSchemaMigrator.resolveAssetIcon("超净工作台"));
        assertEquals("💨", AssetSchemaMigrator.resolveAssetIcon("通风柜"));
        // 「柜」规则在最后，更衣柜走它
        assertEquals("🗄️", AssetSchemaMigrator.resolveAssetIcon("更衣柜"));
    }

    @Test
    void assetKeywordSamples() {
        assertEquals("❄️", AssetSchemaMigrator.resolveAssetIcon("液氮罐"));
        assertEquals("🧊", AssetSchemaMigrator.resolveAssetIcon("医用冰箱"));
        assertEquals("🌀", AssetSchemaMigrator.resolveAssetIcon("高速离心机"));
        assertEquals("🌡️", AssetSchemaMigrator.resolveAssetIcon("温湿度监控仪"));
        assertEquals("🐭", AssetSchemaMigrator.resolveAssetIcon("IVC笼架"));
        assertEquals("💻", AssetSchemaMigrator.resolveAssetIcon("台式计算机"));
    }

    @Test
    void assetFallback() {
        assertEquals("📦", AssetSchemaMigrator.resolveAssetIcon("神秘物件"));
        assertEquals("📦", AssetSchemaMigrator.resolveAssetIcon(""));
        assertEquals("📦", AssetSchemaMigrator.resolveAssetIcon(null));
    }

    @Test
    void locationKeywordSamples() {
        assertEquals("🚻", AssetSchemaMigrator.resolveLocationIcon("更衣室"));
        assertEquals("🏢", AssetSchemaMigrator.resolveLocationIcon("办公室154"));
        assertEquals("🧪", AssetSchemaMigrator.resolveLocationIcon("实验室"));
        assertEquals("🐭", AssetSchemaMigrator.resolveLocationIcon("动物房"));
        assertEquals("🚪", AssetSchemaMigrator.resolveLocationIcon("走廊"));
        assertEquals("📦", AssetSchemaMigrator.resolveLocationIcon("库房"));
        assertEquals("🖥️", AssetSchemaMigrator.resolveLocationIcon("监控室"));
        assertEquals("🩺", AssetSchemaMigrator.resolveLocationIcon("手术室"));
    }

    @Test
    void locationOrderSensitiveOfficeBeatsExperiment() {
        // 含「实验」但更具体的是「办公室」→ 办公室规则在前
        assertEquals("🏢",
                AssetSchemaMigrator.resolveLocationIcon("浦东校区实验动物科学部办公室154"));
    }

    @Test
    void locationFallback() {
        assertEquals("📁", AssetSchemaMigrator.resolveLocationIcon("未知地点"));
        assertEquals("📁", AssetSchemaMigrator.resolveLocationIcon(null));
    }
}
