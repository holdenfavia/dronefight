# Retexture looks (concepts)

Looks Holden picked on 2026-11-18 to replace the placeholder stick figures. **They are in the game** as Canvas 2D vector drawings (ADR-0084, `client/src/dressed.ts`). These sheets are the concept art the in-game looks were drawn from; the game simplifies some details (for example the Ghost's puppet strings, the Bard's coins and the Brawler's double flex are not drawn).

Each sheet shows the fighter with its signature meter (ADR-0079) empty on the left and full on the right. `picked-lineup.png` has all ten on one page.

| Fighter | Look | Meter shown on the body |
|---|---|---|
| Brawler | Lucha libre: orange flame mask, cape, trunks, boots | Full KO meter: mask eyes burn red, cape flares, double flex |
| Blade | Pirate captain: red long coat, tricorn, eyepatch, gold earring, cutlass | Full edge: cutlass and earring glint |
| Spark | Hourglass sage: purple robe and star hat, white beard, hourglass staff | Sand is mana; full: sand on top, glowing, rewind arrow |
| Titan | Iron giant (original): round riveted boiler body, chest furnace, smokestacks | Full payback: furnace and rivets glow, steam |
| Ninja | Classic night indigo: hood, cream headband and belt, sword on back, shuriken | Shuriken over marked foes; full: smoke-bomb cloud |
| Gunslinger | Masked bandit: bandana mask, flat hat, poncho, bandolier | Bullets light up one by one; full: twin revolvers |
| Chef | Head chef: tall toque, big mustache, frying pan | Tomato, pepper, meat icons; full: the pan flames |
| Ghost | Phantom gentleman: see-through, top hat, monocle, cane | Full haunt: puppet strings onto the possessed foe |
| Yo-yo Kid | Skater kid: backwards cap, hoodie, skateboard on back | Combo counter; full: rainbow around-the-world loop |
| Bard | Street busker: beanie, flannel, acoustic guitar, harmonica | Notes pile up; full: coins and hearts fill the guitar case |

River (secret) and the seasonal fighters (Turkey, Pilgrim, Chief) had no concept sheets; their looks went straight into the game (ADR-0088, `client/src/dressedSeasonal.ts`).

## Rules for the art

- Hard rule 3 still applies: all original, nothing copied from another game. Titan's iron giant was drawn as an original design in place of a requested Minecraft iron golem.
- Keep one color per player slot and the team colors (ADR-0026, ADR-0081). These sheets use the P1 orange accent.

## Sources

`source/*.html` are the SVG drawings (open one in a browser to see every option that was offered, including the ones not picked). Functions by fighter: `lucha()` in `brawler.html`; `pirate()`, `iron()` in `blade-spark-titan.html`; `sage()` in `spark.html`; `bandit()`, `headchef()`, `phantom()` in `ninja-gunslinger-chef-ghost.html`; `classic()` in `ninja-classic.html`; `skater()`, `busker()` in `yoyo-bard.html`. They load the Oswald font from Google Fonts.
