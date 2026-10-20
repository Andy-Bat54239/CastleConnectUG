import { describe, expect, it } from 'vitest'
import { injectSocialTags, PREVIEW, siteUrlFromEnv, socialTags } from '../scripts/social'

describe('finding the site address', () => {
  it('uses a hand-set SITE_URL first', () => {
    expect(siteUrlFromEnv({ SITE_URL: 'https://bridge.example.org', URL: 'https://other.netlify.app' })).toBe('https://bridge.example.org')
  })
  it("uses Netlify's main URL for a production build", () => {
    expect(siteUrlFromEnv({ CONTEXT: 'production', URL: 'https://bridge-grind.netlify.app', DEPLOY_PRIME_URL: 'https://main--bridge-grind.netlify.app' })).toBe('https://bridge-grind.netlify.app')
  })
  it("uses the deploy's own URL for previews, so a preview links to itself", () => {
    expect(siteUrlFromEnv({ CONTEXT: 'deploy-preview', URL: 'https://bridge-grind.netlify.app', DEPLOY_PRIME_URL: 'https://deploy-preview-3--bridge-grind.netlify.app' })).toBe('https://deploy-preview-3--bridge-grind.netlify.app')
  })
  it('adds https:// when it is missing and drops a trailing slash', () => {
    expect(siteUrlFromEnv({ SITE_URL: 'bridge.example.org/' })).toBe('https://bridge.example.org')
  })
  it('is undefined on a plain local build', () => {
    expect(siteUrlFromEnv({})).toBeUndefined()
    expect(siteUrlFromEnv({ SITE_URL: '   ' })).toBeUndefined()
  })
})

describe('preview tags', () => {
  it('give WhatsApp a full https address for the picture', () => {
    const tags = socialTags('https://bridge-grind.netlify.app')
    expect(tags).toContain('<meta property="og:image" content="https://bridge-grind.netlify.app/og-image.png" />')
    expect(tags).toContain('<meta property="og:url" content="https://bridge-grind.netlify.app/" />')
    expect(tags).toContain(`content="${PREVIEW.title}"`)
    expect(tags).toContain('og:image:width" content="1200"')
    expect(tags).toContain('og:image:height" content="630"')
  })
  it('still give a title and text, but promise no picture, when the address is unknown', () => {
    const tags = socialTags(undefined)
    expect(tags).toContain('og:title')
    expect(tags).toContain('og:description')
    expect(tags).not.toContain('og:image')
    expect(tags).not.toContain('og:url')
  })
  it('escape quotes so the page cannot break', () => {
    expect(socialTags('https://x.org/a"b')).not.toContain('a"b')
  })
  it('keep the text short enough to show in a chat', () => {
    expect(PREVIEW.title.length).toBeLessThanOrEqual(60)
    expect(PREVIEW.description.length).toBeLessThanOrEqual(110)
  })
})

describe('inserting into the page', () => {
  const html = '<html><head><title>t</title></head><body></body></html>'
  it('places the tags inside <head>', () => {
    const out = injectSocialTags(html, 'https://a.org')
    expect(out.indexOf('og:title')).toBeGreaterThan(out.indexOf('<head>'))
    expect(out.indexOf('og:title')).toBeLessThan(out.indexOf('</head>'))
  })
  it('does not add them twice', () => {
    const once = injectSocialTags(html, 'https://a.org')
    expect(injectSocialTags(once, 'https://a.org')).toBe(once)
  })
  it('leaves a page without <head> alone', () => {
    expect(injectSocialTags('<p>hi</p>', 'https://a.org')).toBe('<p>hi</p>')
  })
})
