"""Permission catalog.

Permission codes follow ``<module>.<action>``. Definitive names are pending
(BACKEND_SPEC §4.3); keeping them in one module makes renaming trivial.
"""
from __future__ import annotations


class Perm:
    USERS_VIEW = "users.view"
    USERS_CREATE = "users.create"
    USERS_UPDATE = "users.update"

    ROLES_VIEW = "roles.view"
    ROLES_MANAGE = "roles.manage"
    PERMISSIONS_VIEW = "permissions.view"

    CATEGORIES_VIEW = "categories.view"
    CATEGORIES_CREATE = "categories.create"
    CATEGORIES_UPDATE = "categories.update"
    CATEGORIES_DELETE = "categories.delete"

    PRODUCTS_VIEW = "products.view"
    PRODUCTS_CREATE = "products.create"
    PRODUCTS_UPDATE = "products.update"
    PRODUCTS_DELETE = "products.delete"
    PRODUCTS_STOCK = "products.stock"

    SALES_VIEW = "sales.view"
    SALES_CREATE = "sales.create"
    SALES_CANCEL = "sales.cancel"

    CLIENTS_VIEW = "clients.view"
    CLIENTS_CREATE = "clients.create"
    CLIENTS_UPDATE = "clients.update"

    BRANDS_VIEW = "brands.view"
    BRANDS_CREATE = "brands.create"
    BRANDS_UPDATE = "brands.update"
    BRANDS_DELETE = "brands.delete"

    MODELS_VIEW = "models.view"
    MODELS_CREATE = "models.create"
    MODELS_UPDATE = "models.update"
    MODELS_DELETE = "models.delete"

    WORK_ORDERS_VIEW = "work_orders.view"
    WORK_ORDERS_CREATE = "work_orders.create"
    WORK_ORDERS_UPDATE = "work_orders.update"
    WORK_ORDERS_ASSIGN_TECHNICIAN = "work_orders.assign_technician"
    WORK_ORDERS_SPARE_PARTS_ADD = "work_orders.spare_parts.add"
    WORK_ORDERS_SPARE_PARTS_REMOVE = "work_orders.spare_parts.remove"

    SPARE_PARTS_VIEW = "spare_parts.view"
    SPARE_PARTS_CREATE = "spare_parts.create"
    SPARE_PARTS_UPDATE = "spare_parts.update"
    SPARE_PARTS_DELETE = "spare_parts.delete"


PERMISSION_CATALOG: dict[str, str] = {
    Perm.USERS_VIEW: "Ver usuarios",
    Perm.USERS_CREATE: "Crear usuarios",
    Perm.USERS_UPDATE: "Editar y activar/desactivar usuarios",
    Perm.ROLES_VIEW: "Ver roles",
    Perm.ROLES_MANAGE: "Crear, editar roles y asignar permisos",
    Perm.PERMISSIONS_VIEW: "Ver permisos",
    Perm.CATEGORIES_VIEW: "Ver categorías",
    Perm.CATEGORIES_CREATE: "Crear categorías",
    Perm.CATEGORIES_UPDATE: "Editar y activar/desactivar categorías",
    Perm.CATEGORIES_DELETE: "Eliminar categorías",
    Perm.PRODUCTS_VIEW: "Ver productos y stock",
    Perm.PRODUCTS_CREATE: "Crear productos",
    Perm.PRODUCTS_UPDATE: "Editar y activar/desactivar productos",
    Perm.PRODUCTS_DELETE: "Eliminar productos",
    Perm.PRODUCTS_STOCK: "Ajustar stock de productos",
    Perm.SALES_VIEW: "Ver ventas",
    Perm.SALES_CREATE: "Registrar ventas",
    Perm.SALES_CANCEL: "Anular ventas",
    Perm.CLIENTS_VIEW: "Ver clientes",
    Perm.CLIENTS_CREATE: "Crear clientes",
    Perm.CLIENTS_UPDATE: "Editar clientes",
    Perm.BRANDS_VIEW: "Ver marcas",
    Perm.BRANDS_CREATE: "Crear marcas",
    Perm.BRANDS_UPDATE: "Editar y activar/desactivar marcas",
    Perm.BRANDS_DELETE: "Eliminar marcas",
    Perm.MODELS_VIEW: "Ver modelos",
    Perm.MODELS_CREATE: "Crear modelos",
    Perm.MODELS_UPDATE: "Editar y activar/desactivar modelos",
    Perm.MODELS_DELETE: "Eliminar modelos",
    Perm.WORK_ORDERS_VIEW: "Ver órdenes de trabajo",
    Perm.WORK_ORDERS_CREATE: "Crear órdenes de trabajo",
    Perm.WORK_ORDERS_UPDATE: "Editar órdenes de trabajo y cambiar su estado",
    Perm.WORK_ORDERS_ASSIGN_TECHNICIAN: "Asignar técnico a órdenes de trabajo",
    Perm.WORK_ORDERS_SPARE_PARTS_ADD: "Registrar repuestos en órdenes",
    Perm.WORK_ORDERS_SPARE_PARTS_REMOVE: "Quitar repuestos de órdenes",
    Perm.SPARE_PARTS_VIEW: "Ver repuestos",
    Perm.SPARE_PARTS_CREATE: "Crear repuestos",
    Perm.SPARE_PARTS_UPDATE: "Editar y activar/desactivar repuestos",
    Perm.SPARE_PARTS_DELETE: "Eliminar repuestos",
}

ALL_PERMISSIONS: list[str] = list(PERMISSION_CATALOG)

# Default roles created by the seed script (system roles, see SystemRole).
DEFAULT_ROLES: dict[str, list[str]] = {
    "ADMIN": ALL_PERMISSIONS,
    # Seller: only the Ventas and Productos modules.
    "VENDEDOR": [
        Perm.PRODUCTS_VIEW,
        Perm.SALES_VIEW,
        Perm.SALES_CREATE,
    ],
    "TECNICO": [
        Perm.PRODUCTS_VIEW,
        Perm.CLIENTS_VIEW,
        Perm.CLIENTS_CREATE,
        Perm.BRANDS_VIEW,
        Perm.MODELS_VIEW,
        Perm.WORK_ORDERS_VIEW,
        Perm.WORK_ORDERS_CREATE,
        Perm.WORK_ORDERS_UPDATE,
        Perm.WORK_ORDERS_SPARE_PARTS_ADD,
        Perm.WORK_ORDERS_SPARE_PARTS_REMOVE,
        Perm.SPARE_PARTS_VIEW,
    ],
    # Clients do not log in and have no permissions.
    "CLIENTE": [],
}
