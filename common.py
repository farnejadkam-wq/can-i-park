"""Shared helpers for turning council parking data into the app's data-*.json format."""
import json

class Dict:
    """Stores each distinct string once; rows refer to it by number (keeps files small)."""
    def __init__(self): self.vals, self.idx = [], {}
    def __call__(self, v):
        v = '' if v is None else str(v)
        if v not in self.idx: self.idx[v] = len(self.vals); self.vals.append(v)
        return self.idx[v]

def write(path, borough, updated, source, rows, d):
    # rows: [typeI, timesI, stayI, tariffI, roadI, postcode, zoneI, permitsI, spaces, cashCode, lines, matchI, noReturnI]
    out = {'borough': borough, 'updated': updated, 'source': source,
           'types': d['types'].vals, 'vocab': d['vocab'], 'times': d['times'].vals, 'stays': d['stays'].vals,
           'tariffs': d['tariffs'].vals, 'roads': d['roads'].vals, 'permits': d['permits'].vals,
           'zones': d['zones'].vals, 'match': d['match'].vals, 'noret': d['noret'].vals, 'bays': rows}
    s = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
    assert '</' not in s
    open(path, 'w').write(s)
    print(path, len(rows), 'rows', round(len(s) / 1e6, 2), 'MB')

def dicts():
    return {k: Dict() for k in ['types', 'times', 'stays', 'tariffs', 'roads', 'permits', 'zones', 'match', 'noret']}
