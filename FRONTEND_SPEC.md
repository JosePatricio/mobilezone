# Frontend — Sistema de Ventas y Órdenes de Trabajo

## 1. Objetivo

Construir una aplicación web en **React** para consumir la API REST del sistema y proporcionar interfaces para:

- Autenticación
- Usuarios
- Roles y permisos
- Categorías
- Productos
- Stock
- Ventas
- Clientes
- Marcas
- Modelos
- Órdenes de trabajo
- Repuestos
- Repuestos utilizados en órdenes

El frontend debe utilizar una arquitectura modular, escalable y orientada a funcionalidades.

---

# 2. Stack tecnológico

## Frontend

- React
- JavaScript o TypeScript
- React Router
- Cliente HTTP
- Manejo centralizado de autenticación
- Manejo de estado según necesidad
- Formularios con validación
- Componentes reutilizables
- Diseño responsive

La decisión definitiva entre JavaScript y TypeScript queda pendiente, aunque se recomienda TypeScript para este proyecto.

---

# 3. Arquitectura

Estructura propuesta:

```text
frontend/
├── src/
│   ├── app/
│   │   ├── router/
│   │   ├── providers/
│   │   └── store/
│   │
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── roles/
│   │   ├── permissions/
│   │   ├── categories/
│   │   ├── products/
│   │   ├── sales/
│   │   ├── clients/
│   │   ├── brands/
│   │   ├── models/
│   │   ├── work-orders/
│   │   └── spare-parts/
│   │
│   ├── shared/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── utils/
│   │   └── types/
│   │
│   ├── layouts/
│   └── main.jsx
│
└── package.json
```

Cada módulo debe mantener sus páginas, componentes, servicios, hooks y modelos relacionados.

---

# 4. Autenticación

Debe existir:

- Página de Login
- Formulario de email/usuario
- Formulario de contraseña
- Manejo de errores
- Persistencia segura de sesión según estrategia definida
- Logout
- Protección de rutas

Flujo:

```text
Login
  ↓
API
  ↓
Token
  ↓
Auth State
  ↓
Protected Routes
```

El frontend no debe asumir que estar autenticado implica tener todos los permisos.

---

# 5. Autorización

La interfaz debe respetar los permisos recibidos del backend.

Ejemplo conceptual:

```text
Usuario
   ↓
Rol
   ↓
Permisos
```

Un usuario sin permiso no debe:

- Ver módulos restringidos.
- Ver acciones restringidas.
- Ejecutar acciones restringidas.

La validación real siempre debe permanecer en el backend.

El frontend únicamente mejora la experiencia y oculta acciones no autorizadas.

---

# 6. Layout principal

Una vez autenticado el usuario:

```text
┌─────────────────────────────────────────────┐
│ Header                                      │
├───────────────┬─────────────────────────────┤
│ Sidebar       │                             │
│               │     Contenido               │
│ Dashboard     │                             │
│ Productos     │                             │
│ Ventas        │                             │
│ Órdenes       │                             │
│ Repuestos     │                             │
│ Usuarios      │                             │
│ Configuración │                             │
│               │                             │
└───────────────┴─────────────────────────────┘
```

El menú debe adaptarse a los permisos del usuario.

---

# 7. Usuarios

## Pantallas

- Listado de usuarios
- Crear usuario
- Editar usuario
- Ver usuario
- Activar/desactivar usuario

Campos iniciales:

```text
nombre
apellido
email
tipo_usuario
rol
estado
```

La contraseña no debe mostrarse en listados ni respuestas normales.

---

# 8. Roles y permisos

Se debe crear una interfaz administrativa para:

### Roles

- Listar roles
- Crear rol
- Editar rol
- Activar/desactivar rol

### Permisos

- Listar permisos
- Asociar permisos a roles
- Quitar permisos de roles

Interfaz conceptual:

```text
Rol: ADMIN

[x] users.view
[x] users.create
[x] users.update
[x] products.view
[x] products.create
[x] sales.create
[x] work_orders.view
...
```

Los nombres definitivos de permisos quedan pendientes.

---

# 9. Categorías

## Página de listado

Debe permitir:

- Buscar
- Filtrar
- Crear
- Editar
- Activar/desactivar

## Formulario

```text
Nombre
Descripción
Estado
```

---

# 10. Productos

## Listado

Mostrar inicialmente:

```text
ID
Nombre
Categoría
Precio
Stock
Estado
Acciones
```

Debe permitir:

- Buscar
- Filtrar por categoría
- Filtrar por estado
- Crear producto
- Editar producto
- Activar/desactivar
- Consultar stock

## Formulario

```text
Nombre
Categoría
Descripción
Precio
Stock
Estado
```

El frontend debe validar los datos antes de enviarlos, pero la validación definitiva corresponde al backend.

---

# 11. Ventas

La interfaz de venta debe permitir agregar múltiples productos.

Ejemplo:

```text
Nueva venta

Producto       Cantidad   Precio     Subtotal
------------------------------------------------
Producto A       2        10.00       20.00
Producto B       1        25.00       25.00

                         TOTAL:       45.00
```

Debe permitir:

- Buscar producto
- Agregar producto
- Modificar cantidad
- Eliminar producto
- Mostrar stock disponible
- Mostrar precio
- Calcular subtotal
- Calcular total
- Confirmar venta

El backend será responsable de validar nuevamente el stock.

---

# 12. Stock

El frontend debe mostrar el stock disponible.

Ejemplo:

```text
Producto A
Stock disponible: 15
```

Al intentar vender más unidades que el stock:

```text
El frontend debe prevenir la acción cuando sea posible.
```

Pero el backend seguirá siendo la fuente definitiva de verdad.

Si el backend devuelve:

```text
INSUFFICIENT_STOCK
```

el frontend debe mostrar un mensaje claro al usuario.

---

# 13. Clientes

Los clientes utilizan la misma entidad de usuarios.

El frontend debe poder seleccionar un cliente desde los usuarios disponibles para una orden de trabajo.

Ejemplo:

```text
Cliente:
[ Buscar cliente... ]
```

El componente debe mostrar información suficiente para identificarlo, por ejemplo:

```text
Nombre + apellido + email
```

---

# 14. Marcas

CRUD completo.

Pantallas:

- Listado
- Crear
- Editar
- Activar/desactivar

Campos:

```text
Nombre
Descripción
Estado
```

---

# 15. Modelos

CRUD completo.

Debe existir relación con una marca.

Formulario:

```text
Marca
Modelo
Descripción
Estado
```

Al seleccionar una marca, el listado de modelos puede filtrarse según ella.

---

# 16. Órdenes de trabajo

Este será uno de los módulos principales del frontend.

## Listado

Mostrar:

```text
N.º Orden
Cliente
Marca
Modelo
Técnico
Estado
Garantía
Presupuesto
Anticipo
Saldo
Fecha
Acciones
```

Debe permitir:

- Buscar por número de orden
- Buscar cliente
- Filtrar por estado
- Filtrar técnico
- Filtrar fecha
- Ver detalle
- Crear orden
- Editar orden según permisos

---

# 17. Crear orden de trabajo

Formulario inicial:

```text
Cliente
Marca
Modelo
Observación
Estado
Garantía
Color
Presupuesto
Anticipo
Saldo
Fecha
```

El `user_id` debe corresponder al usuario autenticado cuando se crea la orden.

El `tecnico_id` debe utilizar al técnico autenticado cuando la operación corresponda a un usuario técnico.

No se debe permitir que el frontend manipule libremente identificadores sensibles sin que el backend los valide.

---

# 18. Saldo de la orden

Mostrar:

```text
Presupuesto: $100
Anticipo:     $30
------------------
Saldo:        $70
```

El cálculo visual puede realizarse en frontend:

```text
saldo = presupuesto - anticipo
```

Pero el valor definitivo debe ser calculado/validado por backend.

---

# 19. Estado de orden

Actualmente existen tres valores:

```text
0
1
2
```

El significado de cada estado todavía está pendiente.

Una vez definido, el frontend deberá utilizar etiquetas amigables en lugar de mostrar únicamente:

```text
0
1
2
```

Ejemplo conceptual:

```text
0 → Estado A
1 → Estado B
2 → Estado C
```

---

# 20. Detalle de orden de trabajo

La vista de detalle debe agrupar la información.

```text
Orden #000001

Cliente
────────────────────────
...

Equipo
────────────────────────
Marca
Modelo
Color
Garantía

Trabajo
────────────────────────
Observación
Estado
Técnico

Valores
────────────────────────
Presupuesto
Anticipo
Saldo

Repuestos
────────────────────────
...
```

---

# 21. Repuestos

## CRUD

Pantallas:

- Listado
- Crear
- Editar
- Activar/desactivar

Campos:

```text
Tipo
Ubicación
Precio
Garantía
Estado
```

Los campos `ubicacion`, `garantia` y `estado` deben representarse mediante controles booleanos apropiados.

---

# 22. Repuestos de una orden

Dentro del detalle de una orden de trabajo:

```text
Repuestos

[Agregar repuesto]
```

Al agregar:

```text
Repuesto
Cantidad
Precio
```

El técnico autenticado será registrado por el backend como responsable de la operación.

La interfaz puede mostrar:

```text
Repuesto       Cantidad    Precio
----------------------------------
Pantalla          1         85.00
Batería           1         25.00
```

---

# 23. Selección de técnico

Cuando el usuario autenticado sea técnico:

```text
tecnico_id = usuario autenticado
```

El frontend no debería pedir al técnico que seleccione manualmente su propio ID.

Cuando un usuario autorizado pueda administrar órdenes y asignar técnicos, podrá existir un selector de técnico.

La regla final dependerá del sistema de roles y permisos.

---

# 24. Servicios API

Cada módulo debe encapsular sus llamadas HTTP.

Ejemplo:

```text
modules/
└── products/
    ├── pages/
    ├── components/
    ├── services/
    │   └── productApi.js
    ├── hooks/
    └── types/
```

El componente visual no debería contener directamente todas las llamadas HTTP.

---

# 25. Manejo de estados

Debe diferenciarse entre:

### Estado de servidor

Datos provenientes de API:

```text
products
sales
workOrders
users
```

### Estado de interfaz

```text
modal abierto
filtros
paginación
formulario
selección
```

### Estado de autenticación

```text
currentUser
permissions
authentication
```

La solución concreta de state management queda pendiente.

---

# 26. Formularios

Los formularios deben tener:

- Validación
- Mensajes de error
- Estados de carga
- Prevención de doble envío
- Confirmación de acciones críticas

Ejemplo:

```text
Guardar
   ↓
Loading
   ↓
API
   ↓
Success / Error
```

---

# 27. Manejo de errores de API

El frontend debe interpretar errores estandarizados.

Ejemplo:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Stock insuficiente para el producto solicitado."
  }
}
```

Mostrar al usuario un mensaje comprensible.

Los errores técnicos internos no deben exponerse innecesariamente.

---

# 28. Tablas

Los listados deben soportar, cuando corresponda:

- Paginación
- Búsqueda
- Ordenamiento
- Filtros
- Estado
- Acciones

La paginación debe preferentemente realizarse desde backend para grandes volúmenes.

---

# 29. Componentes reutilizables

Se deben crear componentes compartidos para:

```text
Button
Input
Select
Checkbox
Modal
Dialog
Table
Pagination
SearchInput
DatePicker
MoneyInput
Loading
EmptyState
ErrorState
ConfirmDialog
StatusBadge
```

Esto evita duplicación entre módulos.

---

# 30. Protección de rutas

Ejemplo conceptual:

```text
/public/login

/protected/dashboard
/protected/products
/protected/sales
/protected/work-orders
/protected/spare-parts
/protected/users
```

Debe existir un mecanismo como:

```text
ProtectedRoute
PermissionRoute
```

---

# 31. Seguridad frontend

El frontend debe:

- No almacenar contraseñas.
- No mostrar tokens en la interfaz.
- No confiar en permisos únicamente del frontend.
- No permitir operaciones críticas sin confirmación.
- Manejar expiración de sesión.
- Cerrar sesión cuando corresponda.

El backend siempre será la autoridad final de seguridad.

---

# 32. Responsive

La aplicación debe funcionar correctamente en:

- Desktop
- Tablet
- Mobile

El sistema está orientado principalmente a escritorio, pero los formularios de órdenes y consultas deben ser utilizables desde dispositivos móviles.

---

# 33. UX de operaciones críticas

Antes de operaciones destructivas o sensibles:

```text
¿Está seguro de que desea continuar?
```

Ejemplos:

- Desactivar usuario
- Desactivar producto
- Anular venta
- Cambiar estado de orden
- Eliminar/desactivar repuesto

---

# 34. Pruebas frontend

Se deben preparar pruebas para:

- Componentes
- Formularios
- Validaciones
- Rutas
- Permisos
- Servicios API
- Creación de ventas
- Manejo de stock insuficiente
- Creación de órdenes
- Agregar repuestos
- Cálculo visual de totales

---

# 35. Pendientes de definición

1. JavaScript o TypeScript.
2. Librería de UI.
3. State management definitivo.
4. Diseño visual.
5. Dashboard.
6. Paginación definitiva.
7. Filtros específicos.
8. Significado visual de estados 0, 1 y 2.
9. Flujo exacto de clientes.
10. Flujo de asignación de técnicos.
11. Impresión/PDF de órdenes.
12. Impresión/PDF de ventas.
13. Notificaciones.
14. Reportes.
15. Responsive final.
16. Permisos definitivos.
