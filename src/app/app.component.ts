import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ScreenRecorderComponent } from '@pages/view/screen-recorder/screen-recorder.component';
import { NotificationComponent } from '@shared/notification/notification.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet,ScreenRecorderComponent,NotificationComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'clean-record';
}
