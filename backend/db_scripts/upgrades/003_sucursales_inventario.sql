-- =============================================================================
-- MobileZone — Upgrade 003 (for databases at upgrade 002)
--
--   * Branches (sucursales) and branches assigned to users (sellers).
--   * Inventory: stock per product and branch. products.stock is removed; the
--     current stock of every product is moved to the branch "Matriz".
--   * Sales belong to a branch and each line records the inventory it used.
--   * Stock movements reference the inventory.
--   * Users: provincia (the city is a canton of the province).
--   * Permissions: branches.*, inventory.view / inventory.manage, sales.any_branch;
--     products.stock is removed (replaced by inventory.manage).
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/003_sucursales_inventario.sql).
-- Alembic revision 0003 runs this same file (`alembic upgrade head`).
-- DDL statements are not transactional in MySQL/MariaDB: take a backup first.
-- Then run `python -m app.infrastructure.database.seed` (or 03_seed_data.sql).
-- =============================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- 1. Branches
-- -----------------------------------------------------------------------------
CREATE TABLE branches (
    id         INTEGER      NOT NULL AUTO_INCREMENT,
    nombre     VARCHAR(100) NOT NULL,
    ubicacion  VARCHAR(255) NOT NULL,
    telefono   VARCHAR(20),
    estado     BOOL         NOT NULL DEFAULT 1,
    created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_branches PRIMARY KEY (id),
    CONSTRAINT uq_branches_nombre UNIQUE (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default branch that receives the current stock (rename it / edit its data later).
INSERT INTO branches (nombre, ubicacion) VALUES ('Matriz', 'Por definir');

-- -----------------------------------------------------------------------------
-- 2. Users: provincia and assigned branches
-- -----------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN provincia VARCHAR(100) NULL AFTER celular,
    MODIFY ciudad VARCHAR(100) NULL COMMENT 'canton of the province';

CREATE TABLE user_branches (
    user_id   INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    CONSTRAINT pk_user_branches PRIMARY KEY (user_id, branch_id),
    CONSTRAINT fk_user_branches_user_id_users
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_branches_branch_id_branches
        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing sellers are assigned to Matriz so they can keep selling.
INSERT INTO user_branches (user_id, branch_id)
SELECT u.id, b.id
FROM users u
JOIN roles r ON r.id = u.rol_id AND r.nombre = 'VENDEDOR'
JOIN branches b ON b.nombre = 'Matriz';

-- -----------------------------------------------------------------------------
-- 3. Inventory (stock per product and branch)
-- -----------------------------------------------------------------------------
CREATE TABLE inventory (
    id         INTEGER     NOT NULL AUTO_INCREMENT,
    product_id INTEGER     NOT NULL,
    branch_id  INTEGER     NOT NULL,
    stock      INTEGER     NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_inventory PRIMARY KEY (id),
    CONSTRAINT uq_inventory_product_id_branch_id UNIQUE (product_id, branch_id),
    CONSTRAINT ck_inventory_stock_non_negative CHECK (stock >= 0),
    CONSTRAINT fk_inventory_product_id_products FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT fk_inventory_branch_id_branches FOREIGN KEY (branch_id) REFERENCES branches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_inventory_branch_id ON inventory (branch_id);
CREATE INDEX ix_inventory_product_id ON inventory (product_id);

-- The current stock of every product goes to Matriz.
INSERT INTO inventory (product_id, branch_id, stock)
SELECT p.id, b.id, p.stock
FROM products p
JOIN branches b ON b.nombre = 'Matriz';

-- -----------------------------------------------------------------------------
-- 4. Stock movements reference the inventory
-- -----------------------------------------------------------------------------
ALTER TABLE stock_movements
    ADD COLUMN inventory_id INTEGER NULL COMMENT 'inventory (product + branch)' AFTER product_id;

UPDATE stock_movements m
JOIN inventory i ON i.product_id = m.product_id
JOIN branches b ON b.id = i.branch_id AND b.nombre = 'Matriz'
SET m.inventory_id = i.id;

CREATE INDEX ix_stock_movements_inventory_id ON stock_movements (inventory_id);

ALTER TABLE stock_movements
    ADD CONSTRAINT fk_stock_movements_inventory_id_inventory FOREIGN KEY (inventory_id) REFERENCES inventory (id);

-- -----------------------------------------------------------------------------
-- 5. Sales belong to a branch; each line records its inventory
-- -----------------------------------------------------------------------------
ALTER TABLE sales ADD COLUMN branch_id INTEGER NULL COMMENT 'branch (sucursal) of the sale' AFTER user_id;

UPDATE sales SET branch_id = (SELECT id FROM branches WHERE nombre = 'Matriz');

ALTER TABLE sales MODIFY branch_id INTEGER NOT NULL COMMENT 'branch (sucursal) of the sale';

CREATE INDEX ix_sales_branch_id ON sales (branch_id);

ALTER TABLE sales ADD CONSTRAINT fk_sales_branch_id_branches FOREIGN KEY (branch_id) REFERENCES branches (id);

ALTER TABLE sale_details
    ADD COLUMN inventory_id INTEGER NULL COMMENT 'inventory the units were taken from' AFTER product_id;

UPDATE sale_details d
JOIN inventory i ON i.product_id = d.product_id
JOIN branches b ON b.id = i.branch_id AND b.nombre = 'Matriz'
SET d.inventory_id = i.id;

ALTER TABLE sale_details MODIFY inventory_id INTEGER NOT NULL COMMENT 'inventory the units were taken from';

CREATE INDEX ix_sale_details_inventory_id ON sale_details (inventory_id);

ALTER TABLE sale_details
    ADD CONSTRAINT fk_sale_details_inventory_id_inventory FOREIGN KEY (inventory_id) REFERENCES inventory (id);

-- -----------------------------------------------------------------------------
-- 6. Products no longer store stock
-- -----------------------------------------------------------------------------
ALTER TABLE products DROP CONSTRAINT ck_products_stock_non_negative;

ALTER TABLE products DROP COLUMN stock;

-- -----------------------------------------------------------------------------
-- 7. Permissions
-- -----------------------------------------------------------------------------
DELETE FROM permissions WHERE codigo = 'products.stock';

INSERT INTO permissions (codigo, descripcion) VALUES
    ('branches.view', 'Ver sucursales'),
    ('branches.create', 'Crear sucursales'),
    ('branches.update', 'Editar y activar/desactivar sucursales'),
    ('branches.delete', 'Eliminar sucursales'),
    ('inventory.view', 'Ver inventario (stock por sucursal)'),
    ('inventory.manage', 'Registrar productos en sucursales y ajustar stock'),
    ('sales.any_branch', 'Vender desde cualquier sucursal (sin estar asignado)')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

-- ADMIN: every permission.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.nombre = 'ADMIN';

-- VENDEDOR: also Inventario (only when the role is already configured; otherwise the seed sets its defaults).
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.codigo = 'inventory.view'
WHERE r.nombre = 'VENDEDOR'
  AND EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id);
