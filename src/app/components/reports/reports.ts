import { Component, OnInit, NgZone, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { LibraryService, Book, BorrowRecord } from '../../services/library';
import { AuthService } from '../../services/auth';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, registerables } from 'chart.js';
import { Subscription } from 'rxjs';

Chart.register(...registerables);

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, BaseChartDirective],
  templateUrl: './reports.html',
  styleUrls: ['./reports.css']
})
export class ReportsComponent implements OnInit, OnDestroy {
  startDate: string = '';
  endDate: string = '';
  isLoading: boolean = false;

  entries: any[] = [];
  books: Book[] = [];
  borrowRecords: BorrowRecord[] = [];

  private subs: Subscription = new Subscription();

  // Mobile Menu
  isMobileMenuOpen: boolean = false;

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  isProfileMenuOpen: boolean = false;
  toggleProfileMenu() {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  // Stats
  totalVisits: number = 0;
  uniqueStudents: number = 0;
  avgDuration: string = '--';
  busiestDay: string = '--';

  // Entry Charts
  public trendChartData: any = { labels: [], datasets: [] };
  public trendChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } }
  };

  public peakHourChartData: any = { labels: [], datasets: [] };
  public peakHourChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } }
  };

  // Book Charts
  public topBooksChartData: any = { labels: [], datasets: [] };
  public categoryChartData: any = { labels: [], datasets: [] };
  public borrowTrendChartData: any = { labels: [], datasets: [] };

  // Visit purpose distribution (for visit purposes requirement)
  public purposeChartData: any = { labels: [], datasets: [] };

  public barChartOptions: any = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)' }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(0, 0, 0, 0.1)' }, ticks: { stepSize: 1 } },
      x: { grid: { display: false } }
    }
  };

  public doughnutChartOptions: any = {
    responsive: true,
    plugins: {
      legend: { position: 'right', labels: { padding: 20 } }
    }
  };

  constructor(
    private libraryService: LibraryService,
    private auth: AuthService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);

    this.endDate = today.toISOString().split('T')[0];
    this.startDate = lastWeek.toISOString().split('T')[0];
  }

  ngOnInit() {
    this.generateReport();
    this.loadLibraryData();
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  onLogout() {
    this.auth.logout();
  }

  loadLibraryData() {
    this.subs.add(
      this.libraryService.getBooks().subscribe(books => {
        this.books = books;
        this.calculateCategoryStats();
        this.cdr.detectChanges();
      })
    );

    this.subs.add(
      this.libraryService.getBorrowRecords().subscribe(records => {
        this.borrowRecords = records;
        this.calculateTopBooks();
        this.calculateBorrowTrends();
        this.cdr.detectChanges();
      })
    );
  }

  generateReport() {
    this.isLoading = true;
    this.subs.add(
      this.libraryService.getEntries().subscribe(data => {
        this.ngZone.run(() => {
          const start = new Date(this.startDate);
          const end = new Date(this.endDate);
          end.setHours(23, 59, 59, 999);

          this.entries = data.map(e => ({
            ...e,
            timestamp: (e.timestamp && typeof (e.timestamp as any).toDate === 'function') ? (e.timestamp as any).toDate() : new Date(e.timestamp as any),
            checkOutTimestamp: (e.checkOutTimestamp && typeof (e.checkOutTimestamp as any).toDate === 'function') ? (e.checkOutTimestamp as any).toDate() : (e.checkOutTimestamp ? new Date(e.checkOutTimestamp as any) : null)
          })).filter(e => {
            const t = e.timestamp.getTime();
            return t >= start.getTime() && t <= end.getTime();
          });

          this.calculateStats();
          this.updateCharts();
          this.isLoading = false;
          this.cdr.detectChanges();
        });
      })
    );
  }

  calculateStats() {
    this.totalVisits = this.entries.length;
    this.uniqueStudents = new Set(this.entries.map(e => e.studentId)).size;

    // Avg Duration
    let totalMs = 0;
    let count = 0;
    this.entries.forEach(e => {
      if (e.checkOutTimestamp) {
        totalMs += (e.checkOutTimestamp.getTime() - e.timestamp.getTime());
        count++;
      }
    });
    if (count > 0) {
      const avgMs = totalMs / count;
      const mins = Math.round(avgMs / 60000);
      this.avgDuration = `${mins} mins`;
    } else {
      this.avgDuration = '0 mins';
    }

    // Busiest Day
    const dayCounts: { [key: string]: number } = {};
    this.entries.forEach(e => {
      const day = e.timestamp.toLocaleDateString('en-US', { weekday: 'long' });
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });
    let max = 0;
    let day = 'N/A';
    for (const d in dayCounts) {
      if (dayCounts[d] > max) {
        max = dayCounts[d];
        day = d;
      }
    }
    this.busiestDay = day;
  }

  updateCharts() {
    // Trend Chart (Visits per Day)
    const dateMap: { [key: string]: number } = {};
    let curr = new Date(this.startDate);
    const end = new Date(this.endDate);
    while (curr <= end) {
      dateMap[curr.toISOString().split('T')[0]] = 0;
      curr.setDate(curr.getDate() + 1);
    }

    this.entries.forEach(e => {
      const k = e.timestamp.toISOString().split('T')[0];
      if (dateMap[k] !== undefined) dateMap[k]++;
    });

    this.trendChartData = {
      labels: Object.keys(dateMap).map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
      datasets: [{
        label: 'Visits',
        data: Object.values(dateMap),
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        fill: true,
        tension: 0.4
      }]
    };

    // Peak Hours Chart
    const hours = new Array(24).fill(0);
    this.entries.forEach(e => {
      hours[e.timestamp.getHours()]++;
    });
    const labels = [];
    const data = [];
    for (let i = 6; i <= 22; i++) {
      labels.push(`${i}:00`);
      data.push(hours[i]);
    }

    this.peakHourChartData = {
      labels: labels,
      datasets: [{
        label: 'Visits',
        data: data,
        backgroundColor: '#8b5cf6',
        borderRadius: 4
      }]
    };

    // Visit Purpose Distribution (within selected range)
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
          '#fbbf24', // Amber
          '#a78bfa'  // Violet
        ],
        borderWidth: 0,
        hoverOffset: 15
      }]
    };
  }

  calculateTopBooks() {
    if (!this.borrowRecords.length) return;

    const bookCounts: { [key: string]: number } = {};
    this.borrowRecords.forEach(record => {
      bookCounts[record.bookTitle] = (bookCounts[record.bookTitle] || 0) + 1;
    });

    const sortedBooks = Object.entries(bookCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    this.topBooksChartData = {
      labels: sortedBooks.map(([title]) => title),
      datasets: [{
        data: sortedBooks.map(([, count]) => count),
        backgroundColor: '#38bdf8',
        borderRadius: 8,
        barThickness: 20
      }]
    };
  }

  calculateCategoryStats() {
    if (!this.books.length) return;

    const categoryCounts: { [key: string]: number } = {};
    this.books.forEach(book => {
      const cat = book.category || 'Uncategorized';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    this.categoryChartData = {
      labels: Object.keys(categoryCounts),
      datasets: [{
        data: Object.values(categoryCounts),
        backgroundColor: [
          '#38bdf8', '#10b981', '#818cf8', '#f43f5e', '#fbbf24', '#a78bfa'
        ],
        borderWidth: 0,
        hoverOffset: 15
      }]
    };
  }

  calculateBorrowTrends() {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    const dailyCounts = last7Days.map(date => {
      return this.borrowRecords.filter(r => {
        if (!r.borrowDate) return false;
        // Handle Firestore Timestamp or Date object
        const borrowDate = (r.borrowDate as any).toDate ? (r.borrowDate as any).toDate() : new Date(r.borrowDate);
        return borrowDate.toISOString().split('T')[0] === date;
      }).length;
    });

    this.borrowTrendChartData = {
      labels: last7Days.map(d => {
        const [year, month, day] = d.split('-');
        return `${month}/${day}`;
      }),
      datasets: [{
        label: 'Borrows',
        data: dailyCounts,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4
      }]
    };
  }
}
