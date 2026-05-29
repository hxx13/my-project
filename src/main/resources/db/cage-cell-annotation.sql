-- Cage cell annotation: editable per-cell notes with images, rich text, and cached ARO data.
-- Access control: only same-project-group members or ADMIN+ can write; all authenticated users can read.
CREATE TABLE IF NOT EXISTS cage_cell_annotation (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    shelve_id       VARCHAR(64)  NOT NULL,
    position_x      INT          NOT NULL,
    position_y      INT          NOT NULL,
    position_label  VARCHAR(16)  NOT NULL COMMENT 'e.g. A-1 through H-10',
    rich_text       MEDIUMTEXT   COMMENT 'Rich text content (HTML)',
    images          TEXT         COMMENT 'JSON array of image URLs',
    aro_raw_data    MEDIUMTEXT   COMMENT 'Cached ARO official cage data (JSON)',
    updated_by      VARCHAR(64)  COMMENT 'User ID that last updated',
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_shelf_pos (shelve_id, position_x, position_y)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
