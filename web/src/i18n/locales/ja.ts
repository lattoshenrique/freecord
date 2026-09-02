import type { Catalog } from '..';

export const jaJP: Catalog = {
  'app.name': 'Freecord',
  'app.tagline':
    '音声・ビデオ・チャット・画面共有を P2P メッシュで。あいだにメディアサーバーはありません。',
  'app.buildInfo': 'バージョン {version} · ビルド {build}',

  'desktop.window.room': 'ルーム',
  'desktop.window.minimize': '最小化',
  'desktop.window.maximize': '最大化',
  'desktop.window.restore': '元のサイズに戻す',
  'desktop.window.close': '閉じる',
  'desktop.menu.open': 'メニュー',
  'desktop.menu.reload': '再読み込み',
  'desktop.menu.zoomIn': '拡大',
  'desktop.menu.zoomOut': '縮小',
  'desktop.menu.resetZoom': '実際のサイズ',
  'desktop.menu.fullscreen': 'フルスクリーン',
  'desktop.menu.devTools': '開発者ツール',
  'desktop.menu.openInBrowser': 'ブラウザで開く',
  'desktop.menu.sourceCode': 'ソースコード',
  'desktop.menu.quit': '終了',

  'home.roomName': 'ルーム名',
  'home.roomNamePlaceholder': 'ルーム名 — または招待リンクを貼り付け',
  'home.create': 'ルームを作成',
  'home.creating': '作成中…',
  'home.createFailed': 'ルームを作成できませんでした。もう一度お試しください。',
  'home.join': 'ルームに参加',
  'home.joinHint': '招待リンクです — ボタンでそのルームに入れます。',
  'home.invalidInvite':
    '招待リンクのようですが、不完全です。リンク全体を貼り付けてください。',
  'home.community': 'コミュニティ',

  'home.hero.titleA': 'ルームは',
  'home.hero.titleB': 'リンクひとつ。',
  'home.footer.downloads': 'ダウンロード',

  'home.card.hint': 'リンクが招待状。',

  'how.link': '仕組み',
  'how.title': 'Freecord の仕組み',
  'how.lead':
    '部屋はリンクそのもので、会話はその部屋にいるブラウザ同士を直接流れます。ボタンを押したあとに何が起きるのか、そしてサーバーが決して見ないものを説明します。',

  'how.steps.title': '3 つのステップ',
  'how.step.create.title': '部屋をつくる',
  'how.step.create.body':
    '名前は付けても付けなくても大丈夫です。誰にも当てられないリンクが返ってくるだけ。アカウントもメールもパスワードもありません。',
  'how.step.share.title': 'リンクを渡す',
  'how.step.share.body':
    'リンクが招待状であり、鍵でもあります。持っている人はそのまま入れます。チャットの鍵は URL の # より後ろの部分に載っていて、ブラウザはそこをサーバーへ送りません。',
  'how.step.talk.title': '話す',
  'how.step.talk.body':
    '全員がマイクもカメラも切った状態で入り、使いたいものだけを自分で入れます。上限は 20 人。音声と画面共有は常に優先されます。席を奪い合うのはカメラの方で、部屋が埋まるほど同時に映せる数は減り、それぞれの画質も自動的に調整されます。',

  'how.mesh.title': '音声も映像もサーバーを通りません',
  'how.mesh.body':
    '音声・映像・画面は、ネイティブ WebRTC でブラウザからブラウザへ直接流れ、既定でエンドツーエンドに暗号化されます。サーバーがするのはブラウザ同士の引き合わせと、部屋にいる人の名簿だけ。盗み聞きできるメディアサーバーは存在せず、その請求書もありません。直接つながれないほど厳しいネットワークには TURN 中継が要りますが、私たちは動かしていないので、そうした数少ない接続は第三者を黙って経由するのではなく、そのまま失敗します。',
  'how.diagram.media': '音声・映像・画面：ブラウザ同士を直接',
  'how.diagram.signaling': 'サーバーを通るのはシグナリングだけ：誰がいるか、どうつなぐか',

  'how.chat.title': 'チャットは封をされ、そして消えます',
  'how.chat.body':
    'メッセージはリンクに載ってきた鍵で自分のブラウザ内で暗号化され、音声と同じように他のブラウザへ直接届きます。サーバーが中継するのは直接の経路がないときだけで、しかも読めない文字列を渡すだけです。ファイルはサーバーを通りもしません。保存はしません。部屋が閉じれば会話も一緒に消えます。',

  'how.screen.title': '画面共有は同時に 3 つまで、それぞれツリー状に中継',
  'how.screen.body':
    'サーバーが与える画面共有の枠は最大 3 つで、共有者の接続が切れれば数秒でその枠を解放します。画面は共有者から全員へ送られるのではなく、まず 3 人へ、その 3 人がさらに 3 人へ転送します。だから誰の上り帯域も部屋の人数に比例して増えません。共有された画面ごとに専用のツリーがあります。',

  'how.limits.title': '部屋が従うルール',
  'how.limits.body':
    '1 部屋 20 人まで。誰もいない部屋は 15 分で閉じます。35 秒応答しないブラウザは席を失うので、固まったタブが席を占め続けることはありません。20 人を超えるとメッシュは誠実な答えではなくなります。次の一手は、画面共有がすでにピア同士で中継しているように、自前のメディアノードを置くことです。',

  'how.run.title': '自分で動かす',
  'how.run.body':
    'Node 20 とコマンド 2 つ。アカウントも API キーも契約も要りません。同じプロトコルがノート PC でも Cloudflare Workers でも動きます。',
  'how.run.copy': 'コマンドをコピー',
  'how.run.copied': 'コピーしました',
  'how.more.start': '部屋をつくる',

  'invite.copy': '招待',
  'invite.copied': 'リンクをコピーしました',
  'invite.manualCopy': 'ルームのリンクをコピーしてください:',

  'prejoin.title': '{room} に参加',
  'prejoin.yourName': 'あなたの名前',
  'prejoin.yourNamePlaceholder': 'なんとお呼びしますか？',
  'prejoin.mic': 'マイク',
  'prejoin.cam': 'カメラ',
  'prejoin.shuffle': '別の名前',
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
  'prejoin.renameRoom': 'ルーム名を変更',
  'prejoin.renameFailed': 'ルーム名を変更できませんでした。',

  'room.loading': 'ルームを読み込み中…',
  'room.connecting': 'ルームに接続中…',
  'room.participants': { other: '{count} 人' },
  'room.unnamed': '名前のないルーム',
  'room.you': 'あなた',
  'room.someone': '誰か',
  'room.micMuted': 'マイクはオフです',
  'room.deafened': 'スピーカーオフ — 聞いていません',
  'room.leftTitle': 'ルームから退出しました',
  'room.endedFull': 'ルームが満員です（最大 20 人）。',
  'room.endedNotFound': 'このルームはもう存在しません。',
  'room.endedClosed': 'ルームとの接続が切れました。',
  'room.seatsAria': '座席: {max} 席中 {count} 席が埋まっています',
  'room.camSlotsFull': 'カメラの枠は今いっぱいです — 音声はいつでも使えます',
  'room.camDenied':
    '今はカメラの空き枠がありません。誰かがカメラをオフにすると、あなたのカメラをオンにできます。',

  'screen.yours': 'あなたの画面',
  'screen.of': '{name} の画面',
  'screen.via': '{name} 経由',
  'screen.sending': '送信中',
  'screen.receiving': '受信中',
  'screen.enterFullscreen': '全画面で表示',
  'screen.exitFullscreen': '全画面を終了',
  'screen.enterPip': 'フローティングウィンドウで表示',
  'screen.exitPip': 'フローティングウィンドウを閉じる',

  'quality.title': '画面の品質',
  'quality.sharp.label': '鮮明',
  'quality.sharp.hint': 'コードや文字向け — 1080p 15 fps、にじみません',
  'quality.balanced.label': 'バランス',
  'quality.balanced.hint': '標準 — 1080p 30 fps',
  'quality.smooth.label': 'なめらか',
  'quality.smooth.hint': '動画やゲーム向け — 720p 60 fps、動きを優先',

  'settings.title': '通話設定',
  'controls.settings': '通話設定',
  'settings.tab.screen': '画面共有',
  'settings.tab.audio': '音声',
  'settings.tab.video': 'ビデオ',
  'settings.tab.general': '一般',
  'settings.screenAudio.title': 'パソコンの音声',
  'settings.mic.profile': 'マイクのプロファイル',
  'settings.language.hint': 'すぐに反映され、この端末に保存されます。',
  'settings.about.title': 'このアプリについて',
  'settings.close': '設定を閉じる',
  'settings.sounds.title': 'サウンド',
  'settings.sounds.label': '効果音',
  'settings.sounds.hint': '新着メッセージや入退室の通知音。',
  'settings.desktop.title': 'デスクトップアプリ',
  'settings.desktop.hint': '同じルームを専用ウィンドウで。このパソコン向けのダウンロードです。',
  'settings.screenAudio.label': 'パソコンの音声を共有',
  'settings.screenAudio.hint': 'システムやタブの音が画面と一緒に届きます — 次回の共有から有効',
  'settings.mic.title': 'マイク',
  'settings.mic.voice.label': 'ボイス',
  'settings.mic.voice.hint': '環境を整えます：エコーとノイズを除去し、音量を自動調整',
  'settings.mic.music.label': 'スタジオ',
  'settings.mic.music.hint': '無加工ステレオ・高ビットレート — 音楽や楽器向け、ヘッドホン推奨',
  'settings.mic.echoCancellation': 'エコーキャンセル',
  'settings.mic.noiseSuppression': 'ノイズ抑制',
  'settings.mic.autoGainControl': '自動音量',
  'settings.camera.title': 'カメラ',
  'settings.camera.eco.label': '節約',
  'settings.camera.eco.hint': 'データ節約 — 最大 360p 20 fps',
  'settings.camera.standard.label': '標準',
  'settings.camera.standard.hint': '最大 720p 30 fps — 標準',
  'settings.camera.high.label': '高画質',
  'settings.camera.high.hint': '最大 1080p 30 fps — 安定した回線向け',
  'settings.device.mic': 'マイクデバイス',
  'settings.device.speaker': '音声の出力先',
  'settings.device.default': 'システム既定',
  'settings.device.mic.fallback': 'マイク {number}',
  'settings.device.speaker.fallback': 'スピーカー {number}',

  'controls.muteMic': 'マイクをミュート',
  'controls.unmuteMic': 'ミュートを解除',
  'controls.muteSpeaker': 'スピーカーをミュート',
  'controls.unmuteSpeaker': 'スピーカーのミュートを解除',
  'controls.camOff': 'カメラをオフ',
  'controls.camOn': 'カメラをオン',
  'controls.shareScreen': '画面を共有',
  'controls.stopSharing': '共有を停止',
  'controls.someoneSharing': '他の人がすでに画面を共有しています',
  'controls.screensFull': '画面共有の枠（3つ）はすべて使用中です',
  'layout.spotlight': 'スポットライト',
  'layout.grid': 'グリッド',
  'controls.layout': 'レイアウト: {name}。L キーで切り替え',
  'room.pinned': 'ステージに固定中',
  'room.pinHint': 'クリックでステージに固定',
  'room.unpin': '固定を解除：ステージが部屋に追従します',
  'controls.quality': '画面共有の品質',
  'controls.openChat': 'チャットを開く',
  'controls.closeChat': 'チャットを閉じる',
  'controls.leave': 'ルームから退出',
  'controls.closeMenu': 'メニューを閉じる',
  'controls.dock': '通話の操作',

  'chat.title': 'ルームチャット',
  'chat.empty': 'まだメッセージはありません。挨拶してみましょう 👋',
  'chat.noKey':
    'このルームの鍵がないため、メッセージを送信できません。元の招待リンクをもらってください。鍵はリンクに含まれています。',
  'chat.locked':
    '暗号化されています — このルームの鍵がありません',
  'chat.messageLabel': 'チャットメッセージ',
  'chat.placeholder': 'メッセージ…',
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
  'chat.emoji': '絵文字',
  'chat.format': '書式',
  'chat.reply': '返信',
  'chat.replyingTo': '{name} に返信中',
  'chat.cancelReply': '返信をやめる',
  'chat.jumpToLatest': '新着メッセージへ',

  'file.attach': 'ファイルを送る',
  'file.direct': '相手に直接届きます。サーバーは経由しません',
  'file.noPeers': 'まだ他に誰もいません。',
  'file.tooLarge': '{max} までのファイルを送れます。',
  'file.offer': '{name} さんがファイルを送ろうとしています',
  'file.to': '{name} さんへ',
  'file.accept': '受け取る',
  'file.decline': '断る',
  'file.cancel': 'キャンセル',
  'file.save': '保存',
  'file.dismiss': '閉じる',
  'file.status.pending': '{name} さんの承認を待っています…',
  'file.status.sending': '送信中… {percent}%',
  'file.status.receiving': '受信中… {percent}%',
  'file.status.sent': '送信済み',
  'file.status.received': '受信済み',
  'file.status.declined': '断られました',
  'file.status.cancelled': 'キャンセルされました',
  'file.status.failed': '転送に失敗しました。相手が退出したか、接続が切れました。',
  'file.preview': '画像を原寸で開く',
  'file.closePreview': '画像を閉じる',
  'file.toMany': { other: '{count} 人へ' },
  'file.status.summary': '{total} 人中 {done} 人が受信',
  'file.status.declinedCount': { other: '{count} 人が断りました' },

  'latency.signal': 'シグナリングサーバーまでの遅延',
  'latency.peer': '{name} との直接遅延',
  'latency.self': 'メッシュ内のあなたの遅延 — 各リンクの中央値',

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
    'すべて GitHub に MIT ライセンスで置いてあります。使うのも、フォークするのも、自分でホストするのも自由です。アーキテクチャ文書は正直な方の版です。ピアツーピアのメッシュが実際にどれだけのコストを払うのか、なぜルームが 20 人で止まるのか、どの技術的負債が隠されずに記録されているのか。',
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
    'macOS・Windows・Linux 向けのアプリが同じページを包み、ブラウザにはできないことを足します。ネイティブの画面選択と、本物のシステムメディア権限です。',
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
