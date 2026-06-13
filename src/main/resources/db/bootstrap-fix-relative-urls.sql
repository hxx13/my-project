-- ============================================================
-- 自动修复相对路径 → 绝对 URL（启动时执行，幂等）
-- 【新增图片列在此加 UPDATE 语句】详见 docs/双端图片互通开发者指南.md
-- ============================================================
-- 非 JSON 列：UPDATE ... SET col = CONCAT(base, col) WHERE col LIKE '/api/upload/files/%' AND col NOT LIKE 'http%'
-- JSON 数组列：UPDATE ... SET col = REPLACE(col, '"/api/upload/files/', '"http://.../api/upload/files/') WHERE col LIKE '%"/api/upload/files/%'

-- 非 JSON 列（单一 URL）
UPDATE supply_item SET cover_url = CONCAT('http://47.101.61.184:8080', cover_url)
WHERE cover_url LIKE '/api/upload/files/%' AND cover_url NOT LIKE 'http%';

UPDATE asset_transfer_request SET photo_url = CONCAT('http://47.101.61.184:8080', photo_url)
WHERE photo_url LIKE '/api/upload/files/%' AND photo_url NOT LIKE 'http%';

UPDATE asset_transfer_request SET photo_urls_before = REPLACE(photo_urls_before, '"/api/upload/files/', '"http://47.101.61.184:8080/api/upload/files/')
WHERE photo_urls_before LIKE '%"/api/upload/files/%';

UPDATE asset_transfer_request SET photo_urls_after = REPLACE(photo_urls_after, '"/api/upload/files/', '"http://47.101.61.184:8080/api/upload/files/')
WHERE photo_urls_after LIKE '%"/api/upload/files/%';

-- JSON 数组列（用 " 前缀确保只匹配 JSON 字符串值，安全可重复执行）
UPDATE repair_order SET request_images_json = REPLACE(request_images_json, '"/api/upload/files/', '"http://47.101.61.184:8080/api/upload/files/')
WHERE request_images_json LIKE '%"/api/upload/files/%';

UPDATE repair_order SET result_images_json = REPLACE(result_images_json, '"/api/upload/files/', '"http://47.101.61.184:8080/api/upload/files/')
WHERE result_images_json LIKE '%"/api/upload/files/%';

UPDATE purchase_order SET request_images_json = REPLACE(request_images_json, '"/api/upload/files/', '"http://47.101.61.184:8080/api/upload/files/')
WHERE purchase_order.request_images_json LIKE '%"/api/upload/files/%';

UPDATE purchase_order SET result_images_json = REPLACE(result_images_json, '"/api/upload/files/', '"http://47.101.61.184:8080/api/upload/files/')
WHERE purchase_order.result_images_json LIKE '%"/api/upload/files/%';

UPDATE twin_student_violation SET image_urls = REPLACE(image_urls, '"/api/upload/files/', '"http://47.101.61.184:8080/api/upload/files/')
WHERE image_urls LIKE '%"/api/upload/files/%';
