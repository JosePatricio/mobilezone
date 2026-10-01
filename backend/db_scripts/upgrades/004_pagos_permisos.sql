-- =============================================================================
-- MobileZone — Upgrade 004 (for databases at upgrade 003)
--
--   * Sales: payment method (EFECTIVO / TRANSFERENCIA / TARJETA), credit card
--     surcharge (6 %), amount to pay, cash received and change.
--   * Permissions: sales.any_branch → branches.any (operate in any branch: sell and
--     change stock), new sales.update (modify sales / returns).
--   * VENDEDOR: can also create products, manage the stock of their branches and
--     modify sales.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/004_pagos_permisos.sql).
-- Alembic revision 0004 runs this same file (`alembic upgrade head`).
-- Take a backup first. Then run `python -m app.infrastructure.database.seed`.
-- =============================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- 1. Sales: payment
-- -----------------------------------------------------------------------------
ALTER TABLE sales
    ADD COLUMN metodo_pago VARCHAR(30) NULL
        COMMENT 'EFECTIVO | TRANSFERENCIA | TARJETA; NULL = sale registered before payments were recorded' AFTER cliente_id,
    ADD COLUMN recargo DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'credit card surcharge (6 %)' AFTER metodo_pago,
    ADD COLUMN total_pagar DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'total + recargo' AFTER recargo,
    ADD COLUMN monto_recibido DECIMAL(12,2) NULL COMMENT 'cash received' AFTER total_pagar,
    ADD COLUMN cambio DECIMAL(12,2) NULL COMMENT 'change given back (cash)' AFTER monto_recibido;

-- Existing sales had no surcharge.
UPDATE sales SET total_pagar = total;

-- -----------------------------------------------------------------------------
-- 2. Permissions
-- -----------------------------------------------------------------------------
UPDATE permissions
SET codigo = 'branches.any',
    descripcion = 'Operar en cualquier sucursal: vender y ajustar stock sin estar asignado'
WHERE codigo = 'sales.any_branch';

INSERT INTO permissions (codigo, descripcion) VALUES
    ('branches.any', 'Operar en cualquier sucursal: vender y ajustar stock sin estar asignado'),
    ('sales.update', 'Modificar ventas (devoluciones y cambios de productos)'),
    ('sales.cancel', 'Eliminar (anular) ventas')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

-- ADMIN: every permission.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.nombre = 'ADMIN';

-- VENDEDOR: add products, manage stock of their branches and modify sales
-- (only when the role is already configured; otherwise the seed sets its defaults).
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.codigo IN ('products.create', 'inventory.manage', 'sales.update')
WHERE r.nombre = 'VENDEDOR'
  AND EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id);
