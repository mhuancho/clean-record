# CleanRecord

Grabador de pantalla local construido con Angular 22 y Electron 43. Captura el monitor principal, el micrófono y el audio del sistema, permite pausar, recuperar sesiones interrumpidas y guardar el resultado como WebM.

## Capacidades

- Captura automática del monitor principal en Electron.
- Micrófono y audio del sistema simultáneos, con cancelación de eco y limitador.
- Selector y prueba de micrófono.
- Medidores independientes para micrófono y sistema.
- Cuenta regresiva, pausa y reanudación.
- Controlador flotante protegido de la captura.
- Atajos globales configurables.
- Escritura de fragmentos a disco cada segundo en Electron.
- Historial local y recuperación después de cierres inesperados.
- Guardado mediante el diálogo nativo de Windows.
- Pruebas unitarias, E2E, visuales responsive y auditoría WCAG.
- Instalador NSIS, icono multirresolución y canal de actualizaciones configurable.

La vista previa siempre está silenciada. Las pistas analizadas por los medidores nunca se conectan a los altavoces.

## Desarrollo

Instalar dependencias:

    npm install
    npx playwright install chromium

Ejecutar el modo web:

    npm run start

Compilar Angular y abrir Electron:

    npm run desktop

Abrir Electron usando una compilación existente:

    npm run desktop:dev

En navegador, Chrome, Edge y Firefox siempre muestran el selector de superficie. Solo Electron puede seleccionar automáticamente el monitor principal.

## Controles de escritorio

Valores predeterminados:

| Acción | Atajo |
|---|---|
| Iniciar o detener | Ctrl+Shift+R |
| Pausar o reanudar | Ctrl+Shift+P |
| Detener | Ctrl+Shift+X |

Los atajos pueden modificarse desde Información y preferencias. Si un atajo está repetido o ya pertenece a otra aplicación, CleanRecord conserva la configuración anterior.

Al comenzar una grabación, la ventana principal se oculta y aparece un controlador flotante. Electron usa protección de contenido para evitar que el controlador forme parte de la captura cuando el sistema operativo lo permite.

## Archivos, recuperación e historial

En Electron, MediaRecorder entrega un fragmento cada segundo. Cada fragmento se envía mediante IPC validado y se escribe en el directorio de recuperación dentro de app.getPath('userData').

- Una sesión finalizada aparece inmediatamente en el historial.
- Al guardar, se utiliza el diálogo nativo y se recuerda la última carpeta.
- El guardado automático opcional utiliza esa carpeta o Videos en la primera ejecución.
- Una sesión interrumpida se detecta en el siguiente arranque y se marca como Recuperada.
- Quitar elimina únicamente la entrada del historial.
- Eliminar archivo envía el archivo guardado a la Papelera; los temporales internos se eliminan directamente después de una confirmación.

El modo web conserva el comportamiento original basado en un Blob, porque una página no puede escribir silenciosamente en el sistema de archivos.

## Pruebas

Pruebas unitarias:

    npx ng test --watch=false

Pruebas E2E, visuales y de accesibilidad:

    npm run test:e2e

Actualizar referencias visuales después de un cambio aprobado:

    npm run test:e2e:update

Las referencias cubren 375, 768, 1366 y 1920 px. También se valida el flujo simulado completo, Axe/WCAG y el arranque real de Electron con contextIsolation, sandbox y preload.

## Empaquetado local

Generar el directorio ejecutable sin instalador:

    npm run desktop:package:dir

Generar un instalador local sin publicar:

    npm run desktop:package

Los artefactos se escriben en release. El ejecutable local puede permanecer sin firma si no se proporciona un certificado.

## Descarga desde la versión web

El modo navegador ofrece el instalador en la barra superior. La ubicación se lee en tiempo de ejecución desde `public/download.json`, así que puede cambiarse sin recompilar:

    {
      "version": "1.0.0",
      "size": "108 MB",
      "platform": "Windows 10 y 11 · 64 bits",
      "url": "https://.../CleanRecord-Setup-1.0.0-x64.exe",
      "detailsUrl": "https://.../releases/latest"
    }

Sin archivo o sin `url`, la descarga no se muestra. En Electron nunca aparece.

## Release firmado y actualizaciones

Una publicación profesional necesita:

- Certificado de firma de código Windows en CSC_LINK.
- Contraseña del certificado en CSC_KEY_PASSWORD.
- Canal HTTPS de archivos estáticos en CLEANRECORD_UPDATE_URL.

Ejemplo:

    $env:CSC_LINK = 'C:\certificados\cleanrecord.pfx'
    $env:CSC_KEY_PASSWORD = 'solicitar-desde-un-gestor-seguro'
    $env:CLEANRECORD_UPDATE_URL = 'https://actualizaciones.midominio.com/cleanrecord/'
    npm run desktop:release

El script rechaza releases sin certificado o sin una URL HTTPS. Durante el empaquetado incorpora temporalmente el canal de actualización y lo elimina del árbol de trabajo al terminar.

Después de compilar, se deben publicar en la URL configurada el instalador, su archivo .blockmap y latest.yml. CleanRecord verifica la firma antes de instalar una actualización.

No guardes certificados ni contraseñas dentro del repositorio.

## Seguridad y privacidad

- contextIsolation activado, nodeIntegration desactivado y sandbox activado.
- IPC disponible únicamente mediante APIs explícitas del preload.
- Validación del origen en cada operación IPC.
- Navegación y ventanas externas bloqueadas.
- CSP restrictiva y protocolo local dedicado para reproducir grabaciones.
- Archivos e historial almacenados localmente.
- Los archivos eliminados fuera del directorio de recuperación se envían a la Papelera.

## Tecnologías

- Angular 22
- Electron 43
- Electron Builder
- Electron Updater
- RxJS
- Tailwind CSS
- MediaRecorder y Web Audio API
- Vitest, Playwright y Axe

Autor: Mateo Huancho
