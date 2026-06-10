-- 彻底清空知识库所有数据，准备重新导入
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE knowledge_history;
TRUNCATE TABLE knowledge_pages;
DELETE FROM knowledge_categories;
SET FOREIGN_KEY_CHECKS = 1;

-- 重新插入 23 个种子分类
INSERT INTO knowledge_categories (name, slug, icon, sort_order, created_at, updated_at) VALUES
('AI大模型手册','ai-model-manual','BookOpen',0,NOW(),NOW()),
('CRM手册','crm-manual','BookOpen',0,NOW(),NOW()),
('ERP手册','erp-manual','BookOpen',0,NOW(),NOW()),
('IM即时通讯手册','im-manual','BookOpen',0,NOW(),NOW()),
('IoT物联网手册','iot-manual','BookOpen',0,NOW(),NOW()),
('MES手册','mes-manual','BookOpen',0,NOW(),NOW()),
('WMS手册','wms-manual','BookOpen',0,NOW(),NOW()),
('中间件手册','middleware-manual','BookOpen',0,NOW(),NOW()),
('会员手册','member-manual','BookOpen',0,NOW(),NOW()),
('公众号手册','wechat-mp-manual','BookOpen',0,NOW(),NOW()),
('前端手册 Admin Uniapp','frontend-admin-uniapp','BookOpen',0,NOW(),NOW()),
('前端手册 Vben 5.x','frontend-vben5','BookOpen',0,NOW(),NOW()),
('前端手册 Vue 2.x','frontend-vue2','BookOpen',0,NOW(),NOW()),
('前端手册 Vue 3.x','frontend-vue3','BookOpen',0,NOW(),NOW()),
('后端手册','backend-manual','BookOpen',0,NOW(),NOW()),
('商城手册','mall-manual','BookOpen',0,NOW(),NOW()),
('大屏手册','dashboard-manual','BookOpen',0,NOW(),NOW()),
('工作流手册','workflow-manual','BookOpen',0,NOW(),NOW()),
('支付手册','payment-manual','BookOpen',0,NOW(),NOW()),
('更新日志','changelog','BookOpen',0,NOW(),NOW()),
('系统手册','system-manual','BookOpen',0,NOW(),NOW()),
('萌新必读','newbie-guide','BookOpen',0,NOW(),NOW()),
('运维手册','ops-manual','BookOpen',0,NOW(),NOW());
