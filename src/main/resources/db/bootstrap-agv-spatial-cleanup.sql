-- 清理自动导入的非关键站点区域（只保留 CP/LM/AP + BEHAVIOR/MANUAL）
DELETE FROM agv_spatial_element
WHERE source = 'AUTO'
  AND name NOT LIKE 'CP%'
  AND name NOT LIKE 'LM%'
  AND name NOT LIKE 'AP%';
