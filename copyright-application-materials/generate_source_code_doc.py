#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成软件著作权申请用源代码文档
要求: 前30页+后30页，每页50行，共3000行
"""

import os

def generate_source_code_doc():
    # 源代码文件列表(相对路径, 预估行数)
    files_to_include = [
        ('../backend/app.py', '主应用，用户、世界、文件上传、聊天等功能'),
        ('../backend/llm_manager.py', 'LLM管理器，支持多AI模型'),
        ('../backend/models.py', '数据库模型定义'),
        ('../backend/config.py', '配置模块'),
        ('../frontend/world-config.js', '世界配置模块，文件上传和分享功能'),
        ('../frontend/chat.js', '聊天模块，WebSocket通信'),
        ('../frontend/component.js', 'UI组件和交互控制'),
        ('../frontend/index.html', 'HTML主页面'),
        ('../frontend/init.js', '初始化脚本')
    ]

    output_lines = []

    # 文档头部
    output_lines.append('# 心灵絮语软件 V2.0 源代码文档\n\n')
    output_lines.append('**著作权人:** [著作权人姓名]\n\n')
    output_lines.append('本源代码文档包含前30页和后30页源代码，每页50行，共3000行。\n\n')
    output_lines.append('---\n\n')
    output_lines.append('## 源代码文件列表\n\n')

    for file_path, desc in files_to_include:
        output_lines.append(f'- **{os.path.basename(file_path)}**: {desc}\n')

    output_lines.append('\n---\n\n')
    output_lines.append('## 前30页源代码 (第1-1500行)\n\n')

    total_lines = 0
    page_num = 1
    in_后30页 = False

    for file_path, desc in files_to_include:
        if not os.path.exists(file_path):
            print(f'警告: 文件不存在 {file_path}')
            continue

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        except:
            print(f'警告: 无法读取文件 {file_path}')
            continue

        # 文件头信息
        output_lines.append(f'### 文件: {os.path.basename(file_path)}\n\n')
        output_lines.append(f'**路径:** {file_path}  \n')
        output_lines.append(f'**说明:** {desc}  \n')
        output_lines.append(f'**行数:** {len(lines)}行\n\n')
        output_lines.append('```\n')

        for i, line in enumerate(lines, 1):
            # 每50行标记一页
            if total_lines > 0 and total_lines % 50 == 0:
                output_lines.append('```\n\n')
                page_num += 1

                # 在第1500行后标记"后30页"
                if total_lines == 1500 and not in_后30页:
                    output_lines.append('---\n\n')
                    output_lines.append('## 后30页源代码 (第1501-3000行)\n\n')
                    in_后30页 = True

                output_lines.append(f'===== 第{page_num}页 =====\n\n')
                output_lines.append('```\n')

            # 写入代码行（带行号）
            output_lines.append(f'{i:6d}  {line}')
            total_lines += 1

            # 达到3000行后停止
            if total_lines >= 3000:
                break

        output_lines.append('```\n\n')

        if total_lines >= 3000:
            break

    # 文档尾部
    output_lines.append('\n---\n\n')
    output_lines.append(f'**源代码文档生成完毕**\n\n')
    output_lines.append(f'- 总行数: {total_lines}行\n')
    output_lines.append(f'- 总页数: {page_num}页\n')
    output_lines.append(f'- 前30页: 第1-1500行\n')
    output_lines.append(f'- 后30页: 第1501-3000行\n')

    # 写入文件
    output_file = '源代码文档.md'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(output_lines)

    print(f'源代码文档已生成: {output_file}')
    print(f'- 总代码行数: {total_lines}行')
    print(f'- 总页数: {page_num}页')

    return output_file

if __name__ == '__main__':
    generate_source_code_doc()
