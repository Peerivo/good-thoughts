# Архитектура и дорожная карта — Фабрика добрых мыслей

## Цель
Добрый, бережный, не осуждающий сервис коротких персональных ответов на вопросы людей. Шесть режимов: поддержка, благодарность, осознанность, рефрейминг, вдохновение, улучшение настроения. Никаких гарантированных лечебных эффектов и токсичной позитивности.

## Инфраструктура
- Изолированный GitHub-репозиторий `Peerivo/good-thoughts`.
- REG.RU №1: `/opt/peerivo/good-thoughts`, Node.js API на loopback-порту 3522, React/Vite статика.
- SQLite с WAL и ограничением 0600, закрытый путь `data/`; бэкап через SQLite online backup, ограничение срока хранения.
- Почта: Resend с проверенным собственным доменом отправителя, без реальных писем до настройки.
- Telegram: новый бот через BotFather, webhook по HTTPS с секретным заголовком.
- ИИ: не в HTTP-синхронном запросе. Часовая очередь ответов; в будущем API провайдера + контроль качества.
- Mira Vault / Peerivo/mem: ТОЛЬКО проектные ADR/STATUS/EVIDENCE через штатный Engine, ни одного пользовательского текста или адреса.
- Global Contract: 1.22.1 на момент начала проекта (2026-11-19).

## Модель
`requests`: id, channel, category, question, email/telegram_chat_id, status, answer, verification_digest, verification_expires_at, attempts, queued_at, created_at, answered_at, delivered_at. Дополнительно `deliveries` для идемпотентных попыток и `rate_limits` для антиспама. Секреты не входят в репозиторий.

## Статусы
`pending_verification -> queued -> processing -> answered -> delivered`. Ошибка доставки переводит в `delivery_failed`; обработка может повторяться. Истёкшее неподтверждение → `expired`. Подтверждённый Telegram callback/сообщение → сразу `queued`.

## Безопасность
- Email подтверждается 6-значным одноразовым кодом (10 мин, ограничение попыток).
- Telegram подтверждается подписанным webhook с Bot API; chat_id берётся только из настоящего апдейта Telegram.
- IP и email/thought rate limits; строгая валидация длины и типов. Не логировать тексты и токены.
- В webhook обязательный `X-Telegram-Bot-Api-Secret-Token`.
- API очереди и выдачи ответов — отдельный `ADMIN_TOKEN`.
- Перед отправкой ответов — защита от опасных советов и приватность, в том числе для вопросов о кризисных состояниях.
- Сайт указывает, что это поддержка, не экстренная помощь.
- Ответ в течение часа — целевой срок, только при работающем часовом обработчике; ошибки фиксируются.

## Этапность
1. Сквозной минимальный сервер и React-форма, SQLite, тесты.
2. Настройка домена и HTTPS + интеграция Resend (после DNS).
3. Telegram BotFather и подписанный webhook, доставка.
4. Часовая обработка подтверждённых вопросов, идемпотентность.
5. Настоящий API нейросети с ограничением бюджета, безопасностью и тестами.
6. Админ-интерфейс, политика хранения, удаление, резервные копии, нагрузочные тесты.
7. Публичная приёмка на реальных email и Telegram (только по разрешению владельца).

## Входные данные владельца
Домен выбран: dobro.peerivo.net. BotFather токен нового бота и username через безопасный канал; настройка DNS отправителя Resend; контактный адрес для политики конфиденциальности. Пока тестовые обращения не идут на упомянутый личный Gmail.

## Owner approval (2026-11-19, owner requirement)

Authoritative domain: dobro.peerivo.net. Owner must approve each exact draft version.
New lifecycle: pending_verification -> queued -> awaiting_approval -> approved -> processing -> delivered.
Return: awaiting_approval -> revision_requested -> awaiting_approval (new version).
Delivery uncertainty: delivery_failed; no automatic retry due to possible duplicate.
Legacy /api/internal/answer returns 410; owner approval cannot be bypassed.
Internal API: POST /api/internal/draft -> POST /api/internal/approve (id,version,decision) -> POST /api/internal/deliver (id,version).
Hourly agent may draft but NEVER approve on behalf of the owner.

## Notify and public contribution boundary
- Confirmed question enqueues owner_notifications(new_question). Draft enqueues owner_notifications(draft_vN).
- Owner-only personal Notify uses PRIVATE Peerivo/notify Issues starting [notify:telegram], with opaque event IDs only (no question/email/answer or auth links).
- Review of full question and answer requires authenticated owner interface. Until provisioned, only protected localhost API is available.
- Notify human-actions buttons are a separate integration gated on verified owner binding, private chat, and delivery receipt.
- Public repo MIT, CONTRIBUTING.md, SECURITY.md and GitHub-hosted-only CI for PRs; no deploy permissions for untrusted PRs.
- Target of preparing draft within an hour does not guarantee delivery: human approval can take longer.
