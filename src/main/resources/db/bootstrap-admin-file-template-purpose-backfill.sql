-- 回填 admin_file_template.purpose：把已被 SOP 引用的存量行标回 SOP。
-- 幂等：只改还是 TEMPLATE 的行，重复跑没有副作用。
--
-- 只回填 SOP 一处：学习资料那条上传路径按用户口径不纳入本次改造，
-- 它的文件继续留在文件模板库列表里。
--
-- COLLATE 必须写死：生产上这两拨表排序规则不同（模板表 unicode_ci，
-- sop_document 是新表），跨拨列对列比较会抛 1267 illegal mix of collations。
UPDATE admin_file_template f
   SET f.purpose = 'SOP'
 WHERE f.purpose = 'TEMPLATE'
   AND f.id IN (SELECT d.file_id COLLATE utf8mb4_unicode_ci FROM sop_document d);
