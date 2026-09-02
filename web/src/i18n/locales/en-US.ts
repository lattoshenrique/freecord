/**
 * Source of truth for every user-visible string.
 *
 * Adding a key here makes it required in all other locales — a missing
 * translation is a type error, not a surprise at runtime.
 */
export const enUS = {
  'app.name': 'Freecord',
  'app.tagline':
    'Voice, video, chat and screen sharing over a P2P mesh. No media server in the middle, no account, no catch.',
  'app.buildInfo': 'Version {version} · build {build}',

  /*
   * The desktop app's own title bar (components/TitleBar.tsx). The window has
   * no system chrome, so these are the labels the operating system would
   * otherwise have written for us.
   */
  'desktop.window.room': 'Room',
  'desktop.window.minimize': 'Minimize',
  'desktop.window.maximize': 'Maximize',
  'desktop.window.restore': 'Restore',
  'desktop.window.close': 'Close',
  'desktop.menu.open': 'Menu',
  'desktop.menu.reload': 'Reload',
  'desktop.menu.zoomIn': 'Zoom in',
  'desktop.menu.zoomOut': 'Zoom out',
  'desktop.menu.resetZoom': 'Actual size',
  'desktop.menu.fullscreen': 'Full screen',
  'desktop.menu.devTools': 'Developer tools',
  'desktop.menu.openInBrowser': 'Open in browser',
  'desktop.menu.sourceCode': 'Source code',
  'desktop.menu.quit': 'Quit',

  'home.roomName': 'Room name',
  'home.roomNamePlaceholder': 'Room name — or paste an invite link',
  'home.create': 'Create room',
  'home.creating': [
    'Spinning it up…',
    'Allocating a room…',
    'Reserving a slug…',
  ],
  'home.createFailed': [
    'The room refused to boot. Give it another go.',
    'That did not take. One more try usually does it.',
    'The room said no. Try again.',
  ],
  'home.join': 'Join room',
  'home.joinHint': 'That is an invite link — the button walks you straight in.',
  'home.invalidInvite':
    'That is half an invite link. Paste the whole thing, hash and all — the room key lives after the #.',
  'home.community': 'Community',

  /*
   * The counter under the button. `{total}` is the number already formatted
   * for the locale, so it carries the thousands separator; `count` is passed
   * alongside it, unformatted, because that is what picks the plural form.
   */
  'home.rooms': {
    one: '{total} room has happened here so far.',
    other: '{total} rooms have happened here so far.',
  },

  'home.hero.titleA': 'A room is',
  'home.hero.titleB': 'just a link.',
  'home.footer.downloads': 'Downloads',

  'home.card.hint': 'The link is the invite. That is the entire auth layer.',

  'how.link': 'How it works',
  'how.title': 'How Freecord works',
  'how.lead':
    'A room is a link, and the conversation goes straight between the browsers in it. Here is what happens after you press the button — and what our server never sees.',

  'how.steps.title': 'Three steps',
  'how.step.create.title': 'Create the room',
  'how.step.create.body':
    'Name it or don’t. You get back a link nobody can guess, and nothing else: no account, no email, no password to forget.',
  'how.step.share.title': 'Share the link',
  'how.step.share.body':
    'The link is both the invitation and the credential. Whoever has it walks in. The chat key travels in the part of the URL after the #, which browsers never send to a server.',
  'how.step.talk.title': 'Talk',
  'how.step.talk.body':
    'Everyone arrives muted and off camera, and turns on what they want. Up to twenty people. Audio and the shared screen always come first; cameras are the ones that compete for room — in a full room fewer of them can be on, and the quality of each adjusts itself.',

  'how.mesh.title': 'The media never touches our server',
  'how.mesh.body':
    'Voice, video and screen flow browser to browser over native WebRTC, encrypted end to end. Our server introduces the browsers to each other and keeps the list of who is in the room — there is no media server to eavesdrop, and no bill for one either. One thing more, and only when somebody asks for it: paste a page into the video tool and the server opens that one page, reads its markup for what is playable, answers, and keeps nothing. No media passes through it then either — every browser fetches the video from wherever it lives. A network too restrictive for a direct connection would need a TURN relay; we run none, so those rare connections fail instead of quietly passing through a third party.',
  'how.diagram.media': 'Voice, video and screen: straight between the browsers',
  'how.diagram.signaling': 'Through the server, only the signaling: who is in the room, and how to reach them',

  'how.chat.title': 'The chat is sealed, and temporary',
  'how.chat.body':
    'Messages are encrypted in your browser with the key that came in the link, and travel straight to the other browsers like the voice does; the server only passes one along when a direct path is missing, and it relays text it cannot read. Files never touch it at all. Nothing is stored: when the room closes, the conversation goes with it.',

  'how.screen.title': 'Up to three screens at once, each relayed as a tree',
  'how.screen.body':
    'The server grants at most three screen slots, and frees one within seconds if its sharer’s connection drops. A screen does not go from the sharer to everyone: it reaches three peers, and each of them forwards it to three more, so nobody’s upload grows with the room. Each shared screen has a tree of its own.',

  'how.limits.title': 'The rules the room lives by',
  'how.limits.body':
    'Twenty people per room. An empty room closes after fifteen minutes. A browser that goes quiet for thirty-five seconds loses its seat, so a crashed tab cannot squat on one forever. Past twenty a mesh stops being the honest answer: the next step is a media node of our own, the way screen sharing already relays between peers.',

  'how.run.title': 'Run your own',
  'how.run.body':
    'Node 20 and two commands. No account, no API key, nothing to sign: the same protocol runs on your laptop and on Cloudflare Workers, and the two do not know the difference.',
  'how.run.copy': 'Copy commands',
  'how.run.copied': 'Copied!',
  'how.more.start': 'Create a room',

  'invite.copy': 'Invite',
  'invite.copied': [
    'Copied! Go paste it somewhere.',
    'Copied. The clipboard has it.',
    'Copied — now go get people.',
  ],
  'invite.manualCopy': 'Copy the room link:',

  'prejoin.title': 'Join {room}',
  'prejoin.yourName': 'Your name',
  'prejoin.yourNamePlaceholder': 'Any handle will do — nobody checks',
  'prejoin.mic': 'Microphone',
  'prejoin.cam': 'Camera',
  'prejoin.shuffle': 'Roll another name',
  'prejoin.join': 'Join',
  'prejoin.notFound': 'This room is gone.',
  'prejoin.loadFailed': 'The room did not load.',
  'prejoin.backHome': 'Back to start',

  'prejoin.notFoundTitle': 'Room not found',
  'prejoin.notFoundBody':
    'The link may have expired — an empty room garbage-collects itself after fifteen minutes.',
  'prejoin.createNew': 'Create a new room',
  'prejoin.errorTitle': [
    'Well, that broke',
    'It worked on our machine',
    'That did not go to plan',
  ],
  'prejoin.errorBody':
    'The room did not load. Reload the page — that fixes it more often than we would like to admit.',
  'prejoin.empty': [
    'Nobody here yet — you would be process 1.',
    'Empty room. Pick any seat, they are all free.',
    'Nobody here yet. Zero peers, all the bandwidth.',
    'Still empty — the mesh has nothing to mesh with.',
  ],
  'prejoin.inRoom': { one: '{count} person in the room.', other: '{count} people in the room.' },
  'prejoin.joinRoom': 'Join the room',
  'prejoin.renameRoom': 'Rename the room',
  'prejoin.renameFailed': 'The new name did not stick. Try again.',

  'room.loading': [
    'Booting the room…',
    'Waking the room up…',
    'Warming up the mesh…',
  ],
  'room.connecting': [
    'Trading ICE candidates…',
    'Introducing your browser to the others…',
    'Negotiating with the mesh…',
    'Shaking hands, politely…',
  ],
  'room.participants': { one: '{count} participant', other: '{count} participants' },
  'room.unnamed': 'Unnamed room',
  'room.you': 'you',
  'room.someone': 'Someone',
  'room.micMuted': 'Mic off',
  'room.deafened': 'Speakers off — hearing nothing',
  'room.leftTitle': [
    'You left the room. o7',
    'Disconnected. o7',
    'Session over. o7',
  ],
  'room.endedFull': 'The room is full — twenty is the cap. Past that a mesh stops being honest.',
  'room.endedNotFound': 'This room is gone. Empty rooms close themselves.',
  'room.endedClosed': 'The connection to the room dropped. It happens; the link still works.',
  'room.endedRetry': 'Try the room again',
  'room.seats': { one: '{count}/{max} participant', other: '{count}/{max} participants' },
  'room.seatsAria': 'Seats: {count} of {max} taken',
  'room.camSlotsFull': 'Camera seats are full — audio never runs out',
  'room.camDenied':
    'No camera slot is free right now. Yours comes on the moment somebody turns theirs off.',

  'screen.yours': 'Your screen',
  'screen.of': "{name}'s screen",
  'screen.via': 'via {name}',
  'screen.sending': 'Sending',
  'screen.receiving': 'Receiving',
  'screen.enterFullscreen': 'View fullscreen',
  'screen.exitFullscreen': 'Exit fullscreen',
  'screen.enterPip': 'View in a floating window',
  'screen.exitPip': 'Close the floating window',

  'quality.title': 'Screen quality',
  'quality.sharp.label': 'Sharp',
  'quality.sharp.hint': 'For reading code — 1080p at 15 fps, every semicolon legible',
  'quality.balanced.label': 'Balanced',
  'quality.balanced.hint': 'The default — 1080p at 30 fps',
  'quality.smooth.label': 'Smooth',
  'quality.smooth.hint': 'For demos and games — 720p at 60 fps, motion over pixels',

  // Media settings menu — the screen presets above plus client-local audio/camera choices.
  'settings.title': 'Call settings',
  'controls.settings': 'Call settings',
  'settings.tab.screen': 'Screen share',
  'settings.tab.audio': 'Audio',
  'settings.tab.video': 'Video',
  'settings.tab.general': 'General',
  'settings.screenAudio.title': 'Computer audio',
  'settings.mic.profile': 'Microphone profile',
  'settings.language.hint': 'Applies instantly and sticks on this device. No reload, no restart.',
  'participation.title': 'What reaches you',
  'participation.screens.label': "Other people's screens",
  'participation.screens.hint':
    'Off and the screen is never sent here — turned away at the source, not hidden after arriving. Yours still goes out when you share.',
  'participation.tools.label': 'Whatever the room puts on',
  'participation.tools.hint':
    'Off and the video, the page and their scripts never load here. The room keeps watching; the shelf key still lets you in when you want.',
  'participation.toolOffTitle': 'You sat this one out',
  'participation.toolOffBody': 'The room is on {tool}. None of it is loading here.',
  'participation.toolJoinOnce': 'Join {tool} this once',
  'participation.slowTitle': 'Your connection is having a hard time',
  'participation.slowBody':
    "Other people's screens are the heaviest thing arriving. Turning them off keeps the voices.",
  'participation.slowAccept': 'Turn screens off',
  'participation.slowDismiss': 'Keep them',
  'settings.about.title': 'About',
  'settings.close': 'Close settings',
  'settings.sounds.title': 'Sounds',
  'settings.sounds.label': 'Sound effects',
  'settings.sounds.hint': 'Little blips when a message lands and when someone walks in.',
  'settings.desktop.title': 'Desktop app',
  'settings.desktop.hint':
    'The same rooms in a window of their own, with a native screen picker and the download for this computer.',
  'settings.screenAudio.label': 'Share computer audio',
  'settings.screenAudio.hint':
    'System or tab audio rides along with your screen — from the next share, not this one',
  'settings.mic.title': 'Microphone',
  'settings.mic.voice.label': 'Voice',
  'settings.mic.voice.hint':
    'Cleans up after your room: echo gone, fan noise gone, volume levelled',
  'settings.mic.music.label': 'Studio',
  'settings.mic.music.hint':
    'Raw stereo at high bitrate — music and instruments. Headphones, unless you enjoy feedback.',
  'settings.mic.echoCancellation': 'Echo cancellation',
  'settings.mic.noiseSuppression': 'Noise suppression',
  'settings.mic.autoGainControl': 'Automatic volume',
  'settings.camera.title': 'Camera',
  'settings.camera.eco.label': 'Data saver',
  'settings.camera.eco.hint': 'For hotel wifi — up to 360p at 20 fps',
  'settings.camera.standard.label': 'Standard',
  'settings.camera.standard.hint': 'Up to 720p at 30 fps — the sensible one',
  'settings.camera.high.label': 'High',
  'settings.camera.high.hint': 'Up to 1080p at 30 fps — bring a real connection',
  'settings.device.mic': 'Microphone device',
  'settings.device.speaker': 'Sound output',
  'settings.device.default': 'System default',
  'settings.device.mic.fallback': 'Microphone {number}',
  'settings.device.speaker.fallback': 'Speaker {number}',

  'controls.muteMic': 'Mute microphone',
  'controls.unmuteMic': 'Unmute microphone',
  'controls.muteSpeaker': 'Mute speakers',
  'controls.unmuteSpeaker': 'Unmute speakers',
  'controls.camOff': 'Turn camera off',
  'controls.camOn': 'Turn camera on',
  'controls.shareScreen': 'Share screen',
  'controls.stopSharing': 'Stop sharing',
  'controls.someoneSharing': 'Someone else has the screen right now',
  'controls.screensFull': 'All three screen slots are taken — three is the limit',
  'layout.spotlight': 'Spotlight',
  'layout.grid': 'Grid',
  'controls.layout': 'Layout: {name}. Press L to switch',
  'room.pinned': 'Kept on stage',
  'room.pinHint': 'Click to keep on stage',
  'room.unpin': 'Unpin: let the stage follow the room',
  'controls.quality': 'Screen sharing quality',
  'controls.openChat': 'Open chat',
  'controls.closeChat': 'Close chat',
  'controls.leave': 'Leave room',
  'controls.closeMenu': 'Close menu',
  'controls.dock': 'Call controls',
  'controls.tools': 'Tools',

  'tools.title': 'Tools',
  'tools.on': 'on',
  'tools.empty': 'This build ships no tools.',
  'tools.full': 'The room is already carrying as many tools as it can.',

  'chat.title': 'Room chat',
  'chat.empty': [
    'No messages yet. Blip bop — say hi 👋',
    'Empty log. Someone has to write the first line 👋',
    'Nothing here yet. Commit the first message 👋',
    'Silence. Blip bop — break it 👋',
  ],
  'chat.noKey':
    'Your link came without this room’s key, so nothing can go out. Ask whoever invited you for the original link — the key rides after the # and never reaches a server.',
  'chat.locked': 'Encrypted — and your link came without the key',
  'chat.messageLabel': 'Chat message',
  'chat.placeholder': 'Message… markdown works',
  'chat.send': 'Send message',
  'chat.toolbar': 'Message formatting',
  'chat.unread': { one: 'new message', other: 'new messages' },
  'chat.bold': 'Bold',
  'chat.italic': 'Italic',
  'chat.strike': 'Strikethrough',
  'chat.code': 'Code',
  'chat.link': 'Link',
  'chat.list': 'List',
  'chat.quote': 'Quote',
  'chat.emoji': 'Emoji',
  'chat.format': 'Formatting',
  'chat.reply': 'Reply',
  'chat.replyingTo': 'Replying to {name}',
  'chat.cancelReply': 'Cancel reply',
  'chat.jumpToLatest': 'Jump to the new messages',

  'file.attach': 'Send a file',
  'file.direct': 'Straight to them over a data channel — no server, no upload, no bucket',
  'file.noPeers': [
    'Nobody here to send it to yet.',
    'No peers, no transfer — invite someone first.',
    'A file needs a receiver, and there is nobody here.',
  ],
  'file.tooLarge': 'Up to {max} per file — past that the browser taps out.',
  'file.offer': '{name} wants to send you a file',
  'file.to': 'to {name}',
  'file.accept': 'Accept',
  'file.decline': 'Decline',
  'file.cancel': 'Cancel',
  'file.save': 'Save',
  'file.dismiss': 'Dismiss',
  'file.status.pending': 'Waiting on {name}…',
  'file.status.sending': 'Sending… {percent}%',
  'file.status.receiving': 'Receiving… {percent}%',
  'file.status.sent': 'Sent',
  'file.status.received': 'Received',
  'file.status.declined': 'Declined',
  'file.status.cancelled': 'Cancelled',
  'file.status.failed': 'Transfer failed — the other side left, or the connection dropped.',
  'file.preview': 'Open image at full size',
  'file.closePreview': 'Close image',
  'file.toMany': { one: 'to {count} person', other: 'to {count} people' },
  'file.status.summary': 'Received by {done} of {total}',
  'file.status.declinedCount': { one: '{count} declined', other: '{count} declined' },

  'latency.signal': 'Latency to the signaling server',
  'latency.peer': 'Direct latency with {name}',
  'latency.self': 'Your latency in the mesh — the middle of your links',

  'community.back': 'Back to start',
  'community.title': 'Freecord is open source',
  'community.lead':
    'A place to talk with friends that asks nothing of you: no account, no download, nobody in the middle. Read the code, run your own, or help make it better.',

  'community.promise.title': 'The promise',
  'community.promise.guest.title': 'No signup, ever',
  'community.promise.guest.body':
    'Create a room, send the link. The link is the credential — an unguessable random slug. There is no account to create, no email to hand over, no password to forget.',
  'community.promise.p2p.title':
    'No media server in the middle',
  'community.promise.p2p.body':
    'Voice, video and screen sharing flow straight between browsers over native WebRTC, encrypted end to end by default. The server only carries signaling and room state — it could not watch you if it wanted to.',
  'community.promise.chat.title': 'Chat that leaves nothing behind',
  'community.promise.chat.body':
    'Messages are encrypted in your browser with a key that lives in the room link. Browsers never send a fragment to a server, so ours relays text it cannot read — and stores none of it either: the chat disappears with the room. The flip side is honest: anyone holding the link can read along, exactly as they can walk in.',
  'community.promise.vendor.title': 'No vendor, no SDK',
  'community.promise.vendor.body':
    'No media provider and no third-party SDK. The entire protocol lives in the repository and the whole thing runs on free infrastructure. The single possible exception is optional TURN, a relay for networks that block direct connections — it forwards encrypted traffic it cannot read, and self-hosting it is a one-line change. This service has none configured today.',

  'community.source.title': 'Read the source',
  'community.source.body':
    'Everything is on GitHub under the MIT license — use it, fork it, host your own. The architecture document is the honest version: what a peer-to-peer mesh really costs, why rooms stop at twenty, and which debts are mapped rather than hidden.',
  'community.source.repo': 'View on GitHub',
  'community.source.architecture': 'Read the architecture',
  'community.source.license': 'MIT license',

  'community.contribute.title': 'Contribute',
  'community.contribute.body':
    'Node 20 and two commands is the entire setup — no account, no API key, nothing to sign up for. Pick something small, run the type checker and the tests, open a pull request.',
  'community.contribute.guide': 'Contributing guide',
  'community.contribute.conduct': 'Code of conduct',

  'community.issues.title': 'Found a bug? Want a thing?',
  'community.issues.body':
    'Issues are the place for both. For a real-time app, context beats a stack trace: tell us your browser, how many people were in the room, whether anyone was sharing a screen, and whether either side was behind a VPN or a corporate network.',
  'community.issues.report': 'Report a bug',
  'community.issues.browse': 'Browse the issues',

  'community.desktop.title': 'On the desktop too',
  'community.desktop.body':
    'A desktop app for macOS, Windows and Linux wraps the same page and adds what a browser will not: a native screen picker and real system media permissions.',

  'community.footer': 'Released under the MIT license. Built by Henrique Brito and contributors.',

  // Desktop download card. Target ids mirror DesktopTarget in the domain.
  'download.target.mac-arm64':
    'macOS · Apple Silicon',
  'download.target.mac-x64':
    'macOS · Intel',
  'download.target.windows-x64':
    'Windows · 64-bit',
  'download.target.linux-appimage':
    'Linux · AppImage',
  'download.target.linux-deb':
    'Linux · .deb',
  'download.hint.mac-arm64':
    'M1 and newer',
  'download.hint.mac-x64':
    'Intel Macs, up to 2020',
  'download.hint.windows-x64':
    'Windows 10 and 11',
  'download.hint.linux-appimage':
    'Any distro, nothing to install',
  'download.hint.linux-deb':
    'Debian, Ubuntu and derivatives',
  'download.cta':
    'Download the app for {os}',
  'download.also':
    'Freecord also has a desktop app — with a native screen picker.',
  'download.firstRun.mac':
    'The app is not signed with an Apple certificate, so macOS blocks it on first launch. Open System Settings → Privacy & Security and click “Open Anyway” — on macOS 14 and earlier, right-click the app and choose Open.',
  'download.firstRun.windows':
    'Windows will warn that the publisher is unknown (the app is unsigned): click More info → Run anyway.',
  'download.firstRun.linux':
    'Make the AppImage executable before opening it: chmod +x freecord-linux-x86_64.AppImage',
  'download.macOtherConfident':
    'Is your Mac the other kind?',
  'download.macOtherUnsure': 'Your Mac declined to identify itself.',
  'download.macOtherArm':
    'Download the Apple Silicon version',
  'download.macOtherIntel':
    'Download the Intel version',
  'download.showOthers':
    'Other platforms',
  'download.hideOthers':
    'Hide other platforms',

  'language.picker': 'Language',
} as const;

export type MessageKey = keyof typeof enUS;
