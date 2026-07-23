-- Rename STUDENT role to MEMBER across the database
UPDATE sys_user SET role = 'MEMBER' WHERE role = 'STUDENT';
