-- =============================================================================
-- MobileZone — Upgrade 028 (for databases at upgrade 027)
--
--   * Propaganda → Ruleta: prize wheels (name and image of each slice, valid between two dates)
--     and the single-use links sent in the WhatsApp campaigns, with when each client opened the
--     link, when they spun the wheel and what they won.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/028_ruleta.sql).
-- Alembic revision 0028 runs this same file (`alembic upgrade head`).
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE roulettes (
    id           INTEGER      NOT NULL AUTO_INCREMENT,
    nombre       VARCHAR(100) NOT NULL,
    fecha_inicio DATE         NOT NULL COMMENT 'first local day the wheel can be played',
    fecha_fin    DATE         NOT NULL COMMENT 'last local day the wheel can be played',
    created_by   INTEGER               COMMENT 'user who created the wheel',
    created_at   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_roulettes PRIMARY KEY (id),
    CONSTRAINT ck_roulettes_fechas_valid CHECK (fecha_fin >= fecha_inicio),
    CONSTRAINT fk_roulettes_created_by_users FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_roulettes_created_by ON roulettes (created_by);

CREATE TABLE roulette_items (
    id          INTEGER      NOT NULL AUTO_INCREMENT,
    roulette_id INTEGER      NOT NULL,
    posicion    INTEGER      NOT NULL COMMENT 'order of the slice on the wheel',
    nombre      VARCHAR(100) NOT NULL,
    imagen      VARCHAR(255)          COMMENT 'path under media/',
    premio      BOOL         NOT NULL DEFAULT 1 COMMENT '0 = no prize (e.g. Sigue intentando)',
    CONSTRAINT pk_roulette_items PRIMARY KEY (id),
    CONSTRAINT fk_roulette_items_roulette_id_roulettes FOREIGN KEY (roulette_id) REFERENCES roulettes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_roulette_items_roulette_id ON roulette_items (roulette_id);

CREATE TABLE roulette_plays (
    id          INTEGER      NOT NULL AUTO_INCREMENT,
    roulette_id INTEGER      NOT NULL,
    campaign_id INTEGER               COMMENT 'WhatsApp campaign that sent the link',
    cliente_id  INTEGER               COMMENT 'client (role CLIENTE); NULL for numbers typed by hand',
    telefono    VARCHAR(20)  NOT NULL COMMENT 'international number without +',
    token       VARCHAR(64)  NOT NULL COMMENT 'unguessable code of the public link (valid once)',
    abierto_at  DATETIME(6)           COMMENT 'first time the client opened the link (UTC)',
    jugado_at   DATETIME(6)           COMMENT 'when the client spun the wheel (UTC): the link is disabled',
    item_id     INTEGER               COMMENT 'slice the wheel stopped on',
    resultado   VARCHAR(100)          COMMENT 'name of that slice (kept for the history)',
    gano        BOOL         NOT NULL DEFAULT 0 COMMENT '1 = the slice was a prize',
    created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_roulette_plays PRIMARY KEY (id),
    CONSTRAINT uq_roulette_plays_token UNIQUE (token),
    CONSTRAINT fk_roulette_plays_roulette_id_roulettes FOREIGN KEY (roulette_id) REFERENCES roulettes (id) ON DELETE CASCADE,
    CONSTRAINT fk_roulette_plays_campaign_id_whatsapp_campaigns FOREIGN KEY (campaign_id) REFERENCES whatsapp_campaigns (id) ON DELETE SET NULL,
    CONSTRAINT fk_roulette_plays_cliente_id_users FOREIGN KEY (cliente_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_roulette_plays_item_id_roulette_items FOREIGN KEY (item_id) REFERENCES roulette_items (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_roulette_plays_roulette_id ON roulette_plays (roulette_id);
CREATE INDEX ix_roulette_plays_campaign_id ON roulette_plays (campaign_id);
CREATE INDEX ix_roulette_plays_cliente_id ON roulette_plays (cliente_id);
CREATE INDEX ix_roulette_plays_item_id ON roulette_plays (item_id);
