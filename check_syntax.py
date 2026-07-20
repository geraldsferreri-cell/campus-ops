import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
script = scripts[0]

# Check template literals
in_template = False
template_start = 0
for i, char in enumerate(script):
    if char == '`' and (i == 0 or script[i-1] != '\\'):
        if not in_template:
            in_template = True
            template_start = i
        else:
            in_template = False
            template_content = script[template_start+1:i]
            opens = len(re.findall(r'\$\{', template_content))
            closes = template_content.count('}')
            if opens != closes:
                # Write to file instead of printing
                with open('syntax_errors.txt', 'a', encoding='utf-8') as out:
                    line_num = content[:content.find('<script>') + 8 + template_start].count('\n') + 1
                    out.write(f'ERROR at HTML line ~{line_num}, script position {template_start}:\n')
                    out.write(f'  Open braces: {opens}, Close braces: {closes}\n')
                    out.write(f'  Content (first 500 chars):\n')
                    out.write(template_content[:500])
                    out.write('\n---\n')

print('Done. Check syntax_errors.txt')
