-- =============================================================================
-- MobileZone — 01. Database and application user (MySQL 8.0.16+ or MariaDB 10.4+)
-- Run as an administrative user (root). Change the password before running.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS mobilezone
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Separate database for the automated tests (optional).
CREATE DATABASE IF NOT EXISTS mobilezone_test
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'mobilezone'@'%' IDENTIFIED BY 'change-me';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, LOCK TABLES
  ON mobilezone.* TO 'mobilezone'@'%';
GRANT ALL PRIVILEGES ON mobilezone_test.* TO 'mobilezone'@'%';

FLUSH PRIVILEGES;
