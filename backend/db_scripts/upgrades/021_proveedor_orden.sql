-- =============================================================================
-- MobileZone — Upgrade 021 (for databases at upgrade 020)
--
--   * Work orders: supplier (proveedor) chosen when the order is finalized
--     (work_orders.supplier_id, optional; existing orders have none).
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/021_proveedor_orden.sql).
-- Alembic revision 0021 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

ALTER TABLE work_orders
    ADD COLUMN supplier_id INTEGER NULL COMMENT 'proveedor chosen when the order is finalized' AFTER branch_id,
    ADD CONSTRAINT fk_work_orders_supplier_id_suppliers FOREIGN KEY (supplier_id) REFERENCES suppliers (id);

CREATE INDEX ix_work_orders_supplier_id ON work_orders (supplier_id);
