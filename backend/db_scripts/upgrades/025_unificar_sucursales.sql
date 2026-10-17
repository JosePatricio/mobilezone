-- =============================================================================
-- MobileZone — Upgrade 025 (for databases at upgrade 024)
--
--   * The branch "Centro" is removed: only "Matriz" remains. Nothing is lost, every record of
--     Centro is moved to Matriz first:
--       - inventory: the stock of Centro is added to the stock of Matriz (same product); the stock
--         movements of Centro point to the Matriz row afterwards
--       - user_branches: users of Centro are assigned to Matriz
--       - sales, work orders and cash openings of Centro belong to Matriz
--   * Databases without a branch "Centro" are not changed.
--
-- Run ONCE on the existing database (phpMyAdmin → Importar, or
--   mysql -u root -p mobilezone < db_scripts/upgrades/025_unificar_sucursales.sql).
-- Alembic revision 0025 runs this same file (`alembic upgrade head`).
-- Take a backup first.
-- =============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- Matriz must exist before Centro can be merged into it.
INSERT INTO branches (nombre, ubicacion)
SELECT 'Matriz', 'Por definir' FROM DUAL
WHERE EXISTS (SELECT 1 FROM branches WHERE nombre = 'Centro')
  AND NOT EXISTS (SELECT 1 FROM branches WHERE nombre = 'Matriz');

-- Inventory: Matriz gets a row for every product stocked in Centro, then receives its stock.
INSERT INTO inventory (product_id, branch_id, stock)
SELECT ic.product_id, m.id, 0
FROM inventory ic
JOIN branches c ON c.id = ic.branch_id AND c.nombre = 'Centro'
JOIN branches m ON m.nombre = 'Matriz'
WHERE NOT EXISTS (SELECT 1 FROM inventory im WHERE im.product_id = ic.product_id AND im.branch_id = m.id);

UPDATE inventory im
JOIN branches m ON m.id = im.branch_id AND m.nombre = 'Matriz'
JOIN branches c ON c.nombre = 'Centro'
JOIN inventory ic ON ic.branch_id = c.id AND ic.product_id = im.product_id
SET im.stock = im.stock + ic.stock;

UPDATE stock_movements sm
JOIN inventory ic ON ic.id = sm.inventory_id
JOIN branches c ON c.id = ic.branch_id AND c.nombre = 'Centro'
JOIN branches m ON m.nombre = 'Matriz'
JOIN inventory im ON im.product_id = ic.product_id AND im.branch_id = m.id
SET sm.inventory_id = im.id;

DELETE ic FROM inventory ic
JOIN branches c ON c.id = ic.branch_id AND c.nombre = 'Centro';

-- Users of Centro are assigned to Matriz.
INSERT INTO user_branches (user_id, branch_id)
SELECT ub.user_id, m.id
FROM user_branches ub
JOIN branches c ON c.id = ub.branch_id AND c.nombre = 'Centro'
JOIN branches m ON m.nombre = 'Matriz'
WHERE NOT EXISTS (SELECT 1 FROM user_branches x WHERE x.user_id = ub.user_id AND x.branch_id = m.id);

DELETE ub FROM user_branches ub
JOIN branches c ON c.id = ub.branch_id AND c.nombre = 'Centro';

-- Sales, work orders and cash openings.
UPDATE sales s
JOIN branches c ON c.id = s.branch_id AND c.nombre = 'Centro'
JOIN branches m ON m.nombre = 'Matriz'
SET s.branch_id = m.id;

UPDATE work_orders w
JOIN branches c ON c.id = w.branch_id AND c.nombre = 'Centro'
JOIN branches m ON m.nombre = 'Matriz'
SET w.branch_id = m.id;

UPDATE cash_openings co
JOIN branches c ON c.id = co.branch_id AND c.nombre = 'Centro'
JOIN branches m ON m.nombre = 'Matriz'
SET co.branch_id = m.id;

DELETE FROM branches WHERE nombre = 'Centro';

COMMIT;
