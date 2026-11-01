#!/usr/bin/env python3
"""Reproduce and verify the exact 2.1.88 source-map research export.
Usage: python3 research/claude-code-2.1.88/generate.py [--verify]
"""
import argparse, collections, gzip, hashlib, json, os, pathlib, re, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
BASE=pathlib.Path(__file__).resolve().parent
SHA='7965012b7a5fc9e09d8d747a04c5c32b94696924536e217f686bb1e7ee70a657'
FLAG=re.compile(r"""\bfeature\(\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\)""")
ENV=re.compile(r'\bprocess\.env\.([A-Z][A-Z0-9_]+)')
BRACKET=re.compile(r"""\bprocess\.env\s*\[\s*['"]([A-Za-z_]\w*)['"]\s*\]""")
CHARS={c:i for i,c in enumerate('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/')}
enabled={'TRANSCRIPT_CLASSIFIER','KAIROS_BRIEF','BUILDING_CLAUDE_APPS'}
verify=False
written=[]

def digest(content): return hashlib.sha256(content).hexdigest()
def save(path, content):
    if isinstance(content,str): content=content.encode('utf8')
    f=BASE/path
    if verify:
        if not f.is_file() or f.read_bytes()!=content: raise ValueError('Missing or changed file: '+path)
    else:
        f.parent.mkdir(parents=True,exist_ok=True)
        f.write_bytes(content)
    written.append({'path':path,'size':len(content),'sha256':digest(content)})
def js(obj):return json.dumps(obj,ensure_ascii=False,sort_keys=True,indent=2)+'\n'
def jsonl(rows):return ''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in rows)
def loc(src,pos):
    line=src.count('\n',0,pos)+1
    return line,pos-src.rfind('\n',0,pos)
def vlq(s):
    nums=[];v=shift=0
    for c in s:
        d=CHARS[c]; v|=(d&31)<<shift
        if d&32:shift+=5
        else:
            nums.append(-(v>>1) if v&1 else v>>1);v=shift=0
    if shift or len(nums) not in (1,4,5):raise ValueError('Invalid VLQ segment '+s)
    return nums
def main():
    global verify
    p=argparse.ArgumentParser();p.add_argument('--verify',action='store_true')
    verify=p.parse_args().verify
    raw=(ROOT/'cli.js.map').read_bytes()
    if digest(raw)!=SHA:raise ValueError('Unexpected cli.js.map SHA256 '+digest(raw))
    m=json.loads(raw);sources=m['sources'];contents=m['sourcesContent']
    if m['version']!=3 or m['names'] or len(sources)!=4756 or len(set(sources))!=4756 or len(sources)!=len(contents):raise ValueError('Unexpected source map schema')
    flags=collections.defaultdict(list);env=collections.defaultdict(list);brackets=collections.defaultdict(list)
    packages=collections.defaultdict(list);srcindex=[];kinds=collections.Counter()
    for i,(path,src) in enumerate(zip(sources,contents)):
        if not isinstance(src,str):raise ValueError('Missing sourcesContent '+str(i))
        b=src.encode('utf8')
        item={'index':i,'original_path':path,'bytes':len(b),'lines':src.count('\n')+1,'sha256':digest(b)}
        if path.startswith('../node_modules/'):
            rel=path[len('../node_modules/'):]
            chunks=rel.split('/')
            if any(c in ('','..','.') for c in chunks) or '\\' in rel:raise ValueError('Unsafe path '+path)
            name='/'.join(chunks[:2]) if chunks[0].startswith('@') else chunks[0]
            packages[name].append((i,rel,len(b)))
            item['category']='dependency';item['research_file']='dependencies/node_modules/'+rel
            save(item['research_file'],b)
        elif path.startswith('../src/'):
            item['category']='application'
            for rx,d,syntax in [(FLAG,flags,'feature'),(ENV,env,'dot'),(BRACKET,brackets,'bracket')]:
                for match in rx.finditer(src):
                    line,col=loc(src,match.start())
                    snippet=src.splitlines()[line-1].strip()[:360]
                    d[match.group(1)].append({'source_index':i,'path':path[3:],'line':line,'column':col,'expression':match.group(0),'context':snippet,'syntax':syntax})
        elif path.startswith('../vendor/'):item['category']='native-adapter'
        else:raise ValueError('Unexpected source path '+path)
        kinds[item['category']]+=1
        srcindex.append(item)
    if kinds!={'dependency':2850,'application':1902,'native-adapter':4} or len(packages)!=316:raise ValueError('Unexpected category/file counts '+str(kinds))
    if len(flags)!=90 or sum(map(len,flags.values()))!=972 or len(env)!=469:raise ValueError('Unexpected feature/environment counts')
    save('features/feature-index.json',js([{'flag':name,'references':len(refs),'source_files':len(set(x['path'] for x in refs)),'compilation_state_333':'enabled' if name in enabled else 'not_requested','affected_sources':sorted(set(x['path'] for x in refs))} for name,refs in sorted(flags.items())]))
    save('features/all-972-references.jsonl',jsonl([{'flag':name,**r} for name,refs in sorted(flags.items()) for r in refs]))
    save('environment/variables.json',js([{'variable':name,'references':len(refs),'source_files':len(set(x['path'] for x in refs)),'affected_sources':sorted(set(x['path'] for x in refs))} for name,refs in sorted(env.items())]))
    save('environment/all-references.jsonl',jsonl([{'variable':name,**r} for name,refs in sorted(env.items()) for r in refs]))
    save('environment/bracket-references.jsonl',jsonl([{'variable':name,**r} for name,refs in sorted(brackets.items()) for r in refs]))
    save('dependencies/packages.json',js([{'package':name,'files':len(records),'bytes':sum(x[2] for x in records),'source_indices':[x[0] for x in records],'files_in_package':sorted(x[1] for x in records)} for name,records in sorted(packages.items())]))
    mapping=m['mappings']
    if len(mapping)!=10951046:raise ValueError('Unexpected mappings size')
    save('mappings/mappings.vlq',mapping)
    counts=[0]*len(sources);first=[None]*len(sources);last=[None]*len(sources)
    lineno=0;pos=0;segments=0;unmapped=0;oldsrc=oldline=oldcol=oldname=0
    line_index=[]
    # Compress all 2,068,722 decoded locations deterministically, not a sample.
    with tempfile.TemporaryFile() as temp:
        with gzip.GzipFile(filename='',mode='wb',fileobj=temp,compresslevel=6,mtime=0) as gz:
            gz.write(b'generated_line\tgenerated_column\tsource_index\toriginal_line\toriginal_column\n')
            for row in mapping.split(';'):
                lineno+=1;gen=0;n=0
                for seg in row.split(','):
                    if not seg:continue
                    v=vlq(seg);gen+=v[0]
                    if gen<0:raise ValueError('Invalid generated col')
                    if len(v)==1:
                        record=f'{lineno}\t{gen}\t-1\t-1\t-1\n';unmapped+=1
                    else:
                        oldsrc+=v[1];oldline+=v[2];oldcol+=v[3]
                        if len(v)==5:oldname+=v[4]
                        if oldsrc<0 or oldsrc>=len(sources) or oldline<0 or oldcol<0:raise ValueError('Invalid original location')
                        counts[oldsrc]+=1
                        if first[oldsrc] is None:first[oldsrc]=[lineno,gen]
                        last[oldsrc]=[lineno,gen]
                        record=f'{lineno}\t{gen}\t{oldsrc}\t{oldline+1}\t{oldcol+1}\n'
                    gz.write(record.encode());n+=1;segments+=1
                line_index.append({'generated_line':lineno,'vlq_start_offset':pos,'segments':n})
                pos+=len(row)+1
        temp.seek(0)
        compressed=temp.read()
    if segments!=2068722 or lineno!=16666 or oldname!=0:raise ValueError('Unexpected mapping counts')
    save('mappings/decoded-segments.tsv.gz',compressed)
    save('mappings/generated-line-index.jsonl',jsonl(line_index))
    for i,item in enumerate(srcindex):
        item.update(mapped_segments=counts[i],first_generated_position=first[i],last_generated_position=last[i])
    save('sources.jsonl',jsonl(srcindex))
    save('mappings/coverage.json',js({'format':'source-map-v3; Base64 VLQ, relative fields','source_count':len(sources),'source_map_sha256':SHA,'source_map_names_count':0,'original_mapping_characters':len(mapping),'generated_lines':lineno,'decoded_segments':segments,'mapped_segments':segments-unmapped,'unmapped_segments':unmapped,'source_paths_without_segments':[sources[i] for i,v in enumerate(counts) if v==0]}))
    summary={'source_map_sha256':SHA,'source_map_bytes':len(raw),'total_sources':len(sources),'project_sources':kinds['application'],'native_adapters':kinds['native-adapter'],'third_party_source_files':kinds['dependency'],'packages':len(packages),'dependency_source_bytes':sum(len(contents[i].encode()) for i,it in enumerate(srcindex) if it['category']=='dependency'),'feature_flag_count':len(flags),'feature_references':sum(map(len,flags.values())),'environment_variable_count':len(env),'environment_references':sum(map(len,env.values())),'bracket_env_variable_count':len(brackets),'bracket_env_references':sum(map(len,brackets.values())),'original_mapping_chars':len(mapping),'generated_lines':lineno,'decoded_mapping_segments':segments,'unmapped_segments':unmapped}
    save('summary.json',js(summary))
    save('MANIFEST.json',js({'source_map_sha256':SHA,'files':sorted(written,key=lambda x:x['path'])}))
    print(('Verified' if verify else 'Extracted'),len(written),'files:',js(summary))
if __name__=='__main__':main()
