-- =============================================================================
-- MobileZone — Upgrade 012 (for databases at upgrade 011)
--
--   * TECNICO (affiliate) only has access to Repuestos de afiliados (affiliate_parts.manage);
--     Mi perfil is open to every user. Any other permission of the role is removed.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/012_tecnico_afiliado.sql).
-- Alembic revision 0012 runs this same file (`alembic upgrade head`).
-- =============================================================================

SET NAMES utf8mb4;

DELETE rp FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.nombre = 'TECNICO' AND p.codigo <> 'affiliate_parts.manage';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.codigo = 'affiliate_parts.manage'
WHERE r.nombre = 'TECNICO';
