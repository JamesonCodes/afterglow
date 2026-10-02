// Narrow compatibility rules for Amazon's observed storefront components.
// Applied through Dark Reader's owned stylesheet, so normal lifecycle cleanup
// removes them and new cards receive the rules without DOM scans or observers.
export function siteCSS(hostname: string): string {
  if (hostname !== "amazon.com" && !hostname.endsWith(".amazon.com")) return "";
  return `
/* Product art and metadata must not multiply against the charcoal surface. */
img.a-amazon-image[class*="asin-image"],
[class*="asin-metadata"] {
  mix-blend-mode: normal !important;
}
/* These explicit Amazon text palettes accompany preserved promotional artwork.
   Match the observed classes rather than guessing from the image's colors. */
._single-creative-card_style_themingTextColor__1oQsI {
  color: #0f1111 !important;
}
:is(._single-creative-card_style_themingTextColorWhite__1zryO,
    ._single-creative-card_style_themingTextColor__lrzuC,
    ._single-creative-card_style_themingTextColor__2LCvL,
    ._single-creative-card_style_themingTextColor__1YKkf) {
  color: #ffffff !important;
}
:is(._single-creative-card_style_themingTextColor__1oQsI,
    ._single-creative-card_style_themingTextColorWhite__1zryO,
    ._single-creative-card_style_themingTextColor__lrzuC,
    ._single-creative-card_style_themingTextColor__2LCvL,
    ._single-creative-card_style_themingTextColor__1YKkf) :is(h2,div,span,a) {
  color: inherit !important;
}
`;
}
