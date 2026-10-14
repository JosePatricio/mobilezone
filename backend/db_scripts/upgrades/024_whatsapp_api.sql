-- =============================================================================
-- MobileZone — Upgrade 024 (for databases at upgrade 023)
--
--   * Propaganda through the WhatsApp Cloud API (Meta): campaigns (one approved template sent to
--     many clients), the state of each message (sent / delivered / read / failed) and the phones
--     that answered BAJA / STOP.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/024_whatsapp_api.sql).
-- Alembic revision 0024 runs this same file (`alembic upgrade head`).
-- =============================================================================

SET NAMES utf8mb4;

CREATE TABLE whatsapp_campaigns (
    id         INTEGER      NOT NULL AUTO_INCREMENT,
    plantilla  VARCHAR(512) NOT NULL COMMENT 'name of the template approved by Meta',
    idioma     VARCHAR(15)  NOT NULL COMMENT 'language code of the template, e.g. es, en_US',
    categoria  VARCHAR(20)  NOT NULL COMMENT 'MARKETING | UTILITY | AUTHENTICATION (price per message)',
    created_by INTEGER               COMMENT 'user who sent the campaign',
    created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_whatsapp_campaigns PRIMARY KEY (id),
    CONSTRAINT fk_whatsapp_campaigns_created_by_users FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_whatsapp_campaigns_created_by ON whatsapp_campaigns (created_by);

CREATE TABLE whatsapp_messages (
    id            INTEGER      NOT NULL AUTO_INCREMENT,
    campaign_id   INTEGER      NOT NULL,
    cliente_id    INTEGER               COMMENT 'client (role CLIENTE); NULL if the user was deleted',
    telefono      VARCHAR(20)  NOT NULL COMMENT 'international number without +, e.g. 593991234567',
    parametros    TEXT                  COMMENT 'values of the template placeholders (JSON list)',
    estado        VARCHAR(30)  NOT NULL COMMENT 'PENDIENTE | ENVIADO | ENTREGADO | LEIDO | FALLIDO',
    wa_message_id VARCHAR(128)          COMMENT 'message id given by Meta (wamid); the webhooks refer to it',
    error         VARCHAR(500),
    updated_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_whatsapp_messages PRIMARY KEY (id),
    CONSTRAINT uq_whatsapp_messages_wa_message_id UNIQUE (wa_message_id),
    CONSTRAINT fk_whatsapp_messages_campaign_id_whatsapp_campaigns FOREIGN KEY (campaign_id) REFERENCES whatsapp_campaigns (id) ON DELETE CASCADE,
    CONSTRAINT fk_whatsapp_messages_cliente_id_users FOREIGN KEY (cliente_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_whatsapp_messages_campaign_id ON whatsapp_messages (campaign_id);
CREATE INDEX ix_whatsapp_messages_cliente_id ON whatsapp_messages (cliente_id);

CREATE TABLE whatsapp_opt_outs (
    telefono   VARCHAR(20) NOT NULL COMMENT 'phone that answered BAJA / STOP: campaigns skip it until it answers ALTA',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_whatsapp_opt_outs PRIMARY KEY (telefono)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
