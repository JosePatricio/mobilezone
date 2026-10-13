-- =============================================================================
-- MobileZone — Upgrade 022 (for databases at upgrade 021)
--
--   * Sales of finalized work orders: cost of the spare part (sales.costo_repuesto,
--     optional; profit of the sale = total - costo_repuesto). Existing sales have none.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/022_costo_repuesto_venta.sql).
-- Alembic revision 0022 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE sales
    ADD COLUMN costo_repuesto DECIMAL(12,2) NULL
        COMMENT 'work order sale: cost of the spare part (profit = total - costo)' AFTER work_order_id;
