-- =============================================================================
-- MobileZone — Upgrade 013 (for databases at upgrade 012)
--
--   * Affiliate spare parts: photo (affiliate_parts.imagen).
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/013_imagen_repuesto_afiliado.sql).
-- Alembic revision 0013 runs this same file (`alembic upgrade head`).
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE affiliate_parts
    ADD COLUMN imagen VARCHAR(255) NULL COMMENT 'relative path of the photo; NULL = default image' AFTER precio;
