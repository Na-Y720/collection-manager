# Collection Manager

コレクションの購入日・購入金額・個数・JANコード・現在相場を管理するWebアプリです。

## 構成

- フロント: Static HTML / CSS / JavaScript
- 認証・DB: Supabase
- 公開先: Cloudflare Pages

## Cloudflare Pages 設定

- Production branch: `main`
- Build command: `exit 0`
- Build output directory: `public`

依存パッケージのビルドを使わないため、初期運用は無料かつシンプルです。
