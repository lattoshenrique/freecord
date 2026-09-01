import type { Catalog } from '..';

export const ptBR: Catalog = {
  'app.name': 'Freecord',
  'app.tagline':
    'Crie uma sala, mande o link para os amigos. Voz, vídeo, chat e compartilhamento de tela — sem cadastro.',

  'home.roomName': 'Nome da sala',
  'home.roomNamePlaceholder': 'Nome da sala (opcional)',
  'home.create': 'Criar sala',
  'home.creating': 'Criando…',
  'home.createFailed': 'Não foi possível criar a sala. Tente novamente.',
  'home.community': 'Comunidade',

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
    'Sua mídia nunca passa pelo nosso servidor',
  'community.promise.p2p.body':
    'Voz, vídeo e tela fluem direto entre os navegadores por WebRTC nativo, criptografados fim a fim por padrão. O servidor só carrega a sinalização e o estado da sala — ele não conseguiria te espiar nem se quisesse.',
  'community.promise.chat.title':
    'Um chat que não deixa rastro',
  'community.promise.chat.body':
    'As mensagens vivem na sala e somem com ela. Zero armazenamento de conteúdo, de propósito: nada para vazar, nada para vender, nada para entregar.',
  'community.promise.vendor.title':
    'Sem fornecedor, sem SDK',
  'community.promise.vendor.body':
    'Nenhum fornecedor de mídia, nenhum SDK de terceiro, nenhuma credencial externa. O protocolo inteiro está no repositório, e tudo roda em infraestrutura gratuita.',
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

  'language.picker': 'Idioma',
};
