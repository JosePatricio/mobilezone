# db_scripts — MySQL

Database scripts for MobileZone. Requires **MySQL 8.0.16+ or MariaDB 10.4+** (both enforce `CHECK`
constraints), InnoDB and `utf8mb4`. The scripts avoid MySQL-only syntax so they run on both servers.

| Script | Content |
|---|---|
| `01_create_database.sql` | Databases `mobilezone` and `mobilezone_test`, application user and grants (run as root) |
| `02_create_tables.sql` | All tables, primary/foreign keys, unique and check constraints, indexes |
| `03_seed_data.sql` | Permission catalog, default roles (ADMIN / USUARIO / TECNICO), admin user — idempotent |
| `99_drop_tables.sql` | Drops every table (destructive) |
| `upgrades/002_productos_usuarios_ventas.sql` | Upgrades a version 1 database (run once, after a backup) |
| `upgrades/003_sucursales_inventario.sql` | Upgrades a version 2 database: branches, inventory per branch, user branches, provincia (run once) |
| `upgrades/004_pagos_permisos.sql` | Upgrades a version 3 database: sale payments (method, card surcharge, change), `branches.any`, `sales.update` (run once) |

## Option A — Alembic + Python seed (recommended)

```bash
mysql -u root -p < db_scripts/01_create_database.sql
# set DATABASE_URL in backend/.env
alembic upgrade head                          # revision 0001 executes 02_create_tables.sql
python -m app.infrastructure.database.seed    # admin credentials taken from .env
```

## Option B — plain SQL

```bash
mysql -u root -p < db_scripts/01_create_database.sql
mysql -u mobilezone -p mobilezone < db_scripts/02_create_tables.sql
mysql -u mobilezone -p mobilezone < db_scripts/03_seed_data.sql
```

The SQL seed creates `admin@example.com` / `Admin12345`: change that password after the first login.

## Upgrading an existing database

`02_create_tables.sql` always holds the **current** full schema (new installations). Databases created with an older
version are upgraded with the scripts in `upgrades/`, in order (Alembic runs them too: revision 0002 executes
`upgrades/002_productos_usuarios_ventas.sql`, revision 0003 `upgrades/003_sucursales_inventario.sql`, revision 0004
`upgrades/004_pagos_permisos.sql`; revision 0001
runs the frozen copy in `migrations/sql/`).

Upgrade 002: role replaces `users.tipo_usuario` (USUARIO → VENDEDOR, new CLIENTE role), new user fields
(identificacion, celular, ciudad, foto), products (sku, precio → precio_venta, precio_costo, precio_mayor, imagen) and
sales (factura, cliente_id).

Upgrade 003: branches (sucursales) with a default branch "Matriz" that receives the current stock of every product,
`inventory` (stock per product and branch; `products.stock` is removed), `user_branches` (existing sellers are
assigned to Matriz), `sales.branch_id`, `sale_details.inventory_id`, `stock_movements.inventory_id`,
`users.provincia` and the new permissions (`branches.*`, `inventory.*`, `sales.any_branch`).

DDL is not transactional in MySQL/MariaDB: **take a backup first**.

## Keeping things in sync

`02_create_tables.sql` must match `app/infrastructure/database/tables.py`, and `03_seed_data.sql` must match
`app/domain/value_objects/permissions.py`. `tests/test_db_scripts.py` fails when a table, column, constraint,
index or permission is missing. For future schema changes add a new Alembic revision **and** update these scripts.
