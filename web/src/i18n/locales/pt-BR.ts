import type { Catalog } from '..';

export const ptBR: Catalog = {
  'app.name': 'Freecord',
  'app.tagline':
    'Voz, vídeo, chat e tela numa malha P2P. Sem servidor de mídia no meio, sem conta, sem pegadinha.',
  'app.buildInfo': 'Versão {version} · build {build}',

  'desktop.window.room': 'Sala',
  'desktop.window.minimize': 'Minimizar',
  'desktop.window.maximize': 'Maximizar',
  'desktop.window.restore': 'Restaurar',
  'desktop.window.close': 'Fechar',
  'desktop.menu.open': 'Menu',
  'desktop.menu.reload': 'Recarregar',
  'desktop.menu.zoomIn': 'Aumentar zoom',
  'desktop.menu.zoomOut': 'Diminuir zoom',
  'desktop.menu.resetZoom': 'Tamanho normal',
  'desktop.menu.fullscreen': 'Tela cheia',
  'desktop.menu.devTools': 'Ferramentas de desenvolvedor',
  'desktop.menu.openInBrowser': 'Abrir no navegador',
  'desktop.menu.sourceCode': 'Código-fonte',
  'desktop.menu.quit': 'Sair',

  'home.roomName': 'Nome da sala',
  'home.roomNamePlaceholder': 'Nome da sala — ou cole um link de convite',
  'home.create': 'Criar sala',
  'home.creating': [
    'Subindo…',
    'Alocando uma sala…',
    'Reservando um slug…',
  ],
  'home.createFailed': [
    'A sala se recusou a subir. Tenta de novo.',
    'Não colou. Mais uma tentativa costuma resolver.',
    'A sala disse não. Tenta outra vez.',
  ],
  'home.join': 'Entrar na sala',
  'home.joinHint': 'Isso é um link de convite — o botão te leva direto para dentro.',
  'home.invalidInvite':
    'Isso é meio link de convite. Cola inteiro, com # e tudo — a chave da sala mora depois do #.',
  'home.community': 'Comunidade',

  'home.rooms': {
    one: '{total} sala já aconteceu por aqui.',
    other: '{total} salas já aconteceram por aqui.',
  },

  'home.hero.titleA': 'Uma sala é',
  'home.hero.titleB': 'só um link.',
  'home.footer.downloads': 'Downloads',

  'home.card.hint': 'O link é o convite. É essa a camada de autenticação inteira.',

  'how.link': 'Como funciona',
  'how.title': 'Como o Freecord funciona',
  'how.lead':
    'Uma sala é um link, e a conversa vai direto entre os navegadores que estão nela. Isto é o que acontece depois que você aperta o botão — e o que o nosso servidor nunca vê.',

  'how.steps.title': 'Três passos',
  'how.step.create.title': 'Crie a sala',
  'how.step.create.body':
    'Dê um nome ou não dê. Você recebe de volta um link que ninguém adivinha, e mais nada: sem conta, sem e-mail, sem senha para esquecer.',
  'how.step.share.title': 'Mande o link',
  'how.step.share.body':
    'O link é o convite e a credencial. Quem tem, entra. A chave do chat viaja no pedaço da URL depois do #, que o navegador nunca manda para um servidor.',
  'how.step.talk.title': 'Converse',
  'how.step.talk.body':
    'Todo mundo chega mudo e sem câmera, e liga o que quiser. Até vinte pessoas. Áudio e tela compartilhada têm prioridade sempre; as câmeras é que disputam espaço — numa sala cheia entram menos, e a qualidade de cada uma se ajusta sozinha.',

  'how.mesh.title': 'A mídia nunca toca o nosso servidor',
  'how.mesh.body':
    'Voz, vídeo e tela fluem de navegador para navegador por WebRTC nativo, criptografados fim a fim. O nosso servidor apresenta os navegadores uns aos outros e guarda a lista de quem está na sala — não existe servidor de mídia para bisbilhotar, nem conta para pagar por ele. Uma coisa a mais, e só quando alguém pede: cole uma página na ferramenta de vídeo e o servidor abre aquela página uma vez, lê na marcação o que dá para tocar, responde e não guarda nada. Nem aí passa mídia por ele — cada navegador busca o vídeo onde ele mora. Uma rede restritiva demais para conexão direta precisaria de um relay TURN; não mantemos nenhum, então essas poucas conexões falham em vez de passar caladas por um terceiro.',
  'how.diagram.media': 'Voz, vídeo e tela: direto entre os navegadores',
  'how.diagram.signaling': 'Pelo servidor, só a sinalização: quem está na sala e como alcançar cada um',

  'how.chat.title': 'O chat é lacrado e temporário',
  'how.chat.body':
    'As mensagens são cifradas no seu navegador com a chave que veio no link e vão direto para os outros navegadores, como a voz; o servidor só repassa uma quando falta um caminho direto, e repassa um texto que não consegue ler. Arquivos nem passam por ele. Nada é guardado: quando a sala fecha, a conversa vai junto.',

  'how.screen.title': 'Até três telas ao mesmo tempo, cada uma repassada em árvore',
  'how.screen.body':
    'O servidor concede no máximo três vagas de tela, e libera uma em segundos se a conexão de quem compartilha cair. Uma tela não vai de quem compartilha para todo mundo: ela chega a três pares, e cada um repassa para outros três, então o upload de ninguém cresce junto com a sala. Cada tela compartilhada tem uma árvore só sua.',

  'how.limits.title': 'As regras que a sala segue',
  'how.limits.body':
    'Vinte pessoas por sala. Uma sala vazia fecha em quinze minutos. Um navegador que fica trinta e cinco segundos calado perde o lugar, para uma aba travada não ficar de posse de uma vaga para sempre. Acima de vinte a malha deixa de ser a resposta honesta: o próximo passo é um nó de mídia nosso, do jeito que o compartilhamento de tela já repassa entre os pares.',

  'how.run.title': 'Rode o seu',
  'how.run.body':
    'Node 20 e dois comandos. Sem conta, sem chave de API, sem nada para assinar: o mesmo protocolo roda no seu notebook e no Cloudflare Workers, e os dois não notam a diferença.',
  'how.run.copy': 'Copiar comandos',
  'how.run.copied': 'Copiado!',
  'how.more.start': 'Criar uma sala',

  'invite.copy': 'Convidar',
  'invite.copied': [
    'Copiado! Agora cola em algum lugar.',
    'Copiado. Tá na área de transferência.',
    'Copiado — agora vai buscar gente.',
  ],
  'invite.manualCopy': 'Copie o link da sala:',

  'prejoin.title': 'Entrar em {room}',
  'prejoin.yourName': 'Seu nome',
  'prejoin.yourNamePlaceholder': 'Qualquer apelido serve — ninguém confere',
  'prejoin.mic': 'Microfone',
  'prejoin.cam': 'Câmera',
  'prejoin.shuffle': 'Sortear outro nome',
  'prejoin.join': 'Entrar',
  'prejoin.notFound': 'Esta sala já era.',
  'prejoin.loadFailed': 'A sala não carregou.',
  'prejoin.backHome': 'Voltar ao início',

  'prejoin.notFoundTitle': 'Sala não encontrada',
  'prejoin.notFoundBody':
    'O link pode ter expirado — sala vazia é coletada como lixo depois de quinze minutos.',
  'prejoin.createNew': 'Criar uma nova sala',
  'prejoin.errorTitle': [
    'Deu ruim',
    'Na minha máquina funciona',
    'Não era esse o plano',
  ],
  'prejoin.errorBody':
    'A sala não carregou. Recarrega a página — resolve mais vezes do que a gente gostaria de admitir.',
  'prejoin.empty': [
    'Ninguém aqui ainda — você seria o processo 1.',
    'Sala vazia. Escolhe o lugar que quiser, tá tudo livre.',
    'Ninguém aqui ainda. Zero pares, toda a banda pra você.',
    'Continua vazia — a malha não tem com quem se entrelaçar.',
  ],
  'prejoin.inRoom': { one: '{count} pessoa na sala.', other: '{count} pessoas na sala.' },
  'prejoin.joinRoom': 'Entrar na sala',
  'prejoin.renameRoom': 'Renomear a sala',
  'prejoin.renameFailed': 'O nome novo não colou. Tenta de novo.',

  'room.loading': [
    'Subindo a sala…',
    'Acordando a sala…',
    'Esquentando a malha…',
  ],
  'room.connecting': [
    'Trocando candidatos ICE…',
    'Apresentando o seu navegador aos outros…',
    'Negociando com a malha…',
    'Apertando as mãos, educadamente…',
  ],
  'room.participants': { one: '{count} participante', other: '{count} participantes' },
  'room.unnamed': 'Sala sem nome',
  'room.you': 'você',
  'room.someone': 'Alguém',
  'room.micMuted': 'Mic desligado',
  'room.deafened': 'Alto-falantes desligados — não está ouvindo nada',
  'room.leftTitle': [
    'Você saiu da sala. o7',
    'Desconectado. o7',
    'Sessão encerrada. o7',
  ],
  'room.endedFull':
    'A sala está cheia — vinte é o teto. Acima disso a malha deixa de ser honesta.',
  'room.endedNotFound': 'Esta sala já era. Sala vazia fecha sozinha.',
  'room.endedClosed': 'A conexão com a sala caiu. Acontece; o link continua valendo.',
  'room.reconnecting':
    'Reconectando com o servidor da sala — a chamada de vocês segue sem ele.',
  'room.endedRetry': 'Tentar entrar de novo',
  'room.seats': { one: '{count}/{max} participante', other: '{count}/{max} participantes' },
  'room.seatsAria': 'Assentos: {count} de {max} ocupados',
  'room.camSlotsFull': 'Vagas de câmera esgotadas — áudio nunca acaba',
  'room.camDenied':
    'Nenhuma vaga de câmera livre agora. A sua liga no instante em que alguém desligar a dela.',

  'screen.yours': 'Sua tela',
  'screen.of': 'Tela de {name}',
  'screen.via': 'via {name}',
  'screen.sending': 'Enviando',
  'screen.receiving': 'Recebendo',
  'screen.enterFullscreen': 'Ver em tela cheia',
  'screen.exitFullscreen': 'Sair da tela cheia',
  'screen.enterPip': 'Ver em janela flutuante',
  'screen.exitPip': 'Fechar a janela flutuante',

  'quality.title': 'Qualidade da tela',
  'quality.sharp.label': 'Nítida',
  'quality.sharp.hint': 'Para ler código — 1080p a 15 fps, cada ponto e vírgula legível',
  'quality.balanced.label': 'Equilibrada',
  'quality.balanced.hint': 'O padrão — 1080p a 30 fps',
  'quality.smooth.label': 'Fluida',
  'quality.smooth.hint': 'Para demo e jogo — 720p a 60 fps, movimento acima de pixel',

  'settings.title': 'Configurações da chamada',
  'controls.settings': 'Configurações da chamada',
  'settings.tab.screen': 'Compartilhar tela',
  'settings.tab.audio': 'Áudio',
  'settings.tab.video': 'Vídeo',
  'settings.tab.general': 'Geral',
  'settings.screenAudio.title': 'Áudio do computador',
  'settings.mic.profile': 'Perfil do microfone',
  'settings.language.hint':
    'Vale na hora e fica salvo neste dispositivo. Sem recarregar, sem reiniciar.',
  'participation.title': 'O que chega até você',
  'participation.screens.label': 'Telas dos outros',
  'participation.screens.hint':
    'Desligado, a tela não é enviada para cá — recusada na origem, não escondida depois de chegar. A sua continua saindo quando você compartilha.',
  'participation.tools.label': 'O que a sala colocar no ar',
  'participation.tools.hint':
    'Desligado, o vídeo, a página e os scripts deles não carregam aqui. A sala continua assistindo; a tecla da estante te deixa entrar quando quiser.',
  'participation.toolOffTitle': 'Você ficou de fora desta',
  'participation.toolOffBody': 'A sala está em {tool}. Nada disso está carregando aqui.',
  'participation.toolJoinOnce': 'Entrar em {tool} só desta vez',
  'participation.slowTitle': 'Sua conexão está sofrendo',
  'participation.slowBody':
    'As telas dos outros são o mais pesado que chega. Desligar elas preserva as vozes.',
  'participation.slowAccept': 'Desligar as telas',
  'participation.slowDismiss': 'Manter',
  'settings.about.title': 'Sobre',
  'settings.close': 'Fechar configurações',
  'settings.sounds.title': 'Sons',
  'settings.sounds.label': 'Efeitos sonoros',
  'settings.sounds.hint': 'Uns blips quando chega mensagem e quando alguém entra.',
  'settings.desktop.title': 'App para computador',
  'settings.desktop.hint':
    'As mesmas salas numa janela própria, com seletor de tela nativo e o download certo para este computador.',
  'settings.screenAudio.label': 'Compartilhar áudio do computador',
  'settings.screenAudio.hint':
    'O som do sistema ou da aba vai junto com a tela — a partir do próximo compartilhamento, não deste',
  'settings.mic.title': 'Microfone',
  'settings.mic.voice.label': 'Voz',
  'settings.mic.voice.hint':
    'Limpa a bagunça do ambiente: eco fora, ruído de cooler fora, volume nivelado',
  'settings.mic.music.label': 'Estúdio',
  'settings.mic.music.hint':
    'Estéreo cru em bitrate alto — música e instrumento. Use fone, a não ser que goste de microfonia.',
  'settings.mic.echoCancellation': 'Cancelamento de eco',
  'settings.mic.noiseSuppression': 'Supressão de ruído',
  'settings.mic.autoGainControl': 'Volume automático',
  'settings.camera.title': 'Câmera',
  'settings.camera.eco.label': 'Econômica',
  'settings.camera.eco.hint': 'Para wifi de hotel — até 360p a 20 fps',
  'settings.camera.standard.label': 'Padrão',
  'settings.camera.standard.hint': 'Até 720p a 30 fps — o sensato',
  'settings.camera.high.label': 'Alta',
  'settings.camera.high.hint': 'Até 1080p a 30 fps — traga conexão de verdade',
  'settings.device.mic': 'Dispositivo do microfone',
  'settings.device.speaker': 'Saída de som',
  'settings.device.default': 'Padrão do sistema',
  'settings.device.mic.fallback': 'Microfone {number}',
  'settings.device.speaker.fallback': 'Alto-falante {number}',

  'controls.muteMic': 'Silenciar microfone',
  'controls.unmuteMic': 'Ativar microfone',
  'controls.muteSpeaker': 'Silenciar alto-falantes',
  'controls.unmuteSpeaker': 'Reativar alto-falantes',
  'controls.camOff': 'Desligar câmera',
  'controls.camOn': 'Ligar câmera',
  'controls.shareScreen': 'Compartilhar tela',
  'controls.stopSharing': 'Parar de compartilhar',
  'controls.someoneSharing': 'Outra pessoa está com a tela agora',
  'controls.screensFull': 'As três vagas de tela estão ocupadas — três é o limite',
  'layout.spotlight': 'Destaque',
  'layout.grid': 'Grade',
  'controls.layout': 'Layout: {name}. Tecle L para trocar',
  'room.pinned': 'Fixo no palco',
  'room.pinHint': 'Clique para fixar no palco',
  'room.unpin': 'Desafixar: o palco volta a seguir a sala',
  'controls.quality': 'Qualidade do compartilhamento de tela',
  'controls.openChat': 'Abrir chat',
  'controls.closeChat': 'Fechar chat',
  'controls.leave': 'Sair da sala',
  'controls.closeMenu': 'Fechar menu',
  'controls.dock': 'Controles da chamada',
  'controls.tools': 'Ferramentas',

  'tools.title': 'Ferramentas',
  'tools.on': 'no ar',
  'tools.empty': 'Esta build não traz nenhuma ferramenta.',
  'tools.full': 'A sala já está com todas as ferramentas que cabem.',

  'chat.title': 'Chat da sala',
  'chat.empty': [
    'Nenhuma mensagem ainda. Blip bop — manda um oi 👋',
    'Log vazio. Alguém tem que escrever a primeira linha 👋',
    'Nada por aqui ainda. Commita a primeira mensagem 👋',
    'Silêncio. Blip bop — quebra ele 👋',
  ],
  'chat.noKey':
    'Seu link veio sem a chave desta sala, então não dá para enviar nada. Peça o link original a quem te convidou — a chave vem depois do # e nunca chega a um servidor.',
  'chat.locked': 'Criptografada — e o seu link veio sem a chave',
  'chat.messageLabel': 'Mensagem do chat',
  'chat.placeholder': 'Mensagem… markdown funciona, / para comandos',
  'chat.send': 'Enviar mensagem',
  'chat.toolbar': 'Formatação da mensagem',
  'chat.unread': { one: 'nova mensagem', other: 'novas mensagens' },
  'chat.bold': 'Negrito',
  'chat.italic': 'Itálico',
  'chat.strike': 'Riscado',
  'chat.code': 'Código',
  'chat.link': 'Link',
  'chat.list': 'Lista',
  'chat.quote': 'Citação',
  'chat.emoji': 'Emoji',
  'chat.format': 'Formatação',
  'chat.reply': 'Responder',
  'chat.replyingTo': 'Respondendo a {name}',
  'chat.cancelReply': 'Cancelar resposta',
  'chat.jumpToLatest': 'Ir para as mensagens novas',
  'chat.copy': 'Copiar a mensagem',
  'chat.copied': 'Copiado',
  'chat.copyCode': 'Copiar o código',
  'chat.search': 'Buscar nas mensagens',
  'chat.searchPlaceholder': 'Achar uma mensagem…',
  'chat.searchClose': 'Fechar a busca',
  'chat.searchHits': { one: '{count} resultado', other: '{count} resultados' },
  'chat.searchNone': [
    'Nada por aqui. Tenta com menos palavras 🔍',
    'Zero resultados — e os acentos já foram ignorados 🔍',
    'Nada encontrado. Compila, mas não está aqui 🔍',
    'Nada. Talvez essa tenha sido dita em voz alta 🔍',
  ],
  'chat.save': 'Salvar a conversa',
  'chat.saveNote': 'Um arquivo markdown, escrito aqui no navegador — nada sobe para lugar nenhum',
  'chat.transcript.title': 'Freecord — {room}',
  'chat.transcript.savedAt': 'Salvo em {when}',
  'chat.transcript.file': 'Enviou um arquivo: {files}',
  'chat.transcript.replyTo': 'para {name}',

  /* Slash commands — see the note in en-US.ts. The words after the slash
     stay English; the lines describing them do not. */
  'cmd.menu': 'Comandos',
  'cmd.arg.link': 'link',
  'cmd.arg.text': 'texto',
  'cmd.arg.code': 'código',
  'cmd.mic': 'Liga ou desliga o microfone',
  'cmd.cam': 'Liga ou desliga a câmera',
  'cmd.sound': 'Liga ou desliga o som — o microfone vai junto',
  'cmd.share': 'Começa ou para de compartilhar a tela',
  'cmd.stop': 'Tira do palco o que a sala está assistindo',
  'cmd.invite': 'Copia o link da sala, com chave e tudo',
  'cmd.file': 'Escolhe um arquivo para mandar direto aos outros',
  'cmd.save': 'Salva a conversa em um arquivo markdown',
  'cmd.search': 'Procura algo que foi dito aqui',
  'cmd.lang': 'Troca o idioma do aplicativo',
  'cmd.me': 'Diz o que você está fazendo, em itálico',
  'cmd.shrug': 'Acrescenta um ¯\\_(ツ)_/¯ ao que você vai mandar',
  'cmd.leave': 'Sai da sala',
  'cmd.usage': 'Esse precisa de algo depois: {usage}',
  'cmd.unknown': 'Aqui não existe /{name}. Digite / para ver o que existe.',
  'cmd.nothingOn': 'A sala não está com nada no ar agora.',
  'cmd.noLang': 'Nenhum idioma com esse nome. Esta versão fala {codes}.',
  'cmd.nothingYet': 'Ainda não foi dito nada aqui.',
  'cmd.noScreen': 'Este navegador não entrega uma tela.',

  'file.attach': 'Enviar um arquivo',
  'file.direct': 'Vai direto por um canal de dados — sem servidor, sem upload, sem bucket',
  'file.noPeers': [
    'Ainda não tem ninguém aqui para receber.',
    'Sem pares, sem transferência — chama alguém primeiro.',
    'Arquivo precisa de quem receba, e não tem ninguém aqui.',
  ],
  'file.tooLarge': 'Até {max} por arquivo — acima disso o navegador desiste.',
  'file.offer': '{name} quer te enviar um arquivo',
  'file.to': 'para {name}',
  'file.accept': 'Aceitar',
  'file.decline': 'Recusar',
  'file.cancel': 'Cancelar',
  'file.save': 'Salvar',
  'file.dismiss': 'Dispensar',
  'file.status.pending': 'Esperando {name}…',
  'file.status.sending': 'Enviando… {percent}%',
  'file.status.receiving': 'Recebendo… {percent}%',
  'file.status.sent': 'Enviado',
  'file.status.received': 'Recebido',
  'file.status.declined': 'Recusado',
  'file.status.cancelled': 'Cancelado',
  'file.status.failed': 'A transferência falhou — a outra pessoa saiu, ou a conexão caiu.',
  'file.preview': 'Abrir imagem em tamanho real',
  'file.closePreview': 'Fechar imagem',
  'file.toMany': { one: 'para {count} pessoa', other: 'para {count} pessoas' },
  'file.status.summary': 'Recebido por {done} de {total}',
  'file.status.declinedCount': { one: '{count} recusou', other: '{count} recusaram' },

  'latency.signal': 'Latência até o servidor de sinalização',
  'latency.peer': 'Latência direta com {name}',
  'latency.self': 'Sua latência no mesh — o meio dos seus enlaces',

  // Community page — English source lives in en-US.ts, owned by its author.
  'community.back':
    'Voltar ao início',
  'community.title':
    'O Freecord é open source',
  'community.lead':
    'Um lugar para conversar com os amigos que não pede nada de você: sem conta, sem download, sem ninguém no meio. Leia o código, rode o seu, ou ajude a melhorar.',
  'community.promise.title':
    'A promessa',
  'community.promise.guest.title':
    'Nunca vai ter cadastro',
  'community.promise.guest.body':
    'Crie uma sala, mande o link. O link é a credencial — um código aleatório que ninguém adivinha. Não há conta para criar, e-mail para entregar nem senha para esquecer.',
  'community.promise.p2p.title':
    'Sem servidor de mídia no meio',
  'community.promise.p2p.body':
    'Voz, vídeo e tela fluem direto entre os navegadores por WebRTC nativo, criptografados fim a fim por padrão. O servidor só carrega a sinalização e o estado da sala — ele não conseguiria te espiar nem se quisesse.',
  'community.promise.chat.title':
    'Um chat que não deixa rastro',
  'community.promise.chat.body':
    'As mensagens são cifradas no seu navegador com uma chave que vive no link da sala. Navegador nenhum envia o fragmento da URL para o servidor, então o nosso repassa um texto que não consegue ler — e também não guarda nada: o chat some junto com a sala. O outro lado é honesto: quem tem o link lê junto, do mesmo jeito que entra.',
  'community.promise.vendor.title':
    'Sem fornecedor, sem SDK',
  'community.promise.vendor.body':
    'Nenhum fornecedor de mídia e nenhum SDK de terceiro. O protocolo inteiro está no repositório e tudo roda em infraestrutura gratuita. A única exceção possível é o TURN, opcional: um relay para redes que bloqueiam conexão direta — ele repassa tráfego cifrado que não consegue ler, e hospedar o seu é mudança de uma linha. Este serviço não tem nenhum configurado hoje. O outro lado, dito na cara: quando a ferramenta de vídeo não consegue mais do que colocar a página de outra pessoa na tela, essa página carrega no navegador de todo mundo aqui e roda os scripts dela, e o site do outro lado enxerga a conexão de cada um como qualquer site enxergaria. Uma chave nas suas configurações e nada disso carrega para você — a sala continua assistindo sem você.',
  'community.source.title':
    'Leia o código',
  'community.source.body':
    'Está tudo no GitHub sob licença MIT — use, faça um fork, hospede o seu. O documento de arquitetura é a versão honesta: quanto uma malha ponto a ponto realmente custa, por que as salas param em vinte, e quais dívidas estão mapeadas em vez de escondidas.',
  'community.source.repo':
    'Ver no GitHub',
  'community.source.architecture':
    'Leia a arquitetura',
  'community.source.license':
    'Licença MIT',
  'community.contribute.title':
    'Contribua',
  'community.contribute.body':
    'Node 20 e dois comandos é a configuração inteira — sem conta, sem chave de API, sem nada para assinar. Escolha algo pequeno, rode o typecheck e os testes, abra um pull request.',
  'community.contribute.guide':
    'Guia de contribuição',
  'community.contribute.conduct':
    'Código de conduta',
  'community.issues.title': 'Achou um bug? Quer uma coisa?',
  'community.issues.body':
    'As issues servem para os dois. Em app de tempo real, contexto vale mais que stack trace: diga o seu navegador, quantas pessoas estavam na sala, se alguém compartilhava tela, e se algum dos lados estava atrás de VPN ou rede corporativa.',
  'community.issues.report':
    'Relatar um bug',
  'community.issues.browse':
    'Ver as issues',
  'community.desktop.title':
    'No computador também',
  'community.desktop.body':
    'Um app para macOS, Windows e Linux embrulha esta mesma página e acrescenta o que o navegador não dá: seletor de tela nativo e permissões de mídia de verdade do sistema.',
  'community.footer':
    'Publicado sob a licença MIT. Feito por Henrique Brito e colaboradores.',

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
    'M1 em diante',
  'download.hint.mac-x64':
    'Macs Intel, até 2020',
  'download.hint.windows-x64':
    'Windows 10 e 11',
  'download.hint.linux-appimage':
    'Qualquer distro, sem instalar nada',
  'download.hint.linux-deb':
    'Debian, Ubuntu e derivados',
  'download.cta':
    'Baixar o app para {os}',
  'download.also':
    'O Freecord também tem app para computador — com seletor de tela nativo.',
  'download.firstRun.mac':
    'O app não é assinado por um certificado da Apple, então o macOS bloqueia na primeira abertura. Vá em Ajustes do Sistema → Privacidade e Segurança e clique em “Abrir Mesmo Assim” — no macOS 14 ou anterior, clique no app com o botão direito e escolha Abrir.',
  'download.firstRun.windows':
    'O Windows vai avisar que o editor é desconhecido (o app não é assinado): clique em Mais informações → Executar assim mesmo.',
  'download.firstRun.linux':
    'Dê permissão de execução ao AppImage antes de abrir: chmod +x freecord-linux-x86_64.AppImage',
  'download.macOtherConfident':
    'Seu Mac é do outro tipo?',
  'download.macOtherUnsure': 'Seu Mac se recusou a dizer qual é.',
  'download.macOtherArm':
    'Baixar a versão Apple Silicon',
  'download.macOtherIntel':
    'Baixar a versão Intel',
  'download.showOthers':
    'Outras plataformas',
  'download.hideOthers':
    'Ocultar outras plataformas',

  /*
   * Instalar pelo navegador — no celular, é toda a história do "baixar o
   * app", porque lá não há nada para baixar: a página é o app.
   *
   * Os passos são o canto deste catálogo sem nenhuma brincadeira. Tem alguém
   * com o celular na mão seguindo eles.
   */
  'install.cta': 'Instalar o app',
  'install.title': 'Instalar o Freecord',
  'install.lead':
    'Ele abre pela tela de início, em uma janela só dele — as mesmas salas, sem o navegador em volta.',
  'install.also':
    'No celular não há nada para baixar. Esta página é o app: coloque na tela de início e ela abre como um.',
  'install.ios.step1': 'Toque no botão Compartilhar, na barra do navegador.',
  'install.ios.step2': 'Escolha “Adicionar à Tela de Início”.',
  'install.menu.step1': 'Abra o menu do seu navegador.',
  'install.menu.step2': 'Escolha “Instalar app” ou “Adicionar à tela inicial”.',
  'install.gotIt': 'Entendi',
  // A mesma oferta dentro da chamada, onde o computador vê o download.
  'install.settings.title': 'Na tela de início',
  'install.settings.hint':
    'Instale o Freecord como app: as mesmas salas em uma janela só delas, sem o navegador em volta.',

  /* Abrir o link da sala no app de computador — ver lib/deep-link.ts. */
  'deepLink.open': 'Abrir esta sala no app de computador',
  'deepLink.opening': 'Abrindo no app de computador…',
  'deepLink.stay': 'Continuar no navegador',

  'language.picker': 'Idioma',
};
