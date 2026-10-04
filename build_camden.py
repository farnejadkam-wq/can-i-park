"""Camden: download 'Parking Bays' CSV from opendata.camden.gov.uk, then:
   python3 build_camden.py Parking_Bays_YYYYMMDD.csv "3 October 2026" """
import sys, json, pandas as pd
from common import dicts, write
df = pd.read_csv(sys.argv[1]); updated = sys.argv[2]
d = dicts(); rows = []
def flat(g):
    t = g['type']
    if t == 'LineString': return [g['coordinates']]
    if t in ('MultiLineString', 'Polygon'): return g['coordinates']
    if t == 'MultiPolygon': return [r for p in g['coordinates'] for r in p]
    if t == 'GeometryCollection': return [l for x in g['geometries'] for l in flat(x)]
    if t == 'Point': return [[g['coordinates']]]
    return []
na = lambda v: '' if pd.isna(v) or v == 'N/A' else v
for r in df.to_dict('records'):
    lines = [[round(c, 5) for pt in ln for c in pt] for ln in flat(json.loads(r['EPSG:4326 GeoJSON Geometry'])) if ln]
    if not lines: continue
    sp = 0 if pd.isna(r['Parking Spaces']) else int(r['Parking Spaces'])
    cash = '' if pd.isna(r['Cashless Identifier']) else str(int(r['Cashless Identifier']))
    rows.append([d['types'](r['Restriction Type']), d['times'](na(r['Times Of Operation'])), d['stays'](na(r['Maximum Stay'])),
                 d['tariffs'](na(r['Tariff'])), d['roads'](na(r['Road Name'])), na(r['Postcode']), d['zones'](na(r['Controlled Parking Zone'])),
                 d['permits'](na(r['Valid Parking Permits'])), sp, cash, lines, d['match'](''), d['noret']('')])
d['vocab'] = d['types'].vals  # Camden's own type names are what rules.js understands
write('../data-camden.json', 'Camden', updated, 'Camden Council open data', rows, d)
