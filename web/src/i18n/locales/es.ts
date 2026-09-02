import type { Catalog } from '..';

export const esES: Catalog = {
  'app.name': 'Freecord',
  'app.tagline':
    'Voz, vídeo, chat y pantalla sobre una malla P2P. Sin servidor de medios en medio, sin cuenta, sin truco.',
  'app.buildInfo': 'Versión {version} · build {build}',

  'desktop.window.room': 'Sala',
  'desktop.window.minimize': 'Minimizar',
  'desktop.window.maximize': 'Maximizar',
  'desktop.window.restore': 'Restaurar',
  'desktop.window.close': 'Cerrar',
  'desktop.menu.open': 'Menú',
  'desktop.menu.reload': 'Recargar',
  'desktop.menu.zoomIn': 'Acercar',
  'desktop.menu.zoomOut': 'Alejar',
  'desktop.menu.resetZoom': 'Tamaño real',
  'desktop.menu.fullscreen': 'Pantalla completa',
  'desktop.menu.devTools': 'Herramientas de desarrollo',
  'desktop.menu.openInBrowser': 'Abrir en el navegador',
  'desktop.menu.sourceCode': 'Código fuente',
  'desktop.menu.quit': 'Salir',

  'home.roomName': 'Nombre de la sala',
  'home.roomNamePlaceholder': 'Nombre de la sala — o pega un enlace de invitación',
  'home.create': 'Crear sala',
  'home.creating': [
    'Levantándola…',
    'Reservando una sala…',
    'Apartando un slug…',
  ],
  'home.createFailed': [
    'La sala se negó a arrancar. Prueba otra vez.',
    'No ha cuajado. Otro intento suele bastar.',
    'La sala ha dicho que no. Inténtalo de nuevo.',
  ],
  'home.join': 'Entrar a la sala',
  'home.joinHint': 'Eso es un enlace de invitación — el botón te mete directo.',
  'home.invalidInvite':
    'Eso es medio enlace de invitación. Pégalo entero, con # incluido — la clave de la sala vive después del #.',
  'home.community': 'Comunidad',

  'home.rooms': {
    one: 'Hasta ahora {total} sala ha pasado por aquí.',
    other: 'Hasta ahora {total} salas han pasado por aquí.',
  },

  'home.hero.titleA': 'Una sala es',
  'home.hero.titleB': 'solo un enlace.',
  'home.footer.downloads': 'Descargas',

  'home.card.hint': 'El enlace es la invitación. Esa es toda la capa de autenticación.',

  'how.link': 'Cómo funciona',
  'how.title': 'Cómo funciona Freecord',
  'how.lead':
    'Una sala es un enlace, y la conversación va directa entre los navegadores que están en ella. Esto es lo que pasa después de pulsar el botón — y lo que nuestro servidor nunca ve.',

  'how.steps.title': 'Tres pasos',
  'how.step.create.title': 'Crea la sala',
  'how.step.create.body':
    'Ponle nombre o no. Recibes un enlace que nadie puede adivinar, y nada más: sin cuenta, sin correo, sin contraseña que olvidar.',
  'how.step.share.title': 'Comparte el enlace',
  'how.step.share.body':
    'El enlace es la invitación y la credencial. Quien lo tiene, entra. La clave del chat viaja en la parte de la URL después del #, que los navegadores nunca envían a un servidor.',
  'how.step.talk.title': 'Habla',
  'how.step.talk.body':
    'Todo el mundo llega en silencio y sin cámara, y enciende lo que quiera. Hasta veinte personas. El audio y la pantalla compartida tienen prioridad siempre; las cámaras son las que compiten por sitio: en una sala llena entran menos, y la calidad de cada una se ajusta sola.',

  'how.mesh.title': 'El contenido nunca toca nuestro servidor',
  'how.mesh.body':
    'La voz, el vídeo y la pantalla van de navegador a navegador por WebRTC nativo, cifrados de extremo a extremo. Nuestro servidor presenta los navegadores entre sí y guarda la lista de quién está en la sala: no hay servidor de medios que pueda escuchar, ni factura que pagar por uno. Una cosa más, y solo cuando alguien la pide: pega una página en la herramienta de vídeo y el servidor abre esa página una vez, lee en su marcado qué se puede reproducir, responde y no guarda nada. Tampoco ahí pasa ningún medio por él: cada navegador descarga el vídeo de donde viva. Una red demasiado restrictiva para una conexión directa necesitaría un relay TURN; no tenemos ninguno, así que esas pocas conexiones fallan en vez de pasar en silencio por un tercero.',
  'how.diagram.media': 'Voz, vídeo y pantalla: directo entre los navegadores',
  'how.diagram.signaling': 'Por el servidor, solo la señalización: quién está en la sala y cómo llegar a cada uno',

  'how.chat.title': 'El chat va sellado, y es temporal',
  'how.chat.body':
    'Los mensajes se cifran en tu navegador con la clave que venía en el enlace y van directos a los otros navegadores, como la voz; el servidor solo retransmite uno cuando falta un camino directo, y retransmite un texto que no puede leer. Los archivos ni siquiera pasan por él. No se guarda nada: cuando la sala se cierra, la conversación se va con ella.',

  'how.screen.title': 'Hasta tres pantallas a la vez, cada una retransmitida en árbol',
  'how.screen.body':
    'El servidor concede como máximo tres plazas de pantalla, y libera una en segundos si se le cae la conexión a quien comparte. Una pantalla no va de quien comparte a todo el mundo: llega a tres pares, y cada uno la reenvía a otros tres, así la subida de nadie crece con la sala. Cada pantalla compartida tiene su propio árbol.',

  'how.limits.title': 'Las reglas que sigue la sala',
  'how.limits.body':
    'Veinte personas por sala. Una sala vacía se cierra a los quince minutos. Un navegador que se queda callado treinta y cinco segundos pierde su sitio, para que una pestaña colgada no lo ocupe para siempre. Por encima de veinte la malla deja de ser la respuesta honesta: el siguiente paso es un nodo de medios propio, igual que la pantalla compartida ya se retransmite entre pares.',

  'how.run.title': 'Monta la tuya',
  'how.run.body':
    'Node 20 y dos comandos. Sin cuenta, sin clave de API, sin nada que firmar: el mismo protocolo corre en tu portátil y en Cloudflare Workers, y ninguno de los dos nota la diferencia.',
  'how.run.copy': 'Copiar comandos',
  'how.run.copied': '¡Copiado!',
  'how.more.start': 'Crear una sala',

  'invite.copy': 'Invitar',
  'invite.copied': [
    '¡Copiado! Ve a pegarlo por ahí.',
    'Copiado. Lo tiene el portapapeles.',
    'Copiado — ahora ve a por la gente.',
  ],
  'invite.manualCopy': 'Copia el enlace de la sala:',

  'prejoin.title': 'Entrar en {room}',
  'prejoin.yourName': 'Tu nombre',
  'prejoin.yourNamePlaceholder': 'Cualquier alias vale — nadie lo comprueba',
  'prejoin.mic': 'Micrófono',
  'prejoin.cam': 'Cámara',
  'prejoin.shuffle': 'Otro nombre al azar',
  'prejoin.join': 'Entrar',
  'prejoin.notFound': 'Esta sala ya no está.',
  'prejoin.loadFailed': 'La sala no cargó.',
  'prejoin.backHome': 'Volver al inicio',

  'prejoin.notFoundTitle': 'Sala no encontrada',
  'prejoin.notFoundBody':
    'El enlace puede haber caducado — una sala vacía pasa por el recolector de basura a los quince minutos.',
  'prejoin.createNew': 'Crear una sala nueva',
  'prejoin.errorTitle': [
    'Pues se ha roto',
    'En mi máquina funciona',
    'No era el plan',
  ],
  'prejoin.errorBody':
    'La sala no cargó. Recarga la página — lo arregla más veces de las que nos gustaría admitir.',
  'prejoin.empty': [
    'Todavía no hay nadie: serías el proceso 1.',
    'Sala vacía. Elige sitio, están todos libres.',
    'Todavía no hay nadie. Cero pares, todo el ancho de banda.',
    'Sigue vacía — la malla no tiene con quién entrelazarse.',
  ],
  'prejoin.inRoom': { one: '{count} persona en la sala.', other: '{count} personas en la sala.' },
  'prejoin.joinRoom': 'Entrar en la sala',
  'prejoin.renameRoom': 'Renombrar la sala',
  'prejoin.renameFailed': 'El nombre nuevo no cuajó. Inténtalo otra vez.',

  'room.loading': [
    'Arrancando la sala…',
    'Despertando la sala…',
    'Calentando la malla…',
  ],
  'room.connecting': [
    'Intercambiando candidatos ICE…',
    'Presentando tu navegador a los demás…',
    'Negociando con la malla…',
    'Dándonos la mano, con educación…',
  ],
  'room.participants': { one: '{count} participante', other: '{count} participantes' },
  'room.unnamed': 'Sala sin nombre',
  'room.you': 'tú',
  'room.someone': 'Alguien',
  'room.micMuted': 'Micro apagado',
  'room.deafened': 'Altavoces apagados — no oyes nada',
  'room.leftTitle': [
    'Has salido de la sala. o7',
    'Desconectado. o7',
    'Sesión terminada. o7',
  ],
  'room.endedFull':
    'La sala está llena — veinte es el tope. Más allá, una malla deja de ser honesta.',
  'room.endedNotFound': 'Esta sala ya no está. Las salas vacías se cierran solas.',
  'room.endedClosed': 'Se cayó la conexión con la sala. Pasa; el enlace sigue valiendo.',
  'room.reconnecting':
    'Reconectando con el servidor de la sala — la llamada entre ustedes sigue sin él.',
  'room.endedRetry': 'Volver a entrar',
  'room.seats': { one: '{count}/{max} participante', other: '{count}/{max} participantes' },
  'room.seatsAria': 'Asientos: {count} de {max} ocupados',
  'room.camSlotsFull': 'No quedan plazas de cámara — el audio nunca se acaba',
  'room.camDenied':
    'Ahora mismo no hay ninguna plaza de cámara libre. La tuya entra en cuanto alguien apague la suya.',

  'screen.yours': 'Tu pantalla',
  'screen.of': 'Pantalla de {name}',
  'screen.via': 'vía {name}',
  'screen.sending': 'Enviando',
  'screen.receiving': 'Recibiendo',
  'screen.enterFullscreen': 'Ver en pantalla completa',
  'screen.exitFullscreen': 'Salir de pantalla completa',
  'screen.enterPip': 'Ver en una ventana flotante',
  'screen.exitPip': 'Cerrar la ventana flotante',

  'quality.title': 'Calidad de la pantalla',
  'quality.sharp.label': 'Nítida',
  'quality.sharp.hint': 'Para leer código — 1080p a 15 fps, cada punto y coma legible',
  'quality.balanced.label': 'Equilibrada',
  'quality.balanced.hint': 'La de por defecto — 1080p a 30 fps',
  'quality.smooth.label': 'Fluida',
  'quality.smooth.hint': 'Para demos y juegos — 720p a 60 fps, movimiento antes que píxeles',

  'settings.title': 'Ajustes de la llamada',
  'controls.settings': 'Ajustes de la llamada',
  'settings.tab.screen': 'Compartir pantalla',
  'settings.tab.audio': 'Audio',
  'settings.tab.video': 'Vídeo',
  'settings.tab.general': 'General',
  'settings.screenAudio.title': 'Audio del ordenador',
  'settings.mic.profile': 'Perfil del micrófono',
  'settings.language.hint':
    'Se aplica al momento y se queda en este dispositivo. Sin recargar, sin reiniciar.',
  'participation.title': 'Lo que llega hasta ti',
  'participation.screens.label': 'Pantallas de los demás',
  'participation.screens.hint':
    'Apagado, la pantalla no se envía aquí — se rechaza en el origen, no se esconde al llegar. La tuya sigue saliendo cuando compartes.',
  'participation.tools.label': 'Lo que la sala ponga',
  'participation.tools.hint':
    'Apagado, el vídeo, la página y sus scripts no se cargan aquí. La sala sigue mirando; la tecla del estante te deja entrar cuando quieras.',
  'participation.toolOffTitle': 'Te quedaste fuera de esta',
  'participation.toolOffBody': 'La sala está en {tool}. Nada de eso se está cargando aquí.',
  'participation.toolJoinOnce': 'Entrar en {tool} solo esta vez',
  'participation.slowTitle': 'Tu conexión lo está pasando mal',
  'participation.slowBody':
    'Las pantallas ajenas son lo más pesado que llega. Apagarlas conserva las voces.',
  'participation.slowAccept': 'Apagar las pantallas',
  'participation.slowDismiss': 'Mantenerlas',
  'settings.about.title': 'Acerca de',
  'settings.close': 'Cerrar ajustes',
  'settings.sounds.title': 'Sonidos',
  'settings.sounds.label': 'Efectos de sonido',
  'settings.sounds.hint': 'Un bip cuando llega un mensaje y cuando alguien entra.',
  'settings.desktop.title': 'Aplicación de escritorio',
  'settings.desktop.hint':
    'Las mismas salas en una ventana propia, con selector de pantalla nativo y la descarga para este ordenador.',
  'settings.screenAudio.label': 'Compartir el audio del equipo',
  'settings.screenAudio.hint':
    'El sonido del sistema o de la pestaña viaja con tu pantalla — a partir del próximo compartido, no de este',
  'settings.mic.title': 'Micrófono',
  'settings.mic.voice.label': 'Voz',
  'settings.mic.voice.hint':
    'Limpia tu habitación: sin eco, sin ruido de ventilador, volumen nivelado',
  'settings.mic.music.label': 'Estudio',
  'settings.mic.music.hint':
    'Estéreo crudo a bitrate alto — música e instrumentos. Ponte auriculares, salvo que te guste el acople.',
  'settings.mic.echoCancellation': 'Cancelación de eco',
  'settings.mic.noiseSuppression': 'Supresión de ruido',
  'settings.mic.autoGainControl': 'Volumen automático',
  'settings.camera.title': 'Cámara',
  'settings.camera.eco.label': 'Ahorro',
  'settings.camera.eco.hint': 'Para el wifi del hotel — hasta 360p a 20 fps',
  'settings.camera.standard.label': 'Estándar',
  'settings.camera.standard.hint': 'Hasta 720p a 30 fps — la sensata',
  'settings.camera.high.label': 'Alta',
  'settings.camera.high.hint': 'Hasta 1080p a 30 fps — trae una conexión de verdad',
  'settings.device.mic': 'Dispositivo del micrófono',
  'settings.device.speaker': 'Salida de sonido',
  'settings.device.default': 'Predeterminado del sistema',
  'settings.device.mic.fallback': 'Micrófono {number}',
  'settings.device.speaker.fallback': 'Altavoz {number}',

  'controls.muteMic': 'Silenciar micrófono',
  'controls.unmuteMic': 'Activar micrófono',
  'controls.muteSpeaker': 'Silenciar altavoces',
  'controls.unmuteSpeaker': 'Reactivar altavoces',
  'controls.camOff': 'Apagar cámara',
  'controls.camOn': 'Encender cámara',
  'controls.shareScreen': 'Compartir pantalla',
  'controls.stopSharing': 'Dejar de compartir',
  'controls.someoneSharing': 'Ahora mismo la pantalla la tiene otra persona',
  'controls.screensFull': 'Las tres plazas de pantalla están ocupadas — tres es el límite',
  'layout.spotlight': 'Destacado',
  'layout.grid': 'Cuadrícula',
  'controls.layout': 'Diseño: {name}. Pulsa L para cambiar',
  'room.pinned': 'Fijo en el escenario',
  'room.pinHint': 'Clic para fijar en el escenario',
  'room.unpin': 'Desfijar: el escenario vuelve a seguir la sala',
  'controls.quality': 'Calidad de la pantalla compartida',
  'controls.openChat': 'Abrir chat',
  'controls.closeChat': 'Cerrar chat',
  'controls.leave': 'Salir de la sala',
  'controls.closeMenu': 'Cerrar menú',
  'controls.dock': 'Controles de la llamada',
  'controls.tools': 'Herramientas',

  'tools.title': 'Herramientas',
  'tools.on': 'en marcha',
  'tools.empty': 'Esta compilación no trae ninguna herramienta.',
  'tools.full': 'La sala ya lleva todas las herramientas que caben.',

  'chat.title': 'Chat de la sala',
  'chat.empty': [
    'Aún no hay mensajes. Bip bop — saluda 👋',
    'Log vacío. Alguien tiene que escribir la primera línea 👋',
    'Aquí no hay nada. Haz commit del primer mensaje 👋',
    'Silencio. Bip bop — rómpelo 👋',
  ],
  'chat.noKey':
    'Tu enlace vino sin la clave de esta sala, así que no puede salir nada. Pide el enlace original a quien te invitó — la clave viaja después del # y nunca llega a un servidor.',
  'chat.locked': 'Cifrada — y tu enlace vino sin la clave',
  'chat.messageLabel': 'Mensaje del chat',
  'chat.placeholder': 'Mensaje… el markdown funciona',
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
  'chat.emoji': 'Emoji',
  'chat.format': 'Formato',
  'chat.reply': 'Responder',
  'chat.replyingTo': 'Respondiendo a {name}',
  'chat.cancelReply': 'Cancelar respuesta',
  'chat.jumpToLatest': 'Ir a los mensajes nuevos',

  'file.attach': 'Enviar un archivo',
  'file.direct': 'Va directo por un canal de datos — sin servidor, sin subida, sin bucket',
  'file.noPeers': [
    'Todavía no hay nadie aquí a quien mandárselo.',
    'Sin pares no hay transferencia: invita a alguien primero.',
    'Un archivo necesita quien lo reciba, y aquí no hay nadie.',
  ],
  'file.tooLarge': 'Hasta {max} por archivo — más allá el navegador se rinde.',
  'file.offer': '{name} quiere enviarte un archivo',
  'file.to': 'para {name}',
  'file.accept': 'Aceptar',
  'file.decline': 'Rechazar',
  'file.cancel': 'Cancelar',
  'file.save': 'Guardar',
  'file.dismiss': 'Descartar',
  'file.status.pending': 'Esperando a {name}…',
  'file.status.sending': 'Enviando… {percent}%',
  'file.status.receiving': 'Recibiendo… {percent}%',
  'file.status.sent': 'Enviado',
  'file.status.received': 'Recibido',
  'file.status.declined': 'Rechazado',
  'file.status.cancelled': 'Cancelado',
  'file.status.failed': 'Falló la transferencia — la otra persona se fue, o se cayó la conexión.',
  'file.preview': 'Abrir imagen a tamaño real',
  'file.closePreview': 'Cerrar imagen',
  'file.toMany': { one: 'para {count} persona', other: 'para {count} personas' },
  'file.status.summary': 'Recibido por {done} de {total}',
  'file.status.declinedCount': { one: '{count} rechazó', other: '{count} rechazaron' },

  'latency.signal': 'Latencia con el servidor de señalización',
  'latency.peer': 'Latencia directa con {name}',
  'latency.self': 'Tu latencia en la malla — el medio de tus enlaces',

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
    'Está todo en GitHub bajo licencia MIT: úsalo, haz un fork, alójalo tú. El documento de arquitectura es la versión honesta: lo que cuesta de verdad una malla entre pares, por qué las salas se detienen en veinte y qué deudas están mapeadas en vez de escondidas.',
  'community.source.repo':
    'Ver en GitHub',
  'community.source.architecture':
    'Lee la arquitectura',
  'community.source.license':
    'Licencia MIT',
  'community.contribute.title':
    'Contribuye',
  'community.contribute.body':
    'Node 20 y dos comandos es toda la instalación — sin cuenta, sin clave de API, sin registrarse en nada. Coge algo pequeño, pasa el comprobador de tipos y los tests, abre un pull request.',
  'community.contribute.guide':
    'Guía de contribución',
  'community.contribute.conduct':
    'Código de conducta',
  'community.issues.title': '¿Has encontrado un fallo? ¿Quieres algo?',
  'community.issues.body':
    'Las issues sirven para ambas cosas. En una app en tiempo real el contexto vale más que una traza: dinos tu navegador, cuánta gente había en la sala, si alguien compartía pantalla y si alguno de los lados estaba tras una VPN o una red corporativa.',
  'community.issues.report':
    'Reportar un fallo',
  'community.issues.browse':
    'Ver las issues',
  'community.desktop.title':
    'En el escritorio también',
  'community.desktop.body':
    'Una app para macOS, Windows y Linux envuelve esta misma página y añade lo que el navegador no da: un selector de pantalla nativo y permisos de medios reales del sistema.',
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
  'download.macOtherUnsure': 'Tu Mac se ha negado a decir cuál es.',
  'download.macOtherArm':
    'Descargar la versión Apple Silicon',
  'download.macOtherIntel':
    'Descargar la versión Intel',
  'download.showOthers':
    'Otras plataformas',
  'download.hideOthers':
    'Ocultar otras plataformas',

  /*
   * Instalar desde el navegador: en el móvil es toda la historia de
   * "descargar la app", porque allí no hay nada que descargar — la página es
   * la app.
   *
   * Los pasos son el rincón de este catálogo sin ninguna broma. Hay alguien
   * con el móvil en la mano siguiéndolos.
   */
  'install.cta': 'Instalar la app',
  'install.title': 'Instalar Freecord',
  'install.lead':
    'Se abre desde la pantalla de inicio, en una ventana propia: las mismas salas, sin el navegador alrededor.',
  'install.also':
    'En el móvil no hay nada que descargar. Esta página es la app: ponla en tu pantalla de inicio y se abre como tal.',
  'install.ios.step1': 'Toca el botón Compartir de la barra del navegador.',
  'install.ios.step2': 'Elige “Añadir a pantalla de inicio”.',
  'install.menu.step1': 'Abre el menú de tu navegador.',
  'install.menu.step2': 'Elige “Instalar app” o “Añadir a pantalla de inicio”.',
  'install.gotIt': 'Entendido',
  // La misma oferta dentro de una llamada, donde un ordenador ve la descarga.
  'install.settings.title': 'En tu pantalla de inicio',
  'install.settings.hint':
    'Instala Freecord como app: las mismas salas en una ventana propia, sin el navegador alrededor.',

  'language.picker': 'Idioma',
};
