import os
import re
import yaml

user_home = os.path.expanduser('~')
gemini_skills_dir = os.path.join(user_home, '.gemini', 'config', 'skills')
dsh_skills_dir = os.path.join(user_home, '.dsh', 'skills')

skills_to_install = [
    {
        'src': os.path.join(gemini_skills_dir, 'AI视频提示词生成专家', 'SKILL.md'),
        'dest_dir': os.path.join(dsh_skills_dir, 'ai-video-prompt'),
        'name': 'ai-video-prompt',
        'desc': 'AI视频提示词工程师技能。精通AI视频生成底层逻辑与五大维度控制，专门生成高质量、标准化的AI视频提示词，支持文生视频、图生视频、批量分镜及提示词优化。'
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
    }
]

SKILL_NAME_RE = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')

for item in skills_to_install:
    assert SKILL_NAME_RE.match(item['name']), f"Invalid skill name: {item['name']}"
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

print("All skills installed successfully.")
