-- =============================================================================
-- MobileZone — Upgrade 006 (for databases at upgrade 005)
--
--   * Work orders: tipo de garantía → tiempo de garantía in days (garantia_dias),
--     new promised delivery date and time (fecha_entrega). The technician is now
--     the user who registers the order, so work_orders.assign_technician is removed.
--   * VENDEDOR: work orders, spare parts (view), brands and models.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/006_ordenes_vendedor.sql).
-- Alembic revision 0006 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- 1. Work orders: warranty in days and delivery date
-- -----------------------------------------------------------------------------
ALTER TABLE work_orders
    ADD COLUMN garantia_dias INTEGER NOT NULL DEFAULT 0
        COMMENT 'tiempo de garantia in days (0 = sin garantia)' AFTER tipo_display,
    ADD COLUMN fecha_entrega DATETIME(6) NULL COMMENT 'promised delivery date and time (UTC)' AFTER fecha;

-- Orders registered with a warranty type keep a warranty of 30 days.
UPDATE work_orders SET garantia_dias = 30 WHERE tipo_garantia <> 'SIN_GARANTIA';

ALTER TABLE work_orders
    ADD CONSTRAINT ck_work_orders_garantia_dias_non_negative CHECK (garantia_dias >= 0),
    DROP COLUMN tipo_garantia,
    MODIFY tecnico_id INTEGER NULL COMMENT 'technician: the user who registered the order';

-- -----------------------------------------------------------------------------
-- 2. Permissions
-- -----------------------------------------------------------------------------
-- The technician is the logged user: assigning another technician no longer exists.
DELETE FROM permissions WHERE codigo = 'work_orders.assign_technician';

-- VENDEDOR: work orders, brands and models
-- (only when the role is already configured; otherwise the seed sets its defaults).
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.codigo IN (
    'work_orders.view', 'work_orders.create', 'work_orders.update',
    'work_orders.spare_parts.add', 'work_orders.spare_parts.remove', 'spare_parts.view',
    'brands.view', 'brands.create', 'brands.update',
    'models.view', 'models.create', 'models.update'
)
WHERE r.nombre = 'VENDEDOR'
  AND EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id);
