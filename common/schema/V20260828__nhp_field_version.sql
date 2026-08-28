-- 字段版本：唯一键 (dictionary_id, field_code) → (dictionary_id, field_code, version)。
-- 跨数据域套可同 field_code（同套内 field_code+version 唯一），支持「新建版本」克隆 FROZEN 保留旧版。

ALTER TABLE crf_field DROP INDEX uk_crf_field_dict_code;
ALTER TABLE crf_field ADD UNIQUE KEY uk_crf_field_dict_code_ver (dictionary_id, field_code, version);
