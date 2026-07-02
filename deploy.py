import subprocess
import re
import sys
import os

def run_cmd(args):
    print(f"Running: {' '.join(args)}")
    res = subprocess.run(args, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error executing command: {' '.join(args)}")
        print(res.stderr)
        return None
    return res.stdout

def main():
    cwd = os.path.dirname(os.path.abspath(__file__))
    os.chdir(cwd)
    
    # 1. Build GAS file
    print("\n--- 1. 編譯獨立網頁 HTML ---")
    build_res = subprocess.run(["python3", "build_gas.py"], capture_output=True, text=True)
    print(build_res.stdout)
    if build_res.returncode != 0:
        print("編譯失敗！")
        sys.exit(1)
    
    # 2. Push code
    print("\n--- 2. 上傳程式碼至 Apps Script ---")
    push_res = subprocess.run(["npx", "clasp", "push"], capture_output=True, text=True)
    print(push_res.stdout)
    if push_res.returncode != 0:
        print("上傳失敗！")
        sys.exit(1)
    
    # 3. Get deployments
    print("\n--- 3. 取得現有部署資訊 ---")
    stdout = run_cmd(["npx", "clasp", "deployments"])
    if not stdout:
        print("取得部署清單失敗！")
        sys.exit(1)
        
    print(stdout)
    
    # 匹配部署 ID (排除 @HEAD)
    deployments = []
    for line in stdout.split("\n"):
        line = line.strip()
        if not line or "@HEAD" in line:
            continue
        # 匹配 "- DEPLOYMENT_ID @VERSION"
        match = re.search(r'-\s+([a-zA-Z0-9_-]+)\s+@', line)
        if match:
            deployments.append(match.group(1))
            
    if not deployments:
        print("找不到任何已存的部署，將建立全新部署...")
        deploy_res = subprocess.run(["npx", "clasp", "deploy", "-d", "鈦傳速智慧倉儲管理系統 - 初始部署"], capture_output=True, text=True)
        print(deploy_res.stdout)
    else:
        # 覆蓋第一個已存在的部署 ID，避免產生新網址
        target_id = deployments[0]
        print(f"偵測到現有部署 ID: {target_id}")
        print("進行覆蓋更新 (不新增部署)...")
        deploy_res = subprocess.run(["npx", "clasp", "deploy", "-i", target_id, "-d", "鈦傳速智慧倉儲管理系統 - 覆蓋更新"], capture_output=True, text=True)
        print(deploy_res.stdout)
        if deploy_res.returncode == 0:
            print("\n✅ 覆蓋部署成功！")
            print(f"🔗 線上 Web App 網址 (維持不變):")
            print(f"https://script.google.com/macros/s/{target_id}/exec")

if __name__ == "__main__":
    main()
