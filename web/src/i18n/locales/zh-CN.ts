import type { Catalog } from '..';

export const zhCN: Catalog = {
  'app.name': 'Freecord',
  'app.tagline':
    '语音、视频、聊天和屏幕共享，跑在 P2P 网状网络上。中间没有媒体服务器。',
  'app.buildInfo': '版本 {version} · 构建 {build}',

  'home.roomName': '房间名称',
  'home.roomNamePlaceholder': '房间名称 — 或粘贴邀请链接',
  'home.create': '创建房间',
  'home.creating': '正在创建…',
  'home.createFailed': '无法创建房间，请重试。',
  'home.join': '加入房间',
  'home.joinHint': '这是邀请链接 — 点击按钮即可进入该房间。',
  'home.invalidInvite': '这看起来像邀请链接，但不完整。请粘贴完整的链接。',
  'home.community': '社区',

  'home.hero.titleA': '一个房间，',
  'home.hero.titleB': '就是一个链接。',
  'home.footer.downloads': '下载',

  'home.card.hint': '链接就是邀请。',

  'how.link': '工作原理',
  'how.title': 'Freecord 是怎么工作的',
  'how.lead':
    '一个房间就是一个链接，对话在房间里的浏览器之间直接传输。下面是你按下按钮之后发生的事——以及我们的服务器永远看不到的东西。',

  'how.steps.title': '三个步骤',
  'how.step.create.title': '创建房间',
  'how.step.create.body':
    '取不取名字都行。你会拿到一个别人猜不到的链接，除此之外什么都没有：不用账号，不用邮箱，不用密码。',
  'how.step.share.title': '分享链接',
  'how.step.share.body':
    '链接既是邀请，也是凭证。拿到的人就能进来。聊天密钥藏在 URL 里 # 之后的部分，浏览器从不会把它发给服务器。',
  'how.step.talk.title': '开始聊',
  'how.step.talk.body':
    '每个人进来时麦克风和摄像头都是关着的，想开哪个自己开。最多二十个人。语音和共享屏幕永远优先；真正要抢位置的是摄像头——房间越满，能同时开的摄像头越少，每一路的画质也会自动调整。',

  'how.mesh.title': '音视频从不经过我们的服务器',
  'how.mesh.body':
    '语音、视频和屏幕通过原生 WebRTC 在浏览器之间直接流动，默认端到端加密。我们的服务器只负责把浏览器互相介绍，并保存房间里有谁的名单——没有媒体服务器可以偷听，也没有它的账单。如果网络限制严格到无法直连，就需要 TURN 中继；我们没有部署，所以这少数连接会直接失败，而不是悄悄经过第三方。',
  'how.diagram.media': '语音、视频和屏幕：在浏览器之间直连',
  'how.diagram.signaling': '经过服务器的只有信令：房间里有谁，以及怎么连上他们',

  'how.chat.title': '聊天是封好的，也是临时的',
  'how.chat.body':
    '消息用链接里带来的密钥在你的浏览器里加密，所以服务器转发的是它读不懂的文本。什么都不保存：房间关闭时，对话也一起消失。',

  'how.screen.title': '一次只有一个人共享屏幕，按树状转发',
  'how.screen.body':
    '服务器把屏幕共享锁定在一个人身上，即使那个人掉线也会释放这把锁。视频不是由共享者发给所有人：它先发给三个人，每个人再转发给另外三个，所以谁的上行都不会随房间变大而增长。',

  'how.limits.title': '房间遵守的规则',
  'how.limits.body':
    '每个房间二十个人。空房间十五分钟后关闭。三十五秒没有回应的浏览器会被移出，免得崩溃的标签页一直占着位置。超过二十人，网格就不再是诚实的答案——下一步是我们自己的媒体节点，就像屏幕共享已经在参与者之间转发那样。',

  'how.run.title': '自己跑一遍',
  'how.run.body':
    'Node 20 和两条命令。不用账号，不用 API 密钥，不用签任何东西：同一套协议既跑在笔记本上，也跑在 Cloudflare Workers 上。',
  'how.run.copy': '复制命令',
  'how.run.copied': '已复制！',
  'how.more.start': '创建房间',

  'invite.copy': '邀请',
  'invite.copied': '链接已复制！',
  'invite.manualCopy': '复制房间链接：',

  'prejoin.title': '加入 {room}',
  'prejoin.yourName': '你的名字',
  'prejoin.yourNamePlaceholder': '我们怎么称呼你？',
  'prejoin.mic': '麦克风',
  'prejoin.cam': '摄像头',
  'prejoin.shuffle': '换个名字',
  'prejoin.join': '加入',
  'prejoin.notFound': '该房间已不存在。',
  'prejoin.loadFailed': '无法加载房间。',
  'prejoin.backHome': '返回首页',

  'prejoin.notFoundTitle': '找不到房间',
  'prejoin.notFoundBody': '链接可能已经失效 —— 空房间会自动关闭。',
  'prejoin.createNew': '创建新房间',
  'prejoin.errorTitle': '出了点问题',
  'prejoin.errorBody': '无法加载房间，请尝试刷新页面。',
  'prejoin.empty': '还没有人 —— 你可以第一个进来。',
  'prejoin.inRoom': { other: '房间里有 {count} 人。' },
  'prejoin.joinRoom': '进入房间',
  'prejoin.renameRoom': '重命名房间',
  'prejoin.renameFailed': '无法重命名房间。',

  'room.loading': '正在加载房间…',
  'room.connecting': '正在连接房间…',
  'room.participants': { other: '{count} 人' },
  'room.unnamed': '未命名房间',
  'room.you': '你',
  'room.someone': '某人',
  'room.micMuted': '麦克风已关闭',
  'room.deafened': '扬声器已关闭 — 未在收听',
  'room.leftTitle': '你已离开房间',
  'room.endedFull': '房间已满（最多 20 人）。',
  'room.endedNotFound': '该房间已不存在。',
  'room.endedClosed': '与房间的连接已断开。',
  'room.seatsAria': '座位：{max} 个中已占 {count} 个',
  'room.camSlotsFull': '摄像头名额已满 — 语音始终畅通',
  'room.camDenied': '当前没有空余的摄像头名额。等有人关闭摄像头后，你的就能开启。',

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
  'quality.sharp.hint': '代码和文字 —— 1080p 15 fps，绝不模糊',
  'quality.balanced.label': '均衡',
  'quality.balanced.hint': '默认 —— 1080p 30 fps',
  'quality.smooth.label': '流畅',
  'quality.smooth.hint': '视频和游戏 —— 720p 60 fps，优先保证动态',

  'settings.title': '通话设置',
  'controls.settings': '通话设置',
  'settings.screenAudio.label': '共享电脑声音',
  'settings.screenAudio.hint': '系统或标签页的声音随屏幕一起发送 —— 下次共享时生效',
  'settings.mic.title': '麦克风',
  'settings.mic.voice.label': '人声',
  'settings.mic.voice.hint': '净化环境音：消除回声和噪声，自动调平音量',
  'settings.tab.screen': '屏幕共享',
  'settings.tab.audio': '音频',
  'settings.tab.video': '视频',
  'settings.tab.general': '通用',
  'settings.screenAudio.title': '电脑音频',
  'settings.mic.profile': '麦克风模式',
  'settings.language.hint': '立即生效，并在此设备上记住。',
  'settings.about.title': '关于',
  'settings.close': '关闭设置',
  'settings.sounds.title': '声音',
  'settings.sounds.label': '提示音',
  'settings.sounds.hint': '新消息以及有人进出时的提示音。',
  'settings.desktop.title': '桌面应用',
  'settings.desktop.hint': '同样的房间，独立窗口运行，提供适合这台电脑的下载。',
  'settings.mic.music.label': '录音室',
  'settings.mic.music.hint': '无处理立体声、高码率 —— 适合音乐和乐器，请戴耳机',
  'settings.mic.echoCancellation': '回声消除',
  'settings.mic.noiseSuppression': '噪声抑制',
  'settings.mic.autoGainControl': '自动音量',
  'settings.camera.title': '摄像头',
  'settings.camera.eco.label': '省流',
  'settings.camera.eco.hint': '节省流量 —— 最高 360p 20 fps',
  'settings.camera.standard.label': '标准',
  'settings.camera.standard.hint': '最高 720p 30 fps —— 默认',
  'settings.camera.high.label': '高清',
  'settings.camera.high.hint': '最高 1080p 30 fps —— 需要较好的网络',
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
  'controls.someoneSharing': '已有其他人在共享屏幕',
  'controls.quality': '屏幕共享画质',
  'controls.openChat': '打开聊天',
  'controls.closeChat': '关闭聊天',
  'controls.leave': '离开房间',
  'controls.closeMenu': '关闭菜单',

  'chat.title': '房间聊天',
  'chat.empty': '还没有消息，打个招呼吧 👋',
  'chat.noKey':
    '你没有这个房间的密钥，因此无法发送消息。请索取原始邀请链接 —— 密钥就在链接里。',
  'chat.locked':
    '已加密 —— 你没有这个房间的密钥',
  'chat.messageLabel': '聊天消息',
  'chat.placeholder': '消息…',
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

  'file.attach': '发送文件',
  'file.direct': '直接发送给对方，不经过任何服务器',
  'file.noPeers': '房间里还没有其他人。',
  'file.tooLarge': '最大可发送 {max} 的文件。',
  'file.offer': '{name} 想给你发送一个文件',
  'file.to': '发给 {name}',
  'file.accept': '接收',
  'file.decline': '拒绝',
  'file.cancel': '取消',
  'file.save': '保存',
  'file.dismiss': '关闭',
  'file.status.pending': '等待 {name} 接收…',
  'file.status.sending': '发送中… {percent}%',
  'file.status.receiving': '接收中… {percent}%',
  'file.status.sent': '已发送',
  'file.status.received': '已接收',
  'file.status.declined': '已拒绝',
  'file.status.cancelled': '已取消',
  'file.status.failed': '传输失败：对方已离开或连接中断。',
  'file.preview': '以原始尺寸查看图片',
  'file.closePreview': '关闭图片',
  'file.toMany': { other: '发给 {count} 人' },
  'file.status.summary': '{total} 人中 {done} 人已接收',
  'file.status.declinedCount': { other: '{count} 人拒绝' },

  'latency.signal': '到信令服务器的延迟',
  'latency.peer': '与 {name} 的直连延迟',

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
    '没有媒体服务商，也没有第三方 SDK。整套协议都在仓库里，全部运行在免费的基础设施上。唯一可能的例外是可选的 TURN —— 一个为封锁直连的网络准备的中继。它转发的是自己无法解密的加密流量，改一行就能换成自建的。本服务目前没有配置任何 TURN。',
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
    'Node 20 加两条命令，就是全部准备工作。不需要账号，不需要 API 密钥，不需要注册任何东西。挑一件小事，跑一遍类型检查和测试，提一个 pull request。',
  'community.contribute.guide':
    '贡献指南',
  'community.contribute.conduct':
    '行为准则',
  'community.issues.title':
    '发现问题？有什么想要的？',
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
  'download.macOtherUnsure':
    '无法识别你的 Mac。',
  'download.macOtherArm':
    '下载 Apple 芯片版',
  'download.macOtherIntel':
    '下载 Intel 版',
  'download.showOthers':
    '其他平台',
  'download.hideOthers':
    '收起其他平台',

  'language.picker': '语言',
};
