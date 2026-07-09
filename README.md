# neosCookBook 🍳

A cookbook that lives in git. Every recipe is a folder, every tweak is a
commit with a plain-language note on *what changed and why*, and every
experiment is kept as a **variant** alongside the original.

Recipes are added and edited by chatting with an AI over Telegram — the
website at the other end renders this repo as a warm, browsable cookbook.

## Structure
```
recipes/<slug>/recipe.yaml        the canonical recipe
recipes/<slug>/images/            photos
recipes/<slug>/variants/*.yaml    experimental versions, kept forever
schema/recipe.schema.json         validated in CI on every push
```

## Clone it
```
git clone https://github.com/neeyatiajmera/cookbook.git
```

Recipes are CC BY 4.0 — cook, adapt, and share with credit.
