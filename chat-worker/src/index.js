const DAY=86400000, MAX_ONLINE=50, PROTOCOL=2;
// Original absurd combinations, inspired by Daniil Kharms / OBERIU, not quotations.
export const NAMES = ['Господин Без Карманов','Человек с Четвергом','Гражданин Никуда','Иван Иванович Стул','Второй Иван Иванович','Покойный Будильник','Случайный Огурец','Некто в Одном Сапоге','Синий Квиток','Незначительный Кисель','Дядя с Запятой','Третий Человек Слева','Маленький Большой','Господин Вчера','Ненужный Треугольник','Серьёзный Табурет','Гражданка Пустота','Лысый Чайник','Профессор Ничего','Сосед из Шкафа','Человек без Вчера','Пётр Петрович Пыль','Почти Пушкин','Круглый Квадрат','Дама с Половиной Зонта','Отсутствующий Сосед','Неудавшийся Гриб','Мнимый Бухгалтер','Пропавшая Скобка','Кузьма Непонятный','Субботний Человечек','Фёдор Фёдорович Ноль','Вежливый Кирпич','Человек из Бумаги','Господин Пунктир','Незнакомый Знакомый','Карманный Философ','Две Пуговицы','Неподвижный Курьер','Гражданин Вторник','Одинокий Предлог','Не тот Семён','Пустой Чемодан','Анна Антоновна Точка','Николай Николаевич Шум','Человек с Лишним Ухом','Недописанный Гость','Летающий Комод','Молчаливый Самовар','Очень Маленькая Бесконечность','Товарищ Якобы','Пятый Без Четвёртого','Почти Лошадь','Геометрический Сосед','Странный Понедельник','Невероятный Бублик','Пелагея Без Причины','Заблудившаяся Буква','Незаконченный Нос','Несуществующий Кот','Месье Недоразумение','Гражданин Сквозняк','Два С Половиной Человека','Случай № 0'];
const PREFIXES=['Дежурный','Мнимый','Вчерашний','Безымянный','Запасной','Обратный','Крошечный','Временный','Торжественный','Невозможный'];
const OBJECTS=['Табурет','Гражданин','Сапог','Философ','Чемодан','Бублик','Вторник','Пиджак','Сосед','Огурец','Квадрат','Будильник'];
export function makeName(taken){const free=NAMES.filter(n=>!taken.has(n));if(free.length)return pick(free);const more=PREFIXES.flatMap(a=>OBJECTS.map(b=>a+' '+b)).filter(n=>!taken.has(n));if(more.length)return pick(more);let n;do{n='Некто № '+randomToken().slice(0,8)}while(taken.has(n));return n}
const COLORS=['#800080','#000080','#175a24','#933100','#524077','#00565e','#754b09'];
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const tokenOK=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
function randomToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('')}
const pick=a=>a[crypto.getRandomValues(new Uint32Array(1))[0]%a.length];
async function digest(text,secret){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('')}
// No chat payload, history or message API exists in this version.
// Keep the same Durable Object class and room ID to remove the old live history.
export function parseFrame(raw){
 if(typeof raw!=='string'||raw.length>128)return null;
 let m;try{m=JSON.parse(raw)}catch{return null}
 if(!m||typeof m!=='object'||Array.isArray(m))return null;
 const keys=Object.keys(m);
 if(m.type==='ping'&&keys.length===1)return m;
 if(m.type==='hello'&&keys.every(k=>k==='type'||k==='token')&&(m.token===undefined||m.token===''||tokenOK(m.token)))return m;
 return null;
}
export default {async fetch(req,env){
 const u=new URL(req.url);
 if(u.pathname==='/ws'||u.pathname.startsWith('/admin/'))return json({error:'retired'},410);
 if(!env.CHAT_ADMIN_TOKEN||env.CHAT_ADMIN_TOKEN.length<32)return json({error:'not_configured'},503);
 const room=env.CHAT.get(env.CHAT.idFromName('public-narod-v1'));
 if(u.pathname==='/health'&&req.method==='GET')return room.fetch(new Request('https://internal/health'));
 if(u.pathname==='/presence'){
  if(req.method!=='GET'||req.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'upgrade_required'},426);
  const allow=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim());if(!allow.includes(req.headers.get('Origin')))return json({error:'origin'},403);
  const ip=req.headers.get('CF-Connecting-IP')||'local';const headers=new Headers(req.headers);headers.set('X-Chat-Ip',await digest(ip,env.CHAT_ADMIN_TOKEN));return room.fetch(new Request(req,{headers}));
 }
 return json({error:'not_found'},404)
}};
export class ChatRoom{
 constructor(ctx,env){
  this.ctx=ctx;this.sql=ctx.storage.sql;
  this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,name TEXT NOT NULL,color TEXT NOT NULL,touched INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS limits(k TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL); DROP TABLE IF EXISTS messages;`);
  this.sql.exec("DELETE FROM limits WHERE k LIKE 'msg:%' OR k LIKE 'ip:%'");
  this.retireLegacy();
 }
 rows(q,...args){return [...this.sql.exec(q,...args)]}
 retireLegacy(){for(const s of this.ctx.getWebSockets()){if(this.attachment(s)?.v!==PROTOCOL)try{s.close(1008,'protocol retired')}catch{}}}
 prune(now=Date.now()){this.sql.exec('DELETE FROM sessions WHERE touched <= ?',now-DAY);this.sql.exec('DELETE FROM limits WHERE window < ?',now-120000)}
 async schedule(){if(await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(Date.now()+300000)}
 async alarm(){this.retireLegacy();this.prune();for(const s of this.sockets()){const a=this.attachment(s);if(!a?.token&&Date.now()-(a?.joined||0)>60000)try{s.close(1008,'hello timeout')}catch{}}if(this.rows('SELECT 1 FROM sessions UNION ALL SELECT 1 FROM limits LIMIT 1').length||this.sockets().length)await this.ctx.storage.setAlarm(Date.now()+300000)}
 limit(k,max,now=Date.now()){const window=Math.floor(now/60000)*60000;const row=this.rows('SELECT window,count FROM limits WHERE k=?',k)[0];if(row?.window===window&&row.count>=max)return false;this.sql.exec('INSERT INTO limits(k,window,count) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET window=excluded.window,count=excluded.count',k,window,row?.window===window?row.count+1:1);return true}
 sockets(exclude){return this.ctx.getWebSockets().filter(s=>s!==exclude&&s.readyState===1&&this.attachment(s)?.v===PROTOCOL)}
 attachment(s){try{return s.deserializeAttachment()}catch{return null}}
 users(exclude){const found=new Map();for(const s of this.sockets(exclude)){const a=this.attachment(s);if(a?.token)found.set(a.token,{name:a.name,color:a.color})}return [...found.values()].sort((a,b)=>a.name.localeCompare(b.name))}
 send(s,v){try{s.send(JSON.stringify(v))}catch{}}
 presence(exclude){const users=this.users(exclude);for(const s of this.sockets(exclude))if(this.attachment(s)?.token)this.send(s,{type:'presence',users})}
 async fetch(req){const u=new URL(req.url);this.retireLegacy();this.prune();
  if(u.pathname==='/health'&&req.method==='GET')return json({ok:true,mode:'presence-only',protocol:PROTOCOL});
  const ip=req.headers.get('X-Chat-Ip');if(u.pathname!=='/presence'||!ip||req.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'not_found'},404);
  const sockets=this.sockets();if(sockets.length>=MAX_ONLINE||sockets.filter(s=>this.attachment(s)?.ip===ip).length>=5||!this.limit('join:'+ip,20))return json({error:'busy'},429);
  const [client,server]=Object.values(new WebSocketPair());this.ctx.acceptWebSocket(server);server.serializeAttachment({v:PROTOCOL,ip,joined:Date.now()});await this.schedule();return new Response(null,{status:101,webSocket:client})
 }
 async webSocketMessage(ws,raw){
  const a=this.attachment(ws);if(a?.v!==PROTOCOL)return ws.close(1008,'protocol retired');
  if(!this.limit('frame:'+a.ip,120))return ws.close(1008,'rate');
  const m=parseFrame(raw);if(!m)return ws.close(1008,'presence only');
  if(m.type==='ping'){if(!a.token)return ws.close(1008,'hello required');const now=Date.now();if(now-(a.pingAt||0)<10000)return;ws.serializeAttachment({...a,pingAt:now});this.sql.exec('UPDATE sessions SET touched=? WHERE token=?',now,a.token);return this.send(ws,{type:'pong'})}
  if(a.token)return ws.close(1008,'already identified');
  const now=Date.now();let row=tokenOK(m.token)?this.rows('SELECT * FROM sessions WHERE token=? AND touched>?',m.token,now-DAY)[0]:null;
  if(!row){const token=randomToken(),name=makeName(new Set(this.rows('SELECT name FROM sessions').map(r=>r.name)));row={token,name,color:pick(COLORS)};this.sql.exec('INSERT INTO sessions(token,name,color,touched) VALUES(?,?,?,?)',row.token,row.name,row.color,now)}else this.sql.exec('UPDATE sessions SET touched=? WHERE token=?',now,row.token);
  ws.serializeAttachment({...a,token:row.token,name:row.name,color:row.color});this.send(ws,{type:'welcome',token:row.token,name:row.name,color:row.color,users:this.users()});this.presence();await this.schedule();
 }
 webSocketClose(ws){this.presence(ws);try{ws.close(1000,'closed')}catch{}}
 webSocketError(ws){this.webSocketClose(ws)}
}
