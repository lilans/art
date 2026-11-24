(() => {
  'use strict';
  const board = document.getElementById('snake-board');
  const ctx = board.getContext('2d');
  const scoreEl = document.getElementById('snake-score');
  const bestEl = document.getElementById('snake-best');
  const message = document.getElementById('snake-message');
  const statusEl = document.getElementById('snake-status');
  const startBtn = document.getElementById('snake-start');
  const pauseBtn = document.getElementById('snake-pause');
  const N = 20, C = board.width / N;
  const directions = {up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
  let snake, dir, pending, food, score, timer, state = 'ready', best = 0;
  try { best = Math.max(0, Number(localStorage.getItem('narod-snake-best')) || 0); } catch {}
  const same = (a,b) => a.x === b.x && a.y === b.y;
  function placeFood() {
    const empty = [];
    for(let y=0;y<N;y++) for(let x=0;x<N;x++) if(!snake.some(p=>p.x===x&&p.y===y)) empty.push({x,y});
    return empty.length ? empty[Math.floor(Math.random()*empty.length)] : null;
  }
  function reset() {
    snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10}]; dir = directions.right; pending = null; score = 0; food = placeFood();
  }
  function draw() {
    ctx.fillStyle='#a8b96f'; ctx.fillRect(0,0,400,400);
    ctx.strokeStyle='rgba(43,63,31,.12)'; ctx.lineWidth=1;
    for(let i=1;i<N;i++) {ctx.beginPath();ctx.moveTo(i*C+.5,0);ctx.lineTo(i*C+.5,400);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*C+.5);ctx.lineTo(400,i*C+.5);ctx.stroke();}
    if(food) {ctx.fillStyle='#243820';ctx.fillRect(food.x*C+4,food.y*C+4,C-8,C-8);ctx.fillRect(food.x*C+8,food.y*C+1,4,4);}
    snake.forEach((p,i)=>{ctx.fillStyle=i===0?'#152819':'#354a27';ctx.fillRect(p.x*C+1,p.y*C+1,C-2,C-2);if(i===0){ctx.fillStyle='#b9cc8b';const [dx,dy]=dir; if(dx){let x=p.x*C+(dx>0?13:4);ctx.fillRect(x,p.y*C+4,3,3);ctx.fillRect(x,p.y*C+13,3,3);}else{let y=p.y*C+(dy>0?13:4);ctx.fillRect(p.x*C+4,y,3,3);ctx.fillRect(p.x*C+13,y,3,3);}}});
    scoreEl.textContent=String(score).padStart(3,'0');bestEl.textContent=String(best).padStart(3,'0');
  }
  function syncUI() {
    message.hidden=state==='running';
    const keys={ready:'snakeReady',over:'snakeOver',paused:'snakePaused',win:'snakeWin'};
    statusEl.textContent=keys[state]?t(keys[state]):'';
    pauseBtn.disabled=state!=='running'&&state!=='paused';
    pauseBtn.textContent=t(state==='paused'?'snakeResume':'snakePause');
  }
  function stop(next) {clearTimeout(timer);state=next;syncUI();draw();}
  function schedule(){timer=setTimeout(tick,Math.max(70,150-Math.floor(score/50)*10));}
  function tick(){
    if(state!=='running')return;
    if(pending){dir=pending;pending=null;}
    const head={x:snake[0].x+dir[0],y:snake[0].y+dir[1]};
    const eating=food&&same(head,food);
    if(head.x<0||head.y<0||head.x>=N||head.y>=N||snake.slice(0,eating?snake.length:-1).some(p=>same(p,head))){stop('over');return;}
    snake.unshift(head);
    if(eating){score+=10;if(score>best){best=score;try{localStorage.setItem('narod-snake-best',String(best));}catch{}}food=placeFood();if(!food){stop('win');return;}}
    else snake.pop();
    draw();schedule();
  }
  function start(){clearTimeout(timer);reset();state='running';syncUI();draw();schedule();board.focus({preventScroll:true});}
  function pause(){if(state==='running')stop('paused');else if(state==='paused'){state='running';syncUI();schedule();board.focus({preventScroll:true});}}
  function turn(name){if(state!=='running'||pending)return;const next=directions[name];if(!next||next[0]===-dir[0]&&next[1]===-dir[1])return;if(next[0]===dir[0]&&next[1]===dir[1])return;pending=next;}
  startBtn.addEventListener('click',start);pauseBtn.addEventListener('click',pause);
  document.querySelectorAll('[data-dir]').forEach(button=>button.addEventListener('click',()=>turn(button.dataset.dir)));
  const keys={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',a:'left',s:'down',d:'right'};
  document.addEventListener('keydown',e=>{if(e.ctrlKey||e.altKey||e.metaKey)return;const key=keys[e.key]||keys[e.key.toLowerCase()];if(key&&state==='running'){e.preventDefault();turn(key);}else if(e.code==='Space'&&e.target===board&&(state==='running'||state==='paused')){e.preventDefault();pause();}});
  let touch=null;
  board.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;touch={x:e.clientX,y:e.clientY,id:e.pointerId};board.setPointerCapture(e.pointerId);});
  board.addEventListener('pointerup',e=>{if(!touch||touch.id!==e.pointerId)return;const dx=e.clientX-touch.x,dy=e.clientY-touch.y;touch=null;if(Math.max(Math.abs(dx),Math.abs(dy))<12)return;turn(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');});
  board.addEventListener('pointercancel',()=>{touch=null;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='running')stop('paused');});
  document.addEventListener('site:language',syncUI);
  reset();draw();syncUI();
})();
