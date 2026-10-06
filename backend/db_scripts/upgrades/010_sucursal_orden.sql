-- =============================================================================
-- MobileZone — Upgrade 010 (for databases at upgrade 009)
--
--   * Branches: address (branches.direccion), printed on the work order receipt.
--   * Work orders: branch (local) that receives the device (work_orders.branch_id).
--     Existing orders get the first branch of the user who registered them, else the first branch.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/010_sucursal_orden.sql).
-- Alembic revision 0010 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE branches
    ADD COLUMN direccion VARCHAR(255) NULL COMMENT 'address printed on the work order receipt' AFTER telefono;

ALTER TABLE work_orders
    ADD COLUMN branch_id INTEGER NULL COMMENT 'sucursal (local) that receives the device' AFTER tecnico_id,
    ADD CONSTRAINT fk_work_orders_branch_id_branches FOREIGN KEY (branch_id) REFERENCES branches (id);

CREATE INDEX ix_work_orders_branch_id ON work_orders (branch_id);

UPDATE work_orders
SET branch_id = COALESCE(
    (SELECT MIN(ub.branch_id) FROM user_branches ub WHERE ub.user_id = work_orders.user_id),
    (SELECT MIN(b.id) FROM branches b)
);
