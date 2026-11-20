import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('./pages/auth/auth.page').then((m) => m.AuthPage)
  },
  {
    path: 'catalog',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/catalog/catalog.page').then((m) => m.CatalogPage)
  },
  {
    path: 'wallet',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/wallet/wallet.page').then((m) => m.WalletPage)
  },
  {
    path: 'orders',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/orders/orders.page').then((m) => m.OrdersPage)
  },
  {
    path: 'seller',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/seller/seller.page').then((m) => m.SellerPage)
  },
  {
    path: '',
    redirectTo: '/auth',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: '/auth'
  }
];

