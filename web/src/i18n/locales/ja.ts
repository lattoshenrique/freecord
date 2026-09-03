import type { Catalog } from '..';

export const jaJP: Catalog = {
  'app.name': 'Freecord',
  'app.tagline': '音声・映像・チャット・画面共有を P2P メッシュで。あいだにメディアサーバーなし、アカウントなし、裏もなし。',
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
  'home.creating': [
    '立ち上げ中…',
    'ルームを確保中…',
    'スラッグを予約中…',
  ],
  'home.createFailed': [
    'ルームが起動を拒みました。もう一度どうぞ。',
    'うまくいきませんでした。もう一度で通ることが多いです。',
    'ルームに断られました。再挑戦を。',
  ],
  'home.join': 'ルームに参加',
  'home.joinHint': 'それは招待リンクです — ボタンを押せばそのまま中へ。',
  'home.invalidInvite': 'それは招待リンクの半分です。# ごと丸ごと貼ってください — ルームの鍵は # のうしろにあります。',
  'home.community': 'コミュニティ',

  'home.rooms': { other: 'これまでに {total} 件のルームがここで開かれました。' },

  'home.hero.titleA': 'ルームは',
  'home.hero.titleB': 'リンクひとつ。',
  'home.footer.downloads': 'ダウンロード',

  'home.card.hint': 'リンクが招待状。認証はこれで全部です。',

  'how.link': '仕組み',
  'how.title': 'Freecord の仕組み',
  'how.lead':
    '部屋はリンクそのもので、会話はその部屋にいるブラウザ同士を直接流れます。ボタンを押したあとに何が起きるのか、そしてサーバーが決して見ないものを説明します。',

  'how.steps.title': '3 つのステップ',
  'how.step.create.title': '部屋をつくる',
  'how.step.create.body': '名前は付けても付けなくても。返ってくるのは誰にも当てられないリンクだけ。アカウントもメールも、忘れるパスワードもありません。',
  'how.step.share.title': 'リンクを渡す',
  'how.step.share.body':
    'リンクが招待状であり、鍵でもあります。持っている人はそのまま入れます。チャットの鍵は URL の # より後ろの部分に載っていて、ブラウザはそこをサーバーへ送りません。',
  'how.step.talk.title': '話す',
  'how.step.talk.body':
    '全員がマイクもカメラも切った状態で入り、使いたいものだけを自分で入れます。上限は 20 人。音声と画面共有は常に優先されます。席を奪い合うのはカメラの方で、部屋が埋まるほど同時に映せる数は減り、それぞれの画質も自動的に調整されます。',

  'how.mesh.title': '音声も映像もサーバーを通りません',
  'how.mesh.body':
    '音声・映像・画面はネイティブの WebRTC でブラウザからブラウザへ、エンドツーエンドで暗号化されて流れます。サーバーがするのはブラウザ同士を引き合わせることと、ルームにいる人の一覧を持つことです — 盗み聞きするメディアサーバーは存在せず、その請求書もありません。もう一つ、しかも誰かが頼んだときだけ：「いっしょに観る」にページを貼ると、サーバーはそのページを一度だけ開き、マークアップから再生できるものを読み取り、答えを返し、何も残しません。そのときもメディアはサーバーを通りません — 動画は各ブラウザが元の場所から取得します。直接つなぐには厳しすぎるネットワークには TURN リレーが要りますが、私たちは 1 台も動かしていないので、その稀な接続は第三者を黙って経由せずに失敗します。',
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
    '1 ルーム 20 人まで。空のルームは 15 分で閉じます。35 秒沈黙したブラウザは席を失うので、固まったタブが席を占め続けることはありません。20 人を超えるとメッシュは正直な答えではなくなります。次の一手は自前のメディアノード — 画面共有がすでにピア間で中継しているのと同じ考え方です。',

  'how.run.title': '自分で動かす',
  'how.run.body':
    'Node 20 とコマンド 2 つ。アカウントも API キーも、署名するものもありません。同じプロトコルがノート PC でも Cloudflare Workers でも動き、どちらも違いに気づきません。',
  'how.run.copy': 'コマンドをコピー',
  'how.run.copied': 'コピーしました',
  'how.more.start': '部屋をつくる',

  'invite.copy': '招待',
  'invite.copied': [
    'コピーしました！どこかに貼ってください。',
    'コピーしました。クリップボードの中です。',
    'コピー完了 — あとは人を呼ぶだけ。',
  ],
  'invite.manualCopy': 'ルームのリンクをコピーしてください:',

  'prejoin.title': '{room} に参加',
  'prejoin.yourName': 'あなたの名前',
  'prejoin.yourNamePlaceholder': 'ハンドルネームで十分 — 誰も確認しません',
  'prejoin.mic': 'マイク',
  'prejoin.cam': 'カメラ',
  'prejoin.shuffle': '名前をもう一度引く',
  'prejoin.join': '参加',
  'prejoin.notFound': 'このルームはもうありません。',
  'prejoin.loadFailed': 'ルームを読み込めませんでした。',
  'prejoin.backHome': 'ホームに戻る',

  'prejoin.notFoundTitle': 'ルームが見つかりません',
  'prejoin.notFoundBody': 'リンクの期限切れかもしれません — 空のルームは 15 分でガベージコレクトされます。',
  'prejoin.createNew': '新しいルームを作成',
  'prejoin.errorTitle': [
    'はい、壊れました',
    'こちらの環境では動きました',
    '予定とは違いました',
  ],
  'prejoin.errorBody': 'ルームを読み込めませんでした。ページを再読み込みしてください — 認めたくないくらいの確率で直ります。',
  'prejoin.empty': [
    'まだ誰もいません — あなたが PID 1 になります。',
    '空のルームです。好きな席をどうぞ、全部空いています。',
    'まだ誰もいません。ピアはゼロ、帯域は独り占め。',
    'まだ空です — メッシュに編む相手がいません。',
  ],
  'prejoin.inRoom': { other: 'ルームに {count} 人います。' },
  'prejoin.joinRoom': 'ルームに参加',
  'prejoin.renameRoom': 'ルーム名を変更',
  'prejoin.renameFailed': '新しい名前が定着しませんでした。もう一度どうぞ。',

  'room.loading': [
    'ルームを起動中…',
    'ルームを起こしています…',
    'メッシュを温めています…',
  ],
  'room.connecting': [
    'ICE 候補を交換中…',
    'あなたのブラウザを紹介中…',
    'メッシュと交渉中…',
    '礼儀正しく握手中…',
  ],
  'room.participants': { other: '{count} 人' },
  'room.unnamed': '名前のないルーム',
  'room.you': 'あなた',
  'room.someone': '誰か',
  'room.micMuted': 'マイク オフ',
  'room.deafened': 'スピーカー オフ — 何も聞こえていません',
  'room.leftTitle': [
    'ルームから退出しました。o7',
    '切断しました。o7',
    'セッション終了。o7',
  ],
  'room.endedFull': 'ルームは満員です — 上限は 20 人。それを超えるとメッシュは正直でいられません。',
  'room.endedNotFound': 'このルームはもうありません。空のルームは自分で閉じます。',
  'room.endedClosed': 'ルームとの接続が切れました。よくあることです。リンクはまだ生きています。',
  'room.reconnecting':
    'ルームのサーバーに再接続しています — みなさんの通話はそのまま続いています。',
  'room.endedRetry': 'もう一度入ってみる',
  'room.seats': { other: '{count}/{max} 人' },
  'room.seatsAria': '座席: {max} 席中 {count} 席が埋まっています',
  'room.camSlotsFull': 'カメラの枠は満席 — 音声は尽きません',
  'room.camDenied': '空いているカメラ枠がありません。誰かがオフにした瞬間、あなたのがオンになります。',

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
  'quality.sharp.hint': 'コードを読む用 — 1080p 15 fps、セミコロンまで読めます',
  'quality.balanced.label': 'バランス',
  'quality.balanced.hint': '既定 — 1080p 30 fps',
  'quality.smooth.label': 'なめらか',
  'quality.smooth.hint': 'デモやゲーム用 — 720p 60 fps、画素より動き',

  'settings.title': '通話設定',
  'controls.settings': '通話設定',
  'settings.tab.screen': '画面共有',
  'settings.tab.audio': '音声',
  'settings.tab.video': 'ビデオ',
  'settings.tab.general': '一般',
  'settings.screenAudio.title': 'パソコンの音声',
  'settings.mic.profile': 'マイクのプロファイル',
  'settings.language.hint': 'すぐ反映され、この端末に残ります。再読み込みも再起動も不要。',
  'participation.title': 'ここに届くもの',
  'participation.screens.label': '他の人の画面',
  'participation.screens.hint':
    'オフにすると画面はここへ送られません。届いてから隠すのではなく、送り元で断ります。自分が共有する画面はこれまで通り出ていきます。',
  'participation.tools.label': '部屋が流すもの',
  'participation.tools.hint':
    'オフにすると動画もページもそのスクリプトもここでは読み込まれません。部屋のみんなは見たままで、棚のキーからいつでも入れます。',
  'participation.toolOffTitle': 'これには参加していません',
  'participation.toolOffBody': '部屋は {tool} を見ています。ここでは何も読み込んでいません。',
  'participation.toolJoinOnce': '今回だけ {tool} に入る',
  'participation.slowTitle': '接続が苦しそうです',
  'participation.slowBody': '他の人の画面がいちばん重い荷物です。切れば声は残ります。',
  'participation.slowAccept': '画面を切る',
  'participation.slowDismiss': 'このままにする',
  'settings.about.title': 'このアプリについて',
  'settings.close': '設定を閉じる',
  'settings.sounds.title': 'サウンド',
  'settings.sounds.label': '効果音',
  'settings.sounds.hint': 'メッセージが届いたとき、誰かが入ってきたときの小さなピコッ。',
  'settings.desktop.title': 'デスクトップアプリ',
  'settings.desktop.hint': '同じルームを専用ウィンドウで。ネイティブの画面選択と、このパソコン向けのダウンロード付き。',
  'settings.screenAudio.label': 'パソコンの音声を共有',
  'settings.screenAudio.hint': 'システムやタブの音が画面と一緒に流れます — この共有ではなく、次の共有から',
  'settings.mic.title': 'マイク',
  'settings.mic.voice.label': 'ボイス',
  'settings.mic.voice.hint': '部屋の後片付け役：エコーもファンの音も消え、音量は均されます',
  'settings.mic.music.label': 'スタジオ',
  'settings.mic.music.hint': '高ビットレートの無加工ステレオ — 楽器や音楽向け。ハウリングが好きでなければヘッドホンを。',
  'settings.mic.echoCancellation': 'エコーキャンセル',
  'settings.mic.noiseSuppression': 'ノイズ抑制',
  'settings.mic.autoGainControl': '自動音量',
  'settings.camera.title': 'カメラ',
  'settings.camera.eco.label': '節約',
  'settings.camera.eco.hint': 'ホテルの Wi-Fi 向け — 最大 360p 20 fps',
  'settings.camera.standard.label': '標準',
  'settings.camera.standard.hint': '最大 720p 30 fps — 無難な一択',
  'settings.camera.high.label': '高画質',
  'settings.camera.high.hint': '最大 1080p 30 fps — 本気の回線でどうぞ',
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
  'controls.someoneSharing': 'いまは別の人が画面を持っています',
  'controls.screensFull': '画面の枠は 3 つとも使用中 — 3 つが上限です',
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
  'controls.tools': 'ツール',

  'tools.title': 'ツール',
  'tools.on': '実行中',
  'tools.empty': 'このビルドにツールはありません。',
  'tools.full': 'この部屋で開けるツールはもう上限です。',

  'chat.title': 'ルームチャット',
  'chat.empty': [
    'まだメッセージはありません。ピコッ — 挨拶してみましょう 👋',
    'ログが空です。誰かが最初の 1 行を書かないと 👋',
    'まだ何もありません。最初のメッセージをコミットしましょう 👋',
    '沈黙。ピコッ — 破ってください 👋',
  ],
  'chat.noKey':
    'あなたのリンクにはこのルームの鍵が入っていないため、送信できません。招待してくれた人に元のリンクをもらってください — 鍵は # のうしろを通り、サーバーには届きません。',
  'chat.locked': '暗号化されています — あなたのリンクには鍵がありません',
  'chat.messageLabel': 'チャットメッセージ',
  'chat.placeholder': 'メッセージ… Markdown が使えます、/ でコマンド',
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
  'chat.jumpToLatest': '新しいメッセージへ',
  'chat.copy': 'メッセージをコピー',
  'chat.copied': 'コピーしました',
  'chat.copyCode': 'コードをコピー',
  'chat.search': 'メッセージを検索',
  'chat.searchPlaceholder': 'メッセージを探す…',
  'chat.searchClose': '検索を閉じる',
  'chat.searchHits': { other: '{count} 件' },
  'chat.searchNone': [
    '何もありません。言葉を減らしてみてください 🔍',
    'ゼロ件 — アクセントはすでに無視しています 🔍',
    '見つかりません。ビルドは通るのに、ここにはない 🔍',
    '何も。たぶんそれは口で言ったやつです 🔍',
  ],
  'chat.save': '会話を保存',
  'chat.saveNote': 'Markdown ファイルをこのブラウザで作ります — どこにもアップロードしません',
  'chat.transcript.title': 'Freecord — {room}',
  'chat.transcript.savedAt': '{when} に保存',
  'chat.transcript.file': 'ファイルを送信: {files}',
  'chat.transcript.replyTo': '{name} へ',

  /* Slash commands — see the note in en-US.ts. The words after the slash
     stay English; the lines describing them do not. */
  'cmd.menu': 'コマンド',
  'cmd.arg.link': 'リンク',
  'cmd.arg.text': 'テキスト',
  'cmd.arg.code': '言語コード',
  'cmd.mic': 'マイクのオン・オフ',
  'cmd.cam': 'カメラのオン・オフ',
  'cmd.sound': 'スピーカーのオン・オフ — マイクも一緒に切れます',
  'cmd.share': '画面共有を始める・やめる',
  'cmd.play': 'いますぐルーム全員に流す',
  'cmd.queue': 'いま流れているものの後ろに並べる',
  'cmd.skip': 'キューの次のものへ進む',
  'cmd.stop': 'ルームが見ているものをステージから下ろす',
  'cmd.invite': 'ルームのリンクを鍵ごとコピー',
  'cmd.file': 'ファイルを選んで、そのまま相手に送る',
  'cmd.save': '会話を Markdown ファイルとして保存',
  'cmd.search': 'ここで話されたことを探す',
  'cmd.lang': 'アプリの言語を切り替える',
  'cmd.me': '今していることを斜体で伝える',
  'cmd.shrug': '送る文に ¯\\_(ツ)_/¯ を添える',
  'cmd.leave': 'ルームを出る',
  'cmd.usage': 'これは後ろに何か必要です: {usage}',
  'cmd.unknown': '/{name} はここにはありません。/ を入力すると一覧が出ます。',
  'cmd.nothingOn': 'いまルームでは何も流れていません。',
  'cmd.toShelf': 'そのまま再生できるものはありません — リンクは棚に渡したので、ページの中身を読ませられます。',
  'cmd.noLang': 'その名前の言語はありません。このビルドが話すのは {codes} です。',
  'cmd.nothingYet': 'ここではまだ何も話されていません。',
  'cmd.noScreen': 'このブラウザは画面を渡してくれません。',

  'file.attach': 'ファイルを送る',
  'file.direct': 'データチャネルで直接 — サーバーなし、アップロードなし、バケットなし',
  'file.noPeers': [
    'まだ渡す相手がいません。',
    'ピアがいないと送れません — まず誰かを招待しましょう。',
    'ファイルには受け取る人が要りますが、ここには誰もいません。',
  ],
  'file.tooLarge': '1 ファイル {max} まで — それを超えるとブラウザが音を上げます。',
  'file.offer': '{name} さんがファイルを送ろうとしています',
  'file.to': '{name} さんへ',
  'file.accept': '受け取る',
  'file.decline': '断る',
  'file.cancel': 'キャンセル',
  'file.save': '保存',
  'file.dismiss': '閉じる',
  'file.status.pending': '{name} を待っています…',
  'file.status.sending': '送信中… {percent}%',
  'file.status.receiving': '受信中… {percent}%',
  'file.status.sent': '送信済み',
  'file.status.received': '受信済み',
  'file.status.declined': '断られました',
  'file.status.cancelled': 'キャンセルされました',
  'file.status.failed': '転送に失敗しました — 相手が退出したか、接続が切れました。',
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
    'メディア事業者もサードパーティ SDK もありません。プロトコルはすべてリポジトリにあり、全体が無料のインフラで動いています。唯一あり得る例外は任意の TURN です。直接接続を遮断するネットワーク向けの中継で、復号できない暗号化トラフィックをそのまま転送するだけ。自分で立てる場合も変更は 1 行です。本サービスでは現在どれも設定していません。正直に、裏側も書きます：「いっしょに観る」が他人のページをそのまま映すことしかできない場合、そのページはここにいる全員のブラウザで読み込まれ、そのページ自身のスクリプトが動きます。向こうのサイトからは、ふつうのサイトと同じように各自の接続が見えます。設定のスイッチひとつで、あなたのところには何も読み込まれなくなり、ルームはあなた抜きで見続けます。',
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
    'Node 20 とコマンド 2 つで環境は完成 — アカウントも API キーも、登録も不要です。小さいものを選び、型チェックとテストを流し、プルリクエストを出してください。',
  'community.contribute.guide':
    'コントリビューションガイド',
  'community.contribute.conduct':
    '行動規範',
  'community.issues.title': 'バグを見つけた？ 何か欲しい？',
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
  'download.macOtherUnsure': 'お使いの Mac が名乗ってくれませんでした。',
  'download.macOtherArm':
    'Apple シリコン版をダウンロード',
  'download.macOtherIntel':
    'Intel 版をダウンロード',
  'download.showOthers':
    'ほかのプラットフォーム',
  'download.hideOthers':
    'ほかのプラットフォームを隠す',

  /*
   * ブラウザからのインストール。スマートフォンでは「アプリを入手する」話は
   * これで全部で、ダウンロードするものは何もない — ページ自体がアプリ。
   *
   * 手順はこのカタログで唯一ふざけていない場所。誰かが端末を手に、その通りに
   * 操作している。
   */
  'install.cta': 'アプリをインストール',
  'install.title': 'Freecord をインストール',
  'install.lead':
    'ホーム画面から、独立したウィンドウで開きます — 同じ部屋を、まわりのブラウザなしで。',
  'install.also':
    'スマートフォンにダウンロードするものはありません。このページがアプリです。ホーム画面に追加すれば、アプリのように開きます。',
  'install.ios.step1': 'ブラウザのバーにある共有ボタンをタップします。',
  'install.ios.step2': '「ホーム画面に追加」を選びます。',
  'install.menu.step1': 'ブラウザのメニューを開きます。',
  'install.menu.step2': '「アプリをインストール」または「ホーム画面に追加」を選びます。',
  'install.gotIt': 'わかりました',
  // 通話中の同じ案内。パソコンではここにデスクトップ版のダウンロードが出る。
  'install.settings.title': 'ホーム画面に',
  'install.settings.hint':
    'Freecord をアプリとしてインストール：同じ部屋を、独立したウィンドウで、まわりのブラウザなしで。',

  /* ルームのリンクをデスクトップアプリで開く — lib/deep-link.ts を参照。 */
  'deepLink.open': 'このルームをデスクトップアプリで開く',
  'deepLink.opening': 'デスクトップアプリで開いています…',
  'deepLink.stay': 'ブラウザーのままにする',

  'language.picker': '言語',
};
