import os
import re

# 注意：本脚本不依赖 PyYAML（旧版曾 `import yaml` 却从未使用，
# 在没有安装 PyYAML 的机器上会直接 ImportError 崩溃）。

user_home = os.path.expanduser('~')
gemini_skills_dir = os.path.join(user_home, '.gemini', 'config', 'skills')
dsh_skills_dir = os.path.join(user_home, '.dsh', 'skills')

# 与 client.js 的 KNOWN_SKILL_META 一一对应（6 项）；新增/下架技能时两边必须同步。
skills_to_install = [
    {
        'src': os.path.join(gemini_skills_dir, 'AI视频提示词生成专家', 'SKILL.md'),
        'dest_dir': os.path.join(dsh_skills_dir, 'ai-video-prompt'),
        'name': 'ai-video-prompt',
        'desc': 'AI视频提示词工程师技能。精通AI视频生成底层逻辑与五大维度控制，专门生成高质量、标准化的AI视频提示词，支持文生视频、图生视频、批量分镜及提示词优化。'
    },
    {
        'src': os.path.join(gemini_skills_dir, '分镜导演·SD2.0', 'SKILL.md'),
        'dest_dir': os.path.join(dsh_skills_dir, 'storyboard-director'),
        'name': 'storyboard-director',
        'desc': '分镜导演智能体，核心任务是将用户提供的剧本或文本解析为结构化的分镜脚本，并在不同镜头/批次间保持空间坐标（3D锚点）与角色状态的一致性，最终生成适配视频生成引擎（Seedance 2.0 / Nano Banana Pro）的高精度提示词。'
    },
    {
        'src': os.path.join(gemini_skills_dir, '分镜导演·SD2.5', 'SKILL.md'),
        'dest_dir': os.path.join(dsh_skills_dir, 'storyboard-director-sd25'),
        'name': 'storyboard-director-sd25',
        'desc': '分镜导演智能体，核心任务是将用户提供的剧本或文本解析为结构化的分镜脚本，并在不同镜头/批次间保持空间坐标（3D锚点）与角色状态的一致性，最终生成适配视频生成引擎（Seedance 2.5 / GPT image 2.5）的高精度提示词。'
    },
    {
        'src': os.path.join(gemini_skills_dir, '影视剧本改编大师', 'SKILL.md'),
        'dest_dir': os.path.join(dsh_skills_dir, 'screenplay-adaptation'),
        'name': 'screenplay-adaptation',
        'desc': '将各类小说/故事文本改编为可直接拍摄的商用剧本（竖屏短剧、横屏短剧、微电影三类。如有其他格式需求，用户须在开始前明确说明），涵盖原版改编、深度原创重构（原洗稿）、分镜输出、剧情续写。'
    },
    {
        'src': os.path.join(gemini_skills_dir, '艺术指导', 'SKILL.md'),
        'dest_dir': os.path.join(dsh_skills_dir, 'art-direction'),
        'name': 'art-direction',
        'desc': '影视化视觉资产生成助手，将小说/剧本转化为AI绘画提示词、角色视觉档案、场景视觉档案与台词时间线。'
    },
    {
        'src': os.path.join(gemini_skills_dir, 'C盘清理', 'SKILL.md'),
        'dest_dir': os.path.join(dsh_skills_dir, 'c-drive-cleanup'),
        'name': 'c-drive-cleanup',
        'desc': 'Windows C 盘空间清理与诊断。采用"先只读扫描 → 报告确认 → 白名单分级清理 → 验证释放量"的安全流程，只清理系统缓存/临时文件，绝不触碰用户个人文件。'
    }
]

SKILL_NAME_RE = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')

installed = 0
skipped = 0
for item in skills_to_install:
    assert SKILL_NAME_RE.match(item['name']), f"Invalid skill name: {item['name']}"
    if not os.path.exists(item['src']):
        print(f"[SKIP] source not found: {item['src']}")
        skipped += 1
        continue
    os.makedirs(item['dest_dir'], exist_ok=True)
    with open(item['src'], 'r', encoding='utf-8') as f:
        content = f.read()

    parts = content.split('---', 2)
    if len(parts) >= 3:
        body = parts[2]
    else:
        body = content

    new_content = f"""---
name: "{item['name']}"
description: "{item['desc']}"
---
{body.lstrip()}"""

    dest_file = os.path.join(item['dest_dir'], 'SKILL.md')
    with open(dest_file, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Installed {item['name']} -> {dest_file}")
    installed += 1

print(f"Skills sync finished: {installed} installed, {skipped} skipped (source missing).")
