-- =============================================================================
-- MobileZone — Upgrade 027 (for databases at upgrade 026)
--
--   * Promoción: each WhatsApp campaign keeps what was sent (text, header and footer of the
--     template, and the header image), so "Ver" shows its preview.
--   * The campaigns sent so far are deleted (with their messages), so the list starts from zero.
--     The phones that answered BAJA / STOP (whatsapp_opt_outs) are kept.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/027_vista_previa_promocion.sql).
-- Alembic revision 0027 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

DELETE FROM whatsapp_messages;
DELETE FROM whatsapp_campaigns;
ALTER TABLE whatsapp_messages AUTO_INCREMENT = 1;
ALTER TABLE whatsapp_campaigns AUTO_INCREMENT = 1;

ALTER TABLE whatsapp_campaigns
    ADD COLUMN cuerpo     TEXT                  COMMENT 'text of the template body as sent, with placeholders {{1}}' AFTER categoria,
    ADD COLUMN encabezado VARCHAR(1024)         COMMENT 'text header of the template' AFTER cuerpo,
    ADD COLUMN pie        VARCHAR(1024)         COMMENT 'footer of the template' AFTER encabezado,
    ADD COLUMN imagen     VARCHAR(255)          COMMENT 'header image (path under media/)' AFTER pie;
