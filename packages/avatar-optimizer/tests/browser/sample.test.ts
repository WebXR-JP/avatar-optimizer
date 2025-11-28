import { describe, expect, it } from 'vitest'

describe('Browser Mode', () =>
{
  it('should run in the browser', () =>
  {
    expect(window).toBeDefined()
    expect(document).toBeDefined()
    expect(navigator.userAgent).toBeDefined()
  })

  it('should be able to create a DOM element', () =>
  {
    const div = document.createElement('div')
    div.textContent = 'Hello Browser'
    document.body.appendChild(div)
    expect(document.body.textContent).toContain('Hello Browser')
  })
})
