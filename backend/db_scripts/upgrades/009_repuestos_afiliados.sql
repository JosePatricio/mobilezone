-- =============================================================================
-- MobileZone — Upgrade 009 (for databases at upgrade 008)
--
--   * Users: address (users.direccion), shown in the affiliate spare parts.
--   * Affiliate spare parts: technicians publish their spare parts in a public catalog.
--   * Visit counter of the public catalog page (page_visits).
--   * Permissions affiliate_parts.manage (TECNICO, ADMIN) and affiliate_parts.any (ADMIN).
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/009_repuestos_afiliados.sql).
-- Alembic revision 0009 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE users
    ADD COLUMN direccion VARCHAR(255) NULL COMMENT 'address, shown in the affiliate spare parts' AFTER ciudad;

CREATE TABLE affiliate_parts (
    id          INTEGER       NOT NULL AUTO_INCREMENT,
    user_id     INTEGER       NOT NULL COMMENT 'affiliate (technician) who published it; address = users.direccion',
    tipo        VARCHAR(30)   NOT NULL COMMENT 'CAMARAS, PLACA_PRINCIPAL, BATERIA, PLACA_CARGA, ANTENAS, CRISTAL_CAMARA, TAPAS, DISPLAY, BACK_COVER',
    condicion   VARCHAR(30)   NOT NULL COMMENT 'NUEVO | USADO',
    garantia    BOOL          NOT NULL DEFAULT 0,
    estado      VARCHAR(30)   NOT NULL COMMENT 'DISPONIBLE | VENDIDO',
    descripcion TEXT,
    precio      DECIMAL(12,2),
    created_at  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_affiliate_parts PRIMARY KEY (id),
    CONSTRAINT ck_affiliate_parts_precio_non_negative CHECK (precio IS NULL OR precio >= 0),
    CONSTRAINT fk_affiliate_parts_user_id_users FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_affiliate_parts_estado ON affiliate_parts (estado);
CREATE INDEX ix_affiliate_parts_tipo ON affiliate_parts (tipo);
CREATE INDEX ix_affiliate_parts_user_id ON affiliate_parts (user_id);

CREATE TABLE page_visits (
    pagina     VARCHAR(50)  NOT NULL,
    visitas    INTEGER      NOT NULL DEFAULT 0,
    updated_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_page_visits PRIMARY KEY (pagina)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Permissions -----------------------------------------------------------------
INSERT INTO permissions (codigo, descripcion) VALUES
    ('affiliate_parts.manage', 'Repuestos de afiliados: publicar y administrar sus propios repuestos'),
    ('affiliate_parts.any', 'Repuestos de afiliados: administrar los repuestos de todos los afiliados')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.codigo IN ('affiliate_parts.manage', 'affiliate_parts.any')
WHERE r.nombre = 'ADMIN';

-- TECNICO (only when the role is already configured; otherwise the seed sets its defaults).
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.codigo = 'affiliate_parts.manage'
WHERE r.nombre = 'TECNICO'
  AND EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id);
