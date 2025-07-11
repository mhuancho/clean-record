import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { AppNotification, NotificationService } from '@services/notification.service';

@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notification.component.html',
  styleUrl: './notification.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationComponent implements OnDestroy {
  notification: AppNotification | null = null;
  private subscription: Subscription;

  constructor(
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef
  ) {
    this.subscription = this.notificationService.notification$.subscribe(n => {
      this.notification = n;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}
