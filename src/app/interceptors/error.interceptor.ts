import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { NotificationService } from "@services/notification.service";
import { catchError, Observable, throwError } from "rxjs";

@Injectable()
export class GlobalErrorInterceptor implements HttpInterceptor {
  constructor(private notification: NotificationService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((err: any) => {
        const message = this.getFriendlyError(err);
        this.notification.error(message);
        return throwError(() => err);
      })
    );
  }

  private getFriendlyError(err: any): string {
    if (err instanceof HttpErrorResponse) {
      switch (err.status) {
        case 0: return '❌ Sin conexión a Internet.';
        case 403: return '🚫 Acceso denegado.';
        case 404: return '📄 Recurso no encontrado.';
        case 500: return '💥 Error interno del servidor.';
        default: return `⚠️ Error (${err.status}): ${err.message}`;
      }
    }
    return '❗ Ocurrió un error inesperado.';
  }
}
