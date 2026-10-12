-- =============================================================================
-- MobileZone — Upgrade 020 (for databases at upgrade 019)
--
--   * Sales: each line can be sold at the wholesale price (sale_details.por_mayor).
--     Existing lines were sold at the PVP (por_mayor = 0).
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/020_precio_mayor_venta.sql).
-- Alembic revision 0020 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE sale_details
    ADD COLUMN por_mayor BOOL NOT NULL DEFAULT 0 COMMENT '1 = wholesale price (precio al por mayor), 0 = PVP'
        AFTER precio_unitario;
