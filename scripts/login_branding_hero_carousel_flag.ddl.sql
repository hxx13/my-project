-- 为已有 login_branding JSON 增补 heroCarouselEnabled（缺省 true）；不改表结构。
-- 目标库（见 application.properties 的 spring.datasource.url）在已有库上执行一次即可。
UPDATE sys_site_config
SET config_value_json = JSON_SET(config_value_json, '$.heroCarouselEnabled', true)
WHERE config_key = 'login_branding'
  AND JSON_EXTRACT(config_value_json, '$.heroCarouselEnabled') IS NULL;
