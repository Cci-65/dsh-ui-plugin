import os
import shutil
import json
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

print("===> Installing @local/dsh-ui into DeepSeek Harness...")

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

# 1. Sync plugin files
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

# 3. Update profile package.json
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

    with open(pkg_path, "w", encoding="utf-8") as f:
        json.dump(pkg_data, f, indent=2, ensure_ascii=False)
    print(f"[OK] Registered bundle @local/dsh-ui in {pkg_path}")

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
        entry = "\n- id: dsh-ui\n  disabled: false\n  config: {}\n"
        with open(patch_path, "a", encoding="utf-8") as f:
            f.write(entry)
        print(f"[OK] Enabled plugin patch dsh-ui in {patch_path}")
    else:
        print(f"[OK] Plugin patch dsh-ui already present in {patch_path}")

print("===> DeepSeek Harness Plugin @local/dsh-ui Installed Successfully!")
