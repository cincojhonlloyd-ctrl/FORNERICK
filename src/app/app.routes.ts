import { Routes } from '@angular/router';
import { CheckInComponent } from './components/check-in/check-in.component';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard.component';
import { AdminLoginComponent } from './components/admin-login/admin-login.component';
import { authGuard } from './auth.guard';

import { StudentDashboardComponent } from './components/student-dashboard/student-dashboard.component';
export const routes: Routes = [
    { path: '', component: CheckInComponent },
    { path: 'login', component: AdminLoginComponent },
    { path: 'admin', component: AdminDashboardComponent, canActivate: [authGuard] },
    { path: 'student-dashboard', component: StudentDashboardComponent },
    { path: 'reports', loadComponent: () => import('./components/reports/reports').then(m => m.ReportsComponent), canActivate: [authGuard] },
    { path: '**', redirectTo: '' }
];
