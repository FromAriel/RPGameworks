# Font credits

| Font | File | Use | Source | Terms |
| --- | --- | --- | --- | --- |
| UNSCII 16 | `unscii/unscii-16.ttf` | All interface text (DOM, via `src/presentation/ui/tokens.css`) and battle stage canvas text (baked to a bitmap by `src/presentation/pixel-font.ts`), at its 16 px design size | viznut, <http://viznut.fi/unscii/> (byte-identical to the copy Ariel added to Dungeonminusdelver, SHA-256 `0c889d60…9529`) | The plain UNSCII fonts are public domain; Ariel confirmed UNSCII 16 free to use in games on 2026-10-23. The "full" variants add GNU Unifont glyphs with extra conditions and are not used. |

Draw UNSCII 16 only at 16 px (or whole multiples), on whole pixels, without stroke or blur; other sizes are smoothed by the browser.
