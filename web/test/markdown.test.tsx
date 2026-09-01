import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown';

const html = (source: string) => renderToStaticMarkup(<>{renderMarkdown(source)}</>);

describe('renderMarkdown', () => {
  it('formata ênfase, código e riscado', () => {
    expect(html('**forte** e *itálico*')).toBe('<p><strong>forte</strong> e <em>itálico</em></p>');
    expect(html('use `npm run build`')).toBe('<p>use <code>npm run build</code></p>');
    expect(html('~~errado~~')).toBe('<p><del>errado</del></p>');
  });

  it('código suprime formatação dentro dele', () => {
    expect(html('`a **b** c`')).toBe('<p><code>a **b** c</code></p>');
  });

  it('não confunde ** com *', () => {
    expect(html('**negrito**')).toBe('<p><strong>negrito</strong></p>');
    expect(html('a * b * c')).toBe('<p>a * b * c</p>');
    expect(html('snake_case_nome fica intacto')).toBe('<p>snake_case_nome fica intacto</p>');
  });

  it('cria links seguros e autolink', () => {
    expect(html('[site](https://exemplo.com)')).toBe(
      '<p><a href="https://exemplo.com" target="_blank" rel="noopener noreferrer nofollow">site</a></p>',
    );
    expect(html('veja https://exemplo.com/x')).toContain('href="https://exemplo.com/x"');
  });

  it('recusa esquema perigoso no link, preservando o texto', () => {
    const out = html('[clique](javascript:alert(1))');
    expect(out).not.toContain('href');
    expect(out).toContain('clique');
  });

  it('nunca emite HTML vindo da mensagem', () => {
    const out = html('<img src=x onerror="alert(1)"> e <b>oi</b>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<b>');
    expect(out).toContain('&lt;img');
  });

  it('monta listas, citação e bloco de código', () => {
    expect(html('- um\n- dois')).toBe('<ul><li>um</li><li>dois</li></ul>');
    expect(html('1. um\n2. dois')).toBe('<ol><li>um</li><li>dois</li></ol>');
    expect(html('> citado')).toBe('<blockquote><p>citado</p></blockquote>');
    expect(html('```\nconst a = 1;\n```')).toBe('<pre><code>const a = 1;</code></pre>');
  });

  it('quebra de linha simples vira <br>, como todo chat', () => {
    expect(html('linha um\nlinha dois')).toBe('<p>linha um<br/>linha dois</p>');
  });

  it('texto comum atravessa sem alteração', () => {
    expect(html('oi, tudo bem?')).toBe('<p>oi, tudo bem?</p>');
  });
});
