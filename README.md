# Can I park here? (Camden + Islington)

A web app that shows which Camden parking bays you can use right now, given your permit and vehicle.

## What each file does
- `index.html`: the page layout and styling
- `app.js`: the map, your GPS location, the nearest-spaces list and bay details
- `rules.js`: the parking rules (turns a bay's type and hours into yes / pay / no / check)
- `data-camden.json`, `data-islington.json`: each council's bays (and Islington's yellow lines), converted from their CSVs
- `tools/`: the scripts that build those data files (`build_camden.py`, `build_islington.py`)
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
- New data? Run the matching script in `tools/` (needs Python with pandas, shapely, pyproj), upload the new data file, and bump the `?v=` numbers.
- Adding a borough: write a `build_<borough>.py` that outputs the same format, then add its file to `FILES` at the top of `app.js`.
- Islington's data came from an FOI release (April 2026), so it can drift out of date and isn't licensed for public republishing.

## Notes
- Map tiles: OpenStreetMap tiles, free for light use with attribution. Fine for you and your mates.
- Doesn't include yellow lines, suspensions, bank holidays or temporary signs. The sign on the street always wins.
