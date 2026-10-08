-- =============================================================================
-- MobileZone — Upgrade 015 (for databases at upgrade 014)
--
--   * settings: configurable values (daily sales goals of the header emoji).
--   * The "vaciar todos los datos" option is removed (permission settings.reset_data);
--     new permission settings.manage (Configuración › Metas de venta) for ADMIN.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/015_metas_venta.sql).
-- Alembic revision 0015 runs this same file (`alembic upgrade head`).
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE settings (
    clave      VARCHAR(50)  NOT NULL,
    valor      VARCHAR(255) NOT NULL,
    updated_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_settings PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELETE FROM permissions WHERE codigo = 'settings.reset_data';

INSERT INTO permissions (codigo, descripcion) VALUES
    ('settings.manage', 'Configuración: metas de venta del día (emoji de la cabecera)')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.codigo = 'settings.manage'
WHERE r.nombre = 'ADMIN';
