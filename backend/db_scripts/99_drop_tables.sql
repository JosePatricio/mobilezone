-- =============================================================================
-- MobileZone — 99. Drop all tables (DESTRUCTIVE: deletes every record)
-- Reverse dependency order, so foreign key checks can stay enabled.
-- =============================================================================

DROP TABLE IF EXISTS sale_details;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS work_order_status_changes;
DROP TABLE IF EXISTS work_order_photos;
DROP TABLE IF EXISTS work_order_spare_parts;
DROP TABLE IF EXISTS work_orders;
DROP TABLE IF EXISTS spare_parts;
DROP TABLE IF EXISTS affiliate_parts;
DROP TABLE IF EXISTS page_visits;
DROP TABLE IF EXISTS models;
DROP TABLE IF EXISTS brands;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS user_branches;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS permissions;
