import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { LibraryService } from '../../services/library';
import { AuthService } from '../../services/auth';
import { Subscription } from 'rxjs';
import * as QRCode from 'qrcode';
import { Router } from '@angular/router';

@Component({
    selector: 'app-check-in',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule],
    templateUrl: './check-in.component.html',
    styleUrls: ['./check-in.component.css']
})
export class CheckInComponent implements OnInit, OnDestroy, AfterViewInit {
    // Forms
    checkInForm: FormGroup;
    registerForm: FormGroup;
    adminForm: FormGroup;

    // State
    successMessage: string = '';
    errorMessage: string = '';
    isLoading: boolean = false;
    entriesCount: number = 0;
    private subscription: Subscription | null = null;

    // UI Role & Mode
    userRole: 'student' | 'admin' = 'student';
    currentMode: 'scan' | 'manual' | 'register' = 'scan';
    isScanning: boolean = true;
    scanValue: string = '';

    // Registration Vars
    generatedStudentId: string = '';
    generatedName: string = '';
    generatedPhotoUrl: string = '';
    qrValue: string = '';
    isUploadingPhoto: boolean = false;
    @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLCanvasElement>;

    constructor(
        private fb: FormBuilder,
        private libraryService: LibraryService,
        private authService: AuthService,
        private router: Router
    ) {
        // Student: Check-in Form
        this.checkInForm = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(2)]],
            studentId: ['', [Validators.required, Validators.pattern(/^[0-9]*$/), Validators.minLength(3)]],
            purpose: ['Study', [Validators.required]]
        });

        // Student: Registration Form
        this.registerForm = this.fb.group({
            fullName: ['', [Validators.required, Validators.minLength(2)]],
            studentId: ['', [Validators.required, Validators.pattern(/^[0-9]*$/), Validators.minLength(3)]],
            pronouns: [''] // Optional field
        });

        // Admin: Login Form
        this.adminForm = this.fb.group({
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(6)]]
        });
    }

    ngOnInit() {
        this.subscription = this.libraryService.getEntries().subscribe(entries => {
            this.entriesCount = entries.filter(e => !e.checkOutTimestamp).length;
        });
    }

    ngAfterViewInit() {
        if (this.currentMode === 'scan' && this.userRole === 'student') {
            this.focusScanInput();
        }
    }

    ngOnDestroy() {
        if (this.subscription) {
            this.subscription.unsubscribe();
        }
    }

    // Role Switcher
    setRole(role: 'student' | 'admin') {
        this.userRole = role;
        this.successMessage = '';
        this.errorMessage = '';

        if (role === 'student' && this.currentMode === 'scan') {
            setTimeout(() => this.focusScanInput(), 100);
        }
    }

    setMode(mode: 'scan' | 'manual' | 'register') {
        this.currentMode = mode;
        this.isScanning = (mode === 'scan');
        this.successMessage = '';
        this.errorMessage = '';
        this.scanValue = '';

        if (mode === 'scan') {
            setTimeout(() => this.focusScanInput(), 100);
        }
    }

    focusScanInput() {
        const input = document.getElementById('qrInput');
        if (input) input.focus();
    }

    // Input Validator for Numbers Only
    validateNumberInput(event: any, controlName: string, isRegister: boolean = false) {
        const input = event.target as HTMLInputElement;
        const value = input.value;
        const numericValue = value.replace(/[^0-9]/g, '');

        if (value !== numericValue) {
            input.value = numericValue;
            // Update the form control value
            if (isRegister) {
                this.registerForm.get(controlName)?.setValue(numericValue);
            } else {
                this.checkInForm.get(controlName)?.setValue(numericValue);
            }
        }
    }

    // Student Submit
    onSubmit() {
        if (this.checkInForm.valid) {
            const { name, studentId, purpose } = this.checkInForm.value;
            this.processEntry(name, studentId, purpose);
        } else {
            this.errorMessage = 'Please fix the errors above.';
            this.checkInForm.markAllAsTouched();
        }
    }

    // Admin Submit
    async onAdminLogin() {
        if (this.adminForm.valid) {
            this.isLoading = true;
            this.errorMessage = '';
            const { email, password } = this.adminForm.value;

            try {
                await this.authService.login(email, password);
                this.router.navigate(['/admin']);
            } catch (err: any) {
                this.errorMessage = err.message || 'Invalid email or password';
                this.isLoading = false;
            }
        }
    }

    // Photo Upload Handler
    async onPhotoSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.match(/image\/(png|jpeg|jpg|gif)/)) {
            this.errorMessage = 'Only image files are allowed';
            event.target.value = ''; // Reset input
            return;
        }

        // Validate file size (5MB limit for original)
        if (file.size > 5 * 1024 * 1024) {
            this.errorMessage = 'File size exceeds 5MB limit';
            event.target.value = ''; // Reset input
            return;
        }

        this.isUploadingPhoto = true;
        this.errorMessage = '';
        this.successMessage = '';

        try {
            // Add timeout for upload (30 seconds)
            const uploadPromise = (async () => {
                const resizedFile = await this.resizeImage(file, 300, 300);
                return await this.libraryService.uploadStudentPhoto(resizedFile);
            })();

            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Upload timeout - please try again')), 30000);
            });

            const url = await Promise.race([uploadPromise, timeoutPromise]);
            this.generatedPhotoUrl = url;
            this.successMessage = 'Photo uploaded successfully!';
        } catch (err: any) {
            this.errorMessage = err.message || 'Failed to upload photo';
            this.generatedPhotoUrl = ''; // Clear any partial upload
            event.target.value = ''; // Reset file input
        } finally {
            this.isUploadingPhoto = false;
        }
    }

    // Resize image to reduce file size and speed up upload
    private resizeImage(file: File, maxWidth: number, maxHeight: number): Promise<File> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Calculate new dimensions while maintaining aspect ratio
                    if (width > height) {
                        if (width > maxWidth) {
                            height = height * (maxWidth / width);
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width = width * (maxHeight / height);
                            height = maxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d')!;
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (blob) {
                            const resizedFile = new File([blob], file.name, {
                                type: 'image/jpeg',
                                lastModified: Date.now()
                            });
                            resolve(resizedFile);
                        } else {
                            reject(new Error('Failed to resize image'));
                        }
                    }, 'image/jpeg', 0.85); // 85% quality for good balance
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    // Registration
    async onRegister() {
        if (this.registerForm.valid) {
            this.isLoading = true;
            const { fullName, studentId, pronouns } = this.registerForm.value;

            try {
                const studentData: any = {
                    fullName,
                    studentId,
                    email: `${studentId}@school.edu`
                };

                // Only add pronouns if selected
                if (pronouns) {
                    studentData.pronouns = pronouns;
                }

                // Only add photoUrl if a photo was uploaded
                if (this.generatedPhotoUrl) {
                    studentData.photoUrl = this.generatedPhotoUrl;
                }

                await this.libraryService.addStudent(studentData);

                this.generatedName = fullName;
                this.generatedStudentId = studentId;
                this.qrValue = studentId;

                this.successMessage = 'Student Registered Successfully!';
                this.registerForm.reset();
                this.generatedPhotoUrl = ''; // Reset photo
                setTimeout(() => this.generateQR(), 50);

            } catch (err: any) {
                this.errorMessage = 'Registration failed: ' + err.message;
            } finally {
                this.isLoading = false;
            }
        }
    }

    async generateQR() {
        if (!this.qrCanvas) return;
        try {
            await QRCode.toCanvas(this.qrCanvas.nativeElement, this.qrValue, {
                width: 200,
                margin: 2,
                color: { dark: '#0f172a', light: '#ffffff' }
            });
        } catch (err) {
            console.error(err);
        }
    }

    downloadCard() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        // Larger size for better quality (500x300)
        canvas.width = 500;
        canvas.height = 300;

        // Background with subtle gradient
        const bgGradient = ctx.createLinearGradient(0, 0, 0, 300);
        bgGradient.addColorStop(0, '#ffffff');
        bgGradient.addColorStop(1, '#f8fafc');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, 500, 300);

        // Add subtle border
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, 498, 298);

        // Blue Header with gradient
        const headerGradient = ctx.createLinearGradient(0, 0, 500, 0);
        headerGradient.addColorStop(0, '#0066CC');
        headerGradient.addColorStop(1, '#0088FF');
        ctx.fillStyle = headerGradient;
        ctx.fillRect(0, 0, 500, 50);

        // Header text with shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('LIBRARY SYSTEM', 250, 32);
        ctx.shadowColor = 'transparent';

        // Draw student photo if available
        if (this.generatedPhotoUrl) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                // Photo with rounded corners and border - enhanced quality
                const x = 20, y = 70, w = 110, h = 143, r = 8;

                // Enable high-quality image smoothing
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // Calculate smart crop to maintain aspect ratio (cover style)
                const imgAspect = img.width / img.height;
                const boxAspect = w / h;
                let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;

                if (imgAspect > boxAspect) {
                    // Image is wider - crop sides
                    sWidth = img.height * boxAspect;
                    sx = (img.width - sWidth) / 2;
                } else {
                    // Image is taller - crop top/bottom
                    sHeight = img.width / boxAspect;
                    sy = (img.height - sHeight) / 2;
                }

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + w - r, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                ctx.lineTo(x + w, y + h - r);
                ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                ctx.lineTo(x + r, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                ctx.lineTo(x, y + r);
                ctx.quadraticCurveTo(x, y, x + r, y);
                ctx.closePath();
                ctx.clip();

                // Draw with smart crop for perfect fit
                ctx.drawImage(img, sx, sy, sWidth, sHeight, 20, 70, 110, 143);
                ctx.restore();

                // Photo border
                ctx.strokeStyle = '#cbd5e1';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + w - r, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                ctx.lineTo(x + w, y + h - r);
                ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                ctx.lineTo(x + r, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                ctx.lineTo(x, y + r);
                ctx.quadraticCurveTo(x, y, x + r, y);
                ctx.closePath();
                ctx.stroke();

                this.drawRestOfCard(ctx, canvas);
            };
            img.src = this.generatedPhotoUrl;
        } else {
            // Placeholder with rounded corners
            const x = 20, y = 70, w = 110, h = 143, r = 8;
            ctx.fillStyle = '#f1f5f9';
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#94a3b8';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('PHOTO', 75, 135);
            ctx.font = '10px sans-serif';
            ctx.fillText('W=1 X H=1.3 in', 75, 150);
            this.drawRestOfCard(ctx, canvas);
        }
    }

    drawRestOfCard(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
        // Right side info panel with enhanced design
        const startX = 150;
        const startY = 70;
        const boxWidth = 330;
        const boxHeight = 30;
        const spacing = 10;
        const radius = 6;

        // Helper function to draw rounded info box with gradient
        const drawInfoBox = (label: string, value: string, y: number) => {
            // Label box with gradient
            const labelGradient = ctx.createLinearGradient(startX, y, startX, y + boxHeight);
            labelGradient.addColorStop(0, '#0066CC');
            labelGradient.addColorStop(1, '#0055AA');
            ctx.fillStyle = labelGradient;

            // Rounded rectangle for label
            ctx.beginPath();
            ctx.moveTo(startX + radius, y);
            ctx.lineTo(startX + 70 - radius, y);
            ctx.quadraticCurveTo(startX + 70, y, startX + 70, y + radius);
            ctx.lineTo(startX + 70, y + boxHeight - radius);
            ctx.quadraticCurveTo(startX + 70, y + boxHeight, startX + 70 - radius, y + boxHeight);
            ctx.lineTo(startX + radius, y + boxHeight);
            ctx.quadraticCurveTo(startX, y + boxHeight, startX, y + boxHeight - radius);
            ctx.lineTo(startX, y + radius);
            ctx.quadraticCurveTo(startX, y, startX + radius, y);
            ctx.closePath();
            ctx.fill();

            // Label text
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(label, startX + 8, y + 19);

            // Value box with gradient
            const valueGradient = ctx.createLinearGradient(startX + 75, y, startX + 75, y + boxHeight);
            valueGradient.addColorStop(0, '#0088FF');
            valueGradient.addColorStop(1, '#0066DD');
            ctx.fillStyle = valueGradient;

            // Rounded rectangle for value
            const vx = startX + 75;
            ctx.beginPath();
            ctx.moveTo(vx + radius, y);
            ctx.lineTo(vx + boxWidth - 75 - radius, y);
            ctx.quadraticCurveTo(vx + boxWidth - 75, y, vx + boxWidth - 75, y + radius);
            ctx.lineTo(vx + boxWidth - 75, y + boxHeight - radius);
            ctx.quadraticCurveTo(vx + boxWidth - 75, y + boxHeight, vx + boxWidth - 75 - radius, y + boxHeight);
            ctx.lineTo(vx + radius, y + boxHeight);
            ctx.quadraticCurveTo(vx, y + boxHeight, vx, y + boxHeight - radius);
            ctx.lineTo(vx, y + radius);
            ctx.quadraticCurveTo(vx, y, vx + radius, y);
            ctx.closePath();
            ctx.fill();

            // Value text
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(value, vx + 10, y + 19);
        };

        // Draw info boxes
        drawInfoBox('NAME:', this.generatedName.toUpperCase(), startY);

        // Get current date for "ISSUED"
        const today = new Date();
        const issuedDate = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
        drawInfoBox('ISSUED:', issuedDate, startY + boxHeight + spacing);

        drawInfoBox('ID NO:', this.generatedStudentId, startY + (boxHeight + spacing) * 2);

        // Books graphic with shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;
        ctx.font = '50px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('📚', 250, 215);
        ctx.shadowColor = 'transparent';

        // Blue Footer with gradient
        const footerGradient = ctx.createLinearGradient(0, 250, 500, 250);
        footerGradient.addColorStop(0, '#0066CC');
        footerGradient.addColorStop(1, '#0088FF');
        ctx.fillStyle = footerGradient;
        ctx.fillRect(0, 250, 500, 50);

        // Footer text with shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('OFFICIAL LIBRARY CARD', 250, 280);
        ctx.shadowColor = 'transparent';

        // Trigger download
        const link = document.createElement('a');
        link.download = `LibraryCard-${this.generatedStudentId}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    async onScan(event: Event) {
        event.preventDefault();
        const code = this.scanValue.trim();
        if (!code) return;

        this.isLoading = true;
        this.errorMessage = '';
        this.successMessage = '';

        try {
            const latest = await this.libraryService.getLatestEntry(code);

            if (latest && !latest.checkOutTimestamp) {
                await this.libraryService.checkOut(code);
                this.successMessage = `Goodbye! Checked out ${latest.name || code}.`;
                this.playSound('checkout');
            } else {
                const name = latest ? latest.name : `Student ${code}`;
                const purpose = latest ? latest.purpose : 'Study';
                await this.libraryService.addEntry(name, code, purpose);
                this.successMessage = `Welcome! Checked in ${name}.`;
                this.playSound('checkin');
                // Redirect to Student Portal
                setTimeout(() => {
                    window.location.href = `/student-dashboard?studentId=${code}`;
                }, 1500);
            }
            this.scanValue = '';
        } catch (err: any) {
            console.error(err);
            this.errorMessage = err.message || 'Scan failed.';
        } finally {
            this.isLoading = false;
            setTimeout(() => {
                const input = document.getElementById('qrInput');
                if (input) input.focus();
            }, 100);
        }
    }

    private processEntry(name: string, studentId: string, purpose: string) {
        this.isLoading = true;
        this.libraryService.addEntry(name, studentId, purpose)
            .then(() => {
                this.successMessage = 'Check-In Successful';
                this.checkInForm.reset({ purpose: 'Study' });
                // Redirect to Student Portal
                setTimeout(() => {
                    // Redirect to current host but specific path
                    window.location.href = `/student-dashboard?studentId=${studentId}`;
                }, 1500);
            })
            .catch(err => {
                this.errorMessage = err.message;
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    playSound(type: 'checkin' | 'checkout') {
        const audio = new Audio(type === 'checkin' ? 'assets/checkin.mp3' : 'assets/checkout.mp3');
        audio.play().catch(e => console.warn('Audio play failed', e));
    }
}
