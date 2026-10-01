-- =============================================================================
-- MobileZone — Upgrade 005 (for databases at upgrade 004)
--
--   * Users: email optional (clients registered from a work order need none).
--   * Work orders: entry reason (motivo de ingreso) + display type, warranty type
--     (replaces the garantia flag), device lock (pattern / PIN), public code for
--     the QR status page and up to 3 photos of the device.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/005_ordenes_trabajo.sql).
-- Alembic revision 0005 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- 1. Users: optional email
-- -----------------------------------------------------------------------------
ALTER TABLE users
    MODIFY email VARCHAR(255) NULL COMMENT 'login; NULL allowed for clients (they do not log in)';

-- -----------------------------------------------------------------------------
-- 2. Work orders
-- -----------------------------------------------------------------------------
ALTER TABLE work_orders
    ADD COLUMN motivo_ingreso VARCHAR(30) NOT NULL DEFAULT 'OTROS'
        COMMENT 'CAMBIO_DISPLAY | PIN_CARGA | BATERIA | TAPA | ... | OTROS' AFTER estado,
    ADD COLUMN tipo_display VARCHAR(30) NULL
        COMMENT 'INCELL | OLED | ORIGINAL (only for CAMBIO_DISPLAY)' AFTER motivo_ingreso,
    ADD COLUMN tipo_garantia VARCHAR(30) NOT NULL DEFAULT 'SIN_GARANTIA'
        COMMENT 'SIN_GARANTIA | GARANTIA_LOCAL | GARANTIA_FABRICA' AFTER tipo_display,
    ADD COLUMN bloqueo_tipo VARCHAR(30) NOT NULL DEFAULT 'NINGUNO' COMMENT 'NINGUNO | PATRON | PIN' AFTER tipo_garantia,
    ADD COLUMN bloqueo_valor VARCHAR(20) NULL
        COMMENT 'pattern as dots 1..9 (e.g. 1-5-9-6) or numeric PIN' AFTER bloqueo_tipo,
    ADD COLUMN codigo_publico VARCHAR(32) NULL
        COMMENT 'unguessable code of the public status page (QR)' AFTER bloqueo_valor;

-- Existing orders: the old garantia flag becomes a warranty type; a public code is generated.
UPDATE work_orders SET tipo_garantia = 'GARANTIA_LOCAL' WHERE garantia = 1;
UPDATE work_orders SET codigo_publico = LEFT(SHA2(CONCAT(UUID(), RAND(), id), 256), 24);

ALTER TABLE work_orders
    ALTER COLUMN motivo_ingreso DROP DEFAULT,
    MODIFY codigo_publico VARCHAR(32) NOT NULL COMMENT 'unguessable code of the public status page (QR)',
    ADD CONSTRAINT uq_work_orders_codigo_publico UNIQUE (codigo_publico),
    DROP COLUMN garantia;

-- -----------------------------------------------------------------------------
-- 3. Photos of the device (up to 3 per order)
-- -----------------------------------------------------------------------------
CREATE TABLE work_order_photos (
    id            INTEGER      NOT NULL AUTO_INCREMENT,
    work_order_id INTEGER      NOT NULL,
    ruta          VARCHAR(255) NOT NULL COMMENT 'relative path in the media storage',
    created_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_work_order_photos PRIMARY KEY (id),
    CONSTRAINT fk_work_order_photos_work_order_id_work_orders
        FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_work_order_photos_work_order_id ON work_order_photos (work_order_id);
