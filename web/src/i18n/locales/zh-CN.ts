import type { Catalog } from '..';

export const zhCN: Catalog = {
  'app.name': 'Freecord',
  'app.tagline': '语音、视频、聊天、屏幕共享。无需注册——一个链接就够。',

  'home.roomName': '房间名称',
  'home.roomNamePlaceholder': '房间名称（可选）',
  'home.create': '创建房间',
  'home.creating': '正在创建…',
  'home.createFailed': '无法创建房间，请重试。',
  'home.community': '社区',

  'home.chip.opensource': '开源 · MIT',
  'home.chip.p2p': '原生 WebRTC P2P',
  'home.chip.nosignup': '无需注册',

  'home.card.title': '开个房间',
  'home.card.hint': '链接就是邀请。',

  'home.dev.title': '写给开发者',
  'home.dev.lead': '没有服务商、没有 SDK、没有外部凭证。克隆、运行、fork。',
  'home.dev.copy': '复制命令',
  'home.dev.copied': '已复制！',
  'home.dev.p2p.title': '媒体从不经过服务器',
  'home.dev.p2p.body':
    '语音、视频和屏幕共享通过原生 WebRTC 的 P2P 网状网络在浏览器之间直接传输。服务器只负责信令和房间状态。',
  'home.dev.selfhost.title': '单进程自托管',
  'home.dev.selfhost.body':
    '一个 Node 进程同时提供 API、WebSocket 和构建好的前端。也可以把同一协议部署到 Cloudflare Workers，全程免费方案。',
  'home.dev.protocol.title': '协议归你所有',
  'home.dev.protocol.body':
    '自研 WebSocket 信令——房间、SDP/ICE 转发、聊天和屏幕锁都在一处。Fork 之后规则由你定。',
  'home.dev.light.title': '极致轻量',
  'home.dev.light.body':
    '房间包只有约 14 kB。外层是 React + Vite，其余全部手写——连 i18n 也是。',
  'home.dev.github': '去 GitHub 点星',
  'home.dev.architecture': '阅读架构文档',
  'home.dev.contribute': '贡献指南',

  'invite.copy': '邀请',
  'invite.copied': '链接已复制！',
  'invite.manualCopy': '复制房间链接：',

  'prejoin.title': '加入 {room}',
  'prejoin.yourName': '你的名字',
  'prejoin.yourNamePlaceholder': '我们怎么称呼你？',
  'prejoin.micOn': '开启麦克风加入',
  'prejoin.camOn': '开启摄像头加入',
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

  'room.loading': '正在加载房间…',
  'room.connecting': '正在连接房间…',
  'room.participants': { other: '{count} 人' },
  'room.unnamed': '未命名房间',
  'room.you': '你',
  'room.someone': '某人',
  'room.micMuted': '麦克风已关闭',
  'room.leftTitle': '你已离开房间',
  'room.endedFull': '房间已满（最多 8 人）。',
  'room.endedNotFound': '该房间已不存在。',
  'room.endedClosed': '与房间的连接已断开。',

  'screen.yours': '你的屏幕',
  'screen.of': '{name} 的屏幕',
  'screen.via': '经由 {name}',
  'screen.sending': '发送中',
  'screen.receiving': '接收中',
  'screen.enterFullscreen': '全屏查看',
  'screen.exitFullscreen': '退出全屏',

  'quality.title': '屏幕画质',
  'quality.note': '立即生效，共享过程中也可切换。屏幕画面在成员之间接力转发，因此房间人数增加时画质不再下降。',
  'quality.sharp.label': '清晰',
  'quality.sharp.hint': '代码和文字 —— 1080p 15 fps，绝不模糊',
  'quality.balanced.label': '均衡',
  'quality.balanced.hint': '默认 —— 1080p 30 fps',
  'quality.smooth.label': '流畅',
  'quality.smooth.hint': '视频和游戏 —— 720p 60 fps，优先保证动态',

  'controls.muteMic': '静音麦克风',
  'controls.unmuteMic': '取消静音',
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
  'chat.messageLabel': '聊天消息',
  'chat.placeholder': '消息…  **粗体**、`代码`、- 列表',
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
    '消息只存在于房间里，随房间一起消失。刻意做到零内容存储：没有可泄露的，没有可出售的，也没有可交出的。',
  'community.promise.vendor.title':
    '没有服务商，没有 SDK',
  'community.promise.vendor.body':
    '没有媒体服务商，也没有第三方 SDK。整套协议都在仓库里，全部运行在免费的基础设施上。唯一可能的例外是可选的 TURN —— 一个为封锁直连的网络准备的中继。它转发的是自己无法解密的加密流量，改一行就能换成自建的。本服务目前没有配置任何 TURN。',
  'community.source.title':
    '阅读源码',
  'community.source.body':
    '一切都在 GitHub 上，采用 MIT 许可 —— 随意使用、fork、自行部署。架构文档是不加粉饰的那一版：点对点网状连接真正的代价、房间为什么止步于八人，以及哪些技术债是被记录下来而不是被藏起来的。',
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
    'macOS、Windows 和 Linux 的桌面应用包裹着同一个页面，并补上浏览器给不了的东西：原生屏幕选择器和真正的系统媒体权限。下载入口在首页。',
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
