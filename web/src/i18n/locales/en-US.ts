/**
 * Source of truth for every user-visible string.
 *
 * Adding a key here makes it required in all other locales — a missing
 * translation is a type error, not a surprise at runtime.
 */
export const enUS = {
  'app.name': 'Freecord',
  'app.tagline':
    'Voice, video, chat and screen sharing over a P2P mesh. No media server in the middle.',
  'app.buildInfo': 'Version {version} · build {build}',

  'home.roomName': 'Room name',
  'home.roomNamePlaceholder': 'Room name — or paste an invite link',
  'home.create': 'Create room',
  'home.creating': 'Creating…',
  'home.createFailed': "Couldn't create the room. Please try again.",
  'home.join': 'Join room',
  'home.joinHint': 'Invite link — the button takes you into that room.',
  'home.invalidInvite': "That looks like an invite link, but it's incomplete. Paste the whole link.",
  'home.community': 'Community',

  'home.hero.titleA': 'A room is',
  'home.hero.titleB': 'just a link.',
  'home.footer.downloads': 'Downloads',

  'home.card.hint': 'The link is the invite.',

  'how.link': 'How it works',
  'how.title': 'How Freecord works',
  'how.lead':
    'A room is a link, and the conversation goes straight between the browsers in it. Here is what happens after you press the button — and what our server never sees.',

  'how.steps.title': 'Three steps',
  'how.step.create.title': 'Create the room',
  'how.step.create.body':
    'Name it or don’t. You get back a link nobody can guess, and nothing else: no account, no email, no password.',
  'how.step.share.title': 'Share the link',
  'how.step.share.body':
    'The link is both the invitation and the credential. Whoever has it walks in. The chat key travels in the part of the URL after the #, which browsers never send to a server.',
  'how.step.talk.title': 'Talk',
  'how.step.talk.body':
    'Everyone arrives muted and off camera, and turns on what they want. Up to twenty people. Audio and the shared screen always come first; cameras are the ones that compete for room — in a full room fewer of them can be on, and the quality of each adjusts itself.',

  'how.mesh.title': 'The media never touches our server',
  'how.mesh.body':
    'Voice, video and screen flow browser to browser over native WebRTC, encrypted end to end. Our server only introduces the browsers to each other and keeps the list of who is in the room — there is no media server to eavesdrop, and no bill for one either. A network too restrictive for a direct connection would need a TURN relay; we run none, so those rare connections fail instead of quietly passing through a third party.',
  'how.diagram.media': 'Voice, video and screen: straight between the browsers',
  'how.diagram.signaling': 'Through the server, only the signaling: who is in the room, and how to reach them',

  'how.chat.title': 'The chat is sealed, and temporary',
  'how.chat.body':
    'Messages are encrypted in your browser with the key that came in the link, so the server relays text it cannot read. Nothing is stored: when the room closes, the conversation goes with it.',

  'how.screen.title': 'One screen at a time, relayed as a tree',
  'how.screen.body':
    'Screen sharing is locked to one person on the server, and the lock is released even if that person’s connection drops. The video does not go from the sharer to everyone: it reaches three peers, and each of them forwards it to three more, so nobody’s upload grows with the room.',

  'how.limits.title': 'The rules the room lives by',
  'how.limits.body':
    'Twenty people per room. An empty room closes after fifteen minutes. A browser that goes quiet for thirty-five seconds loses its seat, so a crashed tab cannot hold one forever. Past twenty a mesh stops being the honest answer: the next step is a media node of our own, the way screen sharing already relays between peers.',

  'how.run.title': 'Run it yourself',
  'how.run.body':
    'Node 20 and two commands. No account, no API key, nothing to sign: the same protocol runs on a laptop and on Cloudflare Workers.',
  'how.run.copy': 'Copy commands',
  'how.run.copied': 'Copied!',
  'how.more.start': 'Create a room',

  'invite.copy': 'Invite',
  'invite.copied': 'Link copied!',
  'invite.manualCopy': 'Copy the room link:',

  'prejoin.title': 'Join {room}',
  'prejoin.yourName': 'Your name',
  'prejoin.yourNamePlaceholder': 'How should we call you?',
  'prejoin.mic': 'Microphone',
  'prejoin.cam': 'Camera',
  'prejoin.shuffle': 'Another name',
  'prejoin.join': 'Join',
  'prejoin.notFound': 'This room no longer exists.',
  'prejoin.loadFailed': "Couldn't load the room.",
  'prejoin.backHome': 'Back to start',

  'prejoin.notFoundTitle': 'Room not found',
  'prejoin.notFoundBody': 'The link may have expired — empty rooms close on their own.',
  'prejoin.createNew': 'Create a new room',
  'prejoin.errorTitle': 'Something went wrong',
  'prejoin.errorBody': 'Couldn\'t load the room. Try reloading the page.',
  'prejoin.empty': 'Nobody here yet — be the first to join.',
  'prejoin.inRoom': { one: '{count} person in the room.', other: '{count} people in the room.' },
  'prejoin.joinRoom': 'Join the room',

  'room.loading': 'Loading room…',
  'room.connecting': 'Connecting to the room…',
  'room.participants': { one: '{count} participant', other: '{count} participants' },
  'room.unnamed': 'Unnamed room',
  'room.you': 'you',
  'room.someone': 'Someone',
  'room.micMuted': 'Microphone off',
  'room.leftTitle': 'You left the room',
  'room.endedFull': 'The room is full (20 people max).',
  'room.endedNotFound': 'This room no longer exists.',
  'room.endedClosed': 'The connection to the room dropped.',
  'room.seatsAria': 'Seats: {count} of {max} taken',
  'room.camSlotsFull': 'Camera seats are full for now — audio is always open',
  'room.camDenied':
    'No camera slot is free right now. Yours can come on when someone turns theirs off.',

  'screen.yours': 'Your screen',
  'screen.of': "{name}'s screen",
  'screen.via': 'via {name}',
  'screen.sending': 'Sending',
  'screen.receiving': 'Receiving',
  'screen.enterFullscreen': 'View fullscreen',
  'screen.exitFullscreen': 'Exit fullscreen',

  'quality.title': 'Screen quality',
  'quality.sharp.label': 'Sharp',
  'quality.sharp.hint': 'Code and text — 1080p at 15 fps, never blurry',
  'quality.balanced.label': 'Balanced',
  'quality.balanced.hint': 'Default — 1080p at 30 fps',
  'quality.smooth.label': 'Smooth',
  'quality.smooth.hint': 'Video and games — 720p at 60 fps, favours motion',

  // Media settings menu — the screen presets above plus client-local audio/camera choices.
  'settings.title': 'Call settings',
  'controls.settings': 'Call settings',
  'settings.screenAudio.label': 'Share computer audio',
  'settings.screenAudio.hint': 'System or tab audio plays with your screen — from the next share',
  'settings.mic.title': 'Microphone',
  'settings.mic.voice.label': 'Voice',
  'settings.mic.voice.hint': 'Cleans up the room: echo and noise removed, volume levelled',
  'settings.tab.screen': 'Screen share',
  'settings.tab.audio': 'Audio',
  'settings.tab.video': 'Video',
  'settings.tab.general': 'General',
  'settings.screenAudio.title': 'Computer audio',
  'settings.mic.profile': 'Microphone profile',
  'settings.language.hint': 'Applies right away and is remembered on this device.',
  'settings.about.title': 'About',
  'settings.close': 'Close settings',
  'settings.mic.music.label': 'Studio',
  'settings.mic.music.hint': 'Raw stereo at high bitrate — music and instruments, wear headphones',
  'settings.mic.echoCancellation': 'Echo cancellation',
  'settings.mic.noiseSuppression': 'Noise suppression',
  'settings.mic.autoGainControl': 'Automatic volume',
  'settings.camera.title': 'Camera',
  'settings.camera.eco.label': 'Data saver',
  'settings.camera.eco.hint': 'Saves data — up to 360p at 20 fps',
  'settings.camera.standard.label': 'Standard',
  'settings.camera.standard.hint': 'Up to 720p at 30 fps — the default',
  'settings.camera.high.label': 'High',
  'settings.camera.high.hint': 'Up to 1080p at 30 fps — needs a strong connection',
  'settings.device.mic': 'Microphone device',
  'settings.device.speaker': 'Sound output',
  'settings.device.default': 'System default',
  'settings.device.mic.fallback': 'Microphone {number}',
  'settings.device.speaker.fallback': 'Speaker {number}',

  'controls.muteMic': 'Mute microphone',
  'controls.unmuteMic': 'Unmute microphone',
  'controls.camOff': 'Turn camera off',
  'controls.camOn': 'Turn camera on',
  'controls.shareScreen': 'Share screen',
  'controls.stopSharing': 'Stop sharing',
  'controls.someoneSharing': 'Someone else is already sharing their screen',
  'controls.quality': 'Screen sharing quality',
  'controls.openChat': 'Open chat',
  'controls.closeChat': 'Close chat',
  'controls.leave': 'Leave room',
  'controls.closeMenu': 'Close menu',

  'chat.title': 'Room chat',
  'chat.empty': 'No messages yet. Say hi 👋',
  'chat.noKey':
    'You don’t have this room’s key, so messages can’t be sent. Ask for the original invite link — the key is part of it.',
  'chat.locked':
    'Encrypted — you don’t have this room’s key',
  'chat.messageLabel': 'Chat message',
  'chat.placeholder': 'Message…',
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

  'file.attach': 'Send a file',
  'file.direct': 'Goes straight to the other person, never through a server',
  'file.noPeers': 'Nobody else is in the room yet.',
  'file.tooLarge': 'Files up to {max} can be sent.',
  'file.offer': '{name} wants to send you a file',
  'file.to': 'to {name}',
  'file.accept': 'Accept',
  'file.decline': 'Decline',
  'file.cancel': 'Cancel',
  'file.save': 'Save',
  'file.dismiss': 'Dismiss',
  'file.status.pending': 'Waiting for {name} to accept…',
  'file.status.sending': 'Sending… {percent}%',
  'file.status.receiving': 'Receiving… {percent}%',
  'file.status.sent': 'Sent',
  'file.status.received': 'Received',
  'file.status.declined': 'Declined',
  'file.status.cancelled': 'Cancelled',
  'file.status.failed': 'Transfer failed — the other person left or the connection dropped.',
  'file.preview': 'Open image at full size',
  'file.closePreview': 'Close image',

  'latency.signal': 'Latency to the signaling server',
  'latency.peer': 'Direct latency with {name}',

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

  'community.issues.title': 'Found a bug? Want something?',
  'community.issues.body':
    'Issues are the place for both. For a real-time app, context beats a stack trace: tell us your browser, how many people were in the room, whether anyone was sharing a screen, and whether either side was behind a VPN or a corporate network.',
  'community.issues.report': 'Report a bug',
  'community.issues.browse': 'Browse the issues',

  'community.desktop.title': 'On the desktop too',
  'community.desktop.body':
    'A desktop app for macOS, Windows and Linux wraps the same page and adds what a browser will not: a native screen picker and real system media permissions. The download is on the home page.',

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
  'download.macOtherUnsure':
    'We could not identify your Mac.',
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
