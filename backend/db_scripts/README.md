# db_scripts — MySQL

Database scripts for MobileZone. Requires **MySQL 8.0.16+ or MariaDB 10.4+** (both enforce `CHECK`
constraints), InnoDB and `utf8mb4`. The scripts avoid MySQL-only syntax so they run on both servers.

| Script | Content |
|---|---|
| `01_create_database.sql` | Databases `mobilezone` and `mobilezone_test`, application user and grants (run as root) |
| `02_create_tables.sql` | All tables, primary/foreign keys, unique and check constraints, indexes |
| `03_seed_data.sql` | Permission catalog, default roles (ADMIN / USUARIO / TECNICO), admin user — idempotent |
| `99_drop_tables.sql` | Drops every table (destructive) |

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

## Keeping things in sync

`02_create_tables.sql` must match `app/infrastructure/database/tables.py`, and `03_seed_data.sql` must match
`app/domain/value_objects/permissions.py`. `tests/test_db_scripts.py` fails when a table, column, constraint,
index or permission is missing. For future schema changes add a new Alembic revision **and** update these scripts.
