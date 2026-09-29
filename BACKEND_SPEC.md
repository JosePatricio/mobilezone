# Backend — Sistema de Ventas y Órdenes de Trabajo

## 1. Objetivo

Construir una API REST para un sistema web de gestión de:

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
- Repuestos asociados a órdenes de trabajo

El backend debe estar desarrollado en **Python** y utilizar **Clean Architecture**, manteniendo separación clara entre dominio, aplicación, infraestructura y presentación.

---

# 2. Stack tecnológico

## 2.1 Backend

- Python 3.x
- FastAPI
- Pydantic
- SQLAlchemy
- Alembic
- Base de datos relacional
- JWT para autenticación
- Password hashing seguro
- Pytest para pruebas

La base de datos concreta podrá definirse posteriormente.

---

# 3. Arquitectura

Se utilizará Clean Architecture.

```text
backend/
├── app/
│   ├── domain/
│   │   ├── entities/
│   │   ├── value_objects/
│   │   ├── repositories/
│   │   └── exceptions/
│   │
│   ├── application/
│   │   ├── use_cases/
│   │   ├── dto/
│   │   └── services/
│   │
│   ├── infrastructure/
│   │   ├── database/
│   │   ├── repositories/
│   │   ├── security/
│   │   └── config/
│   │
│   └── presentation/
│       ├── api/
│       │   ├── routes/
│       │   ├── schemas/
│       │   └── dependencies/
│       └── middleware/
│
├── tests/
├── migrations/
├── main.py
└── requirements.txt
```

## 3.1 Regla arquitectónica

Las capas internas no deben depender de detalles de infraestructura.

La dependencia debe apuntar hacia el dominio:

```text
Presentation
     ↓
Application
     ↓
Domain
     ↑
Infrastructure
```

Los casos de uso no deben depender directamente de FastAPI, SQLAlchemy ni del framework HTTP.

---

# 4. Usuarios

## 4.1 Tabla `users`

Campos iniciales:

```text
id
nombre
apellido
email
password
tipo_usuario
rol_id
estado
created_at
updated_at
```

La misma tabla `users` será utilizada para usuarios internos y clientes.

## 4.2 Tipos de usuario

Inicialmente se contemplan:

```text
ADMIN
USUARIO
TECNICO
```

El modelo deberá permitir ampliar posteriormente los tipos.

## 4.3 Roles y permisos

El sistema debe soportar:

- Roles
- Permisos
- Asociación usuario → rol
- Asociación rol → permisos
- Autorización por endpoint/caso de uso

Ejemplo conceptual:

```text
User
  ↓
Role
  ↓
Permissions
```

Los nombres definitivos de roles y permisos se definirán posteriormente.

---

# 5. Autenticación

La API debe implementar:

- Login
- Generación de JWT
- Validación de token
- Usuario autenticado
- Control de acceso
- Protección de endpoints
- Hash seguro de contraseñas

Los endpoints protegidos deben poder obtener el usuario autenticado mediante una dependencia de autenticación.

---

# 6. Categorías

## Tabla `categories`

```text
id
nombre
descripcion
estado
created_at
updated_at
```

## Operaciones

CRUD completo:

- Crear categoría
- Consultar categoría
- Listar categorías
- Actualizar categoría
- Activar/desactivar categoría

No se recomienda eliminar físicamente categorías que ya tengan productos relacionados.

---

# 7. Productos

## Tabla `products`

```text
id
category_id
nombre
descripcion
precio
stock
estado
created_at
updated_at
```

## Relaciones

```text
Category 1 ───── N Products
```

## Operaciones

- Crear producto
- Consultar producto
- Listar productos
- Actualizar producto
- Activar/desactivar producto
- Consultar stock

## Reglas

El precio debe utilizar un tipo decimal apropiado para dinero.

El stock no debe poder quedar negativo.

Las modificaciones críticas de stock deben realizarse mediante transacciones.

---

# 8. Ventas

La venta debe soportar múltiples productos.

## Tabla `sales`

```text
id
user_id
fecha
total
estado
created_at
updated_at
```

## Tabla `sale_details`

```text
id
sale_id
product_id
cantidad
precio_unitario
subtotal
```

## Relaciones

```text
User 1 ───── N Sales

Sale 1 ───── N SaleDetails

Product 1 ── N SaleDetails
```

## Regla de stock

Al confirmar una venta:

```text
stock_nuevo = stock_actual - cantidad
```

Ejemplo:

```text
Stock actual: 10
Cantidad vendida: 3
Stock nuevo: 7
```

La actualización de stock y la confirmación de la venta deben ejecutarse dentro de una transacción.

Si el stock disponible es inferior a la cantidad solicitada, la operación debe rechazarse.

## Precio histórico

`precio_unitario` debe almacenarse en `sale_details`, aunque el producto posteriormente cambie de precio.

---

# 9. Clientes

Los clientes utilizarán la misma tabla `users`.

En una orden de trabajo existirán referencias diferentes a `users`:

```text
user_id
cliente_id
tecnico_id
```

Estas referencias deben quedar correctamente diferenciadas en el modelo y en las validaciones de negocio.

---

# 10. Marcas

## Tabla `brands`

```text
id
nombre
descripcion
estado
created_at
updated_at
```

## Operaciones

CRUD completo.

---

# 11. Modelos

## Tabla `models`

```text
id
brand_id
nombre
descripcion
estado
created_at
updated_at
```

## Relaciones

```text
Brand 1 ───── N Models
```

## Operaciones

CRUD completo.

---

# 12. Órdenes de trabajo

## Tabla `work_orders`

Campos iniciales:

```text
id
num_orden
user_id
cliente_id
tecnico_id
marca_id
modelo_id
observacion
estado
garantia
color
presupuesto
anticipo
saldo
fecha
created_at
updated_at
```

## Relaciones

```text
users.id    ← user_id
users.id    ← cliente_id
users.id    ← tecnico_id

brands.id   ← marca_id
models.id   ← modelo_id
```

## Significado de usuarios

### `user_id`

Usuario que crea/registra la orden.

### `cliente_id`

Cliente asociado a la orden.

### `tecnico_id`

Técnico responsable de la orden.

El técnico podrá ser obtenido inicialmente del usuario autenticado cuando corresponda.

---

# 13. Número de orden

`num_orden` debe ser autoincremental.

Debe ser único.

La implementación concreta puede utilizar:

- Secuencia de base de datos
- ID interno
- Mecanismo específico de numeración

La decisión final dependerá de la base de datos seleccionada.

---

# 14. Estado de orden de trabajo

Actualmente se han definido tres valores:

```text
0
1
2
```

El significado exacto de cada estado queda pendiente de definición.

El backend deberá centralizar esta regla para evitar valores arbitrarios.

---

# 15. Datos económicos de la orden

Campos:

```text
presupuesto
anticipo
saldo
```

Regla inicial:

```text
saldo = presupuesto - anticipo
```

El backend debe validar que:

- Los valores monetarios sean válidos.
- El anticipo no sea negativo.
- El presupuesto no sea negativo.
- El saldo sea consistente.

Las reglas exactas para sobrepagos, anticipos mayores al presupuesto y modificaciones posteriores quedan pendientes de definición.

---

# 16. Repuestos

## Tabla `spare_parts`

Campos:

```text
id
tipo
ubicacion
precio
garantia
estado
created_at
updated_at
```

## Tipos conceptuales

| Campo | Tipo |
|---|---|
| tipo | VARCHAR |
| ubicacion | BOOLEAN |
| precio | DECIMAL |
| garantia | BOOLEAN |
| estado | BOOLEAN |

## CRUD

Debe existir:

- Crear repuesto
- Consultar repuesto
- Listar repuestos
- Actualizar repuesto
- Activar/desactivar repuesto

---

# 17. Repuestos utilizados en órdenes

Un repuesto puede utilizarse en muchas órdenes.

Por lo tanto, no debe almacenarse directamente dentro de `spare_parts` como un único técnico/orden.

## Tabla `work_order_spare_parts`

```text
id
work_order_id
technician_id
spare_part_id
cantidad
precio
fecha
```

## Relaciones

```text
WorkOrder 1 ───── N WorkOrderSpareParts

SparePart 1 ───── N WorkOrderSpareParts

User 1 ────────── N WorkOrderSpareParts
```

## Técnico

El `technician_id` representa al técnico que registra/sube el repuesto.

Inicialmente debe obtenerse del usuario autenticado cuando el usuario sea un técnico autorizado.

---

# 18. API REST

Las rutas deben organizarse por módulo.

Ejemplo:

```text
/api/v1/auth
/api/v1/users
/api/v1/roles
/api/v1/permissions
/api/v1/categories
/api/v1/products
/api/v1/sales
/api/v1/brands
/api/v1/models
/api/v1/work-orders
/api/v1/spare-parts
```

Ejemplos de operaciones:

```text
GET    /api/v1/products
GET    /api/v1/products/{id}
POST   /api/v1/products
PUT    /api/v1/products/{id}
PATCH  /api/v1/products/{id}/status
DELETE /api/v1/products/{id}
```

La nomenclatura definitiva de endpoints se mantendrá consistente en todo el proyecto.

---

# 19. DTOs y schemas

No se deben exponer directamente las entidades de dominio o modelos de persistencia.

Cada operación debe utilizar DTOs/schemas adecuados.

Ejemplo:

```text
CreateProductRequest
UpdateProductRequest
ProductResponse
ProductListResponse
```

Esto permitirá controlar:

- Validación
- Entrada
- Salida
- Campos permitidos
- Seguridad

---

# 20. Reglas de negocio

Las reglas importantes deben implementarse en casos de uso o servicios de dominio, no directamente en los controllers.

Ejemplos:

```text
ConfirmSaleUseCase
CreateWorkOrderUseCase
AddSparePartToWorkOrderUseCase
UpdateProductStockUseCase
CalculateWorkOrderBalanceUseCase
```

---

# 21. Transacciones

Deben utilizarse transacciones para operaciones como:

### Confirmar venta

```text
1. Validar usuario
2. Validar productos
3. Validar stock
4. Crear venta
5. Crear detalles
6. Descontar stock
7. Confirmar transacción
```

Si cualquier paso falla:

```text
ROLLBACK
```

No debe quedar una venta registrada con stock incorrecto.

---

# 22. Manejo de errores

La API debe utilizar respuestas HTTP apropiadas.

Ejemplos:

```text
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
500 Internal Server Error
```

Los errores deben tener una estructura consistente.

Ejemplo conceptual:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Stock insuficiente para el producto solicitado."
  }
}
```

---

# 23. Auditoría

Se recomienda preparar el diseño para registrar posteriormente:

- Usuario que creó un registro
- Usuario que modificó un registro
- Fecha de creación
- Fecha de modificación
- Cambios críticos

Esto es especialmente importante para:

- Ventas
- Stock
- Órdenes de trabajo
- Repuestos

Los campos definitivos de auditoría quedan pendientes.

---

# 24. Pruebas

Se deben implementar pruebas para:

- Entidades
- Casos de uso
- Reglas de negocio
- Repositorios
- Endpoints
- Autenticación
- Autorización
- Ventas
- Stock
- Órdenes de trabajo

Casos críticos:

```text
Venta con stock suficiente
Venta con stock insuficiente
Venta de múltiples productos
Actualización correcta de stock
Creación de orden
Asignación de técnico
Cálculo de saldo
Registro de repuesto
Permiso insuficiente
Usuario no autenticado
```

---

# 25. Pendientes de definición

Los siguientes puntos deben definirse antes de cerrar la implementación:

1. Base de datos definitiva.
2. Campos adicionales de usuarios.
3. Tipos exactos de usuario.
4. Roles definitivos.
5. Catálogo de permisos.
6. Significado de estados 0, 1 y 2 de órdenes.
7. Si los clientes pueden iniciar sesión.
8. Reglas completas de eliminación lógica/física.
9. Reglas de devolución/anulación de ventas.
10. Si los repuestos descuentan algún stock.
11. Campos adicionales de repuestos.
12. Formato final del número de orden.
13. Reglas de anticipo y saldo.
14. Campos adicionales de órdenes de trabajo.
15. Reportes requeridos.
16. Configuración de deployment.
