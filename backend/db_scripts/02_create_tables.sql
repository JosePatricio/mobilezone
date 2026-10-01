-- =============================================================================
-- MobileZone — 02. Tables, constraints and indexes (MySQL 8.0.16+ or MariaDB 10.4+, InnoDB)
--
-- Must stay in sync with app/infrastructure/database/tables.py
-- (tests/test_db_scripts.py checks every table and column is present here).
-- Applied by Alembic revision 0001 or manually:  mysql mobilezone < 02_create_tables.sql
--
-- Conventions:
--   * Money:     DECIMAL(12,2)
--   * Booleans:  BOOL (TINYINT(1)), 1 = activo / sí
--   * Datetimes: DATETIME(6) stored in UTC
--   * Enumerations stored as VARCHAR so new values do not need a schema change
--   * utf8mb4_unicode_ci: unique names / emails are case-insensitive
-- =============================================================================

SET NAMES utf8mb4;

-- -----------------------------------------------------------------------------
-- Roles and permissions
-- -----------------------------------------------------------------------------
CREATE TABLE permissions (
    id          INTEGER      NOT NULL AUTO_INCREMENT,
    codigo      VARCHAR(100) NOT NULL COMMENT '<modulo>.<accion>, e.g. products.create',
    descripcion VARCHAR(255),
    CONSTRAINT pk_permissions PRIMARY KEY (id),
    CONSTRAINT uq_permissions_codigo UNIQUE (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE roles (
    id          INTEGER      NOT NULL AUTO_INCREMENT,
    nombre      VARCHAR(50)  NOT NULL,
    descripcion VARCHAR(255),
    estado      BOOL         NOT NULL DEFAULT 1,
    created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_roles PRIMARY KEY (id),
    CONSTRAINT uq_roles_nombre UNIQUE (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE role_permissions (
    role_id       INTEGER NOT NULL,
    permission_id INTEGER NOT NULL,
    CONSTRAINT pk_role_permissions PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_role_permissions_role_id_roles
        FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
    CONSTRAINT fk_role_permissions_permission_id_permissions
        FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Branches (sucursales): products are stocked and sold per branch
-- -----------------------------------------------------------------------------
CREATE TABLE branches (
    id         INTEGER      NOT NULL AUTO_INCREMENT,
    nombre     VARCHAR(100) NOT NULL,
    ubicacion  VARCHAR(255) NOT NULL,
    telefono   VARCHAR(20),
    estado     BOOL         NOT NULL DEFAULT 1,
    created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_branches PRIMARY KEY (id),
    CONSTRAINT uq_branches_nombre UNIQUE (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Users (internal users and clients share this table)
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id             INTEGER      NOT NULL AUTO_INCREMENT,
    nombre         VARCHAR(100) NOT NULL,
    apellido       VARCHAR(100) NOT NULL,
    email          VARCHAR(255)          COMMENT 'login; NULL allowed for clients (they do not log in)',
    password       VARCHAR(255)          COMMENT 'bcrypt hash; NULL for clients (no login)',
    identificacion VARCHAR(13)           COMMENT 'cedula (10 digits) or RUC (13 digits)',
    celular        VARCHAR(20),
    provincia      VARCHAR(100),
    ciudad         VARCHAR(100)          COMMENT 'canton of the province',
    foto           VARCHAR(255)          COMMENT 'relative path of the uploaded photo; NULL = default avatar',
    rol_id         INTEGER      NOT NULL COMMENT 'the role defines the kind of user (ADMIN, VENDEDOR, TECNICO, CLIENTE, ...)',
    estado         BOOL         NOT NULL DEFAULT 1,
    created_at     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_identificacion UNIQUE (identificacion),
    CONSTRAINT fk_users_rol_id_roles FOREIGN KEY (rol_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_users_nombre_apellido ON users (nombre, apellido);
CREATE INDEX ix_users_rol_id ON users (rol_id);

-- Branches assigned to a user (sellers sell only from their branches).
CREATE TABLE user_branches (
    user_id   INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    CONSTRAINT pk_user_branches PRIMARY KEY (user_id, branch_id),
    CONSTRAINT fk_user_branches_user_id_users
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_branches_branch_id_branches
        FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Categories and products
-- -----------------------------------------------------------------------------
CREATE TABLE categories (
    id          INTEGER      NOT NULL AUTO_INCREMENT,
    nombre      VARCHAR(100) NOT NULL,
    descripcion TEXT,
    estado      BOOL         NOT NULL DEFAULT 1,
    created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_categories PRIMARY KEY (id),
    CONSTRAINT uq_categories_nombre UNIQUE (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
    id           INTEGER       NOT NULL AUTO_INCREMENT,
    category_id  INTEGER       NOT NULL,
    sku          VARCHAR(50)   NOT NULL COMMENT 'product code (uppercase, no spaces)',
    nombre       VARCHAR(150)  NOT NULL,
    descripcion  TEXT,
    precio_venta DECIMAL(12,2) NOT NULL COMMENT 'PVP, used in sales',
    precio_costo DECIMAL(12,2) NOT NULL COMMENT 'acquisition cost',
    precio_mayor DECIMAL(12,2) NOT NULL COMMENT 'wholesale price',
    imagen       VARCHAR(255)           COMMENT 'relative path of the uploaded image; NULL = default image',
    estado       BOOL          NOT NULL DEFAULT 1,
    created_at   DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at   DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_products PRIMARY KEY (id),
    CONSTRAINT uq_products_sku UNIQUE (sku),
    CONSTRAINT ck_products_precios_non_negative CHECK (precio_venta >= 0 AND precio_costo >= 0 AND precio_mayor >= 0),
    CONSTRAINT fk_products_category_id_categories FOREIGN KEY (category_id) REFERENCES categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_products_category_id ON products (category_id);
CREATE INDEX ix_products_nombre ON products (nombre);

-- Inventory: stock of each product in each branch.
CREATE TABLE inventory (
    id         INTEGER     NOT NULL AUTO_INCREMENT,
    product_id INTEGER     NOT NULL,
    branch_id  INTEGER     NOT NULL,
    stock      INTEGER     NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_inventory PRIMARY KEY (id),
    CONSTRAINT uq_inventory_product_id_branch_id UNIQUE (product_id, branch_id),
    CONSTRAINT ck_inventory_stock_non_negative CHECK (stock >= 0),
    CONSTRAINT fk_inventory_product_id_products FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT fk_inventory_branch_id_branches FOREIGN KEY (branch_id) REFERENCES branches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_inventory_branch_id ON inventory (branch_id);
CREATE INDEX ix_inventory_product_id ON inventory (product_id);

-- Audit trail of every stock change (sale, sale cancellation, manual adjustment).
CREATE TABLE stock_movements (
    id               INTEGER      NOT NULL AUTO_INCREMENT,
    product_id       INTEGER      NOT NULL,
    inventory_id     INTEGER               COMMENT 'inventory (product + branch)',
    tipo             VARCHAR(30)  NOT NULL COMMENT 'VENTA | ANULACION_VENTA | AJUSTE',
    cantidad         INTEGER      NOT NULL COMMENT 'signed: negative = out, positive = in',
    stock_resultante INTEGER      NOT NULL,
    user_id          INTEGER,
    referencia       VARCHAR(100),
    motivo           VARCHAR(255),
    fecha            DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_stock_movements PRIMARY KEY (id),
    CONSTRAINT fk_stock_movements_product_id_products FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT fk_stock_movements_inventory_id_inventory FOREIGN KEY (inventory_id) REFERENCES inventory (id),
    CONSTRAINT fk_stock_movements_user_id_users FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_stock_movements_inventory_id ON stock_movements (inventory_id);
CREATE INDEX ix_stock_movements_product_id ON stock_movements (product_id);

-- -----------------------------------------------------------------------------
-- Sales
-- -----------------------------------------------------------------------------
CREATE TABLE sales (
    id         INTEGER       NOT NULL AUTO_INCREMENT,
    user_id    INTEGER       NOT NULL,
    branch_id  INTEGER       NOT NULL COMMENT 'branch (sucursal) of the sale',
    fecha      DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    total      DECIMAL(12,2) NOT NULL,
    estado     VARCHAR(30)   NOT NULL COMMENT 'CONFIRMADA | ANULADA',
    factura    BOOL          NOT NULL DEFAULT 0 COMMENT '1 = factura, 0 = comprobante de venta',
    cliente_id INTEGER                COMMENT 'client (role CLIENTE); NULL = consumidor final',
    metodo_pago    VARCHAR(30)        COMMENT 'EFECTIVO | TRANSFERENCIA | TARJETA; NULL = sale registered before payments were recorded',
    recargo        DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'credit card surcharge (6 %)',
    total_pagar    DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'total + recargo',
    monto_recibido DECIMAL(12,2)      COMMENT 'cash received',
    cambio         DECIMAL(12,2)      COMMENT 'change given back (cash)',
    created_at DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_sales PRIMARY KEY (id),
    CONSTRAINT fk_sales_user_id_users FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_sales_branch_id_branches FOREIGN KEY (branch_id) REFERENCES branches (id),
    CONSTRAINT fk_sales_cliente_id_users FOREIGN KEY (cliente_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_sales_branch_id ON sales (branch_id);
CREATE INDEX ix_sales_cliente_id ON sales (cliente_id);
CREATE INDEX ix_sales_fecha ON sales (fecha);
CREATE INDEX ix_sales_user_id ON sales (user_id);

CREATE TABLE sale_details (
    id              INTEGER       NOT NULL AUTO_INCREMENT,
    sale_id         INTEGER       NOT NULL,
    product_id      INTEGER       NOT NULL,
    inventory_id    INTEGER       NOT NULL COMMENT 'inventory the units were taken from',
    cantidad        INTEGER       NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL COMMENT 'historical price at sale time',
    subtotal        DECIMAL(12,2) NOT NULL,
    CONSTRAINT pk_sale_details PRIMARY KEY (id),
    CONSTRAINT ck_sale_details_cantidad_positive CHECK (cantidad > 0),
    CONSTRAINT fk_sale_details_sale_id_sales FOREIGN KEY (sale_id) REFERENCES sales (id) ON DELETE CASCADE,
    CONSTRAINT fk_sale_details_product_id_products FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT fk_sale_details_inventory_id_inventory FOREIGN KEY (inventory_id) REFERENCES inventory (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_sale_details_inventory_id ON sale_details (inventory_id);
CREATE INDEX ix_sale_details_product_id ON sale_details (product_id);
CREATE INDEX ix_sale_details_sale_id ON sale_details (sale_id);

-- -----------------------------------------------------------------------------
-- Brands and device models
-- -----------------------------------------------------------------------------
CREATE TABLE brands (
    id          INTEGER      NOT NULL AUTO_INCREMENT,
    nombre      VARCHAR(100) NOT NULL,
    descripcion TEXT,
    estado      BOOL         NOT NULL DEFAULT 1,
    created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_brands PRIMARY KEY (id),
    CONSTRAINT uq_brands_nombre UNIQUE (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE models (
    id          INTEGER      NOT NULL AUTO_INCREMENT,
    brand_id    INTEGER      NOT NULL,
    nombre      VARCHAR(100) NOT NULL,
    descripcion TEXT,
    estado      BOOL         NOT NULL DEFAULT 1,
    created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_models PRIMARY KEY (id),
    CONSTRAINT uq_models_brand_id_nombre UNIQUE (brand_id, nombre),
    CONSTRAINT fk_models_brand_id_brands FOREIGN KEY (brand_id) REFERENCES brands (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_models_brand_id ON models (brand_id);

-- -----------------------------------------------------------------------------
-- Spare parts
-- -----------------------------------------------------------------------------
CREATE TABLE spare_parts (
    id         INTEGER       NOT NULL AUTO_INCREMENT,
    tipo       VARCHAR(100)  NOT NULL,
    ubicacion  BOOL          NOT NULL DEFAULT 0,
    precio     DECIMAL(12,2) NOT NULL,
    garantia   BOOL          NOT NULL DEFAULT 0,
    estado     BOOL          NOT NULL DEFAULT 1,
    created_at DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_spare_parts PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_spare_parts_tipo ON spare_parts (tipo);

-- -----------------------------------------------------------------------------
-- Work orders
-- -----------------------------------------------------------------------------
CREATE TABLE work_orders (
    id          INTEGER       NOT NULL AUTO_INCREMENT,
    num_orden   INTEGER                COMMENT 'unique order number (assigned on insert)',
    user_id     INTEGER       NOT NULL COMMENT 'user who registers the order',
    cliente_id  INTEGER       NOT NULL COMMENT 'client (users.tipo_usuario = CLIENTE)',
    tecnico_id  INTEGER                COMMENT 'technician: the user who registered the order',
    marca_id    INTEGER       NOT NULL,
    modelo_id   INTEGER       NOT NULL,
    observacion TEXT,
    estado      INTEGER       NOT NULL DEFAULT 0 COMMENT '0 | 1 | 2 (meaning pending definition)',
    motivo_ingreso VARCHAR(30) NOT NULL COMMENT 'CAMBIO_DISPLAY | PIN_CARGA | BATERIA | TAPA | ... | OTROS',
    tipo_display   VARCHAR(30)          COMMENT 'INCELL | OLED | ORIGINAL (only for CAMBIO_DISPLAY)',
    garantia_dias  INTEGER     NOT NULL DEFAULT 0 COMMENT 'tiempo de garantia in days (0 = sin garantia)',
    bloqueo_tipo   VARCHAR(30) NOT NULL DEFAULT 'NINGUNO' COMMENT 'NINGUNO | PATRON | PIN',
    bloqueo_valor  VARCHAR(20)          COMMENT 'pattern as dots 1..9 (e.g. 1-5-9-6) or numeric PIN',
    codigo_publico VARCHAR(32) NOT NULL COMMENT 'unguessable code of the public status page (QR)',
    color       VARCHAR(50),
    modelo_tecnico VARCHAR(50)          COMMENT 'technical model code of the phone, e.g. SM-A105M',
    presupuesto DECIMAL(12,2) NOT NULL,
    anticipo    DECIMAL(12,2) NOT NULL,
    saldo       DECIMAL(12,2) NOT NULL COMMENT 'presupuesto - anticipo (computed by the backend)',
    fecha       DATE          NOT NULL COMMENT 'reception date (local day of the shop)',
    fecha_entrega DATETIME(6)          COMMENT 'promised delivery date and time (UTC)',
    created_at  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_work_orders PRIMARY KEY (id),
    CONSTRAINT uq_work_orders_num_orden UNIQUE (num_orden),
    CONSTRAINT uq_work_orders_codigo_publico UNIQUE (codigo_publico),
    CONSTRAINT ck_work_orders_estado_valid CHECK (estado IN (0, 1, 2)),
    CONSTRAINT ck_work_orders_amounts_non_negative CHECK (presupuesto >= 0 AND anticipo >= 0),
    CONSTRAINT ck_work_orders_garantia_dias_non_negative CHECK (garantia_dias >= 0),
    CONSTRAINT fk_work_orders_user_id_users FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_work_orders_cliente_id_users FOREIGN KEY (cliente_id) REFERENCES users (id),
    CONSTRAINT fk_work_orders_tecnico_id_users FOREIGN KEY (tecnico_id) REFERENCES users (id),
    CONSTRAINT fk_work_orders_marca_id_brands FOREIGN KEY (marca_id) REFERENCES brands (id),
    CONSTRAINT fk_work_orders_modelo_id_models FOREIGN KEY (modelo_id) REFERENCES models (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_work_orders_cliente_id ON work_orders (cliente_id);
CREATE INDEX ix_work_orders_estado ON work_orders (estado);
CREATE INDEX ix_work_orders_fecha ON work_orders (fecha);
CREATE INDEX ix_work_orders_tecnico_id ON work_orders (tecnico_id);
CREATE INDEX ix_work_orders_user_id ON work_orders (user_id);

-- Photos of the device taken at reception (up to 3 per order, limit enforced by the app).
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

-- Spare parts used in work orders (one part can be used in many orders).
CREATE TABLE work_order_spare_parts (
    id            INTEGER       NOT NULL AUTO_INCREMENT,
    work_order_id INTEGER       NOT NULL,
    technician_id INTEGER       NOT NULL COMMENT 'authenticated technician who registered it',
    spare_part_id INTEGER       NOT NULL,
    cantidad      INTEGER       NOT NULL,
    precio        DECIMAL(12,2) NOT NULL,
    fecha         DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_work_order_spare_parts PRIMARY KEY (id),
    CONSTRAINT ck_work_order_spare_parts_cantidad_positive CHECK (cantidad > 0),
    CONSTRAINT fk_work_order_spare_parts_work_order_id_work_orders
        FOREIGN KEY (work_order_id) REFERENCES work_orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_work_order_spare_parts_technician_id_users
        FOREIGN KEY (technician_id) REFERENCES users (id),
    CONSTRAINT fk_work_order_spare_parts_spare_part_id_spare_parts
        FOREIGN KEY (spare_part_id) REFERENCES spare_parts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_work_order_spare_parts_spare_part_id ON work_order_spare_parts (spare_part_id);
CREATE INDEX ix_work_order_spare_parts_technician_id ON work_order_spare_parts (technician_id);
CREATE INDEX ix_work_order_spare_parts_work_order_id ON work_order_spare_parts (work_order_id);
