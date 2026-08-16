# 🎥 Clean Record - Grabador de pantalla Angular + Electron
Aplicación Angular 22 que graba la pantalla con audio del sistema y micrófono, genera un video `.webm`, muestra una vista previa y permite descargarlo localmente. La versión Electron captura automáticamente todo el monitor principal sin mostrar el selector de pantalla del navegador.

## 🚀 Características

- 🧼 Arquitectura limpia y desacoplada (servicios, controladores, componentes standalone)
- ✅ Countdown antes de iniciar grabación
- 🎙️ Captura audio de sistema + micrófono con cancelación de eco, reducción de ruido y mezcla limitada
- 🖥️ Captura automática del monitor principal en el modo escritorio
- 📽️ Descarga local del video grabado (`MediaRecorder`)
- 👀 Vista previa integrada post grabación
- 🛠️ Notificaciones personalizadas (`NotificationService`)
- ⚙️ Selector de calidad (720p / 1080p)
- ♻️ Grabación reactiva (`BehaviorSubject`) y `ChangeDetectionStrategy.OnPush`

## Ejecución

```powershell
npm install
npm run desktop
```

`npm run desktop` compila Angular y abre la aplicación Electron. En Windows, al iniciar la grabación se selecciona el monitor principal y el audio de sistema automáticamente, sin el diálogo de “compartir pantalla”. El sistema operativo todavía puede solicitar una autorización propia para el micrófono o la captura, especialmente la primera vez.

El modo web continúa disponible con `npm start`, pero Chrome, Edge y Firefox obligan a elegir la superficie que se desea capturar. Ese selector no se puede omitir desde una página web.

Para generar el instalador de Windows:

```powershell
npm run desktop:package
```

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
- Angular 22
- Electron 43
- RxJS
- TypeScript
- TailwindCSS
- MediaRecorder API
- AudioContext API

📷 Demo https://clean-record.netlify.app/

🧑‍💼 Autor
- Mateo Huancho — LinkedIn www.linkedin.com/in/mhuancho08
