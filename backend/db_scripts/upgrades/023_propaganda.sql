-- =============================================================================
-- MobileZone — Upgrade 023 (for databases at upgrade 022)
--
--   * New module Propaganda (CRM): permission marketing.manage for ADMIN.
--     It prepares WhatsApp / SMS messages for the clients that have work orders.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/023_propaganda.sql).
-- Alembic revision 0023 runs this same file (`alembic upgrade head`).
-- =============================================================================

SET NAMES utf8mb4;

INSERT INTO permissions (codigo, descripcion) VALUES
    ('marketing.manage', 'Propaganda: preparar mensajes CRM (WhatsApp / SMS) para los clientes de órdenes')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.codigo = 'marketing.manage'
WHERE r.nombre = 'ADMIN';
