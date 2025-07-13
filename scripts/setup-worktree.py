#!/usr/bin/env python3
"""
worktree セットアップスクリプト (Python版)
新しいworktreeを作成し、メインリポジトリから環境変数ファイルをコピーする

高度な機能:
- 環境変数ファイルの内容検証
- テンプレート変数の置換
- 依存関係の自動検出とインストール
- セットアップ後の動作確認
"""

import os
import sys
import subprocess
import shutil
import json
import argparse
from pathlib import Path
from typing import List, Dict, Optional
import re

class Colors:
    """色付きログ用のANSIカラーコード"""
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    PURPLE = '\033[0;35m'
    CYAN = '\033[0;36m'
    NC = '\033[0m'  # No Color

class Logger:
    """カラフルなログ出力クラス"""
    
    @staticmethod
    def info(message: str):
        print(f"{Colors.BLUE}[INFO]{Colors.NC} {message}")
    
    @staticmethod
    def success(message: str):
        print(f"{Colors.GREEN}[SUCCESS]{Colors.NC} {message}")
    
    @staticmethod
    def warning(message: str):
        print(f"{Colors.YELLOW}[WARNING]{Colors.NC} {message}")
    
    @staticmethod
    def error(message: str):
        print(f"{Colors.RED}[ERROR]{Colors.NC} {message}")
    
    @staticmethod
    def debug(message: str):
        print(f"{Colors.PURPLE}[DEBUG]{Colors.NC} {message}")

class WorktreeManager:
    """worktree管理クラス"""
    
    def __init__(self):
        self.main_repo_path = self._get_main_repo_path()
        self.env_files = [
            ".env",
            ".env.local", 
            ".env.development",
            ".env.production",
            ".env.test",
            ".env.example"
        ]
    
    def _get_main_repo_path(self) -> Path:
        """メインリポジトリのパスを取得"""
        try:
            result = subprocess.run(
                ["git", "rev-parse", "--show-toplevel"],
                capture_output=True,
                text=True,
                check=True
            )
            return Path(result.stdout.strip())
        except subprocess.CalledProcessError:
            Logger.error("現在のディレクトリはGitリポジトリではありません")
            sys.exit(1)
    
    def _run_command(self, command: List[str], cwd: Optional[Path] = None) -> subprocess.CompletedProcess:
        """コマンドを実行"""
        try:
            return subprocess.run(command, cwd=cwd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            Logger.error(f"コマンド実行エラー: {' '.join(command)}")
            Logger.error(f"エラー出力: {e.stderr}")
            raise
    
    def _branch_exists(self, branch_name: str) -> bool:
        """ブランチが存在するかチェック"""
        try:
            self._run_command(["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch_name}"])
            return True
        except subprocess.CalledProcessError:
            return False
    
    def create_worktree(self, branch_name: str, worktree_path: Path) -> bool:
        """worktreeを作成"""
        if worktree_path.exists():
            Logger.error(f"worktreeパスが既に存在します: {worktree_path}")
            return False
        
        Logger.info(f"新しいworktreeを作成中: {branch_name} -> {worktree_path}")
        
        try:
            if self._branch_exists(branch_name):
                Logger.warning(f"ブランチ '{branch_name}' は既に存在します。既存ブランチを使用します。")
                self._run_command(["git", "worktree", "add", str(worktree_path), branch_name])
            else:
                Logger.info(f"新しいブランチ '{branch_name}' を作成します")
                self._run_command(["git", "worktree", "add", "-b", branch_name, str(worktree_path)])
            
            Logger.success(f"worktree作成完了: {worktree_path}")
            return True
        except subprocess.CalledProcessError:
            return False
    
    def _validate_env_file(self, file_path: Path) -> Dict[str, str]:
        """環境変数ファイルの内容を検証し、変数を抽出"""
        variables = {}
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                for line_num, line in enumerate(f, 1):
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    
                    if '=' in line:
                        key, value = line.split('=', 1)
                        key = key.strip()
                        value = value.strip().strip('"').strip("'")
                        variables[key] = value
                    else:
                        Logger.warning(f"{file_path.name}:{line_num} - 無効な形式: {line}")
        except Exception as e:
            Logger.warning(f"環境変数ファイルの読み込みエラー: {file_path.name} - {e}")
        
        return variables
    
    def _substitute_template_variables(self, content: str, substitutions: Dict[str, str]) -> str:
        """テンプレート変数を置換"""
        for key, value in substitutions.items():
            pattern = f"{{{{ {key} }}}}"
            content = content.replace(pattern, value)
        return content
    
    def copy_env_files(self, worktree_path: Path, template_vars: Optional[Dict[str, str]] = None) -> List[str]:
        """環境変数ファイルをコピー"""
        Logger.info("環境変数ファイルをコピー中...")
        
        copied_files = []
        template_vars = template_vars or {}
        
        for env_file in self.env_files:
            source_file = self.main_repo_path / env_file
            dest_file = worktree_path / env_file
            
            if source_file.exists():
                try:
                    # ファイル内容を読み込み
                    with open(source_file, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # テンプレート変数を置換
                    if template_vars:
                        content = self._substitute_template_variables(content, template_vars)
                    
                    # ファイルに書き込み
                    with open(dest_file, 'w', encoding='utf-8') as f:
                        f.write(content)
                    
                    # 内容を検証
                    variables = self._validate_env_file(dest_file)
                    Logger.success(f"コピー完了: {env_file} ({len(variables)}個の変数)")
                    copied_files.append(env_file)
                    
                except Exception as e:
                    Logger.error(f"ファイルコピーエラー: {env_file} - {e}")
            else:
                Logger.warning(f"ファイルが見つかりません: {env_file}")
        
        return copied_files
    
    def _detect_package_manager(self, worktree_path: Path) -> Optional[str]:
        """パッケージマネージャーを自動検出"""
        if (worktree_path / "package-lock.json").exists():
            return "npm"
        elif (worktree_path / "yarn.lock").exists():
            return "yarn"
        elif (worktree_path / "pnpm-lock.yaml").exists():
            return "pnpm"
        elif (worktree_path / "package.json").exists():
            return "npm"  # デフォルト
        return None
    
    def install_dependencies(self, worktree_path: Path) -> bool:
        """依存関係をインストール"""
        package_manager = self._detect_package_manager(worktree_path)
        
        if not package_manager:
            Logger.warning("package.jsonが見つかりません。依存関係のインストールをスキップします。")
            return False
        
        Logger.info(f"依存関係をインストール中 ({package_manager})...")
        
        try:
            self._run_command([package_manager, "install"], cwd=worktree_path)
            Logger.success("依存関係のインストール完了")
            return True
        except subprocess.CalledProcessError:
            Logger.error("依存関係のインストールに失敗しました")
            return False
    
    def verify_setup(self, worktree_path: Path) -> Dict[str, bool]:
        """セットアップ後の動作確認"""
        Logger.info("セットアップの動作確認中...")
        
        results = {}
        
        # package.jsonの存在確認
        package_json = worktree_path / "package.json"
        results["package_json"] = package_json.exists()
        
        # node_modulesの存在確認
        node_modules = worktree_path / "node_modules"
        results["node_modules"] = node_modules.exists()
        
        # TypeScriptの型チェック（存在する場合）
        tsconfig = worktree_path / "tsconfig.json"
        if tsconfig.exists():
            try:
                self._run_command(["npx", "tsc", "--noEmit"], cwd=worktree_path)
                results["typescript_check"] = True
                Logger.success("TypeScript型チェック: OK")
            except subprocess.CalledProcessError:
                results["typescript_check"] = False
                Logger.warning("TypeScript型チェック: エラーあり")
        
        # 基本的なlintチェック（存在する場合）
        if package_json.exists():
            try:
                with open(package_json, 'r') as f:
                    package_data = json.load(f)
                    scripts = package_data.get("scripts", {})
                    
                    if "lint" in scripts:
                        self._run_command(["npm", "run", "lint"], cwd=worktree_path)
                        results["lint_check"] = True
                        Logger.success("Lint チェック: OK")
            except (subprocess.CalledProcessError, json.JSONDecodeError):
                results["lint_check"] = False
                Logger.warning("Lint チェック: エラーあり")
        
        return results
    
    def print_setup_summary(self, branch_name: str, worktree_path: Path, copied_files: List[str], verification_results: Dict[str, bool]):
        """セットアップ完了サマリーを表示"""
        print("\n🎉 worktreeセットアップ完了!")
        print(f"\n📁 作業ディレクトリ: {worktree_path}")
        print(f"🌿 ブランチ: {branch_name}")
        
        if copied_files:
            print(f"\n✅ コピーされた環境変数ファイル:")
            for file in copied_files:
                print(f"   - {file}")
        
        print(f"\n🔍 動作確認結果:")
        for check, result in verification_results.items():
            status = "✅" if result else "❌"
            print(f"   {status} {check}")
        
        print(f"\n次のステップ:")
        print(f"  1. cd {worktree_path}")
        print(f"  2. 環境変数ファイルの内容を確認・編集")
        print(f"  3. 開発開始: npm run dev")
        
        print(f"\nworktreeの削除方法:")
        print(f"  git worktree remove {worktree_path}")
        print(f"  git branch -D {branch_name}  # ブランチも削除する場合")

def main():
    parser = argparse.ArgumentParser(
        description="worktreeセットアップスクリプト",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
例:
  %(prog)s feature/new-feature
  %(prog)s hotfix/bug-fix --path ../my-hotfix
  %(prog)s feature/test --template-vars BRANCH_NAME=test DB_NAME=test_db
        """
    )
    
    parser.add_argument("branch_name", help="作成するブランチ名")
    parser.add_argument("--path", "-p", help="worktreeを作成するパス（省略時: ../<branch-name>）")
    parser.add_argument("--template-vars", "-t", help="テンプレート変数 (KEY=VALUE,KEY2=VALUE2)")
    parser.add_argument("--skip-install", action="store_true", help="依存関係のインストールをスキップ")
    parser.add_argument("--skip-verify", action="store_true", help="動作確認をスキップ")
    parser.add_argument("--verbose", "-v", action="store_true", help="詳細ログを表示")
    
    args = parser.parse_args()
    
    # パスの設定
    worktree_path = Path(args.path) if args.path else Path(f"../{args.branch_name}")
    
    # テンプレート変数の解析
    template_vars = {}
    if args.template_vars:
        for pair in args.template_vars.split(','):
            if '=' in pair:
                key, value = pair.split('=', 1)
                template_vars[key.strip()] = value.strip()
    
    # worktree管理インスタンス作成
    manager = WorktreeManager()
    
    try:
        # worktree作成
        if not manager.create_worktree(args.branch_name, worktree_path):
            sys.exit(1)
        
        # 環境変数ファイルをコピー
        copied_files = manager.copy_env_files(worktree_path, template_vars)
        
        # 依存関係インストール
        if not args.skip_install:
            manager.install_dependencies(worktree_path)
        
        # 動作確認
        verification_results = {}
        if not args.skip_verify:
            verification_results = manager.verify_setup(worktree_path)
        
        # サマリー表示
        manager.print_setup_summary(args.branch_name, worktree_path, copied_files, verification_results)
        
    except KeyboardInterrupt:
        Logger.error("\nセットアップが中断されました")
        sys.exit(1)
    except Exception as e:
        Logger.error(f"予期しないエラー: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()