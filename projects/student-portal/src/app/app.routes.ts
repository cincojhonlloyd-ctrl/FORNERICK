import { Routes } from '@angular/router';
import { StudentDashboardComponent } from './student-dashboard/student-dashboard.component';

export const routes: Routes = [
    { path: '', component: StudentDashboardComponent },
    { path: '**', redirectTo: '' }
];
