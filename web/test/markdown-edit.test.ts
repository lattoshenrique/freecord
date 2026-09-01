import { describe, expect, it } from 'vitest';
import { applyMarkdown, type EditState } from '../src/lib/markdown-edit';

const at = (text: string, start: number, end = start): EditState => ({ text, start, end });

describe('applyMarkdown', () => {
  it('envolve a seleção', () => {
    expect(applyMarkdown(at('oi mundo', 3, 8), 'bold')).toEqual({
      text: 'oi **mundo**',
      start: 5,
      end: 10,
    });
  });

  it('sem seleção, insere exemplo já selecionado para digitar por cima', () => {
    const result = applyMarkdown(at('', 0), 'italic');
    expect(result.text).toBe('*itálico*');
    expect(result.text.slice(result.start, result.end)).toBe('itálico');
  });

  it('alterna: clicar de novo desfaz, com marcador dentro ou fora da seleção', () => {
    expect(applyMarkdown(at('**forte**', 0, 9), 'bold').text).toBe('forte');
    expect(applyMarkdown(at('**forte**', 2, 7), 'bold')).toEqual({
      text: 'forte',
      start: 0,
      end: 5,
    });
  });

  it('não confunde negrito com itálico ao desfazer', () => {
    expect(applyMarkdown(at('*it*', 0, 4), 'italic').text).toBe('it');
    expect(applyMarkdown(at('~~ruim~~', 0, 8), 'strike').text).toBe('ruim');
  });

  it('lista cobre as linhas tocadas, mesmo com seleção parcial', () => {
    const result = applyMarkdown(at('um\ndois\ntrês', 1, 6), 'bullet');
    expect(result.text).toBe('- um\n- dois\ntrês');
  });

  it('lista numerada renumera; alternar remove', () => {
    const numbered = applyMarkdown(at('um\ndois', 0, 7), 'number');
    expect(numbered.text).toBe('1. um\n2. dois');
    expect(applyMarkdown(at(numbered.text, 0, numbered.text.length), 'number').text).toBe('um\ndois');
  });

  it('troca um tipo de lista por outro sem empilhar marcadores', () => {
    const bullets = applyMarkdown(at('um\ndois', 0, 7), 'bullet').text;
    expect(applyMarkdown(at(bullets, 0, bullets.length), 'quote').text).toBe('> um\n> dois');
  });

  it('citação ignora linha vazia no meio', () => {
    expect(applyMarkdown(at('um\n\ndois', 0, 8), 'quote').text).toBe('> um\n\n> dois');
  });

  it('link: seleção vira rótulo e a URL fica selecionada para colar', () => {
    const result = applyMarkdown(at('veja aqui', 5, 9), 'link');
    expect(result.text).toBe('veja [aqui](https://)');
    expect(result.text.slice(result.start, result.end)).toBe('https://');
  });

  it('link: URL selecionada vira destino e o rótulo fica para escrever', () => {
    const result = applyMarkdown(at('https://a.dev', 0, 13), 'link');
    expect(result.text).toBe('[texto](https://a.dev)');
    expect(result.text.slice(result.start, result.end)).toBe('texto');
  });
});
