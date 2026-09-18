import { describe, it, expect } from 'vitest'
import React from 'react'
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
  const button = () =>
    React.createElement('button', { type: 'button' }, 'Send')

  it('renders the child with a label', () => {
    const html = renderToStaticMarkup(
      React.createElement(Hint, { label: 'Send this message' }, button()),
    )
    expect(html).toContain('Send')
  })

  it('preserves the child element rather than wrapping it in one', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Hint,
        { label: 'Send this message' },
        React.createElement(
          'button',
          { type: 'button', className: 'send-btn' },
          'Send',
        ),
      ),
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
    const withLabel = renderToStaticMarkup(
      React.createElement(Hint, { label: undefined }, button()),
    )
    const bare = renderToStaticMarkup(button())
    expect(withLabel).toBe(bare)
  })
})
