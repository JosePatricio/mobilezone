-- =============================================================================
-- MobileZone — Upgrade 026 (for databases at upgrade 025)
--
--   * Products: recommended minimum stock (products.minimo_recomendado). When the total
--     stock of an active product is below it, the dashboard alerts. Existing products get 0
--     (no alert).
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/026_minimo_recomendado.sql).
-- Alembic revision 0026 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE products
    ADD COLUMN minimo_recomendado INTEGER NOT NULL DEFAULT 0
        COMMENT 'recommended minimum total stock; below it the dashboard alerts (0 = no alert)' AFTER precio_mayor,
    ADD CONSTRAINT ck_products_minimo_recomendado_non_negative CHECK (minimo_recomendado >= 0);
