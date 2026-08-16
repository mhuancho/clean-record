import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface AppNotification {
  message: string;
  type: NotificationType;
  duration?: number; // en ms
}
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private notificationSubject = new BehaviorSubject<AppNotification | null>(null);
  private clearTimer?: ReturnType<typeof setTimeout>;
  notification$ = this.notificationSubject.asObservable();

  show(message: string, type: NotificationType = 'info', duration = 4000) {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.notificationSubject.next({ message, type, duration });
    this.clearTimer = setTimeout(() => this.clear(), duration);
  }

  success(message: string, duration = 4000) {
    this.show(message, 'success', duration);
  }

  error(message: string, duration = 5000) {
    this.show(message, 'error', duration);
  }

  info(message: string, duration = 4000) {
    this.show(message, 'info', duration);
  }

  warning(message: string, duration = 4500) {
    this.show(message, 'warning', duration);
  }

  clear() {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = undefined;
    this.notificationSubject.next(null);
  }
}
