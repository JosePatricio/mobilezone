import { Navigate, Route, Routes } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { LoginPage } from '@/modules/auth/pages/LoginPage';
import { BranchesPage } from '@/modules/branches/pages/BranchesPage';
import { BrandsPage } from '@/modules/brands/pages/BrandsPage';
import { CategoriesPage } from '@/modules/categories/pages/CategoriesPage';
import { ClientsPage } from '@/modules/clients/pages/ClientsPage';
import { DashboardPage } from '@/modules/dashboard/pages/DashboardPage';
import { InventoryPage } from '@/modules/inventory/pages/InventoryPage';
import { ModelsPage } from '@/modules/models/pages/ModelsPage';
import { PermissionsPage } from '@/modules/permissions/pages/PermissionsPage';
import { ProductsPage } from '@/modules/products/pages/ProductsPage';
import { RolePermissionsPage } from '@/modules/roles/pages/RolePermissionsPage';
import { RolesPage } from '@/modules/roles/pages/RolesPage';
import { EditSalePage } from '@/modules/sales/pages/EditSalePage';
import { NewSalePage } from '@/modules/sales/pages/NewSalePage';
import { SaleDetailPage } from '@/modules/sales/pages/SaleDetailPage';
import { SalesPage } from '@/modules/sales/pages/SalesPage';
import { SparePartsPage } from '@/modules/spare-parts/pages/SparePartsPage';
import { UsersPage } from '@/modules/users/pages/UsersPage';
import { WorkOrderDetailPage } from '@/modules/work-orders/pages/WorkOrderDetailPage';
import { WorkOrderFormPage } from '@/modules/work-orders/pages/WorkOrderFormPage';
import { WorkOrdersPage } from '@/modules/work-orders/pages/WorkOrdersPage';
import { EmptyState } from '@/shared/components';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { PermissionRoute, ProtectedRoute } from './guards';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route index element={<DashboardPage />} />

          <Route element={<PermissionRoute permission={P.PRODUCTS_VIEW} />}>
            <Route path="products" element={<ProductsPage />} />
          </Route>
          <Route element={<PermissionRoute permission={P.INVENTORY_VIEW} />}>
            <Route path="inventory" element={<InventoryPage />} />
          </Route>
          <Route element={<PermissionRoute permission={P.BRANCHES_VIEW} />}>
            <Route path="branches" element={<BranchesPage />} />
          </Route>
          <Route element={<PermissionRoute permission={P.CATEGORIES_VIEW} />}>
            <Route path="categories" element={<CategoriesPage />} />
          </Route>

          <Route element={<PermissionRoute permission={[P.SALES_VIEW, P.SALES_CREATE]} />}>
            <Route path="sales" element={<SalesPage />} />
          </Route>
          <Route element={<PermissionRoute permission={P.SALES_CREATE} />}>
            <Route path="sales/new" element={<NewSalePage />} />
          </Route>
          <Route element={<PermissionRoute permission={P.SALES_VIEW} />}>
            <Route path="sales/:id" element={<SaleDetailPage />} />
          </Route>
          <Route element={<PermissionRoute permission={P.SALES_UPDATE} />}>
            <Route path="sales/:id/edit" element={<EditSalePage />} />
          </Route>

          <Route element={<PermissionRoute permission={P.WORK_ORDERS_VIEW} />}>
            <Route path="work-orders" element={<WorkOrdersPage />} />
            <Route path="work-orders/:id" element={<WorkOrderDetailPage />} />
          </Route>
          <Route element={<PermissionRoute permission={P.WORK_ORDERS_CREATE} />}>
            <Route path="work-orders/new" element={<WorkOrderFormPage />} />
          </Route>
          <Route element={<PermissionRoute permission={P.WORK_ORDERS_UPDATE} />}>
            <Route path="work-orders/:id/edit" element={<WorkOrderFormPage />} />
          </Route>

          <Route element={<PermissionRoute permission={P.SPARE_PARTS_VIEW} />}>
            <Route path="spare-parts" element={<SparePartsPage />} />
          </Route>
          <Route element={<PermissionRoute permission={P.CLIENTS_VIEW} />}>
            <Route path="clients" element={<ClientsPage />} />
          </Route>
          <Route element={<PermissionRoute permission={P.BRANDS_VIEW} />}>
            <Route path="brands" element={<BrandsPage />} />
          </Route>
          <Route element={<PermissionRoute permission={P.MODELS_VIEW} />}>
            <Route path="models" element={<ModelsPage />} />
          </Route>
          <Route element={<PermissionRoute permission={P.USERS_VIEW} />}>
            <Route path="users" element={<UsersPage />} />
          </Route>
          <Route element={<PermissionRoute permission={P.ROLES_VIEW} />}>
            <Route path="roles" element={<RolesPage />} />
            <Route path="roles/:id/permissions" element={<RolePermissionsPage />} />
          </Route>
          <Route element={<PermissionRoute permission={P.PERMISSIONS_VIEW} />}>
            <Route path="permissions" element={<PermissionsPage />} />
          </Route>

          <Route path="*" element={<EmptyState title="Página no encontrada" />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
