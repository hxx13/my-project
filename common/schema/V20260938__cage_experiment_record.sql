-- 笼位实验记录台账（追加式）：每条记录带时间戳，提交后只读、不可编辑不可删除
CREATE TABLE IF NOT EXISTS cage_experiment_record (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    animal_cage_id BIGINT NOT NULL COMMENT '笼位ID',
    author_id VARCHAR(64) NOT NULL COMMENT '作者 sys_user.id',
    author_name VARCHAR(128) NULL COMMENT '作者姓名快照',
    content TEXT NULL COMMENT '实验记录正文',
    images_json JSON NULL COMMENT '本条记录的照片列表',
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT=草稿(可改) / SUBMITTED=已提交(只读) / ARCHIVED=占用者变更后归档(仅记录模式可见)',
    submitted_at DATETIME NULL COMMENT '提交时间；台账按此倒序',
    archived_at DATETIME NULL COMMENT '归档时间（占用者变更/笼位归档时批量置 ARCHIVED）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_er_cage (animal_cage_id, submitted_at),
    KEY idx_er_draft (animal_cage_id, author_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位实验记录台账（追加式）';
