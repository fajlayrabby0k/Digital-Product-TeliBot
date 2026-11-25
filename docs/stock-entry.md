# Adding local stock

Open Admin Panel → Add Stock, select an active local product, then choose a format.

## Multiline Accounts

Paste one complete account per message. All lines belong to ONE stock item. Numbering and internal blank lines are preserved in the delivered text document. Outer blank space is trimmed; CRLF is normalized to LF.

```text
24.
Mail - sample@example.test
Mail reader - https://example.test/reader
Lovable password - sample-value
Outlook password - another-value
```

To add several accounts in one message, place `---` on its own line between complete accounts. That separator is removed and must not appear inside an account. Up to 50 accounts, 1500 characters per account, within Telegram message limits. After confirmation, start Add Stock again for another message.

## Single-line Items

Each nonempty line is a separate stock item. Single-column Markdown tables are also supported. A standalone `---` line automatically selects multiline grouping, including in older single-line sessions. A trailing separator does not create an extra item. Recognizable multiline account fields without a separator are rejected in single-line mode; switch to Multiline Accounts to save them together.

API products use supplier stock and cannot receive local inventory. Stock content is private; stock notifications contain no credentials.
