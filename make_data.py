import pandas as pd, json, re
df=pd.read_csv('/mnt/user-data/uploads/Parking_Bays_20261004.csv')
def idx(col):
    vals=sorted(df[col].fillna('').astype(str).unique().tolist())
    m={v:i for i,v in enumerate(vals)}
    return vals, df[col].fillna('').astype(str).map(m).tolist()
out={}
cols={'types':'Restriction Type','times':'Times Of Operation','stays':'Maximum Stay','tariffs':'Tariff','roads':'Road Name','permits':'Valid Parking Permits','zones':'Controlled Parking Zone'}
I={}
for k,c in cols.items():
    out[k],I[k]=idx(c)
for k in ['stays','tariffs','permits']:
    out[k]=[('' if v=='N/A' else v) for v in out[k]]
bays=[]
for r,i in zip(df.itertuples(index=False), range(len(df))):
    g=json.loads(r[20])
    def flat(g):
        t=g['type']
        if t=='LineString': return [g['coordinates']]
        if t in('MultiLineString','Polygon'): return g['coordinates']
        if t=='MultiPolygon': return [r for p in g['coordinates'] for r in p]
        if t=='GeometryCollection': return [l for x in g['geometries'] for l in flat(x)]
        if t=='Point': return [[g['coordinates']]]
        return []
    lines=[l for l in flat(g) if len(l)>=1]
    L=[[round(v,5) for pt in ln for v in pt] for ln in lines]
    sp=r[1]; sp=0 if pd.isna(sp) else int(sp)
    cid=r[5]; cid='' if pd.isna(cid) else str(int(cid))
    pc=r[8] if isinstance(r[8],str) else ''
    bays.append([I['types'][i],I['times'][i],I['stays'][i],I['tariffs'][i],I['roads'][i],pc,I['zones'][i],I['permits'][i],sp,cid,L])
out['bays']=bays
out['updated']='3 October 2026'
s=json.dumps(out,separators=(',',':'),ensure_ascii=False)
open('data.json','w').write(s); print(len(s))
