-- =============================================================================
-- MobileZone — Upgrade 014 (for databases at upgrade 013)
--
--   * Permission users.delete (delete a user; its sales and orders go to another user),
--     granted to ADMIN. Other roles can receive it from Roles › Permisos.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/014_eliminar_usuarios.sql).
-- Alembic revision 0014 runs this same file (`alembic upgrade head`).
-- =============================================================================

SET NAMES utf8mb4;

INSERT INTO permissions (codigo, descripcion) VALUES
    ('users.delete', 'Eliminar usuarios (sus ventas y órdenes pasan a otro usuario)')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.codigo = 'users.delete'
WHERE r.nombre = 'ADMIN';
