import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { collection, addDoc, query, orderBy, onSnapshot, Timestamp, where, getDocs, updateDoc, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../enviroment/enviroment';

export interface Student {
  id?: string; // Firestore ID
  fullName: string;
  studentId: string; // The school ID
  email?: string;
  registeredAt: any;
}

export interface Book {
  id?: string; // Firestore ID
  title: string;
  author: string;
  isbn?: string;
  category: string;
  description: string;
  coverUrl?: string;
  availableCopies: number;
  totalCopies: number;
  addedAt: any;
}

export interface Entry {
  id?: string;
  name: string;
  studentId: string;
  purpose: string;
  timestamp: Date | Timestamp;
  checkOutTimestamp?: Date | Timestamp | null;
}

export interface BorrowRecord {
  id?: string; // Firestore ID
  bookId: string;
  bookTitle: string;
  studentId: string;
  studentName: string;
  borrowDate: any;
  dueDate: any;
  returnDate?: any | null;
  status: 'pending' | 'approved' | 'rejected' | 'returned';
  rejectionReason?: string;
}

@Injectable({
  providedIn: 'root',
})
export class LibraryService {

  constructor() { }

  async addEntry(name: string, studentId: string, purpose: string): Promise<void> {
    const entry = {
      name,
      studentId,
      purpose,
      timestamp: new Date(),
      checkOutTimestamp: null
    };
    await addDoc(collection(db, 'entries'), entry);
  }

  async checkOut(studentId: string): Promise<void> {
    const q = query(
      collection(db, 'entries'),
      where('studentId', '==', studentId),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      throw new Error('No check-in record found for this ID.');
    }

    const docRef = querySnapshot.docs[0].ref;
    const data = querySnapshot.docs[0].data();

    if (data['checkOutTimestamp']) {
      throw new Error('User is already checked out.');
    }

    await updateDoc(docRef, {
      checkOutTimestamp: new Date()
    });
  }

  async getLatestEntry(studentId: string): Promise<Entry | null> {
    const q = query(
      collection(db, 'entries'),
      where('studentId', '==', studentId),
      orderBy('timestamp', 'desc'),
      limit(1)
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    const data = querySnapshot.docs[0].data();
    return { id: querySnapshot.docs[0].id, ...data } as Entry;
  }

  getEntries(): Observable<Entry[]> {
    return new Observable(observer => {
      const q = query(
        collection(db, 'entries'),
        orderBy('timestamp', 'desc'),
        limit(100)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const entries = snapshot.docs.map(d => {
          const data = d.data();
          const timestamp = data['timestamp']?.toDate ? data['timestamp'].toDate() : data['timestamp'];
          const checkOutTimestamp = data['checkOutTimestamp']?.toDate ? data['checkOutTimestamp'].toDate() : data['checkOutTimestamp'];
          return { id: d.id, ...data, timestamp, checkOutTimestamp } as Entry;
        });
        observer.next(entries);
      }, (error) => {
        observer.error(error);
      });
      return () => unsubscribe();
    });
  }

  // Student Management
  async addStudent(student: Partial<Student>): Promise<void> {
    await addDoc(collection(db, 'students'), {
      ...student,
      registeredAt: new Date()
    });
  }

  getStudents(): Observable<Student[]> {
    return new Observable(observer => {
      const q = query(collection(db, 'students'), orderBy('registeredAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const students = snapshot.docs.map(d => {
          const data = d.data();
          const registeredAt = data['registeredAt']?.toDate ? data['registeredAt'].toDate() : data['registeredAt'];
          return { id: d.id, ...data, registeredAt } as Student;
        });
        observer.next(students);
      }, (error) => observer.error(error));
      return () => unsubscribe();
    });
  }

  // Book Management
  async addBook(book: Partial<Book>): Promise<void> {
    await addDoc(collection(db, 'books'), {
      ...book,
      addedAt: new Date()
    });
  }

  // Image Upload
  async uploadBookCover(file: File): Promise<string> {
    try {
      const fileName = `covers/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, fileName);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error: any) {
      throw new Error('Image upload failed: ' + error.message);
    }
  }

  getBooks(): Observable<Book[]> {
    return new Observable(observer => {
      const q = query(collection(db, 'books'), orderBy('addedAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const books = snapshot.docs.map(d => {
          const data = d.data();
          const addedAt = data['addedAt']?.toDate ? data['addedAt'].toDate() : data['addedAt'];
          return { id: d.id, ...data, addedAt } as Book;
        });
        observer.next(books);
      }, (error) => observer.error(error));
      return () => unsubscribe();
    });
  }

  async getBookById(id: string): Promise<Book | null> {
    const q = query(collection(db, 'books'), where('__name__', '==', id));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    const data = querySnapshot.docs[0].data();
    return { id: querySnapshot.docs[0].id, ...data } as Book;
  }

  async updateBook(id: string, updates: Partial<Book>): Promise<void> {
    const q = query(collection(db, 'books'), where('__name__', '==', id));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) throw new Error('Book not found');
    const docRef = querySnapshot.docs[0].ref;
    await updateDoc(docRef, updates as any);
  }

  async deleteBook(id: string): Promise<void> {
    const q = query(collection(db, 'books'), where('__name__', '==', id));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) throw new Error('Book not found');
    const docRef = querySnapshot.docs[0].ref;
    await updateDoc(docRef, { deleted: true } as any);
  }

  // Borrowing System
  async requestBorrow(bookId: string, bookTitle: string, studentId: string, studentName: string): Promise<void> {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14); // 2 weeks default

    const borrowRecord = {
      bookId,
      bookTitle,
      studentId,
      studentName,
      borrowDate: new Date(),
      dueDate,
      returnDate: null,
      status: 'pending' as const,
      rejectionReason: ''
    };
    await addDoc(collection(db, 'borrowRecords'), borrowRecord);
  }

  async approveBorrow(borrowId: string, bookId: string): Promise<void> {
    const borrowQuery = query(collection(db, 'borrowRecords'), where('__name__', '==', borrowId));
    const borrowSnapshot = await getDocs(borrowQuery);
    if (borrowSnapshot.empty) throw new Error('Borrow record not found');

    // Update borrow status
    const borrowDocRef = borrowSnapshot.docs[0].ref;
    await updateDoc(borrowDocRef, { status: 'approved' } as any);

    // Decrement available copies
    const bookQuery = query(collection(db, 'books'), where('__name__', '==', bookId));
    const bookSnapshot = await getDocs(bookQuery);
    if (!bookSnapshot.empty) {
      const bookRef = bookSnapshot.docs[0].ref;
      const bookData = bookSnapshot.docs[0].data() as Book;
      if (bookData.availableCopies > 0) {
        await updateDoc(bookRef, { availableCopies: bookData.availableCopies - 1 } as any);
      }
    }
  }

  async rejectBorrow(borrowId: string, reason?: string): Promise<void> {
    const q = query(collection(db, 'borrowRecords'), where('__name__', '==', borrowId));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) throw new Error('Borrow record not found');
    const docRef = querySnapshot.docs[0].ref;
    await updateDoc(docRef, {
      status: 'rejected',
      rejectionReason: reason || 'Request rejected'
    } as any);
  }

  async returnBook(borrowId: string, bookId: string): Promise<void> {
    const borrowQuery = query(collection(db, 'borrowRecords'), where('__name__', '==', borrowId));
    const borrowSnapshot = await getDocs(borrowQuery);
    if (borrowSnapshot.empty) throw new Error('Borrow record not found');

    // Update borrow status
    const borrowDocRef = borrowSnapshot.docs[0].ref;
    await updateDoc(borrowDocRef, {
      status: 'returned',
      returnDate: new Date()
    } as any);

    // Increment available copies
    const bookQuery = query(collection(db, 'books'), where('__name__', '==', bookId));
    const bookSnapshot = await getDocs(bookQuery);
    if (!bookSnapshot.empty) {
      const bookRef = bookSnapshot.docs[0].ref;
      const bookData = bookSnapshot.docs[0].data() as Book;
      await updateDoc(bookRef, { availableCopies: bookData.availableCopies + 1 } as any);
    }
  }

  getBorrowRecords(): Observable<BorrowRecord[]> {
    return new Observable(observer => {
      const q = query(collection(db, 'borrowRecords'), orderBy('borrowDate', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(d => {
          const data = d.data();
          const borrowDate = data['borrowDate']?.toDate ? data['borrowDate'].toDate() : data['borrowDate'];
          const dueDate = data['dueDate']?.toDate ? data['dueDate'].toDate() : data['dueDate'];
          const returnDate = data['returnDate']?.toDate ? data['returnDate'].toDate() : data['returnDate'];
          return { id: d.id, ...data, borrowDate, dueDate, returnDate } as BorrowRecord;
        });
        observer.next(records);
      }, (error) => observer.error(error));
      return () => unsubscribe();
    });
  }

  getStudentBorrows(studentId: string): Observable<BorrowRecord[]> {
    return new Observable(observer => {
      const q = query(
        collection(db, 'borrowRecords'),
        where('studentId', '==', studentId),
        orderBy('borrowDate', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const records = snapshot.docs.map(d => {
          const data = d.data();
          const borrowDate = data['borrowDate']?.toDate ? data['borrowDate'].toDate() : data['borrowDate'];
          const dueDate = data['dueDate']?.toDate ? data['dueDate'].toDate() : data['dueDate'];
          const returnDate = data['returnDate']?.toDate ? data['returnDate'].toDate() : data['returnDate'];
          return { id: d.id, ...data, borrowDate, dueDate, returnDate } as BorrowRecord;
        });
        observer.next(records);
      }, (error) => observer.error(error));
      return () => unsubscribe();
    });
  }
}
