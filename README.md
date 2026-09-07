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

## Bash Consoleについて

現在のGitHub Pages版に搭載されているBash Consoleは、**ブラウザ上だけで動作するBash風シェル**であり、実際のLinuxプロセスではありません。

Terminalセルとブラウザ上のファイルシステムを共有し、サーバーを必要とせずに一般的なシェルコマンドを利用できます。

対応しているコマンドには、`help`、`pwd`、`ls`、`cd`、`mkdir`、`touch`、`cat`、`echo`、`rm`、`clear`、`uname`、`whoami`、`date`、`python` などがあります。

シェルでは、次のコマンドも認識されます。

```bash
pip install scratchattach
python -m pip install scratchattach
```

これらのインストールコマンドは、通常のOSレベルの `pip` やシステムパッケージマネージャーとして動くのではなく、Codeセルと同じブラウザ上のPython環境にあるPyodideの `micropip` へ送られます。

**↑ / ↓** でコマンド履歴を移動し、**Tab** で基本的な補完、**Ctrl+L** でコンソールをクリアできます。

将来的に本物のLinux Bash環境を実現するには、サーバーやコンテナによる実行環境が必要になります。

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
