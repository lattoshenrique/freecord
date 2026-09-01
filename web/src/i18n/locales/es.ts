import type { Catalog } from '..';

export const esES: Catalog = {
  'app.name': 'Freecord',
  'app.tagline':
    'Voz, vídeo, chat y pantalla en una malla P2P. Sin servidor de medios en medio.',

  'home.roomName': 'Nombre de la sala',
  'home.roomNamePlaceholder': 'Nombre de la sala (opcional)',
  'home.create': 'Crear sala',
  'home.creating': 'Creando…',
  'home.createFailed': 'No se pudo crear la sala. Inténtalo de nuevo.',
  'home.community': 'Comunidad',

  'home.chip.opensource': 'Open source · MIT',
  'home.chip.p2p': 'WebRTC P2P nativo',
  'home.chip.nosignup': 'Sin registro',

  'home.hero.titleA': 'Una sala es',
  'home.hero.titleB': 'solo un enlace.',
  'home.footer.product': 'Producto',
  'home.footer.downloads': 'Descargas',

  'home.card.title': 'Empieza una sala',
  'home.card.hint': 'El enlace es la invitación.',

  'home.dev.title': 'Para devs',
  'home.dev.lead': 'Sin proveedor, sin SDK, sin credenciales externas. Clónalo, ejecútalo, haz un fork.',
  'home.dev.copy': 'Copiar comandos',
  'home.dev.copied': '¡Copiado!',
  'home.dev.p2p.title': 'Los medios nunca tocan el servidor',
  'home.dev.p2p.body':
    'Voz, vídeo y pantalla fluyen de navegador a navegador por WebRTC nativo, en una malla P2P. El servidor solo lleva la señalización y el estado de la sala.',
  'home.dev.selfhost.title': 'Self-host en un solo proceso',
  'home.dev.selfhost.body':
    'Un único proceso de Node sirve la API, el WebSocket y el frontend compilado. O despliega el mismo protocolo en Cloudflare Workers, todo en planes gratuitos.',
  'home.dev.protocol.title': 'El protocolo es tuyo',
  'home.dev.protocol.body':
    'Señalización WebSocket propia — salas, relé de SDP/ICE, chat y el bloqueo de pantalla en un solo lugar. Haz un fork y cambia las reglas.',
  'home.dev.light.title': 'Absurdamente ligero',
  'home.dev.light.body':
    'El bundle de la sala pesa ~14 kB. React + Vite por fuera, todo lo demás hecho a mano — hasta el i18n.',
  'home.dev.github': 'Estrella en GitHub',
  'home.dev.architecture': 'Leer la arquitectura',
  'home.dev.contribute': 'Guía de contribución',

  'invite.copy': 'Invitar',
  'invite.copied': '¡Enlace copiado!',
  'invite.manualCopy': 'Copia el enlace de la sala:',

  'prejoin.title': 'Entrar en {room}',
  'prejoin.yourName': 'Tu nombre',
  'prejoin.yourNamePlaceholder': '¿Cómo te llamamos?',
  'prejoin.micOn': 'Entrar con el micrófono activado',
  'prejoin.camOn': 'Entrar con la cámara activada',
  'prejoin.join': 'Entrar',
  'prejoin.notFound': 'Esta sala ya no existe.',
  'prejoin.loadFailed': 'No se pudo cargar la sala.',
  'prejoin.backHome': 'Volver al inicio',

  'prejoin.notFoundTitle': 'Sala no encontrada',
  'prejoin.notFoundBody': 'Puede que el enlace haya caducado: las salas vacías se cierran solas.',
  'prejoin.createNew': 'Crear una sala nueva',
  'prejoin.errorTitle': 'Algo salió mal',
  'prejoin.errorBody': 'No se pudo cargar la sala. Prueba a recargar la página.',
  'prejoin.empty': 'Todavía no hay nadie: sé la primera persona en entrar.',
  'prejoin.inRoom': { one: '{count} persona en la sala.', other: '{count} personas en la sala.' },
  'prejoin.joinRoom': 'Entrar en la sala',

  'room.loading': 'Cargando sala…',
  'room.connecting': 'Conectando a la sala…',
  'room.participants': { one: '{count} participante', other: '{count} participantes' },
  'room.unnamed': 'Sala sin nombre',
  'room.you': 'tú',
  'room.someone': 'Alguien',
  'room.micMuted': 'Micrófono desactivado',
  'room.leftTitle': 'Has salido de la sala',
  'room.endedFull': 'La sala está llena (máximo 8 personas).',
  'room.endedNotFound': 'La sala ya no existe.',
  'room.endedClosed': 'Se perdió la conexión con la sala.',

  'screen.yours': 'Tu pantalla',
  'screen.of': 'Pantalla de {name}',
  'screen.via': 'vía {name}',
  'screen.sending': 'Enviando',
  'screen.receiving': 'Recibiendo',
  'screen.enterFullscreen': 'Ver en pantalla completa',
  'screen.exitFullscreen': 'Salir de pantalla completa',

  'quality.title': 'Calidad de la pantalla',
  'quality.note':
    'Se aplica al instante, incluso compartiendo. La pantalla se retransmite entre pares, así que la calidad ya no baja cuando se llena la sala.',
  'quality.sharp.label': 'Nítida',
  'quality.sharp.hint': 'Código y texto — 1080p a 15 fps, nunca se difumina',
  'quality.balanced.label': 'Equilibrada',
  'quality.balanced.hint': 'Predeterminada — 1080p a 30 fps',
  'quality.smooth.label': 'Fluida',
  'quality.smooth.hint': 'Vídeo y juegos — 720p a 60 fps, prioriza el movimiento',

  'controls.muteMic': 'Silenciar micrófono',
  'controls.unmuteMic': 'Activar micrófono',
  'controls.camOff': 'Apagar cámara',
  'controls.camOn': 'Encender cámara',
  'controls.shareScreen': 'Compartir pantalla',
  'controls.stopSharing': 'Dejar de compartir',
  'controls.someoneSharing': 'Otra persona ya está compartiendo su pantalla',
  'controls.quality': 'Calidad de la pantalla compartida',
  'controls.openChat': 'Abrir chat',
  'controls.closeChat': 'Cerrar chat',
  'controls.leave': 'Salir de la sala',
  'controls.closeMenu': 'Cerrar menú',

  'chat.title': 'Chat de la sala',
  'chat.empty': 'Aún no hay mensajes. Saluda 👋',
  'chat.noKey':
    'No tienes la clave de esta sala, así que no puedes enviar mensajes. Pide el enlace de invitación original: la clave forma parte de él.',
  'chat.locked':
    'Cifrado — no tienes la clave de esta sala',
  'chat.messageLabel': 'Mensaje del chat',
  'chat.placeholder': 'Mensaje…  **negrita**, `código`, - lista',
  'chat.send': 'Enviar mensaje',
  'chat.toolbar': 'Formato del mensaje',
  'chat.unread': { one: 'mensaje nuevo', other: 'mensajes nuevos' },
  'chat.bold': 'Negrita',
  'chat.italic': 'Cursiva',
  'chat.strike': 'Tachado',
  'chat.code': 'Código',
  'chat.link': 'Enlace',
  'chat.list': 'Lista',
  'chat.quote': 'Cita',

  'latency.signal': 'Latencia con el servidor de señalización',
  'latency.peer': 'Latencia directa con {name}',

  // Community page — English source lives in en-US.ts, owned by its author.
  'community.back':
    'Volver al inicio',
  'community.title':
    'Freecord es open source',
  'community.lead':
    'Un lugar para hablar con amigos que no te pide nada: sin cuenta, sin descarga, sin nadie en medio. Lee el código, monta el tuyo o ayuda a mejorarlo.',
  'community.promise.title':
    'La promesa',
  'community.promise.guest.title':
    'Nunca habrá registro',
  'community.promise.guest.body':
    'Crea una sala y envía el enlace. El enlace es la credencial: un código aleatorio que nadie puede adivinar. No hay cuenta que crear, correo que entregar ni contraseña que olvidar.',
  'community.promise.p2p.title':
    'Sin servidor de medios en medio',
  'community.promise.p2p.body':
    'La voz, el vídeo y la pantalla van directos entre navegadores por WebRTC nativo, cifrados de extremo a extremo por defecto. El servidor solo transporta la señalización y el estado de la sala: no podría espiarte aunque quisiera.',
  'community.promise.chat.title':
    'Un chat que no deja rastro',
  'community.promise.chat.body':
    'Los mensajes se cifran en tu navegador con una clave que vive en el enlace de la sala. Ningún navegador envía el fragmento de la URL al servidor, así que el nuestro reenvía un texto que no puede leer, y tampoco guarda nada: el chat desaparece con la sala. La otra cara es honesta: quien tenga el enlace lee contigo, igual que puede entrar.',
  'community.promise.vendor.title':
    'Sin proveedor, sin SDK',
  'community.promise.vendor.body':
    'Ningún proveedor de medios y ningún SDK de terceros. Todo el protocolo está en el repositorio y el conjunto funciona sobre infraestructura gratuita. La única excepción posible es TURN, opcional: un relé para redes que bloquean la conexión directa; reenvía tráfico cifrado que no puede leer, y alojarlo tú mismo es cambiar una línea. Este servicio no tiene ninguno configurado hoy.',
  'community.source.title':
    'Lee el código',
  'community.source.body':
    'Está todo en GitHub bajo licencia MIT: úsalo, haz un fork, alójalo tú. El documento de arquitectura es la versión honesta: lo que cuesta de verdad una malla entre pares, por qué las salas se detienen en ocho personas y qué deudas están mapeadas en vez de escondidas.',
  'community.source.repo':
    'Ver en GitHub',
  'community.source.architecture':
    'Lee la arquitectura',
  'community.source.license':
    'Licencia MIT',
  'community.contribute.title':
    'Contribuye',
  'community.contribute.body':
    'Node 20 y dos comandos: esa es toda la preparación, sin cuenta, sin clave de API, sin nada que firmar. Elige algo pequeño, pasa el typecheck y los tests, abre un pull request.',
  'community.contribute.guide':
    'Guía de contribución',
  'community.contribute.conduct':
    'Código de conducta',
  'community.issues.title':
    '¿Encontraste un fallo? ¿Quieres algo?',
  'community.issues.body':
    'Las issues sirven para ambas cosas. En una app en tiempo real el contexto vale más que una traza: dinos tu navegador, cuánta gente había en la sala, si alguien compartía pantalla y si alguno de los lados estaba tras una VPN o una red corporativa.',
  'community.issues.report':
    'Reportar un fallo',
  'community.issues.browse':
    'Ver las issues',
  'community.desktop.title':
    'En el escritorio también',
  'community.desktop.body':
    'Una app para macOS, Windows y Linux envuelve esta misma página y añade lo que el navegador no da: un selector de pantalla nativo y permisos de medios reales del sistema. La descarga está en la página de inicio.',
  'community.footer':
    'Publicado bajo la licencia MIT. Hecho por Henrique Brito y colaboradores.',

  // Desktop download card. Target ids mirror DesktopTarget in the domain.
  'download.target.mac-arm64':
    'macOS · Apple Silicon',
  'download.target.mac-x64':
    'macOS · Intel',
  'download.target.windows-x64':
    'Windows · 64 bits',
  'download.target.linux-appimage':
    'Linux · AppImage',
  'download.target.linux-deb':
    'Linux · .deb',
  'download.hint.mac-arm64':
    'M1 en adelante',
  'download.hint.mac-x64':
    'Mac con Intel, hasta 2020',
  'download.hint.windows-x64':
    'Windows 10 y 11',
  'download.hint.linux-appimage':
    'Cualquier distro, sin instalar nada',
  'download.hint.linux-deb':
    'Debian, Ubuntu y derivadas',
  'download.cta':
    'Descargar la app para {os}',
  'download.also':
    'Freecord también tiene app de escritorio — con selector de pantalla nativo.',
  'download.firstRun.mac':
    'La app no está firmada con un certificado de Apple, así que macOS la bloquea al abrirla por primera vez. Ve a Ajustes del Sistema → Privacidad y Seguridad y pulsa “Abrir igualmente”; en macOS 14 o anterior, haz clic derecho en la app y elige Abrir.',
  'download.firstRun.windows':
    'Windows avisará de que el editor es desconocido (la app no está firmada): pulsa Más información → Ejecutar de todas formas.',
  'download.firstRun.linux':
    'Da permiso de ejecución al AppImage antes de abrirlo: chmod +x freecord-linux-x86_64.AppImage',
  'download.macOtherConfident':
    '¿Tu Mac es del otro tipo?',
  'download.macOtherUnsure':
    'No pudimos identificar tu Mac.',
  'download.macOtherArm':
    'Descargar la versión Apple Silicon',
  'download.macOtherIntel':
    'Descargar la versión Intel',
  'download.showOthers':
    'Otras plataformas',
  'download.hideOthers':
    'Ocultar otras plataformas',

  'language.picker': 'Idioma',
};
