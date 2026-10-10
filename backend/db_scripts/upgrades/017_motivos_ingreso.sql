-- =============================================================================
-- MobileZone — Upgrade 017 (for databases at upgrade 016)
--
--   * Work orders: one or more entry reasons (work_orders.motivo_ingreso stores the codes
--     comma separated, e.g. 'PANTALLA,BATERIA'). Existing orders keep their single reason.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/017_motivos_ingreso.sql).
-- Alembic revision 0017 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE work_orders
    MODIFY COLUMN motivo_ingreso VARCHAR(255) NOT NULL
        COMMENT 'one or more, comma separated: CAMBIO_DISPLAY,PIN_CARGA,BATERIA,TAPA,...,OTROS';
