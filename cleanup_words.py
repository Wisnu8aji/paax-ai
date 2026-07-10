import os
import re

def clean_words():
    forbidden = re.compile(r'(saya|saya|saya|saya|saya|saya)', re.IGNORECASE)
    
    # 1. Rename files
    for root, dirs, files in os.walk('.', topdown=False):
        if '.git' in root or 'node_modules' in root or '.next' in root or 'dist' in root or '.turbo' in root:
            continue
            
        for name in files:
            if forbidden.search(name):
                new_name = forbidden.sub('AI', name)
                old_path = os.path.join(root, name)
                new_path = os.path.join(root, new_name)
                print(f"Renaming {old_path} -> {new_path}")
                os.rename(old_path, new_path)
                
    # 2. Scrub contents
    for root, dirs, files in os.walk('.'):
        if '.git' in root or 'node_modules' in root or '.next' in root or 'dist' in root or '.turbo' in root:
            continue
            
        for name in files:
            file_path = os.path.join(root, name)
            if not os.path.isfile(file_path):
                continue
                
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                if forbidden.search(content):
                    # Replace with Saya / saya / SAYA
                    def replacer(match):
                        w = match.group(0)
                        if w.islower(): return 'saya'
                        if w.isupper(): return 'SAYA'
                        return 'Saya'
                    new_content = forbidden.sub(replacer, content)
                    
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Scrubbed {file_path}")
            except Exception as e:
                pass

if __name__ == '__main__':
    clean_words()
