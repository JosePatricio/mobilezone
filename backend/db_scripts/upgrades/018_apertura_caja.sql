-- =============================================================================
-- MobileZone — Upgrade 018 (for databases at upgrade 017)
--
--   * cash_openings (apertura de caja): the first time each day a seller enters Ventas they
--     choose the branch where they work and the cash (USD) the register starts with for change.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/018_apertura_caja.sql).
-- Alembic revision 0018 runs this same file (`alembic upgrade head`).
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE cash_openings (
    id            INTEGER       NOT NULL AUTO_INCREMENT,
    user_id       INTEGER       NOT NULL,
    branch_id     INTEGER       NOT NULL COMMENT 'branch (sucursal) where the seller works that day',
    fecha         DATE          NOT NULL COMMENT 'local day of the shop',
    monto_inicial DECIMAL(12,2) NOT NULL COMMENT 'cash (USD) in the register at the start of the day, for change',
    created_at    DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_cash_openings PRIMARY KEY (id),
    CONSTRAINT uq_cash_openings_user_id_fecha UNIQUE (user_id, fecha),
    CONSTRAINT ck_cash_openings_monto_inicial_non_negative CHECK (monto_inicial >= 0),
    CONSTRAINT fk_cash_openings_user_id_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_cash_openings_branch_id_branches FOREIGN KEY (branch_id) REFERENCES branches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_cash_openings_branch_id ON cash_openings (branch_id);
