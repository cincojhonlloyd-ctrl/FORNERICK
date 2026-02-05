import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth';
import { LibraryService, Book, BorrowRecord, Student } from '../services/library';
import { NotificationService, LibraryNotification } from '../services/notification';

@Component({
    selector: 'app-student-dashboard',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './student-dashboard.component.html',
    styleUrls: ['./student-dashboard.component.css']
})
export class StudentDashboardComponent implements OnInit {
    activeSection: string = 'catalog';

    // Notifications
    notifications: LibraryNotification[] = [];
    showNotifications: boolean = false;

    // Mobile Menu State
    isMobileMenuOpen: boolean = false;
    isProfileMenuOpen: boolean = false;

    toggleMobileMenu() {
        this.isMobileMenuOpen = !this.isMobileMenuOpen;
    }

    toggleProfileMenu() {
        this.isProfileMenuOpen = !this.isProfileMenuOpen;
    }

    toggleNotifications() {
        this.showNotifications = !this.showNotifications;
        if (this.showNotifications) {
            this.markAllRead();
        }
    }

    get unreadCount(): number {
        return this.notifications.filter(n => !n.read).length;
    }

    // Book Catalog
    books: Book[] = [];
    filteredBooks: Book[] = [];
    searchQuery: string = '';
    selectedBook: Book | null = null;

    // Filtering & Sorting
    selectedCategory: string = 'all';
    showAvailableOnly: boolean = false;
    sortBy: string = 'title';
    categories: string[] = [];

    // Borrowing
    myBorrows: BorrowRecord[] = [];
    isRequesting: boolean = false;
    studentId: string = '';
    studentName: string = '';

    constructor(
        private auth: AuthService,
        private libraryService: LibraryService,
        private notificationService: NotificationService,
        private route: ActivatedRoute,
        private router: Router
    ) { }

    isLoginLoading: boolean = false;
    loginError: string = '';

    ngOnInit() {
        this.loadStudentInfo();

        // Restore view from URL
        this.route.queryParams.subscribe(params => {
            if (params['view']) {
                this.activeSection = params['view'];
            }
            if (params['studentId']) {
                // Auto-login from cross-portal redirect
                this.loginWithId(params['studentId']);
                // Clean URL
                this.router.navigate([], {
                    relativeTo: this.route,
                    queryParams: { studentId: null },
                    queryParamsHandling: 'merge',
                    replaceUrl: true
                });
            }
        });
    }

    loadStudentInfo() {
        // 1. Try Firebase Auth (if enabled eventually)
        const user = this.auth.currentUser;
        if (user) {
            this.studentId = user.uid;
            this.studentName = user.email || 'Student';
            this.loadBooks();
            this.loadMyBorrows();
            this.loadNotifications();
            return;
        }

        // 2. Try Local Storage (Persistent Session for ID-based login)
        const storedId = localStorage.getItem('library_student_id');
        if (storedId) {
            this.loginWithId(storedId);
        } else {
            // No user, we will show the login screen
            this.loadBooks(); // Still load books for browsing
        }
    }

    loadNotifications() {
        if (!this.studentId) return;
        this.notificationService.getNotifications(this.studentId).subscribe((notifs: LibraryNotification[]) => {
            this.notifications = notifs;
        });
    }

    async markAllRead() {
        if (!this.studentId) return;
        // Optimistic update
        this.notifications.forEach(n => n.read = true);
        await this.notificationService.markAllAsRead(this.studentId);
    }

    async loginWithId(studentId: string) {
        if (!studentId.trim()) return;
        this.isLoginLoading = true;
        this.loginError = '';

        try {
            // ... (existing logic) ...

            this.studentId = studentId;
            this.studentName = 'Student ' + studentId;
            localStorage.setItem('library_student_id', studentId);

            this.libraryService.getStudents().subscribe((students: Student[]) => {
                const found = students.find((s: Student) => s.studentId === studentId);
                if (found) {
                    this.studentName = found.fullName;
                }
            });

            this.loadMyBorrows();
            this.loadNotifications();

        } catch (err) {
            console.error(err);
            this.loginError = 'Login failed';
        } finally {
            this.isLoginLoading = false;
        }
    }

    // ... (rest of methods) ...

    logout() {
        this.auth.logout();
        localStorage.removeItem('library_student_id');
        this.studentId = '';
        this.studentName = '';
        this.myBorrows = [];
        // Redirect back to Main Kiosk (Admin Portal)
        window.location.href = 'http://localhost:4200';
    }

    loadBooks() {
        this.libraryService.getBooks().subscribe((books: Book[]) => {
            this.books = books;
            this.filteredBooks = books;
            this.updateCategories();
            this.searchBooks(); // Apply default sort
        });
    }

    updateCategories() {
        const categorySet = new Set(this.books.map(b => b.category));
        this.categories = Array.from(categorySet).sort();
    }

    loadMyBorrows() {
        if (!this.studentId) {
            setTimeout(() => this.loadMyBorrows(), 500);
            return;
        }
        this.libraryService.getStudentBorrows(this.studentId).subscribe((borrows: BorrowRecord[]) => {
            this.myBorrows = borrows;
        });
    }

    searchBooks() {
        let filtered = [...this.books];

        // Filter by search query
        const query = this.searchQuery.toLowerCase().trim();
        if (query) {
            filtered = filtered.filter(book =>
                book.title.toLowerCase().includes(query) ||
                book.author.toLowerCase().includes(query) ||
                book.category.toLowerCase().includes(query)
            );
        }

        // Filter by category
        if (this.selectedCategory && this.selectedCategory !== 'all') {
            filtered = filtered.filter(book => book.category === this.selectedCategory);
        }

        // Filter by availability
        if (this.showAvailableOnly) {
            filtered = filtered.filter(book => book.availableCopies > 0);
        }

        // Sort
        filtered.sort((a, b) => {
            if (this.sortBy === 'title') {
                return a.title.localeCompare(b.title);
            } else if (this.sortBy === 'author') {
                return a.author.localeCompare(b.author);
            } else if (this.sortBy === 'date') {
                const dateA = new Date(a.addedAt).getTime();
                const dateB = new Date(b.addedAt).getTime();
                return dateB - dateA; // Newest first
            }
            return 0;
        });

        this.filteredBooks = filtered;
    }

    viewBookDetails(book: Book) {
        this.selectedBook = book;
    }

    closeBookDetails() {
        this.selectedBook = null;
    }

    setActive(section: string) {
        this.activeSection = section;
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { view: section },
            queryParamsHandling: 'merge'
        });
    }

    onLogout() {
        this.auth.logout();
    }

    // Borrowing Methods
    async requestBorrow(book: Book) {
        if (!book.id || !this.studentId) return;
        if (book.availableCopies === 0) {
            alert('This book is currently out of stock.');
            return;
        }
        if (this.isBookBorrowedByMe(book.id)) {
            alert('You have already borrowed or requested this book.');
            return;
        }

        this.isRequesting = true;
        try {
            await this.libraryService.requestBorrow(book.id, book.title, this.studentId, this.studentName);
            alert('Borrow request submitted successfully! Please wait for admin approval.');
            this.closeBookDetails();
        } catch (err) {
            console.error('Error requesting borrow:', err);
            alert('Failed to submit borrow request.');
        } finally {
            this.isRequesting = false;
        }
    }

    isBookBorrowedByMe(bookId: string): boolean {
        return this.myBorrows.some(b =>
            b.bookId === bookId &&
            (b.status === 'pending' || b.status === 'approved')
        );
    }

    getMyBorrowStatus(bookId: string): string {
        const borrow = this.myBorrows.find(b =>
            b.bookId === bookId &&
            (b.status === 'pending' || b.status === 'approved')
        );
        if (!borrow) return '';
        if (borrow.status === 'pending') return 'Request Pending';
        if (borrow.status === 'approved') return 'Already Borrowed';
        return '';
    }

    getActiveBorrows(): BorrowRecord[] {
        return this.myBorrows.filter(b => b.status === 'approved');
    }

    getPendingBorrows(): BorrowRecord[] {
        return this.myBorrows.filter(b => b.status === 'pending');
    }

    getDaysRemaining(dueDate: any): number {
        if (!dueDate) return 0;
        const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
        const now = new Date();
        const diff = due.getTime() - now.getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
}
