# Run MobileZone with Docker on Ubuntu

This setup runs next to an existing **nginx** (ports 80/443) and **Spring Boot** (port 8080) on the same server:

- MobileZone listens only on `127.0.0.1:8081`, so it is not reachable from the internet directly.
- The existing nginx forwards a domain (or a public port) to it.
- The backend (8000) and MySQL (3306) run inside Docker and are not published, so they don't clash with anything on the server.

## 1. Push the code to git (Windows PC)

```powershell
cd C:\Development\Python\mobilezone
git add .
git status
```

Confirm that no `.env`, `.venv`, `node_modules` or `dist` files are listed, then:

```powershell
git commit -m "Update"
git branch -M main
git remote add origin git@github.com:JosePatricio/mobilezone.git
git push -u origin main
```

Skip `git remote add` if you already added it.

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
git clone git@github.com:JosePatricio/mobilezone.git /opt/mobilezone
cd /opt/mobilezone
```

The `git@github.com:` URL needs an SSH key on the server that is added to GitHub (deploy key or account key).

## 4. Check the ports are free

```bash
sudo ss -tlnp | grep -E ':(8081|8082)\b'
```

If nothing is printed, both ports are free. If a port is taken, use another free port in the next steps (for example 8091 / 8092).

- **8081** is the local port for MobileZone.
- **8082** is the public port, used only with option B in step 8.
- Do **not** use 80, 443 or 8080. Your nginx and Spring Boot use them.

## 5. Create the `.env` file

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
APP_PORT=127.0.0.1:8081
MYSQL_ROOT_PASSWORD=<strong root password>
DB_PASSWORD=<strong app password>
JWT_SECRET_KEY=<the random string you copied>
CORS_ORIGINS=["http://mobilezone.yourdomain.com"]
ADMIN_EMAIL=<your email>
ADMIN_PASSWORD=<admin password>
```

- Keep the `127.0.0.1:` in `APP_PORT`. Ports published by Docker bypass `ufw`, and without it port 8081 would be open to the internet.
- `CORS_ORIGINS` is the address you will open in the browser. Use `["http://<server-ip>:8082"]` if you choose option B in step 8.

Save with `Ctrl+O` and `Enter`, then exit with `Ctrl+X`. Then protect the file:

```bash
chmod 600 .env
```

## 6. Build and start

```bash
docker compose up -d --build
```

The first build takes about 3–5 minutes.

## 7. Check that it is running

```bash
docker compose ps
```

`db` must show `healthy`, and `backend` and `frontend` must show `running`. Then follow the backend log:

```bash
docker compose logs -f backend
```

Wait for `Uvicorn running on http://0.0.0.0:8000`, then press `Ctrl+C` to stop following the log. Check the API:

```bash
curl http://127.0.0.1:8081/health
```

The expected output is `{"status":"ok"}`.

## 8. Connect your existing nginx

Create the site file:

```bash
sudo nano /etc/nginx/sites-available/mobilezone
```

Paste **one** of the two options.

### Option A: domain or subdomain (recommended)

First point `mobilezone.yourdomain.com` to the server IP in your DNS (an `A` record). Then paste:

```nginx
server {
    listen 80;
    server_name mobilezone.yourdomain.com;
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Option B: no domain, a separate public port

```nginx
server {
    listen 8082;
    server_name _;
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

With option B, open the port in the firewall:

```bash
sudo ufw allow 8082/tcp
```

Serving MobileZone under a path of your current site (like `yoursite.com/mobilezone`) will **not** work. The app must be at the root of its own domain or port.

### Enable the site

```bash
sudo ln -s /etc/nginx/sites-available/mobilezone /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` must print `syntax is ok` and `test is successful` before you reload. Your Spring Boot site keeps working as before.

### HTTPS (option A only)

If you already use certbot on this server:

```bash
sudo certbot --nginx -d mobilezone.yourdomain.com
```

Then change `.env` to use `CORS_ORIGINS=["https://mobilezone.yourdomain.com"]` and apply it:

```bash
docker compose up -d
```

## 9. Open the app

- Option A: `http://mobilezone.yourdomain.com` (or `https://` after certbot)
- Option B: `http://<server-ip>:8082`

Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## Update to a new version

Commit and push from your PC (`git add .`, `git commit -m "..."`, `git push`). Then on the server:

```bash
cd /opt/mobilezone
git pull
docker compose up -d --build
docker image prune -f
```

The data is kept, and database migrations run automatically. The nginx site does not need changes.

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

- **`port is already allocated` / `address already in use`:** port 8081 is taken. Pick a free port with `sudo ss -tlnp`, set `APP_PORT=127.0.0.1:<port>` in `.env`, update `proxy_pass` in `/etc/nginx/sites-available/mobilezone`, then run `docker compose up -d` and `sudo systemctl reload nginx`.
- **`502 Bad Gateway` from nginx:** the containers are not running, or `proxy_pass` points to the wrong port. Check `docker compose ps` and `curl http://127.0.0.1:8081/health`.
- **Browser shows your Spring Boot site instead of MobileZone:** `server_name` does not match the domain you opened, or the DNS record is missing. Run `sudo nginx -T | grep server_name` to see all configured names.
- **`nginx -t` fails with `duplicate listen` or a conflicting server name:** another site already uses that `server_name` or port. Choose another subdomain (option A) or port (option B).
- **Login fails with a network error:** `CORS_ORIGINS` in `.env` does not match the address in the browser. Fix it, then run `docker compose up -d`.
- **`Access denied for user 'mobilezone'`:** the passwords in `.env` were changed after the first start. Put the original passwords back in `.env`. If the server has no data yet, you can instead run `docker compose down -v && docker compose up -d --build`.
- **`set ... in .env`:** the `.env` file is missing or a value is empty. Repeat step 5.
