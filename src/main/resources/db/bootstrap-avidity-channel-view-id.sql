-- 安维迪通道表加「组态画面 ID」。
-- 每个通道的平面图布局按画面 ID 存成一份资源（src/main/resources/avidity/<画面ID>.json），
-- 前端拿通道时把这个 ID 带回去取对应的平面图。用 ID 而不是通道名来绑，通道改名不会断。
-- 画面 ID 从通道内容块里读得到（props.configureViewId），同步时一并落库。
--
-- 一文件一条 DDL：撞「列已存在」会中止整份脚本，后面的语句永不执行（其余场景照旧）。
ALTER TABLE avidity_channel ADD COLUMN configure_view_id BIGINT NULL COMMENT '厂平台组态画面 ID，对应 resources/avidity/<ID>.json';
