/**
 * This tool's own strings — a tool ships its translations the way an
 * extension does, instead of adding keys to the app's catalogs. Only
 * `en-US` is required; every other locale falls back to it key by key,
 * so a tool may ship one language and still work everywhere.
 *
 * `name` and `summary` are the two the shelf reads. A list is a set of
 * variants, drawn once per page load — the room's copy has a sense of
 * humour and a tool is welcome to it, except in a name a screen reader
 * announces or in anything that instructs.
 */
import type { ToolText } from '../contract';

export const TEXT: ToolText = {
  'en-US': {
    name: 'YouTube',
    summary: [
      'Watch a video together. Anyone can play, pause and skip — one room, one timeline.',
      'A video for the whole room. Whoever touches the player moves it for everybody.',
      'One video, one position, no “wait, where are you?”. Anyone can drive.',
    ],
    linkLabel: 'YouTube link',
    replaceLabel: 'Play another video',
    linkPlaceholder: 'https://youtube.com/watch?v=…',
    open: 'Play for everyone',
    invalid: 'There is no YouTube video in that link.',
    closeForAll: 'Close the video for everyone',
    stageLabel: 'Watching together',
    blocked:
      'YouTube will not play this video here — it may be private, removed, or blocked from embedding.',
    openOnYouTube: 'Open it on YouTube',
  },
  'pt-BR': {
    name: 'YouTube',
    summary: [
      'Assistam a um vídeo juntos. Qualquer um dá play, pausa e pula — uma sala, uma linha do tempo.',
      'Um vídeo para a sala inteira. Quem mexer no player mexe para todo mundo.',
      'Um vídeo, uma posição, sem “peraí, você está em que minuto?”. Qualquer um controla.',
    ],
    linkLabel: 'Link do YouTube',
    replaceLabel: 'Passar outro vídeo',
    linkPlaceholder: 'https://youtube.com/watch?v=…',
    open: 'Passar para todos',
    invalid: 'Não há um vídeo do YouTube nesse link.',
    closeForAll: 'Fechar o vídeo para todos',
    stageLabel: 'Assistindo juntos',
    blocked:
      'O YouTube não toca este vídeo aqui — ele pode estar privado, removido ou sem permissão de incorporação.',
    openOnYouTube: 'Abrir no YouTube',
  },
  es: {
    name: 'YouTube',
    summary: [
      'Vean un video juntos. Cualquiera da play, pausa y salta — una sala, una línea de tiempo.',
      'Un video para toda la sala. Quien toca el reproductor lo mueve para todos.',
      'Un video, una posición, sin “espera, ¿en qué minuto vas?”. Cualquiera lo controla.',
    ],
    linkLabel: 'Enlace de YouTube',
    replaceLabel: 'Poner otro video',
    linkPlaceholder: 'https://youtube.com/watch?v=…',
    open: 'Poner para todos',
    invalid: 'No hay ningún video de YouTube en ese enlace.',
    closeForAll: 'Cerrar el video para todos',
    stageLabel: 'Viendo juntos',
    blocked:
      'YouTube no reproduce este video aquí: puede ser privado, estar eliminado o no permitir incrustación.',
    openOnYouTube: 'Abrirlo en YouTube',
  },
  'zh-CN': {
    name: 'YouTube',
    summary: [
      '一起看视频。谁都可以播放、暂停、快进——一个房间，一条时间轴。',
      '整个房间共用一个视频。谁动播放器，就是替所有人动。',
      '一个视频、一个进度，不用再问“你放到哪儿了”。谁都能控制。',
    ],
    linkLabel: 'YouTube 链接',
    replaceLabel: '换一个视频',
    linkPlaceholder: 'https://youtube.com/watch?v=…',
    open: '放给所有人',
    invalid: '这个链接里没有 YouTube 视频。',
    closeForAll: '为所有人关闭视频',
    stageLabel: '一起观看',
    blocked: 'YouTube 无法在这里播放该视频——它可能是私享的、已删除的，或不允许嵌入。',
    openOnYouTube: '在 YouTube 中打开',
  },
  ja: {
    name: 'YouTube',
    summary: [
      '動画をいっしょに見る。再生も一時停止もスキップも誰でも——ひとつの部屋に、ひとつの時間軸。',
      '部屋みんなでひとつの動画。プレーヤーを触れば、全員の画面が動きます。',
      '動画もいまの位置もひとつ。「どこまで見た？」はもう不要。操作は誰でも。',
    ],
    linkLabel: 'YouTube のリンク',
    replaceLabel: '別の動画を流す',
    linkPlaceholder: 'https://youtube.com/watch?v=…',
    open: '全員に流す',
    invalid: 'このリンクに YouTube の動画はありません。',
    closeForAll: '全員の動画を閉じる',
    stageLabel: 'いっしょに視聴中',
    blocked: 'この動画は YouTube でここでは再生できません（限定公開・削除済み・埋め込み不可のいずれか）。',
    openOnYouTube: 'YouTube で開く',
  },
};
