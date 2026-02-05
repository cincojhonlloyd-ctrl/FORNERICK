import { Component, ViewChild, ElementRef, AfterViewChecked, OnInit, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { LibraryService, Student } from '../../services/library';
import { Subscription } from 'rxjs';
import * as QRCode from 'qrcode';

@Component({
    selector: 'app-student-id',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './student-id.component.html',
    styleUrls: ['./student-id.component.css']
})
export class StudentIdComponent implements AfterViewChecked, OnInit, OnDestroy {
    @ViewChild('qrCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

    // Form Data
    studentName: string = '';
    studentId: string = '';

    // State
    qrValue: string = '';
    students: Student[] = [];
    private lastDrawnValue: string = '';
    isSubmitting: boolean = false;
    successMessage: string = '';
    private subscription: Subscription | null = null;

    constructor(
        private libraryService: LibraryService,
        private ngZone: NgZone,
        private cdr: ChangeDetectorRef
    ) { }

    ngOnInit() {
        this.subscription = this.libraryService.getStudents().subscribe({
            next: (data) => {
                this.ngZone.run(() => {
                    console.log(`StudentIdComponent: Received ${data.length} students`);
                    this.students = data;
                    this.cdr.detectChanges();
                });
            },
            error: (err) => console.error('Error fetching students:', err)
        });
    }

    ngOnDestroy() {
        if (this.subscription) this.subscription.unsubscribe();
    }

    ngAfterViewChecked() {
        if (this.qrValue && this.qrValue !== this.lastDrawnValue) {
            this.drawQR();
        }
    }

    validateNumberInput(event: any) {
        const input = event.target as HTMLInputElement;
        const value = input.value;
        const numericValue = value.replace(/[^0-9]/g, '');

        if (value !== numericValue) {
            input.value = numericValue;
            this.studentId = numericValue;
        }
    }

    async onRegister() {
        if (!this.studentName || !this.studentId) return;

        this.isSubmitting = true;
        this.successMessage = '';

        try {
            await this.libraryService.addStudent({
                fullName: this.studentName,
                studentId: this.studentId
            });

            // Generate QR for the newly registered student
            this.generateQR();
            this.successMessage = `Registered ${this.studentName} successfully!`;

            // Clear form but keep QR
            // Optional: this.studentName = ''; this.studentId = '';
        } catch (error) {
            console.error('Registration failed:', error);
        } finally {
            this.isSubmitting = false;
        }
    }

    async drawQR() {
        if (this.canvasRef && this.qrValue) {
            try {
                await QRCode.toCanvas(this.canvasRef.nativeElement, this.qrValue, {
                    width: 200,
                    margin: 1,
                    color: {
                        dark: '#0f172a',
                        light: '#ffffff'
                    }
                });
                this.lastDrawnValue = this.qrValue;
            } catch (err) {
                console.error('QR Generation Error:', err);
            }
        }
    }

    generateQR() {
        // Just the ID is enough for the scanner to look up the student
        // The CheckInComponent uses `getLatestEntry(code)`. 
        // If code is studentId, it works.
        this.qrValue = this.studentId;
    }

    downloadCard() {
        if (this.canvasRef) {
            const link = document.createElement('a');
            link.download = `ID_${this.studentId}.png`;
            link.href = this.canvasRef.nativeElement.toDataURL('image/png');
            link.click();
        }
    }

    viewQR(student: Student) {
        this.studentName = student.fullName;
        this.studentId = student.studentId;
        this.generateQR();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}
