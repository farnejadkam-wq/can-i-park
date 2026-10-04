# Can I park here? (Camden)

A web app that shows which Camden parking bays you can use right now, given your permit and vehicle.

## What each file does
- `index.html`: the page layout and styling
- `app.js`: the map, your GPS location, the nearest-spaces list and bay details
- `rules.js`: the parking rules (turns a bay's type and hours into yes / pay / no / check)
- `data.json`: Camden's parking bays, converted from the council's CSV
- `manifest.webmanifest`, `icon-*.png`: let phones install it with an icon
- `sw.js`: makes it open fast and work on a weak signal

## Putting it online (GitHub Pages)
1. Create a free account at github.com.
2. New repository, name it `can-i-park`, set it to Public, tick "Add a README".
3. Click "Add file" > "Upload files", drag in everything from this folder, then "Commit changes".
4. Settings > Pages > Source: "Deploy from a branch", Branch: `main`, folder `/ (root)`, Save.
5. After a minute or two your app is at `https://YOUR-USERNAME.github.io/can-i-park/`.

## Installing on your phone
- iPhone: open the link in Safari > Share > Add to Home Screen.
- Android: open in Chrome > menu > Install app (or Add to Home screen).
Allow location when asked.

## Updating
- Changed a file? Upload the new version, and bump `VERSION` in `sw.js` (v1 > v2) so phones pick it up.
- New Camden data? Download a fresh CSV and rebuild `data.json` (ask Claude for the conversion script).

## Notes
- Map tiles: CARTO basemaps, free for non-commercial use with attribution. Fine for you and your mates.
- Doesn't include yellow lines, suspensions, bank holidays or temporary signs. The sign on the street always wins.
