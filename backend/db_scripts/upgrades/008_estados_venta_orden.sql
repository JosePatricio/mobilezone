-- =============================================================================
-- MobileZone — Upgrade 008 (for databases at upgrade 007)
--
--   * Work orders: status history (who, when, note, approximate delivery time).
--   * Sales: a finalized work order registers a sale (sales.work_order_id).
--   * Orders without technician get the user who registered them.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/008_estados_venta_orden.sql).
-- Alembic revision 0008 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE work_order_status_changes (
    id            INTEGER     NOT NULL AUTO_INCREMENT,
    work_order_id INTEGER     NOT NULL,
    estado        INTEGER     NOT NULL COMMENT '0 Recibido | 1 En proceso | 2 Finalizado',
    user_id       INTEGER     NOT NULL COMMENT 'user who changed the status',
    observacion   TEXT,
    fecha_entrega DATETIME(6)          COMMENT 'approximate delivery time (UTC), En proceso',
    created_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_work_order_status_changes PRIMARY KEY (id),
    CONSTRAINT fk_work_order_status_changes_work_order_id_work_orders
        FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_work_order_status_changes_user_id_users FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_work_order_status_changes_user_id ON work_order_status_changes (user_id);
CREATE INDEX ix_work_order_status_changes_work_order_id ON work_order_status_changes (work_order_id);

-- History of the existing orders: their current status, registered by the user who created them.
INSERT INTO work_order_status_changes (work_order_id, estado, user_id, created_at)
SELECT id, estado, user_id, created_at FROM work_orders;

ALTER TABLE sales
    ADD COLUMN work_order_id INTEGER NULL COMMENT 'sale of a finalized work order (no product lines)' AFTER cambio,
    ADD CONSTRAINT uq_sales_work_order_id UNIQUE (work_order_id),
    ADD CONSTRAINT fk_sales_work_order_id_work_orders FOREIGN KEY (work_order_id) REFERENCES work_orders (id);

UPDATE work_orders SET tecnico_id = user_id WHERE tecnico_id IS NULL;
