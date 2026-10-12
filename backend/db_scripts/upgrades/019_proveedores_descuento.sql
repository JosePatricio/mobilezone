-- =============================================================================
-- MobileZone — Upgrade 019 (for databases at upgrade 018)
--
--   * suppliers (proveedores) and the optional supplier of each product (products.supplier_id).
--   * Permissions suppliers.view / create / update / delete, granted to ADMIN.
--   * Sales: discount (sales.descuento); total_pagar = total - descuento + recargo.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/019_proveedores_descuento.sql).
-- Alembic revision 0019 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE suppliers (
    id         INTEGER      NOT NULL AUTO_INCREMENT,
    nombre     VARCHAR(150) NOT NULL,
    ruc        VARCHAR(20),
    telefono   VARCHAR(20),
    email      VARCHAR(255),
    direccion  VARCHAR(255),
    estado     BOOL         NOT NULL DEFAULT 1,
    created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_suppliers PRIMARY KEY (id),
    CONSTRAINT uq_suppliers_nombre UNIQUE (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE products
    ADD COLUMN supplier_id INTEGER NULL COMMENT 'proveedor (optional)' AFTER category_id,
    ADD CONSTRAINT fk_products_supplier_id_suppliers FOREIGN KEY (supplier_id) REFERENCES suppliers (id);

CREATE INDEX ix_products_supplier_id ON products (supplier_id);

ALTER TABLE sales
    ADD COLUMN descuento DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'discount (USD) on the total of the lines' AFTER cambio,
    MODIFY COLUMN total_pagar DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'total - descuento + recargo';

INSERT INTO permissions (codigo, descripcion) VALUES
    ('suppliers.view', 'Ver proveedores'),
    ('suppliers.create', 'Crear proveedores'),
    ('suppliers.update', 'Editar y activar/desactivar proveedores'),
    ('suppliers.delete', 'Eliminar proveedores')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.codigo LIKE 'suppliers.%'
WHERE r.nombre = 'ADMIN';
