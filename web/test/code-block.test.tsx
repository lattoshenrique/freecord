import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CodeBlock from '../src/components/CodeBlock';
import { renderMarkdown } from '../src/lib/markdown';

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);

describe('CodeBlock', () => {
  it('is the bare block when nobody handed it the words for a button', () => {
    // The `hljs` class is the hook the colour palette hangs on; the colours
    // themselves arrive later, when the parser's chunk does.
    expect(html(<CodeBlock code="npm test" />)).toBe(
      '<pre><code class="hljs">npm test</code></pre>',
    );
  });

  it('offers the copy key once it has them, without touching the code', () => {
    const out = html(<CodeBlock code="npm test" labels={{ copy: 'Copy', copied: 'Copied' }} />);
    expect(out).toContain('<pre><code class="hljs">npm test</code></pre>');
    expect(out).toContain('aria-label="Copy"');
  });
});

describe('renderMarkdown', () => {
  it('passes the labels down to a fenced block', () => {
    const bare = html(<>{renderMarkdown('```\nls -la\n```')}</>);
    expect(bare).toBe('<pre><code class="hljs">ls -la</code></pre>');

    const withKey = html(
      <>{renderMarkdown('```\nls -la\n```', { copy: 'Copy the code', copied: 'Copied' })}</>,
    );
    expect(withKey).toContain('<pre><code class="hljs">ls -la</code></pre>');
    expect(withKey).toContain('aria-label="Copy the code"');
  });

  it('names the language a fence declares, and ignores a word that is not one', () => {
    const named = html(<>{renderMarkdown('```python\nprint(1)\n```', { copy: 'Copy', copied: 'Ok' })}</>);
    expect(named).toContain('data-language="python"');
    expect(named).toContain('>Python<');

    // A fence with prose after the backticks is still just a fence.
    const loose = html(<>{renderMarkdown('```not a language\nls\n```', { copy: 'Copy', copied: 'Ok' })}</>);
    expect(loose).not.toContain('data-language');
  });

  it('leaves inline code alone — there is nothing to copy in three words', () => {
    expect(html(<>{renderMarkdown('run `ls`', { copy: 'Copy', copied: 'Copied' })}</>)).toBe(
      '<p>run <code>ls</code></p>',
    );
  });
});
