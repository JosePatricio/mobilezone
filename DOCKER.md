# Run MobileZone with Docker on Ubuntu

Setup used: an Ubuntu server (Hetzner) that already runs nginx (ports 80/443), a Spring Boot app (8080) and another app (3000).
MobileZone runs in Docker on `127.0.0.1:8081`, and the existing nginx publishes it on port **8082**:
`http://<server-ip>:8082`.

## 1. Push the code to GitHub (Windows PC)

```powershell
cd C:\Development\Python\mobilezone
git init
git add .
git status
```

Confirm that no `.env`, `.venv`, `node_modules` or `dist` files are listed, then:

```powershell
git commit -m "first commit"
git branch -M main
git remote add origin git@github.com:JosePatricio/mobilezone.git
git push -u origin main
```

## 2. Install Docker (Ubuntu server, once)

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Check that both commands print a version:

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

## 4. Check the ports are free

```bash
sudo ss -tlnp | grep -E ':(8081|8082)\b'
```

Nothing should be printed.

- **8081** is the local port for MobileZone (Docker).
- **8082** is the public port (nginx).
- Do not use 80, 443, 3000 or 8080. The existing sites use them.

## 5. Create the `.env` file

```bash
cd /opt/mobilezone
cp .env.docker.example .env
```

Generate the values:

```bash
openssl rand -hex 16                             # run twice: MYSQL_ROOT_PASSWORD and DB_PASSWORD
openssl rand -base64 48 | tr -d '\n/+='; echo    # JWT_SECRET_KEY
```

Edit the file:

```bash
nano .env
```

```ini
APP_PORT=127.0.0.1:8081

MYSQL_ROOT_PASSWORD=<first openssl rand -hex 16>
DB_NAME=mobilezone
DB_USER=mobilezone
DB_PASSWORD=<second openssl rand -hex 16>

JWT_SECRET_KEY=<openssl rand -base64 48 output>
ACCESS_TOKEN_EXPIRE_MINUTES=60
BCRYPT_ROUNDS=12

CORS_ORIGINS=["http://<server-ip>:8082"]

ADMIN_EMAIL=<your email>
ADMIN_PASSWORD=<your login password>

UVICORN_WORKERS=2
TZ=UTC
```

Save with `Ctrl+O` and `Enter`, then exit with `Ctrl+X`.

```bash
chmod 600 .env
```

- Keep `127.0.0.1:` in `APP_PORT`, so the container is reachable only from nginx.
- Do not change the DB passwords after the first start. MySQL stores them on the first run.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` are your login for the app. The admin is created only on the first start.

## 6. Build and start

```bash
cd /opt/mobilezone
docker compose up -d --build
```

On start, the backend creates the tables (`alembic upgrade head` runs `db_scripts/02_create_tables.sql`) and the permissions, roles and admin user (`seed.py`). No SQL scripts need to be run by hand.

## 7. Check that it is running

```bash
docker compose ps
```

`db` must show `healthy`, and `backend` and `frontend` must show `Up`. The frontend must show `127.0.0.1:8081->80/tcp`.

```bash
docker compose logs backend | tail -5
curl http://127.0.0.1:8081/health
```

The log must end with `Uvicorn running on http://0.0.0.0:8000`, and `curl` must print `{"status":"ok"}`.

## 8. Publish it with the existing nginx on port 8082

```bash
sudo nano /etc/nginx/sites-available/mobilezone
```

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

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/mobilezone /etc/nginx/sites-enabled/
sudo nginx -t
```

The output must say `syntax is ok` and `test is successful`. Then reload nginx and test:

```bash
sudo systemctl reload nginx
sudo ss -tlnp | grep 8082
curl http://127.0.0.1:8082/health
```

The `ss` command must show `0.0.0.0:8082` with nginx, and `curl` must print `{"status":"ok"}`.

## 9. Open port 8082 in the firewalls

**ufw on Ubuntu:**

```bash
sudo ufw allow 8082/tcp
sudo ufw status
```

If the status is `inactive`, ufw is not blocking anything.

**Hetzner Cloud Firewall** (required, otherwise the site does not load from outside):

1. Go to https://console.hetzner.cloud and open your project.
2. Click the server, then the **Firewalls** tab, then the attached firewall.
3. Under **Inbound rules**, choose **Add rule**: Protocol **TCP**, Port **8082**, Source **Any IPv4** and **Any IPv6**.
4. Click **Save changes**.

## 10. Open the app

Open `http://<server-ip>:8082` in the browser and log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`. To see them:

```bash
grep ADMIN_ /opt/mobilezone/.env
```

---

## Deploy changes

Every change follows the same flow: change the code on the PC, push it, then pull and rebuild on the server. The database data is always kept.

**On the PC:**

```powershell
git add .
git commit -m "<message>"
git push
```

**On the server**, depending on what changed:

| What you changed | Server commands (from `/opt/mobilezone`) |
|---|---|
| Frontend only (`frontend/`) | `git pull` then `docker compose up -d --build frontend` |
| Backend only (`backend/`) | `git pull` then `docker compose up -d --build backend` |
| Both, or not sure | `git pull` then `docker compose up -d --build` |
| `.env` (on the server) | `nano .env` then `docker compose up -d` |

After a frontend change, reload the browser with `Ctrl+F5`.

Check the result:

```bash
docker compose ps
docker compose logs backend | tail -5
curl http://127.0.0.1:8082/health
```

Remove old images from time to time: `docker image prune -f`.

### Database changes (new table, new column, and so on)

Do not edit the tables by hand on the server. Add an Alembic migration, and the backend applies it automatically on start.

1. On the PC, create a migration file:

   ```powershell
   cd C:\Development\Python\mobilezone\backend
   .venv\Scripts\activate
   alembic revision -m "add column x to products"
   ```

2. Open the new file in `backend/migrations/versions/` and write the change in `upgrade()` and `downgrade()`, for example:

   ```python
   def upgrade() -> None:
       op.add_column("products", sa.Column("barcode", sa.String(50), nullable=True))

   def downgrade() -> None:
       op.drop_column("products", "barcode")
   ```

3. Apply the same change to `backend/db_scripts/02_create_tables.sql` and to `backend/app/infrastructure/database/tables.py` (the SQLAlchemy mapping), so new installs and the code match.
4. Test locally with `alembic upgrade head`, then push.
5. On the server:

   ```bash
   cd /opt/mobilezone
   git pull
   docker compose up -d --build backend
   docker compose exec backend alembic current
   ```

   `alembic current` must show the new revision as `(head)`.

Make a backup before a database change:

```bash
mkdir -p backups
docker compose exec -T db sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction mobilezone' | gzip > backups/mobilezone_$(date +%F_%H%M).sql.gz
```

### Seed data (permissions, roles)

If you add permissions or roles in `backend/app/domain/value_objects/permissions.py`, deploying the backend is enough. The seed runs on every start and adds only what is missing.

## Common commands (run from `/opt/mobilezone`)

```bash
docker compose ps                  # status
docker compose logs -f backend     # backend logs
docker compose restart backend     # restart the API
docker compose down                # stop (data is kept)
docker compose up -d               # start again
```

Show the database tables:

```bash
docker compose exec db sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" mobilezone -e "SHOW TABLES;"'
```

Do **not** run `docker compose down -v`. It deletes the database volume and all data.


cd /opt/mobilezone
git pull
docker compose up -d --build

