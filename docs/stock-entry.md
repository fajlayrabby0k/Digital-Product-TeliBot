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

## Rename a local product

Open Admin Panel → Manage Products → select a local product → **Edit Name**. Send the new name on one line (1–120 characters). The catalog name changes without recreating inventory or changing prices, categories or order IDs. Existing orders retain their saved product-name snapshots. Cancel returns to the product and discards the edit session. Supplier API names remain managed by provider sync.

## Rename a category

Open Admin Panel → Categories → select a category → **Edit Name**. Send a unique name on one line (1–60 characters). Product assignments and category icons stay attached to the same category ID. Others Subscription is the reserved default name. Previous category names are retained as aliases for supplier sync, so renamed API categories retain their identity. Names belonging to another category (including aliases) cannot be used. Cancel discards the rename session.
