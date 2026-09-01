import { useLayoutEffect, useRef, type ComponentType, type KeyboardEvent } from 'react';
import { applyMarkdown, type MarkdownAction } from '../lib/markdown-edit';
import {
  BoldIcon,
  CodeIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  QuoteIcon,
  SendIcon,
  StrikeIcon,
} from './icons';

/** Teto do crescimento automático: acima disso o campo rola. */
const MAX_HEIGHT_PX = 132;

const TOOLS: Array<{
  action: MarkdownAction;
  label: string;
  shortcut?: string;
  Icon: ComponentType;
}> = [
  { action: 'bold', label: 'Negrito', shortcut: '⌘B', Icon: BoldIcon },
  { action: 'italic', label: 'Itálico', shortcut: '⌘I', Icon: ItalicIcon },
  { action: 'strike', label: 'Riscado', Icon: StrikeIcon },
  { action: 'code', label: 'Código', shortcut: '⌘E', Icon: CodeIcon },
  { action: 'link', label: 'Link', shortcut: '⌘K', Icon: LinkIcon },
  { action: 'bullet', label: 'Lista', Icon: ListIcon },
  { action: 'quote', label: 'Citação', Icon: QuoteIcon },
];

const SHORTCUTS: Record<string, MarkdownAction> = {
  b: 'bold',
  i: 'italic',
  e: 'code',
  k: 'link',
};

/**
 * Compositor do chat: textarea com formatação markdown.
 *
 * Precisa ser textarea, não input — em `input` não existe quebra de linha, e
 * sem ela lista, citação e bloco de código são impossíveis de escrever, por
 * mais que o renderizador saiba exibi-los.
 */
export default function ChatComposer({
  value,
  maxLength,
  onChange,
  onSend,
}: {
  value: string;
  maxLength: number;
  onChange: (text: string) => void;
  onSend: () => void;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // A seleção precisa ser reposta DEPOIS que o React aplica o novo valor.
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) {
      return;
    }
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    const area = areaRef.current;
    if (selection && area) {
      pendingSelection.current = null;
      area.focus();
      area.setSelectionRange(selection.start, selection.end);
    }
  });

  function run(action: MarkdownAction): void {
    const area = areaRef.current;
    if (!area) {
      return;
    }
    const result = applyMarkdown(
      { text: value, start: area.selectionStart, end: area.selectionEnd },
      action,
    );
    if (result.text.length > maxLength) {
      return;
    }
    pendingSelection.current = { start: result.start, end: result.end };
    onChange(result.text);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    // Enter envia; Shift+Enter quebra linha — convenção de todo chat.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      const action = SHORTCUTS[event.key.toLowerCase()];
      if (action) {
        event.preventDefault();
        run(action);
      }
    }
  }

  return (
    <div className="chat-composer">
      <div className="chat-toolbar" role="toolbar" aria-label="Formatação da mensagem">
        {TOOLS.map(({ action, label, shortcut, Icon }) => (
          <button
            key={action}
            type="button"
            className="chat-tool"
            title={shortcut ? `${label} (${shortcut})` : label}
            aria-label={label}
            // O mousedown roubaria o foco do textarea e com ele a seleção.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(action)}
          >
            <Icon />
          </button>
        ))}
      </div>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <textarea
          ref={areaRef}
          className="chat-input"
          value={value}
          rows={1}
          maxLength={maxLength}
          placeholder="Mensagem…  **negrito**, `código`, - lista"
          aria-label="Mensagem do chat"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" className="chat-send" aria-label="Enviar mensagem" disabled={!value.trim()}>
          <SendIcon />
        </button>
      </form>
    </div>
  );
}
