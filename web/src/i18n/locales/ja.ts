import type { Catalog } from '..';

export const jaJP: Catalog = {
  'app.name': 'Freecord',
  'app.tagline':
    '音声・ビデオ・チャット・画面共有を P2P メッシュで。あいだにメディアサーバーはありません。',

  'home.roomName': 'ルーム名',
  'home.roomNamePlaceholder': 'ルーム名（任意）',
  'home.create': 'ルームを作成',
  'home.creating': '作成中…',
  'home.createFailed': 'ルームを作成できませんでした。もう一度お試しください。',
  'home.community': 'コミュニティ',

  'home.chip.opensource': 'オープンソース · MIT',
  'home.chip.p2p': 'ネイティブ WebRTC P2P',
  'home.chip.nosignup': '登録不要',

  'home.hero.titleA': 'ルームは',
  'home.hero.titleB': 'リンクひとつ。',
  'home.footer.product': 'プロダクト',
  'home.footer.downloads': 'ダウンロード',

  'home.card.title': 'ルームを始める',
  'home.card.hint': 'リンクが招待状。',

  'home.dev.title': '開発者向け',
  'home.dev.lead': 'ベンダーなし、SDK なし、外部認証情報なし。クローンして、動かして、フォークする。',
  'home.dev.copy': 'コマンドをコピー',
  'home.dev.copied': 'コピーしました！',
  'home.dev.p2p.title': 'メディアはサーバーを経由しない',
  'home.dev.p2p.body':
    '音声・映像・画面共有はネイティブ WebRTC の P2P メッシュでブラウザ間を直接流れます。サーバーが扱うのはシグナリングとルームの状態だけです。',
  'home.dev.selfhost.title': '1プロセスでセルフホスト',
  'home.dev.selfhost.body':
    '単一の Node プロセスが API・WebSocket・ビルド済みフロントエンドを配信します。同じプロトコルを Cloudflare Workers に無料プランのままデプロイすることもできます。',
  'home.dev.protocol.title': 'プロトコルはあなたのもの',
  'home.dev.protocol.body':
    '自前の WebSocket シグナリング——ルーム、SDP/ICE の中継、チャット、画面ロックがひとつの場所に。フォークしてルールを変えてください。',
  'home.dev.light.title': '圧倒的に軽量',
  'home.dev.light.body':
    'ルームのバンドルは約 14 kB。外側は React + Vite、それ以外はすべて手書き——i18n さえも。',
  'home.dev.github': 'GitHub でスターを',
  'home.dev.architecture': 'アーキテクチャを読む',
  'home.dev.contribute': 'コントリビュートガイド',

  'invite.copy': '招待',
  'invite.copied': 'リンクをコピーしました',
  'invite.manualCopy': 'ルームのリンクをコピーしてください:',

  'prejoin.title': '{room} に参加',
  'prejoin.yourName': 'あなたの名前',
  'prejoin.yourNamePlaceholder': 'なんとお呼びしますか？',
  'prejoin.micOn': 'マイクをオンにして参加',
  'prejoin.camOn': 'カメラをオンにして参加',
  'prejoin.join': '参加',
  'prejoin.notFound': 'このルームはもう存在しません。',
  'prejoin.loadFailed': 'ルームを読み込めませんでした。',
  'prejoin.backHome': 'ホームに戻る',

  'prejoin.notFoundTitle': 'ルームが見つかりません',
  'prejoin.notFoundBody': 'リンクの有効期限が切れたかもしれません — 空のルームは自動的に閉じます。',
  'prejoin.createNew': '新しいルームを作成',
  'prejoin.errorTitle': '問題が発生しました',
  'prejoin.errorBody': 'ルームを読み込めませんでした。ページを再読み込みしてください。',
  'prejoin.empty': 'まだ誰もいません — 最初の一人になりましょう。',
  'prejoin.inRoom': { other: 'ルームに {count} 人います。' },
  'prejoin.joinRoom': 'ルームに参加',

  'room.loading': 'ルームを読み込み中…',
  'room.connecting': 'ルームに接続中…',
  'room.participants': { other: '{count} 人' },
  'room.unnamed': '名前のないルーム',
  'room.you': 'あなた',
  'room.someone': '誰か',
  'room.micMuted': 'マイクはオフです',
  'room.leftTitle': 'ルームから退出しました',
  'room.endedFull': 'ルームが満員です（最大 8 人）。',
  'room.endedNotFound': 'このルームはもう存在しません。',
  'room.endedClosed': 'ルームとの接続が切れました。',

  'screen.yours': 'あなたの画面',
  'screen.of': '{name} の画面',
  'screen.via': '{name} 経由',
  'screen.sending': '送信中',
  'screen.receiving': '受信中',
  'screen.enterFullscreen': '全画面で表示',
  'screen.exitFullscreen': '全画面を終了',

  'quality.title': '画面の品質',
  'quality.note':
    '共有中でもすぐに反映されます。画面はピア同士で中継されるため、参加者が増えても品質は落ちません。',
  'quality.sharp.label': '鮮明',
  'quality.sharp.hint': 'コードや文字向け — 1080p 15 fps、にじみません',
  'quality.balanced.label': 'バランス',
  'quality.balanced.hint': '標準 — 1080p 30 fps',
  'quality.smooth.label': 'なめらか',
  'quality.smooth.hint': '動画やゲーム向け — 720p 60 fps、動きを優先',

  'controls.muteMic': 'マイクをミュート',
  'controls.unmuteMic': 'ミュートを解除',
  'controls.camOff': 'カメラをオフ',
  'controls.camOn': 'カメラをオン',
  'controls.shareScreen': '画面を共有',
  'controls.stopSharing': '共有を停止',
  'controls.someoneSharing': '他の人がすでに画面を共有しています',
  'controls.quality': '画面共有の品質',
  'controls.openChat': 'チャットを開く',
  'controls.closeChat': 'チャットを閉じる',
  'controls.leave': 'ルームから退出',
  'controls.closeMenu': 'メニューを閉じる',

  'chat.title': 'ルームチャット',
  'chat.empty': 'まだメッセージはありません。挨拶してみましょう 👋',
  'chat.noKey':
    'このルームの鍵がないため、メッセージを送信できません。元の招待リンクをもらってください。鍵はリンクに含まれています。',
  'chat.locked':
    '暗号化されています — このルームの鍵がありません',
  'chat.messageLabel': 'チャットメッセージ',
  'chat.placeholder': 'メッセージ…  **太字**、`コード`、- リスト',
  'chat.send': 'メッセージを送信',
  'chat.toolbar': 'メッセージの書式',
  'chat.unread': { other: '件の新着メッセージ' },
  'chat.bold': '太字',
  'chat.italic': '斜体',
  'chat.strike': '取り消し線',
  'chat.code': 'コード',
  'chat.link': 'リンク',
  'chat.list': 'リスト',
  'chat.quote': '引用',

  'latency.signal': 'シグナリングサーバーまでの遅延',
  'latency.peer': '{name} との直接遅延',

  // Community page — English source lives in en-US.ts, owned by its author.
  'community.back':
    'ホームに戻る',
  'community.title':
    'Freecord はオープンソースです',
  'community.lead':
    '友だちと話すための場所。あなたに何も求めません。アカウントもダウンロードも不要で、あいだに誰も入りません。コードを読み、自分で動かし、よりよくするのを手伝ってください。',
  'community.promise.title':
    '約束',
  'community.promise.guest.title':
    '登録は、これからも不要',
  'community.promise.guest.body':
    'ルームを作ってリンクを送るだけ。そのリンクが鍵です — 誰にも推測できないランダムな文字列。作るアカウントも、渡すメールアドレスも、忘れるパスワードもありません。',
  'community.promise.p2p.title':
    'あいだにメディアサーバーはありません',
  'community.promise.p2p.body':
    '音声・ビデオ・画面共有はネイティブ WebRTC でブラウザ間を直接流れ、既定でエンドツーエンド暗号化されます。サーバーが運ぶのはシグナリングとルームの状態だけ。覗こうとしても覗けません。',
  'community.promise.chat.title':
    '何も残さないチャット',
  'community.promise.chat.body':
    'メッセージはあなたのブラウザで暗号化され、その鍵はルームのリンクの中にあります。ブラウザは URL のフラグメントをサーバーへ送りません。だから私たちのサーバーが中継するのは読めないテキストで、しかも何も保存しません — チャットはルームとともに消えます。裏側も正直に言えば、リンクを持っている人は一緒に読めます。入れるのと同じことです。',
  'community.promise.vendor.title':
    'ベンダーなし、SDK なし',
  'community.promise.vendor.body':
    'メディア事業者もサードパーティ SDK もありません。プロトコルはすべてリポジトリにあり、全体が無料のインフラで動いています。唯一あり得る例外は任意の TURN です。直接接続を遮断するネットワーク向けの中継で、復号できない暗号化トラフィックをそのまま転送するだけ。自分で立てる場合も変更は 1 行です。本サービスでは現在どれも設定していません。',
  'community.source.title':
    'ソースを読む',
  'community.source.body':
    'すべて GitHub に MIT ライセンスで置いてあります。使うのも、フォークするのも、自分でホストするのも自由です。アーキテクチャ文書は正直な方の版です。ピアツーピアのメッシュが実際にどれだけのコストを払うのか、なぜルームが 8 人で止まるのか、どの技術的負債が隠されずに記録されているのか。',
  'community.source.repo':
    'GitHub で見る',
  'community.source.architecture':
    'アーキテクチャを読む',
  'community.source.license':
    'MIT ライセンス',
  'community.contribute.title':
    '貢献する',
  'community.contribute.body':
    '準備は Node 20 とコマンド 2 つだけ。アカウントも API キーも、登録も要りません。小さなところから選び、型チェックとテストを走らせ、pull request を送ってください。',
  'community.contribute.guide':
    'コントリビューションガイド',
  'community.contribute.conduct':
    '行動規範',
  'community.issues.title':
    '不具合を見つけた？ ほしいものがある？',
  'community.issues.body':
    'issue はそのどちらにも使えます。リアルタイムアプリではスタックトレースより文脈が役に立ちます。ブラウザ、ルームの人数、誰かが画面を共有していたか、どちらかが VPN や社内ネットワークの内側にいたかを教えてください。',
  'community.issues.report':
    '不具合を報告',
  'community.issues.browse':
    'issue を見る',
  'community.desktop.title':
    'デスクトップでも',
  'community.desktop.body':
    'macOS・Windows・Linux 向けのアプリが同じページを包み、ブラウザにはできないことを足します。ネイティブの画面選択と、本物のシステムメディア権限です。ダウンロードはホームページにあります。',
  'community.footer':
    'MIT ライセンスで公開。Henrique Brito とコントリビューターが作りました。',

  // Desktop download card. Target ids mirror DesktopTarget in the domain.
  'download.target.mac-arm64':
    'macOS · Apple シリコン',
  'download.target.mac-x64':
    'macOS · Intel',
  'download.target.windows-x64':
    'Windows · 64 ビット',
  'download.target.linux-appimage':
    'Linux · AppImage',
  'download.target.linux-deb':
    'Linux · .deb',
  'download.hint.mac-arm64':
    'M1 以降',
  'download.hint.mac-x64':
    'Intel 搭載 Mac（2020 年まで）',
  'download.hint.windows-x64':
    'Windows 10 と 11',
  'download.hint.linux-appimage':
    'どのディストロでも、インストール不要',
  'download.hint.linux-deb':
    'Debian、Ubuntu とその派生',
  'download.cta':
    '{os} 版アプリをダウンロード',
  'download.also':
    'Freecord にはデスクトップアプリもあります — ネイティブの画面選択つき。',
  'download.firstRun.mac':
    'アプリは Apple の証明書で署名されていないため、初回起動時に macOS がブロックします。「システム設定」→「プライバシーとセキュリティ」で「このまま開く」を選んでください。macOS 14 以前では、アプリを右クリックして「開く」を選びます。',
  'download.firstRun.windows':
    'Windows は発行元が不明だと警告します（アプリは署名されていません）。「詳細情報」→「実行」を選んでください。',
  'download.firstRun.linux':
    'AppImage は開く前に実行権限を付けてください: chmod +x freecord-linux-x86_64.AppImage',
  'download.macOtherConfident':
    'お使いの Mac はもう一方のタイプですか？',
  'download.macOtherUnsure':
    'お使いの Mac を判別できませんでした。',
  'download.macOtherArm':
    'Apple シリコン版をダウンロード',
  'download.macOtherIntel':
    'Intel 版をダウンロード',
  'download.showOthers':
    'ほかのプラットフォーム',
  'download.hideOthers':
    'ほかのプラットフォームを隠す',

  'language.picker': '言語',
};
