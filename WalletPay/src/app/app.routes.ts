import { Routes } from '@angular/router';
import { TabsPage } from './pages/tabs/tabs.page';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('./pages/auth/auth.page').then((m) => m.AuthPage)
  },
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'store',
        loadComponent: () => import('./pages/store/store.page').then((m) => m.StorePage)
      },
      {
        path: 'vault',
        loadComponent: () => import('./pages/vault/vault.page').then((m) => m.VaultPage)
      },
      {
        path: 'history',
        loadComponent: () => import('./pages/history/history.page').then((m) => m.HistoryPage)
      },
      {
        path: '',
        redirectTo: '/tabs/store',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '',
    redirectTo: '/auth',
    pathMatch: 'full'
  }
];

