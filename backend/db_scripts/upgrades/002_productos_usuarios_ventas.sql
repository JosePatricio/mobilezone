-- =============================================================================
-- MobileZone — Upgrade 002 (for databases created with the previous version)
--
--   * Roles: USUARIO -> VENDEDOR (only Ventas + Productos), new CLIENTE role.
--     The role replaces users.tipo_usuario (column removed, rol_id becomes required).
--   * Users: identificacion (cedula / RUC), celular, ciudad, foto.
--   * Products: sku, precio -> precio_venta (PVP), precio_costo, precio_mayor, imagen.
--   * Sales: factura (1 factura / 0 comprobante), cliente_id (NULL = consumidor final).
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/002_productos_usuarios_ventas.sql).
-- Alembic revision 0002 runs this same file (`alembic upgrade head`).
-- DDL statements are not transactional in MySQL/MariaDB: take a backup first.
-- Requires MySQL 8.0.19+ or MariaDB 10.4+ (ALTER TABLE ... DROP CONSTRAINT).
-- New installations use 02_create_tables.sql + 03_seed_data.sql instead.
-- =============================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- 1. Roles
-- -----------------------------------------------------------------------------
UPDATE roles SET nombre = 'VENDEDOR', descripcion = 'Rol vendedor (por defecto)' WHERE nombre = 'USUARIO';

INSERT IGNORE INTO roles (nombre, descripcion) VALUES
    ('ADMIN', 'Rol admin (por defecto)'),
    ('VENDEDOR', 'Rol vendedor (por defecto)'),
    ('TECNICO', 'Rol tecnico (por defecto)'),
    ('CLIENTE', 'Rol cliente (por defecto)');

-- VENDEDOR: only the Ventas and Productos modules.
DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE nombre IN ('VENDEDOR', 'CLIENTE'));

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.codigo IN (
    'products.view', 'sales.view', 'sales.create'
) WHERE r.nombre = 'VENDEDOR';

-- -----------------------------------------------------------------------------
-- 2. Users: new fields and role instead of tipo_usuario
-- -----------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN identificacion VARCHAR(13) NULL COMMENT 'cedula (10 digits) or RUC (13 digits)' AFTER password,
    ADD COLUMN celular VARCHAR(20) NULL AFTER identificacion,
    ADD COLUMN ciudad VARCHAR(100) NULL AFTER celular,
    ADD COLUMN foto VARCHAR(255) NULL COMMENT 'relative path of the uploaded photo; NULL = default avatar' AFTER ciudad,
    ADD CONSTRAINT uq_users_identificacion UNIQUE (identificacion);

-- Clients always get the CLIENTE role; the rest keep their role or get the one matching their old type.
UPDATE users u JOIN roles r ON r.nombre = 'CLIENTE'
SET u.rol_id = r.id, u.password = NULL
WHERE u.tipo_usuario = 'CLIENTE';

UPDATE users u JOIN roles r
    ON r.nombre = CASE u.tipo_usuario WHEN 'USUARIO' THEN 'VENDEDOR' ELSE u.tipo_usuario END
SET u.rol_id = r.id
WHERE u.rol_id IS NULL;

DROP INDEX ix_users_tipo_usuario ON users;

-- rol_id becomes mandatory (the FK is recreated around the change for compatibility).
ALTER TABLE users DROP FOREIGN KEY fk_users_rol_id_roles;

ALTER TABLE users
    DROP COLUMN tipo_usuario,
    MODIFY rol_id INTEGER NOT NULL COMMENT 'the role defines the kind of user (ADMIN, VENDEDOR, TECNICO, CLIENTE, ...)';

ALTER TABLE users ADD CONSTRAINT fk_users_rol_id_roles FOREIGN KEY (rol_id) REFERENCES roles (id);

-- -----------------------------------------------------------------------------
-- 3. Products: SKU, three prices, image (no initial stock field in the app)
-- -----------------------------------------------------------------------------
ALTER TABLE products DROP CONSTRAINT ck_products_precio_non_negative;

ALTER TABLE products
    CHANGE COLUMN precio precio_venta DECIMAL(12,2) NOT NULL COMMENT 'PVP, used in sales';

ALTER TABLE products
    ADD COLUMN sku VARCHAR(50) NULL COMMENT 'product code (uppercase, no spaces)' AFTER category_id,
    ADD COLUMN precio_costo DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'acquisition cost' AFTER precio_venta,
    ADD COLUMN precio_mayor DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'wholesale price' AFTER precio_costo,
    ADD COLUMN imagen VARCHAR(255) NULL COMMENT 'relative path of the uploaded image; NULL = default image' AFTER stock;

-- Existing products: provisional SKU (edit them later) and wholesale price = PVP.
UPDATE products SET sku = CONCAT('SKU-', LPAD(id, 6, '0')) WHERE sku IS NULL;
UPDATE products SET precio_mayor = precio_venta;

ALTER TABLE products
    MODIFY sku VARCHAR(50) NOT NULL COMMENT 'product code (uppercase, no spaces)',
    MODIFY precio_costo DECIMAL(12,2) NOT NULL COMMENT 'acquisition cost',
    MODIFY precio_mayor DECIMAL(12,2) NOT NULL COMMENT 'wholesale price',
    ADD CONSTRAINT uq_products_sku UNIQUE (sku),
    ADD CONSTRAINT ck_products_precios_non_negative
        CHECK (precio_venta >= 0 AND precio_costo >= 0 AND precio_mayor >= 0);

-- -----------------------------------------------------------------------------
-- 4. Sales: factura / comprobante and client
-- -----------------------------------------------------------------------------
ALTER TABLE sales
    ADD COLUMN factura BOOL NOT NULL DEFAULT 0 COMMENT '1 = factura, 0 = comprobante de venta' AFTER estado,
    ADD COLUMN cliente_id INTEGER NULL COMMENT 'client (role CLIENTE); NULL = consumidor final' AFTER factura;

CREATE INDEX ix_sales_cliente_id ON sales (cliente_id);

ALTER TABLE sales
    ADD CONSTRAINT fk_sales_cliente_id_users FOREIGN KEY (cliente_id) REFERENCES users (id);
