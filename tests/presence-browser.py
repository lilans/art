"""Local Chromium UI regression with a mocked presence transport (not a live Worker)."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os
root=Path(__file__).resolve().parents[1]
css=(root/'narod/chat.css').read_text(); js=(root/'narod/chat.js').read_text()
mock='''window.framesSent=[]; window.NAROD_CHAT_ENDPOINT='wss://example.invalid/presence'; window.WebSocket=class {constructor(){this.readyState=1;window.mockSocket=this;setTimeout(()=>this.onopen?.(),0)}send(s){framesSent.push(JSON.parse(s));if(JSON.parse(s).type==='hello')setTimeout(()=>this.onmessage?.({data:JSON.stringify({type:'welcome',token:'a'.repeat(64),name:'Профессор Ничего',color:'#800080',users:[{name:'Профессор Ничего',color:'#800080'},{name:'Гражданин Никуда',color:'#000080'}],messages:[{text:'old message'}]})}),0)}close(){this.readyState=3;this.onclose?.()}};'''
html=f'<!doctype html><html class="narod-edition" lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{{background:#d537cb}}{css}</style><body><h1>NAROD</h1><script>{mock}</script><script>{js}</script></body></html>'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
    for mobile in [False,True]:
        page=browser.new_page(viewport={'width':390 if mobile else 1000,'height':780 if mobile else 720},has_touch=mobile,is_mobile=mobile)
        # Set content on a blank page; storage access may be blocked, which the implementation handles.
        page.set_content(html); page.wait_for_function("document.querySelector('#nc-online').textContent.includes('(2)')")
        inp=page.locator('#nc-input'); btn=page.locator('#nc-send'); arena=page.locator('#nc-arena')
        inp.fill('PRIVATE_DRAFT_123'); inp.press('Enter'); assert inp.input_value()=='PRIVATE_DRAFT_123'
        old=btn.bounding_box(); x=old['x']+old['width']/2; y=old['y']+old['height']/2
        if mobile: page.touchscreen.tap(x,y)
        else: page.mouse.move(x,y)
        new=btn.bounding_box(); assert abs(old['x']-new['x'])+abs(old['y']-new['y'])>15, (old,new)
        # Forced activation still cannot submit, including via keyboard.
        btn.evaluate('(e)=>e.click()'); btn.focus(); btn.press('Space'); btn.press('Enter')
        assert inp.input_value()=='PRIVATE_DRAFT_123'
        assert page.locator('#nc-log').inner_text()==''
        assert page.evaluate('framesSent.every(f=>f.type==="hello"||f.type==="ping")')
        assert 'PRIVATE_DRAFT' not in json.dumps(page.evaluate('framesSent'))
        b=btn.bounding_box(); a=arena.bounding_box(); assert a['x']-1<=b['x']<=a['x']+a['width']-b['width']+1 and a['y']-1<=b['y']<=a['y']+a['height']-b['height']+1
        page.locator('#nc-min').click(); assert not inp.is_visible(); page.locator('#nc-min').click(); assert inp.is_visible()
        page.locator('#nc-close').click(); assert not inp.is_visible(); page.locator('#nc-launch').click(); assert inp.is_visible()
        page.close(); print('PASS', 'touch' if mobile else 'desktop')
    browser.close()
