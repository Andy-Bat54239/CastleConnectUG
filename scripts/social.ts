/**
 * Link-preview tags (Open Graph): the picture, title and line of text WhatsApp shows when someone
 * pastes the site's link into a chat.
 *
 * WhatsApp reads these from the HTML the server sends (it does not run scripts), and the picture
 * needs a full https:// address. So the tags are written into index.html at build time, using the
 * site's real address, which Netlify hands to the build as an environment variable.
 */

export const PREVIEW = {
  title: 'Bridge Grind: a 14-day chess challenge',
  description: 'A short lesson, a puzzle, a game and one line in the group, every day for 14 days. No sign-up.',
  siteName: 'Castle Connect UG',
  imagePath: 'og-image.png',
  imageWidth: 1200,
  imageHeight: 630,
  imageAlt: 'Castle Connect logo beside the words Bridge Grind: a 14-day chess challenge',
} as const

type Env = Record<string, string | undefined>

/**
 * Where the site lives, for absolute links. In order of preference:
 *  1. SITE_URL, set by hand (for example for a drag-and-drop deploy or a custom domain).
 *  2. Netlify's URL for production builds, or its per-deploy URL for previews and branches.
 * Returns undefined when it cannot be known (a local build), in which case no picture is promised.
 */
export function siteUrlFromEnv(env: Env): string | undefined {
  const pick = env.SITE_URL?.trim() || (env.CONTEXT && env.CONTEXT !== 'production' ? env.DEPLOY_PRIME_URL?.trim() : undefined) || env.URL?.trim()
  if (!pick) return undefined
  const withScheme = /^https?:\/\//i.test(pick) ? pick : `https://${pick}`
  return withScheme.replace(/\/+$/, '')
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The meta tags to place in <head>. Without a site address only the title and text are included. */
export function socialTags(siteUrl: string | undefined): string {
  const tag = (property: string, content: string | number) => `    <meta property="${property}" content="${esc(String(content))}" />`
  const lines = [
    tag('og:type', 'website'),
    tag('og:site_name', PREVIEW.siteName),
    tag('og:title', PREVIEW.title),
    tag('og:description', PREVIEW.description),
    tag('og:locale', 'en_GB'),
  ]
  if (siteUrl) {
    const image = `${siteUrl}/${PREVIEW.imagePath}`
    lines.push(
      tag('og:url', `${siteUrl}/`),
      tag('og:image', image),
      tag('og:image:type', 'image/png'),
      tag('og:image:width', PREVIEW.imageWidth),
      tag('og:image:height', PREVIEW.imageHeight),
      tag('og:image:alt', PREVIEW.imageAlt),
      `    <meta name="twitter:card" content="summary_large_image" />`,
      `    <meta name="twitter:image" content="${esc(image)}" />`,
    )
  }
  return lines.join('\n')
}

/** Insert the tags just before </head>. Leaves the page alone if there is no </head> or tags already exist. */
export function injectSocialTags(html: string, siteUrl: string | undefined): string {
  if (!html.includes('</head>') || html.includes('property="og:title"')) return html
  return html.replace('</head>', `${socialTags(siteUrl)}\n  </head>`)
}
