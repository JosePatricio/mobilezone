Cuando se hace click en MZ MobileZone, ir al HOME

En modulo Ventas, esta bien que aparezca Consummidor final por defecto, entonces quitar el icono usuario, por que ya esta seleccionado.

En el usuario seleccionado, que aparezca tambien la Cedula/ruc, telefono, separado por comma. Remover la info de abajo porq va a estar de mas.

En Buscar producto, si encuentra al darle enter abajo despleggar estos campos.Imagen (Si hace click mostrar en grande la imagen), SKU, Nombre, Cantidad (editable con boton - y + , para quita o agregar unidades del producto), Stock (pendiente en modulo de stock), Precio
En campo stock deberia ir el id del inventario (mas abajo) y restar del stock existente.
Por defecto deberia buscarse los productos de acuerdo a la sucursal asignada al vendedor (ver mas abajo)
En caso de no existir el producto buscado en esa sucursal, el vendedor podra ir al modulo Inventario para realmente buscar donde se puede encontrar ese producto (la busqueda seria igual por SKU y nombre)


En el modal si el usuario no existe, debe poder ingresar nuevo usuario desde esa misma pantalla (Ojo estoy por ejemplo como rol Vendedor y este rol no tiene permiso para modulo de usuario , los mismo campos de usuario pero rol por defecto sera CLIENTE solo texto ,no mostrar mas tipos, y obviamnte CLIENTE  no necesita contraseña)



Modulo Stock / Inventario
Debe tener Id de producto, Id sucursal, Stock

Modulo de sucursales
Ubicacion, telefono


En modulos usuario, validar CEDULA/RUC , Agregar lista de provincia y en base a lo seleccionado que aparezca las ciudades, Ejemplo Provincia Pichincha y ciudad Quito
En campo Rol por defecto seleccionar Cliente

Un usuario Tipo vendedor debe poder asignarse uno o varios sucursales (Mismo modulo sucursal ID)

