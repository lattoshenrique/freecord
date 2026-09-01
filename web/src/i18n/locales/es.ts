import type { Catalog } from '..';

export const esES: Catalog = {
  'app.name': 'Freecord',
  'app.tagline':
    'Crea una sala y envía el enlace a tus amigos. Voz, vídeo, chat y pantalla compartida — sin registro.',

  'home.roomName': 'Nombre de la sala',
  'home.roomNamePlaceholder': 'Nombre de la sala (opcional)',
  'home.create': 'Crear sala',
  'home.creating': 'Creando…',
  'home.createFailed': 'No se pudo crear la sala. Inténtalo de nuevo.',
  'home.community': 'Comunidad',

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
    'Tus medios nunca pasan por nuestro servidor',
  'community.promise.p2p.body':
    'La voz, el vídeo y la pantalla van directos entre navegadores por WebRTC nativo, cifrados de extremo a extremo por defecto. El servidor solo transporta la señalización y el estado de la sala: no podría espiarte aunque quisiera.',
  'community.promise.chat.title':
    'Un chat que no deja rastro',
  'community.promise.chat.body':
    'Los mensajes viven en la sala y desaparecen con ella. Cero almacenamiento de contenido, a propósito: nada que filtrar, nada que vender, nada que entregar.',
  'community.promise.vendor.title':
    'Sin proveedor, sin SDK',
  'community.promise.vendor.body':
    'Ningún proveedor de medios, ningún SDK de terceros, ninguna credencial externa. Todo el protocolo está en el repositorio, y el conjunto funciona sobre infraestructura gratuita.',
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

  'language.picker': 'Idioma',
};
