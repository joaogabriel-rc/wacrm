import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { Hint } from './hint'

/**
 * Hint hands its child to base-ui's `TooltipTrigger render={...}`, which
 * clones the element and merges its own props and ref onto it. That only
 * works for a single element that actually accepts them — pass a bare
 * string, a fragment, or an array and it breaks at render, in a tooltip
 * nobody exercises until a reviewer hovers it on camera.
 *
 * These render the real component (base-ui included) rather than mocking
 * it, so an upgrade that changes the `render` contract fails here.
 */
describe('Hint', () => {
  it('renders the child with a label', () => {
    const html = renderToStaticMarkup(
      <Hint label="Send this message">
        <button type="button">Send</button>
      </Hint>,
    )
    expect(html).toContain('Send')
  })

  it('preserves the child element rather than wrapping it in one', () => {
    const html = renderToStaticMarkup(
      <Hint label="Send this message">
        <button type="button" className="send-btn">
          Send
        </button>
      </Hint>,
    )
    // The class must survive the clone — several call sites lean on the
    // child's own layout classes (`h-9 w-9 shrink-0`, `w-full`) and a
    // wrapper element in between would break those rows.
    expect(html).toContain('send-btn')
    expect(html.startsWith('<button')).toBe(true)
  })

  it('renders the child untouched when there is no label', () => {
    // Call sites compute labels conditionally — a read-only composer
    // passes undefined so the role-gate explanation can take over.
    const withHint = renderToStaticMarkup(
      <Hint label={undefined}>
        <button type="button">Send</button>
      </Hint>,
    )
    const bare = renderToStaticMarkup(<button type="button">Send</button>)
    expect(withHint).toBe(bare)
  })
})
