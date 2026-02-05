import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LibraryService, Student, Book, BorrowRecord } from '../../services/library';
import { NotificationService } from '../../services/notification';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, registerables } from 'chart.js';
import { Subscription } from 'rxjs';
import * as QRCode from 'qrcode';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';

Chart.register(...registerables);

@Component({
    selector: 'app-admin-dashboard',
    standalone: true,
    imports: [CommonModule, DatePipe, FormsModule, BaseChartDirective, RouterModule],
    templateUrl: './admin-dashboard.component.html',
    styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
    @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLCanvasElement>;

    entries: any[] = [];
    filteredEntries: any[] = [];
    students: Student[] = [];
    searchTerm: string = '';
    isLoading: boolean = true;
    private subscription: Subscription | null = null;
    private studentSubscription: Subscription | null = null;

    // View State
    activeView: string = 'dashboard';

    // Student QR Modal State
    selectedStudent: Student | null = null;
    qrValue: string = '';

    // Book Management
    books: Book[] = [];
    filteredBooks: Book[] = [];
    bookSearchTerm: string = '';
    selectedCategory: string = 'all';
    showAvailableOnly: boolean = false;
    sortBy: string = 'title';
    newBook = {
        title: '',
        author: '',
        isbn: '',
        category: '',
        description: '',
        coverUrl: '',
        availableCopies: 0,
        totalCopies: 0
    };
    isAddingBook: boolean = false;
    private bookSubscription: Subscription | null = null;
    isUploading: boolean = false;

    // Book Editing
    selectedBookForEdit: Book | null = null;
    editBookData = {
        title: '',
        author: '',
        isbn: '',
        category: '',
        description: '',
        coverUrl: '',
        availableCopies: 0,
        totalCopies: 0
    };
    isEditingBook: boolean = false;

    // Borrowing Management
    borrowRecords: BorrowRecord[] = [];
    private borrowSubscription: Subscription | null = null;

    // Stats
    totalEntriesToday: number = 0;
    currentlyInside: number = 0;
    lastEntryTime: Date | null = null;

    // Chart Data
    public hourlyChartData: any = {
        labels: [],
        datasets: []
    };
    public hourlyChartOptions: any = {
        responsive: true,
        plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)' }
        },
        scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#94a3b8' } },
            x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
        }
    };

    public purposeChartData: any = {
        labels: [],
        datasets: []
    };
    public purposeChartOptions: any = {
        responsive: true,
        plugins: {
            legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 20 } },
            tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)' }
        }
    };


    constructor(
        private libraryService: LibraryService,
        private auth: AuthService,
        public toastService: ToastService,
        private notificationService: NotificationService,
        private ngZone: NgZone,
        private cdr: ChangeDetectorRef,
        private route: ActivatedRoute,
        private router: Router
    ) { }

    ngOnInit() {
        console.log('AdminDashboard: Initializing and subscribing to entries...');

        // Restore view from query params
        this.route.queryParams.subscribe(params => {
            this.ngZone.run(() => {
                if (params['view']) {
                    this.activeView = params['view'];
                } else {
                    // Default to dashboard if no view param
                    this.activeView = 'dashboard';
                }
                this.cdr.detectChanges();
            });
        });

        // 1. Snapshot for Entries
        if (this.subscription) this.subscription.unsubscribe();

        const loadingTimeout = setTimeout(() => {
            if (this.isLoading) {
                console.warn('AdminDashboard: Data fetch timed out after 15s');
                this.ngZone.run(() => {
                    this.isLoading = false;
                });
            }
        }, 15000);

        this.subscription = this.libraryService.getEntries().subscribe({
            next: (data) => {
                this.ngZone.run(() => {
                    clearTimeout(loadingTimeout);
                    this.entries = data.map(e => ({
                        ...e,
                        timestamp: (e.timestamp && typeof (e.timestamp as any).toDate === 'function')
                            ? (e.timestamp as any).toDate()
                            : e.timestamp,
                        checkOutTimestamp: (e.checkOutTimestamp && typeof (e.checkOutTimestamp as any).toDate === 'function')
                            ? (e.checkOutTimestamp as any).toDate()
                            : e.checkOutTimestamp
                    }));
                    this.calculateStats();
                    this.updateCharts();
                    this.filterEntries();
                    this.isLoading = false;
                    this.cdr.detectChanges();
                });
            },
            error: (err) => {
                this.ngZone.run(() => {
                    clearTimeout(loadingTimeout);
                    console.error('AdminDashboard: Firestore subscription error:', err);
                    this.isLoading = false;
                });
            }
        });

        // 2. Snapshot for Students (New Directory Feature)
        if (this.studentSubscription) this.studentSubscription.unsubscribe();
        this.studentSubscription = this.libraryService.getStudents().subscribe({
            next: (data) => {
                this.ngZone.run(() => {
                    this.students = data;
                    this.cdr.detectChanges();
                });
            },
            error: (err) => console.error(err)
        });

        // 3. Snapshot for Books
        if (this.bookSubscription) this.bookSubscription.unsubscribe();
        this.bookSubscription = this.libraryService.getBooks().subscribe({
            next: (data) => {
                this.ngZone.run(() => {
                    this.books = data;
                    this.filterBooks(); // Apply filters when books are loaded

                    this.cdr.detectChanges();
                });
            },
            error: (err) => console.error(err)
        });

        // 4. Snapshot for Borrow Records
        if (this.borrowSubscription) this.borrowSubscription.unsubscribe();
        this.borrowSubscription = this.libraryService.getBorrowRecords().subscribe({
            next: (data) => {
                this.ngZone.run(() => {
                    this.borrowRecords = data;
                    this.cdr.detectChanges();
                });
            },
            error: (err) => console.error(err)
        });
    }

    ngOnDestroy() {
        if (this.subscription) this.subscription.unsubscribe();
        if (this.studentSubscription) this.studentSubscription.unsubscribe();
        if (this.bookSubscription) this.bookSubscription.unsubscribe();
        if (this.borrowSubscription) this.borrowSubscription.unsubscribe();
    }

    // Force Checkout
    async forceCheckout(entry: any) {
        if (!confirm(`Force checkout for ${entry.name}?`)) return;

        try {
            await this.libraryService.checkOut(entry.studentId);
            this.toastService.success(`Forced checkout for ${entry.name}`);
        } catch (err) {
            console.error(err);
            this.toastService.error('Failed to force checkout');
        }
    }

    // --- Student ID Logic ---

    viewQR(student: Student) {
        this.selectedStudent = student;
        this.qrValue = student.studentId;
        setTimeout(() => this.drawQR(), 50);
    }

    closeQRModal() {
        this.selectedStudent = null;
        this.qrValue = '';
    }

    async drawQR() {
        if (this.qrCanvas && this.qrValue) {
            try {
                await QRCode.toCanvas(this.qrCanvas.nativeElement, this.qrValue, {
                    width: 200,
                    margin: 2,
                    color: { dark: '#0f172a', light: '#ffffff' }
                });
            } catch (err) {
                console.error('QR Generation Error:', err);
            }
        }
    }

    downloadCard() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = 400;
        canvas.height = 600;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 400, 600);

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 400, 100);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('LIBRARY ACCESS', 200, 60);

        // QR
        if (this.qrCanvas) {
            ctx.drawImage(this.qrCanvas.nativeElement, 100, 150, 200, 200);
        }

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(this.selectedStudent?.fullName || '', 200, 400);

        ctx.fillStyle = '#64748b';
        ctx.font = '20px monospace';
        ctx.fillText(`ID: ${this.selectedStudent?.studentId}`, 200, 440);

        ctx.fillStyle = '#0ea5e9';
        ctx.fillRect(0, 580, 400, 20);

        const link = document.createElement('a');
        link.download = `ID-${this.selectedStudent?.studentId}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    // --- Existing Chart/Stats Logic ---

    calculateStats() {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        const todayEntries = this.entries.filter(e => {
            const entryTime = (e.timestamp instanceof Date) ? e.timestamp.getTime() : new Date(e.timestamp).getTime();
            return entryTime >= startOfToday;
        });

        this.totalEntriesToday = todayEntries.length;
        this.currentlyInside = this.entries.filter(e => !e.checkOutTimestamp).length;

        if (this.entries.length > 0) {
            this.lastEntryTime = (this.entries[0].timestamp instanceof Date)
                ? this.entries[0].timestamp
                : new Date(this.entries[0].timestamp);
        }
    }

    updateCharts() {
        const now = new Date();
        const todayStr = now.toDateString();
        const hourlyCounts = new Array(24).fill(0);
        const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);

        this.entries.forEach(e => {
            const date = (e.timestamp instanceof Date) ? e.timestamp : new Date(e.timestamp);
            if (date.toDateString() === todayStr) {
                hourlyCounts[date.getHours()]++;
            }
        });

        this.hourlyChartData = {
            labels: labels.slice(6, 22), // Show 6 AM to 10 PM
            datasets: [{
                data: hourlyCounts.slice(6, 22),
                label: 'Visitors',
                backgroundColor: (context: any) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
                    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.8)');
                    gradient.addColorStop(1, 'rgba(56, 189, 248, 0.1)');
                    return gradient;
                },
                borderColor: '#38bdf8',
                borderWidth: 2,
                borderRadius: 8,
                fill: true,
                tension: 0.4
            }]
        };

        this.hourlyChartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#e2e8f0',
                    bodyColor: '#e2e8f0',
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(148, 163, 184, 0.1)' },
                    ticks: { color: '#94a3b8', font: { size: 11 } },
                    border: { display: false }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 11 } },
                    border: { display: false }
                }
            }
        };

        // 2. Purpose Distribution Chart
        const purposeMap: { [key: string]: number } = {};
        this.entries.forEach(e => {
            const p = e.purpose || 'Study';
            purposeMap[p] = (purposeMap[p] || 0) + 1;
        });

        this.purposeChartData = {
            labels: Object.keys(purposeMap),
            datasets: [{
                data: Object.values(purposeMap),
                backgroundColor: [
                    '#38bdf8', // Sky
                    '#10b981', // Emerald
                    '#818cf8', // Indigo
                    '#f43f5e', // Rose
                    '#fbbf24'  // Amber
                ],
                borderWidth: 0,
                hoverOffset: 15
            }]
        };

        this.purposeChartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#94a3b8', padding: 20, font: { size: 12 } }
                }
            },
            cutout: '70%'
        };
    }

    getDuration(entry: any): string {
        if (!entry.checkOutTimestamp || !entry.timestamp) return 'Active';

        const start = entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp);
        const end = entry.checkOutTimestamp instanceof Date ? entry.checkOutTimestamp : new Date(entry.checkOutTimestamp);
        const diffMs = end.getTime() - start.getTime();

        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);

        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }

    onLogout() {
        this.auth.logout();
        this.router.navigate(['/login']);
    }

    downloadCSV() {
        if (this.entries.length === 0) return;

        const headers = ['Full Name', 'ID', 'Purpose', 'Check-In', 'Check-Out'];
        const rows = this.entries.map(e => [
            e.name,
            e.studentId,
            e.purpose || 'N/A',
            e.timestamp ? new Date(e.timestamp).toLocaleString() : '',
            e.checkOutTimestamp ? new Date(e.checkOutTimestamp).toLocaleString() : 'N/A'
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `library_logs_${new Date().toLocaleDateString()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    filterEntries() {
        if (!this.searchTerm) {
            this.filteredEntries = this.entries;
        } else {
            const term = this.searchTerm.toLowerCase();
            this.filteredEntries = this.entries.filter(e =>
                e.name.toLowerCase().includes(term) ||
                e.studentId.toLowerCase().includes(term)
            );
        }
    }

    // Image Upload Method
    async onFileSelected(event: any, isEdit: boolean = false) {
        const file = event.target.files[0];
        if (!file) return;

        // Basic validation
        if (!file.type.match(/image\/*/)) {
            this.toastService.error('Only image files are allowed');
            return;
        }

        if (file.size > 2 * 1024 * 1024) { // 2MB limit
            this.toastService.error('File size exceeds 2MB limit');
            return;
        }

        this.isUploading = true;
        try {
            const url = await this.libraryService.uploadBookCover(file);
            if (isEdit) {
                this.editBookData.coverUrl = url;
            } else {
                this.newBook.coverUrl = url;
            }
            this.toastService.success('Cover image uploaded successfully');
        } catch (err: any) {
            this.toastService.error(err.message || 'Failed to upload image');
            console.error(err);
        } finally {
            this.isUploading = false;
        }
    }

    // Book Management Methods
    async addNewBook() {
        // Validate required fields
        if (!this.newBook.title || !this.newBook.author || !this.newBook.category) {
            this.toastService.warning('Please fill in all required fields (Title, Author, Category)');
            return;
        }

        // Validate total copies
        if (this.newBook.totalCopies <= 0) {
            this.toastService.warning('Total Copies must be greater than 0');
            return;
        }

        // Validate available copies
        if (this.newBook.availableCopies < 0) {
            this.toastService.warning('Available Copies cannot be negative');
            return;
        }

        // Validate available <= total
        if (this.newBook.availableCopies > this.newBook.totalCopies) {
            this.toastService.warning(`Available Copies (${this.newBook.availableCopies}) cannot exceed Total Copies (${this.newBook.totalCopies})`);
            return;
        }

        this.isAddingBook = true;
        try {
            await this.libraryService.addBook(this.newBook);
            this.toastService.success('Book added successfully!');
            // Reset form
            this.newBook = {
                title: '',
                author: '',
                isbn: '',
                category: '',
                description: '',
                coverUrl: '',
                availableCopies: 0,
                totalCopies: 0
            };
        } catch (err) {
            console.error('Error adding book:', err);
            this.toastService.error('Failed to add book. Please try again.');
        } finally {
            this.isAddingBook = false;
        }
    }

    editBook(book: Book) {
        this.selectedBookForEdit = book;
        this.editBookData = {
            title: book.title,
            author: book.author,
            isbn: book.isbn || '',
            category: book.category,
            description: book.description,
            coverUrl: book.coverUrl || '',
            availableCopies: book.availableCopies,
            totalCopies: book.totalCopies
        };
    }

    closeEditModal() {
        this.selectedBookForEdit = null;
    }

    async updateBookData() {
        if (!this.selectedBookForEdit?.id) return;

        // Validate required fields
        if (!this.editBookData.title || !this.editBookData.author || !this.editBookData.category) {
            this.toastService.warning('Please fill in all required fields (Title, Author, Category)');
            return;
        }

        // Validate total copies
        if (this.editBookData.totalCopies <= 0) {
            this.toastService.warning('Total Copies must be greater than 0');
            return;
        }

        // Validate available copies
        if (this.editBookData.availableCopies < 0) {
            this.toastService.warning('Available Copies cannot be negative');
            return;
        }

        // Validate available <= total
        if (this.editBookData.availableCopies > this.editBookData.totalCopies) {
            this.toastService.warning(`Available Copies (${this.editBookData.availableCopies}) cannot exceed Total Copies (${this.editBookData.totalCopies})`);
            return;
        }

        this.isEditingBook = true;
        try {
            await this.libraryService.updateBook(this.selectedBookForEdit.id, this.editBookData);
            this.toastService.success('Book updated successfully!');
            this.closeEditModal();
        } catch (err) {
            console.error('Error updating book:', err);
            this.toastService.error('Failed to update book');
        } finally {
            this.isEditingBook = false;
        }
    }

    async deleteBook(book: Book) {
        if (!book.id) return;
        const confirmed = confirm(`Are you sure you want to delete "${book.title}"?`);
        if (!confirmed) return;

        try {
            await this.libraryService.deleteBook(book.id);
            this.toastService.success('Book deleted successfully');
        } catch (err) {
            console.error('Error deleting book:', err);
            this.toastService.error('Failed to delete book');
        }
    }

    // Borrowing Management Methods
    async approveBorrowRequest(borrow: BorrowRecord) {
        if (!borrow.id) return;
        try {
            await this.libraryService.approveBorrow(borrow.id, borrow.bookId);
            this.toastService.success('Borrow request approved');

            // Notify Student
            await this.notificationService.addNotification({
                studentId: borrow.studentId,
                title: 'Borrow Request Approved',
                message: `Your request for "${borrow.bookTitle}" has been approved. Please collect your book.`,
                type: 'success',
                relatedBookId: borrow.bookId
            });

        } catch (err) {
            console.error('Error approving borrow:', err);
            this.toastService.error('Failed to approve borrow request');
        }
    }

    async rejectBorrowRequest(borrow: BorrowRecord) {
        if (!borrow.id) return;
        const reason = prompt('Rejection reason (optional):');
        try {
            await this.libraryService.rejectBorrow(borrow.id, reason || undefined);
            this.toastService.info('Borrow request rejected');

            // Notify Student
            await this.notificationService.addNotification({
                studentId: borrow.studentId,
                title: 'Borrow Request Rejected',
                message: `Your request for "${borrow.bookTitle}" was rejected. Reason: ${reason || 'Not specified'}`,
                type: 'error',
                relatedBookId: borrow.bookId
            });

        } catch (err) {
            console.error('Error rejecting borrow:', err);
            this.toastService.error('Failed to reject borrow request');
        }
    }

    async markAsReturned(borrow: BorrowRecord) {
        if (!borrow.id) return;
        const confirmed = confirm(`Mark "${borrow.bookTitle}" as returned?`);
        if (!confirmed) return;

        try {
            await this.libraryService.returnBook(borrow.id, borrow.bookId);
            this.toastService.success('Book marked as returned');

            // Notify Student
            await this.notificationService.addNotification({
                studentId: borrow.studentId,
                title: 'Book Returned',
                message: `You have successfully returned "${borrow.bookTitle}". Thank you!`,
                type: 'info',
                relatedBookId: borrow.bookId
            });

        } catch (err) {
            console.error('Error marking as returned:', err);
            this.toastService.error('Failed to mark book as returned');
        }
    }


    getPendingBorrows(): BorrowRecord[] {
        return this.borrowRecords.filter(b => b.status === 'pending');
    }

    getApprovedBorrows(): BorrowRecord[] {
        return this.borrowRecords.filter(b => b.status === 'approved' || b.status === 'lost');
    }

    isOverdue(borrow: BorrowRecord): boolean {
        if (!borrow.dueDate) return false;
        const due = borrow.dueDate instanceof Date ? borrow.dueDate : new Date(borrow.dueDate);
        return due.getTime() < new Date().getTime();
    }

    getDaysOverdue(borrow: BorrowRecord): number {
        if (!borrow.dueDate) return 0;
        const due = borrow.dueDate instanceof Date ? borrow.dueDate : new Date(borrow.dueDate);
        const diff = new Date().getTime() - due.getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    async sendOverdueReminder(borrow: BorrowRecord) {
        if (!borrow.studentId || !borrow.bookTitle) return;

        try {
            await this.notificationService.addNotification({
                studentId: borrow.studentId,
                title: 'Overdue Book Reminder',
                message: `Please return "${borrow.bookTitle}" as soon as possible. It is overdue.`,
                type: 'warning',
                relatedBookId: borrow.bookId
            });
            this.toastService.success(`Reminder sent to ${borrow.studentName}`);
        } catch (err) {
            console.error(err);
            this.toastService.error('Failed to send reminder');
        }
    }

    setActiveView(view: string) {
        this.activeView = view;
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { view: view },
            queryParamsHandling: 'merge'
        });
    }

    // Mobile Menu State
    isMobileMenuOpen: boolean = false;
    isProfileMenuOpen: boolean = false;

    toggleMobileMenu() {
        this.isMobileMenuOpen = !this.isMobileMenuOpen;
    }

    toggleProfileMenu() {
        this.isProfileMenuOpen = !this.isProfileMenuOpen;
    }

    // Book Search and Filter Methods
    filterBooks() {
        let filtered = [...this.books];

        // Apply search filter
        if (this.bookSearchTerm.trim()) {
            const searchLower = this.bookSearchTerm.toLowerCase();
            filtered = filtered.filter(book =>
                book.title.toLowerCase().includes(searchLower) ||
                book.author.toLowerCase().includes(searchLower) ||
                (book.isbn && book.isbn.toLowerCase().includes(searchLower)) ||
                book.category.toLowerCase().includes(searchLower)
            );
        }

        // Apply category filter
        if (this.selectedCategory !== 'all') {
            filtered = filtered.filter(book => book.category === this.selectedCategory);
        }

        // Apply availability filter
        if (this.showAvailableOnly) {
            filtered = filtered.filter(book => book.availableCopies > 0);
        }

        // Apply sort
        filtered.sort((a, b) => {
            if (this.sortBy === 'title') {
                return a.title.localeCompare(b.title);
            } else if (this.sortBy === 'author') {
                return a.author.localeCompare(b.author);
            } else if (this.sortBy === 'date') {
                const dateA = new Date(a.addedAt).getTime();
                const dateB = new Date(b.addedAt).getTime();
                return dateB - dateA;
            }
            return 0;
        });

        this.filteredBooks = filtered;
    }

    getUniqueCategories(): string[] {
        const categories = this.books.map(book => book.category).filter(cat => cat);
        return Array.from(new Set(categories)).sort();
    }

    // Fine Management Methods
    async markBookAsLost(borrow: BorrowRecord) {
        if (!borrow.id) return;

        const penaltyStr = prompt('Enter penalty amount (₱):');
        if (!penaltyStr) return; // User cancelled

        const penalty = parseFloat(penaltyStr);
        if (isNaN(penalty) || penalty <= 0) {
            this.toastService.error('Invalid penalty amount');
            return;
        }

        const confirmed = confirm(`Mark "${borrow.bookTitle}" as LOST with ₱${penalty.toFixed(2)} penalty?`);
        if (!confirmed) return;

        try {
            await this.libraryService.markBookAsLost(borrow.id, penalty);
            this.toastService.success(`Book marked as lost. Penalty: ₱${penalty.toFixed(2)}`);

            // Notify Student
            await this.notificationService.addNotification({
                studentId: borrow.studentId,
                title: 'Book Marked as Lost',
                message: `The book "${borrow.bookTitle}" has been marked as lost. You have been charged a penalty of ₱${penalty.toFixed(2)}. Please visit the library office to settle this.`,
                type: 'error',
                relatedBookId: borrow.bookId
            });
        } catch (err) {
            console.error('Error marking book as lost:', err);
            this.toastService.error('Failed to mark book as lost');
        }
    }

    async markFineAsPaid(borrow: BorrowRecord) {
        if (!borrow.id) return;

        const fineAmount = borrow.fineAmount || borrow.lostPenalty || 0;
        const confirmed = confirm(`Mark fine of ₱${fineAmount.toFixed(2)} as PAID for "${borrow.bookTitle}"?`);
        if (!confirmed) return;

        try {
            await this.libraryService.markFineAsPaid(borrow.id);
            this.toastService.success('Fine marked as paid');

            // Notify Student
            await this.notificationService.addNotification({
                studentId: borrow.studentId,
                title: 'Fine Payment Confirmed',
                message: `Your fine of ₱${fineAmount.toFixed(2)} for "${borrow.bookTitle}" has been recorded as paid. Thank you!`,
                type: 'success',
                relatedBookId: borrow.bookId
            });
        } catch (err) {
            console.error('Error marking fine as paid:', err);
            this.toastService.error('Failed to mark fine as paid');
        }
    }

    getBorrowsWithFines(): BorrowRecord[] {
        return this.borrowRecords.filter(b =>
            (b.isOverdue && b.fineAmount && b.fineAmount > 0) ||
            (b.status === 'lost' && b.lostPenalty && b.lostPenalty > 0)
        );
    }

    getUnpaidFines(): BorrowRecord[] {
        return this.borrowRecords.filter(b => b.fineStatus === 'unpaid');
    }

    getTotalUnpaidFines(): number {
        return this.getUnpaidFines().reduce((sum, b) => {
            return sum + (b.fineAmount || 0) + (b.lostPenalty || 0);
        }, 0);
    }


}
