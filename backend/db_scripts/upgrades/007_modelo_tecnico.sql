-- =============================================================================
-- MobileZone — Upgrade 007 (for databases at upgrade 006)
--
--   * Work orders: technical model code of the phone (modelo_tecnico, e.g. SM-A105M).
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/007_modelo_tecnico.sql).
-- Alembic revision 0007 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE work_orders
    ADD COLUMN modelo_tecnico VARCHAR(50) NULL
        COMMENT 'technical model code of the phone, e.g. SM-A105M' AFTER color;
