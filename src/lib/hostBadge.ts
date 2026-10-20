/**
 * Some hosts overlay their own badge on every page. Netlify's free plan, for one, injects a
 * "Powered by Netlify" badge into the bottom-right corner (a script added at its servers, drawn in
 * an isolated frame, so our styles cannot move it). It is right where the lesson's Next button is.
 *
 * Switching the badge off in Netlify's settings is the clean fix. This detects the badge anyway, so on
 * tablets and computers the lesson's Back/Next row can stop short of the corner. Phones keep the buttons
 * on the bottom edge, so there the badge can still sit over part of Next.
 */
export function hostBadgeShown(doc: Pick<Document, 'querySelector'>): boolean {
  return !!doc.querySelector('script[src*="/.netlify/scripts/hud"]')
}
