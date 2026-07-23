CREATE TABLE IF NOT EXISTS student_cage_shelf_pin (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    shelve_id VARCHAR(128) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_shelve (user_id, shelve_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
