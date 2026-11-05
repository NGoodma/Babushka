# Заметки: как запустить QR-бота бесплатно

Инструкция для Claude на будущее. Статус на 2026-11-05: ничего не сделано, пользователь отложил задачу.

## Что есть сейчас

- Репозиторий: `NGoodma/QR` (публичный). Файлы: `bot.py` (77 строк), `requirements.txt`, `README.md`, `.gitignore`.
- Стек: Python 3.10+, `python-telegram-bot==21.6`, `qrcode[pil]==7.4.2`, `python-dotenv==1.0.1`.
- Бот принимает ссылку http/https и отвечает картинкой QR-кода в PNG.
- Сейчас бот работает в режиме **polling** (`app.run_polling()`), то есть только пока он запущен на Mac пользователя.
- Токен берётся из переменной окружения `TELEGRAM_BOT_TOKEN` (или из `.env`).

## Как устроен бесплатный хостинг у `NGoodma/expat` (образец)

- Фронтенд лежит на GitHub Pages (`https://ngoodma.github.io/expat/`). Его собирает и выкладывает GitHub Actions (`.github/workflows/deploy.yml`, ветка `gh-pages`).
- Бэкенд работает на бесплатном Render: `https://expat-mnqz.onrender.com`, проверка здоровья по адресу `/health`. Сайт узнаёт адрес бэкенда из секрета `VITE_WEBSOCKET_URL`.
- Ограничение бесплатного Render: сервис засыпает после ~15 минут без запросов, холодный старт занимает ~30–60 секунд.

## План для QR

Бесплатный Render не держит фоновые процессы постоянно, поэтому polling там не подходит. Нужно перевести бота на **webhook**: Telegram сам будет слать сообщения на адрес Render и будить спящий сервис.

### 1. Правки кода (в репозитории `NGoodma/QR`)

- `requirements.txt`: заменить `python-telegram-bot==21.6` на `python-telegram-bot[webhooks]==21.6`.
- `bot.py`, функция `main()`: выбирать режим по переменной окружения.

```python
url = os.getenv("RENDER_EXTERNAL_URL")  # Render задаёт её сам
if url:
    port = int(os.getenv("PORT", "10000"))
    app.run_webhook(
        listen="0.0.0.0",
        port=port,
        url_path="webhook",
        webhook_url=f"{url}/webhook",
        secret_token=os.getenv("WEBHOOK_SECRET"),
    )
else:
    app.run_polling()  # локальный запуск на Mac, как раньше
```

- `README.md` в QR: добавить раздел «Деплой на Render».
- Перед push показать пользователю дифф и получить подтверждение. Коммитить и пушить только по его просьбе.

### 2. Что пользователь делает сам на render.com (токены Claude не вводит)

1. New → Web Service → репозиторий `NGoodma/QR`.
2. Runtime: Python. Build: `pip install -r requirements.txt`. Start: `python bot.py`. План: Free.
3. Environment: `TELEGRAM_BOT_TOKEN` (от BotFather) и `WEBHOOK_SECRET` (любая случайная строка).
4. Deploy.

### 3. Проверка

- В логах Render должна быть строка о запуске webhook.
- Проверить, что webhook зарегистрирован: `getWebhookInfo` в Telegram Bot API. Пользователь подставляет свой токен; его не вставлять в команды и в чат.
- Написать боту `/start` и отправить ссылку. Первый ответ после сна может прийти через ~30–60 секунд.
- Если бот раньше запускался локально через polling, остановить локальный процесс, иначе будет конфликт.

### Запасные варианты

- Если нужен ответ без задержки: Oracle Cloud Always Free VM с systemd-сервисом и polling. Бесплатно, но настраивать дольше.
- Платный VPS (Hetzner), как предложено в `expat/corporat-server/DEPLOY.md`.

## Окружение

- `gh` установлен через Homebrew (`/opt/homebrew/bin/gh`), вход выполнен под `NGoodma` (scopes: repo, gist, read:org), git работает по HTTPS.
- Папка `Babushka` — проект бота для бабушки (см. `../README.md`); эти заметки лежат в `docs/`.
