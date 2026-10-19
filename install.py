import os
import shutil
import json
import tempfile
import _winapi

script_dir = os.path.dirname(os.path.abspath(__file__))
workspace_dir = script_dir
user_dsh_dir = os.path.join(os.path.expanduser("~"), ".dsh")
user_plugin_dir = os.path.join(user_dsh_dir, "plugin", "dsh-ui")
old_user_plugin_dir = os.path.join(user_dsh_dir, "plugin", "dsh-antigravity-composer")

profile_desktop_dir = os.path.join(user_dsh_dir, "profiles", "desktop")
local_modules_dir = os.path.join(profile_desktop_dir, "node_modules", "@local")
junction_target = os.path.join(local_modules_dir, "dsh-ui")
old_junction_target = os.path.join(local_modules_dir, "dsh-antigravity-composer")

# 自毁守卫：在已安装目录内运行本脚本时，绝不能"先删自己再复制自己"
# （旧逻辑会 rmtree 自身后 copytree 一个已消失的源，导致安装损坏）。
running_in_place = False
try:
    running_in_place = os.path.samefile(workspace_dir, user_plugin_dir)
except (OSError, ValueError):
    running_in_place = False

print("===> Installing @local/dsh-ui into DeepSeek Harness...")
if running_in_place:
    print("[INFO] install.py is running from the installed plugin directory; skipping self sync.")

# 0. Clean up legacy @local/dsh-antigravity-composer junction & plugin dir
if os.path.exists(old_junction_target) or os.path.islink(old_junction_target):
    try:
        os.remove(old_junction_target)
    except OSError:
        shutil.rmtree(old_junction_target, ignore_errors=True)
    print(f"[OK] Cleaned legacy junction at {old_junction_target}")

if os.path.exists(old_user_plugin_dir):
    try:
        shutil.rmtree(old_user_plugin_dir, ignore_errors=True)
        print(f"[OK] Cleaned legacy plugin directory at {old_user_plugin_dir}")
    except Exception as e:
        print(f"[WARN] Could not remove legacy plugin dir: {e}")

# 1. Sync plugin files (in-place 运行时跳过：源即目标，删除即自毁)
if not running_in_place:
    os.makedirs(os.path.join(user_dsh_dir, "plugin"), exist_ok=True)
    if os.path.exists(user_plugin_dir):
        shutil.rmtree(user_plugin_dir)
    shutil.copytree(workspace_dir, user_plugin_dir, ignore=shutil.ignore_patterns('.git', '*.pyc', '__pycache__'))
    print(f"[OK] Synced plugin package to {user_plugin_dir}")

# 2. Create junction
os.makedirs(local_modules_dir, exist_ok=True)
if os.path.exists(junction_target) or os.path.islink(junction_target):
    try:
        os.remove(junction_target)
    except OSError:
        shutil.rmtree(junction_target, ignore_errors=True)

try:
    _winapi.CreateJunction(user_plugin_dir, junction_target)
    print(f"[OK] Created junction at {junction_target}")
except Exception as e:
    # fallback to copy if junction fails
    print(f"[WARN] Junction creation failed ({e}), falling back to directory copy...")
    shutil.copytree(user_plugin_dir, junction_target)
    print(f"[OK] Copied files to {junction_target}")

# 3. Update profile package.json（先备份 .bak，再临时文件 + os.replace 原子替换，
#    避免写一半中断留下损坏的 profile）
pkg_path = os.path.join(profile_desktop_dir, "package.json")
if os.path.exists(pkg_path):
    with open(pkg_path, "r", encoding="utf-8") as f:
        pkg_data = json.load(f)

    bundles = pkg_data.setdefault("dsh", {}).setdefault("profile", {}).setdefault("bundles", [])
    # Remove old bundle
    if "@local/dsh-antigravity-composer" in bundles:
        bundles.remove("@local/dsh-antigravity-composer")
    # Add new bundle
    if "@local/dsh-ui" not in bundles:
        bundles.append("@local/dsh-ui")

    deps = pkg_data.setdefault("dependencies", {})
    # Remove old dep
    deps.pop("@local/dsh-antigravity-composer", None)
    # Add new dep
    deps["@local/dsh-ui"] = "link:" + user_plugin_dir.replace("\\", "/")

    bak_path = pkg_path + ".bak"
    try:
        shutil.copy2(pkg_path, bak_path)
    except OSError as e:
        print(f"[WARN] Could not create backup {bak_path}: {e}")

    fd, tmp_path = tempfile.mkstemp(dir=profile_desktop_dir, prefix="package.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(pkg_data, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, pkg_path)
    except Exception:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise
    print(f"[OK] Registered bundle @local/dsh-ui in {pkg_path} (backup: {bak_path})")

# 4. Update cordis.patch.yml
patch_path = os.path.join(profile_desktop_dir, "cordis.patch.yml")
if os.path.exists(patch_path):
    with open(patch_path, "r", encoding="utf-8") as f:
        patch_text = f.read()

    # Replace old entry if present
    if "dsh-antigravity-composer" in patch_text:
        patch_text = patch_text.replace("id: dsh-antigravity-composer", "id: dsh-ui")
        with open(patch_path, "w", encoding="utf-8") as f:
            f.write(patch_text)
        print(f"[OK] Migrated dsh-antigravity-composer -> dsh-ui in {patch_path}")
    elif "dsh-ui" not in patch_text:
        entry = "\n- id: dsh-ui\n  name: \"@local/dsh-ui\"\n  disabled: false\n  config: {}\n"
        with open(patch_path, "a", encoding="utf-8") as f:
            f.write(entry)
        print(f"[OK] Enabled plugin patch dsh-ui in {patch_path}")
    else:
        print(f"[OK] Plugin patch dsh-ui already present in {patch_path}")

# 5. Ensure bridge service is running
import socket
import subprocess

def is_bridge_running(port=19389):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            return s.connect_ex(('127.0.0.1', port)) == 0
    except:
        return False

if not is_bridge_running():
    bridge_script = os.path.join(user_plugin_dir, "bridge.mjs")
    if os.path.exists(bridge_script):
        node_exe = shutil.which("node")
        if node_exe:
            CREATE_NO_WINDOW = 0x08000000
            DETACHED_PROCESS = 0x00000008
            subprocess.Popen(
                [node_exe, bridge_script],
                cwd=user_plugin_dir,
                creationflags=CREATE_NO_WINDOW | DETACHED_PROCESS,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            print(f"[OK] Started DSH-UI bridge background service on port 19389")
        else:
            print("[WARN] node not found on PATH; bridge will start when the host loads the plugin.")
else:
    print(f"[OK] DSH-UI bridge is already running on port 19389")

print("===> DeepSeek Harness Plugin @local/dsh-ui Installed Successfully!")
