import type { Catalog } from '..';

export const ptBR: Catalog = {
  'app.name': 'Freecord',
  'app.tagline':
    'Voz, vídeo, chat e tela numa malha P2P. Sem servidor de mídia no meio.',
  'app.buildInfo': 'Versão {version} · build {build}',

  'home.roomName': 'Nome da sala',
  'home.roomNamePlaceholder': 'Nome da sala — ou cole um link de convite',
  'home.create': 'Criar sala',
  'home.creating': 'Criando…',
  'home.createFailed': 'Não foi possível criar a sala. Tente novamente.',
  'home.join': 'Entrar na sala',
  'home.joinHint': 'Link de convite — o botão leva você para essa sala.',
  'home.invalidInvite': 'Isso parece um link de convite, mas está incompleto. Cole o link inteiro.',
  'home.community': 'Comunidade',

  'home.hero.titleA': 'Uma sala é',
  'home.hero.titleB': 'só um link.',
  'home.footer.downloads': 'Downloads',

  'home.card.hint': 'O link é o convite.',

  'how.link': 'Como funciona',
  'how.title': 'Como o Freecord funciona',
  'how.lead':
    'Uma sala é um link, e a conversa vai direto entre os navegadores que estão nela. Isto é o que acontece depois que você aperta o botão — e o que o nosso servidor nunca vê.',

  'how.steps.title': 'Três passos',
  'how.step.create.title': 'Crie a sala',
  'how.step.create.body':
    'Dê um nome ou não dê. Você recebe de volta um link que ninguém adivinha, e mais nada: sem conta, sem e-mail, sem senha.',
  'how.step.share.title': 'Mande o link',
  'how.step.share.body':
    'O link é o convite e a credencial. Quem tem, entra. A chave do chat viaja no pedaço da URL depois do #, que o navegador nunca manda para um servidor.',
  'how.step.talk.title': 'Converse',
  'how.step.talk.body':
    'Todo mundo chega mudo e sem câmera, e liga o que quiser. Até vinte pessoas. Áudio e tela compartilhada têm prioridade sempre; as câmeras é que disputam espaço — numa sala cheia entram menos, e a qualidade de cada uma se ajusta sozinha.',

  'how.mesh.title': 'A mídia nunca toca o nosso servidor',
  'how.mesh.body':
    'Voz, vídeo e tela fluem de navegador para navegador por WebRTC nativo, criptografados fim a fim. O nosso servidor só apresenta os navegadores uns aos outros e guarda a lista de quem está na sala — não existe servidor de mídia para bisbilhotar, nem conta para pagar por ele. Uma rede restritiva demais para conexão direta precisaria de um relay TURN; não mantemos nenhum, então essas poucas conexões falham em vez de passar caladas por um terceiro.',
  'how.diagram.media': 'Voz, vídeo e tela: direto entre os navegadores',
  'how.diagram.signaling': 'Pelo servidor, só a sinalização: quem está na sala e como alcançar cada um',

  'how.chat.title': 'O chat é lacrado e temporário',
  'how.chat.body':
    'As mensagens são cifradas no seu navegador com a chave que veio no link, então o servidor repassa um texto que não consegue ler. Nada é guardado: quando a sala fecha, a conversa vai junto.',

  'how.screen.title': 'Uma tela por vez, repassada em árvore',
  'how.screen.body':
    'O compartilhamento de tela fica travado em uma pessoa no servidor, e a trava é liberada mesmo se a conexão dela cair. O vídeo não vai de quem compartilha para todo mundo: ele chega a três pares, e cada um repassa para outros três, então o upload de ninguém cresce junto com a sala.',

  'how.limits.title': 'As regras que a sala segue',
  'how.limits.body':
    'Vinte pessoas por sala. Uma sala vazia fecha em quinze minutos. Um navegador que fica trinta e cinco segundos calado perde o lugar, para uma aba travada não segurar uma vaga para sempre. Acima de vinte a malha deixa de ser a resposta honesta: o próximo passo é um nó de mídia nosso, do jeito que o compartilhamento de tela já repassa entre os pares.',

  'how.run.title': 'Rode você mesmo',
  'how.run.body':
    'Node 20 e dois comandos. Sem conta, sem chave de API, sem nada para assinar: o mesmo protocolo roda num notebook e no Cloudflare Workers.',
  'how.run.copy': 'Copiar comandos',
  'how.run.copied': 'Copiado!',
  'how.more.start': 'Criar uma sala',

  'invite.copy': 'Convidar',
  'invite.copied': 'Link copiado!',
  'invite.manualCopy': 'Copie o link da sala:',

  'prejoin.title': 'Entrar em {room}',
  'prejoin.yourName': 'Seu nome',
  'prejoin.yourNamePlaceholder': 'Como podemos te chamar?',
  'prejoin.mic': 'Microfone',
  'prejoin.cam': 'Câmera',
  'prejoin.shuffle': 'Outro nome',
  'prejoin.join': 'Entrar',
  'prejoin.notFound': 'Esta sala não existe mais.',
  'prejoin.loadFailed': 'Não foi possível carregar a sala.',
  'prejoin.backHome': 'Voltar ao início',

  'prejoin.notFoundTitle': 'Sala não encontrada',
  'prejoin.notFoundBody': 'O link pode ter expirado — salas vazias fecham sozinhas.',
  'prejoin.createNew': 'Criar uma nova sala',
  'prejoin.errorTitle': 'Algo deu errado',
  'prejoin.errorBody': 'Não foi possível carregar a sala. Tente recarregar a página.',
  'prejoin.empty': 'Ninguém aqui ainda — seja a primeira pessoa a entrar.',
  'prejoin.inRoom': { one: '{count} pessoa na sala.', other: '{count} pessoas na sala.' },
  'prejoin.joinRoom': 'Entrar na sala',

  'room.loading': 'Carregando sala…',
  'room.connecting': 'Conectando à sala…',
  'room.participants': { one: '{count} participante', other: '{count} participantes' },
  'room.unnamed': 'Sala sem nome',
  'room.you': 'você',
  'room.someone': 'Alguém',
  'room.micMuted': 'Microfone desativado',
  'room.leftTitle': 'Você saiu da sala',
  'room.endedFull': 'A sala está cheia (máximo de 20 pessoas).',
  'room.endedNotFound': 'A sala não existe mais.',
  'room.endedClosed': 'A conexão com a sala caiu.',
  'room.seatsAria': 'Assentos: {count} de {max} ocupados',
  'room.camSlotsFull': 'Sala cheia para câmeras — o áudio continua livre',
  'room.camDenied':
    'Nenhuma vaga de câmera livre agora. A sua pode ligar quando alguém desligar a dela.',

  'screen.yours': 'Sua tela',
  'screen.of': 'Tela de {name}',
  'screen.via': 'via {name}',
  'screen.sending': 'Enviando',
  'screen.receiving': 'Recebendo',
  'screen.enterFullscreen': 'Ver em tela cheia',
  'screen.exitFullscreen': 'Sair da tela cheia',

  'quality.title': 'Qualidade da tela',
  'quality.sharp.label': 'Nítida',
  'quality.sharp.hint': 'Código e texto — 1080p a 15 fps, nunca borra',
  'quality.balanced.label': 'Equilibrada',
  'quality.balanced.hint': 'Padrão — 1080p a 30 fps',
  'quality.smooth.label': 'Fluida',
  'quality.smooth.hint': 'Vídeo e jogo — 720p a 60 fps, prioriza movimento',

  'settings.title': 'Configurações da chamada',
  'controls.settings': 'Configurações da chamada',
  'settings.screenAudio.label': 'Compartilhar áudio do computador',
  'settings.screenAudio.hint': 'O som do sistema ou da aba sai junto com a tela — vale a partir do próximo compartilhamento',
  'settings.mic.title': 'Microfone',
  'settings.mic.voice.label': 'Voz',
  'settings.mic.voice.hint': 'Limpa o ambiente: eco e ruído removidos, volume nivelado',
  'settings.tab.screen': 'Compartilhar tela',
  'settings.tab.audio': 'Áudio',
  'settings.tab.video': 'Vídeo',
  'settings.tab.general': 'Geral',
  'settings.screenAudio.title': 'Áudio do computador',
  'settings.mic.profile': 'Perfil do microfone',
  'settings.language.hint': 'Vale na hora e fica salvo neste dispositivo.',
  'settings.about.title': 'Sobre',
  'settings.close': 'Fechar configurações',
  'settings.mic.music.label': 'Estúdio',
  'settings.mic.music.hint': 'Estéreo sem filtros em bitrate alto — música e instrumentos, use fones',
  'settings.mic.echoCancellation': 'Cancelamento de eco',
  'settings.mic.noiseSuppression': 'Supressão de ruído',
  'settings.mic.autoGainControl': 'Volume automático',
  'settings.camera.title': 'Câmera',
  'settings.camera.eco.label': 'Econômica',
  'settings.camera.eco.hint': 'Economiza dados — até 360p a 20 fps',
  'settings.camera.standard.label': 'Padrão',
  'settings.camera.standard.hint': 'Até 720p a 30 fps — o padrão',
  'settings.camera.high.label': 'Alta',
  'settings.camera.high.hint': 'Até 1080p a 30 fps — exige conexão forte',
  'settings.device.mic': 'Dispositivo do microfone',
  'settings.device.speaker': 'Saída de som',
  'settings.device.default': 'Padrão do sistema',
  'settings.device.mic.fallback': 'Microfone {number}',
  'settings.device.speaker.fallback': 'Alto-falante {number}',

  'controls.muteMic': 'Silenciar microfone',
  'controls.unmuteMic': 'Ativar microfone',
  'controls.camOff': 'Desligar câmera',
  'controls.camOn': 'Ligar câmera',
  'controls.shareScreen': 'Compartilhar tela',
  'controls.stopSharing': 'Parar de compartilhar',
  'controls.someoneSharing': 'Outra pessoa já está compartilhando a tela',
  'controls.quality': 'Qualidade do compartilhamento de tela',
  'controls.openChat': 'Abrir chat',
  'controls.closeChat': 'Fechar chat',
  'controls.leave': 'Sair da sala',
  'controls.closeMenu': 'Fechar menu',

  'chat.title': 'Chat da sala',
  'chat.empty': 'Nenhuma mensagem ainda. Diga um oi 👋',
  'chat.noKey':
    'Você não tem a chave desta sala, então não dá para enviar mensagens. Peça o link de convite original — a chave faz parte dele.',
  'chat.locked':
    'Criptografada — você não tem a chave desta sala',
  'chat.messageLabel': 'Mensagem do chat',
  'chat.placeholder': 'Mensagem…',
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

  'file.attach': 'Enviar um arquivo',
  'file.direct': 'Vai direto para a outra pessoa, nunca passa por um servidor',
  'file.noPeers': 'Ainda não tem mais ninguém na sala.',
  'file.tooLarge': 'Dá para enviar arquivos de até {max}.',
  'file.offer': '{name} quer te enviar um arquivo',
  'file.to': 'para {name}',
  'file.accept': 'Aceitar',
  'file.decline': 'Recusar',
  'file.cancel': 'Cancelar',
  'file.save': 'Salvar',
  'file.dismiss': 'Dispensar',
  'file.status.pending': 'Esperando {name} aceitar…',
  'file.status.sending': 'Enviando… {percent}%',
  'file.status.receiving': 'Recebendo… {percent}%',
  'file.status.sent': 'Enviado',
  'file.status.received': 'Recebido',
  'file.status.declined': 'Recusado',
  'file.status.cancelled': 'Cancelado',
  'file.status.failed': 'A transferência falhou — a outra pessoa saiu ou a conexão caiu.',
  'file.preview': 'Abrir imagem em tamanho real',
  'file.closePreview': 'Fechar imagem',

  'latency.signal': 'Latência até o servidor de sinalização',
  'latency.peer': 'Latência direta com {name}',

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
    'Nenhum fornecedor de mídia e nenhum SDK de terceiro. O protocolo inteiro está no repositório e tudo roda em infraestrutura gratuita. A única exceção possível é o TURN, opcional: um relay para redes que bloqueiam conexão direta — ele repassa tráfego cifrado que não consegue ler, e hospedar o seu é mudança de uma linha. Este serviço não tem nenhum configurado hoje.',
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
  'community.issues.title':
    'Achou um bug? Quer alguma coisa?',
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
  'download.macOtherUnsure':
    'Não conseguimos identificar seu Mac.',
  'download.macOtherArm':
    'Baixar a versão Apple Silicon',
  'download.macOtherIntel':
    'Baixar a versão Intel',
  'download.showOthers':
    'Outras plataformas',
  'download.hideOthers':
    'Ocultar outras plataformas',

  'language.picker': 'Idioma',
};
