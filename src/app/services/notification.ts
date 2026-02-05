import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { collection, addDoc, query, orderBy, onSnapshot, where, updateDoc, limit, doc, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '../enviroment/enviroment';

export interface LibraryNotification {
    id?: string;
    studentId: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    timestamp: any;
    read: boolean;
    relatedBookId?: string;
}

@Injectable({
    providedIn: 'root',
})
export class NotificationService {

    constructor() { }

    async addNotification(n: Omit<LibraryNotification, 'id' | 'timestamp' | 'read'>): Promise<void> {
        try {
            await addDoc(collection(db, 'notifications'), {
                ...n,
                timestamp: new Date(),
                read: false
            });
        } catch (e) {
            console.error('Error adding notification', e);
        }
    }

    getNotifications(studentId: string): Observable<LibraryNotification[]> {
        return new Observable(observer => {
            const q = query(
                collection(db, 'notifications'),
                where('studentId', '==', studentId),
                orderBy('timestamp', 'desc'),
                limit(20)
            );
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const notifications = snapshot.docs.map(d => {
                    const data = d.data();
                    const timestamp = data['timestamp']?.toDate ? data['timestamp'].toDate() : data['timestamp'];
                    return { id: d.id, ...data, timestamp } as LibraryNotification;
                });
                observer.next(notifications);
            }, (error) => observer.error(error));
            return () => unsubscribe();
        });
    }

    async markAsRead(id: string): Promise<void> {
        const docRef = doc(db, 'notifications', id);
        await updateDoc(docRef, { read: true });
    }

    async markAllAsRead(studentId: string): Promise<void> {
        const q = query(
            collection(db, 'notifications'),
            where('studentId', '==', studentId),
            where('read', '==', false)
        );
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.docs.forEach(d => {
            batch.update(d.ref, { read: true });
        });
        await batch.commit();
    }
}
