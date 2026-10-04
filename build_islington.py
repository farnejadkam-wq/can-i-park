"""Islington: FOI release (ref 7680273, April 2026). Run in the folder with the CSVs:
   python3 build_islington.py Parking_Bays_Live.csv WL_Live.csv CPZs.csv "April 2026" """
import sys, re, pandas as pd
from shapely import wkt
from pyproj import Transformer
from common import dicts, write
bays, wl, cpz, updated = pd.read_csv(sys.argv[1]), pd.read_csv(sys.argv[2]), pd.read_csv(sys.argv[3]), sys.argv[4]
T = Transformer.from_crs(27700, 4326, always_xy=True)  # British National Grid -> GPS

def tm(s):
    """'Mon-Fri 8.30am-6.30pm Sat Noon-4.30pm' -> 'mon-fri 08:30-18:30 sat 12:00-16:30' (the format rules.js reads)"""
    if not isinstance(s, str): return ''
    s = s.lower().replace('noon', '12pm').replace('midnight', '12am')
    def hm(m):
        h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
        if ap == 'am' and h == 12: h = 0
        if ap == 'pm' and h != 12: h += 12
        return f'{h:02d}:{mi:02d}'
    return re.sub(r'(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)', hm, s)

# Islington bay names -> the bay vocabulary rules.js understands
VOCAB = {
 'Resident Permit': 'resident permit holders only', 'Permit Holder Bay': 'permit holders only', 'Business Permit': 'business permit holders',
 'Pay by Phone': 'paid-for', 'Pay by Phone, Resident': 'paid-for / resident permit holders',
 'Pay by Phone, Business': 'paid-for / business permit holders', 'Pay by Phone, Resident, Business': 'paid-for / resident permit holders / business permit holders',
 'Disabled Bay': 'disabled (blue badge)', 'Dedicated Disabled Bay': 'disabled (dedicated)', 'Electrical Vehicle Bay': 'electric vehicle recharging',
 'Micromobility Hire Bay': 'dockless bike hire', 'Bikehangar': 'bike hangar', 'Solo Motorcycle': 'solo motorcycles', 'Car Club Bay': 'car club',
 'Loading Bay': 'loading', 'Loading Bay (Goods Vehicles Only)': 'loading', 'Doctor Bay': 'doctor', 'Taxi Rank': 'taxi rank', 'E-Taxi Bay': 'taxi rank',
 'Short Stay Bay': 'free', 'Bus Stand': 'free (buses)', 'Buses Only Bay': 'free (buses)', 'Bus Permit Bay': 'free (buses)', 'Ambulance Bay': 'ambulance',
 'Police Bay': 'police', 'Diplomatic Bay': 'diplomatic', 'Parklet': 'parklet',
 # kerb lines
 'No Waiting': 'single yellow line', 'No Waiting at any time': 'double yellow line', 'Zig Zag - School': 'zig zag', 'Zig Zag - Other': 'zig zag',
 'Zig Zag - Ambulance': 'zig zag', 'Zig Zag - Hospital': 'zig zag', 'No Stopping at any time (TfL)': 'red route', 'No Stopping (TfL)': 'red route',
}
GENERAL = {'resident permit holders only', 'permit holders only', 'paid-for', 'single yellow line'}
SHOW = {'Single yellow line': 'No Waiting', 'Double yellow line': 'No Waiting at any time'}
d = dicts(); vocab = {}; rows = []
rate = {z.replace('Zone ', ''): t for z, t in zip(cpz.CPZ, cpz.Tariff)}

def geom(w):
    g = wkt.loads(w)
    if g.is_empty: return []
    g = g.simplify(0.4)  # drop points closer than ~0.4 m; invisible on a phone
    parts = getattr(g, 'geoms', [g])
    out = []
    for p in parts:
        cs = list(p.exterior.coords) if p.geom_type == 'Polygon' else list(p.coords)
        out.append([round(c, 5) for x, y in cs for c in T.transform(x, y)])
    return out

def add(r, raw, display, times, extra):
    v = VOCAB.get(raw)
    if not v: return
    t = tm(times)
    if not t:
        if any(c.strip() in GENERAL for c in v.split('/')): return  # hours unknown: leave it off rather than guess
        t = 'at any time'
    lines = geom(r['WKT'])
    if not lines: return
    zone = str(r['CPZ']).replace(' (MD)', '') if isinstance(r['CPZ'], str) else ''
    ti = d['types'](display); vocab[ti] = v
    permits = f'IS-{zone}' if zone and ('permit' in v) else ''
    m = r.get('MatchDayTimePeriodID'); m = m if isinstance(m, str) else ''
    m = m if m.lower().startswith(('suspended', 'coach')) else tm(m)
    rows.append([ti, d['times'](t), d['stays'](extra.get('stay', '')), d['tariffs'](extra.get('tariff', '')), d['roads'](r['Street']), '',
                 d['zones'](f'IS-{zone}' if zone else ''), d['permits'](permits), extra.get('spaces', 0), extra.get('cash', ''), lines,
                 d['match'](m), d['noret'](extra.get('noret', ''))])

hrs = lambda s: '' if not isinstance(s, str) or s == 'No restriction' else s.replace('h', ' hours').replace('1 hours', '1 hour')
for r in bays.to_dict('records'):
    z = str(r['CPZ']).replace(' (MD)', '')
    paid = 'Pay by Phone' in r['RestrictionType']
    add(r, r['RestrictionType'], r['RestrictionType'], r['TimePeriodID'], {
        'stay': hrs(r['MaxStayID']), 'noret': hrs(r['NoReturnID']), 'spaces': int(r['Spaces']) if not pd.isna(r['Spaces']) else 0,
        'cash': str(int(r['RingoCode'])) if not pd.isna(r['RingoCode']) else '',
        'tariff': f'£{rate[z]:.2f} (zone {z} rate)' if paid and z in rate else ''})
for r in wl.to_dict('records'):
    raw = r['RestrictionType']
    disp = {'No Waiting': 'Single yellow line', 'No Waiting at any time': 'Double yellow line'}.get(raw, raw.replace(' (TfL)', ''))
    add(r, raw, disp, r['TimePeriodID'], {})
d['vocab'] = [vocab.get(i, '') for i in range(len(d['types'].vals))]
write('../data-islington.json', 'Islington', updated, 'Islington Council data released under FOI (ref 7680273)', rows, d)
