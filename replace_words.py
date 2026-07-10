import os
import re
import subprocess

def get_tracked_files():
    result = subprocess.run(['git', 'ls-files'], capture_output=True, text=True)
    return result.stdout.splitlines()

def replace_in_files():
    tracked_files = get_tracked_files()
    
    # regex for forbidden words
    pattern = re.compile(r'(saya|saya|saya|saya|saya|saya)', re.IGNORECASE)
    
    for file_path in tracked_files:
        if not os.path.isfile(file_path):
            continue
            
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            new_content = pattern.sub(lambda match: 'saya' if match.group(0).islower() else ('Saya' if match.group(0).istitle() else 'SAYA'), content)
            
            if new_content != content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Replaced in {file_path}")
        except Exception as e:
            # Skip binary files or decoding errors
            pass

if __name__ == '__main__':
    replace_in_files()
