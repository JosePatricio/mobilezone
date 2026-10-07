-- =============================================================================
-- MobileZone — Upgrade 011 (for databases at upgrade 010)
--
--   * Permission work_orders.delete (delete a work order completely), granted to ADMIN.
--     Other roles can receive it from Roles › Permisos.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/011_eliminar_ordenes.sql).
-- Alembic revision 0011 runs this same file (`alembic upgrade head`).
-- =============================================================================

SET NAMES utf8mb4;

INSERT INTO permissions (codigo, descripcion) VALUES
    ('work_orders.delete', 'Eliminar órdenes de trabajo por completo (incluida la venta de una orden finalizada)')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.codigo = 'work_orders.delete'
WHERE r.nombre = 'ADMIN';
