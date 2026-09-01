/**
 * Source of truth for every user-visible string.
 *
 * Adding a key here makes it required in all other locales — a missing
 * translation is a type error, not a surprise at runtime.
 */
export const enUS = {
  'app.name': 'Freecord',
  'app.tagline':
    'Create a room, send the link to your friends. Voice, video, chat and screen sharing — no signup.',

  'home.roomName': 'Room name',
  'home.roomNamePlaceholder': 'Room name (optional)',
  'home.create': 'Create room',
  'home.creating': 'Creating…',
  'home.createFailed': "Couldn't create the room. Please try again.",
  'home.community': 'Community',

  'invite.copy': 'Invite',
  'invite.copied': 'Link copied!',
  'invite.manualCopy': 'Copy the room link:',

  'prejoin.title': 'Join {room}',
  'prejoin.yourName': 'Your name',
  'prejoin.yourNamePlaceholder': 'How should we call you?',
  'prejoin.micOn': 'Join with the microphone on',
  'prejoin.camOn': 'Join with the camera on',
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
  'room.endedFull': 'The room is full (8 people max).',
  'room.endedNotFound': 'This room no longer exists.',
  'room.endedClosed': 'The connection to the room dropped.',

  'screen.yours': 'Your screen',
  'screen.of': "{name}'s screen",
  'screen.via': 'via {name}',
  'screen.sending': 'Sending',
  'screen.receiving': 'Receiving',
  'screen.enterFullscreen': 'View fullscreen',
  'screen.exitFullscreen': 'Exit fullscreen',

  'quality.title': 'Screen quality',
  'quality.note':
    'Applies immediately, even while sharing. Screen video is relayed peer to peer, so quality no longer drops as the room fills up.',
  'quality.sharp.label': 'Sharp',
  'quality.sharp.hint': 'Code and text — 1080p at 15 fps, never blurry',
  'quality.balanced.label': 'Balanced',
  'quality.balanced.hint': 'Default — 1080p at 30 fps',
  'quality.smooth.label': 'Smooth',
  'quality.smooth.hint': 'Video and games — 720p at 60 fps, favours motion',

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
  'chat.messageLabel': 'Chat message',
  'chat.placeholder': 'Message…  **bold**, `code`, - list',
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
  'community.promise.p2p.title': 'Your media never touches our server',
  'community.promise.p2p.body':
    'Voice, video and screen sharing flow straight between browsers over native WebRTC, encrypted end to end by default. The server only carries signaling and room state — it could not watch you if it wanted to.',
  'community.promise.chat.title': 'Chat that leaves nothing behind',
  'community.promise.chat.body':
    'Messages live in the room and disappear with it. Zero content storage, on purpose: nothing to leak, nothing to sell, nothing to hand over.',
  'community.promise.vendor.title': 'No vendor, no SDK',
  'community.promise.vendor.body':
    'No media provider, no third-party SDK, no external credential. The entire protocol lives in the repository, and the whole thing runs on free infrastructure.',

  'community.source.title': 'Read the source',
  'community.source.body':
    'Everything is on GitHub under the MIT license — use it, fork it, host your own. The architecture document is the honest version: what a peer-to-peer mesh really costs, why rooms stop at eight people, and which debts are mapped rather than hidden.',
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

  'language.picker': 'Language',
} as const;

export type MessageKey = keyof typeof enUS;
