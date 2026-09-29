/**
 * Configuración dinámica: parte de app.json y solo añade comprobaciones.
 *
 * EXPO_PUBLIC_API_URL se incrusta en el bundle al compilar. En builds de release iOS (App Transport
 * Security) y Android (cleartext bloqueado) rechazan HTTP y RNF-L06 exige HTTPS, así que se avisa si
 * la URL no es https://. Los perfiles de release de eas.json son "production" y "preview" (APK).
 * Se evalúa en `expo start`, `expo export` y en cada `eas build` (donde EAS_BUILD_PROFILE indica
 * el perfil de eas.json).
 */
module.exports = ({ config }) => {
  const url = process.env.EXPO_PUBLIC_API_URL ?? '';
  const profile = process.env.EAS_BUILD_PROFILE ?? '';
  const isRelease = profile === 'production' || profile === 'preview';

  // Expo evalúa la config varias veces en el mismo proceso: avisar una sola vez.
  if (!/^https:\/\//i.test(url) && !globalThis.__apiUrlHttpsWarned) {
    globalThis.__apiUrlHttpsWarned = true;
    const shown = url === '' ? '(vacía)' : url;
    if (isRelease) {
      console.warn(
        [
          '',
          '################################################################################',
          `# AVISO: EXPO_PUBLIC_API_URL no empieza por https:// en el perfil "${profile}": ${shown}`,
          '# iOS (ATS) y Android (cleartext) bloquearán las peticiones HTTP y la app no podrá',
          '# descargar datos. Define una URL HTTPS en el entorno de EAS de ese perfil:',
          `#   npx eas-cli@latest env:create --environment ${profile} --name EXPO_PUBLIC_API_URL \\`,
          '#     --value https://api.tu-dominio.com --visibility plaintext',
          '################################################################################',
          '',
        ].join('\n'),
      );
    } else if (url !== '') {
      console.warn(
        `[app.config] EXPO_PUBLIC_API_URL no es HTTPS (${shown}). Vale en desarrollo con la IP de la LAN; ` +
          'si el sistema la bloquea usa un túnel HTTPS (ver README). En release (production/preview) debe ser https://.',
      );
    } else {
      console.warn('[app.config] Falta EXPO_PUBLIC_API_URL (copia .env.example a .env o defínela en EAS).');
    }
  }

  return config;
};
