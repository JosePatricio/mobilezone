Error
Static analysis:

2 errors were found during analysis.

Unexpected token. (near "AS" at position 2128)
Unrecognized statement type. (near "AS" at position 2128)
SQL query: Copy

-- Permission catalog -------------------------------------------------------- INSERT INTO permissions (codigo, descripcion) VALUES ('users.view', 'Ver usuarios'), ('users.create', 'Crear usuarios'), ('users.update', 'Editar y activar/desactivar usuarios'), ('roles.view', 'Ver roles'), ('roles.manage', 'Crear, editar roles y asignar permisos'), ('permissions.view', 'Ver permisos'), ('categories.view', 'Ver categorías'), ('categories.create', 'Crear categorías'), ('categories.update', 'Editar y activar/desactivar categorías'), ('categories.delete', 'Eliminar categorías'), ('products.view', 'Ver productos y stock'), ('products.create', 'Crear productos'), ('products.update', 'Editar y activar/desactivar productos'), ('products.delete', 'Eliminar productos'), ('products.stock', 'Ajustar stock de productos'), ('sales.view', 'Ver ventas'), ('sales.create', 'Registrar ventas'), ('sales.cancel', 'Anular ventas'), ('clients.view', 'Ver clientes'), ('clients.create', 'Crear clientes'), ('clients.update', 'Editar clientes'), ('brands.view', 'Ver marcas'), ('brands.create', 'Crear marcas'), ('brands.update', 'Editar y activar/desactivar marcas'), ('brands.delete', 'Eliminar marcas'), ('models.view', 'Ver modelos'), ('models.create', 'Crear modelos'), ('models.update', 'Editar y activar/desactivar modelos'), ('models.delete', 'Eliminar modelos'), ('work_orders.view', 'Ver órdenes de trabajo'), ('work_orders.create', 'Crear órdenes de trabajo'), ('work_orders.update', 'Editar órdenes de trabajo y cambiar su estado'), ('work_orders.assign_technician', 'Asignar técnico a órdenes de trabajo'), ('work_orders.spare_parts.add', 'Registrar repuestos en órdenes'), ('work_orders.spare_parts.remove', 'Quitar repuestos de órdenes'), ('spare_parts.view', 'Ver repuestos'), ('spare_parts.create', 'Crear repuestos'), ('spare_parts.update', 'Editar y activar/desactivar repuestos'), ('spare_parts.delete', 'Eliminar repuestos') AS new ON DUPLICATE KEY UPDATE descripcion = new.descripcion;

MySQL said: Documentation

#1064 - You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near 'AS new ON DUPLICATE KEY UPDATE descripcion = new.descripcion' at line 42