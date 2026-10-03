# Перенос через GitHub

В репозиторий входят исходники, `assets/` с оригиналами изображений,
тесты, документация, настройки проекта и `pnpm-lock.yaml`.
Зависимости `node_modules/`, локальный кэш `.pnpm-store/` и генерируемый
`sudota.html` исключены через `.gitignore`. Они создаются на новом компьютере.
Черновые PNG в корне также сохраняются в репозитории.

## Загрузка с текущего компьютера

Создайте пустой репозиторий на GitHub без автоматически добавляемых README,
лицензии и `.gitignore`. Для личного проекта можно выбрать Private.
В терминале откройте папку проекта и выполните:

```sh
git add .
git diff --cached --stat
git commit -m "Prepare Sudota project for transfer"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

Замените `USERNAME/REPOSITORY` адресом созданного репозитория.
Для авторизации используйте GitHub Desktop, браузерный вход Git Credential
Manager или токен GitHub; пароль аккаунта для Git по HTTPS не подходит.
При работе через GitHub Desktop добавьте эту папку как существующий локальный
репозиторий, создайте первый коммит и нажмите Publish repository.

## На другом компьютере

Установите Git и Node.js 24 LTS с npm. Склонируйте репозиторий:

```sh
git clone https://github.com/USERNAME/REPOSITORY.git
cd REPOSITORY
```

Для установки точных версий зависимостей используйте pnpm 10:

```sh
npm install --global pnpm@10
pnpm install --frozen-lockfile
npm run build
```

После сборки откройте `sudota.html` в браузере: он работает без сервера и сети.
Для разработки выполните `npm start` и откройте `http://localhost:4173`.
Остановка сервера: Ctrl+C. Проверки проекта: `npm test`.

Если pnpm не нужен, можно выполнить `npm install` и `npm run build`.
При этом npm создаст свой lockfile; точные версии из `pnpm-lock.yaml`
этот способ не использует.

## Последующие изменения

Перед работой на другом компьютере выполняйте `git pull`.
После изменений создайте коммит и выполните `git push`, чтобы получить их
на втором компьютере. Не редактируйте `sudota.html`: меняйте исходники и
пересобирайте командой `npm run build`.

Сохранения матчей в проекте нет. Перенос репозитория переносит игру и
материалы проекта, но не текущий матч из открытого браузера.
