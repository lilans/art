(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const text = (id,value) => {
    const node = $(id);
    if (node.textContent !== value) node.textContent = value;
  };
  const canvas = $('f-board');
  const start = $('f-start');
  const language = () => document.documentElement.lang === 'ru' ? 1 : 0;
  const tr = (en, ru) => language() ? ru : en;
  const words = {
    stamina: ['Stamina','Силы'], fear: ['Fear','Страх'], run: ['Run','Бег'],
    quiet: ['Quiet','Тихо'], interact: ['Interact','Действие'],
    up: ['Up','Вверх'], down: ['Down','Вниз'], left: ['Left','Влево'], right: ['Right','Вправо'],
    hint: [
      'Arrows / WASD move · Shift run · Ctrl quiet · E / Space interact · P pause · R restart · M mute',
      'Стрелки / WASD — шаг · Shift — бег · Ctrl — тихий шаг · E / пробел — действие · P — пауза · R — заново · M — без звука'
    ],
    note: ['Contains implied domestic violence.','Тема домашнего насилия.']
  };
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const sound = window.FatherAudio.create();
  const { tone, hiss } = sound;
  let loadingError = false;
  let refresh = loading;
  start.disabled = true;
  document.addEventListener('site:language', () => refresh());
  loading();
  window.FatherArt.load().then(boot).catch(error => {
    loadingError = true;
    console.error(error);
    loading();
  });

  function localize() {
    for (const element of document.querySelectorAll('[data-f]')) {
      element.textContent = words[element.dataset.f][language()];
    }
    for (const element of document.querySelectorAll('[data-f-aria]')) {
      element.setAttribute('aria-label', words[element.dataset.fAria][language()]);
    }
    canvas.setAttribute('aria-label', tr('Father game','Игра «Отец»'));
  }

  function loading() {
    localize();
    $('f-message').textContent = loadingError
      ? tr('The apartment could not load. Reload the page to retry.','Не удалось загрузить квартиру. Обновите страницу.')
      : tr('Loading the apartment…','Загрузка квартиры…');
  }

  function boot({ manifest, painter }) {
    const art = painter(canvas);
    const [W,H] = manifest.size;
    const T = 8;
    const grid = new Uint8Array(W * H);
    const visibleTiles = new Uint8Array(W * H);
    const explored = new Uint8Array(W * H);
    const visitedRooms = new Set();
    const visionRadius = 55;
    const pt = (x,y) => ({ x: x*T+T/2, y: y*T+T/2 });
    const tile = p => [Math.floor(p.x/T),Math.floor(p.y/T)];
    const d = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
    const near = (a,b,r) => d(a,b) < r;
    const limit = (n,a,b) => Math.max(a,Math.min(b,n));
    const roomOf = p => {
      const [x,y] = tile(p);
      return manifest.roomCells[y][x];
    };
    const paint = ([x,y,w,h], value) => {
      for (let j = y; j < y+h; j++) grid.fill(value,j*W+x,j*W+x+w);
    };
    manifest.walls.forEach(rect => paint(rect,1));
    manifest.gaps.forEach(rect => paint(rect,0));
    manifest.furniture.forEach(([, ...rect]) => paint(rect,1));

    const exit = pt(38,14);
    const bath = pt(20,17);
    const targets = [
      { p:pt(4,5), n:['Cabinet','Сервант'] }, { p:pt(29,4), n:['Bedside table','Тумбочка'] },
      { p:pt(9,21), n:['Kitchen shelf','Кухонная полка'] }, { p:pt(36,15), n:['Coat pocket','Карман пальто'] }
    ];
    const hides = [
      { p:pt(5,2), n:['Curtain','Штора'], limit:7 }, { p:pt(34,5), n:['Wardrobe','Шкаф'], limit:10 },
      { p:pt(5,23), n:['Under the table','Под столом'], limit:6 },
      { p:pt(33,27), n:['Behind the bed','За кроватью'], limit:8 }
    ];
    const objects = [
      { p:pt(4,8), n:['Television','Телевизор'], type:'tv' }, { p:pt(32,21), n:['Toy','Игрушка'], type:'toy' },
      { p:pt(5,26), n:['Enamel pot','Кастрюля'], type:'pot' }, { p:bath, n:['Bathroom door','Дверь ванной'], type:'door' }
    ];
    const patrol = [[8,8],[8,14],[31,15],[32,8],[9,25],[20,25],[30,23],[23,10]].map(([x,y]) => pt(x,y));
    const firstPlayer = pt(...manifest.playerStart);
    const firstFather = pt(...manifest.fatherStart);
    let p, f, key, hasKey, hide, hiddenTime, seenHide, checked;
    let mode = 'intro', result, time, ending, stamina, fear, unlock, closed;
    let noise, distraction, tv, noAI = false, debugGrid = false;
    let stepP, stepF, beat, tick, lastBuckle, footCount, playerPose;
    let edge, sfxOn = true, ambOn = true, muted = false;
    const pressed = new Set();
    const keyboard = new Map();
    const pointers = new Map();
    const unlockTime = 1.65;

    function blocked(x,y) {
      return x < 0 || y < 0 || x >= W || y >= H || grid[y*W+x] === 1
        || closed && y === 17 && x >= 19 && x <= 21;
    }

    function free(x,y,r=2) {
      return [-r,r].every(dx => [-r,r].every(dy =>
        !blocked(Math.floor((x+dx)/T), Math.floor((y+dy)/T))));
    }

    function path(start, target) {
      const [sx,sy] = tile(start), [ex,ey] = tile(target);
      if (blocked(sx,sy) || blocked(ex,ey)) return [];
      const first = sy*W+sx, last = ey*W+ex;
      const queue = [first];
      const parent = new Int16Array(W*H).fill(-1);
      parent[first] = first;
      for (let k = 0; k < queue.length; k++) {
        const cell = queue[k];
        if (cell === last) break;
        const x = cell%W, y = Math.floor(cell/W);
        for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x+dx, ny = y+dy, next = ny*W+nx;
          if (blocked(nx,ny) || parent[next] !== -1) continue;
          parent[next] = cell;
          queue.push(next);
        }
      }
      if (parent[last] < 0) return [];
      const route = [];
      for (let at = last; at !== first; at = parent[at]) route.push(pt(at%W,Math.floor(at/W)));
      return route.reverse();
    }

    function clearRay(a,b,{ radius=Infinity, opaqueTarget=false, sample=2 }={}) {
      const distance = d(a,b);
      if (distance > radius) return false;
      const [tx,ty] = tile(b);
      const n = Math.ceil(distance/sample);
      for (let i = 1; i <= n; i++) {
        const k = i/n;
        const x = Math.floor((a.x+(b.x-a.x)*k)/T), y = Math.floor((a.y+(b.y-a.y)*k)/T);
        if (opaqueTarget && x===tx && y===ty) return true;
        if (blocked(x,y)) return false;
      }
      return true;
    }

    const los = (a,b) => clearRay(a,b);
    const sight = (a,b,opaqueTarget=false) => clearRay(a,b,{radius:visionRadius,opaqueTarget,sample:1.5});

    function updateVision() {
      visibleTiles.fill(0);
      const [px,py] = tile(p);
      const r = Math.ceil(visionRadius/T);
      for (let y = Math.max(0,py-r); y <= Math.min(H-1,py+r); y++) {
        for (let x = Math.max(0,px-r); x <= Math.min(W-1,px+r); x++) {
          if (sight(p,pt(x,y),true)) explored[y*W+x] = visibleTiles[y*W+x] = 1;
        }
      }
    }

    function vision() {
      updateVision();
      const room = roomOf(p);
      visitedRooms.add(room);
      const lights = [0,...manifest.rooms.map((_, i) => visitedRooms.has(i+1) ? .119 : .026)];
      for (const [[a,b],[x,y]] of manifest.doors) {
        if (room !== a && room !== b || blocked(x,y) || !sight(p,pt(x,y))) continue;
        const neighbor = room === a ? b : a;
        lights[neighbor] = .29;
      }
      lights[room] = 1;
      return { room, lights, fatherVisible:sight(p,f) };
    }

    function reset(startGame=true) {
      art.reset();
      sound.stop();
      clearInput();
      p = {...firstPlayer, dir:[0,-1], moving:false};
      f = {...firstFather, dir:[1,0], moving:false, state:'idle', target:null,
        route:[], repath:0, timer:10, seen:0};
      key = Math.floor(Math.random()*targets.length);
      mode = startGame ? 'play' : 'intro';
      time = ending = fear = unlock = tv = 0;
      stamina = 100;
      checked = new Set();
      hasKey = result = closed = false;
      hide = noise = null;
      hiddenTime = 0;
      seenHide = false;
      distraction = {};
      stepP = stepF = beat = tick = footCount = 0;
      playerPose = 'idle';
      lastBuckle = -10;
      visitedRooms.clear();
      explored.fill(0);
      visibleTiles.fill(0);
      syncAudio();
      ui();
    }

    function emit(pos,r) {
      if (!noise || r >= noise.r || time-noise.t > .3) noise = {...pos,r,t:time};
    }

    function move(actor,dx,dy,speed,dt) {
      const x = actor.x + dx*speed*dt, y = actor.y + dy*speed*dt;
      const old = {x:actor.x,y:actor.y};
      if (free(x,actor.y)) actor.x = x;
      if (free(actor.x,y)) actor.y = y;
      actor.moving = d(old,actor) > .001;
      if (actor.moving) actor.dir = [dx,dy];
      return actor.moving;
    }

    function state(name,target,timer=0) {
      f.state = name;
      f.target = target ? {x:target.x,y:target.y} : null;
      f.timer = timer;
      f.route = [];
      f.repath = 0;
    }

    function choosePatrol() {
      const options = patrol.filter(q => d(q,f) > 24 && path(f,q).length);
      state('patrol',options[Math.floor(Math.random()*options.length)] || patrol[0]);
    }

    function syncAudio() {
      sound.state(mode==='play',roomOf(p),sfxOn,ambOn,muted);
    }

    function finish(win) {
      if (mode !== 'play') return;
      mode = 'ending';
      ending = 0;
      result = win;
      clearInput();
      syncAudio();
      if (win) {
        tone(123,.20,.065,'triangle',64);
        hiss(.31,.038,350);
      } else sound.crack();
      ui();
    }

    function canUse(a,r) {
      return near(p,a.p,r) && (a.type === 'door' || los(p,a.p));
    }

    function interact() {
      if (hide) {
        hide = null;
        return;
      }
      if (!hasKey) {
        const i = targets.findIndex((a,index) => !checked.has(index) && canUse(a,13));
        if (i >= 0) {
          checked.add(i);
          emit(p,28);
          hiss(.12,.04,800);
          if (i === key) {
            hasKey = true;
            tone(1250,.16,.07,'triangle',1700);
          }
          return;
        }
      }
      const object = objects.find(a => canUse(a,11));
      if (object && time-(distraction[object.type] ?? -Infinity) > 4) {
        const {type} = object;
        if (type === 'door') {
          if (!closed && (near(f,bath,16) || tile(p)[1]===17)) return;
          closed = !closed;
          f.route = [];
          f.repath = 0;
          emit(p,65);
          hiss(.20,.08,300);
        } else {
          distraction[type] = time;
          emit(object.p,100);
          if (type === 'tv') {
            tv = 8;
            hiss(.6,.08,2100);
          } else if (type === 'pot') {
            tone(760,.3,.10,'square',490);
            hiss(.2,.05,2300);
          } else tone(440,.22,.07,'square',660);
        }
        return;
      }
      const shelter = hides.find(a => canUse(a,10));
      if (shelter) {
        hide = shelter;
        hiddenTime = 0;
        seenHide = f.state === 'chase' && los(f,p);
        hiss(.1,.025,500);
      }
    }

    function pursue(dt) {
      const distance = d(p,f);
      const angle = ((p.x-f.x)*f.dir[0]+(p.y-f.y)*f.dir[1])/Math.max(1,distance);
      const concealed = hide && !seenHide && hiddenTime <= hide.limit;
      const range = f.state === 'chase' ? 102 : pressed.has('quiet') ? 53 : 72;
      const visible = !concealed && distance < (hide && !seenHide ? 29 : range)
        && (angle > -.25 || distance < 20 || f.state === 'chase') && los(f,p);
      if (f.state === 'idle' && time < 10) {
        f.timer -= dt;
      } else if (visible) {
        f.seen += dt;
        if (f.seen > .32 || f.state === 'chase') {
          if (f.state !== 'chase') {
            state('chase',p);
            if (time-lastBuckle > 4) {
              const pan = ((f.x-p.x)-(f.y-p.y))/90;
              tone(1900,.13,.09,'square',1240,pan);
              tone(2730,.19,.04,'triangle',1800,pan);
              lastBuckle = time;
            }
          }
          f.target = {x:p.x,y:p.y};
          f.timer = 1.2;
        } else if (f.state !== 'suspicion') state('suspicion',p,1);
      } else {
        f.seen = 0;
        if (f.state === 'chase') {
          f.timer -= dt;
          if (f.timer <= 0) state('search',f.target,3);
        } else if (noise && time-noise.t < .45 && d(f,noise) < noise.r && f.state!=='investigation') {
          state('investigation',noise,3);
        } else if (f.state==='return') {
          choosePatrol();
        } else if (['search','suspicion','investigation'].includes(f.state)) {
          f.timer -= dt;
          if (f.timer <= 0) state('return',patrol[0]);
        }
      }

      if (f.target) {
        f.repath -= dt;
        if (f.repath <= 0) {
          f.route = path(f,f.target);
          f.repath = .28;
        }
        let waypoint = f.route[0];
        if (waypoint && near(waypoint,f,1.05)) {
          f.route.shift();
          waypoint = f.route[0];
        }
        if (waypoint) {
          // Center in a turning cell before moving through a jamb or around a bulky prop.
          const [cx,cy] = tile(f);
          const [nx,ny] = tile(waypoint);
          const center = pt(cx,cy);
          if (nx!==cx && Math.abs(f.y-center.y)>1.3 || ny!==cy && Math.abs(f.x-center.x)>1.3) {
            waypoint = center;
          }
        } else if (los(f,f.target) && d(f,f.target) > 1) waypoint = f.target;
        if (waypoint) {
          const delta = d(f,waypoint);
          const speed = f.state==='chase' ? 42 : f.state==='investigation' ? 30 : 24;
          if (delta > .001) move(f,(waypoint.x-f.x)/delta,(waypoint.y-f.y)/delta,speed,Math.min(dt,delta/speed));
        } else {
          f.moving = false;
          if (f.state==='patrol' || f.state==='return') state('idle',null,2);
          if (f.state==='search' && f.timer > 0) f.dir=[Math.sin(time*2),Math.cos(time*2)];
        }
      }
      if (f.state === 'idle' && time >= 10) {
        f.timer -= dt;
        if (f.timer <= 0) choosePatrol();
      }

      if (f.moving) {
        stepF += dt;
        if (stepF > .29) {
          stepF = 0;
          const pan = ((f.x-p.x)-(f.y-p.y))/90;
          hiss(.09,.08*Math.max(.04,1-distance/190),240,pan);
          tone(76,.065,.035*Math.max(.05,1-distance/180),'triangle',48,pan);
        }
      }
      return near(p,f,9) && los(f,p) && !concealed;
    }

    function update(dt) {
      if (mode === 'ending') {
        const previous = ending;
        ending += dt;
        if (result && previous < .48 && ending >= .48) {
          hiss(.28,.071,440);
          tone(122,.13,.045,'triangle',54);
        }
        if (ending > 6) {
          mode = 'done';
          ui();
        }
        return;
      }
      if (mode !== 'play') return;
      time += dt;
      const sx = Number(pressed.has('right'))-Number(pressed.has('left'));
      const sy = Number(pressed.has('down'))-Number(pressed.has('up'));
      const dx = (sx+sy)*Math.SQRT1_2, dy = (sy-sx)*Math.SQRT1_2;
      const length = Math.hypot(dx,dy) || 1;
      const run = pressed.has('sprint') && stamina > 1 && Boolean(dx || dy);
      const quiet = pressed.has('quiet');
      if (hide) {
        hiddenTime += dt;
        if (dx || dy) hide = null;
      }
      if (hide) p.moving = false;
      else if (move(p,dx/length,dy/length,run ? 58 : quiet ? 20 : 34,dt)) {
        stepP += dt;
        if (stepP > (run ? .15 : quiet ? .42 : .25)) {
          stepP = 0;
          footCount++;
          hiss(.055,quiet ? .012 : .027,run ? 520 : 320);
          if (footCount%11===0 && roomOf(p)!==4 && roomOf(p)!==5) tone(148,.16,.013,'triangle',74);
          emit(p,run ? 78 : quiet ? 13 : 30);
        }
      }
      stamina = limit(stamina+(run ? -25 : (quiet || hide ? 16 : 10)*(1-fear*.004))*dt,0,100);
      if (edge) {
        interact();
        edge = false;
      }
      if (hasKey && near(p,exit,13) && pressed.has('interact') && !p.moving) {
        unlock += dt;
        if (unlock >= unlockTime) {
          finish(true);
          return;
        }
      } else unlock = 0;

      if (tv > 0) {
        tv = Math.max(0,tv-dt);
        if (Math.floor((tv+dt)*2) !== Math.floor(tv*2)) {
          emit(objects[0].p,80);
          hiss(.18,.025,1900);
        }
      }

      if (!noAI && pursue(dt)) {
        finish(false);
        return;
      }
      fear = limit(fear + dt*(f.state==='chase' ? 20 : d(p,f)<55 ? 8 : -10),0,100);
      beat += dt;
      if (fear > 30 && beat > 1.1-fear*.007) {
        beat = 0;
        tone(64,.11,.055*fear/100,'sine',40);
        hiss(.12,.018*fear/100,700);
      }
      tick += dt;
      if (tick > 1) {
        tick = 0;
        tone(1300,.025,.012,'square',900);
      }
      playerPose = hide ? 'hide' : pressed.has('interact') ? 'interact'
        : !p.moving ? 'idle' : run ? 'run'+Math.floor(time*13)%2
          : quiet ? 'quiet' : 'walk'+Math.floor(time*10)%4;
    }

    function draw() {
      if (mode !== 'play' && mode !== 'pause') {
        art.frame({mode,ending,result});
        return;
      }
      const { room,lights,fatherVisible } = vision();
      const mark = targets[key].p;
      const keyMark = !hasKey && !checked.has(key) && sight(p,mark) && near(p,mark,30) ? mark : null;
      const fatherPose = !f.moving ? 'idle'
        : f.state==='chase' ? 'run'+Math.floor(time*10)%2 : 'walk'+Math.floor(time*7)%4;
      art.frame({mode,ending,result,player:p,father:f,room,light:lights,fatherVisible,
        playerPose,fatherPose,keyMark,closed,tv:tv>0,fear,grid:debugGrid,blocked,visible:visibleTiles});
    }

    function ui() {
      $('f-stamina').value = stamina;
      $('f-fear').value = fear;
      $('f-key').classList.toggle('has-key',hasKey);
      $('f-key-slot').textContent = hasKey ? '✓' : '';
      $('f-key-name').textContent = tr('Key','Ключ');
      $('f-key').setAttribute('aria-label', hasKey ? tr('Key found','Ключ найден') : tr('No key','Ключа нет'));
      text('f-objective',mode === 'ending' || mode === 'done' ? '' : mode === 'intro'
        ? tr('Find the key and leave the apartment.','Найдите ключ и выйдите из квартиры.')
        : hasKey ? tr('Reach the entrance door.','Доберитесь до входной двери.')
          : tr('Find the apartment key.','Найдите ключ от квартиры.'));
      $('f-overlay').hidden = !['intro','pause'].includes(mode);
      $('f-message').textContent = mode === 'pause' ? tr('Paused','Пауза')
        : tr('An evening in the apartment','Вечер в квартире');
      start.textContent = mode === 'intro' ? tr('Start','Начать') : tr('Restart','Заново');
      $('f-pause').disabled = !['play','pause'].includes(mode);
      $('f-pause').textContent = mode === 'pause' ? tr('Resume','Продолжить') : tr('Pause','Пауза');
      $('f-sound').textContent = tr('SFX ','Звук ') + (sfxOn && !muted ? tr('on','вкл') : tr('off','выкл'));
      $('f-ambient').textContent = tr('Ambience ','Фон ') + (ambOn && !muted ? tr('on','вкл') : tr('off','выкл'));
      $('f-sound').setAttribute('aria-pressed', String(sfxOn && !muted));
      $('f-ambient').setAttribute('aria-pressed', String(ambOn && !muted));
      let hint = '';
      if (mode === 'play') {
        if (hide) hint = tr('Hidden · move to leave','Укрытие · двигайтесь, чтобы выйти');
        else if (near(p,exit,13)) {
          hint = hasKey ? tr('Hold interact to unlock ','Удерживайте действие, чтобы открыть ')
            + Math.floor(unlock/unlockTime*100)+'%' : tr('Locked','Заперто');
        } else {
          const a = targets.find((a,i) => !hasKey && !checked.has(i) && canUse(a,13))
            || objects.find(a => canUse(a,11)) || hides.find(a => canUse(a,10));
          if (a) hint = tr('Interact · ','Действие · ')+a.n[language()];
        }
      }
      text('f-prompt',hint);
      if (debug) $('f-debug-info').textContent =
        f.state+' / '+targets[key].n[language()]+' / '+Math.floor(time)+'s / AI '+(noAI ? 'off' : 'on');
    }

    function togglePause() {
      if (mode === 'play') {
        mode = 'pause';
        clearInput();
      } else if (mode === 'pause') {
        mode = 'play';
        canvas.focus({preventScroll:true});
      }
      syncAudio();
      ui();
    }

    function input() {
      const newKeys = new Set([...keyboard.values(), ...Array.from(pointers.values(),entry => entry.action)]);
      if (newKeys.has('interact') && !pressed.has('interact')) edge = true;
      pressed.clear();
      for (const k of newKeys) pressed.add(k);
    }

    function clearInput() {
      for (const {button} of pointers.values()) button.classList.remove('held');
      pointers.clear();
      keyboard.clear();
      pressed.clear();
      edge = false;
    }

    const controls = {
      ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down', ArrowLeft:'left', KeyA:'left',
      ArrowRight:'right', KeyD:'right', ShiftLeft:'sprint', ShiftRight:'sprint',
      ControlLeft:'quiet', ControlRight:'quiet', KeyE:'interact', Space:'interact'
    };
    document.addEventListener('keydown', event => {
      if (mode === 'intro' || event.altKey || event.metaKey) return;
      if (event.code==='Space' && event.target.closest('button,a,input')) return;
      const action = controls[event.code];
      if (action && mode==='play') {
        event.preventDefault();
        keyboard.set(event.code,action);
        input();
      } else if (!event.repeat) {
        if (event.code === 'Escape' || event.code === 'KeyP') {
          event.preventDefault();
          togglePause();
        }
        if (event.code === 'KeyR') reset();
        if (event.code === 'KeyM') {
          muted = !muted;
          syncAudio();
          ui();
        }
      }
    });
    document.addEventListener('keyup', event => {
      if (keyboard.delete(event.code)) input();
    });

    for (const button of document.querySelectorAll('[data-hold]')) {
      button.addEventListener('pointerdown', event => {
        if (mode !== 'play') return;
        event.preventDefault();
        sound.init();
        button.setPointerCapture(event.pointerId);
        pointers.set(event.pointerId,{button,action:button.dataset.hold});
        button.classList.add('held');
        input();
      });
      for (const name of ['pointerup','pointercancel','lostpointercapture']) {
        button.addEventListener(name, event => {
          pointers.delete(event.pointerId);
          if (![...pointers.values()].some(entry => entry.button===button)) button.classList.remove('held');
          input();
        });
      }
    }
    start.disabled = false;
    start.onclick = () => {
      sound.init();
      reset();
      canvas.focus({preventScroll:true});
    };
    $('f-pause').onclick = togglePause;
    $('f-sound').onclick = () => {
      sound.init();
      if (muted) {
        muted = false;
        sfxOn = true;
      } else sfxOn = !sfxOn;
      syncAudio();
      ui();
    };
    $('f-ambient').onclick = () => {
      sound.init();
      if (muted) {
        muted = false;
        ambOn = true;
      } else ambOn = !ambOn;
      syncAudio();
      ui();
    };
    window.addEventListener('blur', () => {
      if (mode === 'play') togglePause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && mode === 'play') togglePause();
    });

    if (debug) {
      $('f-debug').hidden = false;
      $('f-noai').onclick = () => {
        noAI = !noAI;
        if (noAI) f.moving = false;
        ui();
      };
      function preview(win) {
        sound.init();
        reset();
        finish(win);
      }
      $('f-win').onclick = () => preview(true);
      $('f-lose').onclick = () => preview(false);
      $('f-grid').onclick = () => { debugGrid = !debugGrid; ui(); };
      $('f-reset').onclick = () => reset();
      window.fatherDebug = {
        path, los, free, sight, updateVision, targets, hides, objects, patrol, exit, pt, blocked, roomOf,
        visibility: () => ({visible:[...visibleTiles],explored:[...explored],...vision()}),
        inspectArt:art.inspect, project:art.project, inspectAudio:sound.inspect, manifest,
        get state() {
          return {p,f,mode,hasKey,key,closed,result,time,ending,stamina,fear,hide,hiddenTime,tv,noise,unlock,
            checked:[...checked],pressed:[...pressed],noAI,playerPose};
        },
        setKey:i => { key = i; }, teleport:q => { Object.assign(p,q); }, step:update, interact, finish, reset
      };
    }

    refresh = () => {
      localize();
      ui();
    };
    reset(false);
    let previous = performance.now(), accumulator = 0, uiTime = 0;
    function loop(now) {
      accumulator += Math.min(.10,(now-previous)/1000);
      previous = now;
      while (accumulator >= 1/60) {
        update(1/60);
        accumulator -= 1/60;
      }
      draw();
      if (now-uiTime > 100) {
        syncAudio();
        ui();
        uiTime = now;
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }
})();
