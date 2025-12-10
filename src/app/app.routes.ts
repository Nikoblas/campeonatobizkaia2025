import { Routes } from '@angular/router';
import { CompetitionTableComponent } from './components/competition-table/competition-table.component';
import { CompetitionExplorerComponent } from './components/competition-explorer/competition-explorer.component';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', component: CompetitionTableComponent },
  { path: 'explorer', component: CompetitionExplorerComponent },
  {
    path: 'admin',
    children: [
      {
        path: 'login',
        loadComponent: () => import('./components/admin/admin-login/admin-login.component')
          .then(m => m.AdminLoginComponent)
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./components/admin/admin-dashboard/admin-dashboard.component')
          .then(m => m.AdminDashboardComponent),
        canActivate: [AuthGuard]
      },
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full'
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
