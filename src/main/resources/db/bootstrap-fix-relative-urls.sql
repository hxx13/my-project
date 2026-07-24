-- ============================================================
-- 自动修复相对路径 → 绝对 URL（启动时执行，幂等）
-- 【新增图片列在此加 UPDATE 语句】详见 docs/双端图片互通开发者指南.md
-- ============================================================
-- 统一使用 REPLACE 移除旧 IP 前缀（幂等，可重复执行）。
-- 单值列与 JSON 数组列统一用 WHERE col LIKE '%47.101.61.184%' 匹配。
UPDATE supply_item SET cover_url = REPLACE(cover_url, 'http://47.101.61.184:8080', '')
WHERE cover_url LIKE '%47.101.61.184%';

UPDATE asset_transfer_request SET photo_url = REPLACE(photo_url, 'http://47.101.61.184:8080', '')
WHERE photo_url LIKE '%47.101.61.184%';

UPDATE asset_transfer_request SET photo_urls_before = REPLACE(photo_urls_before, 'http://47.101.61.184:8080', '')
WHERE photo_urls_before LIKE '%47.101.61.184%';

UPDATE asset_transfer_request SET photo_urls_after = REPLACE(photo_urls_after, 'http://47.101.61.184:8080', '')
WHERE photo_urls_after LIKE '%47.101.61.184%';

UPDATE repair_order SET request_images_json = REPLACE(request_images_json, 'http://47.101.61.184:8080', '')
WHERE request_images_json LIKE '%47.101.61.184%';

UPDATE repair_order SET result_images_json = REPLACE(result_images_json, 'http://47.101.61.184:8080', '')
WHERE result_images_json LIKE '%47.101.61.184%';

UPDATE purchase_order SET request_images_json = REPLACE(request_images_json, 'http://47.101.61.184:8080', '')
WHERE purchase_order.request_images_json LIKE '%47.101.61.184%';

UPDATE purchase_order SET result_images_json = REPLACE(result_images_json, 'http://47.101.61.184:8080', '')
WHERE purchase_order.result_images_json LIKE '%47.101.61.184%';

UPDATE twin_student_violation SET image_urls = REPLACE(image_urls, 'http://47.101.61.184:8080', '')
WHERE image_urls LIKE '%47.101.61.184%';
