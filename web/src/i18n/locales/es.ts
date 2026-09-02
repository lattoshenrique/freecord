import type { Catalog } from '..';

export const esES: Catalog = {
  'app.name': 'Freecord',
  'app.tagline':
    'Voz, vídeo, chat y pantalla en una malla P2P. Sin servidor de medios en medio.',
  'app.buildInfo': 'Versión {version} · build {build}',

  'home.roomName': 'Nombre de la sala',
  'home.roomNamePlaceholder': 'Nombre de la sala — o pega un enlace de invitación',
  'home.create': 'Crear sala',
  'home.creating': 'Creando…',
  'home.createFailed': 'No se pudo crear la sala. Inténtalo de nuevo.',
  'home.join': 'Entrar a la sala',
  'home.joinHint': 'Enlace de invitación — el botón te lleva a esa sala.',
  'home.invalidInvite':
    'Eso parece un enlace de invitación, pero está incompleto. Pega el enlace entero.',
  'home.community': 'Comunidad',

  'home.hero.titleA': 'Una sala es',
  'home.hero.titleB': 'solo un enlace.',
  'home.footer.downloads': 'Descargas',

  'home.card.hint': 'El enlace es la invitación.',

  'how.link': 'Cómo funciona',
  'how.title': 'Cómo funciona Freecord',
  'how.lead':
    'Una sala es un enlace, y la conversación va directa entre los navegadores que están en ella. Esto es lo que pasa después de pulsar el botón — y lo que nuestro servidor nunca ve.',

  'how.steps.title': 'Tres pasos',
  'how.step.create.title': 'Crea la sala',
  'how.step.create.body':
    'Ponle nombre o no. Recibes un enlace que nadie puede adivinar, y nada más: sin cuenta, sin correo, sin contraseña.',
  'how.step.share.title': 'Comparte el enlace',
  'how.step.share.body':
    'El enlace es la invitación y la credencial. Quien lo tiene, entra. La clave del chat viaja en la parte de la URL después del #, que los navegadores nunca envían a un servidor.',
  'how.step.talk.title': 'Habla',
  'how.step.talk.body':
    'Todo el mundo llega en silencio y sin cámara, y enciende lo que quiera. Hasta veinte personas. El audio y la pantalla compartida tienen prioridad siempre; las cámaras son las que compiten por sitio: en una sala llena entran menos, y la calidad de cada una se ajusta sola.',

  'how.mesh.title': 'El contenido nunca toca nuestro servidor',
  'how.mesh.body':
    'La voz, el vídeo y la pantalla fluyen de navegador a navegador por WebRTC nativo, cifrados de extremo a extremo. Nuestro servidor solo presenta los navegadores entre sí y guarda la lista de quién está en la sala — no hay servidor de medios que pueda espiar, ni factura que pagar por él. Una red demasiado restrictiva para una conexión directa necesitaría un relay TURN; no mantenemos ninguno, así que esas pocas conexiones fallan en vez de pasar en silencio por un tercero.',
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
    'Veinte personas por sala. Una sala vacía se cierra a los quince minutos. Un navegador que se calla treinta y cinco segundos pierde su sitio, para que una pestaña colgada no lo ocupe para siempre. Por encima de veinte la malla deja de ser la respuesta honesta: el siguiente paso es un nodo de medios propio, como la pantalla compartida ya retransmite entre pares.',

  'how.run.title': 'Ejecútalo tú mismo',
  'how.run.body':
    'Node 20 y dos comandos. Sin cuenta, sin clave de API, sin nada que firmar: el mismo protocolo corre en un portátil y en Cloudflare Workers.',
  'how.run.copy': 'Copiar comandos',
  'how.run.copied': '¡Copiado!',
  'how.more.start': 'Crear una sala',

  'invite.copy': 'Invitar',
  'invite.copied': '¡Enlace copiado!',
  'invite.manualCopy': 'Copia el enlace de la sala:',

  'prejoin.title': 'Entrar en {room}',
  'prejoin.yourName': 'Tu nombre',
  'prejoin.yourNamePlaceholder': '¿Cómo te llamamos?',
  'prejoin.mic': 'Micrófono',
  'prejoin.cam': 'Cámara',
  'prejoin.shuffle': 'Otro nombre',
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
  'prejoin.renameRoom': 'Renombrar la sala',
  'prejoin.renameFailed': 'No se pudo renombrar la sala.',

  'room.loading': 'Cargando sala…',
  'room.connecting': 'Conectando a la sala…',
  'room.participants': { one: '{count} participante', other: '{count} participantes' },
  'room.unnamed': 'Sala sin nombre',
  'room.you': 'tú',
  'room.someone': 'Alguien',
  'room.micMuted': 'Micrófono desactivado',
  'room.deafened': 'Altavoces apagados — no está escuchando',
  'room.leftTitle': 'Has salido de la sala',
  'room.endedFull': 'La sala está llena (máximo 20 personas).',
  'room.endedNotFound': 'La sala ya no existe.',
  'room.endedClosed': 'Se perdió la conexión con la sala.',
  'room.seatsAria': 'Asientos: {count} de {max} ocupados',
  'room.camSlotsFull': 'Las cámaras están completas por ahora — el audio sigue libre',
  'room.camDenied':
    'No hay hueco de cámara libre ahora mismo. La tuya podrá encenderse cuando alguien apague la suya.',

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
  'quality.sharp.hint': 'Código y texto — 1080p a 15 fps, nunca se difumina',
  'quality.balanced.label': 'Equilibrada',
  'quality.balanced.hint': 'Predeterminada — 1080p a 30 fps',
  'quality.smooth.label': 'Fluida',
  'quality.smooth.hint': 'Vídeo y juegos — 720p a 60 fps, prioriza el movimiento',

  'settings.title': 'Ajustes de la llamada',
  'controls.settings': 'Ajustes de la llamada',
  'settings.tab.screen': 'Compartir pantalla',
  'settings.tab.audio': 'Audio',
  'settings.tab.video': 'Vídeo',
  'settings.tab.general': 'General',
  'settings.screenAudio.title': 'Audio del ordenador',
  'settings.mic.profile': 'Perfil del micrófono',
  'settings.language.hint': 'Se aplica al instante y se recuerda en este dispositivo.',
  'settings.about.title': 'Acerca de',
  'settings.close': 'Cerrar ajustes',
  'settings.sounds.title': 'Sonidos',
  'settings.sounds.label': 'Efectos de sonido',
  'settings.sounds.hint': 'Avisos de mensajes nuevos y de gente que entra y sale.',
  'settings.desktop.title': 'Aplicación de escritorio',
  'settings.desktop.hint': 'Las mismas salas en una ventana propia, con la descarga para este ordenador.',
  'settings.screenAudio.label': 'Compartir el audio del equipo',
  'settings.screenAudio.hint': 'El sonido del sistema o de la pestaña sale junto con la pantalla — desde la próxima vez que compartas',
  'settings.mic.title': 'Micrófono',
  'settings.mic.voice.label': 'Voz',
  'settings.mic.voice.hint': 'Limpia el ambiente: eco y ruido eliminados, volumen nivelado',
  'settings.mic.music.label': 'Estudio',
  'settings.mic.music.hint': 'Estéreo sin filtros a bitrate alto — música e instrumentos, usa auriculares',
  'settings.mic.echoCancellation': 'Cancelación de eco',
  'settings.mic.noiseSuppression': 'Supresión de ruido',
  'settings.mic.autoGainControl': 'Volumen automático',
  'settings.camera.title': 'Cámara',
  'settings.camera.eco.label': 'Ahorro',
  'settings.camera.eco.hint': 'Ahorra datos — hasta 360p a 20 fps',
  'settings.camera.standard.label': 'Estándar',
  'settings.camera.standard.hint': 'Hasta 720p a 30 fps — la predeterminada',
  'settings.camera.high.label': 'Alta',
  'settings.camera.high.hint': 'Hasta 1080p a 30 fps — exige buena conexión',
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
  'controls.someoneSharing': 'Otra persona ya está compartiendo su pantalla',
  'controls.screensFull': 'Las tres pantallas ya están en uso',
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

  'chat.title': 'Chat de la sala',
  'chat.empty': 'Aún no hay mensajes. Saluda 👋',
  'chat.noKey':
    'No tienes la clave de esta sala, así que no puedes enviar mensajes. Pide el enlace de invitación original: la clave forma parte de él.',
  'chat.locked':
    'Cifrado — no tienes la clave de esta sala',
  'chat.messageLabel': 'Mensaje del chat',
  'chat.placeholder': 'Mensaje…',
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
  'file.direct': 'Va directo a la otra persona, nunca pasa por un servidor',
  'file.noPeers': 'Todavía no hay nadie más en la sala.',
  'file.tooLarge': 'Se pueden enviar archivos de hasta {max}.',
  'file.offer': '{name} quiere enviarte un archivo',
  'file.to': 'para {name}',
  'file.accept': 'Aceptar',
  'file.decline': 'Rechazar',
  'file.cancel': 'Cancelar',
  'file.save': 'Guardar',
  'file.dismiss': 'Descartar',
  'file.status.pending': 'Esperando a que {name} acepte…',
  'file.status.sending': 'Enviando… {percent}%',
  'file.status.receiving': 'Recibiendo… {percent}%',
  'file.status.sent': 'Enviado',
  'file.status.received': 'Recibido',
  'file.status.declined': 'Rechazado',
  'file.status.cancelled': 'Cancelado',
  'file.status.failed': 'La transferencia falló: la otra persona salió o se cayó la conexión.',
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
