-- ARO 培训数据本地缓存表，每日定时同步，避免实时调用 ARO API 超时

CREATE TABLE IF NOT EXISTS aro_training_session (
    id              BIGINT PRIMARY KEY,
    title           VARCHAR(500),
    test_content    TEXT,
    address         VARCHAR(500),
    start_time      DATETIME,
    end_time        DATETIME,
    sign_number     INT DEFAULT 0,
    examiner_name   VARCHAR(200),
    examiner_number VARCHAR(100),
    exam_cert_type  INT DEFAULT 1,
    exam_state      INT DEFAULT 1,
    state           INT DEFAULT 1,
    cached_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cached_at (cached_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS aro_training_trainee (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id      BIGINT NOT NULL,
    exam_sign_id    BIGINT,
    name            VARCHAR(200),
    job_number      VARCHAR(100),
    mobile_phone    VARCHAR(50),
    project_group   VARCHAR(500),
    test_yn         INT DEFAULT 0,
    test_fraction   INT DEFAULT 0,
    user_id         VARCHAR(100),
    room_ids_json   TEXT,
    rooms_json      MEDIUMTEXT,
    cached_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
