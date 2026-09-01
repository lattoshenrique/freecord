import type { Catalog } from '..';

export const ptBR: Catalog = {
  'app.name': 'Freecord',
  'app.tagline': 'Voz, vídeo, chat e tela. Sem cadastro — só um link.',

  'home.roomName': 'Nome da sala',
  'home.roomNamePlaceholder': 'Nome da sala (opcional)',
  'home.create': 'Criar sala',
  'home.creating': 'Criando…',
  'home.createFailed': 'Não foi possível criar a sala. Tente novamente.',
  'home.community': 'Comunidade',

  'home.chip.opensource': 'Open source · MIT',
  'home.chip.p2p': 'WebRTC P2P nativo',
  'home.chip.nosignup': 'Sem cadastro',

  'home.card.title': 'Comece uma sala',
  'home.card.hint': 'O link é o convite.',

  'home.dev.title': 'Para devs',
  'home.dev.lead': 'Sem vendor, sem SDK, sem credencial externa. Clone, rode, faça fork.',
  'home.dev.copy': 'Copiar comandos',
  'home.dev.copied': 'Copiado!',
  'home.dev.p2p.title': 'A mídia nunca toca o servidor',
  'home.dev.p2p.body':
    'Voz, vídeo e tela fluem de navegador a navegador por WebRTC nativo, numa malha P2P. O servidor só carrega sinalização e estado da sala.',
  'home.dev.selfhost.title': 'Self-host num processo só',
  'home.dev.selfhost.body':
    'Um único processo Node serve a API, o WebSocket e o frontend buildado. Ou publique o mesmo protocolo na Cloudflare Workers, tudo em plano grátis.',
  'home.dev.protocol.title': 'O protocolo é seu',
  'home.dev.protocol.body':
    'Sinalização WebSocket própria — salas, relay de SDP/ICE, chat e a trava de tela num lugar só. Faça um fork e mude as regras.',
  'home.dev.light.title': 'Absurdamente leve',
  'home.dev.light.body':
    'O bundle da sala tem ~14 kB. React + Vite por fora, todo o resto feito à mão — até o i18n.',
  'home.dev.github': 'Estrela no GitHub',
  'home.dev.architecture': 'Ler a arquitetura',
  'home.dev.contribute': 'Guia de contribuição',

  'invite.copy': 'Convidar',
  'invite.copied': 'Link copiado!',
  'invite.manualCopy': 'Copie o link da sala:',

  'prejoin.title': 'Entrar em {room}',
  'prejoin.yourName': 'Seu nome',
  'prejoin.yourNamePlaceholder': 'Como podemos te chamar?',
  'prejoin.micOn': 'Entrar com o microfone ligado',
  'prejoin.camOn': 'Entrar com a câmera ligada',
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
  'room.endedFull': 'A sala está cheia (máximo de 8 pessoas).',
  'room.endedNotFound': 'A sala não existe mais.',
  'room.endedClosed': 'A conexão com a sala caiu.',

  'screen.yours': 'Sua tela',
  'screen.of': 'Tela de {name}',
  'screen.via': 'via {name}',
  'screen.sending': 'Enviando',
  'screen.receiving': 'Recebendo',
  'screen.enterFullscreen': 'Ver em tela cheia',
  'screen.exitFullscreen': 'Sair da tela cheia',

  'quality.title': 'Qualidade da tela',
  'quality.note':
    'Vale na hora, mesmo compartilhando. A tela é retransmitida entre os pares, então a qualidade não cai mais conforme a sala enche.',
  'quality.sharp.label': 'Nítida',
  'quality.sharp.hint': 'Código e texto — 1080p a 15 fps, nunca borra',
  'quality.balanced.label': 'Equilibrada',
  'quality.balanced.hint': 'Padrão — 1080p a 30 fps',
  'quality.smooth.label': 'Fluida',
  'quality.smooth.hint': 'Vídeo e jogo — 720p a 60 fps, prioriza movimento',

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
  'chat.locked':
    'Criptografada — você não tem a chave desta sala',
  'chat.messageLabel': 'Mensagem do chat',
  'chat.placeholder': 'Mensagem…  **negrito**, `código`, - lista',
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
    'As mensagens vivem na sala e somem com ela. Zero armazenamento de conteúdo, de propósito: nada para vazar, nada para vender, nada para entregar.',
  'community.promise.vendor.title':
    'Sem fornecedor, sem SDK',
  'community.promise.vendor.body':
    'Nenhum fornecedor de mídia e nenhum SDK de terceiro. O protocolo inteiro está no repositório e tudo roda em infraestrutura gratuita. A única exceção possível é o TURN, opcional: um relay para redes que bloqueiam conexão direta — ele repassa tráfego cifrado que não consegue ler, e hospedar o seu é mudança de uma linha. Este serviço não tem nenhum configurado hoje.',
  'community.source.title':
    'Leia o código',
  'community.source.body':
    'Está tudo no GitHub sob licença MIT — use, faça um fork, hospede o seu. O documento de arquitetura é a versão honesta: quanto uma malha ponto a ponto realmente custa, por que as salas param em oito pessoas, e quais dívidas estão mapeadas em vez de escondidas.',
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
    'Um app para macOS, Windows e Linux embrulha esta mesma página e acrescenta o que o navegador não dá: seletor de tela nativo e permissões de mídia de verdade do sistema. O download está na página inicial.',
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
