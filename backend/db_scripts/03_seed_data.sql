-- =============================================================================
-- MobileZone — 03. Initial data: permission catalog, system roles, default branch, admin
-- Idempotent: can be run several times. Equivalent to
--   python -m app.infrastructure.database.seed
-- (the Python seed reads the admin credentials from .env; prefer it when possible).
-- Permission codes mirror app/domain/value_objects/permissions.py.
-- =============================================================================

SET NAMES utf8mb4;

START TRANSACTION;

-- Permission catalog --------------------------------------------------------
INSERT INTO permissions (codigo, descripcion) VALUES
    ('users.view', 'Ver usuarios'),
    ('users.create', 'Crear usuarios'),
    ('users.update', 'Editar y activar/desactivar usuarios'),
    ('roles.view', 'Ver roles'),
    ('roles.manage', 'Crear, editar roles y asignar permisos'),
    ('permissions.view', 'Ver permisos'),
    ('categories.view', 'Ver categorías'),
    ('categories.create', 'Crear categorías'),
    ('categories.update', 'Editar y activar/desactivar categorías'),
    ('categories.delete', 'Eliminar categorías'),
    ('products.view', 'Ver productos y stock'),
    ('products.create', 'Crear productos'),
    ('products.update', 'Editar y activar/desactivar productos'),
    ('products.delete', 'Eliminar productos'),
    ('branches.view', 'Ver sucursales'),
    ('branches.create', 'Crear sucursales'),
    ('branches.update', 'Editar y activar/desactivar sucursales'),
    ('branches.delete', 'Eliminar sucursales'),
    ('branches.any', 'Operar en cualquier sucursal: vender y ajustar stock sin estar asignado'),
    ('inventory.view', 'Ver inventario (stock por sucursal)'),
    ('inventory.manage', 'Registrar productos en sucursales y ajustar stock'),
    ('sales.view', 'Ver ventas'),
    ('sales.create', 'Registrar ventas'),
    ('sales.update', 'Modificar ventas (devoluciones y cambios de productos)'),
    ('sales.cancel', 'Eliminar (anular) ventas'),
    ('clients.view', 'Ver clientes'),
    ('clients.create', 'Crear clientes'),
    ('clients.update', 'Editar clientes'),
    ('brands.view', 'Ver marcas'),
    ('brands.create', 'Crear marcas'),
    ('brands.update', 'Editar y activar/desactivar marcas'),
    ('brands.delete', 'Eliminar marcas'),
    ('models.view', 'Ver modelos'),
    ('models.create', 'Crear modelos'),
    ('models.update', 'Editar y activar/desactivar modelos'),
    ('models.delete', 'Eliminar modelos'),
    ('work_orders.view', 'Ver órdenes de trabajo'),
    ('work_orders.create', 'Crear órdenes de trabajo'),
    ('work_orders.update', 'Editar órdenes de trabajo y cambiar su estado'),
    ('work_orders.spare_parts.add', 'Registrar repuestos en órdenes'),
    ('work_orders.spare_parts.remove', 'Quitar repuestos de órdenes'),
    ('spare_parts.view', 'Ver repuestos'),
    ('spare_parts.create', 'Crear repuestos'),
    ('spare_parts.update', 'Editar y activar/desactivar repuestos'),
    ('spare_parts.delete', 'Eliminar repuestos')
ON DUPLICATE KEY UPDATE descripcion = VALUES(descripcion);

-- System roles (the role defines the kind of user) ---------------------------
INSERT IGNORE INTO roles (nombre, descripcion) VALUES
    ('ADMIN', 'Rol admin (por defecto)'),
    ('VENDEDOR', 'Rol vendedor (por defecto)'),
    ('TECNICO', 'Rol tecnico (por defecto)'),
    ('CLIENTE', 'Rol cliente (por defecto)');

-- ADMIN always gets every permission
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.nombre = 'ADMIN';

-- VENDEDOR
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.codigo IN (
    'products.view', 'products.create', 'inventory.view',
    'inventory.manage', 'sales.view', 'sales.create',
    'sales.update', 'work_orders.view', 'work_orders.create',
    'work_orders.update', 'work_orders.spare_parts.add', 'work_orders.spare_parts.remove',
    'spare_parts.view', 'brands.view', 'brands.create',
    'brands.update', 'models.view', 'models.create',
    'models.update'
) WHERE r.nombre = 'VENDEDOR';

-- TECNICO
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.codigo IN (
    'products.view', 'clients.view', 'clients.create',
    'brands.view', 'models.view', 'work_orders.view',
    'work_orders.create', 'work_orders.update', 'work_orders.spare_parts.add',
    'work_orders.spare_parts.remove', 'spare_parts.view'
) WHERE r.nombre = 'TECNICO';

-- CLIENTE: no permissions (clients do not log in)

-- Default branch (stock is kept per branch) ----------------------------------
INSERT INTO branches (nombre, ubicacion)
SELECT 'Matriz', 'Por definir' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM branches);

-- Initial administrator -----------------------------------------------------
-- email: admin@example.com / password: Admin12345  (bcrypt hash below)
-- CHANGE THIS PASSWORD right after the first login.
INSERT IGNORE INTO users (nombre, apellido, email, password, rol_id, estado)
SELECT 'Administrador', 'Sistema', 'admin@example.com',
       '$2b$12$dy4h4.6gNd9gXnejvB/lW.OKjSSPgFBdhPt/XoolOkK0tR6qc2Nt6',
       r.id, 1
FROM roles r WHERE r.nombre = 'ADMIN';

COMMIT;
