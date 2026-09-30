# MobileZone — Ventas y Órdenes de Trabajo

Implementación de `BACKEND_SPEC.md` (FastAPI, Clean Architecture) y `FRONTEND_SPEC.md` (React + TypeScript).

> **Despliegue con Docker en un servidor Ubuntu:** ver [`DOCKER.md`](DOCKER.md).

## Puesta en marcha

### Backend (`backend/`)

Requiere **MySQL 8.0.16+ o MariaDB 10.4+**. Los scripts de base de datos están en [`backend/db_scripts`](backend/db_scripts/README.md).

```bash
cd backend
mysql -u root -p < db_scripts/01_create_database.sql   # BD mobilezone + mobilezone_test y usuario
python -m venv .venv
.venv/Scripts/activate            # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env              # configure DATABASE_URL, TEST_DATABASE_URL y JWT_SECRET_KEY
alembic upgrade head              # ejecuta db_scripts/02_create_tables.sql
python -m app.infrastructure.database.seed   # permisos, roles por defecto y admin (idempotente)
uvicorn main:app --reload         # http://localhost:8000/docs
pytest                            # los tests de BD usan TEST_DATABASE_URL (se omiten si no está definida)
```

Usuario inicial: `admin@example.com` / `Admin12345` (configurable en `.env`).

### Frontend (`frontend/`)

```bash
cd frontend
yarn install
yarn dev           # http://localhost:5173 (proxy /api -> http://localhost:8000)
yarn test          # 32 tests (vitest)
yarn build
```

## Arquitectura

```
backend/app
├── domain/          entidades (dataclasses puras), value objects, excepciones, interfaces de repositorio + UnitOfWork
├── application/     casos de uso, DTOs, puertos de seguridad (PasswordHasher, TokenService)
├── infrastructure/  SQLAlchemy (mapeo imperativo de las entidades), repositorios, UoW, bcrypt, JWT, settings, seed
└── presentation/    rutas FastAPI, schemas Pydantic, dependencias (composition root), manejo de errores
```

- El dominio no importa FastAPI ni SQLAlchemy: las entidades se mapean de forma imperativa en `infrastructure/database/tables.py`.
- Casos de uso principales: `ConfirmSaleUseCase`, `CancelSaleUseCase`, `CreateWorkOrderUseCase`, `UpdateWorkOrderUseCase`,
  `AddSparePartToWorkOrderUseCase`, `UpdateProductStockUseCase`, `CalculateWorkOrderBalanceUseCase`, `LoginUseCase`.
- Una sesión / Unit of Work por request; `uow.transaction()` hace COMMIT o ROLLBACK.
- Errores con formato único `{"error": {"code", "message", "details?"}}` (400/401/403/404/409/422/500).

Frontend: `src/app` (router, providers, store de auth), `src/modules/<módulo>` (pages, components, services, hooks, types),
`src/shared` (componentes reutilizables, hooks, servicios HTTP, utils), `src/layouts`.
Estado de servidor con TanStack Query, formularios con react-hook-form + zod.

## API (`/api/v1`)

| Módulo | Endpoints |
|---|---|
| auth | `POST /auth/login`, `GET /auth/me` (`POST /auth/token` para Swagger) |
| users | CRUD (provincia/ciudad, `branch_ids`) + `PATCH /{id}/status`, `PUT/DELETE /{id}/photo`, `GET /users/technicians` (filtro `rol_id`) |
| clients | CRUD + status + `PUT/DELETE /{id}/photo` (usuarios con rol `CLIENTE`) |
| roles / permissions | CRUD roles, `PUT /roles/{id}/permissions`, `POST/DELETE /roles/{id}/permissions/{pid}`, `GET /permissions` |
| categories, brands, models, spare-parts | `GET`, `GET /{id}`, `POST`, `PUT /{id}`, `PATCH /{id}/status`, `DELETE /{id}` (409 si tiene registros asociados) |
| products | CRUD (SKU, PVP, costo, por mayor; `stock` = total de todas las sucursales) + `PUT/DELETE /{id}/image` |
| branches | CRUD de sucursales (nombre, ubicación, teléfono) + status |
| inventory | `GET` (filtros `search` SKU/nombre, `branch_id`, `product_id`, `with_stock`, `active`), `GET /{id}`, `POST` (producto + sucursal + stock inicial), `PATCH /{id}/stock`, `GET /{id}/movements`, `DELETE /{id}`, `GET /inventory/branches` |
| locations | `GET /locations/provinces` (provincias del Ecuador con sus ciudades) |
| sales | `GET`, `GET /{id}`, `POST` (confirmar: `branch_id`, `items[{inventory_id, cantidad}]`, `factura`, `cliente_id`), `POST /{id}/cancel`, `GET /customers/lookup?identificacion=`, `POST /customers` (registrar cliente) |
| work-orders | CRUD, `PATCH /{id}/status`, `GET /by-number/{n}`, `GET /statuses`, `POST /calculate-balance`, `POST/DELETE /{id}/spare-parts` |

Listados paginados: `?page=&size=` (máx. 100) → `{items, total, page, size, pages}`. Montos como string decimal (`"10.50"`).

## Decisiones tomadas sobre puntos pendientes

Todas están centralizadas para cambiarlas fácilmente:

| Pendiente | Decisión provisional | Dónde |
|---|---|---|
| Base de datos | MySQL 8 / MariaDB 10.4+ (InnoDB, utf8mb4) con PyMySQL; DDL en `backend/db_scripts` | `db_scripts/`, `tables.py` |
| Tipo de usuario | Eliminado: el **rol** define el tipo. Roles del sistema `ADMIN`, `VENDEDOR`, `TECNICO`, `CLIENTE` (no se pueden renombrar, desactivar ni eliminar); se pueden crear roles adicionales | `SystemRole` en `domain/value_objects/enums.py` |
| Roles y permisos | Catálogo `<modulo>.<accion>`; VENDEDOR solo accede a Ventas y Productos; CLIENTE sin permisos (no inicia sesión) | `domain/value_objects/permissions.py` |
| Usuarios | Cédula (10 dígitos) o RUC (13) única, celular, ciudad y foto (avatar por defecto) | `domain/entities/user.py` |
| Productos | SKU único (mayúsculas, sin espacios); PVP, costo y precio por mayor; la venta usa el PVP; imagen (imagen por defecto). El stock no está en el producto | `domain/entities/product.py` |
| Inventario / sucursales | Stock por producto y sucursal (`inventory`); la venta descuenta del inventario de su sucursal; el vendedor vende solo desde sus sucursales asignadas (ADMIN desde cualquiera: `sales.any_branch`); sucursal por defecto "Matriz" | `domain/entities/inventory.py`, `ConfirmSaleUseCase` |
| Cédula / RUC | Cédula: provincia, 3er dígito y dígito verificador módulo 10. RUC persona natural: cédula válida + establecimiento. RUC sociedades/públicos: estructura (sin exigir el dígito verificador módulo 11, porque el SRI emite RUC válidos que no lo cumplen) | `value_objects/identificacion.py` |
| Provincia / ciudad | 24 provincias y sus 221 cantones; la ciudad debe pertenecer a la provincia | `value_objects/locations.py` |
| Ventas | Comprobante o factura; "Consumidor final" por defecto; cliente buscado por cédula/RUC o registrado desde la misma venta (rol CLIENTE, sin contraseña) | `ConfirmSaleUseCase` |
| Imágenes | JPG/PNG/WEBP ≤ 2 MB validadas por contenido; guardadas en `backend/media` y servidas en `/media` | `infrastructure/storage/local.py` |
| Estados 0/1/2 de orden | Etiquetas "Recibida / En proceso / Finalizada", expuestas por `GET /work-orders/statuses` | `WORK_ORDER_STATUS_LABELS` |
| Login de clientes | Los clientes no tienen contraseña y no pueden iniciar sesión | `LoginUseCase` |
| Anticipo > presupuesto | Se rechaza (`ADVANCE_EXCEEDS_BUDGET`); el saldo lo calcula siempre el backend | `domain/entities/work_order.py` |
| Número de orden | `num_orden` = id interno (único, portable); cambiar por secuencia al definir la BD | `SqlAlchemyWorkOrderRepository.add` |
| Asignación de técnico | Un técnico se autoasigna; asignar a otro requiere `work_orders.assign_technician` | `_resolve_technician` |
| Eliminación | Lógica vía `estado`; `DELETE` físico solo si no hay registros asociados | `CrudUseCases.delete` |
| Anulación de ventas | Implementada: restituye stock (permiso `sales.cancel`) | `CancelSaleUseCase` |
| Stock de repuestos | Los repuestos no descuentan stock | — |
| Auditoría | Tabla `stock_movements` por inventario (venta, anulación, ajuste, stock inicial) con usuario y fecha | `StockMovement` |
| Sesión en frontend | Token en `sessionStorage`, logout automático al expirar o ante un 401 | `shared/services/tokenStorage.ts` |
| UI | Sin librería de componentes; CSS propio responsive con modo oscuro | `src/styles.css` |

## Cómo ejecutar el proyecto (paso a paso)

Requisitos: **Python 3.10+**, **Node.js 20+**, **Yarn 1.22** (`npm install -g yarn` o `corepack enable`) y **MySQL 8.0.16+ / MariaDB 10.4+** en ejecución (p. ej. XAMPP).
Los comandos están escritos para Windows (PowerShell); en Linux/macOS cambie `.venv\Scripts\activate` por `source .venv/bin/activate` y `copy` por `cp`.

### 1. Base de datos (una sola vez)

Opción A — **phpMyAdmin**: importe en este orden los archivos de `backend/db_scripts`:

1. `01_create_database.sql` (crea `mobilezone`, `mobilezone_test` y el usuario `mobilezone`; cambie la contraseña `change-me` antes)
2. `02_create_tables.sql` (sobre la base `mobilezone`)
3. `03_seed_data.sql` (sobre la base `mobilezone`)

Opción B — **línea de comandos**:

```powershell
cd backend
Get-Content db_scripts\01_create_database.sql | mysql -u root -p
Get-Content db_scripts\02_create_tables.sql   | mysql -u root -p mobilezone
Get-Content db_scripts\03_seed_data.sql       | mysql -u root -p mobilezone
```

### 2. Backend (terminal 1)

```powershell
cd backend
python -m venv .venv                 # solo la primera vez
.venv\Scripts\activate
pip install -r requirements.txt      # solo la primera vez o si cambia requirements.txt
copy .env.example .env               # solo la primera vez; luego edite .env
```

Edite `backend/.env` con los datos de su servidor:

```ini
# usuario creado por 01_create_database.sql
DATABASE_URL=mysql+pymysql://mobilezone:change-me@localhost:3306/mobilezone?charset=utf8mb4
TEST_DATABASE_URL=mysql+pymysql://mobilezone:change-me@localhost:3306/mobilezone_test?charset=utf8mb4
# o, con root sin contraseña (XAMPP):
# DATABASE_URL=mysql+pymysql://root:@localhost:3306/mobilezone?charset=utf8mb4
JWT_SECRET_KEY=<valor aleatorio largo>
```

- Genere la clave con `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
- Los caracteres especiales de la contraseña van codificados (`@` → `%40`, `#` → `%23`, `:` → `%3A`).
- Si `localhost` no conecta, pruebe `127.0.0.1`; verifique el puerto (3306 / 3307).

Registre el esquema en Alembic (solo la primera vez):

```powershell
alembic stamp head        # si creó las tablas con los scripts SQL actuales (paso 1)
# o bien, si la base está vacía:
# alembic upgrade head
# python -m app.infrastructure.database.seed
```

Compruebe la conexión e inicie la API:

```powershell
python -c "from sqlalchemy import create_engine, text; from app.infrastructure.config.settings import get_settings; print(create_engine(get_settings().database_url).connect().execute(text('SELECT VERSION()')).scalar())"
uvicorn main:app --reload --port 8000
```

- API: http://localhost:8000/api/v1 — Documentación Swagger: http://localhost:8000/docs
- Usuario inicial: `admin@example.com` / `Admin12345` (cámbielo después del primer ingreso).

### Actualizar una base existente (versión anterior)

**Haga un respaldo** y aplique, en orden y una sola vez, los scripts de `backend/db_scripts/upgrades` que falten:

| Script | Aplica a bases… |
|---|---|
| `002_productos_usuarios_ventas.sql` | con `tipo_usuario`, `precio` y rol `USUARIO` (versión 1) |
| `003_sucursales_inventario.sql` | sin sucursales ni inventario (versión 2) |

Con Alembic (aplica solo lo que falta):

```powershell
cd backend
.venv\Scripts\activate
alembic current           # 0002 = falta el 003; sin versión = ejecute primero "alembic stamp 0001" o "0002"
alembic upgrade head
python -m app.infrastructure.database.seed
```

o importe los scripts desde phpMyAdmin y luego ejecute `alembic stamp head` y el seed. Notas:
- 002: los productos existentes reciben un SKU provisional (`SKU-000001`, …) y precio por mayor = PVP.
- 003: se crea la sucursal **Matriz** con el stock actual de cada producto; ventas y movimientos existentes quedan en
  Matriz y los vendedores quedan asignados a ella. Edite luego su ubicación y teléfono en **Sucursales**.

### 3. Frontend (terminal 2)

```powershell
cd frontend
yarn install              # solo la primera vez o si cambia package.json
yarn dev
```

Abra http://localhost:5173 e ingrese con el usuario administrador. En desarrollo, Vite redirige `/api` a
`http://localhost:8000`, por lo que el backend debe estar en ejecución en ese puerto.

### 4. Pruebas

```powershell
# Backend (con TEST_DATABASE_URL definida en .env; si no, se omiten los tests de BD)
cd backend
.venv\Scripts\activate
pytest

# Frontend
cd frontend
yarn test
yarn typecheck
```

### 5. Build de producción del frontend

```powershell
cd frontend
yarn build                # genera frontend/dist
yarn preview              # sirve el build en http://localhost:4173 para probarlo
```

Para producción, publique `frontend/dist` en un servidor web y defina `VITE_API_BASE_URL` (antes del build)
con la URL pública de la API; agregue ese origen a `CORS_ORIGINS` en `backend/.env`.

### Comandos útiles

| Acción | Comando (desde `backend/`, con el entorno activado) |
|---|---|
| Iniciar la API | `uvicorn main:app --reload` |
| Crear/actualizar permisos, roles y admin | `python -m app.infrastructure.database.seed` |
| Ver la versión del esquema | `alembic current` |
| Aplicar migraciones pendientes | `alembic upgrade head` |
| Borrar todas las tablas (destructivo) | `Get-Content db_scripts\99_drop_tables.sql \| mysql -u root -p mobilezone` |
