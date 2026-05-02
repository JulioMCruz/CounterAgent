# Telegram Alerts Plugin

Generic Telegram Bot API sender used by A4 Reporting.

This plugin does not use OpenClaw messaging. It sends directly through Telegram Bot API using `TELEGRAM_BOT_TOKEN`.

Private user alerts require a real numeric `chat_id`; a bot cannot DM an arbitrary `@username` unless the user has first started the bot and the app has captured the resulting chat id.
