The schedule is saved. The backup will now run every day at 2:30 AM Ecuador time (07:30 UTC) and upload to Google Drive.

What's left

1. Tomorrow after 2:30 AM, check that it ran by itself:
tail -n 10 /var/log/mobilezone-backup.log
sudo rclone ls gdrive:mobilezone-backups
   You should see a run at about 07:30 and new files named like ..._0730.... If the log file doesn't exist or shows an error, send it to me.
2. Check that your Google app is published. In Google Cloud Console, the OAuth consent screen / Audience page should say "In production". If it says "Testing", the Drive login expires in 7 days and uploads will stop.
3. Commit from your PC the executable flag for the scripts and the DOCKER.md updates:
git update-index --chmod=+x scripts/backup.sh scripts/restore.sh
git add DOCKER.md
git commit -m "Daily backup to Google Drive"
git push
   Don't commit UBUNTU_SERVER.md; it's only a copy of the server's output.
4. Keep a copy of .env somewhere safe, such as a password manager.

When you're ready, I can help with the healthchecks.io failure alert or a test restore.