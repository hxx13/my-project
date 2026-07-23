ALTER TABLE user_aro_binding
  ADD COLUMN cas_token   TEXT        NULL COMMENT 'CAS换来的JWT(AES-256加密)',
  ADD COLUMN cas_token_exp BIGINT    NULL COMMENT 'Token过期Unix秒',
  ADD COLUMN cas_tgc      TEXT        NULL COMMENT 'CASTGC Cookie值(AES-256加密)',
  ADD COLUMN cas_account  VARCHAR(50) NULL COMMENT 'CAS账号名';
