/**
 * Localization for what the shell draws outside the page.
 *
 * The web app has its own i18n (web/src/i18n); this covers what only the main
 * process can render — the application menu, the screen picker, system dialogs
 * and the offline page. Both follow the same rule: detect, fall back to
 * `en-US`, never ship a hardcoded sentence.
 *
 * Locale comes from `app.getLocale()`, which reflects the operating system.
 */

export const LOCALES = ['en-US', 'pt-BR', 'es', 'zh-CN', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

export type StringKey = keyof (typeof STRINGS)['en-US'];

const STRINGS = {
  'en-US': {
    menuFile: 'File',
    menuQuit: 'Quit',
    menuEdit: 'Edit',
    menuView: 'View',
    menuReload: 'Reload',
    menuForceReload: 'Reload ignoring cache',
    menuResetZoom: 'Actual size',
    menuZoomIn: 'Zoom in',
    menuZoomOut: 'Zoom out',
    menuFullscreen: 'Full screen',
    menuDevTools: 'Developer tools',
    menuWindow: 'Window',
    menuHelp: 'Help',
    menuOpenInBrowser: 'Open in browser',
    menuSourceCode: 'Source code',
    pickerTitle: 'Share screen',
    pickerSubtitle: 'One person shares at a time. Pick what the others will see.',
    pickerScreens: 'Screens',
    pickerWindows: 'Windows',
    pickerNoScreens: 'No screen available.',
    pickerNoWindows: 'No open window.',
    pickerCancel: 'Cancel',
    pickerShare: 'Share',
    screenPermissionTitle: 'Screen recording permission',
    screenPermissionMessage: 'macOS is blocking screen capture.',
    screenPermissionDetail:
      'Open System Settings → Privacy & Security → Screen Recording, tick Freecord and reopen the app.',
    screenPermissionOpen: 'Open settings',
    screenPermissionLater: 'Not now',
    offlineTitle: 'Could not load Freecord',
    offlineBody:
      'The app talks to the room server over the internet. Check your connection and try again.',
    offlineRetry: 'Try again',
    updateTitle: 'Update available',
    updateMessage: 'Freecord {version} is out.',
    updateInstallDetail:
      'Already downloaded. Installing takes a few seconds and the app reopens by itself.',
    updateInstall: 'Install and restart',
    updateRestartDetail: 'Already downloaded. The app reopens on the new version.',
    updateRestart: 'Restart now',
    updateMacDetail:
      'The download opens in your browser — install it over the current app. macOS blocks the first launch: open System Settings → Privacy & Security and choose "Open Anyway".',
    updateDebDetail:
      'The download opens in your browser. Install the .deb like the first time and reopen the app.',
    updateDownload: 'Download',
    updateLater: 'Not now',
  },
  'pt-BR': {
    menuFile: 'Arquivo',
    menuQuit: 'Sair',
    menuEdit: 'Editar',
    menuView: 'Exibir',
    menuReload: 'Recarregar',
    menuForceReload: 'Recarregar ignorando cache',
    menuResetZoom: 'Tamanho normal',
    menuZoomIn: 'Aumentar zoom',
    menuZoomOut: 'Diminuir zoom',
    menuFullscreen: 'Tela cheia',
    menuDevTools: 'Ferramentas de desenvolvedor',
    menuWindow: 'Janela',
    menuHelp: 'Ajuda',
    menuOpenInBrowser: 'Abrir no navegador',
    menuSourceCode: 'Código-fonte',
    pickerTitle: 'Compartilhar tela',
    pickerSubtitle: 'Uma pessoa por vez compartilha. Escolha o que os outros vão ver.',
    pickerScreens: 'Telas',
    pickerWindows: 'Janelas',
    pickerNoScreens: 'Nenhuma tela disponível.',
    pickerNoWindows: 'Nenhuma janela aberta.',
    pickerCancel: 'Cancelar',
    pickerShare: 'Compartilhar',
    screenPermissionTitle: 'Permissão de gravação de tela',
    screenPermissionMessage: 'O macOS está bloqueando a captura de tela.',
    screenPermissionDetail:
      'Abra Ajustes do Sistema → Privacidade e Segurança → Gravação de Tela, marque o Freecord e reabra o app.',
    screenPermissionOpen: 'Abrir ajustes',
    screenPermissionLater: 'Agora não',
    offlineTitle: 'Não deu para carregar o Freecord',
    offlineBody:
      'O app conversa com o servidor de salas pela internet. Verifique sua conexão e tente de novo.',
    offlineRetry: 'Tentar de novo',
    updateTitle: 'Atualização disponível',
    updateMessage: 'O Freecord {version} já está disponível.',
    updateInstallDetail: 'Já foi baixada. Instalar leva alguns segundos e o app reabre sozinho.',
    updateInstall: 'Instalar e reiniciar',
    updateRestartDetail: 'Já foi baixada. O app reabre na versão nova.',
    updateRestart: 'Reiniciar agora',
    updateMacDetail:
      'O download abre no navegador — instale por cima do app atual. O macOS bloqueia a primeira abertura: abra Ajustes do Sistema → Privacidade e Segurança e escolha "Abrir Assim Mesmo".',
    updateDebDetail:
      'O download abre no navegador. Instale o .deb como na primeira vez e reabra o app.',
    updateDownload: 'Baixar',
    updateLater: 'Agora não',
  },
  es: {
    menuFile: 'Archivo',
    menuQuit: 'Salir',
    menuEdit: 'Editar',
    menuView: 'Ver',
    menuReload: 'Recargar',
    menuForceReload: 'Recargar ignorando la caché',
    menuResetZoom: 'Tamaño real',
    menuZoomIn: 'Acercar',
    menuZoomOut: 'Alejar',
    menuFullscreen: 'Pantalla completa',
    menuDevTools: 'Herramientas de desarrollo',
    menuWindow: 'Ventana',
    menuHelp: 'Ayuda',
    menuOpenInBrowser: 'Abrir en el navegador',
    menuSourceCode: 'Código fuente',
    pickerTitle: 'Compartir pantalla',
    pickerSubtitle: 'Comparte una persona a la vez. Elige lo que verán los demás.',
    pickerScreens: 'Pantallas',
    pickerWindows: 'Ventanas',
    pickerNoScreens: 'No hay pantallas disponibles.',
    pickerNoWindows: 'No hay ventanas abiertas.',
    pickerCancel: 'Cancelar',
    pickerShare: 'Compartir',
    screenPermissionTitle: 'Permiso de grabación de pantalla',
    screenPermissionMessage: 'macOS está bloqueando la captura de pantalla.',
    screenPermissionDetail:
      'Abre Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla, marca Freecord y vuelve a abrir la app.',
    screenPermissionOpen: 'Abrir ajustes',
    screenPermissionLater: 'Ahora no',
    offlineTitle: 'No se pudo cargar Freecord',
    offlineBody:
      'La app se comunica con el servidor de salas por internet. Revisa tu conexión e inténtalo de nuevo.',
    offlineRetry: 'Reintentar',
    updateTitle: 'Actualización disponible',
    updateMessage: 'Freecord {version} ya está disponible.',
    updateInstallDetail:
      'Ya está descargada. Instalarla tarda unos segundos y la app se reabre sola.',
    updateInstall: 'Instalar y reiniciar',
    updateRestartDetail: 'Ya está descargada. La app se reabre con la versión nueva.',
    updateRestart: 'Reiniciar ahora',
    updateMacDetail:
      'La descarga se abre en el navegador; instálala sobre la app actual. macOS bloquea la primera apertura: abre Ajustes del Sistema → Privacidad y seguridad y elige "Abrir de todos modos".',
    updateDebDetail:
      'La descarga se abre en el navegador. Instala el .deb como la primera vez y vuelve a abrir la app.',
    updateDownload: 'Descargar',
    updateLater: 'Ahora no',
  },
  'zh-CN': {
    menuFile: '文件',
    menuQuit: '退出',
    menuEdit: '编辑',
    menuView: '视图',
    menuReload: '重新加载',
    menuForceReload: '强制重新加载',
    menuResetZoom: '实际大小',
    menuZoomIn: '放大',
    menuZoomOut: '缩小',
    menuFullscreen: '全屏',
    menuDevTools: '开发者工具',
    menuWindow: '窗口',
    menuHelp: '帮助',
    menuOpenInBrowser: '在浏览器中打开',
    menuSourceCode: '源代码',
    pickerTitle: '共享屏幕',
    pickerSubtitle: '同一时间只有一人共享。请选择其他人将看到的内容。',
    pickerScreens: '屏幕',
    pickerWindows: '窗口',
    pickerNoScreens: '没有可用的屏幕。',
    pickerNoWindows: '没有打开的窗口。',
    pickerCancel: '取消',
    pickerShare: '共享',
    screenPermissionTitle: '屏幕录制权限',
    screenPermissionMessage: 'macOS 正在阻止屏幕捕获。',
    screenPermissionDetail:
      '打开“系统设置 → 隐私与安全性 → 屏幕录制”，勾选 Freecord，然后重新打开应用。',
    screenPermissionOpen: '打开设置',
    screenPermissionLater: '暂不',
    offlineTitle: '无法加载 Freecord',
    offlineBody: '此应用需要通过网络连接房间服务器。请检查网络连接后重试。',
    offlineRetry: '重试',
    updateTitle: '有可用更新',
    updateMessage: 'Freecord {version} 已发布。',
    updateInstallDetail: '更新已下载完成。安装只需几秒钟，应用会自动重新打开。',
    updateInstall: '安装并重启',
    updateRestartDetail: '更新已下载完成。应用将在新版本上重新打开。',
    updateRestart: '立即重启',
    updateMacDetail:
      '下载会在浏览器中打开，请覆盖安装当前应用。macOS 会拦截首次打开：请打开“系统设置 → 隐私与安全性”，选择“仍要打开”。',
    updateDebDetail: '下载会在浏览器中打开。像第一次一样安装 .deb，然后重新打开应用。',
    updateDownload: '下载',
    updateLater: '暂不',
  },
  ja: {
    menuFile: 'ファイル',
    menuQuit: '終了',
    menuEdit: '編集',
    menuView: '表示',
    menuReload: '再読み込み',
    menuForceReload: 'キャッシュを無視して再読み込み',
    menuResetZoom: '実際のサイズ',
    menuZoomIn: '拡大',
    menuZoomOut: '縮小',
    menuFullscreen: 'フルスクリーン',
    menuDevTools: '開発者ツール',
    menuWindow: 'ウインドウ',
    menuHelp: 'ヘルプ',
    menuOpenInBrowser: 'ブラウザで開く',
    menuSourceCode: 'ソースコード',
    pickerTitle: '画面を共有',
    pickerSubtitle: '共有できるのは一度に1人です。ほかの人に見せるものを選んでください。',
    pickerScreens: '画面',
    pickerWindows: 'ウインドウ',
    pickerNoScreens: '利用できる画面がありません。',
    pickerNoWindows: '開いているウインドウがありません。',
    pickerCancel: 'キャンセル',
    pickerShare: '共有',
    screenPermissionTitle: '画面収録の許可',
    screenPermissionMessage: 'macOS が画面のキャプチャをブロックしています。',
    screenPermissionDetail:
      'システム設定 → プライバシーとセキュリティ → 画面収録 を開き、Freecord にチェックを入れてアプリを開き直してください。',
    screenPermissionOpen: '設定を開く',
    screenPermissionLater: '後で',
    offlineTitle: 'Freecord を読み込めませんでした',
    offlineBody:
      'このアプリはインターネット経由でルームサーバーと通信します。接続を確認してもう一度お試しください。',
    offlineRetry: '再試行',
    updateTitle: 'アップデートがあります',
    updateMessage: 'Freecord {version} が公開されました。',
    updateInstallDetail:
      'ダウンロードは完了しています。インストールは数秒で終わり、アプリは自動的に開き直します。',
    updateInstall: 'インストールして再起動',
    updateRestartDetail: 'ダウンロードは完了しています。新しいバージョンでアプリが開き直します。',
    updateRestart: '今すぐ再起動',
    updateMacDetail:
      'ダウンロードはブラウザで開きます。今のアプリに上書きインストールしてください。macOS は初回起動をブロックします。「システム設定 → プライバシーとセキュリティ」で「このまま開く」を選んでください。',
    updateDebDetail:
      'ダウンロードはブラウザで開きます。初回と同じように .deb をインストールして、アプリを開き直してください。',
    updateDownload: 'ダウンロード',
    updateLater: '後で',
  },
} satisfies Record<Locale, Record<string, string>>;

/** Maps a system locale ("pt-BR", "es-419", "zh-Hans-CN") to a shipped one. */
export function resolveLocale(systemLocale: string): Locale {
  const tag = systemLocale.toLowerCase();
  if (tag.startsWith('pt')) return 'pt-BR';
  if (tag.startsWith('es')) return 'es';
  if (tag.startsWith('zh')) return 'zh-CN';
  if (tag.startsWith('ja')) return 'ja';
  return 'en-US';
}

export function createTranslator(systemLocale: string): (key: StringKey) => string {
  const locale = resolveLocale(systemLocale);
  // English is the source of truth, so a missing key degrades to English
  // instead of showing the key itself.
  return (key) => STRINGS[locale][key] ?? STRINGS['en-US'][key];
}

/** Every string the picker window needs, resolved for the current locale. */
export function pickerStrings(t: (key: StringKey) => string): Record<string, string> {
  return {
    title: t('pickerTitle'),
    subtitle: t('pickerSubtitle'),
    screens: t('pickerScreens'),
    windows: t('pickerWindows'),
    noScreens: t('pickerNoScreens'),
    noWindows: t('pickerNoWindows'),
    cancel: t('pickerCancel'),
    share: t('pickerShare'),
  };
}
