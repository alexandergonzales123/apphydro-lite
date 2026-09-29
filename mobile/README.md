# App AR de Infraestructura (Lite): móvil

Expo SDK 57 (React Native 0.86, New Architecture) + TypeScript + `@reactvision/react-viro` 3.0.1
(ARKit en iOS, ARCore en Android).
iPhone con iOS 17+ (development build de EAS y TestFlight) y Android 7.0+ con ARCore (APK gratis, ver
[Android (APK gratis)](#android-apk-gratis)). **No funciona en Expo Go.**

Flujo: **Permisos → Inicializando AR (suelo, GPS y descarga) → Vista AR**. La ficha y la calibración
son paneles sobre la vista AR. No hay login ni menú.

## Requisitos

- Node 20.19.4+ (o 22 LTS), npm 10.
- Cuenta de Expo (`npx eas-cli@latest login`). Para iOS, además, cuenta de Apple Developer (de pago) para
  firmar; para Android no hace falta pagar nada.
- Un iPhone con ARKit (iPhone XS o posterior con iOS 17+) o un Android compatible con ARCore.
- No hace falta Mac: EAS compila en la nube.

## Variables de entorno

La app lee dos variables públicas, que se incrustan en el bundle **al compilar**:

| Variable              | Ejemplo                       | Uso                                   |
| --------------------- | ----------------------------- | ------------------------------------- |
| `EXPO_PUBLIC_API_URL` | `http://192.168.1.10:8000`    | URL base de la API, sin barra final   |
| `EXPO_PUBLIC_API_KEY` | `dev-key-cambiar`             | Cabecera `X-API-Key` (RNF-L06)        |

### En local (servidor de desarrollo Metro)

```bash
cp .env.example .env   # y edita la IP de tu PC en la LAN
```

- Usa la IP de tu PC en la red wifi, no `localhost`: el iPhone no es tu PC.
- El backend tiene que escuchar en `0.0.0.0:8000` y el firewall de Windows tiene que dejar pasar el puerto 8000.
- `.env` está en `.gitignore`. La API key acaba dentro de la app de todas formas (RNF-L06: clave fija en la app), así que no la trates como un secreto fuerte.

### En builds de EAS

EAS **no sube** `.env` (está en `.gitignore`). Define las variables en EAS, una vez por entorno:

```bash
npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_API_URL --value http://192.168.1.10:8000 --visibility plaintext
npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_API_KEY --value dev-key-cambiar --visibility plaintext
npx eas-cli@latest env:create --environment production  --name EXPO_PUBLIC_API_URL --value https://api.tu-dominio.com --visibility plaintext
npx eas-cli@latest env:create --environment production  --name EXPO_PUBLIC_API_KEY --value <clave-de-produccion> --visibility plaintext
```

Los perfiles de `eas.json` ya apuntan a esos entornos (`"environment": "development"`, `"preview"` y
`"production"`). El entorno `preview` lo usa la APK de Android (ver
[Android (APK gratis)](#android-apk-gratis)).

> Producción: la API tiene que ir por **HTTPS** (RNF-L06, y además iOS bloquea HTTP en builds de release
> por App Transport Security y Android bloquea el tráfico HTTP "cleartext" en builds de release). En desarrollo, el HTTP hacia una IP de la LAN suele funcionar con el dev
> client; si no, o si el iPhone no está en tu wifi, usa un túnel HTTPS (ver
> [Probar en el iPhone](#probar-en-el-iphone-eas-development-build--túnel-https)).
>
> `app.config.js` avisa al compilar si `EXPO_PUBLIC_API_URL` no empieza por `https://` (con un aviso
> destacado en los perfiles `production` y `preview` de EAS). En una build de release, si la petición falla con una URL
> `http://`, el HUD lo indica en el mensaje de error.

## Instalación y comprobaciones

```bash
npm install
npx tsc --noEmit      # typecheck
npx jest              # tests de lógica pura (ENU, GeoJSON, calibración, escena, diferencias iOS/Android)
npx expo-doctor       # validación de dependencias y configuración
```

## Probar en el iPhone (EAS development build + túnel HTTPS)

Pasos completos, desde Windows y sin Mac. La app usa ARKit, así que **no funciona en Expo Go ni en el
simulador**: hace falta un development build instalado en un iPhone real.

### 1. Levantar la API y exponerla por HTTPS con cloudflared

1. Arranca el backend (ver `../backend/README.md`) y comprueba que responde en local:
   ```bash
   curl http://localhost:8000/health        # {"status":"ok"}
   ```
2. Instala cloudflared (Windows: `winget install --id Cloudflare.cloudflared`) y abre un túnel rápido.
   No hace falta cuenta ni abrir puertos del router ni del firewall:
   ```bash
   cloudflared tunnel --url http://localhost:8000
   ```
   Copia la URL que imprime, del tipo `https://<palabras-al-azar>.trycloudflare.com`. Deja esa
   ventana abierta mientras pruebas: **la URL cambia cada vez que reinicias el túnel**.
3. Comprueba el túnel desde el propio iPhone (Safari) o desde el PC:
   ```bash
   curl https://<tu-tunel>.trycloudflare.com/health
   curl -H "X-API-Key: dev-key-cambiar" "https://<tu-tunel>.trycloudflare.com/cercanos?lat=-12.0463&lon=-77.0301&radio=50"
   ```

¿Por qué el túnel? Con HTTPS no dependes de App Transport Security ni de que el iPhone y el PC estén en
la misma wifi, y pruebas en las mismas condiciones que en producción (RNF-L06). Es la opción que
recomendamos para probar en campo (exterior, con datos móviles). Sin túnel, `http://<IP-LAN>:8000`
solo funciona dentro de tu wifi.

### 2. Configurar las variables de la app

Las variables `EXPO_PUBLIC_*` se incrustan en el bundle de JavaScript, y en un development build ese
bundle lo sirve **Metro desde tu PC**. Por eso, para el dev client basta con el `.env` local:

```bash
cp .env.example .env
# .env
EXPO_PUBLIC_API_URL=https://<tu-tunel>.trycloudflare.com   # sin barra final
EXPO_PUBLIC_API_KEY=dev-key-cambiar                        # = API_KEY del backend
```

Si cambias `.env` (por ejemplo porque el túnel tiene URL nueva), reinicia Metro con caché limpia
(`npx expo start --dev-client -c`). No hace falta recompilar.

Opcional: guarda las mismas variables en el entorno `development` de EAS, para que el build también las
lleve incrustadas (sirve si abres la app sin Metro):

```bash
npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_API_URL --value https://<tu-tunel>.trycloudflare.com --visibility plaintext
npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_API_KEY --value dev-key-cambiar --visibility plaintext
```

(Para actualizarlas más adelante, usa `env:update`.)

### 3. Compilar e instalar el development build (una vez)

1. Inicia sesión y enlaza el proyecto (la primera vez escribe el `projectId` en `app.json`):
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```
2. Cambia `ios.bundleIdentifier` en `app.json` (`com.apphydro.arinfralite`) por uno de tu equipo de Apple.
3. Registra el iPhone para la distribución interna. Abre en el iPhone el enlace o QR que aparece e
   instala el perfil de registro:
   ```bash
   npx eas-cli@latest device:create
   ```
4. Compila en la nube (perfil `development` de `eas.json`: dev client, distribución interna y
   dispositivo real):
   ```bash
   npx eas-cli@latest build --profile development --platform ios
   ```
   Deja que EAS genere el certificado y el provisioning profile (con tu Apple ID de pago). Si
   registras el iPhone después de compilar, tendrás que volver a compilar para que el perfil lo incluya.
5. Instala el build en el iPhone desde el QR o el enlace que muestra EAS al terminar.
6. En el iPhone activa **Ajustes → Privacidad y seguridad → Modo desarrollador** y reinicia cuando
   lo pida (iOS 16 o posterior lo exige para builds de desarrollo).

Solo hay que recompilar si cambian las dependencias nativas, `app.json`/`app.config.js` o los plugins.

### 4. Arrancar Metro y abrir la app

```bash
npx expo start --dev-client
```

- En la misma wifi: abre la app **AR Infra Lite** en el iPhone. Aparecerá el servidor de tu PC en la
  lista; si no, escanea con la cámara el QR de la terminal.
- En otra red (en campo, con datos móviles): `npx expo start --dev-client --tunnel`. Este túnel es solo
  para Metro (el bundle JS) y es independiente del túnel cloudflared de la API.
- El firewall de Windows tiene que dejar pasar Node (puerto 8081) si usas la wifi.

### 5. Qué debería pasar

1. Pantalla de permisos: acepta cámara y ubicación "Mientras se usa la app".
2. "Inicializando AR": si aparece "Calibrando brújula: mueve el teléfono en forma de 8", haz el gesto
   hasta que se ponga en verde (hay un límite de 3 s; si se agota, la app arranca igualmente con un
   aviso naranja en el HUD que pide calibrar con 2 activos).
3. En unos 2–5 s, pines y tuberías. Si ARKit todavía no ha visto el suelo se usa una altura estimada
   ("Suelo estimado: apunta al piso") y la escena se recoloca sola al detectar el plano.
4. Sin señal GPS en 10 s aparece un error claro en el paso "GPS" (la app sigue esperando la señal).

### Problemas frecuentes

| Síntoma | Causa probable |
| --- | --- |
| "Sin conexión con el servidor" | Túnel cerrado o con URL nueva: actualiza `.env` y reinicia Metro con `-c` |
| "API key inválida" | `EXPO_PUBLIC_API_KEY` no coincide con `API_KEY` del backend |
| "Faltan EXPO_PUBLIC_API_URL…" | No existe `.env` o Metro se arrancó antes de crearlo |
| La app no encuentra Metro | Otra wifi o firewall: usa `--tunnel` |
| No se puede instalar el build | El iPhone no estaba registrado (`device:create`) al compilar, o falta el Modo desarrollador |

## Android (APK gratis)

La app funciona también en Android con ARCore. Las builds de Android en EAS no requieren ninguna cuenta
de pago (basta la cuenta gratuita de Expo) y la APK se instala directamente, sin Google Play.

El perfil `preview` de `eas.json` genera una **APK de release** (`distribution: "internal"`,
`android.buildType: "apk"`, sin dev client): el bundle de JavaScript va dentro, así que la app funciona
sin Metro ni PC. El perfil `development` también genera APK, pero es un dev client que necesita Metro.

### 1. Variables del entorno `preview` (una vez)

```bash
npx eas-cli@latest login
npx eas-cli@latest init          # solo la primera vez, si app.json aún no tiene projectId
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://api.tu-dominio.com --visibility plaintext
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_KEY --value <clave> --visibility plaintext
```

> **La URL tiene que ser `https://`.** La APK es una build de release y Android bloquea el HTTP en claro
> (cleartext) en release: con `http://192.168.x.x:8000` la app mostrará "Sin conexión con el servidor".
> Para probar sin dominio propio vale el túnel de cloudflared (`https://…trycloudflare.com`, ver
> [más abajo](#1-levantar-la-api-y-exponerla-por-https-con-cloudflared)), sabiendo que su URL cambia al
> reiniciarlo y entonces hay que recompilar la APK. (Solo la build `development`, que es debug, permite
> HTTP.) `app.config.js` avisa al compilar si la URL no es https.

### 2. Compilar la APK

```bash
npx eas-cli@latest build --profile preview --platform android
```

La primera vez EAS ofrece generar el keystore de firma: acepta (se guarda en EAS; puedes descargar una
copia con `npx eas-cli@latest credentials`). Usa siempre el mismo keystore: si cambia, Android no deja
actualizar la app encima y hay que desinstalarla antes.

### 3. Distribuirla a los técnicos

- Al terminar, EAS muestra un **enlace y un QR** a la página de la build. Compártelo (o descarga el
  `.apk` y envíalo por correo, WhatsApp, Drive…).
- En el teléfono, abre el enlace y descarga la APK. Android pedirá permitir **"Instalar apps
  desconocidas"** para el navegador o la app desde la que se abre (Ajustes → Aplicaciones → *navegador*
  → Instalar apps desconocidas). Después, instala.
- Play Protect puede avisar de que la app no viene de Google Play: "Instalar de todas formas".
- Para actualizar, instala la APK nueva encima (mismo paquete y mismo keystore).

### Requisitos del teléfono

- Android 7.0 (API 24) o superior y un modelo **compatible con ARCore**
  ([lista oficial](https://developers.google.com/ar/devices)).
- **Servicios de Google Play para RA** (Google Play Services for AR, paquete `com.google.ar.core`). Si no
  está instalado o está desactualizado, la app lo pide al abrir la vista AR y lleva a Google Play para
  instalarlo, así que el teléfono necesita Google Play.
- Si el modelo no es compatible con ARCore, la pantalla inicial lo indica y la app no continúa.
- Permisos: cámara y ubicación **precisa** "mientras se usa la app". Si se concede solo la ubicación
  aproximada, la app lo indica y ofrece abrir los ajustes.
- Brújula en Android: al arrancar, el paso "Brújula" puede pedir **inclinar el teléfono hacia el suelo**
  (≥ 30° bajo el horizonte): el rumbo de Android es el de la parte superior del teléfono y con el móvil
  vertical no es fiable. Apuntar al suelo sirve a la vez para detectar el plano.

### Alternativa: compilar en local (con Android Studio)

Si tienes Android Studio (SDK de Android y JDK 17) puedes compilar e instalar sin EAS, con el teléfono
conectado por USB y la depuración USB activada:

```bash
cp .env.example .env    # con EXPO_PUBLIC_API_URL=https://... (en release no vale http)
npx expo run:android --variant release
```

Esto genera la carpeta `android/` (está en `.gitignore`; no la subas) y firma con la clave de debug, que
sirve para probar pero no para repartir la APK: para distribuirla usa el perfil `preview` de EAS.

## TestFlight

1. Crea la app en App Store Connect con el mismo bundle identifier (o deja que `eas submit` lo haga).
2. Compila el perfil de producción (usa el entorno `production` de EAS: HTTPS y clave de producción):
   ```bash
   npx eas-cli@latest build --profile production --platform ios
   ```
3. Súbelo:
   ```bash
   npx eas-cli@latest submit --platform ios --latest
   ```
   Hace falta un Apple ID con acceso a App Store Connect, o una API key de App Store Connect.
4. En App Store Connect → TestFlight, cuando el build termine de procesarse, añade los testers
   internos (o un grupo externo, que requiere una revisión beta).

`ITSAppUsesNonExemptEncryption=false` ya está en `app.json`, así que no pedirá el cuestionario de cifrado.
`autoIncrement` sube el número de build en cada compilación de producción.

## Configuración nativa (app.json)

- Plugin `@reactvision/react-viro` con `provider: "none"` (sin cloud/geospatial anchors) y
  `android.xRMode: ["AR"]` (solo ARCore, sin Cardboard/Daydream).
- `NSCameraUsageDescription` y `NSLocationWhenInUseUsageDescription` en español. Los textos de
  micrófono y fotos los exige el binario de ViroReact aunque no se usen. No se piden los permisos
  de ubicación "Always" ni de movimiento.
- `UIRequiredDeviceCapabilities: ["arkit"]`.
- `expo-build-properties` → `ios.deploymentTarget: "17.0"` y `android.minSdkVersion: 24` (el mínimo de
  ViroReact; RN 0.86 ya usa 24 por defecto, se deja explícito).
- `expo-dev-client` para los development builds.

Android:

- ARCore **opcional**: el plugin de Viro 3.0.1 escribe siempre
  `<meta-data android:name="com.google.ar.core" android:value="optional"/>` y no tiene opción para
  cambiarlo. Se deja así a propósito: con "required" Google Play filtraría la app, pero aquí se reparte
  como APK, y con "optional" la app puede arrancar en un móvil sin ARCore y avisar. Viro llama a
  `ArCoreApk.requestInstall` al abrir la vista AR, así que pide instalar o actualizar Google Play Services
  for AR si hace falta.
- Permisos: `CAMERA` (lo añade el plugin de Viro), `ACCESS_FINE_LOCATION` y `ACCESS_COARSE_LOCATION`,
  más `INTERNET` y `ACCESS_NETWORK_STATE` (normales, sin diálogo). `android.blockedPermissions` quita los
  que añaden las librerías y no se usan: `RECORD_AUDIO` (grabación de vídeo de Viro), almacenamiento
  (Viro y expo-file-system; la caché va a `Paths.document`, que es privado), `NFC` y `VIBRATE` (visor
  Cardboard), `com.oculus.permission.EYE_TRACKING` (Quest) y `ACCESS_BACKGROUND_LOCATION`.
- `uses-feature android.hardware.camera` obligatoria (la pone el plugin de Viro). HTTP en claro solo se
  permite en la build debug (`development`), no en release.

## Arquitectura

```
src/
  geo/enu.ts               WGS84 → ECEF → ENU → marco Viro (puro, con tests)
  api/                     tipos, parseo GeoJSON (puro) y cliente GET /cercanos
  cache/                   formato de la caché (puro) + fichero con expo-file-system (RF-L09)
  calibration/             traslación + yaw por mínimos cuadrados, pila de deshacer (puro)
  scene/                   modelo de escena (pines, tuberías, trazos) y elección de suelo (puro)
  state/                   stores externos (useSyncExternalStore): appStore y sensorStore
  sensors/sensors.ts       watchPositionAsync + watchHeadingAsync
  sensors/heading.ts       normalización del rumbo por plataforma (puro)
  flow/initialize.ts       orquestación de "Inicializando AR"
  flow/criteria.ts         criterios de arranque: fix, rumbo, pose (puro)
  flow/startup.ts          compatibilidad AR y permisos por plataforma (puro)
  ar/hitTestPoint.ts       coordenadas del hit test por plataforma (puro)
  ar/                      componentes Viro (escena, Pin, Pipe, materiales, suelo)
  ui/                      permisos, HUD + aviso, ficha, calibración
__tests__/                 jest (lógica pura)
```

### Convención de ejes (RF-L03)

- **ENU**: origen = posición GPS del usuario al fijar la escena en el arranque. e = Este, n = Norte, u = Arriba.
- **Viro/ARKit** (`worldAlignment="Gravity"`): +X derecha, +Y arriba, **−Z al frente**. El frente es
  la dirección de la cámara al arrancar la sesión AR, no el norte.
- Al fijar el origen se leen a la vez el rumbo de la brújula (h_cam) y el vector forward de la cámara
  en el mundo Viro. El yaw de la cámara en Viro es φ = atan2(fx, −fz), así que el eje −Z apunta a
  h0 = h_cam − φ. Entonces:
  - x = e·cos h0 − n·sin h0
  - z = −(e·sin h0 + n·cos h0)
  - más el desplazamiento (X, Z) de la cámara en ese instante.
- **Y**: no se usa la altitud GPS. Los pines van a la altura del suelo detectado (el plano horizontal
  más grande a ≥ 0,5 m bajo la cámara; si no hay ninguno a los 1,5 s de rastrear, se estima a 1,4 m bajo la
  cámara y la escena se recoloca al detectar el plano, mientras no se haya calibrado) y las tuberías a
  suelo − `profundidad_m`. Las tuberías sin profundidad (null o ≤ 0) van a suelo + 0,02 m y sin proyección.
- **Calibración**: todo cuelga de un `ViroNode` raíz con `position=[tx,ty,tz]` y
  `rotation=[0, θ°, 0]`: mundo = R_y(θ)·local + t. Con un punto solo se corrige la traslación. Con 2
  o más activos separados ≥ 10 m se corrige también el yaw (Procrustes 2D); si están más cerca, el panel
  explica por qué no se corrige el giro.
- **Rumbo**: se espera un rumbo con precisión ≥ 2 (incertidumbre < 35° en iOS) hasta 3 s. Si no llega,
  la escena arranca igual con `headingUnreliable` y el HUD pide calibrar con 2 activos.
- **Rumbo en Android** (`src/sensors/heading.ts`): expo-location da el azimut de la **parte superior del
  teléfono** (`SensorManager.getOrientation`, sin remapear ejes), no el de la cámara. Por eso en Android se
  empareja con el vector `up` de la cámara Viro (`worldHeadingFromPose`) en vez de con `forward`, y se
  espera hasta 4 s a que la cámara mire ≥ 30° hacia el suelo (`isHeadingPoseUsable`); si no, arranca con
  `headingUnreliable`. `trueHeading` vale -1 sin declinación (se usa `magHeading`), pero otros negativos
  son válidos y se normalizan. `accuracy` es el `SENSOR_STATUS` de Android (0..3, orientativo).
- **Claves**: `activo-{id}` y `red-{id}-{n}` (n = orden de la parte dentro de la tubería, por su primera
  coordenada). Son estables entre descargas. Al tocar una tubería partida se resaltan todas sus partes.

### Rendimiento (≥ 30 fps)

- El origen y el rumbo se fijan **una vez**. La escena Viro no se suscribe al GPS: solo se re-renderiza
  si cambian los datos, el suelo (umbral de 5 cm), la calibración o la selección.
- `ARView` no recibe props y está memoizado. `Pin` y `Pipe` son `memo`. Los materiales son `Constant`
  (sin iluminación) y HDR, PBR, bloom y sombras están desactivados.
- La proyección discontinua es una `ViroPolyline` multipunto por trazo de 1 m (≈ longitud / 2 m
  nodos por tubería) y los trazos no tienen `onClick`; solo la tubería es tocable.
- La pose de la cámara se lee con `onCameraTransformUpdate`, que solo se activa mientras se espera una
  pose (en el arranque), no en cada frame durante toda la sesión.
- Solo el HUD y la ficha se suscriben al GPS y al rumbo. El rumbo se publica como mucho cada 250 ms o
  cuando cambia 1°.

## Qué verificar en el dispositivo

Desde Windows no se puede ejecutar ARKit ni ARCore. Prueba esto en campo:

1. Aparecen pines y tuberías en ≤ 5 s con buena señal (RNF-L04).
2. Coordenadas de toque del hit test (`src/ar/hitTestPoint.ts`): en iOS se pasan `pageX/pageY` (puntos)
   a `performARHitTestWithPoint`; en Android se multiplican por `PixelRatio.get()` porque el módulo nativo
   de Viro no convierte dp a píxeles. Si el punto de calibración sale desplazado de forma sistemática
   (p. ej. escalado respecto al centro), revisa ese factor en la plataforma afectada.
3. Tamaño y legibilidad de las etiquetas `ViroText` a 20–50 m.
4. El signo del yaw de calibración (tests con la convención de Viro: +θ = antihorario visto desde arriba).
5. Que `onCameraTransformUpdate` llega al activarlo en el arranque. Si no llega en 1 s, se usa como red
   de seguridad `getCameraOrientationAsync` (deprecated) y el arranque tarda 1 s más.
6. Solo Android:
   - Que el rumbo inicial es correcto con el móvil inclinado hacia el suelo (compara la dirección de un
     activo conocido). Si sale girado ~180° o de forma inestable, revisar que el vector `up` de la cámara
     de Viro corresponde a la parte superior del teléfono en retrato.
   - Que el paso "Brújula" no se queda siempre en "poco fiable": en algunos Android `accuracy` no se
     actualiza nunca (se queda en 0) y la app arrancará siempre con el aviso de calibrar con 2 activos.
   - Que en un móvil sin Google Play Services for AR aparece el diálogo de instalación de ARCore, y en un
     modelo no compatible, el aviso de la pantalla inicial.
   - Que la APK de `preview` descarga datos con la URL https (y que con http falla, como se espera).
