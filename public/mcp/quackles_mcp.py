"""Read-only stdio MCP for the static Quackles archive (Python stdlib)."""
import argparse
import json
import sys
from pathlib import Path
from urllib.request import urlopen
BASE = 'https://kvnloo.github.io/quackles/'
ALLOWED = {'data/manifest.json', 'data/learning/manifest.json', 'agents.md', 'llms.txt', 'llms-full.txt'}

def read_resource(name, root=None):
    if name not in ALLOWED:
        raise ValueError('resource not allowlisted')
    if root:
        return (Path(root)/name).read_text()
    with urlopen(BASE+name,timeout=20) as response:
        return response.read(2_000_000).decode()

def handle(request, root=None):
    method=request.get('method')
    if method == 'initialize':
        return {'protocolVersion':'2024-11-05','capabilities':{'resources':{}},'serverInfo':{'name':'quackles-static','version':'1.0.0'}}
    if method == 'ping': return {}
    if method == 'resources/list':
        return {'resources':[{'uri':BASE+name,'name':name,'mimeType':'application/json' if name.endswith('.json') else 'text/plain'} for name in sorted(ALLOWED)]}
    if method == 'resources/read':
        uri=request.get('params',{}).get('uri','')
        if not uri.startswith(BASE): raise ValueError('foreign origin')
        name=uri[len(BASE):]
        return {'contents':[{'uri':uri,'mimeType':'application/json' if name.endswith('.json') else 'text/plain','text':read_resource(name,root)}]}
    raise ValueError('unsupported method')

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',help='Optional local static-export root for offline reads')
    args=parser.parse_args()
    for line in sys.stdin:
        try:
            request=json.loads(line)
            if 'id' not in request: continue
            try: response={'jsonrpc':'2.0','id':request['id'],'result':handle(request,args.root)}
            except (ValueError,OSError): response={'jsonrpc':'2.0','id':request['id'],'error':{'code':-32602,'message':'Unsupported or unavailable public resource'}}
            print(json.dumps(response),flush=True)
        except json.JSONDecodeError:
            print(json.dumps({'jsonrpc':'2.0','id':None,'error':{'code':-32700,'message':'Invalid JSON'}}),flush=True)
