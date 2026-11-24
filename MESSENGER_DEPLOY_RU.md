# СЛУЧАИ — общий чат Narod

Ветка `add_narod_messenger` создана от `main` (`df794b2`). В присланном архиве `add_otec_game` (`b9391f0`) содержит незакоммиченные изменения; они не переносились и не менялись. Основное портфолио и Snake не переписаны. Ветка содержит чат на шести существующих страницах Narod. После объединения с веткой игры добавьте те же теги в новые HTML-страницы Narod, в частности `father.html`.

## 1. Импорт Git-ветки (PowerShell)

Распакуйте поставляемый ZIP **вне** своего репозитория. В своём существующем репозитории выполните:

```powershell
git status
git fetch "C:\путь\к\архиву\add_narod_messenger.bundle" refs/heads/add_narod_messenger:refs/heads/add_narod_messenger
git log -1 add_narod_messenger
git push -u origin add_narod_messenger
```

Bundle содержит новый коммит и опирается на исходный `main`. Команда fetch не меняет рабочие файлы, HEAD или ветку игры. Если ветка с таким именем уже существует, сначала проверьте её; не используйте принудительное обновление. Если хочется работать параллельно с незакоммиченной игрой, создайте второй worktree (в соседней, ещё не существующей папке):

```powershell
git worktree add ..\lanskikh-messenger add_narod_messenger
cd ..\lanskikh-messenger
```

Иначе после сохранения текущих изменений можно выполнить `git switch add_narod_messenger`. Не выполняйте reset/clean в каталоге игры.

## 2. Как устроено

Frontend: `narod/chat.js`, `chat.css`, `chat-config.js`. Автоматическое открытие при первом посещении Narod в новой вкладке, без захвата фокуса. Закрытие и сворачивание сохраняются до конца сессии вкладки. Сервер назначает русское абсурдное имя, которое сохраняется при переходах и переподключении в этой вкладке. Отдельная вкладка обычно получает новое имя (дублированная вкладка может наследовать sessionStorage). 64 исходных имени + комбинации; активные и недавно использованные имена не повторяются. Название отсылает к циклу Хармса «Случаи»; имена — оригинальные, не цитаты. RU/EN интерфейс, сами имена остаются русскими.

Backend: отдельный Cloudflare Worker `lanskikh-narod-chat` + один SQLite Durable Object `ChatRoom`, WebSocket Hibernation API. История максимум 100 сообщений за последние 24 часа, удаление устаревших данных при активности и периодическим alarm (физическая очистка может происходить с задержкой). Лимит 50 соединений на комнату, 5 на IP, 12 сообщений/мин на сессию, 30/мин на IP, интервал 1,2 с, 500 Unicode-символов. IP используется в виде HMAC для ограничения частоты, не публикуется; публичная история не содержит IP. Секрет администратора хранится в Worker; не помещать в Git или frontend. Нет регистрации, личных сообщений и вложений. Это небольшой публичный чат, не анонимный защищённый мессенджер. Защита от спама базовая, не гарантирует защиту от распределённых атак; модерирование ручное. Не публиковать личные данные.

## 3. Локальная проверка

Требуется Node.js 22+ (рекомендуется 22 LTS или новее) и Python 3 для простого статического сервера.

```powershell
cd chat-worker
npm install
npm test
Copy-Item .dev.vars.example .dev.vars
npm run dev
```

`.dev.vars` уже исключён из Git. Замените тестовый токен произвольной случайной строкой от 32 символов; **не** используйте производственный секрет локально. В другом терминале из корня этой рабочей копии:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Откройте `http://127.0.0.1:8000/narod/index.html?lang=ru` в обычном и приватном окне. Должны появиться разные имена и оба пользователя в списке. Проверьте обмен сообщениями, смену языка, закрытие/открытие, обновление страницы, мобильную ширину, Snake. Для local Worker используется порт 8787, а допустимые origins задаются в `.dev.vars`. Не используйте `file://`.

## 4. Развёртывание Worker в Cloudflare

Войдите в аккаунт Cloudflare, где уже находится зона `lanskikh.art`. Нужны права на Workers, Durable Objects и custom domains. SQLite Durable Objects доступны на Free; не нужно подключать платный тариф для обычного небольшого чата. Квоты действуют, поэтому проверьте Usage после запуска.

Из `chat-worker/`:

```powershell
npm install
npx wrangler login
npx wrangler whoami
npx wrangler deploy
```

Если предложено выбрать аккаунт, выберите тот же, где домен. В `wrangler.toml` уже указаны `chat.lanskikh.art` как Custom Domain, Durable Object binding `CHAT` и миграция `new_sqlite_classes = ["ChatRoom"]`. Wrangler создаёт Worker, namespace SQLite и маршрут; вручную создавать БД, CNAME или Pages Functions не нужно. Если `chat.lanskikh.art` уже занят, не удаляйте существующие записи вслепую — проверьте конфликт или выберите другое свободное имя и измените `chat-config.js` и конфигурацию Worker. Дождитесь готовности TLS.

Сгенерируйте стойкий случайный секрет (например, командой ниже, сохраните в менеджере паролей; не публикуйте вывод):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put CHAT_ADMIN_TOKEN
```

Вставьте секрет в интерактивный запрос Wrangler. До настройки секрета Worker намеренно отвечает 503. Проверка:

```powershell
Invoke-RestMethod https://chat.lanskikh.art/health
```

Ожидается `ok: True`. В Dashboard: Workers & Pages → `lanskikh-narod-chat` → Settings → Domains & Routes, проверьте `chat.lanskikh.art`; в Variables and Secrets — наличие `CHAT_ADMIN_TOKEN` (значение скрыто). В зоне Network убедитесь, что WebSockets разрешены. Не меняйте настройки основного домена и его Pages custom domain.

## 5. Публикация фронтенда на существующем Pages

**Сначала** протестируйте ветку локально, потом объедините её с main через Pull Request или локально (только чистый worktree):

```powershell
git switch main
git pull --ff-only origin main
git merge add_narod_messenger
git push origin main
```

Если игру уже объединяли с main, решите возможные конфликты HTML, сохранив обе функциональности. Если игру ещё разрабатываете — её ветка остаётся нетронутой; при будущем слиянии добавьте в `narod/father.html` (и новые страницы Narod) перед `</head>`:

```html
<link rel="stylesheet" href="chat.css">
```

перед `</body>`, после существующих скриптов:

```html
<script src="chat-config.js"></script>
<script src="chat.js"></script>
```

Для Git-integrated Pages в существующем проекте (Workers & Pages → ваш проект → Settings → Build / Build & deployments) установите после появления скрипта в production branch:

- Framework preset: None.
- Root directory: корень репозитория (пусто или `/`).
- Build command: `node scripts/build-pages.mjs`.
- Build output directory: `dist`.
- Production branch: существующая `main` (не менять на ветку чата).

Запустите новый deployment (или retry после сохранения настроек). Если предыдущая автоматическая сборка успела стартовать с настройками старого сайта, перезапустите с новым output directory. Скрипт собирает только HTML, favicon, `assets/` и `narod/`; серверный код и секреты не публикуются. Если в будущем добавляются новые публичные корневые каталоги, обновите список в скрипте. Обычный Git push не публикует Worker автоматически: он разворачивается отдельно.

Если проект Pages использует Direct Upload, из корня чистого checkout ветки, которую хотите опубликовать:

```powershell
node scripts/build-pages.mjs
npx --yes wrangler@4 pages deploy dist --project-name ИМЯ_СУЩЕСТВУЮЩЕГО_PAGES_ПРОЕКТА --branch main
```

Или загрузите `dist` через Dashboard. Имя проекта возьмите из своего Dashboard; не создавайте новый Pages-проект. Не загружайте весь репозиторий.

Preview-домены Pages по умолчанию **не** могут подключиться к production-чату. Если нужен preview, добавьте его точный HTTPS origin в `ALLOWED_ORIGINS` через `chat-worker/wrangler.toml` (через запятую, без пути/слэша), затем повторите `npx wrangler deploy`. Preview будет использовать ту же публичную комнату. Для изолированного тестирования предпочтительнее локальная проверка; не разрешайте все `*.pages.dev` и не используйте `*`. Production origins уже указаны: `https://lanskikh.art,https://www.lanskikh.art`.

## 6. Проверка после публикации

Откройте `https://lanskikh.art/narod/` в обычном и приватном окнах. Проверьте, что имена различаются, сообщения передаются в обе стороны, обновление вкладки сохраняет имя, при закрытии пользователь исчезает из списка, а на `https://lanskikh.art/` окна нет. DevTools → Network → WS: соединение `wss://chat.lanskikh.art/ws`, статус 101. Если 403 — сверить точный Origin и ALLOWED_ORIGINS; 503 — секрет не настроен; 429 — лимит соединений. При отключении сети интерфейс сообщает о проблеме и переподключается. Историю тестов можно очистить.

## 7. Модерация

В отдельном PowerShell введите секрет через защищённый prompt (не записывайте в историю команд):

```powershell
$secret = Read-Host 'Chat admin token' -AsSecureString
$token = [System.Net.NetworkCredential]::new('', $secret).Password
$headers = @{Authorization = "Bearer $token"}
Invoke-RestMethod https://chat.lanskikh.art/admin/history -Headers $headers
# Удалить конкретное сообщение; вместо 42 указать id из history:
Invoke-RestMethod https://chat.lanskikh.art/admin/delete -Method Post -Headers $headers -ContentType 'application/json' -Body '{"id":42}'
# Очистить всю историю (необратимо):
# Invoke-RestMethod https://chat.lanskikh.art/admin/clear -Method Post -Headers $headers
Remove-Variable token,secret,headers
```

При необходимости временно отключите публичный чат, убрав подключение JS из Narod либо отозвав секрет Worker (сервер перестанет принимать новые запросы; для немедленного отключения уже подключённых клиентов потребуется остановить/изменить backend). Откат Pages делается в Deployments; откат frontend не удаляет Worker или его историю.

## 8. Проверка при подготовке

- Node 22: шесть тестов `node --test chat-worker/test/*.test.js` прошли. SQLite настоящая in-memory, транспорт/DO context имитированы; не тест Cloudflare runtime.
- Chromium: фактическая разметка Narod + CSS + JS чата, встроенные в тестовую страницу с имитацией WebSocket; отправка, безопасный текст, сворачивание/закрытие/открытие, локализация, изоляция клавиатуры, ширина 390 px. Локальный HTTP заблокирован средой, полная интеграция сайта и живой Worker не проверялись.
- Статическая сборка `node scripts/build-pages.mjs` и проверка состава.
- Реальное развёртывание не выполнялось, аккаунт Cloudflare и origin не изменялись. Обязательна проверка двумя браузерами из разделов 3 и 6.

Официальная документация:
- https://developers.cloudflare.com/durable-objects/get-started/
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/pages/get-started/git-integration/
- https://developers.cloudflare.com/pages/get-started/direct-upload/
