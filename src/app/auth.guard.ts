import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { auth } from './enviroment/enviroment';

export const authGuard: CanActivateFn = () => {
    const router = inject(Router);
    const user = auth.currentUser;

    if (user) {
        return true;
    } else {
        router.navigate(['/login']);
        return false;
    }
};
