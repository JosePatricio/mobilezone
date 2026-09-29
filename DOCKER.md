# Run MobileZone with Docker on Ubuntu

## 1. Push the code to git (Windows PC)

Create an empty private repository (GitHub/GitLab), then in PowerShell:

```powershell
cd C:\Development\Python\mobilezone
git init
git add .
git status
```

Confirm that no `.env`, `.venv`, `node_modules` or `dist` files are listed, then:

```powershell
git commit -m "MobileZone with Docker"
git branch -M main
git remote add origin https://github.com/<your-user>/mobilezone.git
git push -u origin main
```

## 2. Install Docker and git (Ubuntu server, once)

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and log back in over SSH, then check that both commands print a version:

```bash
docker --version
docker compose version
```

## 3. Clone the repository

```bash
sudo mkdir -p /opt/mobilezone
sudo chown $USER:$USER /opt/mobilezone
git clone https://github.com/<your-user>/mobilezone.git /opt/mobilezone
cd /opt/mobilezone
```

For a private repository, git asks for a username and password. Use a GitHub personal access token as the password.

## 4. Create the `.env` file

```bash
cp .env.docker.example .env
openssl rand -base64 48 | tr -d '\n/+='; echo
```

Copy the random string that the second command prints. Then open the file:

```bash
nano .env
```

Set these values. Use only letters and digits in the passwords.

```ini
APP_PORT=80
MYSQL_ROOT_PASSWORD=<strong root password>
DB_PASSWORD=<strong app password>
JWT_SECRET_KEY=<the random string you copied>
CORS_ORIGINS=["http://<server-ip>"]
ADMIN_EMAIL=<your email>
ADMIN_PASSWORD=<admin password>
```

Save with `Ctrl+O` and `Enter`, then exit with `Ctrl+X`. Then protect the file:

```bash
chmod 600 .env
```

## 5. Build and start

```bash
docker compose up -d --build
```

The first build takes about 3–5 minutes.

## 6. Check that it is running

```bash
docker compose ps
```

`db` must show `healthy`, and `backend` and `frontend` must show `running`. Then follow the backend log:

```bash
docker compose logs -f backend
```

Wait for `Uvicorn running on http://0.0.0.0:8000`, then press `Ctrl+C` to stop following the log. Check the API:

```bash
curl http://localhost/health
```

The expected output is `{"status":"ok"}`.

## 7. Open the firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
```

Open `http://<server-ip>/` in a browser and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## Update to a new version

Commit and push from your PC (`git add .`, `git commit -m "..."`, `git push`). Then on the server:

```bash
cd /opt/mobilezone
git pull
docker compose up -d --build
docker image prune -f
```

The data is kept, and database migrations run automatically.

## Common commands (run from `/opt/mobilezone`)

```bash
docker compose ps                  # status
docker compose logs -f             # logs of all services
docker compose logs -f backend     # backend logs
docker compose restart backend     # restart the API
docker compose down                # stop (data is kept)
docker compose up -d               # start again
```

Open a MySQL console:

```bash
docker compose exec db sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" mobilezone'
```

Back up the database:

```bash
mkdir -p backups
docker compose exec -T db sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction mobilezone' | gzip > backups/mobilezone_$(date +%F).sql.gz
```

Restore a backup:

```bash
gunzip -c backups/mobilezone_YYYY-MM-DD.sql.gz | docker compose exec -T db sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" mobilezone'
```

Do **not** run `docker compose down -v`. It deletes the database volume and all data.

## If something fails

- **`port is already allocated`:** another web server is using port 80. Set `APP_PORT=8080` in `.env`, run `docker compose up -d`, and open `http://<server-ip>:8080`. Also run `sudo ufw allow 8080/tcp`.
- **`Access denied for user 'mobilezone'`:** the passwords in `.env` were changed after the first start. Put the original passwords back in `.env`. If the server has no data yet, you can instead run `docker compose down -v && docker compose up -d --build`.
- **`set ... in .env`:** the `.env` file is missing or a value is empty. Repeat step 4.
