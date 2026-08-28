-- 访视方案：方案 = 一组 TP 时点定义（TP 码 + 时点名 + 锚点 + 窗口天数）。
-- crf_visit 归属方案（scheme_id），crf_transplant 选方案（visit_scheme_id）决定事件矩阵列与项目工作区 TP 导航。

CREATE TABLE crf_visit_scheme (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL COMMENT '方案名',
    description VARCHAR(255) NULL,
    active      TINYINT      NOT NULL DEFAULT 1,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE crf_visit
    ADD COLUMN scheme_id BIGINT NULL COMMENT '所属方案 FK→crf_visit_scheme.id（NULL=默认）' AFTER id;

ALTER TABLE crf_transplant
    ADD COLUMN visit_scheme_id BIGINT NULL COMMENT '项目选用的访视方案 FK→crf_visit_scheme.id（NULL=默认）' AFTER team_id;
