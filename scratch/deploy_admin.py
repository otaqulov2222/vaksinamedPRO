import os
import paramiko

VPS_HOST = "77.83.206.192"
VPS_PORT = 22
VPS_USER = "root"
VPS_PASS = "x*n!Z!Vj!fkAkb5l"
REMOTE_DIR = "/var/www/vaksinamed/artifacts/admin-web/dist"
LOCAL_DIR = r"c:\Users\UltraPC\Desktop\vaksinamedPRO-main (3)\vaksinamedPRO-main\artifacts\admin-web\dist"

def deploy():
    print(f"Connecting to {VPS_HOST}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(VPS_HOST, port=VPS_PORT, username=VPS_USER, password=VPS_PASS, timeout=15)
    sftp = ssh.open_sftp()

    def upload_dir(local_path, remote_path):
        try:
            sftp.mkdir(remote_path)
        except IOError:
            pass
        for item in os.listdir(local_path):
            l_item = os.path.join(local_path, item)
            r_item = remote_path + "/" + item
            if os.path.isdir(l_item):
                upload_dir(l_item, r_item)
            else:
                print(f"Uploading {item} -> {r_item}...")
                sftp.put(l_item, r_item)

    print("Uploading build files...")
    upload_dir(LOCAL_DIR, REMOTE_DIR)
    sftp.close()

    print("Reloading nginx...")
    stdin, stdout, stderr = ssh.exec_command("systemctl reload nginx")
    out = stdout.read().decode()
    err = stderr.read().decode()
    print("Nginx reload:", out, err)
    ssh.close()
    print("Deploy complete!")

if __name__ == "__main__":
    deploy()
