import type { Catalog } from '..';

export const zhCN: Catalog = {
  'app.name': 'Freecord',
  'app.tagline': '语音、视频、聊天和屏幕共享，跑在 P2P 网状连接上。中间没有媒体服务器，不用注册，也没有套路。',
  'app.buildInfo': '版本 {version} · 构建 {build}',

  'desktop.window.room': '房间',
  'desktop.window.minimize': '最小化',
  'desktop.window.maximize': '最大化',
  'desktop.window.restore': '还原',
  'desktop.window.close': '关闭',
  'desktop.menu.open': '菜单',
  'desktop.menu.reload': '重新加载',
  'desktop.menu.zoomIn': '放大',
  'desktop.menu.zoomOut': '缩小',
  'desktop.menu.resetZoom': '实际大小',
  'desktop.menu.fullscreen': '全屏',
  'desktop.menu.devTools': '开发者工具',
  'desktop.menu.openInBrowser': '在浏览器中打开',
  'desktop.menu.sourceCode': '源代码',
  'desktop.menu.quit': '退出',

  'home.roomName': '房间名称',
  'home.roomNamePlaceholder': '房间名称 — 或粘贴邀请链接',
  'home.create': '创建房间',
  'home.creating': [
    '正在拉起…',
    '正在分配房间…',
    '正在占一个 slug…',
  ],
  'home.createFailed': [
    '房间拒绝启动，再试一次。',
    '没成。再来一次通常就好了。',
    '房间说不行。再试试。',
  ],
  'home.join': '加入房间',
  'home.joinHint': '这是一个邀请链接 —— 按钮会直接带你进去。',
  'home.invalidInvite': '这只是邀请链接的一半。整条粘贴，# 也要 —— 房间密钥就住在 # 后面。',
  'home.community': '社区',

  'home.rooms': { other: '到目前为止，这里已经开过 {total} 个房间。' },

  'home.hero.titleA': '一个房间，',
  'home.hero.titleB': '就是一个链接。',
  'home.footer.downloads': '下载',

  'home.card.hint': '链接就是邀请。整个鉴权层就这么多。',

  'how.link': '工作原理',
  'how.title': 'Freecord 是怎么工作的',
  'how.lead':
    '一个房间就是一个链接，对话在房间里的浏览器之间直接传输。下面是你按下按钮之后发生的事——以及我们的服务器永远看不到的东西。',

  'how.steps.title': '三个步骤',
  'how.step.create.title': '创建房间',
  'how.step.create.body': '取不取名都行。你拿回的只有一条谁也猜不到的链接：没有账号，没有邮箱，也没有会忘的密码。',
  'how.step.share.title': '分享链接',
  'how.step.share.body':
    '链接既是邀请，也是凭证。拿到的人就能进来。聊天密钥藏在 URL 里 # 之后的部分，浏览器从不会把它发给服务器。',
  'how.step.talk.title': '开始聊',
  'how.step.talk.body':
    '每个人进来时麦克风和摄像头都是关着的，想开哪个自己开。最多二十个人。语音和共享屏幕永远优先；真正要抢位置的是摄像头——房间越满，能同时开的摄像头越少，每一路的画质也会自动调整。',

  'how.mesh.title': '音视频从不经过我们的服务器',
  'how.mesh.body':
    '语音、视频和屏幕通过原生 WebRTC 在浏览器之间直接流动，端到端加密。我们的服务器把浏览器互相引荐，并保存房间里有谁的名单 —— 没有可以偷听的媒体服务器，也没有为它付的账单。还有一件事，而且只在有人开口时才发生：把一个页面粘进「一起看」，服务器会把那个页面打开一次，从它的标记里读出有什么可以播放，回答你，然后什么都不留。那时也没有媒体经过它 —— 视频由每个浏览器自己从它所在的地方获取。对于严格到无法直连的网络，需要 TURN 中继；我们一台都没有，所以那些少见的连接会直接失败，而不是悄悄经过第三方。',
  'how.diagram.media': '语音、视频和屏幕：在浏览器之间直连',
  'how.diagram.signaling': '经过服务器的只有信令：房间里有谁，以及怎么连上他们',

  'how.chat.title': '聊天是封好的，也是临时的',
  'how.chat.body':
    '消息用链接里带来的密钥在你的浏览器里加密，然后像语音一样直接送到其他浏览器；只有在缺少直连路径时服务器才转发一条，而且转发的是它读不懂的文本。文件根本不经过服务器。什么都不保存：房间关闭时，对话也一起消失。',

  'how.screen.title': '最多同时共享三个屏幕，每个都按树状转发',
  'how.screen.body':
    '服务器最多发放三个屏幕共享名额，共享者一掉线，几秒内就释放名额。屏幕不是由共享者发给所有人：它先发给三个人，每个人再转发给另外三个，所以谁的上行都不会随房间变大而增长。每个共享的屏幕都有自己的一棵树。',

  'how.limits.title': '房间遵守的规则',
  'how.limits.body':
    '每个房间二十人。空房间十五分钟后关闭。安静三十五秒的浏览器会失去座位，这样卡死的标签页就没法一直占着。超过二十人，网状连接就不再是诚实的答案：下一步是我们自己的媒体节点，就像屏幕共享现在已经在对等端之间中继一样。',

  'how.run.title': '自己跑一个',
  'how.run.body':
    'Node 20 加两条命令。不用账号，不用 API 密钥，没有要签的东西：同一套协议在笔记本上和在 Cloudflare Workers 上都能跑，两边都察觉不出区别。',
  'how.run.copy': '复制命令',
  'how.run.copied': '已复制！',
  'how.more.start': '创建房间',

  'invite.copy': '邀请',
  'invite.copied': [
    '已复制！去粘贴吧。',
    '已复制，就在剪贴板里。',
    '已复制 —— 接下来去叫人。',
  ],
  'invite.manualCopy': '复制房间链接：',

  'prejoin.title': '加入 {room}',
  'prejoin.yourName': '你的名字',
  'prejoin.yourNamePlaceholder': '随便一个代号就行 —— 没人核对',
  'prejoin.mic': '麦克风',
  'prejoin.cam': '摄像头',
  'prejoin.shuffle': '再摇一个名字',
  'prejoin.join': '加入',
  'prejoin.notFound': '这个房间已经没了。',
  'prejoin.loadFailed': '房间没加载出来。',
  'prejoin.backHome': '返回首页',

  'prejoin.notFoundTitle': '找不到房间',
  'prejoin.notFoundBody': '链接可能已经过期 —— 空房间十五分钟后会被垃圾回收。',
  'prejoin.createNew': '创建新房间',
  'prejoin.errorTitle': [
    '好吧，它坏了',
    '在我这儿是好的',
    '计划不是这样的',
  ],
  'prejoin.errorBody': '房间没加载出来。刷新一下页面 —— 有效的次数多到我们不太好意思承认。',
  'prejoin.empty': [
    '还没有人 —— 你会是 1 号进程。',
    '空房间。随便挑座位，全是空的。',
    '还没有人。零个对等端，带宽全归你。',
    '还是空的 —— 网状连接找不到可以连的人。',
  ],
  'prejoin.inRoom': { other: '房间里有 {count} 人。' },
  'prejoin.joinRoom': '进入房间',
  'prejoin.renameRoom': '重命名房间',
  'prejoin.renameFailed': '新名字没保住，再试一次。',

  'room.loading': [
    '正在启动房间…',
    '正在叫醒房间…',
    '正在给网状连接热身…',
  ],
  'room.connecting': [
    '正在交换 ICE 候选…',
    '正在把你的浏览器介绍给其他人…',
    '正在和网状连接谈判…',
    '正在礼貌地握手…',
  ],
  'room.participants': { other: '{count} 人' },
  'room.unnamed': '未命名房间',
  'room.you': '你',
  'room.someone': '某人',
  'room.micMuted': '麦克风已关',
  'room.deafened': '扬声器已关 —— 什么都听不到',
  'room.leftTitle': [
    '你已离开房间。o7',
    '已断开连接。o7',
    '本次会话结束。o7',
  ],
  'room.endedFull': '房间满了 —— 二十人是上限。再多，网状连接就不诚实了。',
  'room.endedNotFound': '这个房间已经没了。空房间会自己关掉。',
  'room.endedClosed': '与房间的连接断了。常有的事；链接还能用。',
  'room.reconnecting': '正在重新连接房间服务器 —— 你们之间的通话不受影响。',
  'room.endedRetry': '再试着进入房间',
  'room.seats': { other: '{count}/{max} 人' },
  'room.seatsAria': '座位：{max} 个中已占 {count} 个',
  'room.camSlotsFull': '摄像头名额已满 —— 语音永远管够',
  'room.camDenied': '当前没有空余的摄像头名额。有人一关，你的立刻就开。',

  'screen.yours': '你的屏幕',
  'screen.of': '{name} 的屏幕',
  'screen.via': '经由 {name}',
  'screen.sending': '发送中',
  'screen.receiving': '接收中',
  'screen.enterFullscreen': '全屏查看',
  'screen.exitFullscreen': '退出全屏',
  'screen.enterPip': '在悬浮窗中查看',
  'screen.exitPip': '关闭悬浮窗',

  'quality.title': '屏幕画质',
  'quality.sharp.label': '清晰',
  'quality.sharp.hint': '读代码用 —— 1080p 15 fps，连分号都看得清',
  'quality.balanced.label': '均衡',
  'quality.balanced.hint': '默认 —— 1080p 30 fps',
  'quality.smooth.label': '流畅',
  'quality.smooth.hint': '演示和游戏用 —— 720p 60 fps，动作优先于像素',

  'settings.title': '通话设置',
  'controls.settings': '通话设置',
  'settings.tab.screen': '屏幕共享',
  'settings.tab.audio': '音频',
  'settings.tab.video': '视频',
  'settings.tab.general': '通用',
  'settings.screenAudio.title': '电脑音频',
  'settings.mic.profile': '麦克风模式',
  'settings.language.hint': '立刻生效，并记在这台设备上。不用刷新，也不用重启。',
  'participation.title': '哪些内容会送到你这里',
  'participation.screens.label': '别人共享的屏幕',
  'participation.screens.hint':
    '关闭后，屏幕根本不会发到这里——在源头就被谢绝，而不是收到后再藏起来。你自己共享的屏幕照常发出。',
  'participation.tools.label': '房间放的东西',
  'participation.tools.hint':
    '关闭后，视频、页面以及它们的脚本都不会在这里加载。房间照看不误；想加入时，工具架那个键一直在。',
  'participation.toolOffTitle': '这一场你没参加',
  'participation.toolOffBody': '房间正在看 {tool}，这里什么都没有加载。',
  'participation.toolJoinOnce': '就这一次，加入 {tool}',
  'participation.slowTitle': '你的连接有点吃力',
  'participation.slowBody': '别人的屏幕是最重的那一份。关掉它，声音还在。',
  'participation.slowAccept': '关掉屏幕',
  'participation.slowDismiss': '继续保留',
  'settings.about.title': '关于',
  'settings.close': '关闭设置',
  'settings.sounds.title': '声音',
  'settings.sounds.label': '提示音',
  'settings.sounds.hint': '来消息和有人进门时的几声哔啵。',
  'settings.desktop.title': '桌面应用',
  'settings.desktop.hint': '同样的房间，独立窗口，带原生窗口选择器和适合这台电脑的下载。',
  'settings.screenAudio.label': '共享电脑声音',
  'settings.screenAudio.hint': '系统或标签页的声音会跟着屏幕一起走 —— 从下一次共享开始，不是这一次',
  'settings.screenAudioGuard.label': '把通话本身排除在外',
  'settings.screenAudioGuard.hint':
    '电脑的声音里包含这通通话，不开启的话大家都会听到自己绕回来。这是测出来的，不是假定的：如果采集里本来就没有你，声音会原样通过。',
  'settings.mic.title': '麦克风',
  'settings.mic.voice.label': '人声',
  'settings.mic.voice.hint': '替你收拾房间：回声没了，风扇噪音没了，音量拉平',
  'settings.mic.music.label': '录音室',
  'settings.mic.music.hint': '高码率原始立体声 —— 音乐和乐器用。戴耳机，除非你喜欢啸叫。',
  'settings.mic.echoCancellation': '回声消除',
  'settings.mic.noiseSuppression': '噪声抑制',
  'settings.mic.autoGainControl': '自动音量',
  'settings.camera.title': '摄像头',
  'settings.camera.eco.label': '省流',
  'settings.camera.eco.hint': '酒店 Wi-Fi 用 —— 最高 360p 20 fps',
  'settings.camera.standard.label': '标准',
  'settings.camera.standard.hint': '最高 720p 30 fps —— 稳妥的那个',
  'settings.camera.high.label': '高清',
  'settings.camera.high.hint': '最高 1080p 30 fps —— 请带上像样的网络',
  'settings.device.mic': '麦克风设备',
  'settings.device.speaker': '声音输出',
  'settings.device.default': '系统默认',
  'settings.device.mic.fallback': '麦克风 {number}',
  'settings.device.speaker.fallback': '扬声器 {number}',

  'controls.muteMic': '静音麦克风',
  'controls.unmuteMic': '取消静音',
  'controls.muteSpeaker': '关闭扬声器',
  'controls.unmuteSpeaker': '打开扬声器',
  'controls.camOff': '关闭摄像头',
  'controls.camOn': '开启摄像头',
  'controls.shareScreen': '共享屏幕',
  'controls.stopSharing': '停止共享',
  'controls.someoneSharing': '现在屏幕在别人手上',
  'controls.screensFull': '三个屏幕名额都占满了 —— 三个就是上限',
  'layout.spotlight': '聚焦',
  'layout.grid': '网格',
  'controls.layout': '布局：{name}。按 L 切换',
  'room.pinned': '已固定在舞台',
  'room.pinHint': '点击固定到舞台',
  'room.unpin': '取消固定：舞台重新跟随房间',
  'controls.quality': '屏幕共享画质',
  'controls.openChat': '打开聊天',
  'controls.closeChat': '关闭聊天',
  'controls.leave': '离开房间',
  'controls.closeMenu': '关闭菜单',
  'controls.dock': '通话控制',
  'controls.tools': '工具',
  'controls.mixer': '各音源音量',

  'mixer.title': '音量',
  'mixer.empty': '还没有其他人，也没有在播放的东西。这里会自己填满。',
  'mixer.private': '这些音量只属于你——别人听不出差别。',
  'mixer.deafened': '你的扬声器已关闭，所以这些都没有在播放。音量会保留。',
  'mixer.mute': '只静音这一个',
  'mixer.unmute': '重新听这一个',
  'mixer.muteOne': '静音 {name}',
  'mixer.unmuteOne': '取消静音 {name}',
  'mixer.levelOf': '{name} 的音量',
  'mixer.screenOf': '{name} 的屏幕',

  'tools.title': '工具',
  'tools.on': '进行中',
  'tools.empty': '此版本未附带任何工具。',
  'tools.full': '房间已经开着能开的所有工具了。',

  'chat.title': '房间聊天',
  'chat.empty': [
    '还没有消息。哔啵 —— 打个招呼吧 👋',
    '日志是空的。总得有人写第一行 👋',
    '这里什么都没有。把第一条消息 commit 上去 👋',
    '一片安静。哔啵 —— 打破它 👋',
  ],
  'chat.noKey': '你的链接里没有这个房间的密钥，所以发不出去。找邀请你的人要原始链接 —— 密钥跟在 # 后面，永远不会到达服务器。',
  'chat.locked': '已加密 —— 而你的链接里没有密钥',
  'chat.messageLabel': '聊天消息',
  'chat.placeholder': '消息… 支持 Markdown，输入 / 使用命令',
  'chat.send': '发送消息',
  'chat.toolbar': '消息格式',
  'chat.unread': { other: '条新消息' },
  'chat.bold': '粗体',
  'chat.italic': '斜体',
  'chat.strike': '删除线',
  'chat.code': '代码',
  'chat.link': '链接',
  'chat.list': '列表',
  'chat.quote': '引用',
  'chat.emoji': '表情',
  'chat.format': '格式',
  'chat.reply': '回复',
  'chat.replyingTo': '正在回复 {name}',
  'chat.cancelReply': '取消回复',
  'chat.jumpToLatest': '跳到新消息',
  'chat.copy': '复制消息',
  'chat.copied': '已复制',
  'chat.copyCode': '复制代码',
  'chat.search': '搜索消息',
  'chat.searchPlaceholder': '查找一条消息…',
  'chat.searchClose': '关闭搜索',
  'chat.searchHits': { other: '{count} 条结果' },
  'chat.searchNone': [
    '什么都没有。换少几个词试试 🔍',
    '零结果 —— 而且重音早就被忽略了 🔍',
    '没找到。能编译，只是它不在这里 🔍',
    '什么也没有。也许那句是说出口的 🔍',
  ],
  'chat.save': '保存这段对话',
  'chat.saveNote': '一个 Markdown 文件，就在浏览器里写好 —— 什么都不会上传',
  'chat.transcript.title': 'Freecord —— {room}',
  'chat.transcript.savedAt': '保存于 {when}',
  'chat.transcript.file': '发送了文件：{files}',
  'chat.transcript.replyTo': '给 {name}',

  /* Slash commands — see the note in en-US.ts. The words after the slash
     stay English; the lines describing them do not. */
  'cmd.menu': '命令',
  'cmd.arg.link': '链接',
  'cmd.arg.text': '文字',
  'cmd.arg.code': '语言代码',
  'cmd.mic': '开关麦克风',
  'cmd.cam': '开关摄像头',
  'cmd.sound': '开关扬声器 —— 麦克风也跟着关',
  'cmd.share': '开始或停止共享屏幕',
  'cmd.play': '马上给整个房间放点什么',
  'cmd.queue': '排在正在播放的东西后面',
  'cmd.skip': '跳到队列里的下一个',
  'cmd.stop': '把房间正在看的东西撤下舞台',
  'cmd.invite': '复制房间链接，连密钥一起',
  'cmd.file': '选一个文件，直接发给其他人',
  'cmd.save': '把对话保存为 Markdown 文件',
  'cmd.search': '查找这里说过的话',
  'cmd.lang': '切换应用的语言',
  'cmd.me': '用斜体说出你正在做什么',
  'cmd.shrug': '在要发送的内容后加上 ¯\\_(ツ)_/¯',
  'cmd.leave': '离开房间',
  'cmd.usage': '这个后面需要跟点什么：{usage}',
  'cmd.unknown': '这里没有 /{name}。输入 / 看看有哪些。',
  'cmd.nothingOn': '房间现在没有在放任何东西。',
  'cmd.toShelf': '这里没有东西能直接播放它——链接已经放进工具架，可以让它去读那个页面。',
  'cmd.noLang': '没有叫这个名字的语言。这个版本会说 {codes}。',
  'cmd.nothingYet': '这里还什么都没说过。',
  'cmd.noScreen': '这个浏览器不会交出屏幕。',

  'file.attach': '发送文件',
  'file.direct': '走数据通道直达对方 —— 没有服务器，没有上传，没有存储桶',
  'file.noPeers': [
    '这里还没有人可以收。',
    '没有对等端就没法传 —— 先叫个人进来。',
    '文件得有人接收，而这里一个人也没有。',
  ],
  'file.tooLarge': '每个文件最大 {max} —— 再大浏览器就撂挑子了。',
  'file.offer': '{name} 想给你发送一个文件',
  'file.to': '发给 {name}',
  'file.accept': '接收',
  'file.decline': '拒绝',
  'file.cancel': '取消',
  'file.save': '保存',
  'file.dismiss': '关闭',
  'file.status.pending': '正在等 {name}…',
  'file.status.sending': '发送中… {percent}%',
  'file.status.receiving': '接收中… {percent}%',
  'file.status.sent': '已发送',
  'file.status.received': '已接收',
  'file.status.declined': '已拒绝',
  'file.status.cancelled': '已取消',
  'file.status.failed': '传输失败 —— 对方离开了，或者连接断了。',
  'file.preview': '以原始尺寸查看图片',
  'file.closePreview': '关闭图片',
  'file.toMany': { other: '发给 {count} 人' },
  'file.status.summary': '{total} 人中 {done} 人已接收',
  'file.status.declinedCount': { other: '{count} 人拒绝' },

  'latency.signal': '到信令服务器的延迟',
  'latency.peer': '与 {name} 的直连延迟',
  'latency.self': '你在网状网络中的延迟 — 各链路的中位数',

  // Community page — English source lives in en-US.ts, owned by its author.
  'community.back':
    '返回首页',
  'community.title':
    'Freecord 是开源项目',
  'community.lead':
    '一个和朋友聊天的地方，什么都不向你索取：没有账号，没有下载，中间没有别人。阅读代码，自己部署，或者帮它变得更好。',
  'community.promise.title':
    '我们的承诺',
  'community.promise.guest.title':
    '永远不需要注册',
  'community.promise.guest.body':
    '创建房间，发出链接。链接本身就是凭证 —— 一段无法被猜到的随机字符。没有账号要注册，没有邮箱要交出，也没有密码要记。',
  'community.promise.p2p.title':
    '中间没有媒体服务器',
  'community.promise.p2p.body':
    '语音、视频和屏幕共享通过原生 WebRTC 在浏览器之间直接传输，默认端到端加密。服务器只负责信令和房间状态，就算想看也看不到。',
  'community.promise.chat.title':
    '不留痕迹的聊天',
  'community.promise.chat.body':
    '消息在你的浏览器里加密，密钥就存在房间链接中。浏览器从不把 URL 的片段发给服务器，所以我们的服务器转发的是自己读不懂的文本，也不会保存任何内容 —— 聊天随房间一起消失。另一面同样坦白：拿到链接的人都能一起读，就像他们能直接进来一样。',
  'community.promise.vendor.title':
    '没有服务商，没有 SDK',
  'community.promise.vendor.body':
    '没有媒体服务商，也没有第三方 SDK。整套协议都在仓库里，全部运行在免费的基础设施上。唯一可能的例外是可选的 TURN —— 一个为封锁直连的网络准备的中继。它转发的是自己无法解密的加密流量，改一行就能换成自建的。本服务目前没有配置任何 TURN。把另一面也说清楚：当「一起看」只能把别人的页面原样放上来时，那个页面会在这里每个人的浏览器里加载，并运行它自己的脚本，对面的站点也就像任何站点那样看得到每个人的连接。设置里的一个开关就能让这些在你这边完全不加载，房间会在没有你的情况下继续看。',
  'community.source.title':
    '阅读源码',
  'community.source.body':
    '一切都在 GitHub 上，采用 MIT 许可 —— 随意使用、fork、自行部署。架构文档是不加粉饰的那一版：点对点网状连接真正的代价、房间为什么止步于二十人，以及哪些技术债是被记录下来而不是被藏起来的。',
  'community.source.repo':
    '在 GitHub 上查看',
  'community.source.architecture':
    '阅读架构文档',
  'community.source.license':
    'MIT 许可证',
  'community.contribute.title':
    '参与贡献',
  'community.contribute.body':
    'Node 20 加两条命令就是全部准备 —— 不用账号，不用 API 密钥，什么都不用注册。挑件小事，跑一遍类型检查和测试，提一个 pull request。',
  'community.contribute.guide':
    '贡献指南',
  'community.contribute.conduct':
    '行为准则',
  'community.issues.title': '发现 bug？想要点什么？',
  'community.issues.body':
    'issue 两件事都受理。对实时应用来说，上下文比堆栈信息更有用：请告诉我们你的浏览器、房间里有多少人、当时是否有人在共享屏幕，以及任一方是否处于 VPN 或公司网络之后。',
  'community.issues.report':
    '报告问题',
  'community.issues.browse':
    '浏览 issue',
  'community.desktop.title':
    '桌面端也有',
  'community.desktop.body':
    'macOS、Windows 和 Linux 的桌面应用包裹着同一个页面，并补上浏览器给不了的东西：原生屏幕选择器和真正的系统媒体权限。',
  'community.footer':
    '基于 MIT 许可发布。由 Henrique Brito 和贡献者共同打造。',

  // Desktop download card. Target ids mirror DesktopTarget in the domain.
  'download.target.mac-arm64':
    'macOS · Apple 芯片',
  'download.target.mac-x64':
    'macOS · Intel',
  'download.target.windows-x64':
    'Windows · 64 位',
  'download.target.linux-appimage':
    'Linux · AppImage',
  'download.target.linux-deb':
    'Linux · .deb',
  'download.hint.mac-arm64':
    'M1 及更新机型',
  'download.hint.mac-x64':
    'Intel 芯片的 Mac，2020 年以前',
  'download.hint.windows-x64':
    'Windows 10 和 11',
  'download.hint.linux-appimage':
    '适用于任何发行版，无需安装',
  'download.hint.linux-deb':
    'Debian、Ubuntu 及衍生版',
  'download.cta':
    '下载 {os} 版应用',
  'download.also':
    'Freecord 也有桌面应用 —— 带原生屏幕选择器。',
  'download.firstRun.mac':
    '应用没有使用 Apple 证书签名，首次打开时会被 macOS 拦截。请前往“系统设置”→“隐私与安全性”，点按“仍要打开”；macOS 14 及更早版本请右键点按应用并选择“打开”。',
  'download.firstRun.windows':
    'Windows 会提示发布者未知（应用未签名）：点击“更多信息”→“仍要运行”。',
  'download.firstRun.linux':
    '打开 AppImage 前先赋予执行权限：chmod +x freecord-linux-x86_64.AppImage',
  'download.macOtherConfident':
    '你的 Mac 是另一种芯片？',
  'download.macOtherUnsure': '你的 Mac 不肯报上名来。',
  'download.macOtherArm':
    '下载 Apple 芯片版',
  'download.macOtherIntel':
    '下载 Intel 版',
  'download.showOthers':
    '其他平台',
  'download.hideOthers':
    '收起其他平台',

  /*
   * 从浏览器安装 —— 在手机上，这就是「获取应用」的全部：那里没有什么可下载的，
   * 页面本身就是应用。
   *
   * 这些步骤是本目录里唯一不开玩笑的角落：有人正拿着手机照着做。
   */
  'install.cta': '安装应用',
  'install.title': '安装 Freecord',
  'install.lead': '从主屏幕打开，拥有独立窗口——同样的房间，四周没有浏览器。',
  'install.also':
    '手机上没有什么可下载的。这个页面就是应用：把它添加到主屏幕，它就像应用一样打开。',
  'install.ios.step1': '点按浏览器栏中的“分享”按钮。',
  'install.ios.step2': '选择“添加到主屏幕”。',
  'install.menu.step1': '打开浏览器的菜单。',
  'install.menu.step2': '选择“安装应用”或“添加到主屏幕”。',
  'install.gotIt': '知道了',
  // 通话中同样的入口，电脑上那里放的是桌面版下载。
  'install.settings.title': '添加到主屏幕',
  'install.settings.hint': '把 Freecord 装成应用：同样的房间，独立窗口，四周没有浏览器。',

  /* 在桌面应用中打开房间链接——见 lib/deep-link.ts。 */
  'deepLink.open': '在桌面应用中打开这个房间',
  'deepLink.opening': '正在桌面应用中打开…',
  'deepLink.stay': '留在浏览器中',

  'language.picker': '语言',
};
