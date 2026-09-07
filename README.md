# Code Nest 🪺

**Code Nest** は、最新のコーディング環境にインスパイアされた、ローカルファーストのブラウザNotebookです。

## ✨ 現在のリリース

UIは小さなプレミアム開発アプリのようなデザインを採用しつつ、GitHub Pagesでデプロイできる構成になっています。

- 🐍 PyodideによるPythonセル
- 📝 ライブプレビューに対応したMarkdownセル
- 🖥️ ブラウザ上のTerminal / Bash風シェル
- ⌁ コマンド履歴とTab補完に対応したインタラクティブBashコンソール
- 📦 Pyodide / micropip向けのブラウザ `pip install` ブリッジ
- ▶ 1つのセルだけを実行、またはすべてのPythonセルを実行
- 💾 自動ローカル保存
- 🌙 ライト / ダークテーマ
- 🔎 コマンド検索
- ⇩ NotebookをJSONとして書き出し
- 📱 スマートフォンなどに対応したレスポンシブレイアウト
- 🧩 Terminalセル用のローカルブラウザファイルシステム

**↑ / ↓** でコマンド履歴を移動し、**Tab** で基本的な補完、**Ctrl+L** でコンソールをクリアできます。

WebContainersも、Node.jsやシェル風の処理をブラウザ上で動かすための選択肢の1つですが、デプロイ時にはCOOP/COEPなどのクロスオリジン分離用ヘッダーが必要になります。詳しくはWebContainersのドキュメントを参照してください。

## Pythonランタイム

Pythonの実行は、Pyodideを使用してブラウザ内でローカルに行われます。

最初にPythonを実行するときは、ブラウザへランタイムをダウンロードする必要があるため、少し時間がかかる場合があります。

`pip install` でインストールしたパッケージは `micropip` を使用します。

`micropip` は純粋なPython製Wheelや、Pyodideに対応したWheelをサポートしています。

ネイティブ拡張機能を必要とし、WebAssembly環境で利用できないパッケージは、インストールに失敗する場合があります。

## デプロイ

このプロジェクトは、GitHub Pagesの **main / (root)** 構成での利用を想定しています。

リポジトリ: https://github.com/maru-m4ru-maru/code-nest
