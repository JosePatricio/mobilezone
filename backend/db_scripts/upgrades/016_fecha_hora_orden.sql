-- =============================================================================
-- MobileZone — Upgrade 016 (for databases at upgrade 015)
--
--   * Work orders: reception date and time (work_orders.fecha_hora, UTC), shown and editable
--     in the order form. Existing orders take the moment they were registered (created_at).
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/016_fecha_hora_orden.sql).
-- Alembic revision 0016 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE work_orders
    ADD COLUMN fecha_hora DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        COMMENT 'reception date and time (UTC)' AFTER fecha;

UPDATE work_orders SET fecha_hora = created_at;
