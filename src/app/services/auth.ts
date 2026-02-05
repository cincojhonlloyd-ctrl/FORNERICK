import { Injectable, signal } from '@angular/core';
import { auth } from '../enviroment/enviroment';
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    User
} from 'firebase/auth';
import { Router } from '@angular/router';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private userSignal = signal<User | null>(null);

    constructor(private router: Router) {
        onAuthStateChanged(auth, (user) => {
            this.userSignal.set(user);
        });
    }

    get currentUser() {
        return this.userSignal();
    }

    async login(email: string, pass: string) {
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            this.router.navigate(['/admin']);
        } catch (error: any) {
            throw new Error(error.message || 'Login failed');
        }
    }

    async logout() {
        await signOut(auth);
        this.router.navigate(['/']);
    }

    isAuthenticated(): boolean {
        return this.currentUser !== null;
    }
}
