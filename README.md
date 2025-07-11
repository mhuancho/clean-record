# 🎥 Clean Record - Grabador de pantalla en Angular 19
Aplicación Angular 19 que permite grabar la pantalla con audio del sistema y micrófono, generar un video `.webm`, mostrar vista previa, descargar automáticamente, y recibir notificaciones amigables. Ideal para generar demos, clases virtuales o reportes técnicos.

## 🚀 Características

- 🧼 Arquitectura limpia y desacoplada (servicios, controladores, componentes standalone)
- ✅ Countdown antes de iniciar grabación
- 🎙️ Captura audio de sistema + micrófono con `AudioContext`
- 📽️ Descarga automática del video grabado (`MediaRecorder`)
- 👀 Vista previa integrada post grabación
- 🛠️ Notificaciones personalizadas (`NotificationService`)
- ⚙️ Selector de calidad (720p / 1080p)
- ♻️ Grabación reactiva (`BehaviorSubject`) y `ChangeDetectionStrategy.OnPush`
  
- ## 📦 Estructura
-  src/
- ├── app/
- │ ├── screen-recorder/
- │ ├── services/
- │ │ ├── screen-recorder-controller.service.ts
- │ │ ├── screen-recorder.service.ts
- │ │ └── notification.service.ts
- │ ├── shared/
- │ │ └── notification/
- │ └── interceptors/
- │ └── global-error.interceptor.ts

📄 Buenas prácticas aplicadas
- ✅ Componentes standalone en Angular 19
- ✅ Separación de responsabilidades (ControllerService, UI, RecorderService)
- ✅ Interceptor global de errores HTTP (GlobalErrorInterceptor)
- ✅ Tipado fuerte con TypeScript (AppNotification, NotificationType)
- ✅ Evita uso excesivo de NgZone/detectChanges() innecesario
- ✅ Animaciones y estilos limpios con Tailwind CSS
- ✅ Uso de Renderer2 para manipular DOM de forma segura

💻 Tecnologías
- Angular 19
- RxJS
- TypeScript
- TailwindCSS
- MediaRecorder API
- AudioContext API

📷 Demo https://clean-record.netlify.app/

🧑‍💼 Autor
- Mateo Huancho — LinkedIn www.linkedin.com/in/mhuancho08
